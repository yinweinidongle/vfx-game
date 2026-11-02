import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwordSwingTrail } from '../src/vfx/sword/SwordSwingTrail.js';
import { SwordSlashSkill } from '../src/vfx/sword/SwordSlashSkill.js';

const config = { autoLoop:false, playbackSpeed:1, flightSpeed:18, bladeSize:1, particleDensity:1,
  shardCount:42, trailLength:5.5, impactRadius:1.6, energyColor:'#39dfff', lightningColor:'#9170ff', hitStop:false };
const sampleSwordPose = (time, base, tip, quaternion) => {
  const angle = (time - .45) / .2 * Math.PI * 2;
  base.set(-8.4 + Math.cos(angle) * .35, 1.3 + Math.sin(angle * 2) * .15, Math.sin(angle) * .35);
  tip.set(base.x + Math.cos(angle) * 1.35, base.y + Math.sin(angle) * .32, base.z + Math.sin(angle) * 1.35);
  quaternion?.identity();
};

test('swing ribbon caches the sampled world blade, follows the complete rotation, and drains by .82s', () => {
  const scene = new THREE.Scene(), trail = new SwordSwingTrail(scene, config);
  const base = new THREE.Vector3(), tip = new THREE.Vector3();
  sampleSwordPose(.44, base, tip); trail.update(.01, .44, base, tip);
  assert.equal(trail.mesh.visible, false); assert.equal(trail.count, 0);
  const history = trail.history, positions = trail.positions, index = trail.geometry.index.array;
  for (let i = 0; i <= 24; i++) {
    const time = .45 + i / 120; sampleSwordPose(time, base, tip); trail.update(1/120, time, base, tip);
    const latest = (trail.count - 1) * 6;
    assert.ok(new THREE.Vector3().fromArray(trail.history, latest).distanceTo(base) < 1e-6);
    assert.ok(new THREE.Vector3().fromArray(trail.history, latest + 3).distanceTo(tip) < 1e-6);
    assert.ok(new THREE.Vector3().fromArray(trail.positions, ((trail.count - 1) * 4 + 3) * 3).distanceTo(tip) < 1e-6);
  }
  assert.equal(trail.count, 25); assert.equal(trail.geometry.drawRange.count, 24 * 18);
  assert.ok(trail.history.slice(0, trail.count * 6).every(Number.isFinite));
  const box = new THREE.Box3().setFromBufferAttribute(trail.geometry.attributes.position);
  assert.ok(box.max.z - box.min.z > 3.3, 'ribbon includes both sides of the authored full swing');
  const captured = trail.history.slice(); sampleSwordPose(.75, base, tip); trail.update(.1, .75, base, tip);
  assert.equal(trail.count, 25); assert.deepEqual(trail.history, captured); assert.equal(trail.mesh.visible, true);
  trail.update(.07, .82, base, tip); assert.equal(trail.mesh.visible, false); assert.equal(trail.geometry.drawRange.count, 0);
  assert.equal(trail.count, 0); assert.ok(trail.positions.every(value => value === 0));
  assert.equal(trail.history, history); assert.equal(trail.positions, positions); assert.equal(trail.geometry.index.array, index);
  trail.dispose(); assert.equal(scene.children.length, 0);
});

test('controller swing replay is deterministic, follows current fighter samples, and clears on switch/end', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1.5, .1, 100);
  const skill = new SwordSlashSkill(scene, camera, { ...config }); skill.bindFighter({ sampleSwordPose });
  skill.timeline.playing = false; skill.seek(.58);
  const trail = skill.swingTrail, history = trail.history.slice(), positions = trail.positions.slice();
  assert.equal(trail.mesh.visible, true); assert.ok(trail.count > 10);
  const base = new THREE.Vector3(), tip = new THREE.Vector3(); sampleSwordPose(.58, base, tip);
  assert.ok(new THREE.Vector3().fromArray(history, (trail.count - 1) * 6 + 3).distanceTo(tip) < 1e-6);
  skill.update(0, 0); assert.deepEqual(trail.history, history, 'paused frames must not append duplicate samples');
  skill.seek(.2); assert.equal(trail.mesh.visible, false); skill.seek(.58);
  assert.deepEqual(trail.history, history); assert.deepEqual(trail.positions, positions);
  skill.setActive(false); assert.equal(trail.mesh.visible, false); assert.equal(trail.count, 0);
  skill.setActive(true); skill.update(0, 0); assert.deepEqual(trail.history, history);
  skill.seek(.82); assert.equal(trail.mesh.visible, false); assert.equal(trail.count, 0);
  skill.seek(skill.timeline.duration); assert.equal(trail.geometry.drawRange.count, 0);
  skill.dispose(); assert.equal(scene.children.length, 0);
});
