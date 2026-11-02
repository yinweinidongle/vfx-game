import * as T from 'three';
import { heightAt } from './GameData.js';
import { awakeningStyle } from './AwakeningConfig.js';

const CAPACITY=96,SPARKS=384;
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const vertex=`attribute float aAge,aSeed,aVariant;varying vec2 vUv;varying float vAge,vSeed,vVariant;void main(){vUv=uv;vAge=aAge;vSeed=aSeed;vVariant=aVariant;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const noise=`float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}float ns(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`;

/** Texture-driven, depth-tested strikes, contact rings and 3D sparks. All buffers are reused. */
export class GameThunderVFX {
  constructor(scene,camera,state,{loadTexture=true}={}){
    this.scene=scene;this.camera=camera;this.state=state;this.group=new T.Group();scene.add(this.group);this.group.visible=false;
    this.pool=Array.from({length:CAPACITY},()=>({alive:false,age:10}));this.sparks=Array.from({length:SPARKS},()=>({alive:false}));this.cursor=0;this.sparkCursor=0;this.lightCursor=0;
    this.dummy=new T.Object3D();this.color=new T.Color();this.style=awakeningStyle(state.kind);this.time={value:0};this.tint={value:new T.Color(this.style.color)};this.core={value:new T.Color(this.style.core)};
    const placeholder=new T.DataTexture(new Uint8Array([0,0,0,255]),1,1);placeholder.needsUpdate=true;this.texture=placeholder;
    const boltMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
      uniforms:{uTime:this.time,uTint:this.tint,uCore:this.core,uMap:{value:placeholder}},vertexShader:vertex,
      fragmentShader:`uniform sampler2D uMap;uniform float uTime;uniform vec3 uTint,uCore;varying vec2 vUv;varying float vAge,vSeed,vVariant;${noise}
      void main(){float grain=texture2D(uMap,vec2((clamp(vUv.x,.012,.988)+vVariant)*.25,mix(.025,.98,vUv.y))).r;
      float sides=smoothstep(0.,.075,vUv.x)*(1.-smoothstep(.925,1.,vUv.x));float ends=smoothstep(0.,.025,vUv.y)*(1.-smoothstep(.94,1.,vUv.y));
      float life=(1.-smoothstep(.04,.42,vAge))*(.75+.25*step(.36,hash(floor(uTime*29.)+vSeed)));float a=pow(grain,.7)*sides*ends*life;if(a<.012)discard;
      vec3 col=mix(uTint*2.1,uCore*3.25,smoothstep(.42,.92,grain));gl_FragColor=vec4(col,a);}`});
    this.bolts=this.mesh(new T.PlaneGeometry(1,1,1,20),boltMaterial,CAPACITY);this.bolts.renderOrder=9;
    const impactMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
      uniforms:{uTime:this.time,uTint:this.tint,uCore:this.core},vertexShader:vertex,
      fragmentShader:`uniform vec3 uTint,uCore;uniform float uTime;varying vec2 vUv;varying float vAge,vSeed,vVariant;${noise}
      void main(){vec2 p=(vUv-.5)*2.;float r=length(p),a=atan(p.y,p.x);if(r>1.)discard;
      float wave=.08+pow(clamp(vAge/.66,0.,1.),.6)*.86;float shape=r+sin(a*11.+vSeed)*.013+sin(a*23.-uTime*3.)*.008;
      float ring=exp(-pow((shape-wave)*75.,2.))*(1.-smoothstep(.22,.72,vAge));float echo=exp(-pow((shape-wave*.72)*100.,2.))*(1.-smoothstep(.1,.5,vAge))*.45;
      float ray=pow(max(0.,cos(a*8.+vSeed)),30.)*exp(-r*3.5)*(1.-smoothstep(.02,.2,vAge));
      float crack=pow(max(0.,cos(a*17.+sin(r*22.+vSeed)*2.)),35.)*(1.-smoothstep(.35,.95,r))*smoothstep(.04,.19,r)*(1.-smoothstep(.2,.78,vAge))*.45;
      float center=exp(-r*r*110.)*(1.-smoothstep(.01,.2,vAge));float strength=ring*.7+echo+ray+crack+center;
      if(strength<.009)discard;gl_FragColor=vec4(mix(uTint*1.7,uCore*2.9,center+ray*.4),min(.9,strength));}`});
    this.impacts=this.mesh(new T.PlaneGeometry(1,1),impactMaterial,CAPACITY);this.impacts.renderOrder=7;
    const markMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
      uniforms:{uTint:this.tint,uCore:this.core,uTime:this.time},vertexShader:vertex,
      fragmentShader:`uniform vec3 uTint,uCore;uniform float uTime;varying vec2 vUv;varying float vAge,vSeed,vVariant;void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);float ring=exp(-pow((r-.68)*90.,2.));float ticks=step(.75,fract(a*7.6394+uTime*.22))*exp(-pow((r-.82)*70.,2.));float cross=exp(-min(abs(p.x),abs(p.y))*90.)*(1.-smoothstep(.1,.45,r));float alpha=(ring*.42+ticks*.27+cross*.12)*vAge;if(alpha<.008)discard;gl_FragColor=vec4(uTint*1.6,alpha);}`});
    this.marks=this.mesh(new T.PlaneGeometry(1,1),markMaterial,192);this.marks.renderOrder=7;
    const sparkGeo=new T.OctahedronGeometry(1,0);sparkGeo.setAttribute('aFade',new T.InstancedBufferAttribute(new Float32Array(SPARKS),1));
    this.sparkMesh=new T.InstancedMesh(sparkGeo,new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{uTint:this.tint,uCore:this.core},
      vertexShader:'attribute float aFade;varying float vFade;void main(){vFade=aFade;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 uTint,uCore;varying float vFade;void main(){gl_FragColor=vec4(mix(uTint*1.6,uCore*2.5,vFade*.5),vFade);}' }),SPARKS);
    this.sparkMesh.count=0;this.sparkMesh.frustumCulled=false;this.sparkMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.group.add(this.sparkMesh);
    this.lights=Array.from({length:4},()=>{const light=new T.PointLight(this.style.color,0,11,2);light.userData.age=10;this.group.add(light);return light;});
    this.ready=loadTexture?new T.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}game/art/awakening/lightning-v1.webp`).then(texture=>{
      if(this.disposed){texture.dispose();return;}texture.colorSpace=T.NoColorSpace;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;boltMaterial.uniforms.uMap.value=texture;this.texture.dispose();this.texture=texture;
    }):Promise.resolve();
  }
  mesh(geo,material,capacity){
    for(const name of ['aAge','aSeed','aVariant'])geo.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(T.DynamicDrawUsage));
    const mesh=new T.InstancedMesh(geo,material,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.group.add(mesh);return mesh;
  }
  set(mesh,index,age,seed,variant){mesh.setMatrixAt(index,this.dummy.matrix);mesh.geometry.attributes.aAge.array[index]=age;mesh.geometry.attributes.aSeed.array[index]=seed;mesh.geometry.attributes.aVariant.array[index]=variant;}
  commit(mesh,count){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;for(const name of ['aAge','aSeed','aVariant'])mesh.geometry.attributes[name].needsUpdate=true;}
  handle(event){
    if(event.type==='revive'||event.type==='defeat'){this.reset();return;}
    if(event.type==='awakening'){this.group.visible=true;return;}
    if(event.type!=='thunderStrike')return;
    const p=this.pool[this.cursor++%CAPACITY],seed=event.seed;Object.assign(p,{alive:true,age:0,x:event.x,y:event.y+.035,z:event.z,seed,power:event.power,height:11+hash(seed)*9,variant:seed%4});
    const light=this.lights[this.lightCursor++%this.lights.length];light.position.set(p.x,p.y+1.3,p.z);light.userData.age=0;
    for(let i=0;i<8;i++){
      const spark=this.sparks[this.sparkCursor++%SPARKS],angle=hash(seed*19+i)*Math.PI*2,speed=2+hash(seed+i*13)*6;
      Object.assign(spark,{alive:true,age:0,life:.35+hash(seed+i*43)*.45,x:p.x,y:p.y+.1,z:p.z,vx:Math.sin(angle)*speed,vy:2+hash(seed*7+i)*7,vz:Math.cos(angle)*speed,size:.025+hash(i+seed)*.04,seed});
    }
  }
  update(dt){
    this.time.value=this.state.time;let bolts=0,impacts=0,sparks=0,marks=0;
    for(const p of this.pool)if(p.alive){
      p.age+=dt;if(p.age>.82){p.alive=false;continue;}
      if(p.age<.43){
        this.dummy.position.set(p.x,p.y+p.height*.5,p.z);this.dummy.rotation.set(0,Math.atan2(this.camera.position.x-p.x,this.camera.position.z-p.z),0);this.dummy.scale.set(3.2*p.power,p.height,1);this.dummy.updateMatrix();this.set(this.bolts,bolts++,p.age,p.seed,p.variant);
      }
      this.dummy.position.set(p.x,p.y+.025,p.z);this.dummy.rotation.set(-Math.PI/2,0,0);this.dummy.scale.setScalar(6.5*p.power);this.dummy.updateMatrix();this.set(this.impacts,impacts++,p.age,p.seed,p.variant);
    }
    for(const strike of this.state.awakening.strikes)if(strike.active&&strike.warned&&!strike.hit){
      const progress=T.MathUtils.clamp(1-(strike.at-this.state.awakening.age)/.22,0,1);
      this.dummy.position.set(strike.x,heightAt(strike.x,strike.z)+.055,strike.z);this.dummy.rotation.set(-Math.PI/2,0,0);this.dummy.scale.setScalar(3.2*(1-progress*.22));this.dummy.updateMatrix();this.set(this.marks,marks++,progress,strike.id,0);
    }
    for(const p of this.sparks)if(p.alive){
      p.age+=dt;if(p.age>=p.life){p.alive=false;continue;}const fade=1-p.age/p.life;
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=dt*12;const drag=Math.exp(-dt*2.8);p.vx*=drag;p.vz*=drag;
      this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(p.age*7+p.seed,p.age*11,p.age*3);this.dummy.scale.set(p.size*fade,p.size*fade*(4+fade*4),p.size*fade*.6);this.dummy.updateMatrix();this.sparkMesh.setMatrixAt(sparks,this.dummy.matrix);this.sparkMesh.geometry.attributes.aFade.array[sparks++]=fade;
    }
    this.commit(this.bolts,bolts);this.commit(this.impacts,impacts);this.commit(this.marks,marks);this.sparkMesh.count=sparks;this.sparkMesh.instanceMatrix.needsUpdate=true;this.sparkMesh.geometry.attributes.aFade.needsUpdate=true;
    for(const light of this.lights){light.userData.age+=dt;light.intensity=Math.max(0,1-light.userData.age/.23)*16;}
    this.group.visible=this.state.awakening.active||bolts>0||impacts>0||sparks>0;
  }
  reset(){for(const p of this.pool)p.alive=false;for(const p of this.sparks)p.alive=false;for(const light of this.lights)light.intensity=0;this.group.visible=false;}
  dispose(){this.disposed=true;this.texture.dispose();this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.group.removeFromParent();}
}
