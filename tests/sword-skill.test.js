import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwordSlashSkill } from '../src/vfx/sword/SwordSlashSkill.js';

function setup(overrides={}) {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1.5,.1,100);
  camera.position.set(1,6,20);camera.lookAt(0,1,0);camera.updateMatrixWorld();
  const config={autoLoop:false,playbackSpeed:1,flightSpeed:18,bladeSize:1,particleDensity:1,shardCount:42,trailLength:5.5,impactRadius:1.6,energyColor:'#39dfff',lightningColor:'#9170ff',hitStop:true,...overrides};
  return {scene,camera,config,skill:new SwordSlashSkill(scene,camera,config)};
}
function extinct(skill){
  assert.equal(skill.blade.group.visible,false);assert.equal(skill.light.intensity,0);assert.equal(skill.aura.mesh.visible,false);
  assert.equal(skill.lightning.group.visible,false);assert.equal(skill.impact.group.visible,false);assert.equal(skill.impact.light.intensity,0);
  assert.ok(skill.trail.layers.every(layer=>layer.geometry.drawRange.count===0));assert.equal(skill.trail.count,0);
  assert.ok(skill.particles.lives.every(x=>x===0));assert.ok(skill.particles.opacities.every(x=>x===0));assert.ok(skill.particles.fragments.every(x=>x.life===0));
  assert.ok(skill.impact.shardFades.every(x=>x===0));
}
function resources(scene){const objects=[],geometries=[],materials=[];scene.traverse(object=>{objects.push(object);if(object.geometry)geometries.push(object.geometry);if(object.material)materials.push(object.material);});return{objects,geometries,materials};}

test('full sword cast ends near2.5 seconds and clears every VFX layer after hit-stop',()=>{
  const {scene,skill}=setup();skill.fire();let frames=0;
  while(skill.timeline.phase!=='idle'&&frames++<240)skill.update(1/60,1/60);
  assert.equal(skill.timeline.phase,'idle');assert.ok(skill.timeline.duration>2.4&&skill.timeline.duration<2.6);
  assert.equal(skill.timeline.time,skill.timeline.duration);assert.equal(skill.hit,true);assert.equal(skill.launched,true);assert.equal(skill.hitStopRemaining,0);extinct(skill);
  skill.dispose();skill.dispose();assert.equal(scene.children.length,0);
});

test('flight edge particles receive current crescent tips rather than the prior frame pose',()=>{
  const {skill}=setup({hitStop:false});skill.seek(.69);
  const original=skill.particles.update,upper=new THREE.Vector3(),lower=new THREE.Vector3();let checked=0;
  skill.particles.update=function(dt,time,position,phase,config,base,tip){
    if(phase==='flight'){
      assert.ok(skill.blade.group.position.distanceTo(position)<1e-9);
      assert.ok(Math.abs(skill.blade.uniforms.uTime.value-time)<1e-9);
      skill.blade.getTipPositions(upper,lower);assert.ok(base.distanceTo(lower)<1e-9);assert.ok(tip.distanceTo(upper)<1e-9);checked++;
    }
    return original.call(this,dt,time,position,phase,config,base,tip);
  };
  skill.update(.04,.04);assert.ok(checked>=4);skill.dispose();
});

test('50ms hit-stop consumes wall time and releases the unused fraction of the last frame at any playback speed',()=>{
  for(const playbackSpeed of [.25,1,2]){
    const {skill}=setup({playbackSpeed});skill.seek(skill.timeline.impactTime-.0001);skill.update(.01,.01);
    assert.equal(skill.hit,true);assert.equal(skill.hitStopRemaining,.05);const frozenTime=skill.timeline.time;
    skill.update(.02,.02);assert.equal(skill.timeline.time,frozenTime);
    skill.update(.02,.02);assert.equal(skill.timeline.time,frozenTime);
    skill.update(.02,.02);assert.equal(skill.hitStopRemaining,0);
    assert.ok(Math.abs(skill.timeline.time-frozenTime-.01*playbackSpeed)<1e-9);
    skill.dispose();
  }
});

