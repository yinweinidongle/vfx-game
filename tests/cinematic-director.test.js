import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CinematicDirector } from '../src/scene/CinematicDirector.js';

function setup() {
  const camera = new THREE.PerspectiveCamera(42, 1.6, 0.1, 120);
  const director = new CinematicDirector(camera);
  const skill = {
    config: { arrowSize: 0.52, trailLength: 7.5, impactRadius: 1.6 },
    timeline: { time: 0, impactTime: 1.535493, duration: 2.635493 },
    origin: new THREE.Vector3(-7.38, 1.65, 0.09),
    position: new THREE.Vector3(),
    target: new THREE.Vector3(7.5, 1.7, 0),
    flightEnd: new THREE.Vector3(7.5 - 1.42 * 0.52, 1.7, 0),
    homingTarget: new THREE.Vector3(),
  };
  const at = time => {
    skill.timeline.time = time;
    const p = THREE.MathUtils.clamp((time - .75) / (skill.timeline.impactTime - .75), 0, 1);
    skill.position.lerpVectors(skill.origin, skill.flightEnd, p);
    skill.homingTarget.copy(skill.target); skill.homingTarget.y -= THREE.MathUtils.clamp((time - skill.timeline.impactTime) * 1.7, 0, .9);
  };
  return { camera, director, skill, at };
}

function snapshot(camera, director) {
  return [...camera.position.toArray(), ...camera.quaternion.toArray(), camera.fov, camera.far,
    ...director.target.toArray(), director.shotIndex, director.shotId];
}

test('cinematic shots and poses are deterministic after arbitrary seeking and replay', () => {
  const { camera, director, skill, at } = setup();
  for (const [time, expected] of [[.35, 0], [.75, 1], [1.05, 2], [1.35, 3], [1.535493, 4], [1.93, 4], [2.1, 5], [2.635493, 5]]) {
    at(time); director.update(skill, 1.6); const original = snapshot(camera, director);
    assert.equal(director.shotIndex, expected); assert.ok(director.shotLabel.length > 0);
    for (const other of [2.4, .04, 1.7, .8]) { at(other); director.update(skill, .6); }
    at(time); director.update(skill, 1.6);
    assert.deepEqual(snapshot(camera, director), original);
  }
});

test('cinematic fitting contains the whole arrow and framed trail across wide and narrow views', () => {
  const { camera, director, skill, at } = setup();
  const projected = new THREE.Vector3();
  skill.config.trailLength = 12;
  skill.config.impactRadius = 3;
  for (const aspect of [.25, .55, 1, 1.6, 2.8]) {
    for (const size of [.25, .52, 1.25]) {
      skill.config.arrowSize = size;
      for (let frame = 0; frame <= 160; frame++) {
        const time = skill.timeline.duration * frame / 160;
        at(time); director.update(skill, aspect);
        assert.ok(camera.position.toArray().every(Number.isFinite));
        assert.ok(camera.position.z > director.target.z, 'camera never crosses the action axis');
        for (let corner = 0; corner < 8; corner++) {
          projected.set(corner & 1 ? director.bounds.max.x : director.bounds.min.x,
            corner & 2 ? director.bounds.max.y : director.bounds.min.y,
            corner & 4 ? director.bounds.max.z : director.bounds.min.z).project(camera);
          assert.ok(projected.toArray().every(Number.isFinite));
          assert.ok(Math.abs(projected.x) <= .840001 && Math.abs(projected.y) <= .840001, 'subject envelope is contained');
          assert.ok(projected.z > -1 && projected.z < 1, 'subject remains inside depth clipping planes');
        }
        if (director.shotIndex >= 1 && director.shotIndex <= 3) {
          for (const point of [director.head, director.tail]) {
            projected.copy(point).project(camera);
            assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1);
          }
          assert.ok(Math.abs(director.visibleTrailLength - Math.min(skill.config.trailLength, skill.origin.distanceTo(skill.position))) < 1e-8);
          assert.ok(director.framedTrailLength <= director.visibleTrailLength + 1e-8);
          projected.copy(skill.position).addScaledVector(director.direction, -2 * size).project(camera);
          assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, 'the whole arrow body remains in the close shot');
          if (director.shotIndex === 1) assert.equal(director.framedTrailLength, director.visibleTrailLength);
          if (director.shotIndex === 2) assert.ok(director.framedTrailLength <= 1.0 + 1e-8);
          if (director.shotIndex === 3) assert.ok(director.framedTrailLength <= 0.75 + 1e-8);
        }
      }
    }
  }
});

