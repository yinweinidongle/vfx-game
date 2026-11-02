import * as THREE from 'three';

const vertexShader=/* glsl */`
  attribute float aLife;
  varying vec2 vUv;
  varying float vLife;
  void main() { vUv=uv; vLife=aLife; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;
const fragmentShader=/* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uLayer;
  uniform float uDrain;
  varying vec2 vUv;
  varying float vLife;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
  void main(){
    float tail=pow(max(0.0,1.0-vUv.x),1.15);
    float across=abs(vUv.y*2.0-1.0);
    float n=noise(vec2(vUv.x*11.0-uTime*3.8+uDrain*24.0,vUv.y*4.0+uTime*0.6));
    float fine=noise(vec2(vUv.x*43.0-uTime*11.0+uDrain*58.0,vUv.y*7.0));
    float edge=pow(max(0.0,1.0-across),1.5);
    float alpha;
    vec3 color;
    if(uLayer<0.5){
      float filament=pow(max(0.0,1.0-across),4.5);
      alpha=edge*tail*vLife*(0.72+fine*0.28);
      color=mix(uColor*1.25,vec3(1.35,1.9,2.0),filament*0.72)*(0.82+n*0.25);
    }else if(uLayer<1.5){
      float turbulence=sin(vUv.x*37.0-uTime*18.0+uDrain*58.0+vUv.y*9.0)*0.5+0.5;
      alpha=edge*tail*vLife*(0.2+n*0.4)*0.65;
      color=mix(uColor*0.45,uColor*1.6,fine*0.6+turbulence*0.4);
    }else if(uLayer<2.5){
      float wisps=noise(vec2(vUv.x*5.0-uTime*1.8+uDrain*8.0,vUv.y*3.0))*0.65+fine*0.35;
      float breakup=smoothstep(0.2,0.7,wisps-across*0.25);
      alpha=edge*tail*vLife*breakup*0.16;
      color=mix(uColor,vec3(0.62,0.78,0.9),0.48);
    }else{
      alpha=edge*tail*vLife*(0.38+fine*0.42);
      color=mix(uColor,vec3(0.7,1.15,1.4),0.45);
    }
    gl_FragColor=vec4(color,alpha);
  }
`;
const CAPACITY=384;
const VERTICES=256;
const IMPACT_DRAIN_DURATION=0.34;

