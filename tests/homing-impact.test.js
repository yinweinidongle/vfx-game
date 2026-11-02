import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HomingImpactBurst } from '../src/vfx/HomingImpactBurst.js';

function setup() {
  const scene = new THREE.Scene(), config = { frostColor: '#58dfff' };
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 6, 20); camera.lookAt(7.5, 1.5, 0); camera.updateMatrixWorld();
  const arrows = Array.from({ length: 6 }, (_, i) => ({ hitTime: 1.56 + i * .07, endpoint: new THREE.Vector3(7.5, 1.7 - i * .08, 0), radial: new THREE.Vector3(0, 1, 0) }));
  const context = { target: new THREE.Vector3(7.5, 1.7, 0), forward: new THREE.Vector3(1, 0, 0), side: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), camera, config, activeCount: 6 };
  return { scene, burst: new HomingImpactBurst(scene, config), arrows, context };
}

test('each companion contact independently produces volumetric, rotating, fading fragments', () => {
  const { burst, arrows, context } = setup(); const matrix = new THREE.Matrix4();
  burst.update(1.55, arrows, context); assert.equal(burst.group.visible, false); assert.ok(burst.shardFades.every(x => x === 0));
  burst.update(1.56, arrows, context);
  assert.equal(burst.group.visible, true); assert.ok(burst.shardFades.slice(0, 9).every(x => x === 1));
  assert.ok(burst.shardFades.slice(9).every(x => x === 0));
  burst.shards.getMatrixAt(0, matrix); const first = matrix.clone();
  const initialPosition = new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.ok(initialPosition.distanceTo(arrows[0].endpoint) < 1e-6);
  const physicalLength = new THREE.Vector3().setFromMatrixScale(matrix).y * 1.55;
  assert.ok(physicalLength >= .08 && physicalLength <= .15);
  burst.update(1.66, arrows, context); burst.shards.getMatrixAt(0, matrix);
  assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(initialPosition) > .08);
  const q1 = new THREE.Quaternion();
  const p = new THREE.Vector3(), q2 = new THREE.Quaternion(), s = new THREE.Vector3();
  first.decompose(p, q1, s); matrix.decompose(p, q2, s); assert.ok(Math.abs(q1.dot(q2)) < .9999);
  assert.ok(burst.shardFades[0] > 0 && burst.shardFades[0] < 1);
  assert.ok(burst.shardFades.slice(9, 18).every(x => x > 0));
  burst.update(arrows.at(-1).hitTime + .58 + 1e-6, arrows, context);
  assert.equal(burst.group.visible, false); assert.ok(burst.shardFades.every(x => x === 0));
  burst.dispose();
});

test('contact flash tracks the animated chest while detached crystals retain their world-space origin', () => {
  const { burst, arrows, context } = setup(); const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  burst.update(1.64, arrows, context); burst.shards.getMatrixAt(0, matrix); const firstFragment = matrix.clone();
  context.target.y -= .4; burst.update(1.64, arrows, context);
  burst.flash.getMatrixAt(0, matrix); point.setFromMatrixPosition(matrix); assert.ok(point.distanceTo(context.target) < 1e-6);
  burst.shards.getMatrixAt(0, matrix); assert.deepEqual(matrix.elements, firstFragment.elements);
  burst.update(1.8, arrows, context); burst.update(1.64, arrows, context);
  burst.shards.getMatrixAt(0, matrix); assert.deepEqual(matrix.elements, firstFragment.elements);
  burst.dispose();
});

test('twenty volleys reuse four draw objects and fixed GPU buffers with complete reset/disposal', () => {
  const { scene, burst, arrows, context } = setup();
  const objects = burst.group.children.slice(), matrices = burst.shards.instanceMatrix.array, fades = burst.shardFades, positions = burst.motePositions;
  assert.equal(objects.length, 4);
  for (let cycle = 0; cycle < 20; cycle++) {
    burst.reset();
    for (let frame = 85; frame <= 156; frame++) {
      burst.update(frame / 60, arrows, context);
      assert.ok(burst.shards.instanceMatrix.array.every(Number.isFinite));
      assert.ok(burst.flash.instanceMatrix.array.every(Number.isFinite));
      assert.ok(burst.motePositions.every(Number.isFinite));
      assert.ok(burst.shardFades.every(x => x >= 0 && x <= 1));
    }
    assert.equal(burst.group.visible, false); assert.ok(burst.shardFades.every(x => x === 0));
    assert.equal(burst.shards.instanceMatrix.array, matrices); assert.equal(burst.shardFades, fades); assert.equal(burst.motePositions, positions);
    assert.deepEqual(burst.group.children, objects);
  }
  context.config.frostColor = '#789cff'; burst.update(1.7, arrows, context);
  for (const object of objects) assert.equal(object.material.uniforms.uColor.value.getHexString(), '789cff');
  burst.reset(); assert.equal(burst.group.visible, false); assert.ok(burst.shardFades.every(x => x === 0)); assert.equal(burst.moteGeometry.drawRange.count, 0);
  let disposed = 0; for (const object of objects) { object.geometry.addEventListener('dispose', () => disposed++); object.material.addEventListener('dispose', () => disposed++); }
  burst.dispose(); burst.dispose(); assert.equal(disposed, 8); assert.equal(scene.children.length, 0);
});
