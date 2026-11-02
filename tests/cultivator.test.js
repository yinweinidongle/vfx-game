import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {Cultivator,cultivationClipTime} from '../src/scene/Cultivator.js';
import {CultivatorSkill} from '../src/vfx/cultivator/CultivatorSkill.js';
import {DivineAvatar,standingClipTime} from '../src/vfx/cultivator/DivineAvatar.js';
import {MeteorStorm,makeStormSchedule,meteorPosition} from '../src/vfx/cultivator/MeteorStorm.js';
import {CultivatorCinematicDirector} from '../src/scene/CultivatorCinematicDirector.js';
import {defaults} from '../src/VFXConfig.js';

async function fixture(){
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 globalThis.window={URL:{createObjectURL:()=>''}};globalThis.document={createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(v){}})};
 let root;
 try{const b=await readFile(new URL('../public/models/standing-magic-area.fbx',import.meta.url));root=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
 finally{globalThis.window=previousWindow;globalThis.document=previousDocument;}
 const fighter=Object.create(Cultivator.prototype),group=new THREE.Group(),wrapper=new THREE.Group();
 wrapper.position.x=-8.4;wrapper.rotation.y=Math.PI/2;group.add(wrapper);
 Object.assign(fighter,{group,wrapper,materials:[],time:0,left:new THREE.Vector3(),right:new THREE.Vector3(),disposed:false});
 const mesh=root.getObjectByProperty('isSkinnedMesh',true),groups=mesh.geometry.groups.map(g=>({...g}));
 fighter.install(root);return{fighter,mesh,groups};
}
function setup(overrides={}){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1.5,.1,120);camera.position.set(14,12,25);camera.lookAt(0,5,0);camera.updateMatrixWorld();
 const config={...defaults,autoLoop:false,...overrides},skill=new CultivatorSkill(scene,camera,config);skill.setActive(true);
 return{scene,camera,config,skill};
}

test('provided magic FBX preserves both textured materials while compacting 49 draw groups to 2',async()=>{
 const{fighter,mesh,groups}=await fixture();
 assert.equal(fighter.metadata.character,'Kachujin');assert.equal(groups.length,49);assert.equal(mesh.geometry.groups.length,2);
 assert.equal(mesh.geometry.index.count,groups.reduce((a,g)=>a+g.count,0));
 for(const group of mesh.geometry.groups)assert.equal(group.count,groups.filter(g=>g.materialIndex===group.materialIndex).reduce((a,g)=>a+g.count,0));
 assert.equal(new Set(mesh.geometry.index.array).size,mesh.geometry.attributes.position.count);
 assert.equal(fighter.materials.length,2);for(const m of fighter.materials){assert.ok(m.map&&m.normalMap);assert.equal(m.map.colorSpace,THREE.SRGBColorSpace);}
 for(const t of [0,.6,1.45,1.95,3.5,5.8]){fighter.update(t);assert.ok(fighter.left.toArray().every(Number.isFinite));assert.ok(fighter.right.toArray().every(Number.isFinite));}
 assert.ok(cultivationClipTime(5.8)<fighter.clip.duration);fighter.dispose();
});

test('fallback spirit owns its static skeleton without changing the source actor',async()=>{
 const{fighter,mesh}=await fixture(),scene=new THREE.Scene(),avatar=new DivineAvatar(scene,defaults);
 const material=mesh.material;let disposedSource=0;mesh.geometry.addEventListener('dispose',()=>disposedSource++);
 avatar.bind(fighter);avatar.bind(fighter);assert.equal(avatar.rigs.length,1);assert.equal(avatar.ownedGeometry.length,0);
 for(const rig of avatar.rigs){const skin=rig.root.getObjectByProperty('isSkinnedMesh',true);assert.notEqual(skin.skeleton,mesh.skeleton);assert.notEqual(skin.skeleton.bones[0],mesh.skeleton.bones[0]);}
 for(const g of avatar.ownedGeometry){assert.ok(g.index.count>1000);assert.ok(g.index.count<mesh.geometry.index.count*.6);}
 avatar.update(1.45);assert.equal(avatar.group.visible,true);
 const pose=avatar.rigs.map(r=>r.root.getObjectByProperty('isSkinnedMesh',true).skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]));
 const origin=avatar.group.position.toArray();
 for(const time of [.7,1.8,2.7,4.5]){avatar.update(time);assert.deepEqual(avatar.group.position.toArray(),origin);assert.deepEqual(avatar.rigs.map(r=>r.root.getObjectByProperty('isSkinnedMesh',true).skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()])),pose);}
 assert.ok(avatar.rimStrength.value>1);avatar.update(5.8);assert.equal(avatar.group.visible,false);assert.equal(avatar.halo.group.visible,false);
 avatar.dispose();assert.equal(disposedSource,0);assert.equal(mesh.material,material);fighter.dispose();
});

