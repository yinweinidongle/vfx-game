import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * A textured GLB bow fitted into the hand's local frame (+Y up, +X forward).
 * No GLB is requested until load() is explicitly called.
 *
 * Options:
 *   rotationXYZ: source alignment in radians, applied before normalization.
 *   height: final bow height in metres (default 1.85).
 *   gripPoint: optional source-model point that should sit in the palm.
 *              Without it, the oriented bounding-box centre is used.
 *   gripOffset: final hand-local translation in metres after normalization.
 *   stringAnchors: [[lowerX, lowerY, lowerZ], [upperX, upperY, upperZ]] in the
 *                  final hand-local frame; defaults to the procedural anchors.
 *   hideStringNodes: exact names of known separate string meshes to hide.
 *   embeddedStringCut: optional verified source-geometry bounding box for a
 *     merged static string: { min:[x,y,z], max:[x,y,z], axis:'y',
 *     maxRemovalFraction:0.08 }. Only triangles entirely inside the transverse
 *     bounds and intersecting the string's axial span are removed from a clone.
 *
 * Source GLB files and all PBR textures are preserved. Merged strings are kept
 * unless an explicit, geometrically verified embeddedStringCut is supplied.
 */
export class GeneratedBowAsset {
  constructor(config) {
    this.config = config;
    this.group = new THREE.Group();
    this.group.name = 'Generated frost bow asset';
    this.group.visible = false;
    this.available = false;
    this.disposed = false;
    this.model = null;
    this.materials = [];
    this.metadata = null;
    this.energyColor = new THREE.Color();
    this.loadId = 0;
  }

  async load(url, options = {}) {
    if (this.disposed) throw new Error('Cannot load a disposed GeneratedBowAsset.');
    const loadId = ++this.loadId;
    const gltf = await new GLTFLoader().loadAsync(url);
    if (this.disposed || loadId !== this.loadId) {
      disposeModel(gltf.scene);
      throw new DOMException('Bow loading was superseded or disposed.', 'AbortError');
    }

    const source = gltf.scene;
    let stringGeometryCuts;
    try {
      stringGeometryCuts = options.embeddedStringCut
        ? removeEmbeddedString(source, options.embeddedStringCut)
        : [];
    } catch (error) {
      disposeModel(source);
      throw error;
    }
    const alignment = new THREE.Group();
    const rotationXYZ = options.rotationXYZ ?? [0, 0, 0];
    alignment.rotation.set(...rotationXYZ);
    alignment.add(source);
    alignment.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(alignment);
    const size = bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y < 1e-6) {
      disposeModel(alignment);
      throw new Error('Generated bow has empty geometry or a zero vertical extent.');
    }
    const height = options.height ?? 1.85;
    if (!Number.isFinite(height) || height <= 0) {
      disposeModel(alignment);
      throw new Error('Bow height must be a positive number in metres.');
    }
    const scale = height / size.y;
    const pivot = options.gripPoint
      ? new THREE.Vector3(...options.gripPoint).applyEuler(alignment.rotation)
      : bounds.getCenter(new THREE.Vector3());
    alignment.position.copy(pivot).negate();
    const fitted = new THREE.Group();
    fitted.name = 'Normalised generated bow';
    fitted.scale.setScalar(scale);
    fitted.position.fromArray(options.gripOffset ?? [0, 0, 0]);
    fitted.add(alignment);

