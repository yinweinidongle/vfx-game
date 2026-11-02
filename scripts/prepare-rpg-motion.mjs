import { readFile, writeFile } from 'node:fs/promises';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Retarget the official Three.js Mixamo locomotion sample offline. Rotate motion
// in world space relative to both bind poses; do not copy incompatible local axes.
const bytes = await readFile('assets/rpg-source/mixamo-soldier.glb');
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
const binOffset = 28 + bytes.readUInt32LE(12);
function values(index) {
  const a = json.accessors[index], v = json.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type], data = [];
  for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) {
    data.push(bytes.readFloatLE(binOffset + (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || n * 4) + c * 4));
  }
  return data;
}
const nodes = json.nodes.map(n => {
  const o = n.name?.includes('mixamorig:') ? new T.Bone() : new T.Group();
  o.name = (n.name || '').replace(':', '');
  if (n.translation) o.position.fromArray(n.translation);
  if (n.rotation) o.quaternion.fromArray(n.rotation).normalize();
  if (n.scale) o.scale.fromArray(n.scale);
  return o;
});
json.nodes.forEach((n, i) => n.children?.forEach(child => nodes[i].add(nodes[child])));
const source = nodes[0], sourceBones = nodes.filter(n => n.isBone);
source.updateMatrixWorld(true);
const sourceRest = new Map(sourceBones.map(b => [b.name, b.getWorldQuaternion(new T.Quaternion())]));
const sourceHip = source.getObjectByName('mixamorigHips');
const sourceHipPosition = sourceHip.getWorldPosition(new T.Vector3());
const clips = json.animations.filter(a => a.name !== 'TPose').map(a => new T.AnimationClip(a.name, -1, a.channels.map(c => {
  const s = a.samplers[c.sampler], name = nodes[c.target.node].name;
  const Track = c.target.path === 'rotation' ? T.QuaternionKeyframeTrack : T.VectorKeyframeTrack;
  return new Track(name + '.' + ({ rotation: 'quaternion', translation: 'position', scale: 'scale' }[c.target.path]), values(s.input), values(s.output));
})));
const mixer = new T.AnimationMixer(source);
globalThis.window = { URL: { createObjectURL: () => '' } };
globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(value) {} }) };
const q = new T.Quaternion(), parentQ = new T.Quaternion(), delta = new T.Vector3();
for (const [name, file] of [['sword', 'standing-melee-360'], ['ice', 'standing-aim-recoil'], ['cultivator', 'standing-magic-area'], ['enemy', 'kick-reaction']]) {
  const fileBytes = await readFile(`public/models/${file}.fbx`);
  const target = new FBXLoader().parse(fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength), '');
  const skeleton = target.getObjectByProperty('isSkinnedMesh', true).skeleton;
  skeleton.pose(); target.updateMatrixWorld(true);
  const bones = skeleton.bones.filter(b => sourceRest.has(b.name));
  // Parent-first order is required for world-to-local quaternion conversion.
  bones.sort((a, b) => { const depth = o => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; }; return depth(a) - depth(b); });
  const rest = new Map(bones.map(b => [b.name, b.getWorldQuaternion(new T.Quaternion())]));
  const hip = target.getObjectByName('mixamorigHips'), hipPosition = hip.position.clone();
  const worldHip = hip.getWorldPosition(new T.Vector3());
  const ratio = worldHip.y / sourceHipPosition.y;
  const alignment = rest.get(hip.name).clone().multiply(sourceRest.get(hip.name).clone().invert());
  const inverseAlignment = alignment.clone().invert(), results = [];
  for (const clip of clips) {
    mixer.stopAllAction(); const action = mixer.clipAction(clip); action.play();
    const count = Math.ceil(clip.duration * 30) + 1, times = [];
    const rotations = new Map(bones.map(b => [b.name, []])), positions = [];
    for (let frame = 0; frame < count; frame++) {
      const time = Math.min(frame / 30, clip.duration - 1e-5); times.push(time);
      mixer.setTime(time); source.updateMatrixWorld(true);
      for (const bone of bones) {
        const original = source.getObjectByName(bone.name);
        q.copy(alignment).multiply(original.getWorldQuaternion(new T.Quaternion()))
          .multiply(sourceRest.get(bone.name).clone().invert()).multiply(inverseAlignment).multiply(rest.get(bone.name));
        bone.parent.getWorldQuaternion(parentQ).invert(); bone.quaternion.copy(parentQ).multiply(q).normalize();
        if (bone === hip) {
          original.getWorldPosition(delta).sub(sourceHipPosition).applyQuaternion(alignment).multiplyScalar(ratio);
          bone.position.copy(hipPosition); bone.position.y += delta.y;
          positions.push(bone.position.x, bone.position.y, bone.position.z);
        }
        bone.updateMatrixWorld(true); rotations.get(bone.name).push(...bone.quaternion.toArray());
      }
    }
    const tracks = bones.map(b => new T.QuaternionKeyframeTrack(b.name + '.quaternion', times, rotations.get(b.name)));
    tracks.push(new T.VectorKeyframeTrack(hip.name + '.position', times, positions));
    results.push(T.AnimationClip.toJSON(new T.AnimationClip(clip.name, clip.duration, tracks).optimize()));
  }
  await writeFile(`public/game/models/${name}-motion.json`, JSON.stringify(results));
  console.log(name, bones.length, 'bones;', results.map(c => c.name).join(', '));
}
