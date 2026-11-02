import * as THREE from 'three';
import { createCrystalGeometry } from './FrostParticles.js';

const SHARDS_PER_HIT = 9;
const MOTES_PER_HIT = 10;
const DURATION = .58;
const clamp = THREE.MathUtils.clamp;
const TAU = Math.PI * 2;
const noiseGLSL = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}`;
const planeVertex = `attribute float aAge;varying vec2 vUv;varying float vAge;void main(){vUv=uv;vAge=aAge;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const random = seed => { const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };

/** Six reusable, independently timed contact bursts. No per-hit allocations. */
export class HomingImpactBurst {
  constructor(parent, config, capacity = 6) {
    this.config = config; this.capacity = Math.max(1, Math.floor(capacity)); this.disposed = false;
    this.group = new THREE.Group(); this.group.name = 'Companion ice detonations'; parent.add(this.group);
    this.dummy = new THREE.Object3D(); this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.flashAges = new Float32Array(this.capacity).fill(10); this.mistAges = new Float32Array(this.capacity).fill(10);
    this.flashGeometry = new THREE.PlaneGeometry(2, 2); this.flashGeometry.setAttribute('aAge', new THREE.InstancedBufferAttribute(this.flashAges, 1));
    this.flashMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(config.frostColor) } }, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, vertexShader: planeVertex,
      fragmentShader: `uniform vec3 uColor;varying vec2 vUv;varying float vAge;void main(){
        if(vAge<0.||vAge>.30)discard;vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);
        float progress=clamp(vAge/.26,0.,1.),radius=.10+.76*(1.-pow(1.-progress,2.));
        float ring=exp(-pow(abs((r-radius)/(.018+.01*progress)),2.))*(.76+.24*cos(a*8.));
        float echo=exp(-pow(abs((r-radius*.78)/.035),2.))*.13;
        float spokes=pow(abs(cos(a*3.)),35.)*exp(-r*14.);
        float needle=exp(-abs(p.y)*95.-abs(p.x)*14.)+exp(-abs(p.x)*95.-abs(p.y)*20.);
        float flash=(needle*.75+spokes*.5)*pow(max(0.,1.-vAge/.105),2.);
        float wave=(ring+echo)*pow(max(0.,1.-vAge/.30),1.5)*.48;
        vec3 color=mix(uColor,vec3(.72,.96,1.),.60)*(1.05+min(1.,flash*2.)*1.65);
        gl_FragColor=vec4(color,min(.9,wave+flash));}`,
    });
    // Contact energy is a surface flash: keep it legible over the skinned ice shell.
    this.flashMaterial.depthTest = false;
    this.flash = new THREE.InstancedMesh(this.flashGeometry, this.flashMaterial, this.capacity);
    this.flash.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.flash.frustumCulled = false; this.flash.renderOrder = 7; this.group.add(this.flash);
    this.mistGeometry = new THREE.PlaneGeometry(2, 2); this.mistGeometry.setAttribute('aAge', new THREE.InstancedBufferAttribute(this.mistAges, 1));
    this.mistMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(config.frostColor) } }, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.NormalBlending, vertexShader: planeVertex,
      fragmentShader: `uniform vec3 uColor;varying vec2 vUv;varying float vAge;${noiseGLSL}void main(){
        if(vAge<0.||vAge>.46)discard;vec2 p=vUv*2.-1.;float r=length(p);
        float n=noise(p*4.8-vec2(vAge*.8,vAge*2.))* .7+noise(p*11.+vAge*2.)*.3;
        float shell=exp(-pow(abs((r-(.24+vAge*.65))/.3),2.));
        float life=smoothstep(0.,.035,vAge)*pow(max(0.,1.-vAge/.46),1.4);
        float alpha=shell*smoothstep(.23,.70,n)*(1.-smoothstep(.72,1.,r))*life*.15;
        gl_FragColor=vec4(mix(uColor,vec3(.65,.81,.86),.7),alpha);}`,
    });
    this.mist = new THREE.InstancedMesh(this.mistGeometry, this.mistMaterial, this.capacity);
    this.mist.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mist.frustumCulled = false; this.mist.renderOrder = 3; this.group.add(this.mist);

    const shardCount = this.capacity * SHARDS_PER_HIT;
    this.shardGeometry = createCrystalGeometry(); this.shardFades = new Float32Array(shardCount); this.shardTints = new Float32Array(shardCount);
    this.shardGeometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(this.shardFades, 1));
    this.shardGeometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(this.shardTints, 1));
    this.shardMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(config.frostColor) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `attribute float aFade,aTint;varying vec3 vN,vView;varying float vFade,vTint;void main(){vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.);vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);vView=-mv.xyz;vFade=aFade;vTint=aTint;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform vec3 uColor;varying vec3 vN,vView;varying float vFade,vTint;void main(){
        if(vFade<=0.)discard;vec3 n=normalize(vN),v=normalize(vView);float rim=pow(max(0.,1.-abs(dot(n,v))),3.);
        float facet=pow(max(0.,dot(n,normalize(vec3(-.2,.9,.55)))),3.);
        float glint=pow(max(0.,dot(reflect(-v,n),normalize(vec3(.25,.65,.72)))),25.);
        vec3 ice=mix(uColor*.25,vec3(.43,.75,.91),facet*.7+vTint*.15);
        ice+=uColor*rim*.45+vec3(.68,.94,1.)*(facet*.3+glint*1.4+pow(rim,3.)*.75);
        gl_FragColor=vec4(ice,(.70+rim*.28)*vFade);}`,
    });
    this.shards = new THREE.InstancedMesh(this.shardGeometry, this.shardMaterial, shardCount);
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.shards.frustumCulled = false; this.shards.renderOrder = 6; this.group.add(this.shards);
    this.shardSeeds = Array.from({ length: shardCount }, (_, index) => {
      this.shardTints[index] = random(index + 91);
      const angle = (index % SHARDS_PER_HIT) * TAU / SHARDS_PER_HIT + Math.floor(index / SHARDS_PER_HIT) * .41;
      return {
        sideways: Math.cos(angle), upward: Math.sin(angle), forward: -.35 + random(index + 16) * .7,
        speed: 1.65 + random(index + 4) * 1.4,
        length: .085 + random(index + 21) * .065,
        lifetime: .45 + random(index + 39) * .10,
        rx: random(index + 51) * TAU, ry: random(index + 68) * TAU, rz: random(index + 73) * TAU,
        sx: (random(index + 81) * 2 - 1) * 9, sy: (random(index + 83) * 2 - 1) * 11, sz: (random(index + 87) * 2 - 1) * 12,
      };
    });

    const moteCount = this.capacity * MOTES_PER_HIT;
    this.motePositions = new Float32Array(moteCount * 3); this.moteHits = new Float32Array(moteCount).fill(10000);
    this.moteVelocities = new Float32Array(moteCount * 3); this.moteSeeds = new Float32Array(moteCount);
    for (let i = 0; i < moteCount; i++) {
      const angle = (i % MOTES_PER_HIT) * TAU / MOTES_PER_HIT + random(i + 7), speed = .9 + random(i + 15) * 1.8;
      this.moteVelocities.set([(random(i + 22) - .5) * .7, Math.cos(angle) * speed, Math.sin(angle) * speed], i * 3);
      this.moteSeeds[i] = random(i + 34);
    }
    this.moteGeometry = new THREE.BufferGeometry();
    this.moteGeometry.setAttribute('position', new THREE.BufferAttribute(this.motePositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.moteGeometry.setAttribute('aHit', new THREE.BufferAttribute(this.moteHits, 1).setUsage(THREE.DynamicDrawUsage));
    this.moteGeometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.moteVelocities, 3));
    this.moteGeometry.setAttribute('aSeed', new THREE.BufferAttribute(this.moteSeeds, 1));
    this.moteMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(config.frostColor) }, uTime: { value: 0 }, uPixels: { value: Math.min(globalThis.devicePixelRatio || 1, 2) * 650 }, uForward: { value: new THREE.Vector3(1, 0, 0) }, uSide: { value: new THREE.Vector3(0, 0, 1) }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aHit,aSeed;attribute vec3 aVelocity;uniform float uTime,uPixels;uniform vec3 uForward,uSide,uUp;varying float vAlpha,vSpin;void main(){
        float age=uTime-aHit,t=clamp(age/.48,0.,1.);vec3 velocity=uForward*aVelocity.x+uSide*aVelocity.y+uUp*aVelocity.z;
        vec3 p=position+velocity*max(0.,age)/(1.+max(0.,age)*2.);p.y-=max(0.,age)*max(0.,age)*1.1;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((.025+aSeed*.026)*uPixels/max(.2,-mv.z),1.,12.);
        vAlpha=age<0.||age>.48?0.:smoothstep(0.,.02,age)*pow(1.-t,1.35)*.65;vSpin=aSeed*6.28+age*3.;}`,
      fragmentShader: `uniform vec3 uColor;varying float vAlpha,vSpin;void main(){vec2 p=gl_PointCoord-.5;float c=cos(vSpin),s=sin(vSpin);p=mat2(c,-s,s,c)*p;
        float r=abs(p.x)+abs(p.y);float ice=1.-smoothstep(.14,.43,r);float alpha=ice*vAlpha;if(alpha<.005)discard;gl_FragColor=vec4(mix(uColor,vec3(.77,.97,1.),.7),alpha);}`,
    });
    this.motes = new THREE.Points(this.moteGeometry, this.moteMaterial); this.motes.frustumCulled = false; this.motes.renderOrder = 6; this.group.add(this.motes);
    this.reset();
  }

  update(time, arrows, context) {
    if (this.disposed) return;
    const config = context.config || this.config;
    const count = clamp(Math.floor(context.activeCount ?? arrows.length), 0, Math.min(this.capacity, arrows.length));
    const { target, forward, side, up, camera } = context;
    this.flash.count = count; this.mist.count = count; this.shards.count = count * SHARDS_PER_HIT;
    this.moteGeometry.setDrawRange(0, count * MOTES_PER_HIT);
    this.flashMaterial.uniforms.uColor.value.set(config.frostColor); this.mistMaterial.uniforms.uColor.value.set(config.frostColor);
    this.shardMaterial.uniforms.uColor.value.set(config.frostColor); this.moteMaterial.uniforms.uColor.value.set(config.frostColor);
    this.moteMaterial.uniforms.uTime.value = time; this.moteMaterial.uniforms.uForward.value.copy(forward);
    this.moteMaterial.uniforms.uSide.value.copy(side); this.moteMaterial.uniforms.uUp.value.copy(up);
    let visible = false;
    for (let i = 0; i < count; i++) {
      const arrow = arrows[i], age = time - arrow.hitTime, active = age >= 0 && age < DURATION;
      if (active) visible = true;
      this.flashAges[i] = age; this.mistAges[i] = age;
      if (age >= 0 && age < .30) {
        this.dummy.position.copy(target); this.dummy.quaternion.copy(camera.quaternion); this.dummy.rotateZ(i * .37);
        this.dummy.scale.setScalar(.60); this.dummy.updateMatrix(); this.flash.setMatrixAt(i, this.dummy.matrix);
      } else this.flash.setMatrixAt(i, this.zero);
      if (age >= 0 && age < .46) {
        this.dummy.position.copy(target).addScaledVector(forward, -.025); this.dummy.quaternion.copy(camera.quaternion);
        this.dummy.rotateZ(i * .6 + age * .2); this.dummy.scale.setScalar(.43 + age * .72); this.dummy.updateMatrix(); this.mist.setMatrixAt(i, this.dummy.matrix);
      } else this.mist.setMatrixAt(i, this.zero);
      for (let j = 0; j < SHARDS_PER_HIT; j++) {
        const slot = i * SHARDS_PER_HIT + j, seed = this.shardSeeds[slot];
        if (!active || age >= seed.lifetime) { this.shards.setMatrixAt(slot, this.zero); this.shardFades[slot] = 0; continue; }
        const t = age / seed.lifetime, travel = (1 - Math.exp(-age * 2.6)) / 2.6 * seed.speed;
        this.dummy.position.copy(arrow.endpoint).addScaledVector(forward, seed.forward * travel);
        this.dummy.position.addScaledVector(side, seed.sideways * travel).addScaledVector(up, seed.upward * travel + age * .16);
        this.dummy.position.y -= age * age * 2.4;
        this.dummy.rotation.set(seed.rx + seed.sx * age, seed.ry + seed.sy * age, seed.rz + seed.sz * age);
        const size = seed.length / 1.55 * (.95 - .62 * t * t);
        this.dummy.scale.set(size * .8, size, size); this.dummy.updateMatrix(); this.shards.setMatrixAt(slot, this.dummy.matrix);
        this.shardFades[slot] = Math.pow(1 - t, .85);
      }
      for (let j = 0; j < MOTES_PER_HIT; j++) {
        const slot = i * MOTES_PER_HIT + j, k = slot * 3;
        this.motePositions[k] = arrow.endpoint.x; this.motePositions[k + 1] = arrow.endpoint.y; this.motePositions[k + 2] = arrow.endpoint.z;
        this.moteHits[slot] = arrow.hitTime;
      }
    }
    this.group.visible = visible;
    this.flash.instanceMatrix.needsUpdate = true; this.flashGeometry.attributes.aAge.needsUpdate = true;
    this.mist.instanceMatrix.needsUpdate = true; this.mistGeometry.attributes.aAge.needsUpdate = true;
    this.shards.instanceMatrix.needsUpdate = true; this.shardGeometry.attributes.aFade.needsUpdate = true;
    this.moteGeometry.attributes.position.needsUpdate = true; this.moteGeometry.attributes.aHit.needsUpdate = true;
  }

  reset() {
    this.group.visible = false; this.flashAges.fill(10); this.mistAges.fill(10); this.shardFades.fill(0); this.moteHits.fill(10000);
    for (let i = 0; i < this.capacity; i++) { this.flash.setMatrixAt(i, this.zero); this.mist.setMatrixAt(i, this.zero); }
    for (let i = 0; i < this.capacity * SHARDS_PER_HIT; i++) this.shards.setMatrixAt(i, this.zero);
    this.moteGeometry.setDrawRange(0, 0);
    this.flash.instanceMatrix.needsUpdate = true; this.mist.instanceMatrix.needsUpdate = true; this.shards.instanceMatrix.needsUpdate = true;
    this.flashGeometry.attributes.aAge.needsUpdate = true; this.mistGeometry.attributes.aAge.needsUpdate = true;
    this.shardGeometry.attributes.aFade.needsUpdate = true; this.moteGeometry.attributes.aHit.needsUpdate = true;
  }

  dispose() {
    if (this.disposed) return; this.disposed = true; this.group.removeFromParent();
    this.flashGeometry.dispose(); this.flashMaterial.dispose(); this.mistGeometry.dispose(); this.mistMaterial.dispose();
    this.shardGeometry.dispose(); this.shardMaterial.dispose(); this.moteGeometry.dispose(); this.moteMaterial.dispose();
  }
}
