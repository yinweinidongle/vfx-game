import * as THREE from 'three';
import { BranchingLightning } from './BranchingLightning.js';
import { createSwordShardGeometry, createSwordShardMaterial } from './SwordParticles.js';

const smooth=THREE.MathUtils.smoothstep;
const noise=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}`;
const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const HERO_ANGLES=[-.28,.22,.65,1.08,1.54,2.12,2.68];

function createContactLash(){
  const positions=[],uvs=[];
  const tri=(a,b,c,ua,ub,uc)=>{positions.push(...a,...b,...c);uvs.push(...ua,...ub,...uc);};
  for(let i=0;i<24;i++){
    const u=i/24,v=(i+1)/24,a=-1.42+u*2.84,b=-1.42+v*2.84;
    const wa=.006+Math.pow(Math.sin(u*Math.PI),.65)*.18,wb=.006+Math.pow(Math.sin(v*Math.PI),.65)*.18;
    const oa=[Math.cos(a)*.54-.27,Math.sin(a)*.72],ob=[Math.cos(b)*.54-.27,Math.sin(b)*.72];
    for(const sign of [-1,1]){
      const A=[oa[0],oa[1],.035*sign],B=[ob[0],ob[1],.035*sign],C=[oa[0]-wa,oa[1],.035*sign],D=[ob[0]-wb,ob[1],.035*sign];
      tri(A,B,C,[u,0],[v,0],[u,1]);tri(B,D,C,[v,0],[v,1],[u,1]);
    }
    for(const inner of [0,1]){
      const A=[oa[0]-wa*inner,oa[1],-.035],B=[ob[0]-wb*inner,ob[1],-.035],C=[oa[0]-wa*inner,oa[1],.035],D=[ob[0]-wb*inner,ob[1],.035];
      tri(A,B,C,[u,inner],[v,inner],[u,inner]);tri(B,D,C,[v,inner],[v,inner],[u,inner]);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return geometry;
}

function createRifts(){
  const positions=[],uvs=[],seeds=[];
  for(let rift=0;rift<7;rift++){
    const angle=rift*Math.PI*2/7+.2, reach=.9+random(rift+3)*1.2;
    for(let segment=0;segment<8;segment++){
      for(let vertex=0;vertex<6;vertex++){
        const end=vertex===2||vertex===4||vertex===5,sign=vertex===0||vertex===2||vertex===5?-1:1;
        const u=(segment+(end?1:0))/8, radius=.2+u*reach, bend=Math.sin(u*8.+rift)*.09;
        const width=(.018+Math.sin(u*Math.PI)*.06)*(1-u*.3), a=angle+bend;
        positions.push(Math.cos(a)*radius-Math.sin(a)*width*sign,Math.sin(a)*radius+Math.cos(a)*width*sign,Math.sin(rift*2.3)*.18+u*u*(random(rift+19)-.5)*.8);
        uvs.push(u,(sign+1)*.5);seeds.push(rift/7);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));return geometry;
}

/** Six authored layers: flash, triangle rays, delayed rings, forks, shards, rifts. */
export class SwordImpact {
  constructor(scene,config={}){
    this.config=config;this.group=new THREE.Group();this.group.name='Azure thunder severing impact';scene.add(this.group);this.active=false;this.age=10;this.disposed=false;
    this.dummy=new THREE.Object3D();this.zero=new THREE.Matrix4().makeScale(0,0,0);this.localOrigin=new THREE.Vector3();this.axis=new THREE.Vector3(1,0,0);this.direction=new THREE.Vector3();
    this.color=new THREE.Color(config.swordColor||config.frostColor||'#39dfff');this.planeGeometry=new THREE.PlaneGeometry(2,2);
    this.flashMaterial=new THREE.ShaderMaterial({uniforms:{uAge:{value:10}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float uAge;varying vec2 vUv;void main(){vec2 p=vUv*2.-1.;float r=length(p);float x=exp(-abs(p.y)*100.-abs(p.x)*8.);float y=exp(-abs(p.x)*100.-abs(p.y)*13.);float diamond=exp(-(abs(p.x)+abs(p.y))*42.);float fade=pow(max(0.,1.-uAge/.08),2.);gl_FragColor=vec4(vec3(.86,1.,1.)*3.2,min(.95,(x+y*.75+diamond)*fade));}`});
    this.flash=new THREE.Mesh(this.planeGeometry,this.flashMaterial);this.flash.renderOrder=9;this.group.add(this.flash);
    this.flashCross=new THREE.Mesh(this.planeGeometry,this.flashMaterial);this.flashCross.rotation.y=Math.PI/2;this.flashCross.rotation.z=.35;this.flashCross.renderOrder=9;this.group.add(this.flashCross);
    this.contactGeometry=createContactLash();this.contactMaterial=new THREE.ShaderMaterial({uniforms:{uAge:{value:10},uColor:{value:this.color.clone()}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.NormalBlending,
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float uAge;uniform vec3 uColor;varying vec2 vUv;void main(){float life=smoothstep(0.,.014,uAge)*(1.-smoothstep(.09,.28,uAge));float ends=pow(max(0.,sin(vUv.x*3.14159)),.35);float core=1.-smoothstep(.18,.75,vUv.y);float lip=smoothstep(.78,.94,vUv.y);vec3 energy=mix(uColor*1.2,vec3(.9,1.65,1.75),core);vec3 color=mix(energy,vec3(.014,.008,.04),lip);gl_FragColor=vec4(color,life*ends*(.86+core*.12));}`});
    this.contactLash=new THREE.Mesh(this.contactGeometry,this.contactMaterial);this.contactLash.position.set(-.12,0,.18);this.contactLash.rotation.y=.22;this.contactLash.rotation.z=-.22;this.contactLash.renderOrder=8;this.group.add(this.contactLash);

    const rayGeometry=new THREE.BufferGeometry();rayGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,0,0,0,1,0],3));rayGeometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,.5,0,1],2));
    this.rayCount=18;this.rayFades=new Float32Array(this.rayCount);this.rayHues=new Float32Array(this.rayCount);for(let i=0;i<this.rayCount;i++)this.rayHues[i]=i%2?.9:.04;
    rayGeometry.setAttribute('aFade',new THREE.InstancedBufferAttribute(this.rayFades,1));rayGeometry.setAttribute('aHue',new THREE.InstancedBufferAttribute(this.rayHues,1));this.rayGeometry=rayGeometry;
    this.rayMaterial=new THREE.ShaderMaterial({uniforms:{uColor:{value:this.color.clone()}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      vertexShader:`attribute float aFade,aHue;varying vec2 vUv;varying float vFade,vHue;void main(){vUv=uv;vFade=aFade;vHue=aHue;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 uColor;varying vec2 vUv;varying float vFade,vHue;void main(){float across=max(0.,1.-abs(vUv.y*2.-1.));float core=pow(across,2.2);vec3 c=mix(uColor,vec3(.55,.24,1.),vHue)*1.1+vec3(.8,1.12,1.2)*core*(1.25-vHue*.55);gl_FragColor=vec4(c,pow(across,.7)*pow(max(0.,1.-vUv.x),.65)*vFade);}`});
    this.rays=new THREE.InstancedMesh(rayGeometry,this.rayMaterial,this.rayCount);this.rays.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.rays.frustumCulled=false;this.rays.renderOrder=6;this.group.add(this.rays);

    this.ringGeometry=new THREE.PlaneGeometry(2,2);this.ringGeometry.setAttribute('aDelay',new THREE.InstancedBufferAttribute(new Float32Array([0,.06]),1));this.ringGeometry.setAttribute('aHue',new THREE.InstancedBufferAttribute(new Float32Array([0,.65]),1));
    this.ringMaterial=new THREE.ShaderMaterial({uniforms:{uAge:{value:10},uColor:{value:this.color.clone()}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      vertexShader:`attribute float aDelay,aHue;varying vec2 vUv;varying float vDelay,vHue;void main(){vUv=uv;vDelay=aDelay;vHue=aHue;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float uAge;uniform vec3 uColor;varying vec2 vUv;varying float vDelay,vHue;${noise}void main(){float t=uAge-vDelay;if(t<0.||t>.55)discard;vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);float radius=.08+.84*(1.-exp(-t*11.));float jagged=(sin(a*13.+vHue*5.)*.012+sin(a*29.-t*5.)*.008)*(.5+radius);float d=r-radius+jagged;float ring=exp(-abs(d)*90.)+exp(-abs(d+.055)*45.)*.16;float cuts=.65+.35*smoothstep(.1,.7,noise(vec2(a*11.,t*4.)));float fade=pow(max(0.,1.-t/.55),1.6);gl_FragColor=vec4(mix(uColor,vec3(.56,.27,1.),vHue)*1.7,ring*cuts*fade*.7);}`});
    this.rings=new THREE.InstancedMesh(this.ringGeometry,this.ringMaterial,2);this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.rings.frustumCulled=false;this.rings.renderOrder=5;this.group.add(this.rings);

    this.lightning=new BranchingLightning(this.group,config);
    this.shardCapacity=96;this.shardGeometry=createSwordShardGeometry();this.shardFades=new Float32Array(this.shardCapacity);this.shardHues=new Float32Array(this.shardCapacity);this.shardEnergy=new Float32Array(this.shardCapacity);
    this.shardGeometry.setAttribute('aFade',new THREE.InstancedBufferAttribute(this.shardFades,1));this.shardGeometry.setAttribute('aHue',new THREE.InstancedBufferAttribute(this.shardHues,1));this.shardGeometry.setAttribute('aEnergy',new THREE.InstancedBufferAttribute(this.shardEnergy,1));this.shardMaterial=createSwordShardMaterial(config);
    this.shards=new THREE.InstancedMesh(this.shardGeometry,this.shardMaterial,this.shardCapacity);this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shards.frustumCulled=false;this.shards.renderOrder=6;this.group.add(this.shards);
    this.shardSeeds=Array.from({length:this.shardCapacity},(_,i)=>{const hero=i<HERO_ANGLES.length,dark=!hero&&i%4===0;this.shardHues[i]=hero?.04:i%3===0?.88:.04;this.shardEnergy[i]=hero?1:dark?-1:.38;const angle=hero?HERO_ANGLES[i]:i*2.39996323,y=hero?Math.sin(angle)*.92+.08:random(i+3)*1.6-.45,r=Math.sqrt(Math.max(.1,1-y*y*.55));return{hero,vx:hero?Math.cos(angle):Math.cos(angle)*r,vy:y,vz:hero?(random(i+7)-.5)*.32:Math.sin(angle)*r,speed:hero?3.6+random(i+19)*1.8:2+random(i+19)*4,size:hero?.52+random(i+8)*.34:.13+random(i+8)*.20,life:hero?.56+random(i+17)*.20:.65+random(i+17)*.40,rx:hero?(random(i+41)-.5)*.36:random(i+41)*6.28,ry:random(i+43)*6.28,rz:random(i+47)*6.28,sx:hero?random(i+57)*1.6-.8:random(i+57)*14-7,sy:random(i+61)*16-8,sz:hero?random(i+67)*1.4-.7:random(i+67)*20-10};});

    this.riftGeometry=createRifts();this.riftMaterial=new THREE.ShaderMaterial({uniforms:{uAge:{value:10},uColor:{value:this.color.clone()}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.NormalBlending,
      vertexShader:`attribute float aSeed;varying vec2 vUv;varying float vSeed;void main(){vUv=uv;vSeed=aSeed;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float uAge;uniform vec3 uColor;varying vec2 vUv;varying float vSeed;${noise}void main(){float age=uAge-vSeed*.05;float open=smoothstep(.02,.1,age);float grow=1.-smoothstep(age*5.-.06,age*5.+.08,vUv.x);float fade=1.-smoothstep(.35,1.05,age);float edge=pow(abs(vUv.y*2.-1.),4.);float n=noise(vec2(vUv.x*34.+vSeed*8.,vUv.y*3.));float erosion=smoothstep((1.-fade)*.9-.1,(1.-fade)*.9+.12,n);vec3 color=mix(vec3(.006,.005,.019),mix(uColor,vec3(.60,.26,1.),vSeed)*1.35,edge);gl_FragColor=vec4(color,open*grow*fade*erosion*(.63+edge*.25));}`});
    this.rifts=new THREE.Mesh(this.riftGeometry,this.riftMaterial);this.rifts.renderOrder=4;this.rifts.frustumCulled=false;this.group.add(this.rifts);
    this.light=new THREE.PointLight('#a3dfff',0,6,2);this.light.position.set(-.45,.7,.95);this.group.add(this.light);this.reset();
  }
  trigger(position,config=this.config){this.group.position.copy(position);this.active=true;this.age=0;this.group.visible=true;this.update(0,0,config);}
  update(dt,time,config=this.config){
    if(this.disposed||!this.active)return;this.age+=dt;const age=this.age;if(age>=1.1-1e-6){this.reset();return;}
    const radius=(config.impactRadius??1.6)/1.6;this.color.set(config.swordColor||config.frostColor||'#39dfff');
    this.flashMaterial.uniforms.uAge.value=age;this.flash.scale.setScalar(1.5*radius);this.flashCross.scale.setScalar(1.3*radius);
    this.contactMaterial.uniforms.uAge.value=age;this.contactMaterial.uniforms.uColor.value.copy(this.color);this.contactLash.scale.setScalar((.85+Math.min(age*4.5,.55))*radius);
    this.rayMaterial.uniforms.uColor.value.copy(this.color);
    for(let i=0;i<this.rayCount;i++){const a=i*Math.PI*2/this.rayCount,spread=(.4+Math.min(age*7,1))*(.7+random(i+3)*.9)*radius;
      this.direction.set(Math.cos(a),Math.sin(a),Math.sin(a*2.1)*.45).normalize();this.dummy.position.copy(this.direction).multiplyScalar(.1*radius);this.dummy.quaternion.setFromUnitVectors(this.axis,this.direction);this.dummy.rotateX(a*.3);const hero=i%3===0;this.dummy.scale.set(spread*(hero?1.2:1),(hero?.10+random(i+12)*.07:.025+random(i+12)*.04)*radius,.04);this.dummy.updateMatrix();this.rays.setMatrixAt(i,this.dummy.matrix);this.rayFades[i]=smooth(age,0,.012)*(1-smooth(age,.12,.38))*(hero?.82:.58);}
    this.rays.instanceMatrix.needsUpdate=true;this.rayGeometry.attributes.aFade.needsUpdate=true;
    this.ringMaterial.uniforms.uAge.value=age;this.ringMaterial.uniforms.uColor.value.copy(this.color);
    this.dummy.position.set(0,0,0);this.dummy.rotation.set(0,Math.PI/4,.1);this.dummy.scale.setScalar(2.8*radius);this.dummy.updateMatrix();this.rings.setMatrixAt(0,this.dummy.matrix);
    this.dummy.position.set(0,-this.group.position.y+.035,0);this.dummy.rotation.set(-Math.PI/2,0,.2);this.dummy.scale.setScalar(3.25*radius);this.dummy.updateMatrix();this.rings.setMatrixAt(1,this.dummy.matrix);this.rings.instanceMatrix.needsUpdate=true;
    this.lightning.update(age,this.localOrigin,Math.pow(Math.max(0,1-age/.42),.75),'impact',config);
    const count=Math.min(this.shardCapacity,Math.max(0,Math.floor(config.swordShardCount??config.shardCount??42)));this.shards.count=count;this.shardMaterial.uniforms.uCyan.value.copy(this.color);
    for(let i=0;i<count;i++){const d=this.shardSeeds[i],t=age/d.life;if(t>=1){this.shards.setMatrixAt(i,this.zero);this.shardFades[i]=0;continue;}const travel=(1-Math.exp(-age*2.35))/2.35*d.speed*radius+(d.hero?.12*radius:0);this.dummy.position.set(d.vx*travel,d.vy*travel-age*age*2.65,d.vz*travel);if(d.hero){this.direction.set(d.vx,d.vy,d.vz).normalize();this.dummy.quaternion.setFromUnitVectors(this.axis,this.direction);this.dummy.rotateX(d.rx+d.sx*age);this.dummy.rotateZ(d.sz*age);}else this.dummy.rotation.set(d.rx+d.sx*age,d.ry+d.sy*age,d.rz+d.sz*age);const size=d.size*(d.hero?1-smooth(t,.4,1)*.65:1-t*t*.8)*radius;this.dummy.scale.set(size,size*(d.hero?.8:.75),size*(d.hero?.7:1));this.dummy.updateMatrix();this.shards.setMatrixAt(i,this.dummy.matrix);this.shardFades[i]=d.hero?(1-smooth(age,.22,d.life))*.96:Math.pow(1-t,.85);}
    this.shards.instanceMatrix.needsUpdate=true;this.shardGeometry.attributes.aFade.needsUpdate=true;
    this.riftMaterial.uniforms.uAge.value=age;this.riftMaterial.uniforms.uColor.value.copy(this.color);this.rifts.scale.setScalar(radius*(1+age*.14));
    this.light.color.copy(this.color);this.light.intensity=3.6*Math.exp(-age*22);
  }
  reset(){this.age=10;this.active=false;this.group.visible=false;this.light.intensity=0;this.lightning.reset();this.shardFades.fill(0);this.rayFades.fill(0);for(let i=0;i<this.shardCapacity;i++)this.shards.setMatrixAt(i,this.zero);this.shards.instanceMatrix.needsUpdate=true;this.shardGeometry.attributes.aFade.needsUpdate=true;this.rayGeometry.attributes.aFade.needsUpdate=true;}
  dispose(){if(this.disposed)return;this.disposed=true;this.group.removeFromParent();this.lightning.dispose();this.planeGeometry.dispose();this.flashMaterial.dispose();this.contactGeometry.dispose();this.contactMaterial.dispose();this.rayGeometry.dispose();this.rayMaterial.dispose();this.ringGeometry.dispose();this.ringMaterial.dispose();this.shardGeometry.dispose();this.shardMaterial.dispose();this.riftGeometry.dispose();this.riftMaterial.dispose();}
}
