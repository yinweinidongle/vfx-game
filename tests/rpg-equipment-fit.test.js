import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as T from 'three';import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {GameGearAppearance} from '../src/game/GameGearAppearance.js';import {GameState} from '../src/game/GameState.js';import {CLASSES} from '../src/game/GameData.js';
async function sources(){const templates={},io=new NodeIO().registerExtensions(ALL_EXTENSIONS);for(const slot of ['armor','boots','wings','cloak','weapon']){const doc=await io.read(`public/game/models/equipment/${slot}-v1.glb`),group=new T.Group();let triangles=0;for(const node of doc.getRoot().listNodes())if(node.getMesh())for(const p of node.getMesh().listPrimitives()){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(p.getAttribute('POSITION').getArray(),3));if(p.getIndices())geo.setIndex(new T.BufferAttribute(p.getIndices().getArray(),1));triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;geo.applyMatrix4(new T.Matrix4().fromArray(node.getWorldMatrix()));group.add(new T.Mesh(geo,new T.MeshStandardMaterial()));}assert.ok(triangles<=11000);templates[slot]=group;}return templates;}

test('generated equipment fits all three real FBX skeletons and follows idle/run/attack without drifting or scaling with the FBX units',async()=>{
 const templates=await sources();
 for(const kind of Object.keys(CLASSES)){
  const w=globalThis.window,d=globalThis.document;globalThis.window={URL:{createObjectURL:()=>''}};globalThis.document={createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(v){}})};let model;
  try{const bytes=await readFile(`public/models/${CLASSES[kind].model}.fbx`);model=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}finally{globalThis.window=w;globalThis.document=d;}
  const bounds=new T.Box3().setFromObject(model),scale=2.1/(bounds.max.y-bounds.min.y),group=new T.Group(),pivot=new T.Group();model.scale.setScalar(scale);model.position.y=-bounds.min.y*scale;pivot.add(model);group.add(pivot);
  const state=new GameState(kind),view={model,group,pivot,sourceScale:scale};for(const slot of Object.keys(templates)){const item=state.gear.grant({slot,level:40,rarity:2,enhance:20},false);state.gear.equip(item.uid);}
  const gear=new GameGearAppearance(view,state,templates),mixer=new T.AnimationMixer(model),motion=JSON.parse(await readFile(`public/game/models/${kind}-motion.json`,'utf8')).map(c=>T.AnimationClip.parse(c));
  const box=new T.Box3(),center=new T.Vector3(),bone=new T.Vector3();
  for(const clip of [...motion,model.animations[0]]){mixer.stopAllAction();mixer.clipAction(clip).play();for(const time of [.02,.2,.5,.9]){group.position.set(10,2,-12);group.rotation.y=time*2;mixer.setTime(time);state.time=time;gear.update();group.updateMatrixWorld(true);assert.equal(gear.parts.length,kind==='ice'?5:6);
    for(const p of gear.parts){assert.ok(p.carrier.matrix.elements.every(Number.isFinite));box.setFromObject(p.carrier);box.getCenter(center);p.binding.bone.getWorldPosition(bone);assert.ok(center.distanceTo(bone)<1.35,`${kind}/${clip.name}/${p.slot}: drifting gear`);const size=box.getSize(new T.Vector3());assert.ok(Math.max(...size)<3.7,`${kind}/${p.slot}: FBX unit mismatch`);if(p.slot==='boots')assert.ok(center.distanceTo(bone)<.22,`${kind}: boot left the animated foot`);}
  }}
  const oldParts=gear.parts.slice();state.gear.unequip('wings');gear.update();assert.equal(gear.parts.length,kind==='ice'?4:5);assert.ok(oldParts.every(p=>!p.carrier.parent));gear.dispose();assert.equal(gear.parts.length,0);
 }
});
