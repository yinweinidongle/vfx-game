import * as THREE from 'three';
import {createCrystalGeometry,createCrystalMaterial} from './FrostParticles.js';

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const noise=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}`;
function effectMaterial(type,color){
 const fragments={
  ring:`vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);float radius=.12+min(uAge*2.8,.94);float w=.013+uAge*.008;float n=noise(p*12.+uAge*4.);float band=exp(-pow((r-radius)/w,2.));float echo=exp(-pow((r-radius*.82)/(.055+uAge*.06),2.))*.17;float fade=pow(max(0.,1.-uAge/.65),1.5);float alpha=(band+echo)*fade*(.65+.35*sin(a*18.+n));gl_FragColor=vec4(mix(uColor,vec3(.5,.89,1.),.3)*1.12,alpha);`,
  flash:`vec2 p=vUv*2.-1.;float r=length(p);float a=atan(p.y,p.x);float arms=pow(abs(cos(a*3.)),28.)*pow(max(0.,1.-r),3.);float core=exp(-r*r*70.);float cross=exp(-abs(p.y)*70.)*exp(-abs(p.x)*3.)*.8;float fade=pow(max(0.,1.-uAge/.16),2.);gl_FragColor=vec4(vec3(.78,.96,1.)*2.5,(arms+core+cross)*fade);`,
  mist:`vec2 p=vUv*2.-1.;float r=length(p);float n=noise(p*4.-uAge*1.7)*.65+noise(p*9.+uAge*2.)*.35;float shell=exp(-pow((r-(.15+uAge*.55))/.26,2.));float fade=min(1.,uAge*15.)*pow(max(0.,1.-uAge/1.05),2.);gl_FragColor=vec4(mix(uColor,vec3(.5,.7,.77),.65),shell*smoothstep(.22,.8,n)*fade*.22*(1.-smoothstep(.75,1.,r)));`,
  frost:`vec2 p=vUv*2.-1.;float r=length(p);float a=atan(p.y,p.x);float ray=pow(abs(cos(a*6.)),65.);float fine=pow(abs(cos(a*6.+sin(floor(r*7.)*2.1)*.25)),90.)*.25;float cracks=(ray+fine)*(1.-smoothstep(.1,.93,r));float ring=exp(-pow((r-.55)/.006,2.))*.4;float grow=(1.-smoothstep(uAge*4.-.07,uAge*4.+.05,r));float fade=(1.-smoothstep(.55,1.1,uAge));gl_FragColor=vec4(mix(uColor,vec3(.78,.95,1.),.5),(cracks+ring)*grow*fade*.65);`,
 };
 return new THREE.ShaderMaterial({uniforms:{uAge:{value:10},uOpacity:{value:1},uColor:{value:new THREE.Color(color)}},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform float uAge;uniform float uOpacity;uniform vec3 uColor;${noise}void main(){${fragments[type]}gl_FragColor.a*=uOpacity;}`,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:type==='mist'?THREE.NormalBlending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-1});
}

