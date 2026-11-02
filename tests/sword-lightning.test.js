import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BranchingLightning } from '../src/vfx/sword/BranchingLightning.js';
import { CrescentBlade } from '../src/vfx/sword/CrescentBlade.js';

function setup(size=1){
  const scene=new THREE.Scene(),config={bladeSize:size,energyColor:'#39dfff',lightningColor:'#9170ff'};
  const blade=new CrescentBlade(config);scene.add(blade.group);
  const lightning=new BranchingLightning(scene,config),upper=new THREE.Vector3(),lower=new THREE.Vector3();
  return{scene,config,blade,lightning,upper,lower,dispose(){blade.dispose();lightning.dispose();}};
}

function centers(lightning,matrix){
  const result=[],data=lightning.positions;
  // Each segment has two crossed quads. Opposite first-quad vertices recover
  // its centerline regardless of the ribbon's view-independent width.
  for(let i=0;i<lightning.geometry.drawRange.count;i+=12){
    for(const [a,b] of [[i,i+1],[i+2,i+4]]){
      result.push(new THREE.Vector3((data[a*3]+data[b*3])*.5,(data[a*3+1]+data[b*3+1])*.5,(data[a*3+2]+data[b*3+2])*.5).applyMatrix4(matrix));
    }
  }
  return result;
}

function surfaceDistance(point,geometry,triangle,closest){
  const positions=geometry.attributes.position,indices=geometry.index;let best=Infinity;
  for(let i=0;i<indices.count;i+=3){
    triangle.a.fromBufferAttribute(positions,indices.getX(i));triangle.b.fromBufferAttribute(positions,indices.getX(i+1));triangle.c.fromBufferAttribute(positions,indices.getX(i+2));
    triangle.closestPointToPoint(point,closest);
    const distance=point.distanceToSquared(closest);if(distance<best)best=distance;
  }
  return Math.sqrt(best);
}

test('flight lightning wraps around the convex crescent and reaches its forward face instead of bridging the empty notch',()=>{
  const v=setup(),{blade,lightning,upper,lower,config}=v;
  blade.group.position.set(.4,1.7,0);blade.update(1.05,{config});blade.getTipPositions(upper,lower);
  lightning.update(1.05,blade.group.position,.85,'flight',config,lower,upper);
  const points=centers(lightning,new THREE.Matrix4().copy(blade.content.matrixWorld).invert());
  assert.ok(points.length>60);assert.ok(Math.max(...points.map(p=>p.x))>.55);
  const middle=points.filter(p=>Math.abs(p.y)<.3);assert.ok(middle.length>5);
  assert.ok(middle.every(p=>p.x>.24),'central arcs must sit on the crescent body, not the tip-to-tip chord at X=-.827');
  assert.ok(lightning.tints.subarray(0,lightning.geometry.drawRange.count).every(tint=>tint>=.77));
  v.dispose();
});

test('primary arcs and their forks stay attached to the actual curved surface across rotation, size and launch stretch',()=>{
  const triangle=new THREE.Triangle(),closest=new THREE.Vector3();
  for(const [size,time,yaw,pitch,consume] of [[.5,.7,0,0,0],[1,1.05,.8,.15,0],[1.6,1.7,-.5,-.2,.9]]){
    const v=setup(size),{blade,lightning,upper,lower,config}=v;
    const position=new THREE.Vector3(.4,1.7,-.35),forward=new THREE.Vector3(1,0,0);
    blade.group.quaternion.setFromEuler(new THREE.Euler(0,yaw,pitch));forward.applyQuaternion(blade.group.quaternion);
    blade.group.position.copy(position).addScaledVector(forward,.7*size*consume);
    blade.update(time,{config,impact:consume});blade.getTipPositions(upper,lower);
    lightning.update(time,position,.85,'flight',config,lower,upper);
    const points=centers(lightning,new THREE.Matrix4().copy(blade.content.matrixWorld).invert());assert.ok(points.length>20);
    for(const point of points){
      // The shader displaces the real face by up to .018 m; the arc sits .009 m
      // above it to avoid intersection. This allowance includes both offsets.
      assert.ok(surfaceDistance(point,blade.geometry,triangle,closest)<.04,`arc detached at ${point.toArray()} (size ${size}, time ${time})`);
    }
    v.dispose();
  }
});

test('surface lightning keeps deterministic pulses, live colors, fixed buffers and complete reset',()=>{
  const v=setup(),{blade,lightning,upper,lower,config}=v;
  const positions=lightning.positions,points=lightning.boltPoints,attributes=lightning.attributes;
  const sample=time=>{blade.update(time,{config});blade.getTipPositions(upper,lower);lightning.update(time,blade.group.position,.85,'flight',config,lower,upper);};
  sample(1.05);const count=lightning.geometry.drawRange.count,first=positions.slice(0,count*3);
  for(let i=0;i<160;i++)sample(.65+i/120);
  sample(1.05);assert.equal(lightning.geometry.drawRange.count,count);assert.deepEqual(positions.slice(0,count*3),first);
  assert.equal(lightning.positions,positions);assert.equal(lightning.boltPoints,points);assert.equal(lightning.attributes,attributes);
  assert.ok(positions.every(Number.isFinite));assert.ok(count<=4096);
  config.energyColor='#4fe7c2';config.lightningColor='#ae72ff';sample(1.05);
  assert.equal(lightning.material.uniforms.uCyan.value.getHexString(),'4fe7c2');assert.equal(lightning.material.uniforms.uPurple.value.getHexString(),'ae72ff');
  lightning.update(1.05,blade.group.position,0,'flight',config,lower,upper);
  assert.equal(lightning.group.visible,false);assert.equal(lightning.geometry.drawRange.count,0);
  v.dispose();
});
