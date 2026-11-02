import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GeneratedBowAsset } from './GeneratedBowAsset.js';
import { ArcherPose } from './ArcherPose.js';

const clamp = THREE.MathUtils.clamp;

// This FBX references its author's local akai_normal.png, but that image was
// not embedded or supplied. Keep the embedded diffuse and mesh normals intact.
class ActorTextureLoader extends THREE.TextureLoader {
  load(url, ...callbacks) {
    if (/(?:^|[/\\])akai_normal\.png$/i.test(url) && !/^(?:blob:|data:)/.test(url)) {
      const texture = new THREE.Texture();
      texture.userData.missingExternalNormal = true;
      return texture;
    }
    return super.load(url, ...callbacks);
  }
}

/** The supplied Mixamo clips, sampled by skill time rather than wall time. */
export class Actors {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.group = new THREE.Group();
    this.group.name = 'Animated FBX actors';
    scene.add(this.group);
    this.status = { shooter: 'loading', target: 'loading' };
    this.time = 0;
    this.phase = 'idle';
    this.previousTime = -1;
    this.impactTime = null;
    this.shooter = null;
    this.target = null;
    this.temp = new THREE.Vector3();
    this.frostTint = new THREE.Color(config.frostColor);
    this.poseFallbackDirection = new THREE.Vector3();
    this.poseXAxis = new THREE.Vector3(1, 0, 0);
    this.poseTarget = new THREE.Vector3(7.5, 1.7, 0);
    this.embeddedTextureURLs = new Set();
    this.disposed = false;
    this.bow = this.createBow();
    this.proceduralBowParts = this.bow.children.filter(child => child !== this.string);
    this.stringRestX = -0.27;
    this.stringRestY = 0;
    this.stringRestZ = 0;
    this.generatedBow = new GeneratedBowAsset(config);
    this.bow.add(this.generatedBow.group);
    this.bow.position.set(-7.55, 1.65, 0.07);
    this.group.add(this.bow);

