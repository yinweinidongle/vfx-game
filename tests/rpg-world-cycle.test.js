import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GameState,readSave } from '../src/game/GameState.js';
import { ENCOUNTERS } from '../src/game/GameData.js';
import { DAY_DURATION,sampleWorldCycle } from '../src/game/WorldCycle.js';
import { swordEvolution } from '../src/game/SwordEvolution.js';
import { vitalityGrowth,SHIELD_STAGES } from '../src/game/CultivationGrowth.js';
import { GameShieldVFX } from '../src/game/GameShieldVFX.js';
import { NightEyes } from '../src/game/NightEyes.js';
import { SwordTrail } from '../src/vfx/sword/SwordTrail.js';
import { WorldLighting } from '../src/game/WorldLighting.js';

const idle={dx:0,dz:0};
const cycleAt=(s,seconds)=>{s.save.playTime=seconds;sampleWorldCycle(seconds,s.cycle);};
function enemyAt(s,type='melee'){
  const p=s.player;
  return {id:0,hp:1e6,maxHp:1e6,x:p.x,z:p.z+1,homeX:p.x,homeZ:p.z+1,range:2,damage:20,speed:2,windup:.8,cooldown:1.5,timer:.001,phase:0,sequence:0,flash:0,frozen:0,stagger:0,spawnGrace:0,scale:1,deathAge:0,state:'windup',type,targetX:p.x,targetZ:p.z};
}
function arena(){const s=new GameState('sword');s.started=new Set(ENCOUNTERS.map(e=>e.id));s.enemies=[enemyAt(s)];return s;}

test('world cycle is continuous, repeats and resumes the same phase from saved play time',()=>{
  assert.equal(sampleWorldCycle(0).hour,8);assert.equal(sampleWorldCycle(60).hour,12);
  assert.equal(sampleWorldCycle(240).night,1);assert.ok(sampleWorldCycle(240).enraged);
  const before=sampleWorldCycle(DAY_DURATION-1e-4),after=sampleWorldCycle(DAY_DURATION+1e-4);assert.ok(Math.abs(before.hour-after.hour)<1e-3);
  for(let t=0;t<360;t+=.5){const a=sampleWorldCycle(t),b=sampleWorldCycle(t+1/60);assert.ok(Math.abs(a.night-b.night)<.003);assert.ok(a.speed<=1.22&&a.damage<=1.3);}
  const s=arena();cycleAt(s,235);const loaded=new GameState('sword',readSave({getItem:()=>JSON.stringify(s.save)}));assert.deepEqual(loaded.cycle,s.cycle);
  cycleAt(s,149.99);s.update(.03,idle);assert.equal(s.events.filter(e=>e.type==='dayNight').length,0);
  let switches=0;for(let i=0;i<360*30;i++){s.enemies=[];s.update(1/30,idle);switches+=s.events.splice(0).filter(e=>e.type==='dayNight').length;}assert.equal(switches,2);
});

test('night actually increases melee damage and recovery speed, without stacking stats or shortening windup',()=>{
  const s=arena(),e=s.enemies[0],hp=s.player.hp;
  s.updateEnemies(.01);assert.equal(s.player.hp,hp-20);assert.equal(e.timer,1.5);
  s.player.hp=hp;s.player.invulnerable=0;e.state='windup';e.timer=.001;cycleAt(s,240);
  s.updateEnemies(.01);assert.equal(s.player.hp,hp-26);assert.ok(e.timer<1.18);assert.equal(e.damage,20);assert.equal(e.cooldown,1.5);assert.equal(e.windup,.8);
  e.state='chase';e.timer=0;s.updateEnemies(.01);assert.equal(e.timer,.8,'attack warning remains fully readable');
  cycleAt(s,360);e.state='windup';e.timer=.001;s.player.invulnerable=0;s.player.hp=hp;s.updateEnemies(.01);assert.equal(s.player.hp,hp-20);assert.equal(e.timer,1.5);
});

test('night accelerates real pursuit and empowers ranged / elite attacks at cast time',()=>{
  const s=arena(),e=s.enemies[0];e.z=s.player.z+8;e.homeZ=e.z;e.state='chase';e.timer=1;
  const z=e.z;s.updateEnemies(.1);const dayMove=z-e.z;e.z=z;cycleAt(s,240);s.updateEnemies(.1);assert.ok(Math.abs((z-e.z)/dayMove-1.22)<1e-6);
  e.type='ranger';e.state='windup';e.timer=.001;e.range=12;s.updateEnemies(.01);const projectile=s.projectiles.find(b=>b.alive);assert.equal(projectile.damage,26);
  cycleAt(s,360);assert.equal(projectile.damage,26,'already launched attack keeps its damage');
  cycleAt(s,240);e.elite=true;e.ability='storm';s.eliteAttack(e);assert.ok(s.zones.filter(z=>z.alive).every(z=>z.damage===26));
});

