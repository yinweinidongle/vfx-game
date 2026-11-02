import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StudioLighting } from '../src/scene/StudioLighting.js';

function setup() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#3b4852'); scene.fog = new THREE.FogExp2('#3b4852', .022); scene.environmentIntensity = .38;
  const renderer = { toneMappingExposure: 1.25, shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap } };
  const config = { frostColor: '#58dfff' }, lighting = new StudioLighting(scene, renderer, config);
  return { scene, renderer, config, lighting };
}

test('the focused key shadow contains both full actors and their surrounding contact area', () => {
  const { scene, lighting } = setup(); scene.updateMatrixWorld(true); lighting.key.shadow.updateMatrices(lighting.key);
  const camera = lighting.key.shadow.camera, point = new THREE.Vector3();
  for (const x of [-10, -8.4, 0, 7.5, 10]) for (const y of [0, 2.6]) for (const z of [-2.5, 2.5]) {
    point.set(x, y, z).project(camera);
    assert.ok(Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && Math.abs(point.z) <= 1, `shadow volume must include (${x}, ${y}, ${z})`);
  }
  const shadowLights = []; lighting.group.traverse(object => { if (object.isLight && object.castShadow) shadowLights.push(object); });
  assert.equal(shadowLights.length, 1); assert.equal(shadowLights[0], lighting.key);
  lighting.dispose();
});

test('spell bounce remains off-body, responds to seeks, and returns to darkness without extra light objects', () => {
  const { lighting, config } = setup(); const originalObjects = lighting.group.children.slice();
  const skill = { timeline: { time: .7, impactTime: 1.5, phase: 'charge' }, origin: new THREE.Vector3(-7.6, 1.7, 0), position: new THREE.Vector3(-7.6, 1.7, 0), target: new THREE.Vector3(7.5, 1.3, 0) };
  lighting.update(skill); const charge = lighting.bounce.intensity, chargePosition = lighting.bounce.position.clone();
  assert.ok(charge > 0);
  for (const time of [.75, .8, 1, 1.5, 1.55, 1.8, 2.3]) {
    skill.timeline.time = time; skill.timeline.phase = time >= 1.5 ? 'impact' : 'flight';
    skill.position.lerpVectors(skill.origin, skill.target, Math.min(1, (time - .75) / .75));
    lighting.update(skill);
    const actor = time >= 1.5 ? skill.target : skill.position;
    assert.ok(lighting.bounce.position.distanceTo(actor) > 3.5, 'local spell illumination must stay outside actor surfaces');
    assert.ok(lighting.bounce.intensity <= 3.8); assert.ok(Number.isFinite(lighting.bounce.intensity));
  }
  skill.timeline.time = .7; skill.timeline.phase = 'charge'; lighting.update(skill);
  assert.equal(lighting.bounce.intensity, charge); assert.ok(lighting.bounce.position.equals(chargePosition));
  config.frostColor = '#789cff'; lighting.update(skill); assert.ok(lighting.bounce.color.b > lighting.bounce.color.r);
  skill.timeline.phase = 'idle'; lighting.update(skill); assert.equal(lighting.bounce.intensity, 0);
  assert.deepEqual(lighting.group.children, originalObjects); lighting.dispose();
});

test('lighting disposal preserves other lights and restores scene grading ownership', () => {
  const scene = new THREE.Scene(), originalBackground = new THREE.Color('#445566'), originalFog = new THREE.FogExp2('#445566', .02);
  scene.background = originalBackground; scene.fog = originalFog; scene.environmentIntensity = .38;
  const effectLight = new THREE.PointLight('#58dfff', 1); scene.add(effectLight);
  const renderer = { toneMappingExposure: 1.25, shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap } };
  const lighting = new StudioLighting(scene, renderer, { frostColor: '#58dfff' });
  lighting.dispose(); lighting.dispose();
  assert.deepEqual(scene.children, [effectLight]); assert.equal(scene.background, originalBackground); assert.equal(scene.fog, originalFog);
  assert.equal(scene.environmentIntensity, .38); assert.equal(renderer.toneMappingExposure, 1.25);
  assert.equal(renderer.shadowMap.enabled, false); assert.equal(renderer.shadowMap.type, THREE.PCFSoftShadowMap);
});
