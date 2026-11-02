import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CrescentBlade, createCrescentGeometry } from '../src/vfx/sword/CrescentBlade.js';
import { SwordTrail } from '../src/vfx/sword/SwordTrail.js';

const config={bladeSize:1,arrowSize:.52,energyColor:'#39dfff',lightningColor:'#9170ff',trailLength:5.5};
const close=(a,b,eps=1e-5)=>assert.ok(Math.abs(a-b)<eps,`${a} ≈ ${b}`);
function camera(){const c=new THREE.PerspectiveCamera(40,1.5,.1,100);c.position.set(3,4,9);return c;}
function wakePoint(trail,row,column=Math.floor(trail.crossCount/2),face=0){return new THREE.Vector3().fromArray(trail.positions,((face*trail.sampleCapacity+row)*trail.crossCount+column)*3);}

test('crescent is a thick closed volume with a curved leading edge and a narrow cutting face',()=>{
  const geometry=createCrescentGeometry(),p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  const bounds=geometry.boundingBox;close(bounds.max.y-bounds.min.y,3.6);
  assert.ok(bounds.max.z>.08&&bounds.min.z<-.08,'two distinct lenticular surfaces');
  assert.ok(bounds.max.x>.7&&bounds.min.x<-.8,'tips trail the convex center by over 1.5 metres');
  let centerMin=Infinity,centerMax=-Infinity;
  for(let i=0;i<p.count;i++){
    assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)+n.getX(i)+n.getY(i)+n.getZ(i)));
    if(Math.abs(uv.getX(i)-.5)<.0001){centerMin=Math.min(centerMin,p.getX(i));centerMax=Math.max(centerMax,p.getX(i));}
  }
  close(centerMax-centerMin,.654);
  const incidence=new Map(),index=geometry.index.array;
  for(let i=0;i<index.length;i+=3)for(let e=0;e<3;e++){
    const a=index[i+e],b=index[i+(e+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;
    incidence.set(key,(incidence.get(key)??0)+1);
  }
  assert.ok([...incidence.values()].every(count=>count===2),'every indexed edge belongs to two faces');
  geometry.dispose();
});

test('blade size is independent from ice-arrow size and tip outputs honor the authored depth tilt',()=>{
  const blade=new CrescentBlade(config),upper=new THREE.Vector3(),lower=new THREE.Vector3();
  blade.group.position.set(4,2,-1);blade.update(1,{formation:1,config});blade.getTipPositions(upper,lower);
  close(upper.distanceTo(lower),3.6);assert.ok(upper.z-lower.z>1.5);
  const originalUpper=upper.clone(),originalLower=lower.clone();
  blade.update(1,{formation:1,config:{...config,bladeSize:1.4}});blade.getTipPositions(upper,lower);
  close(upper.distanceTo(lower),5.04);assert.ok(upper.distanceTo(originalUpper)>.6);
  blade.update(1,{formation:1,config});blade.getTipPositions(upper,lower);
  assert.deepEqual(upper.toArray(),originalUpper.toArray());assert.deepEqual(lower.toArray(),originalLower.toArray());
  blade.update(.44,{formation:0,config});assert.equal(blade.uniforms.uFormation.value,0);
  blade.update(1.6,{formation:1,impact:1,config});assert.equal(blade.uniforms.uImpact.value,1);
  blade.dispose();blade.dispose();
});

test('blade retains procedural flow when an unavailable texture fails to load',async()=>{
  const blade=new CrescentBlade(config),fallback=blade.flowTexture;
  assert.equal(await blade.loadFlowTexture('/missing-image.png'),false);
  assert.equal(blade.flowTexture,fallback);assert.equal(blade.uniforms.uHasTexture.value,0);
  blade.dispose();
});

