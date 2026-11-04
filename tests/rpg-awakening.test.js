import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GameState,readSave } from '../src/game/GameState.js';
import { SKILLS,ENCOUNTERS,isLand,heightAt } from '../src/game/GameData.js';
import { GameThunderVFX } from '../src/game/GameThunderVFX.js';
import { GameSkillCamera } from '../src/game/GameSkillCamera.js';
import { AWAKENING_STYLES } from '../src/game/AwakeningConfig.js';
import { GameUI } from '../src/game/GameUI.js';

function arena(kind='sword',level=30,count=3){
  const s=new GameState(kind);s.save.level=level;s.recalculate();s.stats.crit=0;s.started=new Set(ENCOUNTERS.map(e=>e.id));
  s.enemies=Array.from({length:count},(_,id)=>({id,type:'melee',name:'测试残魂',x:-28+id*.3,z:13+id*.2,homeX:-28+id*.3,homeZ:13+id*.2,hp:1e6,maxHp:1e6,scale:1,speed:0,range:1,damage:0,timer:10000,windup:1,cooldown:1,state:'idle',flash:0,frozen:0,stagger:0,spawnGrace:0,deathAge:0,phase:0,sequence:0,xp:1}));
  return s;
}
function run(s,seconds,step=()=>{}){for(let i=0;i<Math.ceil(seconds*60);i++){s.update(1/60,{dx:0,dz:0});step(i);}}

test('G unlocks exactly at 30, old saves inherit it, and failed casts never consume resources',()=>{
  const s=arena('ice',29),energy=s.player.energy;
  assert.equal(s.cast(3,-28,13),false);assert.equal(s.player.energy,energy);assert.equal(s.player.cooldowns[3],0);
  s.gainXP(29*95);assert.equal(s.save.level,30);assert.equal(s.events.filter(e=>e.type==='awakeningUnlocked').length,1);
  const loaded=new GameState('ice',readSave({getItem:()=>JSON.stringify(s.save)}));assert.equal(loaded.player.cooldowns.length,SKILLS.length);assert.equal(loaded.save.level,30);
  assert.equal(loaded.cast(3,0,0),false);assert.equal(loaded.player.energy,100);
  s.player.energy=89;assert.equal(s.cast(3,-28,13),false);assert.equal(s.player.energy,89);
  s.player.energy=100;s.enemies.forEach(e=>e.spawnGrace=1);assert.equal(s.cast(3,-28,13),false);assert.equal(s.player.energy,100);
  assert.equal(s.cast(999,0,0),false);
});

test('all classes pay G once, keep Q/E/R timers independent, and use distinct invocation identities',()=>{
  const names=new Set(),lines=new Set(),colors=new Set();
  for(const kind of Object.keys(AWAKENING_STYLES)){
    const s=arena(kind);assert.ok(s.cast(3,-28,13));assert.equal(s.player.energy,100-SKILLS[3].cost);assert.equal(s.player.cooldowns[3],64);assert.deepEqual(s.player.cooldowns.slice(0,3),[0,0,0]);
    assert.equal(s.cast(3,-28,13),false);assert.equal(s.cast(0,-28,13),false);assert.equal(s.attack(-28,13),false);
    const event=s.events.find(e=>e.type==='awakening');names.add(event.name);lines.add(event.line);colors.add(event.color);
    run(s,.7);assert.ok(s.player.cooldowns[3]<64);assert.equal(s.player.energy,10);assert.equal(s.awakening.active,true);
  }
  assert.equal(names.size,3);assert.equal(lines.size,3);assert.equal(colors.size,3);
});

test('lightning has real telegraph time, tracks moving targets, and never stacks overlapping damage within a wave',()=>{
  const s=arena(),damage=s.stats.damage;s.cast(3,-28,13);run(s,.55);assert.ok(s.enemies.every(e=>e.hp===1e6));assert.ok(s.events.some(e=>e.type==='thunderMark'));
  s.enemies[0].x=-20;s.enemies[0].homeX=-20;s.enemies[0].z=16;s.enemies[0].homeZ=16;
  run(s,3.8);const hits=s.events.filter(e=>e.type==='hit'&&e.element==='awakening');
  for(const e of s.enemies){assert.equal(hits.filter(h=>h.enemyId===e.id).length,4);assert.equal(1e6-e.hp,3*Math.round(damage*2.1)+Math.round(damage*4.5));}
  assert.ok(s.events.some(e=>e.type==='thunderStrike'&&e.x===-20&&e.z===16));assert.equal(s.awakening.active,false);
  assert.ok(s.events.filter(e=>e.type==='thunderStrike').length>25,'land strikes span the battlefield');
  for(const strike of s.awakening.strikes.slice(0,s.awakening.count).filter(e=>!e.target))assert.ok(isLand(strike.x,strike.z,.2));
});

