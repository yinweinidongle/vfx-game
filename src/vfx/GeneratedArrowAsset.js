import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const PROGRAM_VERSION = 'frostbound-generated-arrow-pbr-v2-impact';
const FROST_VERTEX_DECLARATIONS = /* glsl */`
  attribute vec3 aFrostArrowPosition;
  varying vec3 vFrostArrowPosition;
`;
const FROST_FRAGMENT_DECLARATIONS = /* glsl */`
  uniform float uFrostTime;
  uniform float uFrostFormation;
  uniform float uFrostCharge;
  uniform float uFrostCompression;
  uniform float uFrostDetailStrength;
  uniform float uFrostImpact;
  uniform vec3 uFrostColor;
  varying vec3 vFrostArrowPosition;
  float frostArrowHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
`;
const FROST_REVEAL = /* glsl */`
  float frostArrowAxial = clamp((vFrostArrowPosition.x + 2.0) / 3.42, 0.0, 1.0);
  float frostArrowGrain = frostArrowHash(floor(vFrostArrowPosition * 180.0));
  float frostArrowFront = frostArrowAxial + (frostArrowGrain - 0.5) * 0.018;
  if (uFrostFormation <= 0.001 || frostArrowFront > uFrostFormation + 0.012) discard;
  float frostArrowCell = frostArrowHash(floor(vFrostArrowPosition * vec3(18.0, 31.0, 31.0)));
  float frostArrowImpactField = 1.0 - frostArrowAxial + (frostArrowCell - 0.5) * 0.085
    + sin(vFrostArrowPosition.y * 49.0 + vFrostArrowPosition.z * 35.0) * 0.012;
  float frostArrowRemaining = frostArrowImpactField - uFrostImpact;
  if (uFrostImpact >= 0.9999 || (uFrostImpact > 0.0 && frostArrowRemaining < 0.0)) discard;
  float frostArrowFractureEdge = (1.0 - smoothstep(0.0, 0.065, frostArrowRemaining))
    * step(0.0001, uFrostImpact);
  float frostArrowImpactSpark = step(0.82, frostArrowCell)
    * pow(0.5 + 0.5 * sin(uFrostTime * 89.0 + frostArrowCell * 73.0), 4.0);
`;
const FROST_EMISSION = /* glsl */`
  // Keep the generated albedo, normal, occlusion and PBR lighting intact.
  // A narrow travelling highlight and restrained edge light add magic on top.
  float frostArrowFresnel = pow(max(0.0, 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)))), 4.5);
  float frostArrowFlow = fract(frostArrowAxial * 1.8 - uFrostTime * 1.7);
  frostArrowFlow = exp(-pow(abs((frostArrowFlow - 0.5) * 17.0), 2.0));
  float frostArrowVein = pow(0.5 + 0.5 * sin(vFrostArrowPosition.x * 33.0
    + vFrostArrowPosition.y * 47.0 - vFrostArrowPosition.z * 29.0), 28.0);
  float frostArrowFormEdge = exp(-abs(frostArrowFront - uFrostFormation) * 140.0)
    * (1.0 - smoothstep(0.96, 1.0, uFrostFormation));
  float frostArrowGlow = frostArrowFresnel * 0.18
    + frostArrowFlow * (0.025 + frostArrowVein * 0.09)
    + frostArrowFormEdge * 0.32 + uFrostCompression * 0.14;
  totalEmissiveRadiance += uFrostColor * frostArrowGlow * uFrostDetailStrength;
  totalEmissiveRadiance += mix(uFrostColor, vec3(0.72, 1.0, 1.12), 0.4)
    * frostArrowFractureEdge * (0.72 + frostArrowImpactSpark * 1.35);
`;

function meshList(root) {
  const meshes = [];
  root.traverse(object => { if (object.isMesh && object.geometry?.attributes.position) meshes.push(object); });
  return meshes;
}

function texturesOf(material, result) {
  for (const value of Object.values(material)) {
    if (value?.isTexture) result.add(value);
  }
  // ShaderMaterial is uncommon in GLB, but retaining/disposal still supports it.
  if (material.uniforms) {
    for (const uniform of Object.values(material.uniforms)) if (uniform?.value?.isTexture) result.add(uniform.value);
  }
}

