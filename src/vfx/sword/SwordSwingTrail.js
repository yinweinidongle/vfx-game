import * as THREE from 'three';

const START = .45, RELEASE = .65, END = .82;
const RADIAL = [.12, .45, .88, 1];

/** A short world-space afterimage of the physical blade's sampled motion. */
export class SwordSwingTrail {
  constructor(parent, config = {}) {
    this.config = config;
    this.capacity = 64;
    this.count = 0;
    this.history = new Float32Array(this.capacity * 6);
    this.times = new Float64Array(this.capacity);
    this.positions = new Float32Array(this.capacity * RADIAL.length * 3);
    this.births = new Float32Array(this.capacity * RADIAL.length);
    this.uvs = new Float32Array(this.capacity * RADIAL.length * 2);
    const indices = new Uint16Array((this.capacity - 1) * (RADIAL.length - 1) * 6);
    let offset = 0;
    for (let row = 0; row < this.capacity - 1; row++) {
      for (let radial = 0; radial < RADIAL.length - 1; radial++) {
        const a = row * RADIAL.length + radial, b = a + RADIAL.length;
        indices.set([a, b, a + 1, a + 1, b, b + 1], offset);
        offset += 6;
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aBirth', new THREE.BufferAttribute(this.births, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(config.energyColor || config.swordColor || '#39dfff') },
      uPurple: { value: new THREE.Color(config.lightningColor || '#9170ff') },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      vertexShader: `attribute float aBirth; varying vec2 vUv; varying float vBirth;
        void main(){vUv=uv;vBirth=aBirth;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float uTime;uniform vec3 uColor,uPurple;
        varying vec2 vUv;varying float vBirth;
        void main(){
          float age=max(0.,uTime-vBirth);
          float life=1.-smoothstep(.015,.18,age);
          float release=1.-smoothstep(.65,.82,uTime);
          float start=smoothstep(.45,.465,uTime);
          float cap=smoothstep(0.,.10,vUv.x);
          float edgeDistance=(vUv.y-.96)/.028,innerDistance=(vUv.y-.24)/.15;
          float edge=exp(-edgeDistance*edgeDistance);
          float inner=exp(-innerDistance*innerDistance);
          float body=smoothstep(0.,.10,vUv.y)*(1.-smoothstep(.985,1.,vUv.y));
          float streak=.82+.18*sin(vUv.x*29.-vUv.y*18.-uTime*21.);
          vec3 blue=mix(vec3(.015,.075,.56),uColor*.6,.25);
          vec3 color=mix(blue,uPurple*.62,inner*.68);
          color=mix(color,vec3(1.7,2.35,2.6),edge*.94);
          float alpha=(.23*streak+inner*.08+edge*.64)*body*life*release*start*cap;
          if(alpha<.004)discard;
          gl_FragColor=vec4(color,alpha);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'Sword · sampled swing afterimage';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    parent.add(this.mesh);
    this.reset();
  }

  update(dt, time, base, tip, config = this.config) {
    this.uniforms.uTime.value = time;
    this.uniforms.uColor.value.set(config.energyColor || config.swordColor || '#39dfff');
    this.uniforms.uPurple.value.set(config.lightningColor || '#9170ff');
    if (time < START - 1e-8 || time >= END - 1e-8) {
      if (this.count) this.reset();
      return;
    }
    if (this.count && time < this.times[this.count - 1] - 1e-8) this.reset();
    if (dt > 0 && time <= RELEASE + 1e-8) {
      if (this.count === this.capacity) {
        this.history.copyWithin(0, 6);
        this.times.copyWithin(0, 1);
        this.count--;
      }
      const offset = this.count * 6;
      this.history[offset] = base.x; this.history[offset + 1] = base.y; this.history[offset + 2] = base.z;
      this.history[offset + 3] = tip.x; this.history[offset + 4] = tip.y; this.history[offset + 5] = tip.z;
      this.times[this.count++] = time;
    }
    this.mesh.visible = this.count > 1;
    this.geometry.setDrawRange(0, Math.max(0, this.count - 1) * (RADIAL.length - 1) * 6);
    for (let row = 0; row < this.count; row++) {
      const source = row * 6;
      for (let radial = 0; radial < RADIAL.length; radial++) {
        const vertex = row * RADIAL.length + radial, position = vertex * 3, uv = vertex * 2, f = RADIAL[radial];
        for (let axis = 0; axis < 3; axis++) {
          const start = this.history[source + axis];
          this.positions[position + axis] = start + (this.history[source + 3 + axis] - start) * f;
        }
        this.births[vertex] = this.times[row];
        this.uvs[uv] = this.count > 1 ? row / (this.count - 1) : 0;
        this.uvs[uv + 1] = (f - RADIAL[0]) / (1 - RADIAL[0]);
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aBirth.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
  }

  reset() {
    this.count = 0;
    this.history.fill(0);
    this.times.fill(0);
    this.positions.fill(0);
    this.births.fill(0);
    this.uvs.fill(0);
    this.mesh.visible = false;
    this.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.reset();
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
