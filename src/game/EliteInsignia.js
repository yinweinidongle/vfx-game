import * as T from 'three';

/** Small, readable silhouette accents; only the edges exceed the bloom threshold. */
export class EliteInsignia {
  constructor(parent, color) {
    this.group = new T.Group(); parent.add(this.group);
    this.uniforms = { uTime:{value:0}, uPower:{value:0}, uColor:{value:new T.Color(color)} };
    const material = new T.ShaderMaterial({ uniforms:this.uniforms, transparent:true, depthWrite:false,
      vertexShader:`varying vec3 vN,vV;void main(){vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);vV=-p.xyz;gl_Position=projectionMatrix*p;}`,
      fragmentShader:`uniform vec3 uColor;uniform float uPower;varying vec3 vN,vV;void main(){float rim=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.);gl_FragColor=vec4(uColor*(.45+rim*(1.7+uPower)),.88);}` });
    this.crystals = new T.InstancedMesh(new T.OctahedronGeometry(1),material,5);
    this.crystals.frustumCulled=false; this.group.add(this.crystals);
    const object=new T.Object3D();
    for(let i=0;i<5;i++) {
      const side=i<2?-1:1, k=i%2;
      object.position.set(i===4?0:side*(.48+k*.12),i===4?2.55:1.88+k*.18,-.08);
      object.rotation.z=i===4?0:-side*.28;object.scale.set(i===4?.065:.065,i===4?.18:.17+k*.035,.045);
      object.updateMatrix();this.crystals.setMatrixAt(i,object.matrix);
    }
    const ringMaterial=new T.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
      vertexShader:'varying vec2 vP;void main(){vP=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform vec3 uColor;uniform float uTime,uPower;varying vec2 vP;void main(){float r=length(vP),a=atan(vP.y,vP.x);float ring=exp(-pow((r-.83)*110.,2.));float segments=smoothstep(.15,.35,sin(a*6.+uTime*.8));float ticks=exp(-pow((r-.94)*85.,2.))*pow(max(0.,cos(a*12.)),30.);float alpha=(ring*(.2+segments*.5)+ticks*.5)*(.65+uPower*.3);if(alpha<.005)discard;gl_FragColor=vec4(uColor*(1.+uPower*.35),alpha);}`});
    this.ring=new T.Mesh(new T.PlaneGeometry(2,2),ringMaterial);this.ring.rotation.x=-Math.PI/2;this.ring.position.y=.06;this.group.add(this.ring);
  }
  update(time, enemy) { this.uniforms.uTime.value=time;this.uniforms.uPower.value=enemy.state==='windup'?1-enemy.timer/enemy.windup:0; }
  dispose() { for(const mesh of [this.crystals,this.ring]) { mesh.geometry.dispose();mesh.material.dispose(); }this.group.removeFromParent(); }
}