test('damage uses the cast snapshot; out-of-range or returning enemies are protected and death cancels the sequence',()=>{
  const s=arena(),base=s.stats.damage;s.enemies[1].x=100;s.enemies[2].state='return';s.enemies[2].homeX=100;
  s.cast(3,-28,13);s.save.boons.power=50;s.recalculate();s.stats.crit=0;run(s,4.4);
  assert.equal(1e6-s.enemies[0].hp,3*Math.round(base*2.1)+Math.round(base*4.5));assert.equal(s.enemies[1].hp,1e6);assert.equal(s.enemies[2].hp,1e6);
  s.player.cooldowns[3]=0;s.player.energy=100;s.cast(3,-28,13);const hp=s.enemies[0].hp;s.dead=true;s.awakening.update(1);assert.equal(s.awakening.active,false);assert.equal(s.enemies[0].hp,hp);
  s.revive();assert.equal(s.awakening.count,0);assert.equal(s.player.cooldowns[3],0);
});

test('whole sequence is deterministic across fixed steps and reuses a bounded strike pool',()=>{
  const a=arena(),b=arena();a.cast(3,-28,13);b.cast(3,-28,13);const pool=a.awakening.strikes;
  run(a,4.4);for(let i=0;i<220;i++)b.update(.02,{dx:0,dz:0});assert.deepEqual(a.enemies.map(e=>e.hp),b.enemies.map(e=>e.hp));
  a.player.cooldowns[3]=0;a.player.energy=100;assert.ok(a.cast(3,-28,13));assert.equal(a.awakening.strikes,pool);assert.equal(pool.length,192);assert.ok(a.awakening.count<192);
  run(a,4.4);assert.equal(a.awakening.active,false);assert.equal(a.events.filter(e=>e.type==='awakeningEnd').length,2);
});

test('rendered strikes and warning marks share impact positions, preserve finite buffers and fully expire',async()=>{
  const s=arena('cultivator',30,18),scene=new T.Scene(),camera=new T.PerspectiveCamera();camera.position.set(-10,24,30);
  const fx=new GameThunderVFX(scene,camera,s,{loadTexture:false});await fx.ready;
  const matrices=fx.bolts.instanceMatrix.array,ages=fx.bolts.geometry.attributes.aAge.array,instances=fx.pool,sparkPool=fx.sparks;let max=0,markMax=0;
  s.cast(3,-28,13);run(s,5,()=>{for(const event of s.events.splice(0))fx.handle(event);fx.update(1/60);max=Math.max(max,fx.bolts.count);markMax=Math.max(markMax,fx.marks.count);assert.ok(matrices.every(Number.isFinite));});
  assert.ok(max>=18);assert.ok(markMax>0);assert.equal(fx.bolts.count,0);assert.equal(fx.impacts.count,0);assert.equal(fx.sparkMesh.count,0);assert.equal(fx.group.visible,false);
  assert.equal(fx.bolts.instanceMatrix.array,matrices);assert.equal(fx.bolts.geometry.attributes.aAge.array,ages);assert.equal(fx.pool,instances);assert.equal(fx.sparks,sparkPool);assert.equal(fx.bolts.material.depthTest,true);assert.equal(fx.bolts.material.depthWrite,false);fx.dispose();assert.equal(scene.children.length,0);
});

test('awakening camera pulls from character close-up to battlefield, stays finite and yields to movement',()=>{
  const s=arena();s.cast(3,-28,13);const g={state:s,settings:{},camera:new T.PerspectiveCamera(44)},director=new GameSkillCamera(g),eye=new T.Vector3(),focus=new T.Vector3();director.begin(3);let high=0,close=Infinity;
  for(let i=0;i<310;i++){eye.set(-15,16,35);focus.set(-28,1,22);director.update(1/60,eye,focus);if(i<30)close=Math.min(close,eye.distanceTo(focus));high=Math.max(high,eye.y);assert.ok([...eye,...focus,g.camera.fov].every(Number.isFinite));assert.ok(eye.y>heightAt(eye.x,eye.z));}
  assert.ok(close<10);assert.ok(high>25);assert.equal(director.label,'');assert.equal(director.timeScale,1);
  director.begin(3);director.cancel();director.update(.3,eye,focus);assert.equal(director.label,'');assert.equal(s.awakening.active,true,'camera cancellation does not cancel actual lightning');
});

test('level and victory dialogs wait for the last strike; pausing mid-awakening cannot lock pending growth',()=>{
  const s=arena();s.cast(3,-28,13);s.pendingBoons=1;let boons=0,victories=0,closed=0;
  const ui={state:s,boon:()=>boons++,victory:()=>victories++,dialog:{close:()=>closed++},game:{paused:true,audio:{resume(){}},input:{clear(){}}}};
  GameUI.prototype.handle.call(ui,{type:'level'});assert.equal(boons,0);assert.equal(ui.deferredBoon,true);
  GameUI.prototype.close.call(ui);assert.equal(closed,1);assert.equal(ui.game.paused,false);
  s.awakening.active=false;GameUI.prototype.handle.call(ui,{type:'awakeningEnd'});assert.equal(boons,1);GameUI.prototype.close.call(ui);assert.equal(closed,1,'growth must be chosen after the skill finishes');
  s.awakening.active=true;GameUI.prototype.handle.call(ui,{type:'victory'});assert.equal(victories,0);s.awakening.active=false;GameUI.prototype.handle.call(ui,{type:'awakeningEnd'});assert.equal(victories,1);
});