    const materialStates = [];
    const seenMaterials = new Set();
    const textures = new Set();
    const meshes = [];
    const hiddenStringNodes = [];
    let vertices = 0;
    let triangles = 0;
    source.traverse(object => {
      if (!object.isMesh) return;
      meshes.push(object);
      vertices += object.geometry.attributes.position?.count ?? 0;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3;
      object.castShadow = true;
      object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (seenMaterials.has(material)) continue;
        seenMaterials.add(material);
        // GLTFLoader already applies the correct color spaces and UV transforms.
        // Retain metalness, roughness, normals, alpha, and all generated textures.
        materialStates.push({
          material,
          emissive: material.emissive?.clone(),
          emissiveIntensity: material.emissiveIntensity ?? 1,
        });
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    const knownStringNames = new Set(options.hideStringNodes ?? []);
    for (const mesh of meshes) {
      const isSeparateString = meshes.length > 1 && /^(?:bow[ _-]?)?string(?:[._ -]\d+)?$/i.test(mesh.name);
      if (knownStringNames.has(mesh.name) || isSeparateString) {
        mesh.visible = false;
        hiddenStringNodes.push(mesh.name);
      }
    }
    fitted.updateMatrixWorld(true);
    const fittedBounds = new THREE.Box3().setFromObject(fitted);
    const anchors = options.stringAnchors ?? [[-0.27, -height * 0.475, 0], [-0.27, height * 0.475, 0]];
    const metadata = {
      url,
      height,
      scale,
      rotationXYZ: [...rotationXYZ],
      gripPoint: options.gripPoint ? [...options.gripPoint] : null,
      gripOffset: [...(options.gripOffset ?? [0, 0, 0])],
      stringAnchors: anchors.map(anchor => [...anchor]),
      orientedBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      fittedBounds: { min: fittedBounds.min.toArray(), max: fittedBounds.max.toArray() },
      meshes: meshes.length,
      vertices,
      triangles,
      materials: materialStates.length,
      textures: textures.size,
      hiddenStringNodes,
      stringGeometryCuts,
      embeddedStringPreserved: hiddenStringNodes.length === 0 && stringGeometryCuts.length === 0,
    };

    // Keep a previously loaded bow visible until the replacement is complete.
    if (this.model) {
      this.model.removeFromParent();
      disposeModel(this.model);
    }
    this.model = fitted;
    this.materials = materialStates;
    this.metadata = metadata;
    this.group.add(fitted);
    this.group.visible = true;
    this.available = true;
    return metadata;
  }

  update(skillTime, phase, config = this.config) {
    if (!this.available) return;
    const charging = phase === 'gather' || phase === 'charge';
    const charge = charging ? THREE.MathUtils.clamp(skillTime / 0.75, 0, 1) : 0;
    const release = phase === 'launch' || phase === 'flight'
      ? 0.1 * Math.exp(-Math.max(0, skillTime - 0.75) * 18)
      : 0;
    const energy = charge * charge * 0.16 + release;
    this.energyColor.set(config.frostColor).multiplyScalar(energy);
    for (const state of this.materials) {
      if (!state.emissive) continue;
      if (energy > 0) {
        state.material.emissive.copy(state.emissive).multiplyScalar(state.emissiveIntensity).add(this.energyColor);
        state.material.emissiveIntensity = 1;
      } else {
        state.material.emissive.copy(state.emissive);
        state.material.emissiveIntensity = state.emissiveIntensity;
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.loadId++;
    this.available = false;
    if (this.model) disposeModel(this.model);
    this.group.clear();
    this.group.removeFromParent();
    this.model = null;
    this.materials.length = 0;
  }
}

function disposeModel(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    object.skeleton?.dispose();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    texture.source?.data?.close?.();
  }
}

/** Remove only a verified isolated string corridor; never edit the source GLB. */
export function removeEmbeddedString(root, cut) {
  const min = cut.min;
  const max = cut.max;
  if (!Array.isArray(min) || !Array.isArray(max) || min.length !== 3 || max.length !== 3
    || min.some((value, index) => !Number.isFinite(value) || !Number.isFinite(max[index]) || value >= max[index])) {
    throw new Error('embeddedStringCut requires finite, ordered min/max source coordinates.');
  }
  const axis = { x: 0, y: 1, z: 2 }[cut.axis ?? 'y'];
  if (axis === undefined) throw new Error('embeddedStringCut axis must be x, y, or z.');
  const maxRemovalFraction = cut.maxRemovalFraction ?? 0.08;
  const reports = [];
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry.attributes.position) return;
    if (cut.meshNames && !cut.meshNames.includes(mesh.name)) return;
    const original = mesh.geometry;
    const position = original.attributes.position;
    const index = original.index;
    const count = index?.count ?? position.count;
    const keep = new Uint8Array(Math.floor(count / 3));
    let removed = 0;
    for (let triangle = 0; triangle < keep.length; triangle++) {
      let insideCorridor = true;
      let lowAlongAxis = Infinity;
      let highAlongAxis = -Infinity;
      for (let corner = 0; corner < 3 && insideCorridor; corner++) {
        const vertex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
        for (let component = 0; component < 3; component++) {
          const value = position.getComponent(vertex, component);
          if (component === axis) {
            lowAlongAxis = Math.min(lowAlongAxis, value);
            highAlongAxis = Math.max(highAlongAxis, value);
          } else if (value < min[component] || value > max[component]) {
            insideCorridor = false;
            break;
          }
        }
      }
      // Intersection, rather than centroid/vertex tests, also catches the long
      // skinny triangles produced when the original string is decimated.
      const remove = insideCorridor && lowAlongAxis <= max[axis] && highAlongAxis >= min[axis];
      keep[triangle] = remove ? 0 : 1;
      if (remove) removed++;
    }
    if (removed === 0) return;
    if (removed / keep.length > maxRemovalFraction) {
      throw new Error(`Refusing embedded string cut on ${mesh.name}: ${removed}/${keep.length} triangles exceeds the configured safety fraction.`);
    }
    const IndexArray = position.count > 65535 ? Uint32Array : Uint16Array;
    const keptIndices = new IndexArray((keep.length - removed) * 3);
    let cursor = 0;
    for (let triangle = 0; triangle < keep.length; triangle++) {
      if (!keep[triangle]) continue;
      for (let corner = 0; corner < 3; corner++) {
        keptIndices[cursor++] = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
      }
    }
    const clone = original.clone();
    clone.setIndex(new THREE.BufferAttribute(keptIndices, 1));
    clone.clearGroups();
    for (const group of original.groups) {
      let before = 0;
      let retained = 0;
      for (let triangle = 0; triangle < keep.length; triangle++) {
        if (!keep[triangle]) continue;
        const offset = triangle * 3;
        if (offset < group.start) before += 3;
        else if (offset < group.start + group.count) retained += 3;
      }
      if (retained > 0) clone.addGroup(before, retained, group.materialIndex);
    }
    clone.setDrawRange(0, keptIndices.length);
    mesh.geometry = clone;
    original.dispose();
    reports.push({
      mesh: mesh.name,
      removedTriangles: removed,
      originalTriangles: keep.length,
      retainedTriangles: keep.length - removed,
      min: [...min],
      max: [...max],
      axis: cut.axis ?? 'y',
    });
  });
  return reports;
}
