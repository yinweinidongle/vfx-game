import * as THREE from 'three';

export const SWORD_PARTICLE_ROLES = Object.freeze({ CHARGE: 0, SLASH: 1, STREAK: 2, PEEL: 3, SPARK: 4, SHARD: 5, RESIDUAL: 6 });

/** Closed, thick asymmetric triangular energy fragments, never flat billboards. */
export function createSwordShardGeometry() {
  const vertices = [[-.62,-.22,-.07],[.76,0,-.025],[-.35,.25,-.055],[-.62,-.22,.07],[.76,0,.025],[-.35,.25,.055],[.03,0,.16],[.03,0,-.13]];
  const faces = [[6,3,4],[6,4,5],[6,5,3],[7,1,0],[7,2,1],[7,0,2],[0,1,4],[0,4,3],[1,2,5],[1,5,4],[2,0,3],[2,3,5]], positions=[];
  for(const face of faces) for(const i of face) positions.push(...vertices[i]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}
export function createSwordShardMaterial(config={}) {
  return new THREE.ShaderMaterial({uniforms:{uCyan:{value:new THREE.Color(config.swordColor||config.frostColor||'#39dfff')},uPurple:{value:new THREE.Color('#9170ff')}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`attribute float aFade,aHue,aEnergy;varying vec3 vN,vV,vP;varying float vFade,vHue,vEnergy;void main(){vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.);vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);vV=-mv.xyz;vP=position;vFade=aFade;vHue=aHue;vEnergy=aEnergy;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform vec3 uCyan,uPurple;varying vec3 vN,vV,vP;varying float vFade,vHue,vEnergy;void main(){if(vFade<.001)discard;vec3 n=normalize(vN),v=normalize(vV);float fr=pow(max(0.,1.-abs(dot(n,v))),3.);float facet=pow(max(0.,dot(n,normalize(vec3(.3,.8,.6)))),4.);float spec=pow(max(0.,dot(reflect(-v,n),normalize(vec3(-.4,.7,.6)))),24.);vec3 base=mix(uCyan,uPurple,vHue);vec3 c=base*(.22+facet*.67)+vec3(.7,.97,1.)*(fr*.55+spec*1.2);float vein=exp(-abs(vP.y-vP.x*.05)*85.);c+=base*vein*.55;
      if(vEnergy<-.5){c=vec3(.006,.008,.023)+uPurple*(.018+fr*.11);}
      else{float spine=1.-smoothstep(.035,.135,abs(vP.y-vP.x*.025));float energy=clamp(vEnergy,0.,1.);vec3 core=mix(vec3(.92,1.45,1.55),uCyan*1.6,.18);c=mix(c,core,spine*energy*.9);c+=vec3(.66,.97,1.)*(vein*.55+spec*.25)*energy;}
      gl_FragColor=vec4(c,(vEnergy<-.5?.92:.86+fr*.12)*vFade);}`});
}

/** Seven pooled roles: intake, slash, streak, peel, spark, impact shard, ash. */
export class SwordParticles {
  constructor(scene,config={}) {
    this.config=config;this.capacity=1200;this.shardCapacity=192;this.cursor=0;this.shardCursor=0;this.accumulator=0;this.previous=new THREE.Vector3();this.sample=new THREE.Vector3();this.hasPrevious=false;this.disposed=false;
    const n=this.capacity;this.positions=new Float32Array(n*3);this.velocities=new Float32Array(n*3);this.anchors=new Float32Array(n*3);this.ages=new Float32Array(n);this.lives=new Float32Array(n);this.sizes=new Float32Array(n);this.rotations=new Float32Array(n);this.spins=new Float32Array(n);this.opacities=new Float32Array(n);this.roles=new Float32Array(n);this.radii=new Float32Array(n);this.angles=new Float32Array(n);
    this.geometry=new THREE.BufferGeometry();for(const [name,array,size] of [['position',this.positions,3],['aSize',this.sizes,1],['aRotation',this.rotations,1],['aOpacity',this.opacities,1],['aRole',this.roles,1]])this.geometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
    this.material=new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(config.swordColor||config.frostColor||'#39dfff')},uPixels:{value:Math.min(globalThis.devicePixelRatio||1,2)*650}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`uniform float uPixels;attribute float aSize,aRotation,aOpacity,aRole;varying float vRotation,vOpacity,vRole;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uPixels/max(.25,-mv.z),0.,32.);vRotation=aRotation;vOpacity=aOpacity;vRole=aRole;}`,
      fragmentShader:`uniform vec3 uColor;varying float vRotation,vOpacity,vRole;void main(){vec2 p=gl_PointCoord-.5;float c=cos(vRotation),s=sin(vRotation);p=mat2(c,-s,s,c)*p;float alpha;vec3 color=uColor;
        if(vRole<.5){alpha=(1.-smoothstep(.05,.42,abs(p.x)*.7+abs(p.y)*1.4));color=mix(uColor,vec3(.91,1.,1.),.6);}
        else if(vRole<2.5){float taper=pow(max(0.,1.-abs(p.x)*2.),.75);float width=.075*taper;alpha=(1.-smoothstep(width*.55,width+.006,abs(p.y)))*(1.-smoothstep(.43,.5,abs(p.x)));float spine=1.-smoothstep(.005,.027,abs(p.y));color=mix(uColor*1.05,vec3(.92,1.32,1.42),spine);}
        else if(vRole<4.5){float r=length(p),a=atan(p.y,p.x);alpha=pow(abs(cos(a*2.)),22.)*(1.-smoothstep(.02,.48,r));color=mix(vec3(.55,.29,1.),vec3(.86,1.,1.),.55);}
        else{alpha=1.-smoothstep(.09,.38,abs(p.x)+abs(p.y));color=mix(uColor,vec3(.57,.34,1.),.32);}
        if(alpha*vOpacity<.006)discard;gl_FragColor=vec4(color*(vRole>3.5&&vRole<4.5?2.1:1.2),alpha*vOpacity);}`});
    this.points=new THREE.Points(this.geometry,this.material);this.points.frustumCulled=false;this.points.renderOrder=7;scene.add(this.points);
    this.shardGeometry=createSwordShardGeometry();this.shardFades=new Float32Array(this.shardCapacity);this.shardHues=new Float32Array(this.shardCapacity);this.shardEnergy=new Float32Array(this.shardCapacity);
    this.shardGeometry.setAttribute('aFade',new THREE.InstancedBufferAttribute(this.shardFades,1));this.shardGeometry.setAttribute('aHue',new THREE.InstancedBufferAttribute(this.shardHues,1));this.shardGeometry.setAttribute('aEnergy',new THREE.InstancedBufferAttribute(this.shardEnergy,1));this.shardMaterial=createSwordShardMaterial(config);
    this.shards=new THREE.InstancedMesh(this.shardGeometry,this.shardMaterial,this.shardCapacity);this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shards.frustumCulled=false;this.shards.renderOrder=5;scene.add(this.shards);
    this.fragments=Array.from({length:this.shardCapacity},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),rotation:new THREE.Euler(),spin:new THREE.Vector3(),age:0,life:0,size:0,role:3}));this.dummy=new THREE.Object3D();this.fragmentDirection=new THREE.Vector3();this.fragmentAxis=new THREE.Vector3(1,0,0);this.zero=new THREE.Matrix4().makeScale(0,0,0);this.reset();
  }
  random(a=0,b=1){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return a+(b-a)*this.seed/4294967296;}
  emit(position,role){
    const i=this.cursor++%this.capacity,k=i*3;this.positions[k]=this.anchors[k]=position.x;this.positions[k+1]=this.anchors[k+1]=position.y;this.positions[k+2]=this.anchors[k+2]=position.z;
    this.roles[i]=role;this.ages[i]=0;this.lives[i]=role===0?this.random(.18,.38):role===4?this.random(.09,.23):role===6?this.random(.55,.98):this.random(.25,.62);
    this.sizes[i]=role===2||role===1?this.random(.16,.36):this.random(.025,.08);this.rotations[i]=role===2?this.random(-.16,.16):this.random(0,6.28);this.spins[i]=role===2||role===1?this.random(-.4,.4):this.random(-4,4);
    this.velocities[k]=this.random(-2.5,-.5);this.velocities[k+1]=this.random(-.3,.6);this.velocities[k+2]=this.random(-.5,.5);this.radii[i]=this.random(.5,1.1);this.angles[i]=this.random(0,6.28);return i;
  }
  emitFragment(position,role=3){const i=this.shardCursor++%this.shardCapacity,d=this.fragments[i];d.position.copy(position);d.role=role;d.age=0;d.life=role===5?this.random(.35,.8):this.random(.26,.55);d.size=role===5?this.random(.10,.19):this.random(.10,.20);d.velocity.set(this.random(-3.8,-1.6),this.random(-.3,.8),this.random(-.8,.8));if(role===5)d.velocity.set(this.random(-3,3),this.random(-1.5,3),this.random(-3,3));d.rotation.set(this.random(0,6.28),this.random(0,6.28),this.random(0,6.28));d.spin.set(this.random(-10,10),this.random(-8,8),this.random(-12,12));this.shardHues[i]=this.random()<.45?.85:.05;this.shardEnergy[i]=this.random()<.27?-1:role===5?.9:.75;}
  burst(position,kind,config=this.config){
    const impact=kind==='impact',density=config.particleDensity??1,n=Math.floor((impact?62:46)*density);
    for(let j=0;j<n;j++){const role=impact?(j%4===0?4:6):(j%5===0?4:1),i=this.emit(position,role),k=i*3,a=this.random(0,6.28),s=this.random(impact?1.2:2,impact?4.2:6);this.velocities[k]=impact?this.random(-1,1)*s:this.random(-.5,1)*s;this.velocities[k+1]=Math.cos(a)*s;this.velocities[k+2]=Math.sin(a)*s*.65;if(role===1)this.rotations[i]=Math.atan2(this.velocities[k+1],this.velocities[k]);}
    for(let i=0;i<Math.floor((impact?12:8)*density);i++)this.emitFragment(position,impact?5:3);
  }
  update(dt,time,position,phase,config=this.config,bladeBase=null,bladeTip=null){
    if(this.disposed)return;this.material.uniforms.uColor.value.set(config.swordColor||config.frostColor||'#39dfff');this.shardMaterial.uniforms.uCyan.value.copy(this.material.uniforms.uColor.value);
    const charge=phase==='gather'||phase==='charge',flight=phase==='flight'||phase==='launch'||phase==='slash';
    if(charge||flight){this.accumulator+=dt*(charge?95:140)*(config.particleDensity??1);const count=Math.floor(this.accumulator);this.accumulator-=count;
      for(let j=0;j<count;j++){const f=(j+1)/Math.max(1,count);this.sample.copy(position);if(this.hasPrevious&&flight)this.sample.lerpVectors(this.previous,position,f);if(bladeBase&&bladeTip&&charge)this.sample.lerpVectors(bladeBase,bladeTip,this.random(.15,.9));if(flight)this.sample.x-=.25;
        this.emit(this.sample,charge?0:this.random()<.19?4:2);if(flight&&this.random()<.15){if(bladeBase&&bladeTip)this.sample.lerpVectors(bladeBase,bladeTip,this.random()<.5?this.random(0,.14):this.random(.86,1));this.emitFragment(this.sample,3);}}}
    this.previous.copy(position);this.hasPrevious=true;
    for(let i=0;i<this.capacity;i++){if(!this.lives[i])continue;this.ages[i]+=dt;const t=this.ages[i]/this.lives[i],k=i*3,role=this.roles[i];if(t>=1){this.lives[i]=0;this.opacities[i]=0;this.sizes[i]=0;continue;}
      if(role===0){const a=this.angles[i]+t*5.5,r=this.radii[i]*(1-t)*(1-t);this.positions[k]=this.anchors[k]+Math.cos(a)*r*.6;this.positions[k+1]=this.anchors[k+1]+Math.sin(a)*r;this.positions[k+2]=this.anchors[k+2]+Math.cos(a)*r;}
      else{const drag=Math.max(0,1-dt*(role===4?3.5:1.2));this.velocities[k]*=drag;this.velocities[k+2]*=drag;this.velocities[k+1]-=dt*(role===6?2.1:.5);this.positions[k]+=this.velocities[k]*dt;this.positions[k+1]+=this.velocities[k+1]*dt;this.positions[k+2]+=this.velocities[k+2]*dt;}
      this.rotations[i]+=this.spins[i]*dt;this.opacities[i]=Math.min(1,t*15)*Math.pow(1-t,role===4?.7:1.35)*.8;
    }
    for(let i=0;i<this.shardCapacity;i++){const d=this.fragments[i];if(!d.life)continue;d.age+=dt;const t=d.age/d.life;if(t>=1){d.life=0;this.shardFades[i]=0;this.shards.setMatrixAt(i,this.zero);continue;}d.velocity.y-=dt*(d.role===5?2.4:.9);d.position.addScaledVector(d.velocity,dt);d.rotation.x+=d.spin.x*dt;d.rotation.y+=d.spin.y*dt;d.rotation.z+=d.spin.z*dt;this.dummy.position.copy(d.position);if(d.role===3){this.fragmentDirection.copy(d.velocity).normalize();this.dummy.quaternion.setFromUnitVectors(this.fragmentAxis,this.fragmentDirection);this.dummy.rotateX(d.rotation.x);this.dummy.rotateZ(d.rotation.z*.12);}else this.dummy.rotation.copy(d.rotation);const s=d.size*(1-t*.65);this.dummy.scale.set(s*(d.role===3?1.6:1.25),s*(d.role===3?.5:.72),s*.65);this.dummy.updateMatrix();this.shards.setMatrixAt(i,this.dummy.matrix);this.shardFades[i]=Math.pow(1-t,.9);}
    for(const attribute of Object.values(this.geometry.attributes))attribute.needsUpdate=true;this.shards.instanceMatrix.needsUpdate=true;this.shardGeometry.attributes.aFade.needsUpdate=true;this.shardGeometry.attributes.aHue.needsUpdate=true;this.shardGeometry.attributes.aEnergy.needsUpdate=true;
  }
  reset(){this.seed=7719;this.cursor=0;this.shardCursor=0;this.accumulator=0;this.hasPrevious=false;this.lives.fill(0);this.opacities.fill(0);this.sizes.fill(0);this.shardFades.fill(0);for(let i=0;i<this.shardCapacity;i++){this.fragments[i].life=0;this.shards.setMatrixAt(i,this.zero);}this.shards.instanceMatrix.needsUpdate=true;this.shardGeometry.attributes.aFade.needsUpdate=true;for(const a of Object.values(this.geometry.attributes))a.needsUpdate=true;}
  dispose(){if(this.disposed)return;this.disposed=true;this.points.removeFromParent();this.shards.removeFromParent();this.geometry.dispose();this.material.dispose();this.shardGeometry.dispose();this.shardMaterial.dispose();}
}