test('dedicated Standing FBX plays once, preserves its authored rise, holds and seeks independently of the caster',async()=>{
 const bytes=await readFile(new URL('../public/models/divine-standing.fbx',import.meta.url));
 const source=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const clip=source.animations[0],originalHip=Array.from(clip.tracks.find(t=>/Hips.position$/.test(t.name)).values);
 const{fighter,mesh}=await fixture(),avatar=new DivineAvatar(new THREE.Scene(),defaults);
 const casterPose=mesh.skeleton.bones.map(b=>b.quaternion.toArray());
 avatar.setStandingAnimation(clip);avatar.bind(fighter);
 assert.equal(avatar.metadata.source,'divine-standing.fbx');assert.equal(avatar.halo.layers.length,2);
 const referenceMixer=new THREE.AnimationMixer(source),referenceAction=referenceMixer.clipAction(clip);
 referenceAction.setLoop(THREE.LoopOnce,1);referenceAction.clampWhenFinished=true;referenceAction.play();
 for(const t of [.4,.7,1.3,1.85,3.7,.55,4.1]){
  avatar.update(t);referenceAction.paused=false;referenceMixer.setTime(standingClipTime(t,clip.duration));
  for(const name of ['Hips','Head','Spine2','LeftArm','RightArm']){
   const actual=avatar.rigs[0].root.getObjectByName('mixamorig'+name),expected=source.getObjectByName('mixamorig'+name);
   assert.ok(actual.quaternion.toArray().every((v,i)=>Math.abs(v-expected.quaternion.toArray()[i])<1e-6),`${name} matches the supplied animation`);
  }
  const hips=avatar.rigs[0].hips;
  assert.equal(hips.position.x,0);assert.equal(hips.position.z,0);
  assert.ok(Math.abs(hips.position.y-source.getObjectByName('mixamorigHips').position.y)<1e-5);
 }
 avatar.update(.45);const low=avatar.headPosition.y;avatar.update(2.6);assert.ok(avatar.headPosition.y>low+3);
 const finalPose=avatar.rigs[0].root.getObjectByProperty('isSkinnedMesh',true).skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]);
 avatar.update(4.4);assert.deepEqual(avatar.rigs[0].root.getObjectByProperty('isSkinnedMesh',true).skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]),finalPose);
 assert.deepEqual(mesh.skeleton.bones.map(b=>b.quaternion.toArray()),casterPose);
 assert.deepEqual(Array.from(clip.tracks.find(t=>/Hips.position$/.test(t.name)).values),originalHip);
 avatar.dispose();fighter.dispose();
});

test('meteors originate on the tilted celestial seal and meet their independently timed targets',()=>{
 const p=new THREE.Vector3();
 for(const meteorCount of [12,60,84])for(const flightSpeed of [10,18,35]){
  const events=makeStormSchedule({...defaults,meteorCount,flightSpeed});assert.equal(events.length,meteorCount);
  for(const e of events){
   const y=e.start.y-14.5,z=e.start.z+1.2;
   assert.ok(Math.abs(y*Math.cos(.42)-z*Math.sin(.42))<1e-10,'origin lies on the portal');
   meteorPosition(e,e.launch,p);assert.ok(p.distanceTo(e.start)<1e-9);meteorPosition(e,e.hit,p);assert.ok(p.distanceTo(e.end)<1e-9);
   let prior=Infinity;for(let j=0;j<=50;j++){meteorPosition(e,e.launch+e.fall*j/50,p);assert.ok(p.y<=prior+1e-8);prior=p.y;}
  }
 }
});

test('storm seeking is deterministic and fixed buffers are reused through repeated barrages',()=>{
 const{skill}=setup();const storm=skill.storm,positions=storm.trailPositions,particles=storm.particlePositions,matrix=storm.rocks.instanceMatrix.array;
 skill.seek(3.1);const expected=Array.from(positions);const matrices=Array.from(matrix);
 assert.ok(storm.rocks.count>15);assert.ok(storm.shards.count>0);assert.ok(storm.points.geometry.drawRange.count>100);
 for(let i=0;i<12;i++){skill.seek(i%2?.5:4.5);skill.fire();skill.seek(3.1);assert.equal(storm.trailPositions,positions);assert.equal(storm.particlePositions,particles);assert.deepEqual(Array.from(positions),expected);assert.deepEqual(Array.from(matrix),matrices);}
 skill.seek(skill.timeline.duration);assert.equal(storm.rocks.count,0);assert.equal(storm.shards.count,0);assert.equal(storm.trailGeometry.drawRange.count,0);assert.equal(storm.points.geometry.drawRange.count,0);assert.ok(storm.hitAge.every(v=>v<0));skill.dispose();
});

