import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GameState, readSave } from '../src/game/GameState.js';
import { ENCOUNTERS } from '../src/game/GameData.js';
import { attackGrowth, MAX_FERVOR } from '../src/game/AttackGrowth.js';
import { fervorSource } from '../src/game/GameFervorVolley.js';
import { GameFervorVFX, fervorGeometry } from '../src/game/GameFervorVFX.js';
import { GameProjectileTrails } from '../src/game/GameProjectileTrails.js';

function arena(power,kind='ice'){
  const s=new GameState(kind);s.player.x=-29;s.player.z=16;s.player.yaw=Math.PI;
  s.spawn(ENCOUNTERS[0]);s.enemies.splice(1);const e=s.enemies[0];e.x=-29;e.z=7;e.hp=e.maxHp=1e7;e.spawnGrace=0;
  s.started=new Set(ENCOUNTERS.map(e=>e.id));s.encounters.active.clear();s.updateEnemies=()=>{};
  s.save.boons.power=power;s.recalculate();s.stats.crit=0;s.events.length=0;return s;
}
function tick(s,seconds,record=[]){
  for(let i=0;i<Math.ceil(seconds*60);i++){
    s.update(1/60,{dx:0,dz:0});
    for(const e of s.events.splice(0))record.push(e.type==='projectile'?{type:e.type,time:s.time,p:{...e.projectile}}:e);
  }return record;
}

test('all fifty fervor stacks change visible unit count and real damage even after main volley caps',()=>{
  let previous=0;
  for(let n=1;n<=MAX_FERVOR;n++){
    const s=arena(n),e=s.enemies[0];s.fervorVolley.request(e);const events=tick(s,3.2);
    const launches=events.filter(e=>e.type==='projectile'&&e.p.fervor),hits=events.filter(e=>e.type==='hit');
    assert.equal(s.growth.echoes,n);assert.equal(launches.length,n);assert.equal(hits.length,n);
    assert.ok(1e7-e.hp>previous,`stack ${n} increases damage`);previous=1e7-e.hp;
    assert.equal(s.fervorVolley.active,false);
    assert.equal(launches.filter(e=>e.p.finisher).length,n>=5?1:0);
    if(n>=8)assert.equal(s.growth.tier,3);
  }
});

test('8 → 9 and 20 → 21 emit upgrade feedback without requiring a new main-attack tier',()=>{
  for(const n of [8,20,49]){
    const s=arena(n);s.save.gold=100000;const oldDamage=s.stats.damage,tier=s.growth.tier;
    assert.equal(s.upgrade(),true);assert.equal(s.growth.stacks,n+1);assert.equal(s.growth.tier,tier);
    assert.ok(s.stats.damage>oldDamage);assert.ok(s.events.some(e=>e.type==='fervorUpgrade'&&e.from===n&&e.stacks===n+1));
    const restored=readSave({getItem:()=>JSON.stringify(s.save)});assert.equal(new GameState('ice',restored).growth.echoes,n+1);
  }
  const s=arena(50);s.save.gold=10000;s.pendingBoons=1;assert.equal(s.upgrade(),false);s.chooseBoon('power');assert.equal(s.pendingBoons,1);assert.equal(s.save.gold,10000);
  assert.equal(attackGrowth('ice',200,25,2.9).stacks,2);
});

test('each class requests real echoes from normal attacks and all three skills',()=>{
  for(const kind of ['ice','sword','cultivator'])for(const skill of [-1,0,1,2]){
    const s=arena(9,kind),e=s.enemies[0];
    assert.equal(skill<0?s.attack(e.x,e.z):s.cast(skill,e.x,e.z),true);
    const main=s.projectiles.filter(p=>p.alive);assert.equal(main.length,skill===2?0:4);
    const launches=tick(s,2.5).filter(e=>e.type==='projectile'&&e.p.fervor);
    assert.equal(launches.length,9);assert.ok(launches.every(e=>e.p.aspect===kind));
  }
});

test('launches match visible shoulder sockets and preserve world space while the player moves',()=>{
  const s=arena(21),e=s.enemies[0];s.fervorVolley.request(e);let count=0;const socket={};
  for(let frame=0;frame<100;frame++){
    s.player.x+=.01;s.player.yaw+=.007;s.update(1/60,{dx:0,dz:0});
    for(const event of s.events.splice(0))if(event.type==='projectile'&&event.projectile.fervor){
      const p=event.projectile;fervorSource(p.sourceIndex,s.time,s.player,socket);
      assert.ok(Math.hypot(p.x-socket.x,p.y-socket.y,p.z-socket.z)<1e-8);count++;
    }
  }assert.equal(count,21);
});

