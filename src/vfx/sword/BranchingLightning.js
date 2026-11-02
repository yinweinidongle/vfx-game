import * as THREE from 'three';

const MAX_VERTICES = 4096;
// Match the main CrescentBlade surface; its two tips define the tilted Y axis.
const HALF_ANGLE = 1.40, RADIUS_X = 1.90, RADIUS_Y = 1.8 / Math.sin(HALF_ANGLE);
const fract = x => x - Math.floor(x);
const hash = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);

/** Forked 3D ribbon lightning with independent short pulse cycles. */
export class BranchingLightning {
  constructor(parent, config = {}) {
    this.config = config; this.group = new THREE.Group(); this.group.name = 'Branching azure-violet lightning'; parent.add(this.group);
    this.positions = new Float32Array(MAX_VERTICES * 3); this.across = new Float32Array(MAX_VERTICES); this.alphas = new Float32Array(MAX_VERTICES); this.tints = new Float32Array(MAX_VERTICES);
    this.geometry = new THREE.BufferGeometry();
    for (const [name, array, size] of [['position', this.positions, 3], ['aAcross', this.across, 1], ['aAlpha', this.alphas, 1], ['aTint', this.tints, 1]]) this.geometry.setAttribute(name, new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uCyan: { value: new THREE.Color(config.energyColor || config.swordColor || config.frostColor || '#39dfff') }, uPurple: { value: new THREE.Color(config.lightningColor || '#9170ff') } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aAcross,aAlpha,aTint;varying float vAcross,vAlpha,vTint;void main(){vAcross=aAcross;vAlpha=aAlpha;vTint=aTint;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      // A narrow pale-violet HDR core crosses bloom's 1.2 threshold only near
      // each pulse peak. The wider colored edge remains a readable violet arc.
      fragmentShader: `uniform vec3 uCyan,uPurple;varying float vAcross,vAlpha,vTint;void main(){float edge=max(0.,1.-abs(vAcross)),core=pow(edge,6.);vec3 c=mix(uCyan,uPurple,vTint)*1.65+vec3(1.45,1.32,2.35)*core;gl_FragColor=vec4(c,pow(edge,.65)*vAlpha);}`,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.group.add(this.mesh);
    this.base = new THREE.Vector3(); this.tip = new THREE.Vector3(); this.direction = new THREE.Vector3(); this.side = new THREE.Vector3(); this.up = new THREE.Vector3();
    this.start = new THREE.Vector3(); this.end = new THREE.Vector3(); this.worldUp = new THREE.Vector3(0, 1, 0);
    this.arcCenter = new THREE.Vector3(); this.arcForward = new THREE.Vector3(); this.arcNormal = new THREE.Vector3(); this.surfacePoint = new THREE.Vector3();
    this.arcScaleX = 1; this.arcScaleY = 1; this.arcScale = 1; this.surfaceProvider = null;
    this.attributes = Object.values(this.geometry.attributes);
    this.boltPoints = new Float32Array(9 * 3); this.cursor = 0; this.disposed = false; this.reset();
  }
  quad(ax, ay, az, bx, by, bz, sx, sy, sz, widthA, widthB, alpha, tint) {
    if (this.cursor + 6 > MAX_VERTICES) return;
    for (let j = 0; j < 6; j++) {
      const end = j === 2 || j === 4 || j === 5, sign = j === 0 || j === 2 || j === 5 ? -1 : 1;
      const width = end ? widthB : widthA, i = this.cursor++, k = i * 3;
      this.positions[k] = (end ? bx : ax) + sx * width * sign;
      this.positions[k + 1] = (end ? by : ay) + sy * width * sign;
      this.positions[k + 2] = (end ? bz : az) + sz * width * sign;
      this.across[i] = sign; this.alphas[i] = alpha; this.tints[i] = tint;
    }
  }
  segment(ax, ay, az, bx, by, bz, width, alpha, tint) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return;
    const x = dx / length, y = dy / length, z = dz / length;
    let sx = -z, sy = 0, sz = x, n = Math.hypot(sx, sz);
    if (n < .01) { sx = 1; sz = 0; n = 1; }
    sx /= n; sz /= n;
    this.quad(ax, ay, az, bx, by, bz, sx, sy, sz, width, width * .72, alpha, tint);
    this.quad(ax, ay, az, bx, by, bz, y * sz - z * sy, z * sx - x * sz, x * sy - y * sx, width * .72, width * .5, alpha * .72, tint);
  }
  bolt(start, end, seed, width, alpha, tint) {
    const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z, length = Math.hypot(dx, dy, dz);
    for (let j = 0; j <= 8; j++) {
      const u = j / 8, envelope = Math.sin(u * Math.PI), noise = (hash(seed + j * 7.3) - .5) * Math.min(.22, length * .22) * envelope, k = j * 3;
      this.boltPoints[k] = start.x + dx * u + this.side.x * noise + this.up.x * noise * .65;
      this.boltPoints[k + 1] = start.y + dy * u + this.side.y * noise + this.up.y * noise * .65;
      this.boltPoints[k + 2] = start.z + dz * u + this.side.z * noise + this.up.z * noise * .65;
      if (j) { const p = k - 3; this.segment(this.boltPoints[p], this.boltPoints[p + 1], this.boltPoints[p + 2], this.boltPoints[k], this.boltPoints[k + 1], this.boltPoints[k + 2], width * (1 - u * .55), alpha, tint); }
    }
    for (let joint = 3; joint <= 5; joint += 2) {
      const k = joint * 3, branchSign = joint === 3 ? 1 : -1;
      let ax = this.boltPoints[k], ay = this.boltPoints[k + 1], az = this.boltPoints[k + 2];
      for (let step = 1; step <= 3; step++) {
        const u = step / 3, spread = .12 + length * .13;
        const bx = this.boltPoints[k] + dx * u * .23 + this.up.x * spread * u * branchSign + this.side.x * (hash(seed + step * 3.1) - .5) * spread;
        const by = this.boltPoints[k + 1] + dy * u * .23 + this.up.y * spread * u * branchSign + this.side.y * (hash(seed + step * 3.1) - .5) * spread;
        const bz = this.boltPoints[k + 2] + dz * u * .23 + this.up.z * spread * u * branchSign + this.side.z * (hash(seed + step * 3.1) - .5) * spread;
        this.segment(ax, ay, az, bx, by, bz, width * .48 * (1 - u * .65), alpha * .64, .6 + tint * .4); ax = bx; ay = by; az = bz;
      }
    }
  }
  /** Sample a point on the lenticular crescent rather than inside its concavity. */
  sampleSurface(u, v, face, time, out) {
    if (this.surfaceProvider?.available && this.surfaceProvider.sampleLocalSurface(u, v, out, face, .004)) {
      return out.applyMatrix4(this.surfaceProvider.surfaceFrame);
    }
    const angle = (u * 2 - 1) * HALF_ANGLE, endMask = Math.sin(u * Math.PI);
    const taper = Math.pow(Math.max(0, endMask), .72), width = .65 * taper + .004;
    const x = RADIUS_X * (Math.cos(angle) - Math.cos(HALF_ANGLE)) - width * (1 - v)
      + Math.sin(u * 53 - time * 17) * .002 * endMask * v ** 3;
    const y = RADIUS_Y * Math.sin(angle) - Math.sin(angle) * width * (1 - v) * .12;
    const z = face * ((.084 * taper + .0015) * Math.sin(v * Math.PI) + .009 * endMask)
      + Math.sin(u * 25 - time * 12) * .018 * endMask;
    return out.copy(this.arcCenter).addScaledVector(this.arcForward, x * this.arcScaleX)
      .addScaledVector(this.direction, y * this.arcScaleY).addScaledVector(this.arcNormal, z * this.arcScale);
  }
  /** Optional painted contour; all points use its exact current content frame. */
  setSurfaceProvider(provider) { this.surfaceProvider = provider; return this; }
  surfaceBolt(from, to, lane, face, time, seed, width, alpha, tint) {
    for (let j = 0; j <= 8; j++) {
      const along = j / 8, u = THREE.MathUtils.lerp(from, to, along);
      const v = THREE.MathUtils.clamp(lane + (hash(seed + j * 7.3) - .5) * .16 * Math.sin(along * Math.PI), .22, .91);
      const k = j * 3;
      this.sampleSurface(u, v, face, time, this.surfacePoint);
      this.boltPoints[k] = this.surfacePoint.x; this.boltPoints[k + 1] = this.surfacePoint.y; this.boltPoints[k + 2] = this.surfacePoint.z;
      if (j) { const p = k - 3; this.segment(this.boltPoints[p], this.boltPoints[p + 1], this.boltPoints[p + 2], this.boltPoints[k], this.boltPoints[k + 1], this.boltPoints[k + 2], width * (1 - along * .45), alpha, tint); }
    }
    // Branches travel across the same surface in UV space. Their displacement
    // cannot throw a disconnected fork into the empty notch behind the blade.
    for (let joint = 3; joint <= 5; joint += 2) {
      const k = joint * 3, along = joint / 8, startU = THREE.MathUtils.lerp(from, to, along);
      const startV = THREE.MathUtils.clamp(lane + (hash(seed + joint * 7.3) - .5) * .16 * Math.sin(along * Math.PI), .22, .91);
      const endU = Math.min(.97, startU + .07 + hash(seed + joint) * .06);
      const endV = THREE.MathUtils.clamp(startV + (joint === 3 ? -.23 : .18), .18, .93);
      let ax = this.boltPoints[k], ay = this.boltPoints[k + 1], az = this.boltPoints[k + 2];
      for (let step = 1; step <= 3; step++) {
        const p = step / 3;
        this.sampleSurface(THREE.MathUtils.lerp(startU, endU, p), THREE.MathUtils.lerp(startV, endV, p), face, time, this.surfacePoint);
        this.segment(ax, ay, az, this.surfacePoint.x, this.surfacePoint.y, this.surfacePoint.z, width * .55 * (1 - p * .65), alpha * .7, Math.min(1, tint + .08));
        ax = this.surfacePoint.x; ay = this.surfacePoint.y; az = this.surfacePoint.z;
      }
    }
  }
  update(time, position, strength = 1, phase = 'flight', config = this.config, bladeBase = null, bladeTip = null) {
    if (this.disposed) return;
    if (strength <= .001 || time < 0) { this.reset(); return; }
    this.cursor = 0; this.group.visible = true;
    this.material.uniforms.uCyan.value.set(config.energyColor || config.swordColor || config.frostColor || '#39dfff'); this.material.uniforms.uPurple.value.set(config.lightningColor || '#9170ff');
    if (bladeBase && bladeTip) { this.base.copy(bladeBase); this.tip.copy(bladeTip); }
    else { this.base.copy(position); this.base.x -= 1.05; this.tip.copy(position); this.tip.x += 1.05; }
    this.direction.subVectors(this.tip, this.base).normalize(); if (this.direction.lengthSq() < .01) this.direction.set(1, 0, 0);
    this.side.crossVectors(this.direction, this.worldUp).normalize(); if (this.side.lengthSq() < .01) this.side.set(0, 0, 1);
    this.up.crossVectors(this.side, this.direction).normalize();
    const surface = phase === 'flight' && bladeBase && bladeTip;
    if (surface) {
      if (this.surfaceProvider?.available) this.surfaceProvider.content.updateWorldMatrix(true, false);
      this.arcCenter.addVectors(this.base, this.tip).multiplyScalar(.5);
      this.arcForward.subVectors(position, this.arcCenter).addScaledVector(this.direction, -this.arcForward.dot(this.direction));
      if (this.arcForward.lengthSq() < 1e-8) this.arcForward.set(1, 0, 0).addScaledVector(this.direction, -this.direction.x);
      if (this.arcForward.lengthSq() < 1e-8) this.arcForward.copy(this.up);
      this.arcForward.normalize(); this.arcNormal.crossVectors(this.arcForward, this.direction).normalize();
      this.arcScale = Math.max(.05, config.bladeSize ?? config.arrowSize ?? this.base.distanceTo(this.tip) / 3.6);
      this.arcScaleY = this.base.distanceTo(this.tip) / 3.6;
      const launch = time >= .65 && time < .88 ? Math.exp(-(time - .65) * 21) * THREE.MathUtils.smoothstep(time, .65, .666) : 0;
      this.arcScaleX = this.arcScale * (1 + launch * .22);
    }
    const impact = phase === 'impact', count = impact ? 10 : phase === 'charge' || phase === 'gather' ? 5 : 7;
    const radius = (config.impactRadius ?? 1.6) / 1.6;
    for (let i = 0; i < count; i++) {
      const period = .115 + i * .013, cycle = Math.floor(time / period + i * .31), pulse = fract(time / period + i * .31);
      const envelope = pulse < .58 ? Math.sin(pulse / .58 * Math.PI) : 0;
      if (envelope < .04) continue;
      const seed = cycle * 31.7 + i * 61.3, angle = i * Math.PI * 2 / count + hash(seed) * .25;
      if (surface) {
        const from = .045 + (i % 4) * .16, to = Math.min(.96, from + .25 + hash(seed + 1) * .3);
        const lane = i % 3 === 0 ? .42 + hash(i + 4) * .10 : .76 + hash(i + 4) * .12;
        this.surfaceBolt(from, to, lane, i % 4 === 3 ? -1 : 1, time, seed, .020 * this.arcScale, envelope * Math.min(1, strength) * .9, .78 + hash(i) * .18);
        continue;
      }
      if (impact) {
        this.start.copy(position).addScaledVector(this.up, Math.sin(angle) * .08).addScaledVector(this.side, Math.cos(angle) * .08);
        this.end.copy(position).addScaledVector(this.up, Math.sin(angle) * (1.1 + hash(i + 3) * .8) * radius).addScaledVector(this.side, Math.cos(angle) * (1.0 + hash(i + 7) * .7) * radius).addScaledVector(this.direction, (hash(i + 11) - .5) * 1.6 * radius);
      } else {
        const from = .05 + (i % 4) * .16, to = Math.min(.98, from + .25 + hash(seed + 1) * .3);
        this.start.lerpVectors(this.base, this.tip, from).addScaledVector(this.side, Math.cos(angle) * .08).addScaledVector(this.up, Math.sin(angle) * .08);
        this.end.lerpVectors(this.base, this.tip, to).addScaledVector(this.side, Math.cos(angle + .6) * .14).addScaledVector(this.up, Math.sin(angle + .6) * .14);
      }
      this.bolt(this.start, this.end, seed, impact ? .018 : .012, envelope * Math.min(1, strength) * .85, .45 + hash(i) * .5);
    }
    this.geometry.setDrawRange(0, this.cursor); for (const attribute of this.attributes) attribute.needsUpdate = true;
  }
  reset() { this.group.visible = false; this.cursor = 0; this.geometry.setDrawRange(0, 0); }
  dispose() { if (this.disposed) return; this.disposed = true; this.group.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}