function disposeRoot(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        texturesOf(material, textures);
      }
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
  root.removeFromParent();
}

function axisVector(axis) {
  if (Array.isArray(axis)) {
    const vector = new THREE.Vector3().fromArray(axis);
    if (!Number.isFinite(vector.lengthSq()) || vector.lengthSq() < 0.000001) throw new Error('forwardAxis must be a nonzero vector.');
    return vector.normalize();
  }
  const axes = {
    X: [1, 0, 0], '+X': [1, 0, 0], '-X': [-1, 0, 0],
    Y: [0, 1, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0],
    Z: [0, 0, 1], '+Z': [0, 0, 1], '-Z': [0, 0, -1],
  };
  const values = axes[String(axis ?? '+X').toUpperCase()];
  if (!values) throw new Error('forwardAxis must be +X, -X, +Y, -Y, +Z, -Z or a 3-element vector.');
  return new THREE.Vector3(...values);
}

/**
 * A generated GLB projectile with its original textured PBR appearance.
 *
 * const asset = new GeneratedArrowAsset(config);
 * scene.add(asset.group);
 * await asset.load('/models/generated-ice-arrow.glb', { forwardAxis: '+Y' });
 *
 * Options:
 * - forwardAxis: source-space direction of the arrow tip (default +X).
 * - rotationXYZ: additional Euler XYZ rotation in radians, AFTER axis alignment.
 * - width: maximum transverse span after normalization (default 1.12).
 * - preserveAspect: keep uniform scale (default false). Otherwise only transverse
 *   scale is adjusted to width; the local X extents are always [-2, +1.42].
 * - detailStrength: procedural frost-emission multiplier (default 1).
 * - roughness / envMapIntensity: optional scalar overrides; all maps are retained.
 * - core: add a very thin emissive inner spine (default false).
 * - dracoDecoderPath: optional local decoder directory; no remote URL is assumed.
 * - meshoptDecoder: optional already-loaded MeshoptDecoder object.
 * - ktx2Loader: optional configured KTX2Loader for compressed texture extensions.
 *
 * Parent owns group.position, orientation and visibility. Call update with the
 * same timeline parameters as IceArrowMesh. No new objects are made per frame.
 */
export class GeneratedArrowAsset {
  constructor(config) {
    this.config = config;
    this.group = new THREE.Group();
    this.group.name = 'Generated textured ice arrow';
    this.available = false;
    this.ready = Promise.resolve(this);
    this.metadata = null;
    this._asset = null;
    this._core = null;
    this._request = 0;
    this._disposed = false;
    this._lastUpdate = [0, 0, 0];
    this._dracoLoaders = new Set();
    this.uniforms = {
      uFrostTime: { value: 0 },
      uFrostFormation: { value: 0 },
      uFrostCharge: { value: 0 },
      uFrostCompression: { value: 0 },
      uFrostDetailStrength: { value: 1 },
      uFrostImpact: { value: 0 },
      uFrostColor: { value: new THREE.Color(config.frostColor) },
    };
  }

  load(url, options = {}) {
    if (this._disposed) return Promise.reject(new Error('GeneratedArrowAsset has been disposed.'));
    const request = ++this._request;
    this.ready = this._load(url, options, request);
    return this.ready;
  }