test('pause, live storm controls, deactivation and complete cleanup keep the timeline coherent',()=>{
 const{skill,config}=setup();skill.seek(2.8);skill.timeline.playing=false;skill.update(.5,.5);assert.equal(skill.timeline.time,2.8);
 const ratio=skill.timeline.time/skill.timeline.duration;config.flightSpeed=10;config.meteorCount=84;skill.dirty=true;skill.update(0,0);skill.refreshView();
 assert.ok(Math.abs(skill.timeline.time/skill.timeline.duration-ratio)<1e-10);assert.equal(skill.storm.events.length,84);assert.equal(skill.timeline.playing,false);
 skill.setActive(false);assert.equal(skill.root.visible,false);assert.equal(skill.storm.rocks.count,0);assert.equal(skill.light.intensity,0);assert.equal(skill.impactLight.intensity,0);
 skill.setActive(true);skill.fire();assert.equal(skill.timeline.time,0);assert.equal(skill.timeline.playing,true);
 skill.dispose();skill.dispose();assert.equal(skill.root.parent,null);
});

test('meteor pools remain finite and bounded at maximum density and wide blast radius',()=>{
 const{skill}=setup({meteorCount:84,meteorSize:1.6,particleDensity:2,impactRadius:3,flightSpeed:10});
 const storm=skill.storm;
 for(let t=0;t<=skill.timeline.duration;t+=.07){
  skill.seek(t);assert.ok(storm.rocks.count<=84);assert.ok(storm.shards.count<=504);assert.ok(storm.particleCount<=1300);
  assert.ok(storm.trailPositions.every(Number.isFinite));assert.ok(storm.rocks.instanceMatrix.array.every(Number.isFinite));assert.ok(storm.shards.instanceMatrix.array.every(Number.isFinite));
 }
 skill.dispose();
});

test('ritual camera frames the avatar and sky volume on portrait and desktop screens',()=>{
 const{skill,camera}=setup(),director=new CultivatorCinematicDirector(camera),p=new THREE.Vector3();
 for(const aspect of [.4,1,1.8,2.5])for(const size of [.7,1,1.25])for(const t of [.3,.49,.55,.69,.85,1.3,2.4,3.3,5.2]){
  skill.config.avatarScale=size;skill.seek(t);director.update(skill,aspect);
  assert.ok(camera.position.y>=.65,'camera cannot enter the stage');
  for(let i=0;i<8;i++){p.set(i&1?director.bounds.max.x:director.bounds.min.x,i&2?director.bounds.max.y:director.bounds.min.y,i&4?director.bounds.max.z:director.bounds.min.z).project(camera);assert.ok(Math.abs(p.x)<.9&&Math.abs(p.y)<.9);assert.ok(p.z>-1&&p.z<1);}
  const snapshot=camera.position.toArray();director.update(skill,aspect);assert.deepEqual(camera.position.toArray(),snapshot);
 }
 skill.dispose();
});

test('eight ritual shots move within each take and track the actual first meteor at all fall speeds',()=>{
 for(const speed of [10,18,35]){
  const{skill,camera}=setup({flightSpeed:speed,cameraShake:false}),director=new CultivatorCinematicDirector(camera);
  const seen=new Map(),projected=new THREE.Vector3(),event=skill.storm.events[0];
  for(let t=.02;t<skill.timeline.duration;t+=.025){
   skill.seek(t);director.update(skill,1.5);
   if(!seen.has(director.shotId))seen.set(director.shotId,{first:camera.position.clone(),motion:0});
   const take=seen.get(director.shotId);take.motion=Math.max(take.motion,camera.position.distanceTo(take.first));
   if(director.shotId==='dive'){
    meteorPosition(event,Math.min(t,event.hit),projected);projected.project(camera);
    assert.ok(Math.abs(projected.x)<.45&&Math.abs(projected.y)<.6&&projected.z<1,'hero stays in the tracking shot');
   }
  }
  assert.equal(seen.size,8);
  for(const [name,take] of seen)assert.ok(take.motion>.04,`${name} has an authored camera move`);
  skill.dispose();
 }
});

