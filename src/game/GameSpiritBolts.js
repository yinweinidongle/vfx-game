import * as T from 'three';
import { heightAt } from './GameData.js';

const CAPACITY=96,SPARKS=192,IMPACTS=24;
export const isSpiritBolt=b=>b.owner==='player'&&b.kind==='spirit'&&b.primary&&!b.fervor;

// A solid tapered heart, a translucent mantle and two narrow helical filaments.
// All three share an instanced pool with separate core/mantle blending.
function spiritGeometry(){
  const positions=[],uvs=[],layers=[],indices=[],groups=[];
  const profile=[[-.66,0],[-.48,.045],[-.24,.083],[.02,.105],[.22,.072],[.43,0]];
  for(let layer=0;layer<2;layer++){
    const start=positions.length/3,indexStart=indices.length;
    for(let j=0;j<profile.length;j++)for(let k=0;k<=12;k++){
      const a=k/12*Math.PI*2,[y,r]=profile[j],radius=r*(layer?1.45:.37);
      positions.push(Math.cos(a)*radius,y*(layer?1:.83),Math.sin(a)*radius);
      uvs.push(k/12,(y+.66)/1.09);layers.push(layer);
    }
    for(let j=0;j<profile.length-1;j++)for(let k=0;k<12;k++){
      const i=start+j*13+k;indices.push(i,i+13,i+1,i+1,i+13,i+14);
    }
    groups.push([indexStart,indices.length-indexStart,layer]);
  }
  const strandStart=indices.length;
  for(let strand=0;strand<2;strand++){
    const start=positions.length/3;
    for(let j=0;j<=28;j++)for(let side=0;side<2;side++){
      const t=j/28,a=t*Math.PI*2.2+strand*Math.PI,fade=Math.sin(t*Math.PI),r=.175*fade;
      const theta=a+(side?1:-1)*.065;
      positions.push(Math.cos(theta)*r,-.62+t*.98,Math.sin(theta)*r);
      uvs.push(side,t);layers.push(2);
    }
    for(let j=0;j<28;j++){const i=start+j*2;indices.push(i,i+1,i+2,i+1,i+3,i+2);}
  }
  groups.push([strandStart,indices.length-strandStart,0]);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setAttribute('aLayer',new T.Float32BufferAttribute(layers,1));g.setIndex(indices);for(const group of groups)g.addGroup(...group);g.computeVertexNormals();return g;
}
const bodyVertex=`attribute vec3 aTint;attribute vec2 aData;attribute float aLayer;
uniform float uTime;varying vec3 vTint,vNormal,vEye;varying vec2 vUv,vData;varying float vLayer;
void main(){vTint=aTint;vData=aData;vUv=uv;vLayer=aLayer;vec3 p=position;
float turn=uTime*6.+aData.y;float cs=cos(turn),sn=sin(turn);mat2 rot=mat2(cs,-sn,sn,cs);
p.xz=rot*p.xz;vec3 n=normal;n.xz=rot*n.xz;
vec4 eye=modelViewMatrix*instanceMatrix*vec4(p,1.);vEye=-eye.xyz;
vNormal=normalize(normalMatrix*mat3(instanceMatrix)*n);gl_Position=projectionMatrix*eye;}`;
const bodyFragment=`uniform float uTime;varying vec3 vTint,vNormal,vEye;varying vec2 vUv,vData;varying float vLayer;
void main(){float presence=vData.x*smoothstep(.3,.9,length(vEye));if(presence<.002)discard;
float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vEye))),2.1);
float pulse=.8+.2*sin(vUv.y*30.-uTime*19.+vData.y);
float scan=pow(max(0.,sin(vUv.y*38.-uTime*27.+vUv.x*7.)),14.);
vec3 white=mix(vec3(.8,.95,1.),vTint,.16);
vec3 c;float a;
if(vLayer<.5){c=white*(2.4+pulse*.5)+vTint*.35;a=.9;}
else if(vLayer<1.5){float facet=pow(max(0.,dot(normalize(vNormal),normalize(vec3(.25,.8,.5)))),8.);
c=pow(vTint,vec3(1.55))*(.55+rim*2.3)+white*(scan*.25+facet*.25);a=.42+rim*.35;}
else{c=vTint*2.9+white*.3;a=sin(vUv.y*3.14159)*(.55+scan*.4);}
gl_FragColor=vec4(c,a*presence);}`;
const glowVertex=`attribute vec3 aTint;attribute vec2 aData;varying vec3 vTint;varying vec2 vP,vData;
void main(){vTint=aTint;vData=aData;vP=position.xy;
vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
vec3 forward=normalize(mat3(modelViewMatrix)*instanceMatrix[1].xyz);
vec3 right=cross(forward,normalize(-center.xyz));if(dot(right,right)<.001)right=cross(forward,vec3(0.,1.,0.));if(dot(right,right)<.001)right=vec3(1.,0.,0.);right=normalize(right);
float scale=length(instanceMatrix[0].xyz);center.xyz+=scale*(right*position.x*.35+forward*position.y*.8);
gl_Position=projectionMatrix*center;}`;
const glowFragment=`varying vec3 vTint;varying vec2 vP,vData;
void main(){vec2 p=vP;p.y+=.12;float r=length(p*vec2(1.,.72));
float corona=exp(-r*r*10.)*.16;float star=exp(-abs(p.x)*35.)*exp(-abs(p.y)*9.)+exp(-abs(p.y)*50.)*exp(-abs(p.x)*10.);
float edge=(1.-smoothstep(.65,1.,abs(vP.x)))*(1.-smoothstep(.65,1.,abs(vP.y)));
float a=(corona+star*.34)*edge*vData.x;if(a<.002)discard;
gl_FragColor=vec4(mix(vTint,vec3(.75,.94,1.),.45)*(1.8+star*2.8),a);}`;
const impactVertex=`attribute vec3 aTint;attribute vec2 aData;varying vec3 vTint;varying vec2 vP,vData;
void main(){vTint=aTint;vData=aData;vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const impactFragment=`varying vec3 vTint;varying vec2 vP,vData;
void main(){float t=vData.x,r=length(vP),angle=atan(vP.y,vP.x);float fade=pow(max(0.,1.-t),2.);
float flash=pow(max(0.,1.-t*4.5),2.);float crossLight=exp(-abs(vP.x)*65.)*exp(-abs(vP.y)*5.)+exp(-abs(vP.y)*65.)*exp(-abs(vP.x)*5.);
float rays=pow(max(0.,cos(angle*5.+vData.y)),28.)*exp(-r*5.)*smoothstep(.06,.17,r);
float ring=exp(-pow((r-(.14+sqrt(t)*.7))*65.,2.))*(.5+.5*pow(sin(angle*6.+t*8.),2.));
float a=(crossLight*flash+ring*.28*fade+rays*fade*.6)*(1.-smoothstep(.8,1.,r));if(a<.004)discard;
vec3 c=mix(vTint*2.4,vec3(3.6,4.2,4.7),flash*crossLight);gl_FragColor=vec4(c,a);}`;
const sparkVertex=`attribute vec3 aTint;attribute vec2 aData;varying vec3 vTint;varying float vLife;
void main(){vTint=aTint;vLife=aData.x;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const sparkFragment=`varying vec3 vTint;varying float vLife;void main(){if(vLife<.005)discard;gl_FragColor=vec4(mix(vTint,vec3(.8,.94,1.),vLife*.6)*(1.5+vLife*1.5),vLife);}`;

/** Fixed-size pools. Simulation, homing and damage remain owned by GameState. */
export class GameSpiritBolts{
  constructor(parent,camera,state,trails){
    this.camera=camera;this.state=state;this.trails=trails;this.group=new T.Group();parent.add(this.group);
    this.dummy=new T.Object3D();this.direction=new T.Vector3();this.up=new T.Vector3(0,1,0);this.color=new T.Color();
    this.generation=new Int32Array(CAPACITY).fill(-1);this.lastShed=new Float32Array(CAPACITY).fill(-1);
    this.sparks=Array.from({length:SPARKS},()=>({age:10,life:1}));this.impacts=Array.from({length:IMPACTS},()=>({age:10}));this.sparkCursor=0;this.impactCursor=0;
    this.body=this.pool(spiritGeometry(),bodyVertex,bodyFragment,CAPACITY);
    const mantle=this.body.material.clone();mantle.blending=T.NormalBlending;this.body.material=[this.body.material,mantle];
    this.glow=this.pool(new T.PlaneGeometry(2,2),glowVertex,glowFragment,CAPACITY);
    this.flashes=this.pool(new T.PlaneGeometry(2,2),impactVertex,impactFragment,IMPACTS);
    const shard=new T.TetrahedronGeometry(1);shard.scale(.26,1,.16);
    this.fragments=this.pool(shard,sparkVertex,sparkFragment,SPARKS);
  }
  pool(g,vertexShader,fragmentShader,capacity){
    for(const [name,size]of [['aTint',3],['aData',2]])g.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(capacity*size),size).setUsage(T.DynamicDrawUsage));
    const material=new T.ShaderMaterial({uniforms:{uTime:{value:0}},vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.AdditiveBlending});
    const mesh=new T.InstancedMesh(g,material,capacity);mesh.count=0;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.renderOrder=4;this.group.add(mesh);return mesh;
  }
  write(mesh,index,life,phase){
    this.dummy.updateMatrix();mesh.setMatrixAt(index,this.dummy.matrix);this.color.toArray(mesh.geometry.attributes.aTint.array,index*3);
    mesh.geometry.attributes.aData.setXY(index,life,phase);
  }
  spark(x,y,z,vx,vy,vz,size,life,seed){
    const p=this.sparks[this.sparkCursor++%SPARKS];Object.assign(p,{x,y,z,vx,vy,vz,size,life,age:0,seed,r:this.color.r,g:this.color.g,b:this.color.b});
  }
  handle(e){
    if(e.type==='revive'||e.type==='defeat'){this.reset();return;}
    if(e.type!=='hit'||e.element!=='spirit'||!e.primary||e.fervor)return;
    this.color.set(e.color||'#92ccff');const p=this.impacts[this.impactCursor++%IMPACTS];
    Object.assign(p,{x:e.x,y:heightAt(e.x,e.z)+1.1,z:e.z,age:0,size:e.echo?.67:.9,r:this.color.r,g:this.color.g,b:this.color.b});
    for(let i=0;i<(e.echo?5:9);i++){
      const a=i*2.39996+this.impactCursor*.7,speed=2.1+(i%3)*.8;
      this.spark(p.x,p.y,p.z,Math.cos(a)*speed,.7+(i%4)*.55,Math.sin(a)*speed,.055+(i%3)*.013,.3+(i%4)*.075,a);
    }
  }
  update(dt){
    if(this.state.dead){this.reset();return;}
    const time=this.state.time;let heads=0;
    for(const b of this.state.projectiles){
      if(!isSpiritBolt(b))continue;
      const id=b.id;if(this.generation[id]!==b.generation){this.generation[id]=b.generation;this.lastShed[id]=-1;}
      const drain=this.trails.age[id],consuming=!b.alive&&b.retiredReason==='hit'&&drain<.09;
      if((!b.alive&&!consuming)||b.age<b.delay)continue;
      this.trails.getDirection(id,this.direction);this.color.set(b.color);const life=consuming?Math.max(0,1-drain/.09):Math.min(1,(b.age-b.delay)*24);
      const scale=b.scale*(1+(b.tier||0)*.065),phase=id*1.73;
      this.dummy.position.set(b.x,b.y,b.z);this.dummy.quaternion.setFromUnitVectors(this.up,this.direction);this.dummy.scale.setScalar(scale);
      if(consuming)this.dummy.scale.y*=Math.max(.01,life);
      this.write(this.body,heads,life,phase);this.write(this.glow,heads++,life,phase);
      if(b.alive&&time-this.lastShed[id]>.055){
        this.lastShed[id]=time;
        const a=time*18+phase,r=.06;this.spark(b.x-this.direction.x*.35+Math.cos(a)*r,b.y-.07,b.z-this.direction.z*.35+Math.sin(a)*r,-this.direction.x*.7,Math.sin(a)*.3,-this.direction.z*.7,.027+(id%3)*.006,.24+(id%3)*.04,a);
      }
    }
    this.body.count=this.glow.count=heads;
    let n=0;for(const p of this.sparks){p.age+=dt;if(p.age>=p.life)continue;
      const drag=Math.exp(-dt*3.2);p.vx*=drag;p.vz*=drag;p.vy-=dt*1.8;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      const life=1-p.age/p.life;this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(p.seed+p.age*7,p.seed*.8+p.age*5,p.age*11);this.dummy.scale.setScalar(p.size*(.45+life*.55));this.color.setRGB(p.r,p.g,p.b);this.write(this.fragments,n++,life*life,p.seed);
    }this.fragments.count=n;
    n=0;for(const p of this.impacts){p.age+=dt;if(p.age>=.46)continue;
      this.dummy.position.set(p.x,p.y,p.z);this.dummy.quaternion.copy(this.camera.quaternion);this.dummy.scale.setScalar(p.size);this.color.setRGB(p.r,p.g,p.b);this.write(this.flashes,n++,p.age/.46,0);
    }this.flashes.count=n;
    for(const mesh of [this.body,this.glow,this.fragments,this.flashes]){for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.uniforms.uTime.value=time;mesh.instanceMatrix.needsUpdate=true;mesh.geometry.attributes.aTint.needsUpdate=true;mesh.geometry.attributes.aData.needsUpdate=true;}
  }
  reset(){this.generation.fill(-1);this.lastShed.fill(-1);for(const p of this.sparks)p.age=10;for(const p of this.impacts)p.age=10;for(const m of [this.body,this.glow,this.fragments,this.flashes])m.count=0;}
  dispose(){for(const mesh of [this.body,this.glow,this.fragments,this.flashes]){mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();}this.group.removeFromParent();}
}
