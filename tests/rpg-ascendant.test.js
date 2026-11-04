import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {GameState} from '../src/game/GameState.js';import {ENCOUNTERS,SKILLS,heightAt} from '../src/game/GameData.js';import {GameAscendantVFX} from '../src/game/GameAscendantVFX.js';import {GameSkillCamera} from '../src/game/GameSkillCamera.js';
function arena(level=40){const s=new GameState();s.save.level=level;s.recalculate();s.stats.crit=0;s.started=new Set(ENCOUNTERS.map(e=>e.id));s.enemies=Array.from({length:4},(_,id)=>({id,type:'melee',x:s.player.x+(id-1)*2,z:s.player.z-10,homeX:s.player.x+(id-1)*2,homeZ:s.player.z-10,hp:1e8,maxHp:1e8,scale:1,speed:0,range:1,damage:0,timer:100000,state:'idle',flash:0,frozen:0,stagger:0,spawnGrace:0,deathAge:0,xp:0}));return s;}
const run=(s,seconds,fn=()=>{})=>{for(let i=0;i<seconds*60;i++){s.update(1/60,{dx:0,dz:0});fn();}};

test('H / J have independent 35 / 40 gates and costs; overlapping awakenings never consume additional resources',()=>{
 for(const index of [4,5]){const s=arena(SKILLS[index].unlockLevel-1),energy=s.player.energy;assert.equal(s.cast(index,0,0),false);assert.equal(s.player.energy,energy);s.gainXP(s.save.level*95);s.pendingBoons=0;assert.ok(s.events.some(e=>e.type==='awakeningUnlocked'));assert.ok(s.cast(index,0,0));assert.equal(s.player.energy,s.stats.energyMax-SKILLS[index].cost);const cash=s.player.energy;s.player.cooldowns.fill(0);assert.equal(s.cast(index===4?5:4,0,0),false);assert.equal(s.player.energy,cash);s.dead=true;s.awakening.update(1);assert.equal(s.awakening.active,false);}
});

test('great blade tracks before locking, applies only two capsule hits and leaves distant / returning enemies alone',()=>{
 const s=arena(),damage=s.stats.damage;s.enemies[2].x+=18;s.enemies[3].state='return';s.enemies[3].homeX=100;s.cast(4,0,0);run(s,.7);assert.ok(s.enemies.every(e=>e.hp===1e8));s.enemies[0].x+=1;run(s,.3);const anchor=s.awakening.cx;s.enemies[0].x+=.4;run(s,3.3);assert.equal(s.awakening.cx,anchor);assert.equal(1e8-s.enemies[0].hp,Math.round(damage*8.8)+Math.round(damage*3.2));assert.equal(s.enemies[2].hp,1e8);assert.equal(s.enemies[3].hp,1e8);const hits=s.events.filter(e=>e.type==='heavenCleave');assert.equal(hits.length,2);assert.ok(hits.every(e=>e.x===anchor));assert.equal(s.awakening.active,false);
});

test('ice storm damage, freeze and contact VFX agree on the actual fixed field; no duplicate tick damage',()=>{
 const s=arena(),damage=s.stats.damage;s.enemies[3].x+=22;s.cast(5,0,0);run(s,.9);assert.ok(s.enemies.every(e=>e.hp===1e8));run(s,.3);assert.ok(s.enemies[0].frozen>0);run(s,4.5);for(const e of s.enemies.slice(0,3))assert.equal(1e8-e.hp,8*Math.round(damage*1.05)+Math.round(damage*4.8));assert.equal(s.enemies[3].hp,1e8);assert.equal(s.events.filter(e=>e.type==='glacialPulse').length,9);assert.equal(s.events.filter(e=>e.type==='glacialStrike').length,27);assert.equal(s.awakening.active,false);
});

test('new awakening render pools stay finite through playback, camera cancellation and complete dissipation',async()=>{
 for(const index of [4,5]){const s=arena(),scene=new T.Scene(),camera=new T.PerspectiveCamera(44);camera.position.set(-20,22,10);const fx=new GameAscendantVFX(scene,camera,s,new T.Mesh(new T.BoxGeometry(.1,1,.1),new T.MeshStandardMaterial()),{loadTexture:false});await fx.ready;const matrices=fx.shards.instanceMatrix.array,impacts=fx.impacts.instanceMatrix.array,pool=fx.shardPool;const director=new GameSkillCamera({state:s,settings:{},camera});s.cast(index,0,0);director.begin(index);let max=0;
 run(s,7,()=>{for(const e of s.events.splice(0))fx.handle(e);fx.update(1/60);max=Math.max(max,fx.shards.count);assert.ok(matrices.every(Number.isFinite));assert.ok(impacts.every(Number.isFinite));const eye=new T.Vector3(-12,20,25),focus=new T.Vector3(-28,1,15);director.update(1/60,eye,focus);assert.ok([...eye,...focus].every(Number.isFinite));assert.ok(eye.y>heightAt(eye.x,eye.z));});assert.ok(max>20);assert.equal(fx.group.visible,false);assert.equal(fx.shards.count,0);assert.equal(fx.shardPool,pool);assert.equal(fx.shards.instanceMatrix.array,matrices);fx.dispose();assert.equal(scene.children.length,0);}
});