/** History-space ribbons. All CPU buffers and vector scratch values are reused. */
export class FrostTrail {
  constructor(scene,config) {
    this.scene=scene;
    this.config=config;
    this.group=new THREE.Group();
    this.group.name='History-based frost ribbons';
    scene.add(this.group);
    this.history=new Float32Array(CAPACITY*4);
    this.head=-1;
    this.count=0;
    this.last=new THREE.Vector3();
    this.now=new THREE.Vector3();
    this.start=new THREE.Vector3();
    this.view=new THREE.Vector3();
    this.tangent=new THREE.Vector3(1,0,0);
    this.side=new THREE.Vector3();
    this.up=new THREE.Vector3();
    this.p=new THREE.Vector3();
    this.previous=new THREE.Vector3();
    this.hasLast=false;
    this.speed=20;
    this.age=0;
    this.impactActive=false;
    this.impactTarget=new THREE.Vector3();
    this.impactStartClock=0;
    this.impactSkillTime=0;
    this.impactLifespan=0.4;
    this.color=new THREE.Color(config.frostColor);
    this.layers=[];
    const specs=[{kind:2,width:0.72,angle:0,order:1},{kind:1,width:0.27,angle:1.1,order:2},{kind:0,width:0.095,angle:0,order:3},{kind:3,width:0.025,angle:0,order:3,swirl:1},{kind:3,width:0.018,angle:0.65,order:3,swirl:-1}];
    for(const spec of specs){
      const positions=new Float32Array(VERTICES*2*3);
      const uvs=new Float32Array(VERTICES*2*2);
      const life=new Float32Array(VERTICES*2);
      const indices=new Uint16Array((VERTICES-1)*6);
      for(let i=0;i<VERTICES-1;i++){
        const a=i*2,k=i*6;
        indices.set([a,a+1,a+2,a+1,a+3,a+2],k);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('aLife',new THREE.BufferAttribute(life,1).setUsage(THREE.DynamicDrawUsage));
      geometry.setIndex(new THREE.BufferAttribute(indices,1));
      geometry.setDrawRange(0,0);
      const material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uColor:{value:this.color},uLayer:{value:spec.kind},uDrain:{value:0}},vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
      const mesh=new THREE.Mesh(geometry,material);
      mesh.frustumCulled=false;
      mesh.renderOrder=spec.order;
      this.group.add(mesh);
      this.layers.push({...spec,geometry,material,mesh,positions,uvs,life});
    }
  }
  reset(){
    this.head=-1;this.count=0;this.hasLast=false;this.age=0;this.speed=20;
    this.impactActive=false;this.impactStartClock=0;this.impactSkillTime=0;
    for(const layer of this.layers){layer.geometry.setDrawRange(0,0);layer.material.uniforms.uDrain.value=0;}
  }
  addPoint(x,y,z,time){
    this.head=(this.head+1)%CAPACITY;
    const k=this.head*4;
    this.history[k]=x;this.history[k+1]=y;this.history[k+2]=z;this.history[k+3]=time;
    this.count=Math.min(this.count+1,CAPACITY);
  }
  /** Bridge the last tail sample into the contact, then consume the ribbon there. */
  impact(target,time){
    if(this.impactActive)return;
    this.impactActive=true;
    this.impactTarget.copy(target);
    this.impactStartClock=this.age;
    this.impactSkillTime=Number.isFinite(time)?time:this.age;
    this.impactLifespan=Math.min(1.04,Math.max(0.2,this.config.trailLength/Math.max(7,this.speed))*1.12);
    if(this.count>0){
      const k=this.head*4;
      this.start.set(this.history[k],this.history[k+1],this.history[k+2]);
      const distance=this.start.distanceTo(target);
      const steps=Math.min(96,Math.max(1,Math.ceil(distance/0.065)));
      for(let i=1;i<=steps;i++){
        const f=i/steps;
        this.addPoint(THREE.MathUtils.lerp(this.start.x,target.x,f),THREE.MathUtils.lerp(this.start.y,target.y,f),THREE.MathUtils.lerp(this.start.z,target.z,f),this.age);
      }
    }else this.addPoint(target.x,target.y,target.z,this.age);
    this.last.copy(target);
  }
  update(dt,time,position,emitting,camera,config,direction){
    this.config=config;
    this.age+=dt;
    const clock=this.age;
    this.color.set(config.frostColor);
    this.now.copy(position);
    if(direction)this.now.addScaledVector(direction,-1.94*config.arrowSize);
    else this.now.x-=1.94*config.arrowSize;
    if(emitting&&!this.impactActive){
      if(!this.hasLast){
        this.last.copy(this.now);this.addPoint(this.now.x,this.now.y,this.now.z,clock);
        this.hasLast=true;
      }else{
        const distance=this.last.distanceTo(this.now);
        if(distance>0.0001){
          this.speed=THREE.MathUtils.lerp(this.speed,distance/Math.max(dt,0.0001),0.24);
          const steps=Math.min(64,Math.max(1,Math.ceil(distance/0.09)));
          for(let i=1;i<=steps;i++){
            const f=i/steps;
            this.addPoint(THREE.MathUtils.lerp(this.last.x,this.now.x,f),THREE.MathUtils.lerp(this.last.y,this.now.y,f),THREE.MathUtils.lerp(this.last.z,this.now.z,f),clock-dt*(1-f));
          }
        }
        this.last.copy(this.now);
      }
    }
    const impactAge=this.impactActive?Math.max(0,time-this.impactSkillTime):0;
    const progress=this.impactActive?THREE.MathUtils.clamp(impactAge/IMPACT_DRAIN_DURATION,0,1):0;
    // The head stays at the target. Historical samples accelerate toward it,
    // rather than leaving a disconnected ribbon fixed behind the character.
    const transport=progress*progress*(3-2*progress);
    const impactFade=this.impactActive?1-THREE.MathUtils.smoothstep(progress,0.1,1):1;
    if(this.impactActive&&progress>=1){
      this.count=0;this.hasLast=false;
      for(const layer of this.layers){layer.geometry.setDrawRange(0,0);layer.material.uniforms.uDrain.value=1;}
      return;
    }
    if(this.count<2){for(const layer of this.layers)layer.geometry.setDrawRange(0,0);return;}
    const lifespan=this.impactActive?this.impactLifespan:Math.min(1.04,Math.max(0.2,config.trailLength/Math.max(7,this.speed))*1.12);
    let samples=0;
    let distance=0;
    const maxSamples=Math.min(this.count,VERTICES);
    for(let i=0;i<maxSamples;i++){
      const index=(this.head-i+CAPACITY)%CAPACITY;
      const k=index*4;
      this.p.set(this.history[k],this.history[k+1],this.history[k+2]);
      const age=(this.impactActive?this.impactStartClock:clock)-this.history[k+3];
      if(i>0)distance+=this.p.distanceTo(this.previous);
      if(distance>config.trailLength||age>lifespan)break;
      const next=(index-1+CAPACITY)%CAPACITY;
      if(i<maxSamples-1){
        this.tangent.set(this.p.x-this.history[next*4],this.p.y-this.history[next*4+1],this.p.z-this.history[next*4+2]).normalize();
      }
      if(this.tangent.lengthSq()<0.001)this.tangent.set(1,0,0);
      this.previous.copy(this.p);
      if(this.impactActive)this.p.lerp(this.impactTarget,transport);
      this.view.subVectors(camera.position,this.p).normalize();
      this.side.crossVectors(this.tangent,this.view).normalize();
      if(this.side.lengthSq()<0.01)this.side.set(0,1,0);
      this.up.crossVectors(this.side,this.tangent).normalize();
      const u=Math.max(distance/config.trailLength,age/lifespan*0.72);
      const fading=Math.pow(Math.max(0,1-age/lifespan),0.65)*impactFade;
      const breadth=(0.68+Math.sin(Math.min(u,1)*Math.PI)*0.95)*config.arrowSize*(1-transport*0.82);
      for(const layer of this.layers){
        const wave=layer.swirl?Math.sin(distance*2.2-time*5.5+progress*16)*0.12*config.arrowSize*layer.swirl*Math.min(distance*2,1)*(1-transport):0;
        const sideX=this.side.x*Math.cos(layer.angle)+this.up.x*Math.sin(layer.angle);
        const sideY=this.side.y*Math.cos(layer.angle)+this.up.y*Math.sin(layer.angle);
        const sideZ=this.side.z*Math.cos(layer.angle)+this.up.z*Math.sin(layer.angle);
        let width=layer.width*breadth;
        if(layer.kind===2)width*=1+Math.max(0,age)*1.6;
        const drift=layer.kind===2?Math.sin(distance*1.4-time*1.8)*0.055*config.arrowSize*u*(1-transport):0;
        const base=i*6;
        for(let j=0;j<2;j++){
          const sign=j===0?-1:1;
          layer.positions[base+j*3]=this.p.x+sideX*(sign*width+wave);
          layer.positions[base+j*3+1]=this.p.y+sideY*(sign*width+wave)+drift;
          layer.positions[base+j*3+2]=this.p.z+sideZ*(sign*width+wave);
          layer.uvs[i*4+j*2]=u;
          layer.uvs[i*4+j*2+1]=j;
          layer.life[i*2+j]=fading;
        }
      }
      samples++;
    }
    for(const layer of this.layers){
      layer.geometry.attributes.position.needsUpdate=true;
      layer.geometry.attributes.uv.needsUpdate=true;
      layer.geometry.attributes.aLife.needsUpdate=true;
      layer.geometry.setDrawRange(0,Math.max(0,samples-1)*6);
      layer.material.uniforms.uTime.value=time;
      layer.material.uniforms.uDrain.value=progress;
    }
    if(samples===0){this.count=0;this.hasLast=false;}
  }
  dispose(){
    for(const layer of this.layers){layer.geometry.dispose();layer.material.dispose();}
    this.group.removeFromParent();
  }
}