test('the fifth-stack finisher deals a bounded extra blast, including neighbouring enemies',()=>{
  const s=arena(10),e=s.enemies[0],other={...e,id:100,x:e.x+1,z:e.z};s.enemies.push(other);
  s.fervorVolley.request(e);const hits=tick(s,3).filter(e=>e.type==='hit');
  const finishes=hits.filter(e=>e.finisher&&!e.fervorSplash),splashes=hits.filter(e=>e.fervorSplash);
  assert.equal(finishes.length,1);assert.equal(splashes.length,1);assert.ok(splashes[0].damage>0);
  assert.ok(finishes[0].damage>hits.find(e=>!e.finisher).damage);assert.ok(other.hp<1e7);
});

test('dead targets retarget, absence of enemies cancels remaining launches, revive clears the queue',()=>{
  const s=arena(20),e=s.enemies[0],other={...e,id:101,x:e.x+3};s.enemies.push(other);
  s.fervorVolley.request(e);tick(s,.2);e.hp=0;const later=tick(s,.3).filter(e=>e.type==='projectile'&&e.p.fervor);
  assert.ok(later.length>0&&later.every(e=>e.p.target===other));other.hp=0;
  assert.equal(tick(s,2).filter(e=>e.type==='projectile').length,0);assert.equal(s.fervorVolley.active,false);
  other.hp=1e7;s.fervorVolley.request(other);s.revive();assert.equal(s.fervorVolley.active,false);assert.ok(s.projectiles.every(p=>!p.alive));
});

test('sustained fifty-stack barrages coalesce and leave player cast slots under enemy saturation',()=>{
  const s=arena(50),e=s.enemies[0];const pool=s.projectiles;
  for(let i=0;i<100;i++)s.launch('enemy','enemy',-10,22,0,1,{life:100,speed:0});
  assert.equal(pool.filter(p=>p.alive).length,64);
  let peak=0,emitted=0;
  for(let i=0;i<300;i++){
    s.fervorVolley.request(e);s.update(1/60,{dx:0,dz:0});
    const batch=s.events.splice(0).filter(e=>e.type==='projectile'&&e.projectile.fervor);assert.ok(batch.length<=4);emitted+=batch.length;
    peak=Math.max(peak,pool.filter(p=>p.alive).length);assert.equal(s.projectiles,pool);
  }
  assert.ok(emitted>50&&emitted<170);assert.ok(peak<=96);
  assert.equal(s.cast(0,e.x,e.z),true);assert.equal(pool.filter(p=>p.alive&&p.kind==='frost').length,4);
  s.enemies.length=0;tick(s,3);assert.equal(s.fervorVolley.active,false);
});

test('three faceted needle variants and fixed GPU buffers support all fifty formation units',()=>{
  const signatures=[];
  for(const kind of ['ice','sword','cultivator']){
    const geometry=fervorGeometry(kind);geometry.computeBoundingBox();assert.ok(geometry.boundingBox.max.z-geometry.boundingBox.min.z>.02);assert.ok((geometry.boundingBox.max.y-geometry.boundingBox.min.y)/(geometry.boundingBox.max.x-geometry.boundingBox.min.x)>25);
    signatures.push(JSON.stringify(Array.from(geometry.attributes.position.array)));geometry.dispose();
    const s=arena(50,kind),parent=new T.Group(),camera=new T.PerspectiveCamera();camera.position.set(-20,8,25);
    const trails=new GameProjectileTrails(parent,camera),vfx=new GameFervorVFX(parent,s,trails),matrix=vfx.formation.instanceMatrix.array,colors=vfx.formation.geometry.attributes.aTint.array;
    vfx.update(0);assert.equal(vfx.formation.count,50);
    const socket={};for(let i=0;i<50;i++){fervorSource(i,s.time,s.player,socket);assert.ok(Math.abs(matrix[i*16+12]-socket.x)<1e-5);assert.ok(Math.abs(matrix[i*16+13]-socket.y)<1e-5);}
    for(let i=0;i<90;i++){s.time+=1/60;vfx.update(1/60);}
    assert.equal(vfx.formation.instanceMatrix.array,matrix);assert.equal(vfx.formation.geometry.attributes.aTint.array,colors);assert.ok(matrix.every(Number.isFinite));
    s.dead=true;vfx.update(0);assert.equal(vfx.formation.count,0);vfx.dispose();trails.dispose();assert.equal(parent.children.length,0);
  }
  assert.equal(new Set(signatures).size,3);
});