test('seeking past impact is deterministic, preserves pause state, and never queues a stray hit-stop',()=>{
  const {skill}=setup();const at=skill.timeline.impactTime+.17;skill.timeline.playing=false;skill.seek(at);
  assert.equal(skill.timeline.playing,false);assert.equal(skill.hitStopRemaining,0);assert.equal(skill.impact.active,true);
  const fragments=skill.impact.shards.instanceMatrix.array.slice(),particles=skill.particles.positions.slice(),ribbons=skill.trail.layers.map(layer=>layer.positions.slice());
  skill.seek(.2);skill.seek(at);assert.equal(skill.hitStopRemaining,0);assert.equal(skill.timeline.playing,false);
  assert.deepEqual(skill.impact.shards.instanceMatrix.array,fragments);assert.deepEqual(skill.particles.positions,particles);
  for(let i=0;i<ribbons.length;i++)assert.deepEqual(skill.trail.layers[i].positions,ribbons[i]);
  skill.seek(skill.timeline.duration);extinct(skill);skill.dispose();
});

test('live speed and blade size retime flight progress and preserve the aftermath age',()=>{
  const {skill,config}=setup();skill.seek(.65+(skill.timeline.impactTime-.65)*.43);skill.timeline.playing=false;
  const progress=skill.timeline.progress,position=skill.position.clone();config.flightSpeed=35;skill.update(0,0);
  assert.ok(Math.abs(skill.timeline.progress-progress)<1e-8);assert.ok(skill.position.distanceTo(position)<1e-8);
  config.bladeSize=1.6;skill.update(0,0);assert.ok(Math.abs(skill.timeline.progress-progress)<1e-8);
  const expected=skill.origin.clone().lerp(skill.flightEnd,progress);assert.ok(skill.position.distanceTo(expected)<1e-8);assert.equal(skill.blade.group.scale.x,1.6);
  skill.seek(skill.timeline.impactTime+.18);config.flightSpeed=10;config.bladeSize=.7;skill.update(0,0);
  assert.ok(Math.abs(skill.timeline.time-skill.timeline.impactTime-.18)<1e-8);assert.ok(Math.abs(skill.impact.age-.18)<1/120+.00001);assert.equal(skill.hitStopRemaining,0);
  config.energyColor='#9170ff';skill.update(0,0);assert.equal(skill.impact.shardMaterial.uniforms.uCyan.value.getHexString(),'9170ff');skill.dispose();
});

test('switching away clears the skill and switching back reconstructs the paused aftermath',()=>{
  const {skill}=setup();skill.timeline.playing=false;const at=skill.timeline.impactTime+.15;skill.seek(at);
  assert.equal(skill.impact.active,true);assert.ok(skill.trail.layers.some(layer=>layer.geometry.drawRange.count>0));
  skill.setActive(false);extinct(skill);assert.equal(skill.root.visible,false);const time=skill.timeline.time;
  skill.update(1,1);assert.equal(skill.timeline.time,time);
  skill.setActive(true);skill.update(0,0);assert.equal(skill.root.visible,true);assert.equal(skill.timeline.time,time);assert.equal(skill.impact.active,true);
  assert.ok(skill.trail.layers.some(layer=>layer.geometry.drawRange.count>0));assert.equal(skill.hitStopRemaining,0);skill.dispose();
});

test('twenty sword restarts retain scene resources and all pooled buffers at extreme settings',()=>{
  const {scene,skill,config}=setup({particleDensity:2,shardCount:90,trailLength:12});
  const initial=resources(scene),particleBuffer=skill.particles.positions,shardBuffer=skill.impact.shards.instanceMatrix.array,trailBuffer=skill.trail.history;
  for(let cycle=0;cycle<20;cycle++){
    config.flightSpeed=cycle%2?35:10;config.bladeSize=cycle%2?.7:1.6;skill.fire();let frames=0;
    while(skill.timeline.phase!=='idle'&&frames++<70)skill.update(.1,.1);
    assert.equal(skill.timeline.phase,'idle');extinct(skill);assert.deepEqual(resources(scene),initial);
    assert.equal(skill.particles.positions,particleBuffer);assert.equal(skill.impact.shards.instanceMatrix.array,shardBuffer);assert.equal(skill.trail.history,trailBuffer);
    assert.ok(particleBuffer.every(Number.isFinite));assert.ok(shardBuffer.every(Number.isFinite));
  }
  skill.dispose();assert.equal(scene.children.length,0);
});