test('the visible standing spirit stays inside its recentered wheel through the cinematic rise',async()=>{
 const bytes=await readFile(new URL('../public/models/divine-standing.fbx',import.meta.url));
 const animation=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'').animations[0];
 const{fighter}=await fixture(),{skill,scene,camera}=setup({cameraShake:false});
 skill.avatar.setStandingAnimation(animation);skill.bindFighter(fighter);
 const director=new CultivatorCinematicDirector(camera),mesh=skill.avatar.rigs[0].root.getObjectByProperty('isSkinnedMesh',true);
 const p=new THREE.Vector3(),normal=new THREE.Vector3(),direction=new THREE.Vector3(),centre=new THREE.Vector3(),offset=new THREE.Vector3(),inverse=new THREE.Matrix4();
 for(const size of [.7,1,1.25])for(const aspect of [.65,1.4,2])for(const t of [.55,.8,1.05,1.3,1.5,1.65,1.78]){
  skill.config.avatarScale=size;skill.seek(t);director.update(skill,aspect);scene.updateMatrixWorld(true);mesh.skeleton.update();
  assert.ok(camera.position.y>=.65,'the real Standing pose keeps the camera above the ground');
  const wheel=skill.avatar.halo.group;normal.set(0,0,1).transformDirection(wheel.matrixWorld);centre.setFromMatrixPosition(wheel.matrixWorld);inverse.copy(wheel.matrixWorld).invert();
  const numerator=normal.dot(offset.subVectors(centre,camera.position));
  for(let i=0;i<mesh.geometry.attributes.position.count;i+=16){
   mesh.getVertexPosition(i,p);p.applyMatrix4(mesh.matrixWorld);
   if(p.y<skill.avatar.hipsPosition.y-1.75*size)continue;
   direction.subVectors(p,camera.position);p.copy(camera.position).addScaledVector(direction,numerator/normal.dot(direction)).applyMatrix4(inverse);
   assert.ok(Math.hypot(p.x,p.y)<5.94,`silhouette inside wheel at ${t}s, ${size}x, aspect ${aspect}`);
  }
 }
 skill.dispose();fighter.dispose();
});

test('wheel bolts launch at real rune positions, intercept the animated target, drain and reuse their pools',()=>{
 const{skill}=setup(),target=new THREE.Vector3(),point=new THREE.Vector3();
 const sample=(t,b,out)=>out.set(7.5+Math.sin(t)*.3,1.4+Math.cos(t)*.2,Math.sin(t*.7)*.25);
 skill.bindActors({sampleTargetPosition:sample});skill.update(0,0);
 const bolts=skill.bolts,buffer=bolts.positions,matrices=bolts.heads.instanceMatrix.array;
 assert.equal(bolts.events.length,48);
 for(const e of bolts.events){
  skill.sampleHalo(e.launch,e.i%2,e.i*2.399963,point);assert.ok(point.distanceTo(e.start)<1e-9);
  bolts.sample(e,e.launch,point);assert.ok(point.distanceTo(e.start)<1e-9);
  bolts.sample(e,e.hit,point);sample(e.hit,0,target);assert.ok(point.distanceTo(target)<1e-9);
 }
 skill.seek(.9);assert.equal(bolts.heads.count,0);assert.equal(bolts.geometry.drawRange.count,0);
 skill.seek(2.5);assert.ok(bolts.heads.count>0);assert.ok(bolts.shards.count>0);assert.ok(bolts.geometry.drawRange.count>0);
 const expected=Array.from(buffer);
 for(let i=0;i<5;i++){skill.fire();skill.seek(2.5);assert.equal(bolts.positions,buffer);assert.equal(bolts.heads.instanceMatrix.array,matrices);assert.deepEqual(Array.from(buffer),expected);}
 skill.seek(skill.timeline.duration);assert.equal(bolts.heads.count,0);assert.equal(bolts.shards.count,0);assert.equal(bolts.geometry.drawRange.count,0);assert.ok(bolts.hitAges.every(age=>age<0));
 skill.config.particleDensity=2;skill.dirty=true;skill.update(0,0);assert.equal(bolts.events.length,96);assert.equal(bolts.positions,buffer);
 skill.seek(2.9);assert.ok(bolts.heads.count<=96);assert.ok(bolts.shards.count<=672);assert.ok(bolts.positions.every(Number.isFinite));
 skill.dispose();
});
