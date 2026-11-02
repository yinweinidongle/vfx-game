import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SkillShowcase } from '../src/SkillShowcase.js';
import { CharacterStatusFX } from '../src/vfx/CharacterStatusFX.js';
import { SwordCinematicDirector } from '../src/scene/SwordCinematicDirector.js';
import { defaults } from '../src/VFXConfig.js';

globalThis.window={devicePixelRatio:1};

function setup(overrides={}){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1.5,.1,100);
  camera.position.set(0,6,20);camera.lookAt(0,1,0);camera.updateMatrixWorld();
  const config={...defaults,autoLoop:false,flowTextureUrl:null,...overrides};
  const shooterWrapper=new THREE.Group(),targetWrapper=new THREE.Group(),bow=new THREE.Group();
  shooterWrapper.position.x=-8.4;targetWrapper.position.x=7.5;
  const hand=new THREE.Object3D();hand.position.set(.8,1.7,0);shooterWrapper.add(hand);
  const targetRoot=new THREE.Group();targetWrapper.add(targetRoot);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.4,1.3,.3),new THREE.MeshPhongMaterial({color:'#ad745b'}));
  mesh.position.y=1;targetRoot.add(mesh);scene.add(shooterWrapper,targetWrapper,bow);
  const actors={
    shooter:{wrapper:shooterWrapper,hand},target:{wrapper:targetWrapper,root:targetRoot},bow,
    sampleArrowPose(time,phase,boundary,size,outPosition,outQuaternion){outPosition.set(-8.1+size*2,1.7,.1);outQuaternion.identity();return true;},
    sampleTargetPosition(time,boundary,outPosition){outPosition.set(7.5,1.7-Math.max(0,time-boundary)*.2,0);return true;},
    update(dt,time,phase,boundary){this.time=time;this.phase=phase;this.impactTime=boundary;},
  };
  const fighterGroup=new THREE.Group(),fighterWrapper=new THREE.Group();fighterWrapper.position.x=-8.4;fighterGroup.add(fighterWrapper);scene.add(fighterGroup);
  const fighter={
    group:fighterGroup,wrapper:fighterWrapper,
    sampleSwordPose(time,base,tip,quaternion){base.set(-7.4,1.2,.2);tip.set(-6.2,1.65+Math.sin(time)*.3,.2);quaternion.identity();return true;},
    setVisible(visible){fighterGroup.visible=visible;},
    update(time,phase,boundary){this.time=time;this.phase=phase;this.impactTime=boundary;},
  };
  const status=new CharacterStatusFX(scene,actors,config);
  const showcase=new SkillShowcase(scene,camera,config,actors,fighter,status);showcase.bindActors();
  const ownedSceneRoots=[...scene.children].filter(object=>object!==showcase.iceRoot&&object!==showcase.sword.root);
  function dispose(){showcase.dispose();status.dispose();mesh.geometry.dispose();mesh.material.dispose();}
  return{scene,camera,config,actors,fighter,status,showcase,ownedSceneRoots,dispose};
}

test('default selection binds the sword while preserving both skill interfaces and original actor objects',()=>{
  const {showcase,config,actors,fighter,status,dispose}=setup();
  assert.equal(showcase.kind,'sword');assert.equal(config.character,'sword');assert.equal(showcase.timeline,showcase.sword.timeline);
  assert.equal(fighter.group.visible,true);assert.equal(actors.shooter.wrapper.visible,false);assert.equal(actors.bow.visible,false);
  assert.equal(showcase.iceRoot.visible,false);assert.equal(status.group.visible,false);assert.equal(showcase.fighter,fighter);
  assert.equal(showcase.config.frostColor,config.energyColor);assert.equal(showcase.config.arrowSize,config.bladeSize);
  assert.equal(showcase.sword.loops,0);assert.equal(showcase.ice.loops,0);
  showcase.select('ice');assert.equal(showcase.kind,'ice');assert.equal(showcase.config,config);assert.equal(showcase.fighter,undefined);
  assert.equal(fighter.group.visible,false);assert.equal(actors.shooter.wrapper.visible,true);assert.equal(actors.bow.visible,true);
  assert.equal(showcase.sword.root.visible,false);assert.equal(showcase.sword.active,false);assert.equal(showcase.ice.loops,1);
  dispose();
});

