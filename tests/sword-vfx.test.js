import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BranchingLightning } from '../src/vfx/sword/BranchingLightning.js';
import { SwordParticles, createSwordShardGeometry } from '../src/vfx/sword/SwordParticles.js';
import { SwordImpact } from '../src/vfx/sword/SwordImpact.js';

const config = { swordColor: '#39dfff', lightningColor: '#9170ff', particleDensity: 1.5, shardCount: 48, impactRadius: 1.6 };

test('lightning reuses bounded forked ribbon geometry and replays its short pulses deterministically', () => {
  const scene = new THREE.Scene(), lightning = new BranchingLightning(scene, config), position = new THREE.Vector3(0, 1.4, 0);
  const base = new THREE.Vector3(-1.2, .7, 0), tip = new THREE.Vector3(.9, 2.2, .1);
  lightning.update(.173, position, .9, 'charge', config, base, tip);
  const count = lightning.geometry.drawRange.count, buffer = lightning.positions;
  assert.ok(count > 0 && count <= 4096); assert.equal(count % 6, 0);
  assert.ok(lightning.positions.every(Number.isFinite)); assert.ok(lightning.alphas.every(x => x >= 0 && x <= 1));
  const first = lightning.positions.slice(0, count * 3);
  lightning.update(.31, position, .9, 'flight', config, base, tip);
  lightning.update(.173, position, .9, 'charge', config, base, tip);
  assert.equal(lightning.geometry.drawRange.count, count); assert.deepEqual(lightning.positions.slice(0, count * 3), first);
  lightning.update(.12, position, 1, 'impact', config); assert.equal(lightning.positions, buffer); assert.ok(lightning.geometry.drawRange.count > 0);
  lightning.update(.6, position, 0, 'impact', config); assert.equal(lightning.group.visible, false); assert.equal(lightning.geometry.drawRange.count, 0);
  lightning.dispose(); assert.equal(scene.children.length, 0);
});

test('sword energy shards are closed volumetric triangular fragments with valid flat normals', () => {
  const geometry = createSwordShardGeometry(); geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3()); assert.ok(size.x > 1 && size.y > .4 && size.z > .25);
  assert.equal(geometry.attributes.position.count, 36);
  const normals = geometry.attributes.normal.array;
  for (let i = 0; i < normals.length; i += 3) assert.ok(Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1) < 1e-5);
  geometry.dispose();
});

test('seven particle roles are emitted and every transient dies within the skill aftermath', () => {
  const scene = new THREE.Scene(), particles = new SwordParticles(scene, config), position = new THREE.Vector3(-6, 1.5, 0), seen = new Set();
  for (let frame = 0; frame <= 156; frame++) {
    const time = frame / 60, phase = time < .65 ? 'charge' : time < .85 ? 'launch' : time < 1.45 ? 'flight' : time < 1.8 ? 'impact' : 'dissipate';
    position.x = time < .65 ? -6 : Math.min(6, -6 + (time - .65) * 15);
    if (frame === 39) particles.burst(position, 'launch', config);
    if (frame === 87) particles.burst(position, 'impact', config);
    particles.update(1 / 60, time, position, phase, config);
    for (let i = 0; i < particles.capacity; i++) if (particles.lives[i] > 0) seen.add(particles.roles[i]);
    for (const fragment of particles.fragments) if (fragment.life > 0) seen.add(fragment.role);
    assert.ok(particles.positions.every(Number.isFinite)); assert.ok(particles.shards.instanceMatrix.array.every(Number.isFinite));
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(particles.lives.every(x => x === 0)); assert.ok(particles.opacities.every(x => x === 0));
  assert.ok(particles.fragments.every(x => x.life === 0)); assert.ok(particles.shardFades.every(x => x === 0));
  particles.reset(); assert.equal(particles.cursor, 0); particles.dispose(); assert.equal(scene.children.length, 0);
});

test('twenty layered sword impacts retain their buffers, finite geometry, and fully reset at1.1s', () => {
  const scene = new THREE.Scene(), impact = new SwordImpact(scene, config), position = new THREE.Vector3(6, 1.5, 0);
  const children = impact.group.children.slice(), matrices = impact.shards.instanceMatrix.array, lightningBuffer = impact.lightning.positions;
  assert.ok(Math.abs(impact.ringGeometry.attributes.aDelay.array[1] - .06) < 1e-7);
  for (let cycle = 0; cycle < 20; cycle++) {
    impact.trigger(position, config);
    for (let frame = 0; frame < 66; frame++) {
      impact.update(1 / 60, frame / 60, config);
      assert.ok(impact.shards.instanceMatrix.array.every(Number.isFinite)); assert.ok(impact.rays.instanceMatrix.array.every(Number.isFinite));
      assert.ok(impact.lightning.positions.every(Number.isFinite)); assert.ok(impact.shardFades.every(x => x >= 0 && x <= 1));
    }
    assert.equal(impact.active, false); assert.equal(impact.group.visible, false); assert.equal(impact.light.intensity, 0);
    assert.ok(impact.shardFades.every(x => x === 0)); assert.equal(impact.lightning.geometry.drawRange.count, 0);
    assert.equal(impact.shards.instanceMatrix.array, matrices); assert.equal(impact.lightning.positions, lightningBuffer); assert.deepEqual(impact.group.children, children);
  }
  impact.dispose(); impact.dispose(); assert.equal(scene.children.length, 0);
});

test('reference impact keeps seven readable outward lancets and dark contrast fragments without growing pools', () => {
  const scene = new THREE.Scene(), impact = new SwordImpact(scene, config), position = new THREE.Vector3(6, 1.5, 0);
  impact.trigger(position, config); impact.update(.16, 1.6, config);
  assert.equal(impact.shards.count, config.shardCount); assert.equal(impact.shardCapacity, 96); assert.equal(impact.rayCount, 18);
  assert.equal(impact.shardSeeds.filter(seed => seed.hero).length, 7);
  const matrix = new THREE.Matrix4(), scale = new THREE.Vector3(), facing = new THREE.Vector3(), outward = new THREE.Vector3();
  for (let i = 0; i < 7; i++) {
    const seed = impact.shardSeeds[i]; impact.shards.getMatrixAt(i, matrix); scale.setFromMatrixScale(matrix);
    assert.ok(scale.x * 1.38 > .65, 'hero fragment silhouette should remain readable at the impact camera distance');
    facing.set(1, 0, 0).transformDirection(matrix); outward.set(seed.vx, seed.vy, seed.vz).normalize();
    assert.ok(facing.dot(outward) > .98, 'large lancets should point into their outward burst direction');
    assert.ok(impact.shardFades[i] > .9); assert.equal(impact.shardEnergy[i], 1);
  }
  assert.ok(impact.shardEnergy.slice(7, config.shardCount).some(energy => energy < 0));
  impact.contactGeometry.computeBoundingBox(); const lash = impact.contactGeometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(lash.y > 1.3 && lash.z >= .069, 'contact lash is a real, thick crescent');
  const particles = new SwordParticles(scene, config); particles.burst(position, 'launch', config);
  assert.equal(particles.capacity, 1200); assert.equal(particles.shardCapacity, 192);
  assert.ok(particles.fragments.some(fragment => fragment.life > 0 && fragment.size >= .1));
  assert.ok(particles.shardEnergy.some(energy => energy < 0));
  particles.dispose(); impact.dispose(); assert.equal(scene.children.length, 0);
});
