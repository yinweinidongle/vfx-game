import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { SwordFighter, SWORD_TIMING, swordClipTime } from '../src/scene/SwordFighter.js';
import { SwordWeapon } from '../src/scene/SwordWeapon.js';

async function createRig(){
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  globalThis.window={URL:{createObjectURL:()=>''}};
  globalThis.document={createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(value){}})};
  let root;
  try{
    const bytes=await readFile(new URL('../public/models/standing-melee-360.fbx',import.meta.url));
    root=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
  const fighter=Object.create(SwordFighter.prototype);
  const group=new THREE.Group(),wrapper=new THREE.Group();
  wrapper.position.set(-8.4,0,0);wrapper.rotation.y=Math.PI/2;group.add(wrapper);
  const weapon=new SwordWeapon({frostColor:'#58dfff'});group.add(weapon.group);
  Object.assign(fighter,{group,wrapper,weapon,disposed:false,root:null,mixer:null,hand:null,action:null,
    materials:[],time:0,phase:'charge',impactTime:SWORD_TIMING.releaseTime,lastPoseTime:NaN,status:{character:'loading',sword:'procedural'},
    palmOffset:new THREE.Vector3(0.35,7.3,2.45),tempPosition:new THREE.Vector3(),handQuaternion:new THREE.Quaternion(),
    gripAlignment:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2),
  });
  await fighter.loadCharacter({loadAsync:async()=>root},'fixture:standing-melee-360.fbx');
  assert.equal(fighter.status.character,'ready');
  return fighter;
}

test('sword clip remapping preserves continuous timing at the fast strike',()=>{
  const e=1e-6;
  assert.equal(swordClipTime(0),0);
  assert.ok(Math.abs(swordClipTime(.45)-.76)<1e-9);
  assert.ok(Math.abs(swordClipTime(.65)-1.075)<1e-9);
  for(const boundary of [.45,.65]){
    const left=(swordClipTime(boundary)-swordClipTime(boundary-e))/e;
    const right=(swordClipTime(boundary+e)-swordClipTime(boundary))/e;
    assert.ok(Math.abs(left-right)<.001,'clip speed is continuous at '+boundary);
  }
  let previous=-1;
  for(let t=0;t<=2;t+=.005){const value=swordClipTime(t);assert.ok(value>=previous);previous=value;}
  assert.equal(swordClipTime(2),swordClipTime(1.65));
  assert.ok(Math.abs(swordClipTime(SWORD_TIMING.releaseTime)-1.075)<1e-9);
});

test('actual swordsman FBX preserves textures and full hip rotation while removing horizontal drift',async()=>{
  const fighter=await createRig();
  try{
    assert.equal(fighter.materials.length,1);
    const material=fighter.materials[0];
    assert.ok(material.isMeshPhongMaterial&&material.map&&material.normalMap&&material.specularMap);
    assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);
    const original=fighter.root.animations.find(clip=>clip.duration>0);
    const rotationName='mixamorigHips.quaternion';
    assert.deepEqual(fighter.clip.tracks.find(t=>t.name===rotationName).values,original.tracks.find(t=>t.name===rotationName).values);
    const track=fighter.clip.tracks.find(t=>t.name==='mixamorigHips.position');
    let hasVerticalMotion=false;
    for(let i=3;i<track.values.length;i+=3){assert.equal(track.values[i],track.values[0]);assert.equal(track.values[i+2],track.values[2]);hasVerticalMotion||=Math.abs(track.values[i+1]-track.values[1])>.01;}
    assert.ok(hasVerticalMotion);
    fighter.setVisible(false);assert.equal(fighter.group.visible,false);
    fighter.setVisible(true);assert.equal(fighter.group.visible,true);
  }finally{fighter.dispose();}
});

test('arbitrary-time sword samples follow the real right hand and restore the visible pose exactly',async()=>{
  const fighter=await createRig();
  try{
    fighter.update(.32,'charge',SWORD_TIMING.releaseTime);
    const visiblePosition=fighter.weapon.group.position.clone(),visibleQuaternion=fighter.weapon.group.quaternion.clone();
    const base=new THREE.Vector3(),tip=new THREE.Vector3(),q=new THREE.Quaternion();
    const axis=new THREE.Vector3(),direction=new THREE.Vector3();
    for(const t of [0,.45,.55,.6075,.65,.95,1.65,.6075]){
      assert.equal(fighter.sampleSwordPose(t,base,tip,q),true);
      assert.ok(Math.abs(base.distanceTo(tip)-1.09)<1e-6);
      direction.subVectors(tip,base).normalize();axis.set(0,1,0).applyQuaternion(q);
      assert.ok(axis.dot(direction)>0.999999);
      assert.ok(fighter.weapon.group.position.distanceTo(visiblePosition)<1e-9);
      assert.ok(1-Math.abs(fighter.weapon.group.quaternion.dot(visibleQuaternion))<1e-9);
      assert.equal(fighter.time,.32);
      if(t===SWORD_TIMING.releaseTime)assert.ok(direction.x>.9,'blade points forward during the strike');
    }
  }finally{fighter.dispose();}
});