  async _load(url, options, request) {
    const loader = new GLTFLoader();
    let draco = null;
    if (options.dracoDecoderPath) {
      draco = new DRACOLoader();
      draco.setDecoderPath(options.dracoDecoderPath);
      draco.setWorkerLimit(2);
      loader.setDRACOLoader(draco);
      this._dracoLoaders.add(draco);
    }
    if (options.meshoptDecoder) loader.setMeshoptDecoder(options.meshoptDecoder);
    if (options.ktx2Loader) loader.setKTX2Loader(options.ktx2Loader);
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } finally {
      if (draco) { draco.dispose(); this._dracoLoaders.delete(draco); }
    }
    if (this._disposed || request !== this._request) {
      disposeRoot(gltf.scene);
      return this;
    }
    let normalized;
    try {
      normalized = this._prepare(gltf.scene, options);
    } catch (error) {
      disposeRoot(gltf.scene);
      throw error;
    }
    disposeRoot(this._asset);
    disposeRoot(this._core);
    this._core = null;
    this._asset = normalized.root;
    this.metadata = { ...normalized.metadata, source: url, animations: gltf.animations.length };
    this.uniforms.uFrostDetailStrength.value = options.detailStrength ?? 1;
    this.group.add(this._asset);
    if (options.core) {
      this._core = this._createCore();
      this.group.add(this._core);
    }
    this.available = true;
    this.update(...this._lastUpdate, this.config);
    return this;
  }

  _prepare(model, options) {
    const root = new THREE.Group();
    root.name = 'Normalized generated geometry';
    const alignment = new THREE.Group();
    const correction = new THREE.Quaternion().setFromUnitVectors(axisVector(options.forwardAxis), new THREE.Vector3(1, 0, 0));
    if (options.rotationXYZ) {
      if (options.rotationXYZ.length !== 3 || !options.rotationXYZ.every(Number.isFinite)) throw new Error('rotationXYZ requires three finite angles in radians.');
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...options.rotationXYZ, 'XYZ'));
      correction.premultiply(rotation);
    }
    alignment.quaternion.copy(correction);
    alignment.add(model);
    root.add(alignment);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root, true);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (bounds.isEmpty() || !Number.isFinite(size.length()) || size.x < 0.000001) throw new Error('Generated arrow has no usable geometry along its forward axis.');
    const width = options.width ?? 1.12;
    if (!(width > 0) || !Number.isFinite(width)) throw new Error('width must be a positive finite number.');
    const lengthScale = 3.42 / size.x;
    const crossScale = options.preserveAspect ? lengthScale : width / Math.max(size.y, size.z, 0.000001);
    root.scale.set(lengthScale, crossScale, crossScale);
    root.position.set(-0.29 - center.x * lengthScale, -center.y * crossScale, -center.z * crossScale);
    root.updateMatrixWorld(true);

    const meshes = meshList(root);
    if (!meshes.length) throw new Error('Generated GLB contains no renderable meshes.');
    const originalGeometries = new Set();
    const originalMaterials = new Set();
    const materialCopies = new Map();
    const point = new THREE.Vector3();
    let triangles = 0;
    let vertices = 0;
    for (const mesh of meshes) {
      originalGeometries.add(mesh.geometry);
      // A shared geometry may be instanced under different transforms in a GLB.
      // The generated attribute must belong to this particular mesh transform.
      mesh.geometry = mesh.geometry.clone();
      const positions = mesh.geometry.attributes.position;
      const localPositions = new Float32Array(positions.count * 3);
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
        localPositions[index * 3] = point.x;
        localPositions[index * 3 + 1] = point.y;
        localPositions[index * 3 + 2] = point.z;
      }
      mesh.geometry.setAttribute('aFrostArrowPosition', new THREE.BufferAttribute(localPositions, 3));
      vertices += positions.count;
      triangles += (mesh.geometry.index?.count ?? positions.count) / 3;
      const enrich = original => {
        originalMaterials.add(original);
        if (!materialCopies.has(original)) materialCopies.set(original, this._enrichMaterial(original, options));
        return materialCopies.get(original);
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(enrich) : enrich(mesh.material);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.renderOrder = 4;
    }
    // The cloned materials retain ownership of every original texture map.
    originalGeometries.forEach(geometry => geometry.dispose());
    originalMaterials.forEach(material => material.dispose());
    const finalBounds = new THREE.Box3().setFromObject(root, true);
    return {
      root,
      metadata: {
        meshes: meshes.length,
        materials: materialCopies.size,
        vertices,
        triangles: Math.floor(triangles),
        bounds: { min: finalBounds.min.toArray(), max: finalBounds.max.toArray() },
      },
    };
  }

  _enrichMaterial(original, options) {
    const material = original.clone();
    material.name = `${original.name || 'Generated material'} / frost detail`;
    // Preserve opaque, masked, blended and transmission states from the asset.
    // Turning an opaque textured model transparent would erase its cut details.
    if ('roughness' in material) material.roughness = options.roughness ?? THREE.MathUtils.clamp(material.roughness, 0.18, 0.78);
    if ('envMapIntensity' in material) material.envMapIntensity = options.envMapIntensity ?? 0.85;
    if (material.transparent && material.side === THREE.DoubleSide) material.forceSinglePass = true;
    const pbr = material.isMeshStandardMaterial || material.isMeshPhysicalMaterial;
    if (!pbr && !material.isMeshBasicMaterial) return material;
    const originalCompile = original.onBeforeCompile;
    const originalKey = original.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      originalCompile.call(material, shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${FROST_VERTEX_DECLARATIONS}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFrostArrowPosition = aFrostArrowPosition;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FROST_FRAGMENT_DECLARATIONS}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FROST_REVEAL}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FROST_EMISSION}`);
      if (!pbr) {
        // KHR_materials_unlit assets still reveal and pulse, without converting
        // their baked appearance into a different lighting model.
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`
          float frostArrowFlow = exp(-pow(abs((fract(frostArrowAxial * 1.8 - uFrostTime * 1.7) - 0.5) * 17.0), 2.0));
          outgoingLight += uFrostColor * (frostArrowFlow * 0.06 + uFrostCompression * 0.12) * uFrostDetailStrength;
          outgoingLight += mix(uFrostColor, vec3(0.72, 1.0, 1.12), 0.4)
            * frostArrowFractureEdge * (0.72 + frostArrowImpactSpark * 1.35);
          #include <opaque_fragment>
        `);
      }
    };
    material.customProgramCacheKey = () => `${originalKey}|${PROGRAM_VERSION}`;
    material.needsUpdate = true;
    return material;
  }

  _createCore() {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const diamond = [[-0.4, 0.012, 0], [-0.4, 0, 0.012], [-0.4, -0.012, 0], [-0.4, 0, -0.012]];
    for (let index = 0; index < 4; index++) {
      const a = diamond[index], b = diamond[(index + 1) % 4];
      positions.push(-1.93, 0, 0, ...b, ...a, 1.30, 0, 0, ...a, ...b);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying float vAxial;
        void main() {vAxial=(position.x+2.0)/3.42;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
      `,
      fragmentShader: /* glsl */`
        uniform float uFrostTime;
        uniform float uFrostFormation;
        uniform float uFrostCompression;
        uniform float uFrostImpact;
        uniform vec3 uFrostColor;
        varying float vAxial;
        void main(){
          if(uFrostFormation<=0.001||vAxial>uFrostFormation+0.012)discard;
          if(uFrostImpact>=0.9999||(uFrostImpact>0.0&&1.0-vAxial<uFrostImpact))discard;
          float pulse=pow(0.5+0.5*sin(vAxial*25.0-uFrostTime*11.0),8.0);
          gl_FragColor=vec4(mix(uFrostColor,vec3(0.8,1.1,1.2),0.4)*(1.0+pulse*0.4+uFrostCompression*0.35),0.4);
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Generated arrow inner energy';
    mesh.renderOrder = 6;
    return mesh;
  }

  /** Dissolve from the nose into the impact; 0 restores the complete projectile. */
  setImpact(progress) {
    this.uniforms.uFrostImpact.value = THREE.MathUtils.clamp(progress, 0, 1);
  }

  update(time, formation, charge, config = this.config) {
    this.config = config;
    this._lastUpdate[0] = time;
    this._lastUpdate[1] = formation;
    this._lastUpdate[2] = charge;
    const compression = charge > 0 ? THREE.MathUtils.smoothstep(time, 0.67, 0.725)
      * (1 - THREE.MathUtils.smoothstep(time, 0.74, 0.75)) : 0;
    this.uniforms.uFrostTime.value = time;
    this.uniforms.uFrostFormation.value = THREE.MathUtils.clamp(formation, 0, 1);
    this.uniforms.uFrostCharge.value = charge;
    this.uniforms.uFrostCompression.value = compression;
    this.uniforms.uFrostColor.value.set(config.frostColor);
    this.group.scale.setScalar(config.arrowSize);
  }

  dispose() {
    this._disposed = true;
    this._request++;
    this.available = false;
    disposeRoot(this._asset);
    disposeRoot(this._core);
    this._asset = null;
    this._core = null;
    this._dracoLoaders.forEach(loader => loader.dispose());
    this._dracoLoaders.clear();
    this.group.removeFromParent();
  }
}