test('sword wake resamples curved motion and reuses all GPU buffers across replays',()=>{
  const scene=new THREE.Scene(),trail=new SwordTrail(scene,config),view=camera(),position=new THREE.Vector3(),direction=new THREE.Vector3(1,0,0);
  const history=trail.history,orientationHistory=trail.orientationHistory,arrays=trail.layers.map(layer=>[layer.positions,layer.uvs,layer.life,layer.geometry.index.array]);
  for(let cycle=0;cycle<3;cycle++){
    trail.reset();
    for(let i=0;i<90;i++){
      position.set(i*.20,1.7+Math.sin(i*.08)*.2,.07*Math.cos(i*.1));
      trail.update(1/60,.65+i/60,position,true,view,config,direction);
    }
    assert.ok(trail.count>100&&trail.count<=384);assert.equal(trail.history,history);assert.equal(trail.orientationHistory,orientationHistory);
    const k=trail.head*4;close(trail.history[k],position.x);close(trail.history[k+1],position.y);close(trail.history[k+2],position.z);
    for(let i=0;i<trail.layers.length;i++){
      const layer=trail.layers[i];assert.ok(layer.geometry.drawRange.count>0);
      assert.equal(layer.positions,arrays[i][0]);assert.equal(layer.uvs,arrays[i][1]);assert.equal(layer.life,arrays[i][2]);assert.equal(layer.geometry.index.array,arrays[i][3]);
      assert.ok(layer.positions.every(Number.isFinite));
    }
    for(let i=0;i<65;i++)trail.update(1/60,2.2+i/60,position,false,view,config,direction);
    assert.ok(trail.layers.every(layer=>layer.geometry.drawRange.count===0),'unemitted histories expire');
  }
  trail.dispose();assert.equal(scene.children.length,0);
});

test('unified wake head follows the real crescent rear profile after size and direction changes',()=>{
  const view=camera(),profile=createCrescentGeometry({segments:24,bands:1,vMin:.03});
  const blade=new CrescentBlade(config),expected=new THREE.Vector3();
  for(const size of [.5,1,1.6])for(const direction of [new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)]){
    const current={...config,bladeSize:size},trail=new SwordTrail(new THREE.Scene(),current),position=new THREE.Vector3(-1,1.7,.3);
    trail.update(.016,1,position,true,view,current,direction);position.addScaledVector(direction,.7);
    trail.update(.016,1.016,position,true,view,current,direction);
    blade.group.position.copy(position);blade.group.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),direction);blade.update(1.016,{config:current});blade.group.updateMatrixWorld(true);
    assert.equal(trail.layers.length,1);assert.equal(trail.group.children.length,1,'no separate core or tip rails');assert.equal(trail.crossCount,25);
    for(let column=0;column<trail.crossCount;column++){
      expected.fromBufferAttribute(profile.attributes.position,column*2).applyMatrix4(blade.content.matrixWorld);
      assert.ok(wakePoint(trail,0,column).distanceTo(expected)<2e-6,'all 25 seam points follow the authored rear edge');
    }
    trail.dispose();
  }
  profile.dispose();blade.dispose();
});

test('unified history loft is connected, has thickness, and contracts into one endpoint',()=>{
  const trail=new SwordTrail(new THREE.Scene(),config),view=camera(),position=new THREE.Vector3();
  for(let i=0;i<45;i++){position.set(i*.15,1.7,Math.sin(i*.05)*.10);trail.update(1/60,1+i/60,position,true,view,config);}
  const headSpan=wakePoint(trail,0,0).distanceTo(wakePoint(trail,0,24));
  let middle=0;
  while(middle<trail.sampleCount-1&&trail.uvs[middle*trail.crossCount*2]<.5)middle++;
  const middleSpan=wakePoint(trail,middle,0).distanceTo(wakePoint(trail,middle,24));
  assert.ok(middleSpan<headSpan*.35,'width contracts promptly, avoiding a rectangular curtain');
  assert.ok(wakePoint(trail,middle,12,0).distanceTo(wakePoint(trail,middle,12,1))>.01,'front/back form a shallow volume');
  const tail=trail.sampleCount-1,end=wakePoint(trail,tail,0);
  for(let column=0;column<25;column++)for(let face=0;face<2;face++)assert.ok(wakePoint(trail,tail,column,face).distanceTo(end)<1e-6,'one shared endpoint');
  const adjacency=new Map(),indices=trail.geometry.index.array;
  for(let i=0;i<trail.geometry.drawRange.count;i+=3){
    for(let j=0;j<3;j++){
      const a=indices[i+j],b=indices[i+(j+1)%3];
      if(!adjacency.has(a))adjacency.set(a,new Set());if(!adjacency.has(b))adjacency.set(b,new Set());adjacency.get(a).add(b);adjacency.get(b).add(a);
    }
  }
  const seen=new Set([indices[0]]),pending=[indices[0]];
  while(pending.length){for(const next of adjacency.get(pending.pop()))if(!seen.has(next)){seen.add(next);pending.push(next);}}
  assert.equal(seen.size,adjacency.size,'all live triangles belong to a single connected component');
  trail.dispose();
});

