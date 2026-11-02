import * as THREE from 'three';
import { HomingImpactBurst } from './HomingImpactBurst.js';

const MAX_ARROWS = 6;
const SAMPLES = 32;
const CONSUME_TIME = .12;
const DRAIN_TIME = .24;
const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;
const TAU = Math.PI * 2;

// A small barb-headed arrow, diamond-section shaft and swept crystal fletching.
function createArrowGeometry() {
  const positions = [], parts = [];
  const triangle = (a, b, c, part) => { positions.push(...a, ...b, ...c); parts.push(part, part, part); };
  const blade = (outline, centerX, thickness, part) => {
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      triangle([centerX, 0, thickness], [a[0], a[1], .008], [b[0], b[1], .008], part);
      triangle([centerX, 0, -thickness], [b[0], b[1], -.008], [a[0], a[1], -.008], part);
      triangle([a[0], a[1], .008], [a[0], a[1], -.008], [b[0], b[1], -.008], part);
      triangle([a[0], a[1], .008], [b[0], b[1], -.008], [b[0], b[1], .008], part);
    }
  };
  blade([[.58, 0], [-.015, .235], [.10, .045], [-.01, 0], [.10, -.045], [-.015, -.235]], .20, .067, 0);
  blade([[.20, 0], [-.45, .027], [-.54, 0], [-.45, -.027]], -.15, .025, 1);
  blade([[-.22, 0], [-.43, .12], [-.50, .10], [-.45, 0], [-.50, -.10], [-.43, -.12]], -.38, .018, .35);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geometry.computeVertexNormals(); return geometry;
}

function arrowMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute float aFade,aPart,aImpact;varying vec3 vNormal,vView,vLocal;varying float vFade,vPart,vX,vImpact;
      void main(){vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);vView=-mv.xyz;vLocal=position;vImpact=aImpact;vFade=aFade;vPart=aPart;vX=position.x;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform vec3 uColor;uniform float uTime;varying vec3 vNormal,vView,vLocal;varying float vFade,vPart,vX,vImpact;
      void main(){
        float axial=clamp((vX+.54)/1.12,0.,1.);
        float grain=fract(sin(dot(floor(vLocal*90.),vec3(127.1,311.7,74.7)))*43758.5453);
        float remaining=1.-axial-vImpact+(grain-.5)*.045;
        if(vFade<=0.||vImpact>=.9999||(vImpact>0.&&remaining<0.))discard;
        float fracture=(1.-smoothstep(0.,.065,remaining))*step(.0001,vImpact);
        vec3 n=normalize(vNormal);float rim=pow(max(0.,1.-abs(dot(n,normalize(vView)))),2.8);float facet=pow(max(0.,dot(n,normalize(vec3(-.3,.8,.7)))),3.);
        float flow=pow(.5+.5*sin(vX*17.-uTime*15.),6.);vec3 ice=uColor*(.38+facet*.45)+vec3(.65,.92,1.)*(facet*.28+rim*.42);
        ice=mix(ice,mix(uColor,vec3(.75,1.05,1.15),.62),vPart*.6)+uColor*flow*.08;
        // Concentrate HDR energy in a narrow spine and the penetrating tip.
        // The broad blue facets remain below the composer's 1.2 bloom threshold.
        float spine=exp(-pow(abs(vLocal.y/.024),2.))*smoothstep(-.53,-.43,vX)*(1.-smoothstep(.44,.58,vX));
        float tip=smoothstep(.40,.57,vX)*exp(-abs(vLocal.y)*28.);
        float edgeLight=pow(rim,1.6)*(.25+.75*facet)*smoothstep(-.02,.18,vX);
        vec3 energy=mix(uColor,vec3(.68,.95,1.),.7);
        ice+=energy*(spine*1.85+tip*2.3+edgeLight*.6)*(.94+flow*.06);
        ice+=mix(uColor,vec3(.8,1.,1.1),.65)*fracture*2.1;
        gl_FragColor=vec4(ice,(.8+rim*.19)*vFade);}`,
  });
}

function trailMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aFade;varying vec2 vUv;varying float vFade;void main(){vUv=uv;vFade=aFade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vFade;uniform vec3 uColor;uniform float uTime;
      void main(){float across=max(0.,1.-abs(vUv.y*2.-1.));float edge=pow(across,1.7);float flow=.78+.22*sin(vUv.x*31.-uTime*16.);float core=pow(across,5.);
        vec3 energy=mix(uColor,vec3(.64,.95,1.05),.72);
        vec3 color=uColor*.55+energy*core*3.25;
        gl_FragColor=vec4(color,edge*vFade*flow*.55);}`,
  });
}

