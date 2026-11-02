import * as T from 'three';

/** Paired emissive lenses stay on the FBX eye bones, including run and hit poses. */
export class NightEyes {
  constructor(scene) {
    const geometry = new T.SphereGeometry(1, 12, 8);
    this.material = new T.ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { uRage: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `varying vec3 vN,vView;void main(){vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);vView=-p.xyz;vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);gl_Position=projectionMatrix*p;}`,
      fragmentShader: `uniform float uRage,uTime;varying vec3 vN,vView;void main(){float front=max(0.,dot(normalize(vN),normalize(vView)));float core=pow(front,2.);float pulse=.94+.06*sin(uTime*5.);gl_FragColor=vec4(mix(vec3(1.5,.003,.012),vec3(3.2,.025,.04),core)*pulse, uRage*(.5+core*.5));}`,
    });
    this.mesh = new T.InstancedMesh(geometry, this.material, 72);this.mesh.count = 0;this.mesh.renderOrder = 6;this.mesh.frustumCulled = false;scene.add(this.mesh);
    this.local = new T.Matrix4();this.position = new T.Vector3();this.scale = new T.Vector3();this.rotation = new T.Quaternion();this.matrix = new T.Matrix4();
  }
  update(views, time, rage) {
    this.material.uniforms.uRage.value = rage;this.material.uniforms.uTime.value = time;let count = 0;
    if(rage > .005)for (const v of views.values()) {
      if (!v.group.visible || v.enemy.hp <= 0 || v.enemy.spawnGrace > 0) continue;
      v.group.updateMatrixWorld(true);
      for (const eye of v.eyes) {
        if (!eye || count >= 72) continue;
        const unit = 1 / v.sourceScale;
        this.position.set(0, 0, .011 * unit);this.scale.set(.039 * unit, .018 * unit, .021 * unit);
        this.local.compose(this.position, this.rotation, this.scale);this.matrix.multiplyMatrices(eye.matrixWorld, this.local);
        this.mesh.setMatrixAt(count++, this.matrix);
      }
    }
    this.mesh.count = count;this.mesh.visible = count > 0;this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent();this.mesh.geometry.dispose();this.material.dispose(); }
}
