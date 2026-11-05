import * as T from 'three';
import { heightAt } from './GameData.js';

const CAPACITY = 32;
const REACH = [1.45, 3.7, 7.6];
const LIFE = [.34, .55, .79];
// Azimuth, elevation, reach, half-width, minimum quality. The foreground fan,
// upright lance and lateral counter-stroke are deliberately different shapes.
const RAYS = [
  [.64, .08, 1.13, .072, 0], [-1.16, .85, .91, .031, 0],
  [2.42, .05, .97, .034, 0], [-2.73, .25, .66, .024, 0],
  [-.32, .13, .69, .012, 1], [1.91, .36, .64, .013, 1],
  [-2.16, .78, .51, .009, 1], [2.52, .06, .85, .007, 2],
  [.84, .04, .79, .009, 2], [-1.32, .72, .66, .006, 2],
  [3.03, .03, .43, .008, 2], [.22, 1.13, .46, .010, 2],
];
const declarations = `
  attribute vec4 aCue;
  varying vec2 vUV;
  varying float vAge, vTier, vLand, vSeed;
  void readCue(){ vAge=aCue.x; vTier=aCue.y; vLand=aCue.z; vSeed=aCue.w; }
`;
const palette = `
  varying vec2 vUV;
  varying float vAge, vTier, vLand, vSeed;
  vec3 edgeColor(){return vTier<.5?vec3(.78,.89,1.):vTier<1.5?vec3(.47,.07,1.):vec3(1.,.25,.009);}
  vec3 heartColor(){return vTier<.5?vec3(1.):vTier<1.5?vec3(.99,.82,1.):vec3(1.,.95,.68);}
`;

