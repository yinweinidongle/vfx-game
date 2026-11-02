import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HomingArrows } from '../src/vfx/HomingArrows.js';
import { defaults } from '../src/VFXConfig.js';

function setup() {
  const scene = new THREE.Scene(), config = { ...defaults, arrowSize: .52, homingCount: 6 };
  const camera = new THREE.PerspectiveCamera(40, 1.5, .1, 100); camera.position.set(0, 7, 20); camera.lookAt(0, 1.5, 0); camera.updateMatrixWorld();
  const context = { origin: new THREE.Vector3(-7.633, 1.7, 0), mainPosition: new THREE.Vector3(), target: new THREE.Vector3(7.5, 1.7, 0), impactTime: 1.5, arrowSize: .52, camera, config };
  context.targetAtTime = (time, out) => out.set(7.5, 1.7 - Math.min(.6, Math.max(0, time - 1.5) * 1.5), 0);
  const updateContext = time => {
    const fraction = THREE.MathUtils.clamp((time - .75) / .75, 0, 1);
    context.mainPosition.set(THREE.MathUtils.lerp(-7.633, 7.5 - 1.42 * .52, fraction), 1.7 + Math.sin(fraction * Math.PI) * .12, 0);
    context.targetAtTime(time, context.target);
  };
  return { scene, arrows: new HomingArrows(scene, config), context, updateContext };
}

test('companion arrows have deterministic curved paths and meet the moving target at staggered hit times', () => {
  const { arrows, context, updateContext } = setup();
  updateContext(1.2); arrows.update(1.2, context);
  const sampled = new THREE.Vector3(), expected = new THREE.Vector3(), before = new THREE.Vector3(), after = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    const arrow = arrows.arrows[i]; context.targetAtTime(arrow.hitTime, expected);
    arrows.samplePosition(i, arrow.hitTime, sampled); assert.ok(sampled.distanceTo(expected) < 1e-10);
    assert.ok(arrow.hitTime > context.impactTime && arrow.hitTime <= context.impactTime + .41 + 1e-9);
    arrows.samplePosition(i, arrow.branchTime - 1e-5, before);
    arrows.samplePosition(i, arrow.branchTime + 1e-5, after);
    assert.ok(before.distanceTo(after) < .001, 'branch trajectory must remain continuous');
  }
  const first = arrows.mesh.instanceMatrix.array.slice(), ribbons = arrows.trailPositions.slice();
  updateContext(.5); arrows.update(.5, context); updateContext(1.2); arrows.update(1.2, context);
  assert.deepEqual(arrows.mesh.instanceMatrix.array, first); assert.deepEqual(arrows.trailPositions, ribbons);
  arrows.dispose();
});

test('each mini arrow points along its curved world trajectory and its tip meets the contact point', () => {
  const { arrows, context, updateContext } = setup();
  const matrix = new THREE.Matrix4(), localTip = new THREE.Vector3(.58, 0, 0), worldTip = new THREE.Vector3(), expected = new THREE.Vector3();
  const localForward = new THREE.Vector3(1, 0, 0), facing = new THREE.Vector3(), direction = new THREE.Vector3(), previous = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    const time = context.impactTime + .06 + i * .07 - .0001;
    updateContext(time); arrows.update(time, context); arrows.mesh.getMatrixAt(i, matrix);
    worldTip.copy(localTip).applyMatrix4(matrix); arrows.samplePosition(i, time, expected);
    assert.ok(worldTip.distanceTo(expected) < 2e-6, 'crystal tip follows the analytic world path');
    arrows.samplePosition(i, time - .002, previous); direction.subVectors(expected, previous).normalize();
    facing.copy(localForward).transformDirection(matrix); assert.ok(facing.dot(direction) > .999);
  }
  arrows.dispose();
});

test('twenty homing volleys keep fixed buffers and expire before the main skill endpoint', () => {
  const { scene, arrows, context, updateContext } = setup();
  const matrices = arrows.mesh.instanceMatrix.array, positions = arrows.trailPositions, children = arrows.group.children.slice();
  for (let cycle = 0; cycle < 20; cycle++) {
    arrows.reset();
    for (let frame = 0; frame <= 156; frame++) {
      const time = frame / 60; updateContext(time); arrows.update(time, context);
      assert.ok(arrows.mesh.instanceMatrix.array.every(Number.isFinite));
      assert.ok(arrows.trailPositions.every(Number.isFinite));
      assert.ok(arrows.splinters.instanceMatrix.array.every(Number.isFinite));
    }
    assert.equal(arrows.group.visible, false); assert.ok(arrows.fades.every(x => x === 0));
    assert.ok(arrows.trailFades.every(x => x === 0)); assert.ok(arrows.splinterFades.every(x => x === 0));
    assert.equal(arrows.mesh.instanceMatrix.array, matrices); assert.equal(arrows.trailPositions, positions);
    assert.deepEqual(arrows.group.children, children);
  }
  context.config.homingCount = 2; updateContext(1.2); arrows.update(1.2, context); assert.equal(arrows.mesh.count, 2);
  assert.equal(arrows.trailGeometry.drawRange.count, 2 * 31 * 6);
  context.config.homingCount = 0; arrows.update(1.2, context); assert.equal(arrows.group.visible, false);
  arrows.dispose(); arrows.dispose(); assert.equal(scene.children.length, 0);
});

