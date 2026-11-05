import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import {readFile} from 'node:fs/promises';import {GearDynamics} from '../src/game/GearDynamics.js';import {sampleHeavenBlade} from '../src/game/HeavenBladeMotion.js';import {GameState,readSave} from '../src/game/GameState.js';import {ENCOUNTERS,heightAt} from '../src/game/GameData.js';import {createLootMotion,advanceLoot} from '../src/game/LootMotion.js';import {equipmentProfile} from '../src/game/EquipmentCatalog.js';import {GameThunderVFX} from '../src/game/GameThunderVFX.js';import {GameAscendantVFX} from '../src/game/GameAscendantVFX.js';import {GameLootVFX} from '../src/game/GameLootVFX.js';import {equipmentSources,lootSources} from './helpers/equipment-assets.js';

test('cloth and wing inertia react to starts, stops and turns, settle without runaway motion and retain buffers',()=>{
 function sim(fps){const physics=new GearDynamics(),p={x:0,z:0,yaw:0},cloth=physics.cloak,wings=physics.wings;physics.reset(p);let trail=0,sway=0,afterStop=0;
 for(let i=1;i<=fps*6;i++){const t=i/fps;if(t<2)p.z=t*7;if(t>=2&&t<3)p.yaw=(t-2)*1.8;physics.update(1/fps,p,t);if(t<2)trail=Math.min(trail,cloth[13]);if(t<3)sway=Math.max(sway,Math.abs(cloth[12]));if(t>2&&t<2.2)afterStop=Math.max(afterStop,Math.abs(cloth[13]));assert.ok([...cloth,...wings].every(Number.isFinite));assert.ok(Math.max(...cloth.map(Math.abs))<.35);}
 assert.equal(physics.cloak,cloth);assert.equal(physics.wings,wings);assert.ok(trail<-.07);assert.ok(sway>.015);assert.ok(afterStop>.03);assert.ok(Math.abs(cloth[13])<.025);return [...cloth,...wings];}
 const a=sim(30),b=sim(120);assert.ok(a.every((v,i)=>Math.abs(v-b[i])<.025));
});

test('loot follows a parabolic arc before attraction and preserves its flight across save/reload',()=>{
 const p={x:-28,z:22},motion=createLootMotion(p.x,p.z,71,2),d={...motion,x:p.x,z:p.z,age:0};let top=-Infinity;for(let i=0;i<40;i++){d.age=i/60;advanceLoot(d,1/60,p);top=Math.max(top,d.y);}assert.ok(top>heightAt(p.x,p.z)+1.6);assert.equal(d.landed,false);d.age=d.flight;assert.equal(advanceLoot(d,1/60,p),true);assert.equal(d.x,d.landX);assert.equal(d.z,d.landZ);
 const s=new GameState();s.started=new Set(ENCOUNTERS.map(e=>e.id));s.random=()=>.1;s.gear.drop({x:p.x,z:p.z,level:20,type:'boss'});for(let i=0;i<20;i++)s.update(1/60,{dx:0,dz:0});assert.equal(s.save.gearBag.length,0);let json;s.write({setItem:(k,v)=>json=v});const restored=new GameState('sword',readSave({getItem:()=>json}));assert.ok(Math.abs(restored.drops[0].age-s.drops[0].age)<1e-8);assert.equal(restored.drops[0].birthX,s.drops[0].birthX);for(let i=0;i<120;i++)restored.update(1/60,{dx:0,dz:0});assert.equal(restored.save.gearBag.length,1);assert.equal(restored.save.groundGear.length,0);
});

test('higher level and enhancement select real new silhouettes; bow, dao and jian retain distinct families',async()=>{
 const sources=await equipmentSources();for(const slot of ['wings','cloak']){const ids=[1,20,40].map(level=>equipmentProfile({slot,level,enhance:0}).id);assert.equal(new Set(ids).size,3);for(const id of ids)assert.ok(sources[id]);assert.equal(equipmentProfile({slot,level:1,enhance:16}).id,ids[2]);}
 for(const family of ['bow','dao','jian']){const low=equipmentProfile({slot:'weapon',weaponKind:family,level:1,enhance:0}),high=equipmentProfile({slot:'weapon',weaponKind:family,level:40,enhance:0});assert.notEqual(low.id,high.id);assert.ok(sources[high.id]);}
 for(const id of ['bow-star','bow-imperial']){const fit=sources[id].userData.gearFit;assert.ok(fit);assert.ok(fit.lower[1]<-.35&&fit.upper[1]>.35);assert.ok(fit.lower[2]<-.04);}
 const loot=JSON.parse(await readFile('public/game/models/equipment/loot-manifest.json','utf8'));assert.equal(Object.keys(loot).length,15);assert.ok(Object.values(loot).every(m=>m.triangles<800));
});

test('heaven blade rests hilt-down and swings its cutting edge down; the point never stabs the ground',()=>{
 const pose={},q=new T.Quaternion(),up=new T.Vector3(),edge=new T.Vector3();for(const t of [.6,2.2]){sampleHeavenBlade(t,0,0,0,0,pose);assert.ok(pose.y<.15);q.setFromEuler(new T.Euler(pose.pitch,pose.roll,0,'XYZ'));up.set(0,1,0).applyQuaternion(q);assert.ok(up.y>.999);}
 sampleHeavenBlade(1.25,0,0,0,0,pose);q.setFromEuler(new T.Euler(pose.pitch,pose.roll,0,'XYZ'));edge.set(1,0,0).applyQuaternion(q);up.set(0,1,0).applyQuaternion(q);assert.ok(edge.y<-.999);assert.ok(up.z>.999);assert.ok(pose.y-.84<.025&&pose.y-.84>=0);
});

