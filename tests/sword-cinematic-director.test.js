import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwordCinematicDirector } from '../src/scene/SwordCinematicDirector.js';

function setup() {
  const camera = new THREE.PerspectiveCamera(40, 1.5, .1, 80);
  const director = new SwordCinematicDirector(camera);
  const wrapper = new THREE.Group(); wrapper.position.set(-8.4, 0, 0);
  const skill = {
    kind: 'sword',
    config: { bladeSize: 1, arrowSize: .52, trailLength: 5.5, impactRadius: 1.6, cameraShake: true },
    timeline: { time: 0, launchTime: .65, impactTime: 1.4, duration: 2.5 },
    origin: new THREE.Vector3(-6.3, 1.75, .12),
    target: new THREE.Vector3(7.5, 1.7, 0),
    position: new THREE.Vector3(),
    flightEnd: new THREE.Vector3(6.75, 1.7, 0),
    base: new THREE.Vector3(), tip: new THREE.Vector3(),
    fighter: { wrapper },
  };
  const at = time => {
    skill.timeline.time = time;
    const p = THREE.MathUtils.clamp((time - .65) / (skill.timeline.impactTime - .65), 0, 1);
    skill.position.lerpVectors(skill.origin, skill.flightEnd, p);
    const swing = THREE.MathUtils.smoothstep(time, .25, .65) * Math.PI * 2;
    skill.base.set(-8.05 + Math.sin(swing) * .3, 1.4 + Math.sin(swing) * .3, .2);
    skill.tip.copy(skill.base).add(new THREE.Vector3(Math.cos(swing) * 1.6, Math.sin(swing) * 1.35, Math.sin(swing) * .8));
    if (time < .45) skill.position.copy(skill.tip);
  };
  return { camera, director, skill, at };
}
function snapshot(camera, director) {
  return [...camera.position.toArray(), ...camera.quaternion.toArray(), ...director.target.toArray(),
    camera.fov, camera.far, director.shotIndex, director.shotId, director.shotLabel];
}
function contained(point, camera, margin = .845) {
  const p = point.clone().project(camera);
  assert.ok(p.toArray().every(Number.isFinite));
  assert.ok(Math.abs(p.x) <= margin && Math.abs(p.y) <= margin, `outside framing: ${p.toArray()}`);
  assert.ok(p.z > -1 && p.z < 1, 'inside near/far clipping');
}

test('five sword shots seek and replay deterministically, including impact shake', () => {
  const { camera, director, skill, at } = setup();
  for (const [time, index, id] of [[.2, 0, 'charge'], [.45, 1, 'slash'], [.7, 1, 'slash'], [.78, 2, 'flight'], [1.3, 2, 'flight'], [1.4, 3, 'impact'], [1.441, 3, 'impact'], [1.86, 4, 'resolve'], [2.5, 4, 'resolve']]) {
    at(time); director.update(skill, 1.5); const expected = snapshot(camera, director);
    assert.equal(director.shotIndex, index); assert.equal(director.shotId, id);
    for (const other of [2.3, .01, 1.71, .51]) { at(other); director.update(skill, .45); }
    at(time); director.update(skill, 1.5);
    assert.deepEqual(snapshot(camera, director), expected);
  }
});

test('sword camera fits the full subject on narrow and wide screens at adjustable sizes', () => {
  const { camera, director, skill, at } = setup();
  const corner = new THREE.Vector3();
  for (const aspect of [.25, .55, 1, 1.7, 3]) for (const size of [.5, 1, 1.8]) {
    skill.config.bladeSize = size;
    for (const impactRadius of [.6, 1.6, 3]) {
      skill.config.impactRadius = impactRadius;
      for (let frame = 0; frame <= 100; frame++) {
        const t = 2.5 * frame / 100; at(t); director.update(skill, aspect);
        assert.ok(camera.position.toArray().every(Number.isFinite));
        assert.ok(camera.position.z > director.target.z, 'camera stays on +Z side');
        for (let c = 0; c < 8; c++) {
          corner.set(c & 1 ? director.bounds.max.x : director.bounds.min.x,
            c & 2 ? director.bounds.max.y : director.bounds.min.y,
            c & 4 ? director.bounds.max.z : director.bounds.min.z);
          contained(corner, camera);
        }
        if (director.shotIndex <= 1) { contained(skill.base, camera); contained(skill.tip, camera); }
        if (director.shotIndex === 1 || director.shotIndex === 2) {
          contained(director.bladeUpper, camera); contained(director.bladeLower, camera); contained(director.head, camera);
        }
        if (director.shotIndex === 2) {
          contained(director.tail, camera);
          assert.ok(director.framedTrailLength <= 3.7 && director.framedTrailLength <= director.visibleTrailLength);
          assert.ok(director.framedTrailLength >= Math.min(3.1, director.visibleTrailLength));
        }
      }
    }
  }
});

