import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FrostParticles, createCrystalGeometry } from '../src/vfx/FrostParticles.js';
import { IceImpact } from '../src/vfx/IceImpact.js';
import { IceArrowSkill } from '../src/vfx/IceArrowSkill.js';
import { defaults } from '../src/VFXConfig.js';

// These tests exercise the CPU lifecycle using actual Three.js objects. A browser
// render remains necessary to verify GLSL compilation and final visual quality.
globalThis.window = { devicePixelRatio: 1 };

function setup(config = { ...defaults }) {
  const scene = new THREE.Scene();
  return { scene, config, particles: new FrostParticles(scene, config), impact: new IceImpact(scene, config), position: new THREE.Vector3(-7.5, 1.7, 0) };
}
function finiteBuffers(vfx) {
  assert.ok(vfx.particles.positions.every(Number.isFinite), 'particle positions must stay finite');
  assert.ok(vfx.particles.shards.instanceMatrix.array.every(Number.isFinite), 'particle crystals must stay finite');
  assert.ok(vfx.impact.shards.instanceMatrix.array.every(Number.isFinite), 'impact crystals must stay finite');
  assert.ok(vfx.particles.opacities.every(x => x >= 0 && x <= 1), 'particle alpha must stay in range');
  assert.ok(vfx.impact.fades.every(x => x >= 0 && x <= 1), 'fragment alpha must stay in range');
}
function runCycle(vfx, hz = 60) {
  const { particles, impact, position, config } = vfx;
  particles.reset(); impact.reset();
  let launched = false, hit = false;
  for (let frame = 1; frame <= Math.round(2.6 * hz); frame++) {
    const time = frame / hz;
    const phase = time < .4 ? 'gather' : time < .75 ? 'charge' : time < .9 ? 'launch' : time < 1.5 ? 'flight' : time < 1.85 ? 'impact' : time < 2.6 ? 'dissipate' : 'idle';
    position.set(time < .75 ? -7.5 : Math.min(7.5, -7.5 + (time - .75) * 20), 1.7, 0);
    if (time >= .75 && !launched) { launched = true; particles.burst(new THREE.Vector3(-7.5, 1.7, 0), 'launch', config); }
    if (time >= 1.5 && !hit) { hit = true; particles.burst(position, 'impact', config); impact.trigger(position, config); }
    particles.update(1 / hz, time, position, phase, config);
    impact.update(1 / hz, time, config);
    if (frame % 15 === 0) finiteBuffers(vfx);
  }
}
function assertExtinct({ particles, impact }) {
  assert.ok(particles.lives.every(x => x === 0));
  assert.ok(particles.opacities.every(x => x === 0));
  assert.ok(particles.sizes.every(x => x === 0));
  assert.ok(particles.shardFade.every(x => x === 0));
  assert.ok(particles.shardData.every(x => x.life === 0));
  assert.equal(impact.active, false);
  assert.equal(impact.group.visible, false);
  assert.equal(impact.light.intensity, 0);
  assert.ok(impact.fades.every(x => x === 0));
}
function resources(scene) {
  const objects = [], geometries = new Set(), materials = new Set();
  scene.traverse(object => {
    objects.push(object);
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  return { objects, geometries: [...geometries], materials: [...materials] };
}

test('crystal fragment geometry has thickness and valid flat normals', () => {
  const geometry = createCrystalGeometry(); geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(size.x > .2 && size.y > 1 && size.z > .1);
  const normals = geometry.getAttribute('normal').array;
  for (let i = 0; i < normals.length; i += 3) assert.ok(Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1) < 1e-5);
  geometry.dispose();
});

test('all transient VFX expire by the nominal 2.6 second endpoint', () => {
  const vfx = setup(); runCycle(vfx, 120); finiteBuffers(vfx); assertExtinct(vfx);
  vfx.particles.dispose(); vfx.impact.dispose(); assert.equal(vfx.scene.children.length, 0);
});

test('twenty dense cycles reuse scene objects, geometry, materials and GPU buffers', () => {
  const vfx = setup({ ...defaults, particleDensity: 2, shardCount: 90, impactRadius: 3 });
  const initial = resources(vfx.scene);
  const pointBuffer = vfx.particles.geometry.getAttribute('position').array;
  const particleMatrixBuffer = vfx.particles.shards.instanceMatrix.array;
  const impactMatrixBuffer = vfx.impact.shards.instanceMatrix.array;
  for (let cycle = 0; cycle < 20; cycle++) {
    runCycle(vfx); assertExtinct(vfx);
    const current = resources(vfx.scene);
    assert.deepEqual(current, initial);
    assert.equal(vfx.particles.geometry.getAttribute('position').array, pointBuffer);
    assert.equal(vfx.particles.shards.instanceMatrix.array, particleMatrixBuffer);
    assert.equal(vfx.impact.shards.instanceMatrix.array, impactMatrixBuffer);
    assert.equal(vfx.particles.positions.length, 3000);
    assert.equal(vfx.particles.shardData.length, 160);
    assert.equal(vfx.impact.shards.count, 90);
  }
  vfx.particles.dispose(); vfx.impact.dispose();
});

test('reset immediately clears an active burst and makes replay deterministic', () => {
  const vfx = setup(); const { particles, impact, position, config } = vfx;
  const sample = () => {
    particles.burst(position, 'impact', config); impact.trigger(position, config);
    for (let i = 0; i < 12; i++) { particles.update(1 / 60, i / 60, position, 'impact', config); impact.update(1 / 60, i / 60, config); }
    return Array.from(particles.positions.slice(0, 75 * 3));
  };
  const first = sample(); assert.equal(impact.active, true);
  particles.reset(); impact.reset(); assertExtinct(vfx);
  assert.equal(particles.cursor, 0); assert.equal(particles.shardCursor, 0);
  assert.deepEqual(sample(), first);
  particles.reset(); impact.reset(); assertExtinct(vfx);
  particles.dispose(); impact.dispose();
});

test('live impact settings update without replacing resources and dispose releases them', () => {
  const vfx = setup(); const { impact, particles, position, config } = vfx;
  const owned = resources(vfx.scene); let disposed = 0;
  for (const resource of [...owned.geometries, ...owned.materials]) resource.addEventListener('dispose', () => disposed++);
  impact.trigger(position, config); impact.update(.2, 1.7, config);
  config.frostColor = '#789cff'; config.impactRadius = 3; config.shardCount = 500;
  impact.update(.01, 1.71, config);
  assert.equal(impact.shards.count, impact.maxShards);
  assert.equal(impact.material.uniforms.uColor.value.getHexString(), '789cff');
  assert.ok(Math.abs(impact.cracks.scale.x - 2.8 * 3 / 1.6) < 1e-10);
  assert.deepEqual(resources(vfx.scene), owned); finiteBuffers(vfx);
  particles.dispose(); impact.dispose();
  assert.equal(disposed, owned.geometries.length + owned.materials.length);
  assert.equal(vfx.scene.children.length, 0);
});


test('integrated skill extinguishes extreme configurations and survives twenty restarts', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1.5, .1, 100);
  camera.position.set(0, 8, 20); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  const config = { ...defaults, autoLoop: false, flightSpeed: 10, trailLength: 12, particleDensity: 2, shardCount: 90, impactRadius: 3 };
  const skill = new IceArrowSkill(scene, camera, config);
  const initial = resources(scene);
  const history = skill.trail.history;
  const ribbonBuffers = skill.trail.layers.map(layer => layer.positions);
  for (let cycle = 0; cycle < 20; cycle++) {
    if (cycle === 10) { config.flightSpeed = 40; skill.timeline.setSpeed(40); }
    skill.fire();
    while (skill.timeline.time < skill.timeline.duration - 1e-10) {
      skill.step(Math.min(1 / 90, skill.timeline.duration - skill.timeline.time));
    }
    assert.equal(skill.timeline.phase, 'idle');
    assert.equal(skill.arrow.group.visible, false);
    assert.equal(skill.light.intensity, 0);
    assertExtinct({ particles: skill.particles, impact: skill.impact });
    for (const layer of skill.trail.layers) {
      assert.equal(layer.geometry.drawRange.count, 0, 'no ribbon remains at the exact timeline endpoint');
      assert.ok(layer.positions.every(Number.isFinite));
    }
    assert.equal(skill.trail.history, history);
    assert.deepEqual(skill.trail.layers.map(layer => layer.positions), ribbonBuffers);
    assert.deepEqual(resources(scene), initial);
  }
  skill.dispose(); assert.equal(scene.children.length, 0);
});
test('the crystal tip reaches the target on the impact frame at the configured speed', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const config = { ...defaults, autoLoop: false };
  const skill = new IceArrowSkill(scene, camera, config);
  assert.ok(Math.abs(skill.timeline.duration-(.75 + skill.origin.distanceTo(skill.flightEnd)/config.flightSpeed + 1.1))<1e-10);
  const totalFlight = skill.timeline.impactTime-.75;
  assert.ok(Math.abs(skill.flightEnd.distanceTo(skill.origin)/totalFlight-config.flightSpeed)<1e-10);
  skill.seek(skill.timeline.impactTime);
  assert.equal(skill.hit, true);
  assert.ok(Math.abs(skill.position.x+1.42*config.arrowSize-skill.target.x)<1e-6);
  skill.dispose();
});

