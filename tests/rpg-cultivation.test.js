import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GameState, readSave } from '../src/game/GameState.js';
import { ENCOUNTERS, SKILLS } from '../src/game/GameData.js';
import { spiritGrowth, vitalityGrowth } from '../src/game/CultivationGrowth.js';
import { GameShieldVFX } from '../src/game/GameShieldVFX.js';
import { GameSkillResonance } from '../src/game/GameSkillResonance.js';
import { GameProjectileTrails } from '../src/game/GameProjectileTrails.js';
import { HaloBolts } from '../src/vfx/cultivator/HaloBolts.js';

const idle={dx:0,dz:0};
const tick=(s,seconds,after=()=>{})=>{for(let i=0;i<Math.ceil(seconds*60);i++){s.update(1/60,idle);after();}};
function fixture(v=0,m=0){const s=new GameState('ice');s.started=new Set(ENCOUNTERS.map(e=>e.id));s.save.boons.vitality=v;s.save.boons.spirit=m;s.recalculate();return s;}
function arena(m=0){const s=fixture(0,m);s.started.delete('path');s.spawn(ENCOUNTERS[0]);s.encounters.active.clear();s.updateEnemies=()=>{};s.player.x=-29;s.player.z=19;for(const e of s.enemies){e.hp=e.maxHp=1e8;}s.events.length=0;s.stats.crit=0;return s;}

test('long-life barrier absorbs real incoming damage, breaks, and transfers only overflow to health',()=>{
  const s=fixture(1),p=s.player,hp=p.hp;assert.equal(p.shield,38);
  s.hurt(20,{x:p.x+1,z:p.z});assert.equal(p.shield,18);assert.equal(p.hp,hp);assert.equal(p.hurtFlash,0);
  const hit=s.events.find(e=>e.type==='shieldHit');assert.equal(hit.absorbed,20);assert.equal(hit.nx,1);assert.equal(hit.broken,false);
  s.hurt(20);assert.equal(p.shield,18,'existing invulnerability window prevents repeated same-frame damage');
  tick(s,.5);s.hurt(30);assert.equal(p.shield,0);assert.equal(p.hp,hp-12);assert.ok(p.hurtFlash>0);
  assert.ok(s.events.some(e=>e.type==='shieldHit'&&e.broken));assert.ok(s.events.some(e=>e.type==='hurt'&&e.damage===12));
});

test('barrier recovery waits six damage-free seconds and is reset by another strike',()=>{
  const s=fixture(5),p=s.player;s.hurt(50);const partial=p.shield;tick(s,5.5);assert.equal(p.shield,partial);
  s.hurt(10);tick(s,5.9);assert.equal(p.shield,partial-10);tick(s,1.1);assert.ok(Math.abs(p.shield-(partial-10+s.vitality.regen))<1e-5);
  tick(s,10);assert.equal(p.shield,s.vitality.capacity);
});

test('every vitality level increases real capacity and visible shell strength, without equipment refill exploits',()=>{
  let capacity=0,presence=0;
  for(let n=1;n<=50;n++){const v=vitalityGrowth(n);assert.ok(v.capacity>capacity&&v.presence>presence);capacity=v.capacity;presence=v.presence;}
  const s=fixture(10);s.hurt(70);const shield=s.player.shield;s.recalculate();s.grantItem('jade');s.equip('jade');assert.equal(s.player.shield,shield);
  s.pendingBoons=1;s.chooseBoon('vitality');assert.equal(s.player.shield,s.vitality.capacity);
  const restored=new GameState('ice',readSave({getItem:()=>JSON.stringify(s.save)}));assert.equal(restored.player.shield,restored.vitality.capacity);
  s.player.invulnerable=0;s.hurt(s.stats.hp+s.vitality.capacity+1);assert.ok(s.dead);s.revive();assert.equal(s.player.shield,s.vitality.capacity);
});

test('higher spell costs are paid once; regeneration pauses after casting and resumes at a slower baseline',()=>{
  assert.deepEqual(SKILLS.slice(0,3).map(s=>s.cost),[34,46,82]);
  const s=arena(),e=s.enemies[0];assert.equal(s.cast(2,e.x,e.z),true);assert.equal(s.player.energy,18);
  assert.equal(s.cast(0,e.x,e.z),false);assert.equal(s.player.cooldowns[0],0);
  tick(s,1.4);assert.ok(Math.abs(s.player.energy-18)<1e-6);
  tick(s,1);assert.ok(Math.abs(s.player.energy-20.2)<1e-6,'spell and halo hits cannot refill mana');
});