test('flight camera presents the broad blade face through a smooth shallow orbit', () => {
  const { camera, director, skill, at } = setup();
  const previousPosition = new THREE.Vector3(), previousQuaternion = new THREE.Quaternion();
  let firstOffset, lastOffset;
  for (let i = 0; i <= 100; i++) {
    const t = .78 + .61 * i / 100; at(t); director.update(skill, 1.55);
    const offset = camera.position.x - director.target.x;
    if (i === 0) firstOffset = offset;
    if (i === 100) lastOffset = offset;
    assert.ok(director.viewDirection.z > .93, 'never turns the crescent edge-on');
    assert.ok(director.viewDirection.dot(director.bladeNormal) > .72, 'the broad surface stays visible');
    if (i) {
      assert.ok(previousPosition.distanceTo(camera.position) < .25, 'smooth tracking within the shot');
      assert.ok(previousQuaternion.angleTo(camera.quaternion) < .01, 'no rotational whipping');
    }
    previousPosition.copy(camera.position); previousQuaternion.copy(camera.quaternion);
  }
  assert.ok(firstOffset < 0 && lastOffset > 0, 'camera moves on a shallow rail across the face');
});

test('impact shake is deterministic, optional, below 5 cm, and ends after 150 ms', () => {
  const { camera, director, skill, at } = setup();
  const shaken = new THREE.Vector3();
  for (let i = 0; i <= 36; i++) {
    const age = i / 200; at(1.4 + age); skill.config.cameraShake = true; director.update(skill, 1.5);
    shaken.copy(camera.position); const shake = director.shakeOffset.length();
    assert.ok(shake <= .05);
    if (age >= .15 || age === 0) assert.equal(shake, 0);
    skill.config.cameraShake = false; director.update(skill, 1.5);
    assert.ok(shaken.distanceTo(camera.position) <= .05);
    assert.equal(director.shakeOffset.length(), 0);
    contained(skill.target, camera);
  }
});

test('sword shot pacing follows the charge, release, travel and impact windows', () => {
  const { director, skill, at } = setup();
  for (const [time, scale] of [[0, .72], [.449, .72], [.45, .9], [.649, .9], [.65, .55], [.9, .55], [1.4, .52], [1.84, .52], [1.86, 1], [2.5, 1]]) {
    at(time); assert.equal(director.getTimeScale(skill), scale);
  }
  for (const impact of [.9, 1.4, 3.5]) {
    skill.timeline.impactTime = impact; skill.timeline.duration = impact + 1.1;
    for (let i = 0; i <= 150; i++) {
      at(skill.timeline.duration * i / 150);
      const scale = director.getTimeScale(skill); assert.ok(scale >= .52 && scale <= 1);
    }
  }
});