test('authored pacing stays bounded and holds the staggered impacts in slow motion', () => {
  const { director, skill, at } = setup();
  for (let frame = 0; frame <= 300; frame++) {
    at(skill.timeline.duration * frame / 300);
    const scale = director.getTimeScale(skill);
    assert.ok(Number.isFinite(scale) && scale >= .42 && scale <= 1);
  }
  at(.4); assert.equal(director.getTimeScale(skill), .72);
  at(.8); assert.equal(director.getTimeScale(skill), 1);
  at(1.05); assert.equal(director.getTimeScale(skill), .48);
  at(1.35); assert.equal(director.getTimeScale(skill), .42);
  for (const offset of [.06, .13, .20, .27, .34, .41]) {
    at(skill.timeline.impactTime + offset); assert.equal(director.getTimeScale(skill), .46);
  }
  at(skill.timeline.duration); assert.equal(director.getTimeScale(skill), 1);
});

test('within-shot motion is continuous away from the authored release and reverse-shot cuts', () => {
  const { camera, director, skill, at } = setup();
  const before = new THREE.Vector3();
  for (const time of [.15, .65, .81, 1.1, 1.5, 1.7, 1.96, 2.015493, 2.3]) {
    at(time - 1e-5); director.update(skill, 1.6); before.copy(camera.position);
    at(time + 1e-5); director.update(skill, 1.6);
    assert.ok(before.distanceTo(camera.position) < .01, 'seek-adjacent camera positions must not pop');
  }
});


test('rear and front shots track from opposite forward offsets while matching the arrow center', () => {
  const { camera, director, skill, at } = setup();
  const center = new THREE.Vector3(), projected = new THREE.Vector3(), offset = new THREE.Vector3();
  for (const [progress, id, index, sign] of [[.20, 'rear', 2, -1], [.50, 'rear', 2, -1], [.60, 'front', 3, 1], [.94, 'front', 3, 1]]) {
    at(.75 + (skill.timeline.impactTime - .75) * progress); director.update(skill, 1.6);
    assert.equal(director.shotId, id); assert.equal(director.shotIndex, index);
    center.copy(skill.position).addScaledVector(director.direction, -.29 * skill.config.arrowSize);
    offset.subVectors(camera.position, center);
    assert.ok(offset.dot(director.direction) * sign > .4, 'rear is behind and reverse shot is ahead of the arrow');
    assert.ok(camera.position.z > center.z, 'both views stay on the same side of the action axis');
    projected.copy(center).project(camera);
    assert.ok(Math.abs(projected.x) < 1e-7 && Math.abs(projected.y) < 1e-7, 'match cuts retain the same centered arrow');
    assert.ok(camera.fov >= 34 && camera.fov <= 36);
    for (const x of [-2, 1.42]) {
      projected.copy(skill.position).addScaledVector(director.direction, x * skill.config.arrowSize).project(camera);
      assert.ok(Math.abs(projected.x) < .85 && Math.abs(projected.y) < .85, 'nose and complete tail remain framed');
    }
  }
});

test('reverse tracking has intentional cuts at the two authored flight boundaries', () => {
  const { camera, director, skill, at } = setup();
  const before = new THREE.Vector3();
  for (const [progress, previousId, nextId] of [[.18, 'flight', 'rear'], [.56, 'rear', 'front']]) {
    const time = .75 + (skill.timeline.impactTime - .75) * progress;
    at(time - 1e-6); director.update(skill, 1.6); assert.equal(director.shotId, previousId); before.copy(camera.position);
    at(time + 1e-6); director.update(skill, 1.6); assert.equal(director.shotId, nextId);
    assert.ok(before.distanceTo(camera.position) > .5, 'the authored change is a deliberate reverse-angle cut');
  }
  // The late front shot only eases its angle to clear the target, without a cut.
  const time = .75 + (skill.timeline.impactTime - .75) * .86;
  at(time - 1e-5); director.update(skill, 1.6); before.copy(camera.position);
  at(time + 1e-5); director.update(skill, 1.6);
  assert.equal(director.shotId, 'front');
  assert.ok(before.distanceTo(camera.position) < .01);
});