test('eye instances follow real bones, use finite transforms and disappear by day or on death',()=>{
  const scene=new T.Scene(),eyes=new NightEyes(scene),group=new T.Group(),head=new T.Bone(),left=new T.Bone(),right=new T.Bone();scene.add(group);group.add(head);head.add(left,right);left.position.x=-.04;right.position.x=.04;
  const enemy={hp:10,spawnGrace:0},view={group,eyes:[left,right],sourceScale:1,enemy},views=new Map([[0,view]]),buffer=eyes.mesh.instanceMatrix.array;
  eyes.update(views,1,0);assert.equal(eyes.mesh.count,0);eyes.update(views,1,1);assert.equal(eyes.mesh.count,2);const x=buffer[12];group.position.x=3;head.rotation.y=.4;eyes.update(views,2,1);assert.ok(buffer[12]>x+2.9);assert.ok(buffer.every(Number.isFinite));assert.equal(eyes.mesh.instanceMatrix.array,buffer);
  enemy.hp=0;eyes.update(views,3,1);assert.equal(eyes.mesh.count,0);eyes.dispose();assert.equal(scene.children.includes(eyes.mesh),false);
});

test('sunset and night share lighting state while cinematic framing retains a readable floor',()=>{
  const scene=new T.Scene();scene.background=new T.Color();scene.fog=new T.FogExp2();
  const game={scene,state:{player:{x:1,z:2}},sun:new T.DirectionalLight(),sky:new T.HemisphereLight(),rim:new T.DirectionalLight(),renderer:{},actors:{night:{value:0}},world:{night:{value:0}}};
  const lighting=new WorldLighting(game);lighting.update(sampleWorldCycle(0),0);const day=game.sun.intensity;
  lighting.update(sampleWorldCycle(240),1);assert.ok(game.sun.intensity<day&&game.sun.intensity>.3);assert.ok(game.sky.intensity>.4);assert.equal(game.actors.night.value,1);assert.equal(game.world.night.value,1);assert.ok(lighting.lamps.every(l=>l.intensity>0));
  lighting.dispose();assert.ok(lighting.lamps.every(l=>l.parent===null));
});

test('every permanent sword layer changes pigmentation, strength and the unified trail past the old tier cap',()=>{
  let last=swordEvolution(0);for(let n=1;n<=50;n++){const v=swordEvolution(n);assert.notEqual(v.color,last.color);assert.ok(v.glow>last.glow&&v.trail>last.trail&&v.flow>last.flow);last=v;}
  const s=arena();s.save.boons.power=20;s.recalculate();s.attack(s.enemies[0].x,s.enemies[0].z);const b=s.projectiles.find(b=>b.alive);assert.equal(b.fervorLevel,20);assert.equal(b.swordStyle.level,20);const color=b.color;s.save.boons.power=35;s.recalculate();assert.equal(b.color,color);s.player.attackCooldown=0;s.attack(s.enemies[0].x,s.enemies[0].z);const newer=s.projectiles.find(p=>p.alive&&p.swordStyle.level===35);assert.ok(newer);assert.notEqual(newer.color,color);
});

test('evolved wakes keep one connected historical mesh and reuse all buffers through hits',()=>{
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(),style=swordEvolution(50),config={bladeSize:.62,trailLength:1.85*style.trail,energyColor:style.color,lightningColor:style.edge,gameStyle:true,fervorStrength:style.strength};
  const trail=new SwordTrail(scene,config),positions=trail.positions;
  for(let i=0;i<30;i++)trail.update(1/60,i/60,new T.Vector3(i*.2,1,Math.sin(i*.07)*.4),true,camera,config);
  assert.equal(trail.layers.length,1);assert.ok(trail.sampleCount>10);assert.equal(trail.material.uniforms.uFervor.value,1);assert.ok(positions.every(Number.isFinite));
  trail.impact(new T.Vector3(6,1,1),.5);for(let i=0;i<30;i++)trail.update(1/60,.5+i/60,new T.Vector3(6,1,1),false,camera,config);assert.equal(trail.positions,positions);assert.equal(trail.geometry.drawRange.count,0);trail.dispose();
});

test('shield has the requested six colour milestones and distinct continuous per-level hues',()=>{
  for(const [level,color,name]of SHIELD_STAGES){const v=vitalityGrowth(level);assert.equal(v.color,color);assert.equal(v.name,name);}
  let previous=vitalityGrowth(1);for(let n=2;n<=50;n++){const v=vitalityGrowth(n);assert.notEqual(v.color,previous.color);assert.ok(v.presence>previous.presence);assert.ok(v.capacity>previous.capacity);previous=v;}
  const s=arena(),scene=new T.Scene(),shield=new GameShieldVFX(scene,s);s.save.boons.vitality=50;s.recalculate();shield.update(0);assert.equal(shield.uniforms.uTint.value.getHexString(),'a60728');assert.equal(shield.uniforms.uLevel.value,1);assert.ok(shield.mesh.visible);s.player.shield=0;shield.handle({type:'shieldHit',broken:true,nx:1,nz:0});shield.update(.6);assert.equal(shield.mesh.visible,false);shield.dispose();
});