test('unified impact wake bridges to contact and drains fully within 340 milliseconds',()=>{
  const trail=new SwordTrail(new THREE.Scene(),config),view=camera(),position=new THREE.Vector3(),target=new THREE.Vector3(3,1.7,0);
  for(let i=0;i<20;i++){position.set(i*.15,1.7,0);trail.update(1/60,.65+i/60,position,true,view,config);}
  const countBefore=trail.count;trail.impact(target,1.4);assert.ok(trail.count>countBefore,'bridge is resampled to contact');
  trail.update(0,1.4,position,false,view,config);assert.ok(wakePoint(trail,0).distanceTo(target)<1e-5);
  const last=trail.sampleCount-1,initialTail=wakePoint(trail,last).distanceTo(target);
  trail.update(.17,1.57,position,false,view,config);
  assert.ok(wakePoint(trail,0).distanceTo(target)<1e-5);assert.ok(wakePoint(trail,last).distanceTo(target)<initialTail*.51);
  trail.update(.18,1.75,position,false,view,config);assert.equal(trail.count,0);assert.equal(trail.geometry.drawRange.count,0);
  trail.dispose();
});

test('paused view refresh neither appends history nor changes the physical wake volume',()=>{
  const trail=new SwordTrail(new THREE.Scene(),config),view=camera(),position=new THREE.Vector3();
  for(let i=0;i<30;i++){position.set(i*.15,1.7,0);trail.update(1/60,1+i/60,position,true,view,config);}
  const time=1+29/60,history=trail.history.slice(),positions=trail.positions.slice(),count=trail.count,age=trail.age;
  view.position.set(-3,3,-6);trail.update(0,time,position,false,view,config);
  assert.equal(trail.count,count);assert.equal(trail.age,age);assert.deepEqual(trail.history,history);assert.deepEqual(trail.positions,positions);
  trail.dispose();
});

function paintedProfile(count=25){
  const profile=new Float32Array(count*3),tilt=25*Math.PI/180;
  for(let i=0;i<count;i++){
    const u=i/(count-1),y=(u-.5)*3.6+.12,z=.025*Math.sin(u*Math.PI);
    profile[i*3]=-.62-1.85*Math.pow(Math.abs(u-.43)*1.8,1.3);
    profile[i*3+1]=y*Math.cos(tilt)-z*Math.sin(tilt);
    profile[i*3+2]=y*Math.sin(tilt)+z*Math.cos(tilt);
  }
  return profile;
}

