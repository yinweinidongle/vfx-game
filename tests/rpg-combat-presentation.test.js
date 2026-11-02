import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GameState } from '../src/game/GameState.js';
import { GameNavigation } from '../src/game/GameNavigation.js';
import { GameRouteGuide } from '../src/game/GameRouteGuide.js';
import { GameSkillCamera } from '../src/game/GameSkillCamera.js';
import { ENCOUNTERS, heightAt } from '../src/game/GameData.js';
import { HaloBolts } from '../src/vfx/cultivator/HaloBolts.js';

function arena(kind='ice') {
  const s=new GameState(kind);s.spawn(ENCOUNTERS[0]);s.started=new Set(ENCOUNTERS.map(e=>e.id));
  s.player.x=-28;s.player.z=22;
  s.enemies.forEach((e,i)=>Object.assign(e,{x:-28+i*4,z:8-i*3,homeX:-28+i*4,homeZ:8-i*3,hp:10000,maxHp:10000,speed:0,timer:10000}));
  return s;
}
function advance(s,seconds,step=()=>{}) { for(let i=0;i<Math.ceil(seconds*60);i++){s.update(1/60,{dx:0,dz:0});step(i);} }

test('remote sword energy locks an enemy behind the cursor and damages only after physical travel',()=>{
  const s=arena('sword'),e=s.enemies[0];assert.ok(s.attack(-28,50));
  assert.equal(s.lockedTarget,e);assert.equal(e.hp,e.maxHp);assert.equal(s.projectiles[0].kind,'slash');
  advance(s,.2);assert.equal(e.hp,e.maxHp);advance(s,.6);assert.ok(e.hp<e.maxHp);
});

test('curved arrows follow moving enemies and retarget a killed target without repeating hits',()=>{
  const s=arena(),e=s.enemies[0];s.attack(-28,8);const b=s.projectiles.find(b=>b.alive);advance(s,.16);
  assert.ok(Math.abs(b.x+28)>.15,'launch bends away from a straight line');
  e.hp=0;const next=s.enemies[1];advance(s,1.4,()=>{next.x+=.02;});
  assert.ok(next.hp<next.maxHp);assert.equal(s.events.filter(e=>e.type==='hit').length,1);assert.equal(b.alive,false);
});

test('swept collision catches a target even when a fast projectile crosses it in one step',()=>{
  const s=arena();s.enemies[1].hp=0;const e=s.enemies[0];e.z=12;
  s.launch('arrow','player',-28,20,Math.PI,25,{speed:1000,homing:false,pierce:false});
  s.updateProjectiles(1/60);assert.ok(e.hp<e.maxHp);assert.equal(s.projectiles[0].z,e.z);
});

test('Q E R keep energy and cooldowns when no valid enemy is in range',()=>{
  const s=new GameState();for(let i=0;i<3;i++){assert.equal(s.cast(i,1,1),false);assert.equal(s.player.cooldowns[i],0);assert.equal(s.player.energy,100);}
});

test('gear and permanent power increase color, radiance, simultaneous trajectories and halo count',()=>{
  const s=arena();const base={...s.growth};s.save.boons.power=2;s.recalculate();assert.equal(s.growth.shots,2);assert.notEqual(s.growth.color,base.color);assert.ok(s.growth.radiance>base.radiance);
  s.attack(-28,8);const shots=s.projectiles.filter(b=>b.alive);assert.equal(shots.length,2);assert.equal(shots[0].delay,shots[1].delay);assert.notEqual(shots[0].yaw,shots[1].yaw);
  s.save.boons.power=8;s.recalculate();assert.equal(s.growth.shots,4);assert.equal(s.growth.haloCount,96);assert.equal(s.projectiles.length,96);
});

