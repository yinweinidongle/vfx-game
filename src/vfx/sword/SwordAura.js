import * as THREE from 'three';

/** Three threaded charge ribbons built around the actual animated blade. */
export class SwordAura {
  constructor(scene, config) {
    this.config=config;this.positions=new Float32Array(3*72*2*3);this.uvs=new Float32Array(3*72*2*2);const indices=[];
    for(let r=0;r<3;r++)for(let i=0;i<72;i++){const k=r*72+i;this.uvs.set([i/71,0,i/71,1],k*4);if(i<71){const a=k*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
    this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));this.geometry.setAttribute('uv',new THREE.BufferAttribute(this.uvs,2));this.geometry.setIndex(indices);
    this.material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uStrength:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform float uTime,uStrength;varying vec2 vUv;void main(){float center=pow(max(0.,1.-abs(vUv.y*2.-1.)),2.);float taper=pow(max(0.,sin(vUv.x*3.14159)),.5);float pulse=.32+.68*pow(.5+.5*sin(vUv.x*27.-uTime*22.),5.);vec3 c=mix(vec3(.22,.7,1.),vec3(.65,.4,1.),smoothstep(.5,.95,vUv.x));gl_FragColor=vec4(c*1.6,center*taper*pulse*uStrength*.6);}`});
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=5;scene.add(this.mesh);
    this.direction=new THREE.Vector3();this.side=new THREE.Vector3();this.up=new THREE.Vector3();this.point=new THREE.Vector3();this.yAxis=new THREE.Vector3(0,1,0);
  }
  update(time,base,tip,strength){
    this.mesh.visible=strength>.001;if(!this.mesh.visible)return;
    this.material.uniforms.uTime.value=time;this.material.uniforms.uStrength.value=strength;
    this.direction.subVectors(tip,base).normalize();this.side.crossVectors(this.direction,this.yAxis).normalize();if(this.side.lengthSq()<.01)this.side.set(0,0,1);this.up.crossVectors(this.side,this.direction).normalize();
    const radius=.17*(1-THREE.MathUtils.smoothstep(time,.3,.58))+.025;
    for(let r=0;r<3;r++)for(let i=0;i<72;i++){const u=i/71,a=u*8.+r*Math.PI*2/3-time*(9+time*20);this.point.lerpVectors(base,tip,u).addScaledVector(this.side,Math.cos(a)*radius).addScaledVector(this.up,Math.sin(a)*radius);
      for(let j=0;j<2;j++){const w=(j?1:-1)*.013,k=((r*72+i)*2+j)*3;this.positions[k]=this.point.x+this.side.x*w;this.positions[k+1]=this.point.y+this.side.y*w;this.positions[k+2]=this.point.z+this.side.z*w;}}
    this.geometry.attributes.position.needsUpdate=true;
  }
  reset(){this.mesh.visible=false;}
  dispose(){this.geometry.dispose();this.material.dispose();this.mesh.removeFromParent();}
}