test('expensive future chest samples are cached per cast and invalidated on retime or reset', () => {
  const { arrows, context, updateContext } = setup();
  let queries = 0; const sample = context.targetAtTime;
  context.targetAtTime = (time, out) => { queries++; return sample(time, out); };
  // updateContext intentionally uses the callback too; count only VFX queries.
  for (let i = 0; i < 50; i++) {
    const time = .8 + i / 60; updateContext(time); const before = queries; arrows.update(time, context);
    assert.equal(queries - before, i === 0 ? 6 : 0);
  }
  context.impactTime = 1.6; let before = queries; arrows.update(1.3, context); assert.equal(queries - before, 6);
  context.targetVersion = 1; before = queries; arrows.update(1.3, context); assert.equal(queries - before, 6);
  arrows.reset(); before = queries; arrows.update(1.3, context); assert.equal(queries - before, 6);
  arrows.dispose();
});

test('companions stay absent through launch, then emerge from the main tail before spreading', () => {
  const { arrows, context, updateContext } = setup();
  updateContext(1.2); arrows.update(1.2, context);
  for (const time of [.4, .74, .75, .79]) {
    updateContext(time); arrows.update(time, context);
    assert.equal(arrows.group.visible, false);
    assert.ok(arrows.fades.every(x => x === 0)); assert.ok(arrows.trailFades.every(x => x === 0));
    assert.equal(arrows.trailGeometry.drawRange.count, 0);
  }
  updateContext(.85); arrows.update(.85, context);
  assert.equal(arrows.group.visible, true); assert.ok(arrows.fades.some(x => x > 0)); assert.ok(arrows.trailFades.some(x => x > 0));
  context.impactTime = 1.15; context.mainEnd = new THREE.Vector3(6.75, 1.7, 0); context.mainArcHeight = 0;
  arrows.update(.9, context);
  const sampled = new THREE.Vector3(), expected = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    const arrow = arrows.arrows[i];
    assert.equal(arrow.spawnTime, .8 + i * .025); assert.ok(arrow.branchTime >= arrow.spawnTime + .09);
    assert.ok(arrow.branchTime < arrow.hitTime);
    arrows.orbitPosition(i, arrow.spawnTime, sampled);
    expected.lerpVectors(context.origin, context.mainEnd, (arrow.spawnTime - .75) / (context.impactTime - .75)).addScaledVector(arrows.forward, -1);
    assert.ok(sampled.distanceTo(expected) < 1e-10, 'spawn starts on the tail axis, then expands into orbit');
  }
  arrows.dispose();
});

test('each contact consumes its arrow into the moving chest and drains the attached ribbon', () => {
  const { arrows, context, updateContext } = setup();
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  const hit = context.impactTime + .06;
  updateContext(hit + .06); arrows.update(hit + .06, context);
  assert.ok(arrows.fades[0] > 0, 'arrow still has visible material halfway through contact');
  assert.ok(Math.abs(arrows.consume[0] - .5) < 1e-6);
  arrows.mesh.getMatrixAt(0, matrix);
  point.set(.58 - 1.12 * .5, 0, 0).applyMatrix4(matrix);
  assert.ok(point.distanceTo(context.target) < 2e-6, 'fracture edge remains attached to the animated chest');
  assert.equal(arrows.impacts.group.visible, true);
  assert.ok(arrows.splinterFades.some(x => x > 0));
  updateContext(hit + .13); arrows.update(hit + .13, context);
  assert.equal(arrows.fades[0], 0);
  const p = arrows.trailPositions;
  point.set((p[0]+p[3])*.5, (p[1]+p[4])*.5, (p[2]+p[5])*.5);
  assert.ok(point.distanceTo(context.target) < 2e-6, 'consumed tail and ribbon must meet the contact');
  updateContext(hit + .25); arrows.update(hit + .25, context);
  assert.ok(arrows.trailFades.slice(0,64).every(x => x === 0));
  updateContext(.79); arrows.update(.79, context);
  assert.ok(arrows.consume.every(x => x === 0));
  assert.equal(arrows.impacts.group.visible, false);
  arrows.dispose();
});