// Thin tapered ribbons keep the fracture pattern readable from a distant camera.
// Geometry is authored once: uneven trunks, angular forks, and fine outer branches.
function createFrostCracks(color) {
 const positions=[],progress=[],strength=[];
 const segment=(ax,az,bx,bz,width,power)=>{
  const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),nx=-dz/length*width,nz=dx/length*width;
  const vertices=[[ax+nx,az+nz],[ax-nx,az-nz],[bx+nx*.55,bz+nz*.55],[ax-nx,az-nz],[bx-nx*.55,bz-nz*.55],[bx+nx*.55,bz+nz*.55]];
  for(const [x,z] of vertices){positions.push(x,0,z);progress.push(Math.hypot(x,z));strength.push(power);}
 };
 for(let ray=0;ray<10;ray++){
  const angle=ray*Math.PI/5+Math.sin(ray*3.1)*.12;
  const reach=.76+Math.sin(ray*5.7)*.16;
  let x=0,z=0;
  for(let step=1;step<=5;step++){
   const r=reach*step/5,a=angle+Math.sin(ray*2.3+step*2.7)*.075;
   const nx=Math.cos(a)*r,nz=Math.sin(a)*r;
   segment(x,z,nx,nz,.013*(1-step*.12),.95-step*.05);
   if(step===2||step===4){
    const sign=(ray+step)%2?1:-1,branchAngle=angle+sign*.62,branchLength=(step===2?.29:.2);
    const bx=nx+Math.cos(branchAngle)*branchLength,bz=nz+Math.sin(branchAngle)*branchLength;
    segment(nx,nz,bx,bz,.007,.7);
    segment(bx,bz,bx+Math.cos(branchAngle-sign*.25)*.12,bz+Math.sin(branchAngle-sign*.25)*.12,.0035,.48);
   }
   x=nx;z=nz;
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('aProgress',new THREE.Float32BufferAttribute(progress,1));
 geometry.setAttribute('aStrength',new THREE.Float32BufferAttribute(strength,1));
 const material=new THREE.ShaderMaterial({
  uniforms:{uAge:{value:0},uColor:{value:new THREE.Color(color)}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  vertexShader:`attribute float aProgress;attribute float aStrength;varying float vProgress;varying float vStrength;void main(){vProgress=aProgress;vStrength=aStrength;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float uAge;uniform vec3 uColor;varying float vProgress;varying float vStrength;void main(){float grow=1.-smoothstep(uAge*6.-.04,uAge*6.+.08,vProgress);float fade=1.-smoothstep(.48,1.1,uAge);float rim=exp(-pow((vProgress-uAge*4.)/.12,2.));gl_FragColor=vec4(mix(uColor,vec3(.73,.97,1.),.47)*(1.+rim*.3),grow*fade*vStrength*.9);}`,
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=4;return mesh;
}

/** A pooled, analytic ice detonation. Every visual reaches zero by 1.1s. */
export class IceImpact {
 constructor(scene,config){
  this.config=config;this.group=new THREE.Group();scene.add(this.group);this.group.visible=false;this.age=10;this.active=false;this.maxShards=96;this.dummy=new THREE.Object3D();this.zero=new THREE.Matrix4().makeScale(0,0,0);
  this.geometry=createCrystalGeometry();this.fades=new Float32Array(this.maxShards);this.geometry.setAttribute('aFade',new THREE.InstancedBufferAttribute(this.fades,1));this.material=createCrystalMaterial(config.frostColor);this.shards=new THREE.InstancedMesh(this.geometry,this.material,this.maxShards);this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shards.frustumCulled=false;this.shards.renderOrder=5;this.group.add(this.shards);
  const seeded=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
  this.shardData=Array.from({length:this.maxShards},(_,i)=>{const a=i*2.39996323;const y=seeded(i+2)*1.6-.45,r=Math.sqrt(Math.max(.1,1-y*y*.5));return{velocity:new THREE.Vector3(Math.cos(a)*r,Math.max(-.2,y),Math.sin(a)*r).normalize().multiplyScalar(2+seeded(i+31)*4.5),rotation:new THREE.Euler(seeded(i+6)*6.28,seeded(i+8)*6.28,seeded(i+9)*6.28),spin:new THREE.Vector3(seeded(i+16)*8-4,seeded(i+23)*10-5,seeded(i+28)*12-6),size:.18+seeded(i+82)*.5,life:.55+seeded(i+3)*.5};});
  this.planes=[];this.planeGeometry=new THREE.PlaneGeometry(2,2);
  const add=(type,rotation,scale,order)=>{const m=new THREE.Mesh(this.planeGeometry,effectMaterial(type,config.frostColor));m.rotation.set(...rotation);m.scale.setScalar(scale);m.renderOrder=order;this.group.add(m);this.planes.push(m);return m;};
  this.ring=add('ring',[0,Math.PI/2,0],2.7,6);this.ring2=add('ring',[0,0,0],2.3,6);this.ring2.material.uniforms.uOpacity.value=.28;
  this.groundRing=add('ring',[-Math.PI/2,0,0],3,3);this.groundFrost=add('frost',[-Math.PI/2,0,.2],2.4,2);this.groundFrost.material.uniforms.uOpacity.value=.2;this.groundRing.material.uniforms.uOpacity.value=.7;
  this.targetFrost=add('frost',[0,Math.PI/2,0],1.3,6);this.targetFrost.position.x=.06;this.targetFrost.material.uniforms.uOpacity.value=.45;
  this.flash=add('flash',[0,0,Math.PI/12],1.7,8);this.flash2=add('flash',[0,Math.PI/2,Math.PI/7],1.7,8);
  this.mist=add('mist',[0,0,.4],3,3);this.mist2=add('mist',[-Math.PI/2,0,1],3,3);
  this.cracks=createFrostCracks(config.frostColor);this.group.add(this.cracks);
  this.light=new THREE.PointLight(0x96efff,0,5,2);this.light.position.set(-.4,.65,.9);this.group.add(this.light);
  this.reset();
 }
 trigger(position,config=this.config){this.group.position.copy(position);this.age=0;this.active=true;this.group.visible=true;this.groundRing.position.y=-position.y+.035;this.groundFrost.position.y=-position.y+.025;this.cracks.position.y=-position.y+.045;this.mist2.position.y=-position.y+.08;this.update(0,0,config);}
 update(dt,time,config=this.config){
  if(!this.active)return;this.age+=dt;const a=this.age;if(a>=1.1-1e-6){this.reset();return;}
  const radius=config.impactRadius/1.6;const count=Math.min(this.maxShards,Math.max(0,Math.floor(config.shardCount)));this.shards.count=count;this.material.uniforms.uColor.value.set(config.frostColor);
  for(let i=0;i<count;i++){const d=this.shardData[i],t=a/d.life;if(t>=1){this.shards.setMatrixAt(i,this.zero);this.fades[i]=0;continue;}const distance=(1-Math.exp(-a*2.2))/2.2*radius;this.dummy.position.copy(d.velocity).multiplyScalar(distance);this.dummy.position.y-=a*a*2.6;this.dummy.rotation.set(d.rotation.x+d.spin.x*a,d.rotation.y+d.spin.y*a,d.rotation.z+d.spin.z*a);const s=d.size*(1-t*t*.75)*radius;this.dummy.scale.set(s*.8,s,s);this.dummy.updateMatrix();this.shards.setMatrixAt(i,this.dummy.matrix);this.fades[i]=Math.pow(1-t,1.1);}
  this.shards.instanceMatrix.needsUpdate=true;this.geometry.attributes.aFade.needsUpdate=true;
  for(const m of this.planes){m.material.uniforms.uAge.value=a;m.material.uniforms.uColor.value.set(config.frostColor);}
  this.cracks.material.uniforms.uAge.value=a;this.cracks.material.uniforms.uColor.value.set(config.frostColor);this.cracks.scale.setScalar(2.8*radius);
  this.ring.scale.setScalar(3*radius);this.ring2.scale.setScalar(2.7*radius);this.groundRing.scale.setScalar(3.7*radius);this.groundFrost.scale.setScalar(2.9*radius);this.targetFrost.scale.setScalar(1.5*radius);
  this.flash.scale.setScalar((1.4+a*3)*radius);this.flash2.scale.copy(this.flash.scale);this.mist.scale.setScalar((2+a*2)*radius);this.mist2.scale.setScalar((2+a*2.6)*radius);
  this.light.color.set(config.frostColor);this.light.intensity=3.8*Math.exp(-a*17);this.light.distance=5*radius;
 }
 reset(){this.age=10;this.active=false;this.group.visible=false;this.light.intensity=0;this.fades.fill(0);for(let i=0;i<this.maxShards;i++)this.shards.setMatrixAt(i,this.zero);this.shards.instanceMatrix.needsUpdate=true;this.geometry.attributes.aFade.needsUpdate=true;}
 dispose(){this.group.removeFromParent();this.geometry.dispose();this.material.dispose();this.planeGeometry.dispose();this.cracks.geometry.dispose();this.cracks.material.dispose();for(const p of this.planes)p.material.dispose();}
}