test('impact consumes the arrow into the contact plane and drains the ribbon into that same point', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1.5, .1, 100);
  camera.position.set(0, 5, 12); camera.lookAt(5, 1.7, 0); camera.updateMatrixWorld();
  const config = { ...defaults, autoLoop: false };
  const skill = new IceArrowSkill(scene, camera, config);
  const hit = skill.timeline.impactTime;
  skill.seek(hit + .09);
  assert.equal(skill.arrow.group.visible, true, 'solid body must not disappear on the contact frame');
  assert.ok(Math.abs(skill.arrow.uniforms.uImpact.value - .5) < 1e-8);
  skill.arrow.group.updateMatrixWorld(true);
  const cutEdge = new THREE.Vector3(1.42 - 3.42 * .5, 0, 0).applyMatrix4(skill.arrow.group.matrixWorld);
  assert.ok(cutEdge.distanceTo(skill.target) < 1e-6, 'the consuming edge must remain on the enemy contact plane');
  for (const layer of skill.trail.layers) {
    const p = layer.positions;
    const head = new THREE.Vector3((p[0]+p[3])*.5, (p[1]+p[4])*.5, (p[2]+p[5])*.5);
    assert.ok(head.distanceTo(skill.target) < 1e-5, 'ribbon must meet the impact, not hang behind the expired arrow');
  }
  skill.seek(hit + .19); assert.equal(skill.arrow.group.visible, false);
  skill.seek(hit + .35);
  assert.ok(skill.trail.layers.every(layer => layer.geometry.drawRange.count === 0));
  skill.seek(.6);
  assert.equal(skill.arrow.uniforms.uImpact.value, 0);
  assert.equal(skill.trail.impactActive, false);
  skill.dispose(); assert.equal(scene.children.length, 0);
});

