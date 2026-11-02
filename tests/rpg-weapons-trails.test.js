import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GameArcherRig } from '../src/game/GameArcherRig.js';
import { GameProjectileTrails } from '../src/game/GameProjectileTrails.js';

test('actual bow stays upright, fitted to the palm and aligned forward through idle, run and release',async()=>{
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  globalThis.window={URL:{createObjectURL:()=>''}};globalThis.document={createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(value){}})};
  let model;try{const bytes=await readFile(new URL('../public/models/standing-aim-recoil.fbx',import.meta.url));model=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
  const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/game/models/frost-bow-v2.glb'),source=new T.Group();
  for(const node of doc.getRoot().listNodes())if(node.getMesh())for(const primitive of node.getMesh().listPrimitives()){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));if(primitive.getIndices())g.setIndex(new T.BufferAttribute(primitive.getIndices().getArray(),1));g.applyMatrix4(new T.Matrix4().fromArray(node.getWorldMatrix()));source.add(new T.Mesh(g,new T.MeshBasicMaterial()));
  }
  const bounds=new T.Box3().setFromObject(model),scale=2.1/(bounds.max.y-bounds.min.y),group=new T.Group();model.scale.setScalar(scale);model.position.y=-bounds.min.y*scale;group.add(model);
  const motion=JSON.parse(await readFile('public/game/models/ice-motion.json','utf8')).map(c=>T.AnimationClip.parse(c)),mixer=new T.AnimationMixer(model),state={player:{yaw:0,action:'idle',actionTime:0}};
  const rig=new GameArcherRig({model,group},source,state),q=new T.Quaternion(),up=new T.Vector3(),forward=new T.Vector3(),grip=new T.Vector3(),position=new T.Vector3();
  for(const [key,clip]of [['idle',motion.find(c=>c.name==='Idle')],['run',motion.find(c=>c.name==='Run')],['attack',model.animations[0]]]){
    mixer.stopAllAction();mixer.clipAction(clip).play();
    for(const yaw of [0,1.4,-2.2])for(const time of [.02,.1,.24,.6]){
      rig.restore();group.rotation.y=yaw;state.player.yaw=yaw;state.player.action=key;state.player.actionTime=time;mixer.setTime(time);rig.update();
      rig.readGrip(grip);rig.group.getWorldPosition(position);rig.group.getWorldQuaternion(q);up.set(0,1,0).applyQuaternion(q);forward.set(0,0,1).applyQuaternion(q);
      assert.ok(position.distanceTo(grip)<1e-7);assert.ok(up.y>.9999);assert.ok(forward.dot(new T.Vector3(Math.sin(yaw),0,Math.cos(yaw)))>.9999);assert.ok(rig.stringPositions.every(Number.isFinite));assert.ok(Object.values(state.attackSocket).every(Number.isFinite));
    }
  }
  rig.dispose();
});

function flight(fps){
  const camera=new T.PerspectiveCamera();camera.position.set(5,3,8);const trails=new GameProjectileTrails(new T.Group(),camera);
  const b={id:0,kind:'frost',owner:'player',x:0,y:1.4,z:0,yaw:0,color:'#71e4ff',radiance:2.4,scale:1.25,alive:true,age:0,delay:0};trails.begin(b);
  for(let i=1;i<=fps;i++){b.age=i/fps;b.x=Math.sin(b.age*1.3)*2;b.z=b.age*24;trails.update(1/fps,b.age,[b]);}
  return {trails,b};
}
test('Q trails have a physical length and width at 30 / 60 / 120 FPS and attach behind the model',()=>{
  for(const fps of [30,60,120]){
    const {trails,b}=flight(fps),pos=trails.positions;let far=0;
    const head=new T.Vector3((pos[0]+pos[3])*.5,(pos[1]+pos[4])*.5,(pos[2]+pos[5])*.5);
    assert.ok(head.distanceTo(new T.Vector3(b.x,b.y,b.z))>.5);assert.ok(head.z<b.z);
    for(let j=0;j<64;j++){const a=new T.Vector3().fromArray(pos,j*6),other=new T.Vector3().fromArray(pos,j*6+3);assert.ok(a.distanceTo(other)<.15);far=Math.max(far,head.distanceTo(a));}
    assert.ok(far>3&&far<3.3);assert.ok(pos.every(Number.isFinite));trails.dispose();
  }
});
test('impact drains the real tail into its contact, clears it and reuses buffers across camera reversals',()=>{
  const {trails,b}=flight(60),positions=trails.positions,history=trails.history;
  b.alive=false;b.retiredReason='hit';b.z+=.6;
  for(let i=0;i<20;i++){trails.camera.position.x=i%2?-5:5;trails.update(1/60,1+i/60,[b]);assert.ok(positions.every(Number.isFinite));}
  assert.equal(trails.count[0],0);assert.ok(trails.life.every(v=>v===0));assert.equal(trails.positions,positions);assert.equal(trails.history,history);
  b.alive=true;b.age=0;b.x=40;b.z=-30;trails.begin(b);trails.update(0,2,[b]);assert.ok(trails.positions.slice(0,6).every(Number.isFinite));assert.equal(trails.count[0],1);trails.dispose();
});
