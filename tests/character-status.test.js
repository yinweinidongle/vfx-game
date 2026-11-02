import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CharacterStatusFX } from '../src/vfx/CharacterStatusFX.js';
import { defaults } from '../src/VFXConfig.js';

function makeActors(scene) {
  const shooterWrapper = new THREE.Group(); shooterWrapper.position.x = -8.4; scene.add(shooterWrapper);
  const hand = new THREE.Object3D(); hand.position.set(.8, 1.65, .05); shooterWrapper.add(hand);
  const targetWrapper = new THREE.Group(); targetWrapper.position.x = 7.5; scene.add(targetWrapper);
  const root = new THREE.Group(); targetWrapper.add(root);
  const geometry = new THREE.BoxGeometry(.4, 1.2, .25);
  const count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { indices[i * 4] = i < count / 2 ? 1 : 0; weights[i * 4] = 1; }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const material = new THREE.MeshPhongMaterial({ color: '#b34e31', emissive: '#090504', shininess: 37 });
  const mesh = new THREE.SkinnedMesh(geometry, material); root.add(mesh);
  const hips = new THREE.Bone(); hips.name = 'mixamorigHips'; hips.position.y = .7;
  const head = new THREE.Bone(); head.name = 'mixamorigHead'; head.position.y = .9; hips.add(head);
  const leg = new THREE.Bone(); leg.name = 'mixamorigLeftLeg'; leg.position.set(.1, -.3, 0); hips.add(leg);
  mesh.add(hips); mesh.bind(new THREE.Skeleton([hips, head, leg])); scene.updateMatrixWorld(true);
  return { shooter: { wrapper: shooterWrapper, hand }, target: { wrapper: targetWrapper, root }, original: { mesh, geometry, material } };
}

test('character states follow analytic skill time, survive seeks, and disappear at the endpoint', () => {
  const scene = new THREE.Scene(), actors = makeActors(scene);
  const status = new CharacterStatusFX(scene, actors, { ...defaults });
  status.update(0, .6, 'charge', 1.5);
  assert.ok(status.chargeStrength > .9); assert.equal(status.freezeStrength, 0);
  assert.equal(status.targetGroup.visible, false); assert.equal(status.crystals.visible, false);
  assert.ok(status.handLight.intensity > 0);
  status.update(0, 1.7, 'impact', 1.5);
  assert.equal(status.shooterGroup.visible, false); assert.equal(status.handLight.intensity, 0);
  assert.ok(status.freezeStrength > .9); assert.equal(status.crystals.visible, true);
  const firstPose = status.crystals.instanceMatrix.array.slice();
  status.update(0, .4, 'charge', 1.5); status.update(0, 1.7, 'impact', 1.5);
  assert.deepEqual(status.crystals.instanceMatrix.array, firstPose);
  status.update(0, 2.6, 'idle', 1.5);
  assert.equal(status.shooterGroup.visible, false); assert.equal(status.targetGroup.visible, false);
  assert.equal(status.crystals.visible, false); assert.ok(status.coatings.every(({ mesh }) => !mesh.visible));
  assert.ok(status.crystalFade.every(x => x === 0)); status.dispose();
});

test('separate skinned ice coating preserves imported materials and masks the head', () => {
  const scene = new THREE.Scene(), actors = makeActors(scene), { mesh, geometry, material } = actors.original;
  const originalColor = material.color.clone(), originalEmissive = material.emissive.clone();
  const status = new CharacterStatusFX(scene, actors, { ...defaults });
  status.update(0, 1.7, 'impact', 1.5);
  assert.equal(status.coatings.length, 1);
  const overlay = status.coatings[0].mesh;
  assert.equal(overlay.isSkinnedMesh, true); assert.equal(overlay.skeleton, mesh.skeleton);
  assert.notEqual(overlay.geometry, geometry); assert.notEqual(overlay.material, material);
  const mask = overlay.geometry.attributes.aFreezeMask.array;
  for (let i = 0; i < mask.length; i++) assert.equal(mask[i], i < mask.length / 2 ? 0 : 1);
  assert.equal(mesh.material, material); assert.deepEqual(material.color, originalColor);
  assert.deepEqual(material.emissive, originalEmissive); assert.equal(material.shininess, 37);
  let originalDisposed = false; material.addEventListener('dispose', () => { originalDisposed = true; });
  status.dispose(); assert.equal(originalDisposed, false); assert.equal(mesh.parent, actors.target.root);
  assert.equal(actors.target.root.children.length, 1);
});

test('status buffers and overlays stay fixed through twenty releases and parameter changes', () => {
  const scene = new THREE.Scene(), actors = makeActors(scene), config = { ...defaults };
  const status = new CharacterStatusFX(scene, actors, config); status.update(0, 0, 'gather', 1.5);
  const geometry = status.coatings[0].mesh.geometry, matrices = status.crystals.instanceMatrix.array;
  const mask = geometry.attributes.aFreezeMask.array, snow = status.shooterSnow.geometry.attributes.aSeed.array;
  for (let i = 0; i < 20; i++) {
    config.frostColor = i % 2 ? '#789cff' : '#58dfff'; config.particleDensity = i % 2 ? 2 : .2;
    for (let frame = 0; frame <= 156; frame++) {
      const time = frame / 60, phase = time < .75 ? 'charge' : time < 1.5 ? 'flight' : time < 2.6 ? 'impact' : 'idle';
      status.update(1 / 60, time, phase, 1.5);
      assert.ok(status.crystals.instanceMatrix.array.every(Number.isFinite));
    }
    status.reset(); assert.equal(status.coatings.length, 1); assert.equal(status.coatings[0].mesh.geometry, geometry);
    assert.equal(status.crystals.instanceMatrix.array, matrices); assert.equal(geometry.attributes.aFreezeMask.array, mask);
    assert.equal(status.shooterSnow.geometry.attributes.aSeed.array, snow);
    assert.ok(status.shooterSnow.geometry.drawRange.count <= 128);
  }
  status.dispose(); status.dispose(); assert.equal(scene.children.length, 2);
});
