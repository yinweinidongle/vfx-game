import * as T from 'three';
const COUNT=96,SAMPLES=64,STEP=.1,DRAIN=.24;
const spiritStyle=b=>b.owner==='player'&&b.kind==='spirit'?(b.fervor?(b.aspect==='cultivator'?.45:0):(b.primary?1:0)):0;
const vertex=`attribute float aLife,aGlow,aStyle;attribute vec3 aColor;varying vec2 vUv;varying float vLife,vGlow,vStyle;varying vec3 vColor;void main(){vUv=uv;vLife=aLife;vGlow=aGlow;vStyle=aStyle;vColor=aColor;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment=`uniform float uTime;varying vec2 vUv;varying float vLife,vGlow,vStyle;varying vec3 vColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
void main(){if(vLife<.001)discard;float u=clamp(vUv.x,0.,1.),y=vUv.y*2.-1.;float n=noise(vec2(u*13.-uTime*4.,y*3.));
if(vStyle>.1){
float flow=noise(vec2(u*18.-uTime*6.,y*4.))*.65+noise(vec2(u*35.-uTime*9.,y*7.))*.35;
float bend=sin(u*15.-uTime*12.)*.07*u;
float core=exp(-pow((y+bend)/max(.10,fwidth(y)*.8),2.));
float veinA=exp(-pow((y-.34*sin(u*12.-uTime*7.))/max(.035,fwidth(y)*.8),2.));
float veinB=exp(-pow((y+.27*sin(u*17.-uTime*8.+2.))/max(.025,fwidth(y)*.65),2.));
float mantle=pow(max(0.,1.-abs(y)),1.7)*smoothstep(.22,.65,flow+(1.-abs(y))*.25);
float fade=pow(1.-u,1.45)*vLife;
float pulse=.82+.18*sin(u*28.-uTime*23.);
float a=(core*.82+mantle*.20+(veinA+veinB)*.16)*fade;if(a<.003)discard;
vec3 white=mix(vec3(.85,.97,1.),min(vColor,vec3(1.)),.16);
vec3 outer=mix(vColor,vec3(.30,.16,.95),.48);
vec3 c=outer*(.9+mantle*.45)+white*core*(3.0+.6*pulse)+(veinA+veinB)*vColor*1.7;
gl_FragColor=vec4(c,a*(vStyle<.6?.72:1.));return;
}
float filament=y+sin(u*22.-uTime*11.)*.06*u;float coreWidth=max(.085,fwidth(filament)*.8);float core=exp(-pow(filament/coreWidth,2.));float mist=pow(max(0.,1.-abs(y)),2.5)*(.32+n*.18);
float fade=pow(1.-u,1.65)*vLife;float a=(core*.5+mist*.4)*fade;if(a<.004)discard;
vec3 color=vColor*(.4+core*vGlow)+vec3(.22,.29,.32)*core;gl_FragColor=vec4(color,a);}`;
const mantleFragment=`uniform float uTime;varying vec2 vUv;varying float vLife,vGlow,vStyle;varying vec3 vColor;
void main(){if(vStyle<.6||vLife<.002)discard;float u=clamp(vUv.x,0.,1.),y=vUv.y*2.-1.;
float fold=.7+.3*sin(u*28.-uTime*15.+y*6.);float edge=pow(max(0.,1.-abs(y)),.7);
float a=edge*pow(1.-u,1.2)*vLife*(.24+.12*fold);if(a<.004)discard;
vec3 tint=pow(min(vColor,vec3(1.)),vec3(1.7));gl_FragColor=vec4(tint*(.62+fold*.35),a);}`;

/** Fixed-distance samples keep curved, narrow wakes stable at every frame rate. */
export class GameProjectileTrails {
  constructor(parent,camera) {
    this.camera=camera;this.history=new Float32Array(COUNT*SAMPLES*3);this.count=new Uint8Array(COUNT);this.head=new Int16Array(COUNT).fill(-1);this.age=new Float32Array(COUNT).fill(10);this.wasAlive=new Uint8Array(COUNT);this.lastHead=new Float32Array(COUNT*3);this.directions=new Float32Array(COUNT*3);
    this.positions=new Float32Array(COUNT*SAMPLES*6);this.uvs=new Float32Array(COUNT*SAMPLES*4);this.life=new Float32Array(COUNT*SAMPLES*2);this.glow=new Float32Array(COUNT*SAMPLES*2);this.styles=new Float32Array(COUNT*SAMPLES*2);this.colors=new Float32Array(COUNT*SAMPLES*6);
    this.point=new T.Vector3();this.previous=new T.Vector3();this.last=new T.Vector3();this.next=new T.Vector3();this.direction=new T.Vector3();this.view=new T.Vector3();this.side=new T.Vector3();this.priorSide=new T.Vector3();this.color=new T.Color();
    const indices=[];for(let n=0;n<COUNT;n++)for(let j=0;j<SAMPLES-1;j++){const v=n*SAMPLES*2+j*2;indices.push(v,v+1,v+2,v+1,v+3,v+2);}
    this.geometry=new T.BufferGeometry();for(const [name,array,size]of [['position',this.positions,3],['uv',this.uvs,2],['aLife',this.life,1],['aGlow',this.glow,1],['aStyle',this.styles,1],['aColor',this.colors,3]])this.geometry.setAttribute(name,new T.BufferAttribute(array,size).setUsage(T.DynamicDrawUsage));this.geometry.setIndex(indices);
    this.material=new T.ShaderMaterial({uniforms:{uTime:{value:0}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.AdditiveBlending});
    this.mesh=new T.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=3;parent.add(this.mesh);
    this.mantleMaterial=new T.ShaderMaterial({uniforms:this.material.uniforms,vertexShader:vertex,fragmentShader:mantleFragment,transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide});
    this.mantle=new T.Mesh(this.geometry,this.mantleMaterial);this.mantle.frustumCulled=false;this.mantle.renderOrder=2.9;this.mantle.visible=false;parent.add(this.mantle);
  }
  begin(b) {
    const id=b.id;this.count[id]=0;this.head[id]=-1;this.age[id]=0;this.wasAlive[id]=1;this.lastHead[id*3]=b.x;this.lastHead[id*3+1]=b.y;this.lastHead[id*3+2]=b.z;this.directions.set([Math.sin(b.yaw),0,Math.cos(b.yaw)],id*3);
    this.color.set(b.owner==='enemy'?'#d069a5':b.color).multiplyScalar(Math.min(1.65,b.radiance||1));
    this.styles.fill(spiritStyle(b),id*SAMPLES*2,(id+1)*SAMPLES*2);this.geometry.attributes.aStyle.needsUpdate=true;
    this.glow.fill(b.kind==='arrow'?3.4:b.kind==='frost'?2.15:1.7,id*SAMPLES*2,(id+1)*SAMPLES*2);this.geometry.attributes.aGlow.needsUpdate=true;for(let j=0;j<SAMPLES*2;j++)this.color.toArray(this.colors,(id*SAMPLES*2+j)*3);this.geometry.attributes.aColor.needsUpdate=true;
  }
  getDirection(id,out) { return out.fromArray(this.directions,id*3); }
  push(id,point) { this.head[id]=(this.head[id]+1)%SAMPLES;point.toArray(this.history,(id*SAMPLES+this.head[id])*3);this.count[id]=Math.min(SAMPLES,this.count[id]+1); }
  connect(id,point) {
    if(!this.count[id]){this.push(id,point);return;}
    this.last.fromArray(this.history,(id*SAMPLES+this.head[id])*3);const distance=this.last.distanceTo(point);if(distance<.001)return;
    const steps=Math.min(SAMPLES,Math.max(1,Math.ceil(distance/STEP)));
    for(let j=1;j<=steps;j++){this.next.copy(this.last).lerp(point,j/steps);this.push(id,this.next);}
  }
  update(dt,time,projectiles) {
    this.material.uniforms.uTime.value=time;
    this.mantle.visible=false;
    for(const b of projectiles){
      const id=b.id,base=id*SAMPLES*2;if(b.kind==='slash'){this.life.fill(0,base,base+SAMPLES*2);continue;}
      if(!b.alive&&!this.count[id])continue;if(b.alive&&b.age<b.delay)continue;
      if(b.alive){
        this.direction.set(b.x-this.lastHead[id*3],b.y-this.lastHead[id*3+1],b.z-this.lastHead[id*3+2]);if(this.direction.lengthSq()<.000001)this.getDirection(id,this.direction);this.direction.normalize();this.direction.toArray(this.directions,id*3);this.lastHead[id*3]=b.x;this.lastHead[id*3+1]=b.y;this.lastHead[id*3+2]=b.z;
        this.point.set(b.x,b.y,b.z).addScaledVector(this.direction,(b.kind==='arrow'||b.kind==='frost')?-.44*b.scale:spiritStyle(b)>.6?-.28*b.scale:0);this.connect(id,this.point);this.age[id]=0;
      }else{
        if(this.wasAlive[id]&&b.retiredReason==='hit'){this.point.set(b.x,b.y,b.z);this.connect(id,this.point);}
        this.age[id]+=dt;
      }
      this.wasAlive[id]=b.alive?1:0;
      const style=spiritStyle(b),fade=Math.max(0,1-this.age[id]/DRAIN),limit=b.kind==='frost'?3.2:b.kind==='arrow'?2.15:b.owner==='enemy'?1.7:style>.6?3.1+(b.tier||0)*.22:style>.1?2.25:1.8;
      const width=(b.kind==='frost'?.065:b.kind==='arrow'?.06:b.owner==='enemy'?.045:style>.6?.18:style>.1?.034:b.fervor?.018:.035)*Math.sqrt(b.scale||1);
      const count=this.count[id];if(fade===0){this.count[id]=0;this.life.fill(0,base,base+SAMPLES*2);continue;}
      if(style>.6&&count>1)this.mantle.visible=true;
      let distance=0;this.priorSide.set(0,0,0);
      for(let j=0;j<SAMPLES;j++){
        const index=(this.head[id]-Math.min(j,count-1)+SAMPLES)%SAMPLES;this.point.fromArray(this.history,(id*SAMPLES+index)*3);
        if(j){const length=this.point.distanceTo(this.previous);if(distance+length>limit){this.next.copy(this.point);this.point.copy(this.previous).lerp(this.next,Math.max(0,(limit-distance)/Math.max(length,.0001)));}distance=Math.min(limit,distance+length);}
        this.previous.copy(this.point);const u=Math.min(1,distance/limit),next=(index-1+SAMPLES)%SAMPLES;this.next.fromArray(this.history,(id*SAMPLES+next)*3);
        this.direction.subVectors(this.point,this.next);if(j>=count-1||this.direction.lengthSq()<.000001)this.getDirection(id,this.direction);this.direction.normalize();
        if(!b.alive&&b.retiredReason==='hit'){const drain=T.MathUtils.smoothstep(this.age[id],0,DRAIN);this.point.lerp(this.next.set(b.x,b.y,b.z),drain);}
        this.view.subVectors(this.camera.position,this.point);this.side.crossVectors(this.direction,this.view);
        if(this.side.lengthSq()<.000001)this.side.set(1,0,0);this.side.normalize();if(j&&this.side.dot(this.priorSide)<0)this.side.negate();this.priorSide.copy(this.side);
        const w=width*Math.pow(1-u,.75)*fade;
        for(let side=0;side<2;side++){const v=base+j*2+side,k=v*3,sign=side?1:-1;this.positions[k]=this.point.x+this.side.x*w*sign;this.positions[k+1]=this.point.y+this.side.y*w*sign;this.positions[k+2]=this.point.z+this.side.z*w*sign;this.uvs[v*2]=u;this.uvs[v*2+1]=side;this.life[v]=j<count&&count>1?fade:0;}
      }
    }
    this.geometry.attributes.position.needsUpdate=this.geometry.attributes.uv.needsUpdate=this.geometry.attributes.aLife.needsUpdate=true;
  }
  reset(){this.count.fill(0);this.head.fill(-1);this.age.fill(10);this.wasAlive.fill(0);this.life.fill(0);this.geometry.attributes.aLife.needsUpdate=true;this.mantle.visible=false;}
  dispose(){this.geometry.dispose();this.material.dispose();this.mantleMaterial.dispose();this.mesh.removeFromParent();this.mantle.removeFromParent();}
}
