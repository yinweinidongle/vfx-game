import * as THREE from 'three';
import { createCrystalGeometry, createCrystalMaterial } from './FrostParticles.js';

const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;
const noiseGLSL = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
`;
const planeVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

function auraMaterial(color, sigil = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uStrength: { value: 0 }, uCompression: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: sigil ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: planeVertex,
    fragmentShader: `varying vec2 vUv;uniform vec3 uColor;uniform float uTime,uStrength,uCompression;${noiseGLSL}
    void main(){
      ${sigil ? `
      vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);float radius=.81-uCompression*.19;
      float outer=exp(-pow(abs((r-radius)/.008),2.))*(.55+.45*pow(abs(sin(a*3.+uTime*.2)),.3));
      float inner=exp(-pow(abs((r-radius*.79)/.005),2.))*.38;
      float glyph=pow(max(0.,cos(a*6.+.1)),60.)*smoothstep(radius*.7,radius*.85,r)*(1.-smoothstep(radius*.93,radius*1.04,r));
      float rays=pow(abs(sin(a*3.)),150.)*smoothstep(.17,.23,r)*(1.-smoothstep(.44,.49,r))*.18;
      gl_FragColor=vec4(mix(uColor,vec3(.78,.97,1.),.36),(outer+inner+glyph*.55+rays)*uStrength*.6);
      ` : `
      vec2 p=vUv;float n=noise(vec2(p.x*4.+sin(p.y*7.-uTime)*.5,p.y*4.-uTime*.65));
      float wisps=pow(max(0.,n-.34),2.)*6.;float edge=pow(max(0.,sin(p.x*3.14159)),2.);
      float height=smoothstep(0.,.16,p.y)*(1.-smoothstep(.34,1.,p.y));
      gl_FragColor=vec4(mix(uColor,vec3(.7,.83,.88),.7),wisps*height*edge*uStrength*.11);
      `}
    }`,
  });
}

function coatingMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: 0 }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>
      attribute float aFreezeMask;
      varying vec3 vNormal,vWorld,vView;varying float vMask;
      void main(){
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 mv=modelViewMatrix*vec4(transformed,1.);
        vNormal=normalize(transformedNormal);vView=-mv.xyz;
        vWorld=(modelMatrix*vec4(transformed,1.)).xyz;vMask=aFreezeMask;
        mv.xyz+=normalize(transformedNormal)*.002;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `varying vec3 vNormal,vWorld,vView;varying float vMask;uniform vec3 uColor;uniform float uStrength,uTime;${noiseGLSL}
      void main(){
        float fresnel=pow(max(0.,1.-abs(dot(normalize(vNormal),normalize(vView)))),3.);
        vec2 uv=vec2(vWorld.x+vWorld.z*.37,vWorld.y-vWorld.z*.21)*18.;
        float n=noise(uv),fine=noise(uv*2.7);
        float crust=smoothstep(.44,.66,n);
        float seam=1.-smoothstep(.012,.055,abs(n-.52));
        float lower=1.-smoothstep(1.1,1.9,vWorld.y);
        float mask=vMask*uStrength;
        float alpha=(crust*(.09+lower*.13)+fresnel*.2+seam*.1)*mask;
        vec3 ice=mix(uColor*.65,vec3(.68,.92,1.),fine*.48+seam*.25);
        if(alpha<.004)discard;
        gl_FragColor=vec4(ice,alpha);
      }`,
  });
}

function snowPoints(count, color, target) {
  const positions = new Float32Array(count * 3), seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 4; j++) { const f = Math.sin((i + 7) * (91.7 + j * 53.1)) * 43758.5453; seeds[i * 4 + j] = f - Math.floor(f); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uStrength: { value: 0 }, uTarget: { value: target ? 1 : 0 }, uPixels: { value: Math.min(globalThis.devicePixelRatio || 1, 2) * 650 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aSeed;uniform float uTime,uStrength,uTarget,uPixels;varying float vAlpha,vSpin;
      void main(){float t=fract(aSeed.y+uTime*.61),a=aSeed.x*6.283+uTime*.53;
        float r=.26+aSeed.z*.52;vec3 p=vec3(cos(a)*r,.08+t*1.48,sin(a)*r*.72);
        p.x+=sin(t*6.+aSeed.x*10.)*.06;p.y*=mix(1.,.75,uTarget);
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((.035+aSeed.w*.025)*uPixels/max(.2,-mv.z),1.,10.);
        vAlpha=sin(t*3.14159)*uStrength*(.28+aSeed.z*.25);vSpin=aSeed.x*6.+uTime*.5;}`,
    fragmentShader: `uniform vec3 uColor;varying float vAlpha,vSpin;void main(){vec2 p=gl_PointCoord-.5;float r=length(p),a=atan(p.y,p.x)+vSpin;
      float snow=pow(abs(cos(a*3.)),20.)*(1.-smoothstep(.08,.47,r))+exp(-r*r*110.)*.45;
      float alpha=snow*vAlpha;if(alpha<.005)discard;gl_FragColor=vec4(mix(uColor,vec3(.82,.97,1.),.65),alpha);}`,
  });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; points.renderOrder = 5; return points;
}