function rayGeometry() {
  const position=[], uv=[], shape=[], grade=[], indices=[];
  for (const [angle,elevation,reach,width,tier] of RAYS) {
    const base=position.length/3;
    for (let j=0;j<=8;j++) {
      for (const side of [-1,1]) {
        position.push(side,j/8,0); uv.push(side,j/8);
        shape.push(angle,elevation,reach,width); grade.push(tier);
      }
      if (j<8) {const a=base+j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setAttribute('aShape',new T.Float32BufferAttribute(shape,4));
  geometry.setAttribute('aGrade',new T.Float32BufferAttribute(grade,1));
  geometry.setIndex(indices);
  return geometry;
}
const rayVertex = declarations + `
  attribute vec4 aShape; attribute float aGrade;
  varying float vGain;
  void main(){
    readCue(); vUV=uv;
    float reach=length(instanceMatrix[0].xyz);
    float angle=aShape.x+.09*sin(vSeed+aShape.x*4.);
    float elevation=aShape.y;
    vec3 dir=vec3(cos(angle)*cos(elevation),sin(elevation),sin(angle)*cos(elevation));
    float extend=1.-pow(1.-clamp((vAge+.015)/.20,0.,1.),3.);
    float tail=smoothstep(.23,.76,vAge)*.62;
    float along=mix(tail,1.,uv.y)*extend*aShape.z;
    vec4 center=modelViewMatrix*instanceMatrix*vec4(dir*along,1.);
    vec3 axis=mat3(modelViewMatrix*instanceMatrix)*dir;
    vec2 side=normalize(vec2(-axis.y,axis.x)+vec2(.00001,0.));
    float profile=(.045+.955*smoothstep(0.,.52,uv.y))*(1.-smoothstep(.63,1.,uv.y));
    float coreWidth=aShape.w*(vTier<.5?.48:vTier<1.5?.78:1.)*mix(1.,.48,smoothstep(.18,.70,vAge));
    center.xy+=side*position.x*reach*coreWidth*profile;
    vGain=(1.-smoothstep(.16,.72,vAge))*step(aGrade-.1,vTier)*mix(1.,.65,vLand);
    gl_Position=projectionMatrix*center;
  }
`;
const rayFragment = palette + `
  varying float vGain;
  void main(){
    float x=abs(vUV.x);
    float edge=1.-smoothstep(.42,1.,x);
    float spine=(1.-smoothstep(.025,.19,x))*(1.-vUV.y*.24);
    float split=exp(-abs(vUV.x-.62)*19.)*smoothstep(.05,.25,vUV.y);
    float opacity=vGain*(edge*.97+split*.30)*(1.-smoothstep(.84,1.,vUV.y));
    if(opacity<.008) discard;
    vec3 body=vTier>1.5?vec3(2.8,1.36,.033):vTier>.5?vec3(1.65,.42,2.8):vec3(1.9,2.,2.18);
    vec3 color=mix(edgeColor()*1.05,body,1.-smoothstep(.32,.84,x));
    color=mix(color,heartColor()*3.3,spine);
    gl_FragColor=vec4(color,opacity);
  }
`;
const coreVertex = declarations + `
  void main(){
    readCue();vUV=uv*2.-1.;
    vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
    float extent=length(instanceMatrix[0].xyz)*(.52+.08*vTier);
    center.xy+=position.xy*extent;
    gl_Position=projectionMatrix*center;
  }
`;
const coreFragment = palette + `
  void main(){
    vec2 p=vUV;float r=length(p);
    float first=1.-smoothstep(.07,.52,vAge);
    float pulse=(vAge-.67)*15.;float echo=exp(-pulse*pulse)*.24*step(.5,vTier);
    float diamond=exp(-(abs(p.x)*1.05+abs(p.y))*(14.+vAge*18.));
    float pins=(exp(-abs(p.x)*95.)*pow(max(0.,1.-abs(p.y)),2.)+exp(-abs(p.y)*116.)*pow(max(0.,1.-abs(p.x)),3.));
    float veil=exp(-r*r*14.)*.21;
    float hot=diamond*2.+pins*.62;
    float gain=(veil+hot)*(first+echo);
    if(gain<.008)discard;
    gl_FragColor=vec4(mix(edgeColor()*1.9,heartColor()*3.4,clamp(hot,0.,1.)),gain);
  }
`;
const groundVertex = declarations + `
  void main(){
    readCue();vUV=uv*2.-1.;
    vec4 world=modelMatrix*instanceMatrix*vec4(position.x*1.25,0.,position.y*1.25,1.);
    world.y=.15+sin(world.x*.11)*.18+cos(world.z*.13)*.16+.045;
    gl_Position=projectionMatrix*viewMatrix*world;
  }
`;
const groundFragment = palette + `
  void main(){
    vec2 p=vUV;float r=length(p);if(r>1.)discard;
    float t=1.-pow(1.-clamp(vAge,0.,1.),2.6);
    float band=r-(.07+t*.86);
    float a=exp(-band*band*5500.)*(1.-smoothstep(.30,1.,vAge));
    float innerBand=(band+.065)*62.;float inner=exp(-innerBand*innerBand)*(.55+.45*cos(atan(p.y,p.x)*9.+vSeed));
    float wash=exp(-r*r*6.)*(1.-smoothstep(.07,.48,vAge));
    float opacity=(a*.54+inner*.18+wash*.18)*mix(.66,1.,vLand);
    if(opacity<.006)discard;
    gl_FragColor=vec4(mix(edgeColor()*1.8,heartColor()*1.9,a*.55),opacity);
  }
`;

function sparkleGeometry() {
  const geometry=new T.BufferGeometry(),positions=[],uv=[],index=[],spark=[];
  for(let i=0;i<15;i++){
    const base=i*4;
    for(const [x,y] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      positions.push(x,y,0);uv.push(x,y);spark.push(i);
    }
    index.push(base,base+1,base+2,base+1,base+3,base+2);
  }
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setAttribute('aSpark',new T.Float32BufferAttribute(spark,1));geometry.setIndex(index);
  return geometry;
}
const sparkleVertex = declarations + `
  attribute float aSpark;varying float vGain;
  float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
  void main(){readCue();vUV=uv;float id=aSpark+vSeed;
    float delay=.03+hash(id+6.)*.22, t=clamp((vAge-delay)/(1.-delay),0.,1.);
    float angle=hash(id)*6.283185, speed=.14+hash(id+3.)*.4;
    vec3 offset=vec3(cos(angle)*t*speed,t*(.14+hash(id+8.)*.45)-t*t*.53,sin(angle)*t*speed);
    vec4 center=modelViewMatrix*instanceMatrix*vec4(offset,1.);
    float size=(.018+.022*hash(id+2.))*length(instanceMatrix[0].xyz)*sin(3.14159*t);
    center.xy+=position.xy*size*vec2(.52,1.28);
    vGain=step(aSpark,3.+vTier*5.5)*smoothstep(0.,.14,t)*(1.-smoothstep(.52,1.,t));
    gl_Position=projectionMatrix*center;
  }
`;
const sparkleFragment = palette + `
  varying float vGain;
  void main(){float d=abs(vUV.x)+abs(vUV.y);float a=(1.-smoothstep(.48,1.,d))*vGain;if(a<.015)discard;gl_FragColor=vec4(mix(edgeColor()*1.8,heartColor()*3.,1.-smoothstep(.03,.68,d)),a);}
`;

function makeLayer(geometry,vertexShader,fragmentShader,order) {
  const cue=new T.InstancedBufferAttribute(new Float32Array(CAPACITY*4),4);
  cue.setUsage(T.DynamicDrawUsage);geometry.setAttribute('aCue',cue);
  const material=new T.ShaderMaterial({vertexShader,fragmentShader,transparent:true,
    blending:T.AdditiveBlending,depthTest:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
  const mesh=new T.InstancedMesh(geometry,material,CAPACITY);
  mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=order;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  return mesh;
}

/** Four pooled draws share each world-space burst and the same normalized clock. */
export class LootFlare {
  constructor(parent,camera){
    this.camera=camera;this.transform=new T.Object3D();
    this.pool=Array.from({length:CAPACITY},()=>({alive:false}));
    this.layers=[makeLayer(new T.PlaneGeometry(1,1,6,6),groundVertex,groundFragment,5),
      makeLayer(rayGeometry(),rayVertex,rayFragment,7),makeLayer(new T.PlaneGeometry(1,1),coreVertex,coreFragment,8),
      makeLayer(sparkleGeometry(),sparkleVertex,sparkleFragment,9)];
    // A colored beam needs some coverage on sunlit ground. The other layers
    // add light around its HDR core and UnrealBloomPass supplies the soft halo.
    this.layers[1].material.blending=T.NormalBlending;
    parent.add(...this.layers);
  }
  emit(event) {
    const landed = event.type === 'gearLand';
    const tier = T.MathUtils.clamp(Math.trunc(event.rarity) || 0, 0, 2);
    const nearby = this.pool.find(p => p.alive && p.landed === landed && p.age < .06 &&
      Math.hypot(p.x - event.x, p.z - event.z) < .85);
    if (nearby && nearby.tier >= tier) return;

    let slot = nearby || this.pool.find(p => !p.alive);
    if (!slot) {
      slot = this.pool.reduce((oldest, p) => {
        if (p.tier !== oldest.tier) return p.tier < oldest.tier ? p : oldest;
        return p.age / p.life > oldest.age / oldest.life ? p : oldest;
      });
      if (slot.tier > tier) return;
    }
    const y = landed ? heightAt(event.x, event.z) + .15 : event.y;
    const seed = ((event.lootId || 1) * .618033989 % 1) * Math.PI * 2;
    const heading = this.camera ? Math.atan2(this.camera.position.x - event.x, this.camera.position.z - event.z) : 0;
    Object.assign(slot, {alive: true, x: event.x, y, z: event.z, tier, landed, age: 0, seed, heading,
      reach: REACH[tier] * (landed ? .32 : 1), life: LIFE[tier] * (landed ? .63 : 1)});
  }

  update(dt) {
    let count = 0;
    for (const burst of this.pool) {
      if (!burst.alive) continue;
      burst.age += dt;
      if (burst.age >= burst.life) {
        burst.alive = false;
        continue;
      }
      this.transform.position.set(burst.x, burst.y, burst.z);
      this.transform.rotation.set(0, burst.heading, 0);
      this.transform.scale.setScalar(burst.reach);
      this.transform.updateMatrix();
      for (const mesh of this.layers) {
        mesh.setMatrixAt(count, this.transform.matrix);
        mesh.geometry.attributes.aCue.setXYZW(count, burst.age / burst.life,
          burst.tier, burst.landed ? 1 : 0, burst.seed);
      }
      count++;
    }
    for (const mesh of this.layers) {
      mesh.count = count;
      mesh.visible = count > 0;
      if (mesh.visible) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.geometry.attributes.aCue.needsUpdate = true;
      }
    }
  }
}