test('painted group-local profile welds without double tilt and matches three-dimensional flight orientation',()=>{
  const trail=new SwordTrail(new THREE.Scene(),config),profile=paintedProfile(),view=camera();
  const history=trail.history,positions=trail.positions,profileBuffer=trail.headProfile;
  const direction=new THREE.Vector3(1,.23,-.31).normalize(),rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),direction);
  const position=new THREE.Vector3(-2,1.8,.4),size=.83,current={...config,bladeSize:size};
  trail.setProfile(profile,{launchStretch:true});
  assert.equal(trail.history,history);assert.equal(trail.positions,positions);assert.equal(trail.headProfile,profileBuffer);
  trail.update(.02,1,position,true,view,current,direction);position.addScaledVector(direction,.8);trail.update(.02,1.02,position,true,view,current,direction);
  for(let i=0;i<25;i++){
    const expected=new THREE.Vector3().fromArray(profile,i*3).multiplyScalar(size).applyQuaternion(rotation).add(position);
    assert.ok(wakePoint(trail,0,i).distanceTo(expected)<2e-6,'profile carries exactly one intrinsic tilt');
  }
  const expectedMin=Math.min(...Array.from({length:25},(_,i)=>profile[i*3]));close(trail.tailOffset,expectedMin);
  // Each section feeds backward from its own seam: the wide new texture cannot
  // make the single endpoint fold forward across the moon's negative space.
  for(let column=0;column<25;column++)for(let row=1;row<trail.sampleCount;row++){
    const travel=wakePoint(trail,row,column).sub(wakePoint(trail,row-1,column)).dot(direction);
    assert.ok(travel<1e-5,'wake extends backward monotonically');
  }
  trail.dispose();
});

test('painted profile preserves launch deformation and its offset contact point during drain',()=>{
  const trail=new SwordTrail(new THREE.Scene(),config),profile=paintedProfile(),view=camera(),position=new THREE.Vector3(),target=new THREE.Vector3(3,1.8,.25);
  trail.setProfile(profile,{launchStretch:true});trail.update(.016,.67,position,true,view,config);position.x=.4;trail.update(.016,.70,position,true,view,config);
  const launch=Math.exp(-(.70-.65)*21)*THREE.MathUtils.smoothstep(.70,.65,.666),tilt=25*Math.PI/180;
  for(let i=0;i<25;i++){
    const expected=new THREE.Vector3().fromArray(profile,i*3).applyAxisAngle(new THREE.Vector3(1,0,0),-tilt);
    expected.multiply(new THREE.Vector3(1+launch*.22,1-launch*.045,1)).applyAxisAngle(new THREE.Vector3(1,0,0),tilt).add(position);
    assert.ok(wakePoint(trail,0,i).distanceTo(expected)<2e-6,'static profile gets the same launch-only scale');
  }
  trail.impact(target,1.4);trail.update(0,1.4,position,false,view,config);
  assert.ok(wakePoint(trail,0).distanceTo(target)<2e-6,'non-centered painted profile is compensated at contact');
  trail.update(.17,1.57,position,false,view,config);assert.ok(wakePoint(trail,0).distanceTo(target)<2e-6);
  trail.update(.18,1.75,position,false,view,config);assert.equal(trail.geometry.drawRange.count,0);trail.dispose();
});

test('profile updates validate before mutation, resample into existing storage, and copy their source',()=>{
  const trail=new SwordTrail(new THREE.Scene(),config),buffer=trail.headProfile,source=paintedProfile(13);
  trail.setProfile(source,{launchStretch:false});assert.equal(trail.headProfile,buffer);assert.equal(trail.launchStretch,false);
  const expected=trail.headProfile.slice();source.fill(0);assert.deepEqual(trail.headProfile,expected,'caller can reuse its temporary array');
  assert.throws(()=>trail.setProfile([0,0,0,NaN,1,0]),/finite/);
  assert.throws(()=>trail.setProfile([0,0,0,1,0,0]),/span/);
  assert.deepEqual(trail.headProfile,expected,'invalid profiles leave the prior weld intact');trail.dispose();
});