const ANCHORS = [
  ['LeftForeArm', .055, -.03, .015, .13], ['LeftForeArm', -.025, .055, .02, .09],
  ['RightForeArm', -.05, -.025, .025, .12], ['RightForeArm', .02, .05, .03, .085],
  ['LeftLeg', .055, -.06, .02, .14], ['LeftLeg', -.035, .045, .035, .1],
  ['RightLeg', -.055, -.045, .015, .15], ['RightLeg', .04, .055, .03, .09],
  ['LeftFoot', .06, -.01, .035, .12], ['RightFoot', -.05, -.01, .04, .13],
  ['LeftUpLeg', .07, -.02, .035, .1], ['RightUpLeg', -.07, -.015, .04, .11],
  ['Spine', .08, .02, .09, .095], ['Spine', -.09, -.02, .08, .08],
  ['LeftArm', .045, .025, .025, .075], ['RightArm', -.045, .02, .025, .085],
  ['Hips', .12, -.03, .025, .09], ['Hips', -.11, -.03, .03, .1],
];

/** Skeletal status overlays driven entirely by skill time, including paused seeks. */
export class CharacterStatusFX {
  constructor(scene, actors, config) {
    this.actors = actors; this.config = config; this.disposed = false; this.boundTarget = null;
    this.group = new THREE.Group(); this.group.name = 'Character frost status'; scene.add(this.group);
    this.shooterGroup = new THREE.Group(); this.targetGroup = new THREE.Group(); this.group.add(this.shooterGroup, this.targetGroup);
    this.planeGeometry = new THREE.PlaneGeometry(2, 2);
    this.sigil = new THREE.Mesh(this.planeGeometry, auraMaterial(config.frostColor, true));
    this.sigil.rotation.x = -Math.PI / 2; this.sigil.position.y = .035; this.sigil.scale.setScalar(1.13); this.sigil.renderOrder = 3; this.shooterGroup.add(this.sigil);
    this.wisps = [];
    for (const [group, target] of [[this.shooterGroup, false], [this.targetGroup, true]]) {
      for (let i = 0; i < 2; i++) {
        const mesh = new THREE.Mesh(this.planeGeometry, auraMaterial(config.frostColor));
        mesh.position.set(0, target ? .45 : .62, i ? .08 : -.08); mesh.rotation.y = i ? Math.PI / 2 : 0;
        mesh.scale.set(target ? .6 : .64, target ? .52 : .72, 1); mesh.renderOrder = 2;
        group.add(mesh); this.wisps.push({ mesh, target });
      }
    }
    this.shooterSnow = snowPoints(128, config.frostColor, false); this.targetSnow = snowPoints(64, config.frostColor, true);
    this.shooterGroup.add(this.shooterSnow); this.targetGroup.add(this.targetSnow);
    this.handLight = new THREE.PointLight(config.frostColor, 0, 1.6, 2); this.group.add(this.handLight);
    this.crystalGeometry = createCrystalGeometry(); this.crystalFade = new Float32Array(ANCHORS.length);
    this.crystalGeometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(this.crystalFade, 1));
    this.crystalMaterial = createCrystalMaterial(config.frostColor);
    this.crystals = new THREE.InstancedMesh(this.crystalGeometry, this.crystalMaterial, ANCHORS.length);
    this.crystals.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.crystals.frustumCulled = false; this.crystals.renderOrder = 5; this.group.add(this.crystals);
    this.coatings = []; this.bones = new Array(ANCHORS.length).fill(null);
    this.dummy = new THREE.Object3D(); this.world = new THREE.Vector3(); this.offset = new THREE.Vector3(); this.quaternion = new THREE.Quaternion();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.chargeStrength = 0; this.freezeStrength = 0; this.reset();
  }

  bindTarget() {
    const root = this.actors.target?.root;
    if (!root || root === this.boundTarget || this.disposed) return;
    this.releaseCoatings(); this.boundTarget = root;
    const sources = [];
    root.traverse(object => { if (object.isMesh && !object.userData.characterStatusOverlay) sources.push(object); });
    for (const source of sources) {
      const geometry = source.geometry.clone();
      const mask = new Float32Array(geometry.attributes.position.count).fill(1);
      const indices = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
      if (source.isSkinnedMesh && indices && weights) {
        const headBones = new Set(); source.skeleton.bones.forEach((bone, i) => { if (/head|neck/i.test(bone.name)) headBones.add(i); });
        for (let i = 0; i < mask.length; i++) {
          let headWeight = 0;
          for (let j = 0; j < 4; j++) if (headBones.has(indices.array[i * indices.itemSize + j])) headWeight += weights.array[i * weights.itemSize + j];
          mask[i] = 1 - smooth(headWeight, .08, .65);
        }
      }
      geometry.setAttribute('aFreezeMask', new THREE.BufferAttribute(mask, 1));
      const material = coatingMaterial(this.config.frostColor);
      const mesh = source.isSkinnedMesh ? new THREE.SkinnedMesh(geometry, material) : new THREE.Mesh(geometry, material);
      if (source.isSkinnedMesh) {
        mesh.skeleton = source.skeleton; mesh.bindMode = source.bindMode;
        mesh.bindMatrix.copy(source.bindMatrix); mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
      }
      mesh.name = 'Transparent frost crust'; mesh.userData.characterStatusOverlay = true; mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(source.matrix); mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.visible = false;
      source.parent.add(mesh); this.coatings.push({ source, mesh });
    }
    for (let i = 0; i < ANCHORS.length; i++) {
      const suffix = ANCHORS[i][0]; let match = null;
      root.traverse(object => { if (object.isBone && object.name.endsWith(suffix)) match = object; });
      this.bones[i] = match;
    }
  }

  update(dt, skillTime, phase, impactTime) {
    if (this.disposed) return;
    this.bindTarget();
    const t = Math.max(0, skillTime), age = t - impactTime;
    const active = phase !== 'idle';
    this.chargeStrength = active ? smooth(t, .02, .2) * (1 - smooth(t, .75, .97)) : 0;
    this.freezeStrength = active && age >= 0 ? smooth(age, .015, .12) * (1 - smooth(age, .48, 1.075)) : 0;
    const charge = this.chargeStrength, freeze = this.freezeStrength, compression = smooth(t, .59, .75) * (1 - smooth(t, .75, .88));
    const shooter = this.actors.shooter, target = this.actors.target;
    this.shooterGroup.position.set(shooter?.wrapper?.position.x ?? -8.4, 0, shooter?.wrapper?.position.z ?? 0);
    this.targetGroup.position.set(target?.wrapper?.position.x ?? 7.5, 0, target?.wrapper?.position.z ?? 0);
    this.shooterGroup.visible = charge > .001; this.targetGroup.visible = freeze > .001;
    for (const { mesh, target: isTarget } of this.wisps) {
      mesh.material.uniforms.uTime.value = t; mesh.material.uniforms.uStrength.value = isTarget ? freeze * .85 : charge;
      mesh.material.uniforms.uColor.value.set(this.config.frostColor);
    }
    this.sigil.material.uniforms.uTime.value = t; this.sigil.material.uniforms.uStrength.value = charge * (.65 + compression * .35);
    this.sigil.material.uniforms.uCompression.value = compression; this.sigil.material.uniforms.uColor.value.set(this.config.frostColor);
    for (const [points, strength, maxCount] of [[this.shooterSnow, charge, 64], [this.targetSnow, freeze * .7, 32]]) {
      points.material.uniforms.uTime.value = t; points.material.uniforms.uStrength.value = strength;
      points.material.uniforms.uColor.value.set(this.config.frostColor);
      points.geometry.setDrawRange(0, clamp(Math.floor(maxCount * this.config.particleDensity), 0, maxCount * 2));
    }
    if (shooter?.hand) shooter.hand.getWorldPosition(this.handLight.position);
    else this.handLight.position.set(this.shooterGroup.position.x + .8, 1.65, .05);
    this.handLight.position.y += .12; this.handLight.position.z += .18;
    this.handLight.color.set(this.config.frostColor); this.handLight.intensity = charge * (.05 + compression * .12);
    this.crystalMaterial.uniforms.uColor.value.set(this.config.frostColor); this.crystals.visible = freeze > .001;
    target?.root?.updateMatrixWorld(true);
    for (let i = 0; i < ANCHORS.length; i++) {
      const [, x, y, z, size] = ANCHORS[i], bone = this.bones[i];
      const growth = smooth(age, .02 + (i % 4) * .012, .15 + (i % 3) * .025) * (1 - smooth(age, .55, 1.05));
      if (!active || age < 0 || growth <= 0) { this.crystals.setMatrixAt(i, this.zero); this.crystalFade[i] = 0; continue; }
      if (bone) {
        bone.getWorldPosition(this.world); bone.getWorldQuaternion(this.quaternion);
        this.offset.set(x, y, z).applyQuaternion(this.quaternion); this.world.add(this.offset);
      } else {
        const side = i % 2 ? -1 : 1;
        this.world.set(this.targetGroup.position.x + side * .16, .18 + (i % 7) * .19, side * .08);
        this.quaternion.identity();
      }
      this.dummy.position.copy(this.world); this.dummy.quaternion.copy(this.quaternion);
      this.dummy.rotateZ((i % 2 ? -1 : 1) * (.38 + (i % 3) * .2)); this.dummy.rotateX(i * 1.7);
      const scale = size * growth * (.9 + this.config.arrowSize * .1);
      this.dummy.scale.set(scale * .8, scale, scale); this.dummy.updateMatrix(); this.crystals.setMatrixAt(i, this.dummy.matrix);
      this.crystalFade[i] = freeze * .82;
    }
    this.crystals.instanceMatrix.needsUpdate = true; this.crystalGeometry.attributes.aFade.needsUpdate = true;
    for (const { source, mesh } of this.coatings) {
      source.updateMatrix(); mesh.matrix.copy(source.matrix); mesh.visible = source.visible && freeze > .001;
      mesh.material.uniforms.uColor.value.set(this.config.frostColor); mesh.material.uniforms.uStrength.value = freeze;
      mesh.material.uniforms.uTime.value = t;
    }
  }

  reset() {
    this.chargeStrength = 0; this.freezeStrength = 0; this.shooterGroup.visible = false; this.targetGroup.visible = false;
    this.crystals.visible = false; this.handLight.intensity = 0; this.crystalFade.fill(0);
    for (let i = 0; i < ANCHORS.length; i++) this.crystals.setMatrixAt(i, this.zero);
    this.crystals.instanceMatrix.needsUpdate = true; this.crystalGeometry.attributes.aFade.needsUpdate = true;
    for (const { mesh } of this.coatings) { mesh.visible = false; mesh.material.uniforms.uStrength.value = 0; }
  }

  releaseCoatings() {
    for (const { mesh } of this.coatings) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    this.coatings.length = 0; this.bones.fill(null);
  }

  dispose() {
    if (this.disposed) return; this.disposed = true; this.reset(); this.releaseCoatings();
    this.group.removeFromParent(); this.planeGeometry.dispose(); this.sigil.material.dispose();
    for (const { mesh } of this.wisps) mesh.material.dispose();
    for (const points of [this.shooterSnow, this.targetSnow]) { points.geometry.dispose(); points.material.dispose(); }
    this.crystalGeometry.dispose(); this.crystalMaterial.dispose();
  }
}