    // FBX embeds the original character textures as blob URLs. Keep them alive
    // until every image has decoded; loadAsync alone only waits for the FBX.
    const manager = new THREE.LoadingManager();
    const texturesReady = new Promise(resolve => {
      manager.onLoad = () => {
        for (const url of this.embeddedTextureURLs) URL.revokeObjectURL(url);
        this.embeddedTextureURLs.clear();
        resolve();
      };
    });
    manager.setURLModifier(url => {
      if (url.startsWith('blob:')) this.embeddedTextureURLs.add(url);
      return url;
    });
    manager.addHandler(/\.png$/i, new ActorTextureLoader(manager));
    const loader = new FBXLoader(manager);
    this.ready = Promise.all([
      this.loadActor(loader, 'standing-aim-recoil.fbx', 'shooter', -8.4, Math.PI / 2, 2.1),
      this.loadActor(loader, 'kick-reaction.fbx', 'target', 7.5, -Math.PI / 2, 2.2),
      texturesReady,
    ]).then(() => {
      if (!this.disposed) this.setTime(this.time, this.phase, this.impactTime ?? undefined);
      return this.status;
    });
  }

  async loadActor(loader, filename, role, x, rotation, height) {
    try {
      const root = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${filename}`);
      if (this.disposed) {
        this.disposeObject(root);
        return;
      }
      root.name = `${role} · user FBX`;
      const bounds = new THREE.Box3().setFromObject(root);
      const scale = height / (bounds.max.y - bounds.min.y);
      const wrapper = new THREE.Group();
      wrapper.position.set(x, -bounds.min.y * scale, 0);
      wrapper.rotation.y = rotation;
      root.scale.setScalar(scale);
      wrapper.add(root);
      const materials = [];
      const seenMaterials = new Set();
      const missingTextures = [];
      root.traverse(object => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (seenMaterials.has(material)) continue;
          seenMaterials.add(material);
          if (material.normalMap?.userData.missingExternalNormal) {
            material.normalMap.dispose();
            material.normalMap = null;
            missingTextures.push('akai_normal.png');
          }
          // Preserve imported Phong parameters, vertex colors, specular maps,
          // UV transforms, and alpha. Only color textures use sRGB decoding.
          if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
          if (material.emissiveMap) material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          if (material.normalMap) material.normalMap.colorSpace = THREE.NoColorSpace;
          if (material.specularMap) material.specularMap.colorSpace = THREE.NoColorSpace;
          materials.push({
            material,
            emissive: material.emissive?.clone(),
            emissiveIntensity: material.emissiveIntensity ?? 1,
          });
        }
        object.castShadow = true;
        object.receiveShadow = true;
        // Animated limbs may leave the bind-pose bounding sphere.
        object.frustumCulled = false;
      });
      const original = root.animations.find(clip => clip.duration > 0);
      const clip = original.clone();
      const hipTrack = clip.tracks.find(track => /Hips\.position$/.test(track.name));
      if (hipTrack) {
        // Retain vertical recoil/collapse, but keep both actors on their marks.
        for (let i = 0; i < hipTrack.values.length; i += 3) {
          hipTrack.values[i] = hipTrack.values[0];
          hipTrack.values[i + 2] = hipTrack.values[2];
        }
      }
      const mixer = new THREE.AnimationMixer(root);
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      mixer.setTime(0);
      this.group.add(wrapper);
      this[role] = { root, wrapper, materials, missingTextures, mixer, action, clip, hand: root.getObjectByName('mixamorigLeftHand'), drawHand: root.getObjectByName('mixamorigRightHand'), chest: root.getObjectByName('mixamorigSpine2') };
      if (role === 'shooter') this.archerPose = new ArcherPose(this.shooter, this.bow);
      this.status[role] = 'ready';
    } catch (error) {
      console.warn(`FBX ${role} could not load; using studio stand-in.`, error);
      if (this.disposed) return;
      const wrapper = this.createFallback();
      wrapper.position.x = x;
      this.group.add(wrapper);
      this[role] = { wrapper };
      this.status[role] = 'fallback';
    }
  }

  /** Load and fit an externally generated GLB without changing actor materials. */
  async loadGeneratedBow(url, options = {}) {
    this.status.bow = 'loading';
    try {
      const metadata = await this.generatedBow.load(url, options);
      if (this.disposed) return metadata;
      for (const part of this.proceduralBowParts) part.visible = false;
      const [lower, upper] = metadata.stringAnchors;
      this.stringPositions.set(lower, 0);
      this.stringPositions.set(upper, 6);
      this.stringRestX = (lower[0] + upper[0]) * 0.5;
      this.stringRestY = (lower[1] + upper[1]) * 0.5;
      this.stringRestZ = (lower[2] + upper[2]) * 0.5;
      this.stringPositions[4] = this.stringRestY;
      this.stringPositions[5] = this.stringRestZ;
      this.status.bow = 'ready';
      this.setTime(this.time, this.phase, this.impactTime ?? undefined);
      return metadata;
    } catch (error) {
      this.status.bow = this.generatedBow.available ? 'ready' : 'fallback';
      throw error;
    }
  }

  createFallback() {
    const mannequin = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: '#445968', roughness: 0.7, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.65, 4, 8), material);
    body.position.y = 1.25;
    mannequin.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.23, 1), material);
    head.position.y = 1.98;
    mannequin.add(head);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.62, 3, 6), material);
      leg.position.set(0, 0.45, side * 0.17);
      mannequin.add(leg);
    }
    return mannequin;
  }

  createBow() {
    const bow = new THREE.Group();
    bow.name = 'Frost bow';
    const metal = new THREE.MeshStandardMaterial({ color: '#64828f', metalness: 0.8, roughness: 0.3 });
    const accent = new THREE.MeshBasicMaterial({ color: '#72cfe4', transparent: true, opacity: 0.65 });
    for (const sign of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-0.025, 0);
      shape.lineTo(0.11, sign * 0.24);
      shape.lineTo(0.12, sign * 0.43);
      shape.lineTo(-0.03, sign * 0.68);
      shape.lineTo(-0.27, sign * 0.88);
      shape.lineTo(-0.18, sign * 0.63);
      shape.lineTo(0.01, sign * 0.39);
      shape.lineTo(-0.08, sign * 0.15);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.065, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 1, steps: 1 });
      geometry.translate(0, 0, -0.0325);
      const limb = new THREE.Mesh(geometry, metal);
      bow.add(limb);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.03, sign * 0.12, 0.045), new THREE.Vector3(0.07, sign * 0.38, 0.045),
        new THREE.Vector3(-0.08, sign * 0.64, 0.045), new THREE.Vector3(-0.26, sign * 0.87, 0.045),
      ]), accent);
      bow.add(line);
    }
    this.stringPositions = new Float32Array([-0.27, -0.88, 0, -0.5, 0, 0, -0.27, 0.88, 0]);
    const stringGeometry = new THREE.BufferGeometry();
    stringGeometry.setAttribute('position', new THREE.BufferAttribute(this.stringPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.string = new THREE.Line(stringGeometry, new THREE.LineBasicMaterial({ color: '#a9d7e0', transparent: true, opacity: 0.7 }));
    this.string.frustumCulled = false;
    bow.add(this.string);
    return bow;
  }

  setTime(skillTime, phase, impactBoundary) {
    const isImpact = phase === 'impact' || phase === 'dissipate';
    if (skillTime < this.previousTime || !isImpact) this.impactTime = null;
    if (isImpact && this.impactTime === null) {
      // Infer the impact boundary when seeking directly into the aftermath.
      this.impactTime = impactBoundary ?? (0.75 + (15.133 - 1.42 * this.config.arrowSize) / this.config.flightSpeed);
    }
    if (isImpact && impactBoundary !== undefined) this.impactTime = impactBoundary;
    this.time = skillTime;
    this.phase = phase;
    this.previousTime = skillTime;
    if (this.archerPose) this.archerPose.sample(skillTime, phase);
    if (this.target?.mixer) {
      const age = isImpact ? Math.max(0, skillTime - this.impactTime) : 0;
      this.target.action.paused = false;
      this.target.mixer.setTime(Math.min(age * 1.65, 4.12));
      // Leave the original diffuse texture readable beneath the frost shell.
      const frost = isImpact ? Math.exp(-age * 4) * 0.18 : 0;
      this.frostTint.set(this.effectColor || this.config.frostColor).multiplyScalar(frost);
      for (const state of this.target.materials) {
        if (!state.emissive) continue;
        // Add frost lighting without replacing any diffuse texture or tint,
        // then restore the original emissive state exactly when the cast ends.
        if (frost > 0) {
          state.material.emissive.copy(state.emissive).multiplyScalar(state.emissiveIntensity).add(this.frostTint);
          state.material.emissiveIntensity = 1;
        } else {
          state.material.emissive.copy(state.emissive);
          state.material.emissiveIntensity = state.emissiveIntensity;
        }
      }
    }
    this.updateBowString(skillTime);
    this.generatedBow.update(skillTime, phase, this.config);
  }


  updateBowString(skillTime) {
    this.stringPositions[3] = this.stringRestX;
    this.stringPositions[4] = this.stringRestY;
    this.stringPositions[5] = this.stringRestZ;
    if (this.archerPose && skillTime <= 0.75) {
      this.temp.copy(this.archerPose.nock);
      this.bow.worldToLocal(this.temp);
      this.stringPositions[3] = this.temp.x;
      this.stringPositions[4] = this.temp.y;
      this.stringPositions[5] = this.temp.z;
    } else if (this.archerPose && skillTime < 0.97) {
      const age = skillTime - 0.75;
      const spring = Math.exp(-age * 48) * Math.cos(age * 90);
      const released = this.archerPose.releaseNockLocal;
      this.stringPositions[3] += (released.x - this.stringRestX) * spring;
      this.stringPositions[4] += (released.y - this.stringRestY) * spring;
      this.stringPositions[5] += (released.z - this.stringRestZ) * spring;
    } else if (!this.archerPose && skillTime < 0.75) {
      this.stringPositions[3] -= 0.48 * clamp(skillTime / 0.75, 0, 1);
    }
    this.string.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Deterministic charge/release pose. Mutates caller-owned outputs, allocates
   * nothing, and samples only the shooter. The arrow points along local +X and
   * its tail is local X=-2, so the tail exactly touches the hooked fingers/string.
   * At time .75 (or later) return full draw BEFORE recoil. Returns true when the
   * real FBX is ready, false for the temporary fallback pose.
   */
  sampleArrowPose(skillTime, phase, impactBoundary, arrowSize, outPosition, outQuaternion) {
    const sampleTime = clamp(skillTime, 0, 0.75);
    if (this.archerPose) {
      const pose = this.archerPose.sample(sampleTime, sampleTime < 0.4 ? 'gather' : 'charge');
      outPosition.copy(pose.nock).addScaledVector(pose.direction, 2 * arrowSize);
      outQuaternion.copy(pose.quaternion);
      this.updateBowString(sampleTime);
      return true;
    }
    outPosition.set(-8.35, 1.7, 0.13);
    this.poseFallbackDirection.copy(this.poseTarget).sub(outPosition).normalize();
    outQuaternion.setFromUnitVectors(this.poseXAxis, this.poseFallbackDirection);
    outPosition.addScaledVector(this.poseFallbackDirection, 2 * arrowSize);
    return false;
  }

  /** Sample the animated upper chest for homing hits without touching shooter state. */
  sampleTargetPosition(skillTime, impactBoundary, outPosition) {
    if (!this.target?.mixer || !this.target.chest) {
      outPosition.copy(this.poseTarget);
      return false;
    }
    const age = Math.max(0, skillTime - (impactBoundary ?? this.impactTime ?? Infinity));
    this.target.action.paused = false;
    this.target.mixer.setTime(Math.min(age * 1.65, 4.12));
    this.target.root.updateWorldMatrix(true, true);
    // FBX bone units are centimetres. Offset from Spine2 toward the upper chest
    // and front surface, so the hit follows the torso while it bends and falls.
    outPosition.set(0, 12, 6);
    this.target.chest.localToWorld(outPosition);
    return true;
  }

  update(dt, skillTime, phase, impactBoundary) {
    this.setTime(skillTime, phase, impactBoundary);
  }

  disposeObject(object) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    object.traverse(child => {
      if (child.geometry) geometries.add(child.geometry);
      if (child.material) for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
      if (child.skeleton) child.skeleton.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
  }

  dispose() {
    this.disposed = true;
    for (const role of ['shooter', 'target']) {
      this[role]?.mixer?.stopAllAction();
      if (this[role]?.root) this[role].mixer.uncacheRoot(this[role].root);
    }
    this.generatedBow.dispose();
    this.disposeObject(this.group);
    this.group.removeFromParent();
  }
}
