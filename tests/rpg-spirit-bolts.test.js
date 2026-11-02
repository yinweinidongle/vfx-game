import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GameState } from '../src/game/GameState.js';
import { ENCOUNTERS } from '../src/game/GameData.js';
import { GameProjectileTrails } from '../src/game/GameProjectileTrails.js';
import { GameSpiritBolts, isSpiritBolt } from '../src/game/GameSpiritBolts.js';

function arena(power=0){
  const state=new GameState('cultivator');state.player.x=-29;state.player.z=16;
  state.spawn(ENCOUNTERS[0]);state.enemies.splice(1);const enemy=state.enemies[0];enemy.x=-29;enemy.z=3;enemy.hp=enemy.maxHp=1e7;enemy.spawnGrace=0;
  state.started=new Set(ENCOUNTERS.map(e=>e.id));state.encounters.active.clear();state.updateEnemies=()=>{};state.save.boons.power=power;state.recalculate();state.stats.crit=0;state.events.length=0;
  const parent=new T.Group(),camera=new T.PerspectiveCamera();camera.position.set(-20,11,25);
  const trails=new GameProjectileTrails(parent,camera),fx=new GameSpiritBolts(parent,camera,state,trails);
  const events=[];
  const step=()=>{state.update(1/60,{dx:0,dz:0});for(const e of state.events.splice(0)){if(e.type==='projectile')trails.begin(e.projectile);fx.handle(e);events.push(e);}trails.update(1/60,state.time,state.projectiles);fx.update(1/60);};
  return {state,enemy,trails,fx,events,step};
}

test('spirit VFX follows the delayed real projectile, hits once, drains at contact and clears',()=>{
  const {state,enemy,trails,fx,events,step}=arena();
  state.attack(enemy.x,enemy.z);const b=state.projectiles.find(b=>b.alive);
  assert.equal(isSpiritBolt(b),true);
  for(let i=0;i<5;i++)step();assert.equal(fx.body.count,0);assert.equal(fx.flashes.count,0);
  for(let i=0;i<12;i++)step();assert.equal(fx.body.count,1);assert.equal(fx.glow.count,1);assert.ok(fx.fragments.count>0);assert.ok(trails.count[b.id]>2);
  const matrix=new T.Matrix4();fx.body.getMatrixAt(0,matrix);assert.ok(new T.Vector3().setFromMatrixPosition(matrix).distanceTo(new T.Vector3(b.x,b.y,b.z))<.00001);
  for(let i=0;i<100&&b.alive;i++)step();assert.equal(b.retiredReason,'hit');assert.equal(events.filter(e=>e.type==='hit'&&e.primary).length,1);assert.equal(1e7-enemy.hp,state.stats.damage);assert.ok(fx.flashes.count>0);assert.ok(fx.fragments.count>=9);
  for(let i=0;i<60;i++)step();assert.equal(fx.body.count,0);assert.equal(fx.flashes.count,0);assert.equal(fx.fragments.count,0);assert.equal(trails.count[b.id],0);
  fx.dispose();trails.dispose();
});

test('thin echoes, enemy spells and frost splinters retain their own head renderer',()=>{
  const {state,trails,fx}=arena();
  for(const b of [state.launch('spirit','enemy',0,0,0,1,{primary:true}),state.launch('spirit','player',0,0,0,1,{fervor:true,primary:true}),state.launch('spirit','player',0,0,0,1,{echo:true}),state.launch('arrow','player',0,0,0,1,{primary:true})])assert.equal(isSpiritBolt(b),false);
  fx.update(1/60);assert.equal(fx.body.count,0);fx.dispose();trails.dispose();
});

test('curved spirit wakes remain finite at reversed and head-on views, with a bounded physical footprint',()=>{
  for(const fps of [30,60,120]){
    const {state,trails,fx}=arena();const b=state.launch('spirit','player',0,0,0,1,{primary:true,color:'#92ccff',scale:.85});trails.begin(b);
    const buffers=[trails.history,trails.positions,fx.body.instanceMatrix.array,fx.fragments.geometry.attributes.aData.array];
    for(let i=1;i<=fps;i++){state.time=b.age=i/fps;b.x=Math.sin(b.age*2)*3;b.z=b.age*18;b.y=1.2;trails.camera.position.set(i%2?b.x:15,b.y,b.z+5);trails.update(1/fps,state.time,[b]);fx.update(1/fps);}
    let length=0;for(let j=0;j<64;j++){const a=new T.Vector3().fromArray(trails.positions,j*6),c=new T.Vector3().fromArray(trails.positions,j*6+3);assert.ok(a.distanceTo(c)<.36);if(j)length=Math.max(length,a.distanceTo(new T.Vector3().fromArray(trails.positions,0)));}
    assert.ok(length>2.8&&length<3.3);assert.ok(trails.positions.every(Number.isFinite));assert.ok(fx.body.instanceMatrix.array.every(Number.isFinite));
    assert.equal(buffers[0],trails.history);assert.equal(buffers[1],trails.positions);assert.equal(buffers[2],fx.body.instanceMatrix.array);assert.equal(buffers[3],fx.fragments.geometry.attributes.aData.array);
    fx.reset();assert.equal(fx.body.count,0);assert.equal(fx.fragments.count,0);fx.dispose();trails.dispose();
  }
});

test('sustained high-rank volleys reuse finite pools and defeat clears all dedicated effects',()=>{
  const {state,enemy,trails,fx,step}=arena(50);const matrix=fx.body.instanceMatrix.array,sparks=fx.sparks,impacts=fx.impacts;
  for(let i=0;i<420;i++){state.attack(enemy.x,enemy.z);step();assert.ok(fx.body.count<=96&&fx.fragments.count<=192&&fx.flashes.count<=24);}
  assert.equal(matrix,fx.body.instanceMatrix.array);assert.equal(sparks,fx.sparks);assert.equal(impacts,fx.impacts);assert.ok(matrix.every(Number.isFinite));
  state.dead=true;fx.update(1/60);assert.equal(fx.body.count,0);assert.equal(fx.fragments.count,0);assert.equal(fx.flashes.count,0);fx.dispose();trails.dispose();
});