test('a sampled release socket controls actual trajectory and remains stable across timeline seeks', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 5, 15); camera.updateMatrixWorld();
  const skill = new IceArrowSkill(scene, camera, { ...defaults, autoLoop: false });
  const xAxis = new THREE.Vector3(1,0,0), direction = new THREE.Vector3();
  const provider = {
    sampleArrowPose(t, phase, boundary, size, pos, quat) {
      pos.set(-8.4 - Math.min(t,.75)*.2, 1.72, .15);
      direction.subVectors(skill.target, pos).normalize();
      quat.setFromUnitVectors(xAxis, direction); pos.addScaledVector(direction, 2*size);
    },
    sampleTargetPosition(t, boundary, out) { out.copy(skill.target); out.y -= Math.max(0,t-boundary)*.5; },
  };
  skill.bindActors(provider); skill.seek(.65);
  const charged = skill.position.clone(); skill.seek(.2); skill.seek(.65);
  assert.ok(skill.position.distanceTo(charged) < 1e-10);
  skill.seek(skill.timeline.impactTime); skill.arrow.group.updateMatrixWorld(true);
  const tip = new THREE.Vector3(1.42,0,0).applyMatrix4(skill.arrow.group.matrixWorld);
  assert.ok(tip.distanceTo(skill.target) < 1e-6);
  skill.dispose();
});

test('camera cuts reorient ribbons immediately without advancing or re-emitting the skill', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1.6, .1, 120);
  camera.position.set(0, 4, 12); camera.lookAt(0, 1.7, 0); camera.updateMatrixWorld();
  const skill = new IceArrowSkill(scene, camera, { ...defaults, autoLoop: false });
  skill.seek(1.14);
  const time = skill.timeline.time, trailAge = skill.trail.age;
  const history = skill.trail.history.slice(), count = skill.trail.count;
  const lives = skill.particles.lives.slice();
  const oldRibbon = skill.trail.layers[0].positions.slice();
  camera.position.set(4, 1.9, 4); camera.lookAt(skill.position); camera.updateMatrixWorld();
  skill.refreshView();
  assert.equal(skill.timeline.time, time); assert.equal(skill.trail.age, trailAge);
  assert.equal(skill.trail.count, count); assert.deepEqual(skill.trail.history, history);
  assert.deepEqual(skill.particles.lives, lives);
  assert.notDeepEqual(skill.trail.layers[0].positions, oldRibbon);
  const fittedRibbon = skill.trail.layers[0].positions.slice();
  skill.refreshView(); assert.deepEqual(skill.trail.layers[0].positions, fittedRibbon);
  assert.ok(skill.homing.trailPositions.every(Number.isFinite));
  skill.dispose();
});
