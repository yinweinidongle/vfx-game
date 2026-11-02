import * as THREE from 'three';
const BANDS=8,SEGMENTS=64;
/** Image-authored spirit fire carried by eight curved 3D sheets around the torso. */
export class SpiritAura{
 constructor(parent){
  this.group=new THREE.Group();this.group.name='Painted three-dimensional spirit flames';parent.add(this.group);
  this.positions=new Float32Array(BANDS*(SEGMENTS+1)*2*3);const uv=new Float32Array(BANDS*(SEGMENTS+1)*2*2),index=[];
  for(let b=0;b<BANDS;b++)for(let j=0;j<=SEGMENTS;j++){const v=(b*(SEGMENTS+1)+j)*2;uv.set([j/SEGMENTS,0,j/SEGMENTS,1],v*2);if(j<SEGMENTS)index.push(v,v+1,v+2,v+1,v+3,v+2);}
  this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));this.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));this.geometry.setIndex(index);
  this.fallback=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);this.fallback.needsUpdate=true;
  this.uniforms={uMap:{value:this.fallback},uHasMap:{value:0},uColor:{value:new THREE.Color('#8ac4ff')},uPresence:{value:0},uTime:{value:0}};
  this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,blending:THREE.NormalBlending,
   vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`
    uniform sampler2D uMap;uniform vec3 uColor;uniform float uHasMap,uPresence,uTime;varying vec2 vUv;
    void main(){
      vec2 uv=vUv;uv.y+=sin(uv.x*12.-uTime*.8)*.025;
      vec4 ink=texture2D(uMap,uv);
      float fallback=pow(max(0.,1.-abs(vUv.y*2.-1.)),3.)*pow(max(0.,sin(vUv.x*3.1415926)),.5);
      float a=mix(fallback,ink.a,uHasMap);
      float core=smoothstep(.65,.96,mix(a,ink.r,uHasMap))*smoothstep(.65,.96,a);
      float flow=.88+.12*sin(vUv.x*15.-uTime*2.4);
      vec3 color=mix(uColor*.45,mix(uColor,vec3(1.),.6)*1.5,core)*flow;
      float ends=smoothstep(0.,.06,vUv.x)*(1.-smoothstep(.94,1.,vUv.x));
      float alpha=a*uPresence*.60*ends;
      if(alpha<.008)discard;gl_FragColor=vec4(color,alpha);
    }`});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=3;this.group.add(this.mesh);this.disposed=false;
 }
 async loadTexture(url){const texture=await new THREE.TextureLoader().loadAsync(url);if(this.disposed){texture.dispose();return false;}texture.colorSpace=THREE.NoColorSpace;texture.anisotropy=4;this.texture?.dispose();this.texture=texture;this.uniforms.uMap.value=texture;this.uniforms.uHasMap.value=1;return true;}
 update(t,presence,color){
  this.group.visible=presence>.001;this.uniforms.uPresence.value=presence;this.uniforms.uTime.value=t;this.uniforms.uColor.value.set(color);
  if(!this.group.visible)return;
  for(let b=0;b<BANDS;b++)for(let j=0;j<=SEGMENTS;j++){
   const u=j/SEGMENTS,phase=b*1.73+t*.055;let x,y,z,width;
   if(b<4){
    const a=phase+u*(3.1+(b%3)*.5),r=3.8+b*.6;
    x=Math.cos(a)*(1.2+b*.16);z=Math.sin(a)*r;
    y=.6+b*.65+Math.sin(u*Math.PI)*(1.8+(b%2)*.65)+Math.sin(a*2.)*.45;
    width=(2.7+(b%3)*.4)*Math.pow(Math.max(0,Math.sin(u*Math.PI)),.55);
   }else{
    const sign=b%2?1:-1;
    x=-.45+Math.sin(u*5.+phase)*.7;
    z=sign*(1.8+Math.sin(u*4.8+phase*.2)*1.05+u*.8);
    y=2.2+u*9;
    width=(2.1-u*.9)*Math.pow(Math.max(0,Math.sin(u*Math.PI)),.45);
   }
   const twist=Math.sin(u*5.+phase)*.35;
   for(let side=0;side<2;side++){const k=((b*(SEGMENTS+1)+j)*2+side)*3,s=side?1:-1;
    this.positions[k]=x+s*width*Math.sin(twist)*.5;
    this.positions[k+1]=y+(b<4?s*width*Math.cos(twist)*.5:0);
    this.positions[k+2]=z+(b<4?s*width*.18*Math.sin(phase):s*width*Math.cos(twist)*.5);
   }
  }
  this.geometry.attributes.position.needsUpdate=true;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.texture?.dispose();this.fallback.dispose();this.geometry.dispose();this.material.dispose();this.group.removeFromParent();}
}
