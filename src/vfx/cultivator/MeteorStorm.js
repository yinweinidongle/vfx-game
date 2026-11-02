import * as THREE from 'three';
const MAX=84, SECTIONS=18, PARTICLES=1300;
const clamp=THREE.MathUtils.clamp;
export const stormRandom=(i,s=0)=>{const v=Math.sin(i*127.1+s*311.7+17.31)*43758.5453;return v-Math.floor(v);};
const noiseGLSL=`
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.57+noise(p*2.03+4.1)*.28+noise(p*4.07)*.15;}
`;
const rockVertex=`
varying vec3 vLocal,vNormal,vWorld;
void main(){vLocal=position;vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=world.xyz;vNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*world;}
`;
const rockFragment=`
uniform float uTime;varying vec3 vLocal,vNormal,vWorld;
${noiseGLSL}
void main(){
  float n=fbm(vLocal*3.2);float fissure=abs(fbm(vLocal*4.4)-.48);
  float cracks=1.-smoothstep(.007,.028,fissure);
  vec3 N=normalize(vNormal);float key=max(0.,dot(N,normalize(vec3(-.3,.8,.6))));
  float facet=.34+.66*key;
  vec3 rock=mix(vec3(.033,.019,.012),vec3(.24,.12,.045),n)*facet;
  float heat=.9+.15*sin(uTime*11.+vWorld.x*2.);
  vec3 lava=mix(vec3(1.6,.12,.009),vec3(2.9,.78,.12),n)*cracks*heat;
  gl_FragColor=vec4(rock+lava,1.);
}
`;
const trailVertex=`
attribute float aLife;varying vec2 vUv;varying float vLife;
void main(){vUv=uv;vLife=aLife;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
const trailFragment=`
uniform float uTime;varying vec2 vUv;varying float vLife;${noiseGLSL}
void main(){
 float side=abs(vUv.y*2.-1.),s=vUv.x;
 float n=fbm(vec3(s*7.-uTime*5.,vUv.y*3.,uTime*.3));
 side=abs(vUv.y*2.-1.+sin(s*14.-uTime*9.+n*6.)*.12*s);
 float edge=1.-smoothstep(.28+n*.55,.9,side);
 float fade=pow(max(0.,1.-s),1.5);
 float core=pow(max(0.,1.-side),5.)*(1.-s)*1.2;
 vec3 col=mix(vec3(.9,.12,.012),vec3(1.7,.68,.08),1.-s);
 col=mix(col,vec3(2.1,1.2,.3),clamp(core,0.,1.));
 float alpha=edge*fade*vLife*(.35+n*.5);
 if(alpha<.006)discard;gl_FragColor=vec4(col,alpha);
}
`;
const hitVertex=`
attribute float aAge,aPower;varying vec2 vUv;varying float vAge,vPower;
void main(){vUv=uv;vAge=aAge;vPower=aPower;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}
`;
const ringFragment=`
varying vec2 vUv;varying float vAge,vPower;${noiseGLSL}
void main(){
 if(vAge<0.||vAge>1.2)discard;vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);
 float warp=sin(a*19.+vAge*4.)*.015+sin(a*37.)*.008;
 float rim=exp(-abs(r-.72+warp)*95.);
 float inner=exp(-abs(r-.59+warp*.5)*140.)*.3;
 float fissure=pow(max(0.,cos(a*11.+noise(vec3(p*3.,0.))*5.)),32.)*(1.-smoothstep(.25,.75,r));
 float fade=pow(max(0.,1.-vAge/1.2),2.);
 float alpha=(rim+inner+fissure*.4)*fade*vPower;
 if(alpha<.008)discard;gl_FragColor=vec4(vec3(1.65,.68,.12),alpha);
}
`;
const burstFragment=`
varying vec2 vUv;varying float vAge,vPower;${noiseGLSL}
void main(){
 if(vAge<0.||vAge>.32)discard;vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);
 float arms=pow(max(0.,cos(a*7.)),14.)*(1.-smoothstep(.3,.98,r));
 float star=exp(-r*14.)*1.7+arms*.75;
 float alpha=star*pow(max(0.,1.-vAge/.32),2.)*vPower*1.45;
 if(alpha<.005)discard;gl_FragColor=vec4(2.6,1.55,.55,alpha);
}
`;
const smokeFragment=`
varying vec2 vUv;varying float vAge,vPower;${noiseGLSL}
void main(){
 if(vAge<0.||vAge>1.3)discard;vec2 p=vUv*2.-1.;float n=fbm(vec3(p*3.,vAge*.8));
 float a=(1.-smoothstep(.22,.95,length(p)+(n-.5)*.25))*smoothstep(0.,.15,vAge)*(1.-smoothstep(.4,1.3,vAge))*.19*vPower;
 if(a<.005)discard;gl_FragColor=vec4(mix(vec3(.18,.115,.065),vec3(.47,.29,.12),n),a);
}
`;

export function makeStormSchedule(config){
 const count=clamp(Math.round(config.meteorCount??60),12,MAX),speed=18/(config.flightSpeed??18),range=(config.impactRadius??1.6)/1.6;
 const events=[];
 for(let i=0;i<count;i++){
   const hero=i%12===0,angle=i*2.399963,r=hero?0:Math.sqrt(stormRandom(i,1))*3.1*range;
   const end=new THREE.Vector3(7.5+Math.cos(angle)*r,hero?1.25:.08,Math.sin(angle)*r);
   const portalAngle=i*2.399963+.5,portalRadius=Math.sqrt(stormRandom(i,2))*4.55;
   const offset=Math.sin(portalAngle)*portalRadius;
   const start=new THREE.Vector3(1.5+Math.cos(portalAngle)*portalRadius,14.5+Math.sin(.42)*offset,-1.2+Math.cos(.42)*offset);
   const launch=1.6+i/(count-1)*1.8;
   const fall=(i===0?.82:.78+stormRandom(i,5)*.3)*speed;
   events.push({i,hero,start,end,launch,fall,hit:launch+fall,radius:(hero?.62:.14+stormRandom(i,6)*.2)*(config.meteorSize??1),curve:(stormRandom(i,7)-.5)*1.2});
 }
 return events;
}
export function meteorPosition(event,time,out){
 const p=clamp((time-event.launch)/event.fall,0,1);
 out.lerpVectors(event.start,event.end,p*p*.34+p*.66);
 out.z+=Math.sin(p*Math.PI)*event.curve;return out;
}

/** Pooled rocks, trajectory ribbons, impact layers and ballistic debris. */
export class MeteorStorm{
 constructor(parent,camera,config){
  this.camera=camera;this.config=config;this.group=new THREE.Group();this.group.name='Celestial meteor storm';parent.add(this.group);
  this.events=[];this.position=new THREE.Vector3();this.previous=new THREE.Vector3();this.velocity=new THREE.Vector3();this.view=new THREE.Vector3();this.side=new THREE.Vector3();this.up=new THREE.Vector3();this.point=new THREE.Vector3();
  this.dummy=new THREE.Object3D();this.yAxis=new THREE.Vector3(0,1,0);this.color=new THREE.Color();
  const rock=new THREE.IcosahedronGeometry(1,2),pos=rock.attributes.position;
  // Consistent object-space fracture silhouette; instance rotation supplies variation.
  for(let i=0;i<pos.count;i++){this.point.fromBufferAttribute(pos,i);const f=.86+.18*Math.sin(this.point.x*13+this.point.y*7)*Math.sin(this.point.z*11+2);this.point.multiplyScalar(f);this.point.y*=1.18;pos.setXYZ(i,this.point.x,this.point.y,this.point.z);}rock.computeVertexNormals();
  this.rockMaterial=new THREE.ShaderMaterial({uniforms:{uTime:{value:0}},vertexShader:rockVertex,fragmentShader:rockFragment});
  this.rocks=new THREE.InstancedMesh(rock,this.rockMaterial,MAX);this.rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.rocks.frustumCulled=false;this.group.add(this.rocks);
  const vertices=MAX*SECTIONS*4,triangles=[];
  this.trailPositions=new Float32Array(vertices*3);const uv=new Float32Array(vertices*2);this.trailLife=new Float32Array(vertices);
  for(let i=0;i<MAX;i++)for(let plane=0;plane<2;plane++)for(let j=0;j<SECTIONS;j++){
   const a=i*SECTIONS*4+plane*SECTIONS*2+j*2;uv.set([j/(SECTIONS-1),0,j/(SECTIONS-1),1],a*2);
   if(j<SECTIONS-1)triangles.push(a,a+1,a+2,a+1,a+3,a+2);
  }
  this.trailGeometry=new THREE.BufferGeometry();this.trailGeometry.setAttribute('position',new THREE.BufferAttribute(this.trailPositions,3).setUsage(THREE.DynamicDrawUsage));this.trailGeometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));this.trailGeometry.setAttribute('aLife',new THREE.BufferAttribute(this.trailLife,1).setUsage(THREE.DynamicDrawUsage));this.trailGeometry.setIndex(triangles);
  this.trailMaterial=new THREE.ShaderMaterial({uniforms:{uTime:{value:0}},vertexShader:trailVertex,fragmentShader:trailFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  this.trails=new THREE.Mesh(this.trailGeometry,this.trailMaterial);this.trails.frustumCulled=false;this.trails.renderOrder=3;this.group.add(this.trails);
  this.hitAge=new Float32Array(MAX);this.hitPower=new Float32Array(MAX);
  const hitGeometry=new THREE.PlaneGeometry(2,2);hitGeometry.setAttribute('aAge',new THREE.InstancedBufferAttribute(this.hitAge,1).setUsage(THREE.DynamicDrawUsage));hitGeometry.setAttribute('aPower',new THREE.InstancedBufferAttribute(this.hitPower,1));
  const makeHit=(fragment,blend)=>{const mat=new THREE.ShaderMaterial({vertexShader:hitVertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:blend});const mesh=new THREE.InstancedMesh(hitGeometry,mat,MAX);mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);return mesh;};
  this.rings=makeHit(ringFragment,THREE.AdditiveBlending);this.bursts=makeHit(burstFragment,THREE.AdditiveBlending);this.smoke=makeHit(smokeFragment,THREE.NormalBlending);this.smoke.renderOrder=5;
  const shardMat=new THREE.MeshStandardMaterial({color:'#6f4225',roughness:.85,metalness:.15,emissive:'#ef7a16',emissiveIntensity:.24});
  this.shards=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),shardMat,MAX*6);this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shards.frustumCulled=false;this.group.add(this.shards);
  this.particlePositions=new Float32Array(PARTICLES*3);this.particleSize=new Float32Array(PARTICLES);this.particleOpacity=new Float32Array(PARTICLES);
  const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(this.particlePositions,3).setUsage(THREE.DynamicDrawUsage));pg.setAttribute('aSize',new THREE.BufferAttribute(this.particleSize,1).setUsage(THREE.DynamicDrawUsage));pg.setAttribute('aOpacity',new THREE.BufferAttribute(this.particleOpacity,1).setUsage(THREE.DynamicDrawUsage));
  const pm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexShader:`attribute float aSize,aOpacity;varying float vAlpha;void main(){vAlpha=aOpacity;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*550./max(.1,-mv.z),1.,55.);}`,fragmentShader:`varying float vAlpha;void main(){vec2 p=gl_PointCoord*2.-1.;float r=length(p);float star=exp(-r*4.)*(1.-smoothstep(.65,1.,r));float a=star*vAlpha;if(a<.005)discard;gl_FragColor=vec4(1.9,1.05,.25,a);}`});
  this.points=new THREE.Points(pg,pm);this.points.frustumCulled=false;this.group.add(this.points);
  this.configure(config);this.reset();
 }
 configure(config){this.config=config;this.events=makeStormSchedule(config);this.firstImpact=this.events[0].hit;this.lastImpact=Math.max(...this.events.map(e=>e.hit));this.duration=this.lastImpact+1.4;this.rings.count=this.bursts.count=this.smoke.count=this.events.length;for(const e of this.events)this.hitPower[e.i]=e.hero?1:e.i%3===0?.6:.3;this.rings.geometry.attributes.aPower.needsUpdate=true;}
 particle(p,size,alpha){if(this.particleCount>=PARTICLES||alpha<=0)return;const i=this.particleCount++;p.toArray(this.particlePositions,i*3);this.particleSize[i]=size;this.particleOpacity[i]=alpha;}
 update(t){
  this.time=t;this.rockMaterial.uniforms.uTime.value=t;this.trailMaterial.uniforms.uTime.value=t;
  let rocks=0,tails=0,shards=0;this.particleCount=0;this.impactPulse=0;
  for(const e of this.events){
   const age=t-e.hit,flight=t>=e.launch&&age<0,drain=clamp(1-age/.22,0,1);
   this.hitAge[e.i]=age;
   if(flight){
    meteorPosition(e,t,this.position);meteorPosition(e,t-.01,this.previous);this.velocity.subVectors(this.position,this.previous).normalize();
    this.dummy.position.copy(this.position);this.dummy.quaternion.setFromUnitVectors(this.yAxis,this.velocity);this.dummy.rotateY(t*2+e.i);this.dummy.scale.setScalar(e.radius);this.dummy.updateMatrix();this.rocks.setMatrixAt(rocks++,this.dummy.matrix);
   }
   if(t>=e.launch&&age<.22){
    const head=Math.min(t,e.hit),tailSpan=Math.min(.31+e.radius*.12,head-e.launch);
    meteorPosition(e,head,this.position);meteorPosition(e,head-.01,this.previous);this.velocity.subVectors(this.position,this.previous).normalize();
    this.view.subVectors(this.camera.position,this.position).normalize();this.side.crossVectors(this.velocity,this.view).normalize();if(this.side.lengthSq()<.01)this.side.set(0,0,1);this.up.crossVectors(this.velocity,this.side).normalize();
    for(let plane=0;plane<2;plane++)for(let j=0;j<SECTIONS;j++){
      const s=j/(SECTIONS-1),v=tails*SECTIONS*4+plane*SECTIONS*2+j*2;
      meteorPosition(e,head-tailSpan*s,this.point);
      const width=e.radius*(.58+Math.sin(s*Math.PI)*.38)*(1-s)*drain;
      const axis=plane===0?this.side:this.up;
      for(let k=0;k<2;k++){const sign=k===0?-1:1,o=(v+k)*3;this.trailPositions[o]=this.point.x+axis.x*width*sign;this.trailPositions[o+1]=this.point.y+axis.y*width*sign;this.trailPositions[o+2]=this.point.z+axis.z*width*sign;this.trailLife[v+k]=drain*(plane===0?1:.65);}
    }tails++;
   }
   const active=age>=0&&age<1.35,hitScale=(e.hero?1.05:.4+e.radius)*((this.config.impactRadius??1.6)/1.6);
   this.dummy.position.set(e.end.x,.035+(e.i%3)*.004,e.end.z);this.dummy.rotation.set(-Math.PI/2,0,e.i);this.dummy.scale.setScalar(active?(.3+Math.max(0,age)*4.6)*hitScale:.0001);this.dummy.updateMatrix();this.rings.setMatrixAt(e.i,this.dummy.matrix);
   this.dummy.position.copy(e.end);this.dummy.quaternion.copy(this.camera.quaternion);this.dummy.scale.setScalar(active?(1.+Math.min(age,.2)*7)*hitScale:.0001);this.dummy.updateMatrix();this.bursts.setMatrixAt(e.i,this.dummy.matrix);
   this.dummy.position.set(e.end.x,.3+Math.max(0,age)*.65,e.end.z);this.dummy.scale.setScalar(active?(.4+Math.max(0,age)*1.8)*hitScale:.0001);this.dummy.updateMatrix();this.smoke.setMatrixAt(e.i,this.dummy.matrix);
   if(active){
    this.impactPulse=Math.max(this.impactPulse,Math.exp(-age*18)*(e.hero?1:.35));
    const life=1.1,fade=clamp(1-age/life,0,1),motion=(1-Math.exp(-age*1.4))/1.4;
    for(let j=0;j<(e.hero?12:4);j++){
     const id=e.i*13+j,angle=stormRandom(id,11)*Math.PI*2,v=(1.2+stormRandom(id,12)*3.4)*(e.hero?1.5:1);
     const y=e.end.y+(.9+stormRandom(id,13)*3)*age-3.8*age*age;
     if(y<.03||fade<=0)continue;
     this.dummy.position.set(e.end.x+Math.cos(angle)*v*motion,y,e.end.z+Math.sin(angle)*v*motion);
     this.dummy.rotation.set(age*(3+id%5),age*(id%7-3),id+age*4);this.dummy.scale.setScalar((.035+stormRandom(id,15)*.09)*(e.hero?1.5:1)*fade);this.dummy.updateMatrix();this.shards.setMatrixAt(shards++,this.dummy.matrix);
    }
    const density=Math.round(12*(this.config.particleDensity??1));
    for(let j=0;j<density;j++){
     const id=e.i*37+j,angle=stormRandom(id,21)*Math.PI*2,v=1+stormRandom(id,22)*4;
     this.point.set(e.end.x+Math.cos(angle)*v*motion,e.end.y+(.5+stormRandom(id,23)*4)*age-2.1*age*age,e.end.z+Math.sin(angle)*v*motion);
     if(this.point.y>.03)this.particle(this.point,.025+stormRandom(id,24)*.07,fade);
    }
   }
   if(flight){
    for(let j=0;j<3;j++){meteorPosition(e,t-j*.045,this.point);this.point.x+=(stormRandom(e.i*3+j,30)-.5)*.4;this.point.z+=(stormRandom(e.i*3+j,31)-.5)*.4;this.particle(this.point,.04,.6);}
   }
  }
  // Ascending spiritual motes around the caster, rather than undirected spray.
  const aura=THREE.MathUtils.smoothstep(t,0,.5)*(1-THREE.MathUtils.smoothstep(t,this.duration-1.1,this.duration));
  for(let i=0;i<110*(this.config.particleDensity??1);i++){
   const p=(stormRandom(i,41)+t*(.16+stormRandom(i,42)*.2))%1,a=stormRandom(i,43)*Math.PI*2+t*.5,r=1.2*(1-p)+.25;
   this.point.set(-8.4+Math.cos(a)*r,.1+p*3.1,Math.sin(a)*r);this.particle(this.point,.018+stormRandom(i,44)*.035,aura*Math.sin(p*Math.PI)*.6);
  }
  this.rocks.count=rocks;this.shards.count=shards;this.rocks.instanceMatrix.needsUpdate=true;this.shards.instanceMatrix.needsUpdate=true;
  this.trailGeometry.setDrawRange(0,tails*(SECTIONS-1)*12);this.trailGeometry.attributes.position.needsUpdate=true;this.trailGeometry.attributes.aLife.needsUpdate=true;
  for(const m of [this.rings,this.bursts,this.smoke])m.instanceMatrix.needsUpdate=true;
  this.rings.geometry.attributes.aAge.needsUpdate=true;
  this.points.geometry.setDrawRange(0,this.particleCount);for(const a of Object.values(this.points.geometry.attributes))a.needsUpdate=true;
 }
 reset(){this.rocks.count=this.shards.count=0;this.trailGeometry.setDrawRange(0,0);this.points.geometry.setDrawRange(0,0);this.hitAge.fill(-1);this.rings.geometry.attributes.aAge.needsUpdate=true;this.impactPulse=0;}
 dispose(){const geometries=new Set(),materials=new Set();this.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.group.removeFromParent();}
}