function paintedSwingSetup(normalSign=1){
  const state=setup(),{skill,at}=state;
  const localBounds=new THREE.Box3(new THREE.Vector3(-2.817,-1.8,-.04),new THREE.Vector3(.75,1.8,.04));
  const direction=new THREE.Vector3().subVectors(skill.target,skill.origin).normalize();
  const normal=new THREE.Vector3(.02,.98,-.18).addScaledVector(direction,-new THREE.Vector3(.02,.98,-.18).dot(direction)).normalize().multiplyScalar(normalSign);
  skill.slashForward=new THREE.Vector3();skill.slashSpan=new THREE.Vector3();skill.slashNormal=normal.clone();
  const group=new THREE.Group(),content=new THREE.Group();content.rotation.x=THREE.MathUtils.degToRad(25);group.add(content);
  skill.blade={group,content,geometry:{boundingBox:localBounds}};
  const plane=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),inverseTilt=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-THREE.MathUtils.degToRad(25));
  const sample=time=>{
    const size=skill.config.bladeSize;
    skill.flightEnd.copy(skill.target).addScaledVector(direction,-.75*size);at(time);
    // Like the supplied melee clip, the plane is almost horizontal, while its
    // forward axis rotates during the strike and locks after detachment.
    const swingAngle=time<.65?-.55*(1-THREE.MathUtils.smoothstep(time,.45,.65)):0;
    skill.slashForward.copy(direction).applyAxisAngle(normal,swingAngle).normalize();
    skill.slashSpan.crossVectors(normal,skill.slashForward).normalize();
    plane.makeBasis(skill.slashForward,skill.slashSpan,skill.slashNormal);
    quaternion.setFromRotationMatrix(plane);group.quaternion.copy(quaternion).multiply(inverseTilt);
    const consume=THREE.MathUtils.clamp((time-skill.timeline.impactTime)/.22,0,1);
    group.position.copy(skill.position).addScaledVector(direction,.7*size*consume);group.scale.setScalar(size);
    const launch=time>=.65&&time<.88?Math.exp(-(time-.65)*21)*THREE.MathUtils.smoothstep(time,.65,.666):0;
    content.scale.set(1+launch*.22,1-launch*.045,1);group.updateMatrixWorld(true);
  };
  return{...state,at:sample,localBounds};
}

test('painted horizontal slash keeps every true transformed footprint corner inside portrait and wide shots',()=>{
  const corner=new THREE.Vector3();
  for(const normalSign of [1,-1]){
    const {camera,director,skill,at,localBounds}=paintedSwingSetup(normalSign);
    for(const aspect of [.3,.55,1,1.7,2.7])for(const size of [.5,1,1.6]){
      skill.config.bladeSize=size;
      for(const time of [.58,.65,.666,.70,.8,1.05,skill.timeline.impactTime,skill.timeline.impactTime+.11]){
        at(time);director.update(skill,aspect);
        for(let i=0;i<8;i++){
          corner.set(i&1?localBounds.max.x:localBounds.min.x,i&2?localBounds.max.y:localBounds.min.y,i&4?localBounds.max.z:localBounds.min.z);
          corner.applyMatrix4(skill.blade.content.matrixWorld);
          try{contained(corner,camera);}catch(error){error.message+=` (painted size=${size}, aspect=${aspect}, time=${time}, normalSign=${normalSign}, corner=${i})`;throw error;}
        }
      }
    }
  }
});

test('near-horizontal painted flight presents the broad face and tracks continuously after the authored cut',()=>{
  const view=new THREE.Vector3(),previousPosition=new THREE.Vector3(),previousQuaternion=new THREE.Quaternion();
  for(const normalSign of [1,-1])for(const aspect of [.35,1.55,2.7]){
    const {camera,director,skill,at}=paintedSwingSetup(normalSign);
    for(let i=0;i<=120;i++){
      const time=.8+(.59*i/120);at(time);director.update(skill,aspect);
      view.subVectors(camera.position,director.target).normalize();
      assert.ok(Math.abs(view.dot(skill.slashNormal))>.6,'the true painted face must remain visible');
      if(i){
        const relativeMove=previousPosition.distanceTo(camera.position)/camera.position.distanceTo(director.target);
        assert.ok(relativeMove<.025,`continuous translation relative to portrait/wide view distance: delta=${relativeMove}, aspect=${aspect}, time=${time}`);
        assert.ok(previousQuaternion.angleTo(camera.quaternion)<.012,`continuous rotation inside the tracking shot: delta=${previousQuaternion.angleTo(camera.quaternion)}, aspect=${aspect}, time=${time}`);
      }
      previousPosition.copy(camera.position);previousQuaternion.copy(camera.quaternion);
    }
  }
});