/** Analytic companion arrows: post-launch emergence → escort → homing contact. */
export class HomingArrows {
  constructor(scene, config) {
    this.config = config; this.group = new THREE.Group(); this.group.name = 'Homing frost companions'; scene.add(this.group);
    this.origin = new THREE.Vector3(); this.target = new THREE.Vector3(); this.mainEnd = new THREE.Vector3();
    this.forward = new THREE.Vector3(1, 0, 0); this.side = new THREE.Vector3(0, 0, 1); this.up = new THREE.Vector3(0, 1, 0);
    this.worldUp = new THREE.Vector3(0, 1, 0); this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.c = new THREE.Vector3();
    this.position = new THREE.Vector3(); this.direction = new THREE.Vector3(); this.ribbonSide = new THREE.Vector3(); this.view = new THREE.Vector3(); this.normal = new THREE.Vector3();
    this.dummy = new THREE.Object3D(); this.basis = new THREE.Matrix4(); this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.impactTime = 1.5; this.mainArcHeight = .12; this.arrowScale = .32; this.activeCount = MAX_ARROWS; this.disposed = false;
    this.targetCacheValid = false; this.cachedSampler = null; this.cachedImpactTime = 0; this.cachedArrowSize = 0; this.cachedTargetVersion = undefined;
    this.arrows = Array.from({ length: MAX_ARROWS }, (_, i) => ({
      spawnTime: .80 + i * .025, branchTime: 1.1, hitTime: 1.56 + i * .07,
      start: new THREE.Vector3(), controlA: new THREE.Vector3(), controlB: new THREE.Vector3(), endpoint: new THREE.Vector3(),
      radial: new THREE.Vector3(), position: new THREE.Vector3(),
    }));
    this.geometry = createArrowGeometry(); this.fades = new Float32Array(MAX_ARROWS);
    this.consume = new Float32Array(MAX_ARROWS);
    this.geometry.setAttribute('aImpact', new THREE.InstancedBufferAttribute(this.consume, 1));
    this.geometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(this.fades, 1));
    this.material = arrowMaterial(config.frostColor); this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_ARROWS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.group.add(this.mesh);
    this.trailPositions = new Float32Array(MAX_ARROWS * SAMPLES * 2 * 3);
    this.trailUVs = new Float32Array(MAX_ARROWS * SAMPLES * 2 * 2);
    this.trailFades = new Float32Array(MAX_ARROWS * SAMPLES * 2);
    const indices = new Uint16Array(MAX_ARROWS * (SAMPLES - 1) * 6);
    for (let i = 0; i < MAX_ARROWS; i++) for (let j = 0; j < SAMPLES; j++) {
      const v = (i * SAMPLES + j) * 2;
      this.trailUVs.set([j / (SAMPLES - 1), 0, j / (SAMPLES - 1), 1], v * 2);
      if (j < SAMPLES - 1) indices.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], (i * (SAMPLES - 1) + j) * 6);
    }
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.trailGeometry.setAttribute('uv', new THREE.BufferAttribute(this.trailUVs, 2));
    this.trailGeometry.setAttribute('aFade', new THREE.BufferAttribute(this.trailFades, 1).setUsage(THREE.DynamicDrawUsage));
    this.trailGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.trailMaterial = trailMaterial(config.frostColor); this.trailMesh = new THREE.Mesh(this.trailGeometry, this.trailMaterial);
    this.trailMesh.frustumCulled = false; this.trailMesh.renderOrder = 4; this.group.add(this.trailMesh);
    this.impacts = new HomingImpactBurst(this.group, config, MAX_ARROWS);
    this.splinters = this.impacts.shards;
    this.splinterFades = this.impacts.shardFades;
    this.impactContext = { target: this.target, forward: this.forward, side: this.side, up: this.up,
      camera: null, config, activeCount: MAX_ARROWS };
    this.reset();
  }

  orbitPosition(index, time, out) {
    const flight = clamp((time - .75) / Math.max(.05, this.impactTime - .75), 0, 1);
    out.lerpVectors(this.origin, this.mainEnd, flight); out.y += Math.sin(flight * Math.PI) * this.mainArcHeight;
    const angle = index * TAU / MAX_ARROWS + time * 3.1;
    const formation = smooth(time, this.arrows[index].spawnTime, this.arrows[index].spawnTime + .14);
    const radius = (.34 + (index % 2) * .105) * formation;
    out.addScaledVector(this.forward, THREE.MathUtils.lerp(-1, -.33 - (index % 3) * .105, formation));
    out.addScaledVector(this.side, Math.cos(angle) * radius);
    out.addScaledVector(this.up, Math.sin(angle) * radius + .08 * formation);
    return out;
  }

  /** Samples the arrow TIP in world space; at its hit time this equals the target. */
  samplePosition(index, time, out) {
    const arrow = this.arrows[index];
    if (time <= arrow.branchTime) return this.orbitPosition(index, time, out);
    const u = clamp((time - arrow.branchTime) / (arrow.hitTime - arrow.branchTime), 0, 1), v = 1 - u;
    out.copy(arrow.start).multiplyScalar(v * v * v);
    out.addScaledVector(arrow.controlA, 3 * v * v * u);
    out.addScaledVector(arrow.controlB, 3 * v * u * u);
    out.addScaledVector(arrow.endpoint, u * u * u);
    // A smooth lift spreads trajectories without a direction discontinuity.
    out.addScaledVector(arrow.radial, Math.sin(u * Math.PI) ** 2 * (.38 + (index % 3) * .11));
    return out;
  }

  preparePaths(time, context) {
    const { origin, mainPosition, target, impactTime, arrowSize, targetAtTime } = context;
    const refreshTargets = !this.targetCacheValid || this.cachedSampler !== targetAtTime || this.cachedImpactTime !== impactTime || this.cachedArrowSize !== arrowSize || this.cachedTargetVersion !== context.targetVersion;
    this.origin.copy(origin); this.target.copy(target); this.impactTime = impactTime;
    this.mainArcHeight = context.mainArcHeight ?? .12;
    this.forward.subVectors(target, origin).normalize();
    this.mainEnd.copy(target).addScaledVector(this.forward, -1.42 * arrowSize);
    const fraction = clamp((time - .75) / Math.max(.05, impactTime - .75), 0, 1);
    if (context.mainEnd) this.mainEnd.copy(context.mainEnd);
    else if (fraction > .01 && mainPosition) {
      this.mainEnd.copy(mainPosition); this.mainEnd.y -= Math.sin(fraction * Math.PI) * this.mainArcHeight;
      this.mainEnd.sub(origin).multiplyScalar(1 / fraction).add(origin);
    }
    this.forward.subVectors(this.mainEnd, origin).normalize();
    this.side.crossVectors(this.forward, this.worldUp).normalize(); if (this.side.lengthSq() < .01) this.side.set(0, 0, 1);
    this.up.crossVectors(this.side, this.forward).normalize();
    this.arrowScale = clamp(.32 * Math.pow(Math.max(.2, arrowSize) / .52, .25), .255, .40);
    for (let i = 0; i < MAX_ARROWS; i++) {
      const arrow = this.arrows[i];
      arrow.branchTime = Math.max(arrow.spawnTime + .09, .75 + (impactTime - .75) * (.43 + i * .048));
      arrow.hitTime = impactTime + .06 + i * .07;
      this.orbitPosition(i, arrow.branchTime, arrow.start);
      this.orbitPosition(i, arrow.branchTime + .002, this.a); this.orbitPosition(i, arrow.branchTime - .002, this.b);
      this.a.sub(this.b).multiplyScalar(1 / .004);
      if (!targetAtTime) arrow.endpoint.copy(target);
      else if (refreshTargets) { arrow.endpoint.copy(target); targetAtTime(arrow.hitTime, arrow.endpoint); }
      const distance = arrow.start.distanceTo(arrow.endpoint), duration = arrow.hitTime - arrow.branchTime;
      this.a.multiplyScalar(duration / 3); this.a.clampLength(0, distance * .48);
      arrow.controlA.copy(arrow.start).add(this.a);
      const angle = i * TAU / MAX_ARROWS + arrow.branchTime * 3.1;
      arrow.radial.copy(this.side).multiplyScalar(Math.cos(angle)).addScaledVector(this.up, Math.sin(angle));
      arrow.controlB.copy(arrow.endpoint).addScaledVector(this.forward, -Math.min(1.15, distance * .28)).addScaledVector(arrow.radial, .34).addScaledVector(this.up, .08);
    }
    this.targetCacheValid = true; this.cachedSampler = targetAtTime; this.cachedImpactTime = impactTime;
    this.cachedArrowSize = arrowSize; this.cachedTargetVersion = context.targetVersion;
  }

  update(time, context) {
    if (this.disposed) return;
    const config = context.config || this.config, camera = context.camera;
    this.activeCount = clamp(Math.floor(config.homingCount ?? MAX_ARROWS), 0, MAX_ARROWS);
    if (this.activeCount === 0 || time < .80 || time >= context.impactTime + 1.1) { this.reset(); return; }
    this.group.visible = true; this.preparePaths(time, context);
    this.mesh.count = this.activeCount;
    this.trailGeometry.setDrawRange(0, this.activeCount * (SAMPLES - 1) * 6);
    for (const material of [this.material, this.trailMaterial]) material.uniforms.uColor.value.set(config.frostColor);
    this.material.uniforms.uTime.value = time; this.trailMaterial.uniforms.uTime.value = time;
    for (let i = 0; i < this.activeCount; i++) {
      const arrow = this.arrows[i], age = time - arrow.hitTime;
      const consume = clamp(age / CONSUME_TIME, 0, 1);
      const alive = time >= arrow.spawnTime && age < CONSUME_TIME;
      this.consume[i] = consume;
      const formation = smooth(time, arrow.spawnTime, arrow.spawnTime + .06);
      this.samplePosition(i, time, arrow.position);
      this.samplePosition(i, Math.min(time, arrow.hitTime) - .002, this.a);
      this.direction.subVectors(arrow.position, this.a).normalize(); if (this.direction.lengthSq() < .01) this.direction.copy(this.forward);
      this.view.subVectors(camera.position, arrow.position).normalize(); this.ribbonSide.crossVectors(this.view, this.direction).normalize();
      if (this.ribbonSide.lengthSq() < .01) this.ribbonSide.copy(this.up);
      this.normal.crossVectors(this.direction, this.ribbonSide).normalize(); this.basis.makeBasis(this.direction, this.ribbonSide, this.normal);
      if (alive) {
        this.dummy.position.copy(age >= 0 ? this.target : arrow.position)
          .addScaledVector(this.direction, (-.58 + 1.12 * consume) * this.arrowScale);
        this.dummy.quaternion.setFromRotationMatrix(this.basis); this.dummy.rotateX(Math.sin(time * 4 + i) * .15);
        this.dummy.scale.setScalar(this.arrowScale * (.8 + formation * .2)); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
        this.fades[i] = formation;
      } else { this.mesh.setMatrixAt(i, this.zero); this.fades[i] = 0; }
      this.updateRibbon(i, time, camera);
    }
    this.impactContext.camera = camera; this.impactContext.config = config;
    this.impactContext.activeCount = this.activeCount;
    this.impacts.update(time, this.arrows, this.impactContext);
    this.mesh.instanceMatrix.needsUpdate = true; this.geometry.attributes.aFade.needsUpdate = true;
    this.geometry.attributes.aImpact.needsUpdate = true;
    this.trailGeometry.attributes.position.needsUpdate = true; this.trailGeometry.attributes.aFade.needsUpdate = true;
  }

  updateRibbon(index, time, camera) {
    const arrow = this.arrows[index], headTime = Math.min(time, arrow.hitTime), length = .19;
    const age = Math.max(0, time - arrow.hitTime), consuming = time >= arrow.hitTime;
    const consume = clamp(age / CONSUME_TIME, 0, 1), drain = smooth(age, 0, DRAIN_TIME);
    const aftermath = 1 - smooth(age, .04, DRAIN_TIME);
    for (let j = 0; j < SAMPLES; j++) {
      const u = j / (SAMPLES - 1), sampleTime = headTime - u * length, vertex = (index * SAMPLES + j) * 2;
      this.samplePosition(index, sampleTime, this.position); this.samplePosition(index, sampleTime - .002, this.a);
      this.direction.subVectors(this.position, this.a).normalize(); if (this.direction.lengthSq() < .01) this.direction.copy(this.forward);
      this.position.addScaledVector(this.direction, -1.08 * this.arrowScale);
      if (consuming) {
        // The ribbon head follows the consuming tail; old history drains behind it.
        this.c.subVectors(this.target, arrow.endpoint).multiplyScalar((1-u)*(1-u));
        this.position.add(this.c);
        this.position.lerp(this.target, THREE.MathUtils.lerp(consume, drain, smooth(u, 0, .18)));
      }
      this.view.subVectors(camera.position, this.position).normalize(); this.ribbonSide.crossVectors(this.direction, this.view).normalize();
      if (this.ribbonSide.lengthSq() < .01) this.ribbonSide.copy(this.up);
      const width = (.012 + Math.sin(u * Math.PI) * .009) * (1 - u * .7) * (1 - drain * .8);
      const fade = smooth(sampleTime, arrow.spawnTime, arrow.spawnTime + .06) * Math.pow(1 - u, 1.2) * aftermath;
      for (let edge = 0; edge < 2; edge++) {
        const sign = edge ? 1 : -1, offset = (vertex + edge) * 3;
        this.trailPositions[offset] = this.position.x + this.ribbonSide.x * sign * width;
        this.trailPositions[offset + 1] = this.position.y + this.ribbonSide.y * sign * width;
        this.trailPositions[offset + 2] = this.position.z + this.ribbonSide.z * sign * width;
        this.trailFades[vertex + edge] = fade;
      }
    }
  }

  reset() {
    this.targetCacheValid = false;
    this.group.visible = false; this.fades.fill(0); this.consume.fill(0); this.trailFades.fill(0);
    for (let i = 0; i < MAX_ARROWS; i++) this.mesh.setMatrixAt(i, this.zero);
    this.trailGeometry.setDrawRange(0, 0); this.mesh.instanceMatrix.needsUpdate = true;
    this.geometry.attributes.aFade.needsUpdate = true; this.geometry.attributes.aImpact.needsUpdate = true;
    this.trailGeometry.attributes.aFade.needsUpdate = true;
    this.impacts.reset();
  }

  dispose() {
    if (this.disposed) return; this.disposed = true; this.group.removeFromParent(); this.impacts.dispose();
    for (const resource of [this.geometry, this.material, this.trailGeometry, this.trailMaterial]) resource.dispose();
  }
}