test('fervor, satellite, area and halo hits do not print mana; normal primary hits have a one-point cooldown',()=>{
  const s=arena(50),e=s.enemies[0];s.player.energy=0;
  for(let i=0;i<100;i++)for(const style of [{fervor:true},{echo:true},{primary:true,echo:true},{}])s.hit(e,1,'spirit',style);
  assert.equal(s.player.energy,0);
  for(let i=0;i<30;i++)s.hit(e,1,'arrow',{primary:true});assert.equal(s.player.energy,1);
  s.time+=.46;s.hit(e,1,'arrow',{primary:true});assert.equal(s.player.energy,2);
});

test('spirit growth raises capacity and spell power continuously; normal attack and in-flight spell snapshots stay independent',()=>{
  let mana=100,power=1;
  for(let n=1;n<=50;n++){const m=spiritGrowth(n);assert.ok(m.energyMax>mana&&m.damage>power);mana=m.energyMax;power=m.damage;}
  const s=arena(10),e=s.enemies[0];s.attack(e.x,e.z);const normal=s.projectiles.find(p=>p.alive);assert.equal(normal.spiritLevel,0);
  s.cast(0,e.x,e.z);const b=s.projectiles.find(p=>p.alive&&p.kind==='frost'),damage=b.damage,color=b.color;
  assert.equal(b.spiritLevel,10);assert.ok(damage>s.stats.damage*2.3);s.save.boons.spirit=50;s.recalculate();assert.equal(b.spiritLevel,10);assert.equal(b.damage,damage);assert.equal(b.color,color);
  s.revive();assert.equal(s.player.energy,250);assert.ok(s.stats.regen<7);
});

test('shield renderer follows charge, hit direction, break fade and restoration with fixed resources',()=>{
  const s=fixture(10),parent=new T.Group(),fx=new GameShieldVFX(parent,s),geometry=fx.mesh.geometry,material=fx.material;
  fx.update(0);assert.equal(fx.mesh.visible,true);s.hurt(40,{x:s.player.x+1,z:s.player.z});fx.handle(s.events.find(e=>e.type==='shieldHit'));fx.update(.1);
  assert.ok(fx.uniforms.uCharge.value<1);assert.ok(fx.uniforms.uHit.value.x>.9);
  s.player.invulnerable=0;s.hurt(1e4);fx.handle(s.events.filter(e=>e.type==='shieldHit').at(-1));s.dead=false;fx.update(.1);assert.equal(fx.mesh.visible,true);fx.update(.6);assert.equal(fx.mesh.visible,false);
  s.revive();fx.handle({type:'revive'});fx.update(0);assert.equal(fx.mesh.visible,true);assert.equal(fx.mesh.geometry,geometry);assert.equal(fx.material,material);fx.dispose();assert.equal(parent.children.length,0);
});

test('spell rune arcs scale in count with spirit level and reuse buffers without attaching to normal attacks',()=>{
  const counts=[];
  for(const level of [1,10,35,50]){
    const s=arena(level),parent=new T.Group(),camera=new T.PerspectiveCamera(),trails=new GameProjectileTrails(parent,camera),fx=new GameSkillResonance(parent,s,trails),e=s.enemies[0];
    s.cast(0,e.x,e.z);for(const ev of s.events)if(ev.type==='projectile')trails.begin(ev.projectile);
    s.updateProjectiles(.2);trails.update(.2,.2,s.projectiles);fx.update(0);counts.push(fx.mesh.count);const buffer=fx.mesh.instanceMatrix.array;
    for(let i=0;i<20;i++)fx.update(1/60);assert.equal(fx.mesh.instanceMatrix.array,buffer);assert.ok(buffer.every(Number.isFinite));fx.dispose();trails.dispose();
  }
  assert.deepEqual(counts,[1,2,4,4]);
});

test('high-spirit divine volleys add actual homing damage and stay inside the expanded fixed GPU pool',()=>{
  const s=arena(50);s.save.boons.power=8;s.recalculate();const camera=new T.PerspectiveCamera();camera.position.set(-10,12,30);
  const fx=new HaloBolts(new T.Group(),camera,{},s.haloVolley.bolts.length);fx.events=s.haloVolley.bolts;
  const pool=s.haloVolley.bolts,positions=fx.positions;assert.equal(pool.length,160);s.cast(2,s.enemies[0].x,s.enemies[0].z);
  tick(s,5,()=>fx.update(s.time));assert.equal(pool.filter(b=>b.started).length,146);assert.equal(s.events.filter(e=>e.type==='hit'&&e.element==='halo').length,146);
  assert.equal(fx.positions,positions);assert.ok(positions.every(Number.isFinite));assert.equal(fx.heads.count,0);fx.dispose();
});
