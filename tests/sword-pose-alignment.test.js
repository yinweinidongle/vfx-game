import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { SwordFighter, SWORD_TIMING } from '../src/scene/SwordFighter.js';
import { SwordWeapon } from '../src/scene/SwordWeapon.js';
import { SwordSlashSkill } from '../src/vfx/sword/SwordSlashSkill.js';

async function createRig() {
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  globalThis.window={URL:{createObjectURL:()=>''}};
  globalThis.document={createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(value){}})};
  let root;
  try {
    const bytes=await readFile(new URL('../public/models/standing-melee-360.fbx',import.meta.url));
    root=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  } finally {globalThis.window=oldWindow;globalThis.document=oldDocument;}
  const fighter=Object.create(SwordFighter.prototype),group=new THREE.Group(),wrapper=new THREE.Group();
  wrapper.position.set(-8.4,0,0);wrapper.rotation.y=Math.PI/2;group.add(wrapper);
  const weapon=new SwordWeapon({frostColor:'#58dfff'});group.add(weapon.group);
  Object.assign(fighter,{group,wrapper,weapon,disposed:false,root:null,mixer:null,hand:null,action:null,
    materials:[],time:0,phase:'charge',impactTime:SWORD_TIMING.releaseTime,lastPoseTime:NaN,status:{character:'loading',sword:'procedural'},
    palmOffset:new THREE.Vector3(.35,7.3,2.45),tempPosition:new THREE.Vector3(),handQuaternion:new THREE.Quaternion(),
    gripAlignment:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2),
  });
  await fighter.loadCharacter({loadAsync:async()=>root},'fixture:standing-melee-360.fbx');
  return fighter;
}

function setup(fighter) {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1.5,.1,100);
  const config={autoLoop:false,playbackSpeed:1,flightSpeed:18,bladeSize:1,particleDensity:1,shardCount:42,
    trailLength:5.5,impactRadius:1.6,energyColor:'#39dfff',lightningColor:'#9170ff',hitStop:false};
  const skill=new SwordSlashSkill(scene,camera,config);skill.bindFighter(fighter);skill.timeline.playing=false;
  return {scene,skill,config};
}

test('crescent follows the real FBX swing and leaves its forward-facing release pose continuously',async t=>{
  const fighter=await createRig(),{scene,skill,config}=setup(fighter);
  const base=new THREE.Vector3(),tip=new THREE.Vector3(),direction=new THREE.Vector3(),point=new THREE.Vector3();
  try {
    await t.test('formation tracks actual tip and blade axis in the horizontal swing plane',()=>{
      fighter.sampleSwordPose(.65,base,tip);
      assert.ok(skill.origin.distanceTo(tip)<1e-6,'launch must use the actual socket rather than XYZ clamps');
      assert.ok(skill.origin.y<1.45&&skill.origin.z>.45); assert.ok(skill.releasePlaneNormal.y>.97);
      for(const time of [.46,.50,.55,.60,.64]) {
        skill.seek(time);fighter.sampleSwordPose(time,base,tip);
        assert.ok(skill.position.distanceTo(tip)<1e-6);
        direction.subVectors(tip,base).normalize();assert.ok(skill.slashForward.dot(direction)>.999999);
        assert.ok(skill.slashNormal.y>.95,'the physical 360 swing is nearly horizontal');
        const contentNormal=new THREE.Vector3(0,0,1).transformDirection(skill.blade.content.matrixWorld);
        assert.ok(contentNormal.dot(skill.slashNormal)>.999999,'intrinsic25-degree tilt must be canceled exactly');
        let minimum=Infinity;
        const vertices=skill.blade.geometry.attributes.position;
        for(let i=0;i<vertices.count;i++){point.fromBufferAttribute(vertices,i).applyMatrix4(skill.blade.content.matrixWorld);minimum=Math.min(minimum,point.y);}
        assert.ok(minimum>.06,'actual alignment must keep the crescent above the floor');
      }
    });
    await t.test('release has no position or orientation snap and preserves roll during forward settling',()=>{
      skill.seek(.65-1e-5);const position=skill.position.clone(),orientation=skill.slashOrientation.clone();
      skill.seek(.65+1e-5);
      assert.ok(position.distanceTo(skill.position)<.003);assert.ok(orientation.angleTo(skill.slashOrientation)<.003);
      assert.ok(skill.slashForward.dot(skill.direction)>.98,'retimed sword already points toward the target at launch');
      skill.seek(.65+(skill.timeline.impactTime-.65)*.25);
      assert.ok(skill.slashForward.dot(skill.direction)>.999999);assert.ok(skill.slashNormal.y>.97);
      assert.ok(skill.slashNormal.dot(skill.releasePlaneNormal)>.98);
      assert.equal(skill.lightning.surfaceProvider,skill.blade);
    });
    await t.test('early-flight retiming and repeated seeks retain the sampled frame and trail orientation',()=>{
      skill.seek(.65+(skill.timeline.impactTime-.65)*.08);
      const orientation=skill.slashOrientation.clone(),position=skill.position.clone(),progress=skill.timeline.progress;
      config.flightSpeed=35;skill.update(0,0);
      assert.ok(Math.abs(skill.timeline.progress-progress)<1e-9);assert.ok(position.distanceTo(skill.position)<1e-8);
      assert.ok(orientation.angleTo(skill.slashOrientation)<1e-7);
      const time=skill.timeline.time,matrix=skill.blade.content.matrixWorld.elements.slice(),history=skill.trail.history.slice();
      skill.seek(.2);skill.seek(time);
      assert.deepEqual(skill.blade.content.matrixWorld.elements,matrix);assert.deepEqual(skill.trail.history,history);
      assert.ok(skill.trail.orientation.angleTo(skill.orientation)<1e-7);
      skill.seek(skill.timeline.duration);assert.equal(skill.blade.group.visible,false);assert.equal(skill.trail.count,0);
    });
  } finally {skill.dispose();fighter.dispose();assert.equal(scene.children.length,0);}
});
