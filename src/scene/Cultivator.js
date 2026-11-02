import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { disposeSwordObject } from './SwordWeapon.js';

const smooth = THREE.MathUtils.smoothstep;
// This FBX interleaves 49 body/hair groups. Reorder triangle indices by material
// so both original materials survive while each renders once per pass.
export function compactMaterialGroups(geometry) {
  if(geometry.groups.length<3)return;
  const buckets=new Map(),source=geometry.index;
  for(const group of geometry.groups){
    if(!buckets.has(group.materialIndex))buckets.set(group.materialIndex,[]);
    const bucket=buckets.get(group.materialIndex);
    for(let i=group.start;i<group.start+group.count;i++)bucket.push(source?source.getX(i):i);
  }
  const index=[];geometry.clearGroups();
  for(const [material,bucket] of buckets){geometry.addGroup(index.length,bucket.length,material);for(const i of bucket)index.push(i);}
  geometry.setIndex(index);
}
// Hands gather, press the seal, then open to command the meteor storm.
export function cultivationClipTime(time, duration = 3.26666665) {
  const t = Math.max(0, time);
  if (t < .85) return .55 * smooth(t, 0, .85);
  if (t < 1.45) return .55 + smooth(t, .85, 1.45);
  if (t < 1.95) return 1.55 + .45 * smooth(t, 1.45, 1.95);
  if (t < 4.15) return 2 + .08 * Math.sin((t - 1.95) * 1.5);
  return Math.min(duration - .0001, 2 + (duration - 2) * smooth(t, 4.15, 5.6));
}

export class Cultivator {
  constructor(scene, config) {
    this.config = config; this.group = new THREE.Group(); this.group.name = 'Nascent soul cultivator';
    scene.add(this.group); this.wrapper = new THREE.Group(); this.wrapper.position.set(-8.4, 0, 0);
    this.wrapper.rotation.y = Math.PI / 2; this.group.add(this.wrapper); this.group.visible = false;
    this.root = null; this.materials = []; this.time = 0; this.disposed = false;
    this.left = new THREE.Vector3(); this.right = new THREE.Vector3(); this.status = 'loading';
    const manager = new THREE.LoadingManager(); const urls = new Set();
    const textures = new Promise(resolve => { manager.onLoad = () => { for (const url of urls) URL.revokeObjectURL(url); resolve(); }; });
    manager.setURLModifier(url => { if (url.startsWith('blob:')) urls.add(url); return url; });
    const base = import.meta.env?.BASE_URL ?? '/';
    this.ready = Promise.all([new FBXLoader(manager).loadAsync(`${base}models/standing-magic-area.fbx`).then(root => this.install(root)), textures]);
  }
  install(root) {
    if (this.disposed) { disposeSwordObject(root); return; }
    const box = new THREE.Box3().setFromObject(root), scale = 2.1 / (box.max.y - box.min.y);
    root.scale.setScalar(scale); root.position.y = -box.min.y * scale;
    const materials = new Set();
    root.traverse(o => {
      if (!o.isMesh) return;
      compactMaterialGroups(o.geometry);
      o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (materials.has(m)) continue; materials.add(m);
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        if (m.normalMap) m.normalMap.colorSpace = THREE.NoColorSpace;
        this.materials.push(m);
      }
    });
    this.clip = root.animations.find(a => a.duration > 0)?.clone();
    if (!this.clip) throw new Error('修士 FBX 缺少施法动画');
    const hip = this.clip.tracks.find(t => /Hips\.position$/.test(t.name));
    if (hip) for (let i = 3; i < hip.values.length; i += 3) { hip.values[i] = hip.values[0]; hip.values[i + 2] = hip.values[2]; }
    this.root = root; this.wrapper.add(root); this.mixer = new THREE.AnimationMixer(root);
    this.action = this.mixer.clipAction(this.clip); this.action.setLoop(THREE.LoopOnce, 1); this.action.clampWhenFinished = true; this.action.play();
    this.leftHand = root.getObjectByName('mixamorigLeftHand'); this.rightHand = root.getObjectByName('mixamorigRightHand');
    this.status = 'ready'; this.metadata = { source: 'standing-magic-area.fbx', character: 'Kachujin', sourceDuration: this.clip.duration, height: 2.1, materials: materials.size };
    this.update(this.time);
  }
  update(time) {
    this.time = time;
    if (!this.mixer || this.disposed) return;
    this.action.paused = false; this.mixer.setTime(cultivationClipTime(time, this.clip.duration));
    this.wrapper.position.y = .16 * smooth(time, .4, 1.1) * (1 - smooth(time, 4.4, 5.5));
    this.wrapper.updateWorldMatrix(true, true);
    this.leftHand?.getWorldPosition(this.left); this.rightHand?.getWorldPosition(this.right);
  }
  setVisible(value) { this.group.visible = value; }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.mixer?.stopAllAction(); if (this.root) this.mixer?.uncacheRoot(this.root);
    disposeSwordObject(this.wrapper); this.group.removeFromParent();
  }
}
