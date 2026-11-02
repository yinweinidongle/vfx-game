import * as THREE from 'three';

/** An asymmetric, closed crystal with a bevelled waist and sharp ends. */
export function createCrystalGeometry() {
  const rings = [[-.34,.14],[-.12,.25],[.23,.13]];
  const verts = [[0,-.7,0]];
  for (const [y,r] of rings) for(let i=0;i<4;i++) { const a=i*Math.PI/2+Math.PI/4; verts.push([Math.cos(a)*r,y,Math.sin(a)*r*.62]); }
  verts.push([.045,.85,0]);
  const pos=[];
  const tri=(a,b,c)=>pos.push(...verts[a],...verts[b],...verts[c]);
  for(let i=0;i<4;i++){
    const j=(i+1)%4;
    tri(0,1+j,1+i);
    for(let r=0;r<2;r++){const a=1+r*4+i,b=1+r*4+j,c=1+(r+1)*4+i,d=1+(r+1)*4+j;tri(a,b,c);tri(b,d,c);}
    tri(9+i,9+j,13);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();return g;
}

export function createCrystalMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(color)}}, transparent:true, depthWrite:false, side:THREE.DoubleSide,
    vertexShader:`attribute float aFade; varying vec3 vN; varying vec3 vV; varying float vFade; varying vec3 vP;
      void main(){vec4 p=instanceMatrix*vec4(position,1.);vec4 view=modelViewMatrix*p; vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);vV=normalize(-view.xyz);vFade=aFade;vP=position; gl_Position=projectionMatrix*view;}`,
    fragmentShader:`uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vFade; varying vec3 vP;
      void main(){if(vFade<=0.)discard;vec3 n=normalize(vN); float fr=pow(max(0.,1.-abs(dot(n,normalize(vV)))),2.2);float facet=pow(max(0.,dot(n,normalize(vec3(.3,1.,.8)))),5.);float band=smoothstep(.11,.15,abs(vP.x)); vec3 c=uColor*(.25+facet*.8)+vec3(.66,.92,1.)*(fr*.8+facet*.22+band*.15);gl_FragColor=vec4(c,clamp((.56+fr*.4)*vFade,0.,1.));}`,
  });
}