test('switching during an ice hit clears target coatings outside the hidden VFX root and resets the new actor pose',()=>{
  const {showcase,status,fighter,actors,dispose}=setup({character:'ice'});
  showcase.seek(showcase.timeline.impactTime+.16);showcase.updateActors(0);
  assert.ok(status.freezeStrength>.9);assert.ok(status.coatings.some(({mesh})=>mesh.visible));
  assert.equal(showcase.ice.impact.active,true);assert.equal(status.coatings[0].mesh.parent,actors.target.root);
  fighter.time=2;showcase.select('sword');
  assert.equal(showcase.ice.impact.active,false);assert.equal(showcase.ice.light.intensity,0);
  assert.equal(status.freezeStrength,0);assert.ok(status.coatings.every(({mesh})=>!mesh.visible));
  assert.equal(status.handLight.intensity,0);assert.equal(fighter.time,0);assert.equal(actors.time,0);
  assert.equal(showcase.timeline.time,0);assert.equal(showcase.timeline.playing,true);
  showcase.seek(showcase.timeline.impactTime+.1);showcase.updateActors(0);assert.equal(showcase.sword.impact.active,true);
  showcase.select('ice');assert.equal(showcase.sword.impact.active,false);assert.equal(showcase.sword.hitStopRemaining,0);
  assert.equal(showcase.sword.light.intensity,0);assert.equal(showcase.timeline.time,0);assert.equal(actors.effectColor,null);
  dispose();
});

test('paused seek and live controls affect only the selected timeline while character colors remain independent',()=>{
  const {showcase,config,actors,fighter,dispose}=setup();
  showcase.timeline.playing=false;showcase.seek(showcase.timeline.impactTime+.12);showcase.updateActors(0);
  const held=showcase.timeline.time,iceTime=showcase.ice.timeline.time,iceColor=config.frostColor;
  config.lightningColor='#b191ff';config.energyColor='#38f5da';showcase.dirty=true;showcase.update(0,0);showcase.updateActors(0);
  assert.equal(showcase.timeline.time,held);assert.equal(showcase.timeline.playing,false);assert.equal(showcase.dirty,false);
  assert.equal(showcase.ice.timeline.time,iceTime);assert.equal(config.frostColor,iceColor);
  assert.equal(actors.effectColor,'#b191ff');assert.equal(actors.time,held);assert.equal(fighter.time,held);
  assert.equal(actors.impactTime,showcase.timeline.impactTime);
  showcase.select('ice');config.frostColor='#99e5ff';showcase.dirty=true;showcase.update(0,0);showcase.updateActors(0);
  assert.equal(config.energyColor,'#38f5da');assert.equal(actors.effectColor,null);assert.equal(showcase.sword.timeline.time,0);
  dispose();
});

test('cinematic camera receives the actual fighter and weapon endpoints through the facade',()=>{
  const {showcase,camera,dispose}=setup();showcase.seek(.29);showcase.updateActors(0);
  assert.equal(showcase.base,showcase.sword.base);assert.equal(showcase.tip,showcase.sword.tip);
  const directCamera=camera.clone(),facadeCamera=camera.clone();
  const direct=new SwordCinematicDirector(directCamera),facade=new SwordCinematicDirector(facadeCamera);
  direct.update(showcase.sword,1.5);facade.update(showcase,1.5);
  assert.ok(facadeCamera.position.distanceTo(directCamera.position)<1e-12);
  assert.ok(facade.target.distanceTo(direct.target)<1e-12);assert.equal(facadeCamera.fov,directCamera.fov);
  dispose();
});

test('repeated character changes reuse both VFX resource sets and never advance the inactive skill',()=>{
  const {showcase,scene,dispose}=setup();
  const objects=[];scene.traverse(object=>objects.push(object));
  const icePositions=showcase.ice.particles.positions,swordPositions=showcase.sword.particles.positions;
  for(let cycle=0;cycle<12;cycle++){
    const kind=cycle%2?'sword':'ice';showcase.select(kind);const inactive=kind==='ice'?showcase.sword:showcase.ice;
    const heldTime=inactive.timeline.time,heldLoops=inactive.loops;
    showcase.seek(showcase.timeline.impactTime+.09);showcase.update(.03,.03);showcase.updateActors(.03);showcase.refreshView();
    assert.equal(inactive.timeline.time,heldTime);assert.equal(inactive.loops,heldLoops);
    assert.equal(showcase.ice.particles.positions,icePositions);assert.equal(showcase.sword.particles.positions,swordPositions);
    const current=[];scene.traverse(object=>current.push(object));assert.deepEqual(current,objects);
  }
  dispose();
});

test('facade disposal is idempotent and leaves externally owned actors and character status intact',()=>{
  const {showcase,scene,ownedSceneRoots,status,dispose}=setup();
  let disposeEvents=0;showcase.ice.launchFlash.geometry.addEventListener('dispose',()=>disposeEvents++);
  showcase.dispose();showcase.dispose();assert.equal(disposeEvents,1);
  assert.deepEqual(scene.children,ownedSceneRoots);assert.equal(status.disposed,false);
  const time=showcase.timeline.time;showcase.update(1,1);showcase.select('ice');assert.equal(showcase.timeline.time,time);
  dispose();
});