test('glacial arrows lock XZ, descend vertically and contact the same positions used for damage and impacts',async()=>{
 const s=new GameState();s.save.level=40;s.recalculate();s.started=new Set(ENCOUNTERS.map(e=>e.id));s.enemies=[{id:0,x:s.player.x,z:s.player.z-10,hp:1e6,maxHp:1e6,type:'melee',state:'idle',spawnGrace:0,scale:1,frozen:0,stagger:0,flash:0,xp:1}];s.stats.crit=0;const scene=new T.Scene(),camera=new T.PerspectiveCamera(),fx=new GameAscendantVFX(scene,camera,s,null,{loadTexture:false});s.cast(5,s.enemies[0].x,s.enemies[0].z);const matrix=new T.Matrix4(),axis=new T.Vector3(),at=[];let first,contact;
 const locks=new Map(),lastY=new Map();
 for(let i=0;i<100;i++){
  s.time+=1/60;s.awakening.update(1/60);
  for(const event of s.events.splice(0)){fx.handle(event);if(event.type==='glacialLance'){locks.set(event.seed,{x:event.x,z:event.z});if(!first)first={...event};}if(event.type==='glacialStrike'&&!contact)contact={...event};}
  fx.update(1/60);let j=0;
  for(const lance of fx.lancePool){if(!lance.alive)continue;matrix.fromArray(fx.lances.instanceMatrix.array,j++*16);axis.set(0,1,0).transformDirection(matrix);assert.ok(axis.y<-.99999);const pos=new T.Vector3().setFromMatrixPosition(matrix),lock=locks.get(lance.seed);assert.ok(lock);assert.ok(Math.abs(pos.x-lock.x)<1e-5&&Math.abs(pos.z-lock.z)<1e-5);if(lastY.has(lance.seed))assert.ok(pos.y<=lastY.get(lance.seed)+1e-5);lastY.set(lance.seed,pos.y);}
  assert.equal(j,fx.lances.count);if(i===55)s.enemies[0].x+=.5;
 }
 assert.ok([...locks.values()].some(lock=>lock.x!==first.x),'later waves must reacquire a moving enemy');
 assert.ok(first&&contact);assert.equal(first.x,contact.x);assert.equal(first.z,contact.z);assert.ok(s.enemies[0].hp<1e6);fx.dispose();
});

test('awakening effect visibility never changes the scene light count',async()=>{
 const s=new GameState(),scene=new T.Scene(),camera=new T.PerspectiveCamera();scene.add(new T.PointLight());const a=new GameAscendantVFX(scene,camera,s,null,{loadTexture:false}),b=new GameThunderVFX(scene,camera,s,{loadTexture:false});await Promise.all([a.ready,b.ready]);const count=()=>{let n=0;scene.traverseVisible(o=>{if(o.isLight)n++;});return n;};assert.equal(count(),1);
 for(const index of [3,4,5]){a.handle({type:'awakening',index,targetX:0,targetZ:0,yaw:0,color:'#ffc765'});b.handle({type:'awakening'});s.awakening.index=index;s.awakening.active=true;s.awakening.age=1.2;a.update(1/60);b.update(1/60);assert.equal(count(),1);a.reset();b.reset();assert.equal(count(),1);}a.dispose();b.dispose();
});

test('all fifteen dropped item silhouettes land on the ground at every heading without standing on edge or sinking',async()=>{
 const templates=await lootSources(),s=new GameState(),fx=new GameLootVFX(new T.Scene(),s,templates,new T.PerspectiveCamera()),matrix=new T.Matrix4(),point=new T.Vector3();
 for(const [id,root]of Object.entries(templates)){
  if(id.startsWith('bow-')){const size=new T.Box3().setFromObject(root).getSize(new T.Vector3());assert.ok(size.z<size.x*.6,'bow lies in the same XY plane as other flat equipment');}
  for(const seed of [0,.5,1.5,3.4,5.8]){
   const d={lootId:1,modelId:id,x:s.player.x+10,z:s.player.z,age:1.1,alive:true,landed:true,seed,flight:.7,gear:{slot:id.startsWith('bow-')||id.includes('jian')||id.includes('dao')?'weapon':id.split('-')[0],rarity:2,level:40}};d.y=heightAt(d.x,d.z)+.14;s.drops=[d];fx.update(0);const bucket=fx.buckets.get(id);assert.equal(bucket.count,1);let min=Infinity;
   for(const mesh of bucket.parts){mesh.getMatrixAt(0,matrix);const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i++)min=Math.min(min,point.fromBufferAttribute(positions,i).applyMatrix4(matrix).y);assert.ok([...matrix.elements].every(Number.isFinite));}
   assert.ok(Math.abs(min-heightAt(d.x,d.z)-.015)<1e-5,id+' has correct ground clearance');
  }
 }fx.dispose();
});