test('maximum halo volleys damage actual targets once each and share the showcase renderer and fixed buffers',()=>{
  const s=arena('cultivator');s.save.boons.power=8;s.recalculate();
  const camera=new T.PerspectiveCamera();camera.position.set(-10,12,30);
  const renderer=new HaloBolts(new T.Group(),camera,{},s.haloVolley.bolts.length);renderer.events=s.haloVolley.bolts;
  const pool=s.haloVolley.bolts,history=pool[0].history,positions=renderer.positions,source=[];let maxHeads=0,maxShards=0;
  assert.ok(s.cast(2,-28,8));advance(s,5,i=>{
    renderer.update(s.time);maxHeads=Math.max(maxHeads,renderer.heads.count);maxShards=Math.max(maxShards,renderer.shards.count);
    if(i%10===0)assert.ok(renderer.positions.every(Number.isFinite));
  });
  assert.equal(pool.filter(b=>b.started).length,96);assert.equal(s.events.filter(e=>e.type==='hit'&&e.element==='halo').length,96);
  assert.ok(maxHeads>20);assert.ok(maxShards>0);assert.equal(renderer.heads.count,0);assert.equal(renderer.shards.count,0);assert.equal(renderer.geometry.drawRange.count,0);
  for(const b of pool.filter(b=>b.started)){source.push([b.start.x,b.start.y,b.start.z]);assert.ok(b.start.y>heightAt(b.start.x,b.start.z));}
  assert.ok(Math.max(...source.map(p=>p[0]))-Math.min(...source.map(p=>p[0]))>5);
  s.revive();assert.equal(pool.some(b=>b.started),false);assert.equal(s.haloVolley.bolts,pool);assert.equal(pool[0].history,history);assert.equal(renderer.positions,positions);renderer.dispose();
});

test('halo retargets a defeated enemy while keeping the actual history and hit position coherent',()=>{
  const s=arena('cultivator');s.cast(2,-28,8);advance(s,.75);const b=s.haloVolley.bolts.find(b=>b.alive);assert.ok(b);const victim=b.target;victim.hp=0;
  advance(s,2);assert.notEqual(b.target,victim);assert.equal(b.alive,false);assert.equal(b.impact,true);assert.ok(Math.hypot(b.x-b.end.x,b.z-b.end.z)<.001);assert.equal(b.history[0],Math.fround(b.end.x));
});

test('skill shots remain above ground, extend for distant hits, cancel and return control',()=>{
  const s=arena(),g={state:s,settings:{},camera:new T.PerspectiveCamera(44)};s.cast(0,-28,8);const director=new GameSkillCamera(g),eye=new T.Vector3(),target=new T.Vector3();
  director.begin(0);assert.ok(director.duration>1.22);assert.ok(director.timeScale<1);
  for(let i=0;i<40;i++){eye.set(-20,18,35);target.set(-28,1,22);director.update(1/60,eye,target);assert.ok([...eye,...target,g.camera.fov].every(Number.isFinite));assert.ok(eye.y>heightAt(eye.x,eye.z));}
  director.cancel();assert.equal(director.timeScale,1);director.update(.3,eye,target);assert.equal(director.label,'');
  g.settings.skillCamera=false;director.begin(2);assert.ok(director.age>=director.duration);
});

test('route guidance follows a traversable path around obstacles and reuses its GPU buffers',()=>{
  const s=arena();s.obstacles.push({x:-27,z:16,r:2});const nav=new GameNavigation(s),guide=new GameRouteGuide(new T.Scene(),s,nav),positions=guide.positions;
  guide.update(0);assert.ok(guide.path.length>1);assert.ok(guide.distance>30);assert.ok(guide.geometry.drawRange.count>0);
  for(let i=1;i<guide.path.length;i++){const a=guide.path[i-1],b=guide.path[i];assert.ok(nav.clearLine(a.x,a.z,b.x,b.z));}
  s.player.x-=3;guide.update(1);assert.equal(guide.positions,positions);assert.ok(guide.positions.every(Number.isFinite));guide.dispose();
});
