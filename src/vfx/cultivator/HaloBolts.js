import * as THREE from 'three';
const COUNT=96,SAMPLES=24,clamp=THREE.MathUtils.clamp;
const random=i=>Math.sin(i*127.1+13.7)*43758.5453-Math.floor(Math.sin(i*127.1+13.7)*43758.5453);

/** Predictive homing paths, sampled into reusable history ribbons and independent impacts. */
export class HaloBolts{
 constructor(parent,camera,config,capacity=COUNT){
  const COUNT=this.capacity=Math.max(96,Math.min(160,capacity));
  this.camera=camera;this.config=config;this.group=new THREE.Group();this.group.name='Celestial wheel homing lights';parent.add(this.group);
  this.events=[];this.p=new THREE.Vector3();this.previous=new THREE.Vector3();this.direction=new THREE.Vector3();this.view=new THREE.Vector3();this.side=new THREE.Vector3();this.cross=new THREE.Vector3();this.point=new THREE.Vector3();this.target=new THREE.Vector3(7.5,1.25,0);this.zAxis=new THREE.Vector3(0,0,1);this.dummy=new THREE.Object3D();
  this.heads=new THREE.InstancedMesh(new THREE.OctahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:new THREE.Color(1.6,2.8,3.8)}),COUNT);
  this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.heads.frustumCulled=false;this.group.add(this.heads);
  const vertices=COUNT*SAMPLES*4,uv=new Float32Array(vertices*2),index=[];
  this.positions=new Float32Array(vertices*3);this.alpha=new Float32Array(vertices);
  for(let i=0;i<COUNT;i++)for(let plane=0;plane<2;plane++)for(let j=0;j<SAMPLES;j++){
   const v=i*SAMPLES*4+plane*SAMPLES*2+j*2;uv.set([j/(SAMPLES-1),0,j/(SAMPLES-1),1],v*2);
   if(j<SAMPLES-1)index.push(v,v+1,v+2,v+1,v+3,v+2);
  }
  this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));this.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));this.geometry.setAttribute('aAlpha',new THREE.BufferAttribute(this.alpha,1).setUsage(THREE.DynamicDrawUsage));this.geometry.setIndex(index);
  this.material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uTint:{value:new THREE.Color(1,1,1)}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
   vertexShader:`attribute float aAlpha;varying vec2 vUv;varying float vAlpha;void main(){vUv=uv;vAlpha=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`uniform float uTime;uniform vec3 uTint;varying vec2 vUv;varying float vAlpha;void main(){float edge=abs(vUv.y*2.-1.);float soft=pow(max(0.,1.-edge),1.7);float core=exp(-edge*edge*38.);float flow=.82+.18*sin(vUv.x*39.+uTime*18.);vec3 color=mix(vec3(.16,.35,1.3),vec3(1.45,2.9,3.8),core);float a=soft*vAlpha*flow;if(a<.008)discard;gl_FragColor=vec4(color*uTint,a);}`});
  this.trails=new THREE.Mesh(this.geometry,this.material);this.trails.frustumCulled=false;this.trails.renderOrder=3;this.group.add(this.trails);
  this.hitAges=new Float32Array(COUNT*2);this.hitKinds=new Float32Array(COUNT*2);
  const flashes=new THREE.PlaneGeometry(2,2);flashes.setAttribute('aAge',new THREE.InstancedBufferAttribute(this.hitAges,1).setUsage(THREE.DynamicDrawUsage));flashes.setAttribute('aKind',new THREE.InstancedBufferAttribute(this.hitKinds,1));
  for(let i=COUNT;i<COUNT*2;i++)this.hitKinds[i]=1;
  const flashMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
   vertexShader:`attribute float aAge,aKind;varying vec2 vP;varying float vAge,vKind;void main(){vP=uv*2.-1.;vAge=aAge;vKind=aKind;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
   fragmentShader:`varying vec2 vP;varying float vAge,vKind;void main(){float life=mix(.48,.16,vKind);if(vAge<0.||vAge>life)discard;float p=vAge/life,r=length(vP);float cross=exp(-abs(vP.x)*60.)*pow(max(0.,1.-abs(vP.y)),2.)+exp(-abs(vP.y)*60.)*pow(max(0.,1.-abs(vP.x)),2.);float ring=exp(-abs(r-(.18+p*.7))*75.)*(1.-vKind);float centre=exp(-r*18.);float a=(cross*pow(1.-p,4.)+ring*.55*(1.-p)+centre*pow(1.-p,3.))*1.2;if(a<.006)discard;gl_FragColor=vec4(mix(vec3(.6,.75,2.),vec3(1.9,3.,3.8),centre),a);}`});
  this.flashes=new THREE.InstancedMesh(flashes,flashMaterial,COUNT*2);this.flashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.flashes.frustumCulled=false;this.flashes.renderOrder=4;this.group.add(this.flashes);
  this.shards=new THREE.InstancedMesh(new THREE.OctahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:new THREE.Color(.45,1.25,2.4),transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}),COUNT*7);this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shards.frustumCulled=false;this.group.add(this.shards);
  this.reset();
 }
 configure(config,sourceAtTime,targetAtTime){
  const COUNT=this.capacity;
  this.config=config;this.targetAtTime=targetAtTime;this.events.length=0;
  const count=clamp(Math.round(48*(config.particleDensity??1)),12,COUNT);
  for(let i=0;i<count;i++){
   const launch=1.4+i/(count-1)*1.85,fall=(.65+random(i)*.22)*Math.sqrt(18/(config.flightSpeed??18));
   const start=new THREE.Vector3(),end=new THREE.Vector3();sourceAtTime(launch,i%2,i*2.399963,start);targetAtTime(launch+fall,end);
   // Fan outward from the wheel before converging, keeping the spirit's face clear.
   const sign=Math.sign(start.z)||(i%2?1:-1),p1=start.clone().add(new THREE.Vector3(2.1+random(i+4)*1.8,1.2+random(i+2)*1.8,sign*(1.7+random(i+3)*2.5)));
   const p2=end.clone().add(new THREE.Vector3(-3.4,1+random(i+8)*2.2,sign*(.6+random(i+9)*1.6)));
   this.events.push({i,launch,fall,hit:launch+fall,start,end,p1,p2,size:.055+random(i+11)*.03});
  }
  this.reset();
 }
 sample(event,time,out){
  if(event.live){
   const f=clamp((event.sampleTime-time)*60,0,Math.max(0,event.historyCount-1)),a=Math.floor(f)*3,b=Math.min(Math.floor(f)+1,event.historyCount-1)*3,u=f-Math.floor(f),h=event.history;
   return out.set(h[a]+(h[b]-h[a])*u,h[a+1]+(h[b+1]-h[a+1])*u,h[a+2]+(h[b+2]-h[a+2])*u);
  }
  const u=clamp((time-event.launch)/event.fall,0,1),v=1-u;
  return out.copy(event.start).multiplyScalar(v*v*v).addScaledVector(event.p1,3*v*v*u).addScaledVector(event.p2,3*v*u*u).addScaledVector(event.end,u*u*u);
 }
 update(t){
  const COUNT=this.capacity;
  this.material.uniforms.uTime.value=t;this.targetAtTime?.(t,this.target);let heads=0,tails=0,shards=0;this.hitPulse=0;
  this.hitAges.fill(-1);
  for(const e of this.events){
   if(e.live&&!e.started)continue;
   const impact=e.impact!==false,target=e.live?e.end:this.target;
   const age=t-e.hit,flight=t>=e.launch&&age<0,drain=1-clamp(age/.24,0,1);
   if(flight){
    this.sample(e,t,this.p);this.sample(e,t-.003,this.previous);this.direction.subVectors(this.p,this.previous).normalize();
    this.dummy.position.copy(this.p);this.dummy.quaternion.setFromUnitVectors(this.zAxis,this.direction);this.dummy.scale.set(e.size,e.size,e.size*2.5);this.dummy.updateMatrix();this.heads.setMatrixAt(heads++,this.dummy.matrix);
   }
   if(t>=e.launch&&age<.24){
    const head=Math.min(t,e.hit),span=Math.min(.28,head-e.launch);
    for(let plane=0;plane<2;plane++)for(let j=0;j<SAMPLES;j++){
     const s=j/(SAMPLES-1),sampleTime=head-span*s,v=tails*SAMPLES*4+plane*SAMPLES*2+j*2;
     this.sample(e,sampleTime,this.p);this.sample(e,Math.max(e.launch,sampleTime-.003),this.previous);
     this.direction.subVectors(this.p,this.previous);if(this.direction.lengthSq()<.000001)this.direction.subVectors(e.p1,e.start);this.direction.normalize();
     if(age>=0)this.p.lerp(target,clamp(age/.24,0,1)*Math.pow(1-s,2));
     this.view.subVectors(this.camera.position,this.p).normalize();this.side.crossVectors(this.direction,this.view).normalize();if(this.side.lengthSq()<.001)this.side.set(0,0,1);this.cross.crossVectors(this.direction,this.side).normalize();
     const axis=plane===0?this.side:this.cross,width=e.size*(1.15+.45*Math.sin(s*3.14))*(1-s)*drain;
     for(let k=0;k<2;k++){const sign=k?1:-1;this.point.copy(this.p).addScaledVector(axis,width*sign).toArray(this.positions,(v+k)*3);this.alpha[v+k]=Math.pow(1-s,1.25)*drain*(plane? .45:.85);}
    }tails++;
   }
   const sourceAge=t-e.launch;this.hitAges[e.i]=impact?age:-1;this.hitAges[e.i+COUNT]=sourceAge;
   this.dummy.quaternion.copy(this.camera.quaternion);
   this.dummy.position.copy(target);this.dummy.scale.setScalar(age>=0&&age<.48?.45+age*1.2:.00001);this.dummy.updateMatrix();this.flashes.setMatrixAt(e.i,this.dummy.matrix);
   this.dummy.position.copy(e.start);this.dummy.scale.setScalar(sourceAge>=0&&sourceAge<.16?.22:.00001);this.dummy.updateMatrix();this.flashes.setMatrixAt(e.i+COUNT,this.dummy.matrix);
   if(impact&&age>=0&&age<.65){
    const fade=1-age/.65;this.hitPulse=Math.max(this.hitPulse,Math.exp(-age*25));
    for(let j=0;j<7;j++){
     const k=e.i*7+j,a=random(k+40)*Math.PI*2,r=(1.1+random(k+60)*1.6)*(1-Math.exp(-age*2.5));
     this.dummy.position.copy(e.end);this.dummy.position.x+=Math.cos(a)*r;this.dummy.position.z+=Math.sin(a)*r;this.dummy.position.y+=(random(k+80)*2-.4)*age-1.4*age*age;
     this.dummy.rotation.set(age*(4+j),a+age*6,j+age*8);const size=(.022+random(k+90)*.022)*fade;this.dummy.scale.set(size,size*2.4,size*.55);this.dummy.updateMatrix();this.shards.setMatrixAt(shards++,this.dummy.matrix);
    }
   }
  }
  this.heads.count=heads;this.shards.count=shards;this.geometry.setDrawRange(0,tails*2*(SAMPLES-1)*6);
  this.heads.instanceMatrix.needsUpdate=this.shards.instanceMatrix.needsUpdate=this.flashes.instanceMatrix.needsUpdate=true;
  this.geometry.attributes.position.needsUpdate=this.geometry.attributes.aAlpha.needsUpdate=true;this.flashes.geometry.attributes.aAge.needsUpdate=true;
 }
 reset(){this.heads.count=this.shards.count=0;this.geometry.setDrawRange(0,0);this.hitAges.fill(-1);this.flashes.geometry.attributes.aAge.needsUpdate=true;this.hitPulse=0;}
 dispose(){for(const mesh of [this.heads,this.trails,this.flashes,this.shards]){mesh.geometry.dispose();mesh.material.dispose();}this.group.removeFromParent();}
}