export class FrostParticles {
  constructor(scene,config){
    this.config=config;this.capacity=1000;this.cursor=0;this.accumulator=0;this.last=new THREE.Vector3();this.hasLast=false;this.center=new THREE.Vector3();this.color=new THREE.Color();
    const n=this.capacity;
    this.positions=new Float32Array(n*3);this.anchors=new Float32Array(n*3);this.velocities=new Float32Array(n*3);this.ages=new Float32Array(n);this.lives=new Float32Array(n);this.sizes=new Float32Array(n);this.rotations=new Float32Array(n);this.spins=new Float32Array(n);this.opacities=new Float32Array(n);this.types=new Float32Array(n);this.modes=new Uint8Array(n);this.radii=new Float32Array(n);this.angles=new Float32Array(n);this.heights=new Float32Array(n);
    this.geometry=new THREE.BufferGeometry();
    for(const [name,array,size] of [['position',this.positions,3],['aSize',this.sizes,1],['aRotation',this.rotations,1],['aOpacity',this.opacities,1],['aType',this.types,1]])this.geometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
    this.material=new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(config.frostColor)},uPixels:{value:Math.min(window.devicePixelRatio||1,2)*650}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`attribute float aSize; attribute float aRotation; attribute float aOpacity; attribute float aType; varying float vRotation;varying float vOpacity;varying float vType;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(aSize*uPixels/max(.5,-mv.z),0.,48.);vRotation=aRotation;vOpacity=aOpacity;vType=aType;}`.replace('attribute float aSize;', 'uniform float uPixels; attribute float aSize;'),
      fragmentShader:`uniform vec3 uColor;varying float vRotation;varying float vOpacity;varying float vType;
        void main(){vec2 p=gl_PointCoord-.5;float c=cos(vRotation),s=sin(vRotation);p=mat2(c,-s,s,c)*p;float r=length(p);float a=atan(p.y,p.x);float alpha=0.;
          if(vType<.5){alpha=exp(-r*r*26.)*(1.-smoothstep(.25,.5,r));}
          else if(vType<1.5){float rays=pow(abs(cos(a*3.)),20.);float branches=pow(abs(cos(a*3.+r*18.)),12.)*.4;alpha=(rays+branches)*(1.-smoothstep(.08,.46,r))*(1.-smoothstep(.36,.5,r))+exp(-r*r*170.)*.4;}
          else{float star=pow(abs(cos(a*2.)),30.);alpha=star*(1.-smoothstep(.02,.48,r))+exp(-r*r*130.);}
          if(alpha*vOpacity<.008)discard;gl_FragColor=vec4(mix(uColor,vec3(.83,.98,1.),.55)*1.3,alpha*vOpacity);}`,
    });
    this.points=new THREE.Points(this.geometry,this.material);this.points.frustumCulled=false;this.points.renderOrder=7;scene.add(this.points);
    this.shardCapacity=160;this.shardCursor=0;
    this.shardGeometry=createCrystalGeometry();this.shardFade=new Float32Array(this.shardCapacity);this.shardGeometry.setAttribute('aFade',new THREE.InstancedBufferAttribute(this.shardFade,1));
    this.shardMaterial=createCrystalMaterial(config.frostColor);this.shards=new THREE.InstancedMesh(this.shardGeometry,this.shardMaterial,this.shardCapacity);this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shards.frustumCulled=false;this.shards.renderOrder=4;scene.add(this.shards);
    this.shardData=Array.from({length:this.shardCapacity},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),rotation:new THREE.Euler(),spin:new THREE.Vector3(),age:0,life:0,size:0}));this.dummy=new THREE.Object3D();this.zero=new THREE.Matrix4().makeScale(0,0,0);
    this.reset();
  }
  random(a=0,b=1){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return a+(b-a)*(this.seed/4294967296);}
  emit(x,y,z,mode=0){
    const i=this.cursor++%this.capacity,k=i*3;this.ages[i]=0;this.lives[i]=this.random(.38,.9);this.sizes[i]=this.random(.025,.11);this.rotations[i]=this.random()*6.28;this.spins[i]=this.random(-3,3);this.types[i]=this.random()<.24?1:(this.random()<.04?2:0);if(this.types[i]===2)this.sizes[i]*=1.7;
    this.positions[k]=x;this.positions[k+1]=y;this.positions[k+2]=z;this.anchors[k]=x;this.anchors[k+1]=y;this.anchors[k+2]=z;this.velocities[k]=this.random(-1.8,-.3);this.velocities[k+1]=this.random(-.4,.6);this.velocities[k+2]=this.random(-.55,.55);this.modes[i]=mode;
    if(mode===1){this.lives[i]=this.random(.17,.37);this.angles[i]=this.random()*Math.PI*2;this.radii[i]=this.random(.7,1.55);this.heights[i]=this.random(-.85,.85);this.sizes[i]*=.9;}
    return i;
  }
  emitShard(x,y,z,burst=false){
    const i=this.shardCursor++%this.shardCapacity,d=this.shardData[i];d.position.set(x,y,z);d.velocity.set(this.random(-3,-1),this.random(-.3,1),this.random(-.8,.8));if(burst)d.velocity.multiplyScalar(2.2);d.rotation.set(this.random()*6.28,this.random()*6.28,this.random()*6.28);d.spin.set(this.random(-6,6),this.random(-5,5),this.random(-8,8));d.age=0;d.life=this.random(.35,.8);d.size=this.random(.06,.18)*(burst?1.25:1);
  }
  burst(position,kind,config=this.config){
    const impact=kind==='impact';const n=Math.floor((impact?75:42)*config.particleDensity);
    for(let j=0;j<n;j++){const i=this.emit(position.x,position.y,position.z),k=i*3;const a=this.random()*Math.PI*2,b=this.random(-1,1),r=Math.sqrt(1-b*b),s=this.random(impact?2:3,impact?7:9);this.velocities[k]=impact?r*Math.cos(a)*s:-s;this.velocities[k+1]=b*s;this.velocities[k+2]=r*Math.sin(a)*s*(impact?1:.33);this.lives[i]=this.random(.3,impact?.9:.55);this.sizes[i]*=1.15;}
    if(!impact)for(let j=0;j<Math.floor(15*config.particleDensity);j++)this.emitShard(position.x,position.y,position.z,true);
  }
  update(dt,time,position,phase,config=this.config){
    this.center.copy(position);this.material.uniforms.uColor.value.set(config.frostColor);this.shardMaterial.uniforms.uColor.value.set(config.frostColor);
    const gathering=phase==='gather'||phase==='charge';const flying=phase==='launch'||phase==='flight';
    if(gathering||flying){this.accumulator+=dt*(gathering?100:160)*config.particleDensity;const count=Math.floor(this.accumulator);this.accumulator-=count;for(let j=0;j<count;j++){const f=(j+1)/Math.max(1,count);const x=this.hasLast?THREE.MathUtils.lerp(this.last.x,position.x,f):position.x;const y=this.hasLast?THREE.MathUtils.lerp(this.last.y,position.y,f):position.y;const z=this.hasLast?THREE.MathUtils.lerp(this.last.z,position.z,f):position.z;this.emit(x-(flying?.75:0),y,z,gathering?1:0);if(flying&&this.random()<.12)this.emitShard(x-.9,y,z);}}
    this.last.copy(position);this.hasLast=true;
    for(let i=0;i<this.capacity;i++){
      if(this.lives[i]===0)continue;this.ages[i]+=dt;const t=this.ages[i]/this.lives[i],k=i*3;if(t>=1){this.lives[i]=0;this.opacities[i]=0;this.sizes[i]=0;continue;}
      if(this.modes[i]===1){const a=this.angles[i]+t*5,r=this.radii[i]*(1-t);this.positions[k]=this.anchors[k]+Math.cos(a)*r*.65;this.positions[k+1]=this.anchors[k+1]+Math.sin(a)*r;this.positions[k+2]=this.anchors[k+2]+Math.cos(a)*r;}
      else{const drag=Math.max(0,1-dt*1.4);this.velocities[k]*=drag;this.velocities[k+1]-=dt*.5;this.velocities[k+2]*=drag;this.positions[k]+=this.velocities[k]*dt;this.positions[k+1]+=this.velocities[k+1]*dt;this.positions[k+2]+=this.velocities[k+2]*dt;}
      this.rotations[i]+=this.spins[i]*dt;this.opacities[i]=Math.min(1,t*12)*Math.pow(1-t,1.4)*.75;
    }
    for(const a of Object.values(this.geometry.attributes))a.needsUpdate=true;
    for(let i=0;i<this.shardCapacity;i++){const d=this.shardData[i];if(!d.life)continue;d.age+=dt;const t=d.age/d.life;if(t>=1){d.life=0;this.shardFade[i]=0;this.shards.setMatrixAt(i,this.zero);continue;}d.velocity.y-=dt*1.8;d.position.addScaledVector(d.velocity,dt);d.rotation.x+=d.spin.x*dt;d.rotation.y+=d.spin.y*dt;d.rotation.z+=d.spin.z*dt;this.dummy.position.copy(d.position);this.dummy.rotation.copy(d.rotation);this.dummy.scale.setScalar(d.size*(1-t*.4));this.dummy.updateMatrix();this.shards.setMatrixAt(i,this.dummy.matrix);this.shardFade[i]=Math.min(1,t*15)*(1-t);}
    this.shards.instanceMatrix.needsUpdate=true;this.shardGeometry.attributes.aFade.needsUpdate=true;
  }
  reset(){this.seed=1743;this.cursor=0;this.shardCursor=0;this.lives.fill(0);this.opacities.fill(0);this.sizes.fill(0);this.accumulator=0;this.hasLast=false;this.shardFade.fill(0);for(let i=0;i<this.shardCapacity;i++){this.shardData[i].life=0;this.shards.setMatrixAt(i,this.zero);}this.shards.instanceMatrix.needsUpdate=true;this.shardGeometry.attributes.aFade.needsUpdate=true;for(const a of Object.values(this.geometry.attributes))a.needsUpdate=true;}
  dispose(){this.points.removeFromParent();this.shards.removeFromParent();this.geometry.dispose();this.material.dispose();this.shardGeometry.dispose();this.shardMaterial.dispose();}
}