test('painted wake welds to the exact group pose, including horizontal swing roll and launch stretch',()=>{
  const trail=new SwordTrail(new THREE.Scene(),config),profile=paintedProfile(),view=camera();
  const direction=new THREE.Vector3(1,.12,-.2).normalize(),position=new THREE.Vector3(-2,1.9,.4);
  const tilt=25*Math.PI/180,xAxis=new THREE.Vector3(1,0,0);
  const orientation=new THREE.Quaternion().setFromUnitVectors(xAxis,direction)
    .multiply(new THREE.Quaternion().setFromAxisAngle(xAxis,Math.PI/2-tilt));
  trail.setProfile(profile);
  trail.update(.016,.67,position,true,view,config,direction,orientation);
  position.addScaledVector(direction,.4);trail.update(.016,.70,position,true,view,config,direction,orientation);
  const launch=Math.exp(-(.70-.65)*21)*THREE.MathUtils.smoothstep(.70,.65,.666);
  for(let column=0;column<25;column++){
    const expected=new THREE.Vector3().fromArray(profile,column*3).applyAxisAngle(xAxis,-tilt)
      .multiply(new THREE.Vector3(1+launch*.22,1-launch*.045,1)).applyAxisAngle(xAxis,tilt)
      .applyQuaternion(orientation).add(position);
    assert.ok(wakePoint(trail,0,column).distanceTo(expected)<2e-6,'tilted local profile gets precisely the actor-derived group transform');
  }
  const target=new THREE.Vector3(3,1.8,.25);
  const contactOrientation=orientation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(xAxis,.12));
  trail.impact(target,1.4,contactOrientation);trail.update(0,1.4,position,false,view,config,direction,contactOrientation);
  assert.ok(wakePoint(trail,0).distanceTo(target)<2e-6,'contact compensation uses the same rolled pose');
  trail.update(.17,1.57,position,false,view,config,direction,contactOrientation);
  assert.ok(wakePoint(trail,0).distanceTo(target)<2e-6);
  trail.dispose();
});

test('resampled wake retains historical swing orientations while the live blade settles',()=>{
  const trail=new SwordTrail(new THREE.Scene(),config),view=camera(),position=new THREE.Vector3(),direction=new THREE.Vector3(1,0,0);
  const xAxis=new THREE.Vector3(1,0,0),start=new THREE.Quaternion().setFromAxisAngle(xAxis,-.4);
  const end=new THREE.Quaternion().setFromAxisAngle(xAxis,1.1),expected=new THREE.Quaternion(),actual=new THREE.Quaternion();
  trail.update(.02,1,position,true,view,config,direction,start);
  position.x=.75;trail.update(.02,1.02,position,true,view,config,direction,end);
  for(let i=0;i<trail.count;i++){
    const fraction=trail.history[i*4]/.75;
    expected.slerpQuaternions(start,end,fraction);actual.fromArray(trail.orientationHistory,i*4).normalize();
    assert.ok(Math.abs(actual.dot(expected))>1-1e-12,'rotation interpolation follows each position sample');
  }
  const oldCount=trail.count,oldRotations=trail.orientationHistory.slice(0,oldCount*4);
  const next=new THREE.Quaternion().setFromAxisAngle(xAxis,.3);
  position.x=1.05;trail.update(.02,1.04,position,true,view,config,direction,next);
  assert.deepEqual(trail.orientationHistory.subarray(0,oldCount*4),oldRotations,'new poses never rotate existing history');
  for(let row=0;row<trail.sampleCount-1;row++){
    const q=new THREE.Quaternion().fromArray(trail.orientationHistory,trail.rows[row]*4).normalize();
    const expectedAxis=trail.profileAxis.clone().applyQuaternion(q);
    const span=wakePoint(trail,row,24).sub(wakePoint(trail,row,0)).normalize();
    assert.ok(span.dot(expectedAxis)>.99999,'each cross-section keeps its recorded swing plane');
  }
  const history=trail.history.slice(),rotations=trail.orientationHistory.slice(),geometry=trail.positions.slice(),count=trail.count;
  trail.update(0,1.04,position,false,view,config,direction,next);
  assert.equal(trail.count,count);assert.deepEqual(trail.history,history);assert.deepEqual(trail.orientationHistory,rotations);assert.deepEqual(trail.positions,geometry);
  trail.dispose();
});
