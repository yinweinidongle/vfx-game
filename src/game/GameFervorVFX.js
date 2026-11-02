import * as T from 'three';
import { fervorSource } from './GameFervorVolley.js';
import { MAX_FERVOR } from './AttackGrowth.js';

/** Faceted, double-tapered needles: no fins, sword guards or broad glyph plates. */
export function fervorGeometry(kind){
  const radius=kind==='ice'?.019:kind==='sword'?.016:.021;
  const profile=[[-.52,0],[-.4,radius*.6],[-.29,radius],[.27,radius*.78],[.5,radius*.32],[.68,0]];
  const vertices=[],uv=[];const sides=6;
  for(let j=0;j<profile.length-1;j++)for(let k=0;k<sides;k++){
    const next=(k+1)%sides;
    for(const [row,side] of [[j,k],[j,next],[j+1,k],[j,next],[j+1,next],[j+1,k]]){
      const [y,r]=profile[row],angle=side/sides*Math.PI*2;vertices.push(Math.cos(angle)*r,y,Math.sin(angle)*r);uv.push(side/sides,(y+.52)/1.2);
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}

const material=()=>new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
  uniforms:{uTime:{value:0}},
  vertexShader:`attribute vec3 aTint;attribute float aPresence,aPulse;varying vec3 vTint,vN,vEye,vLocal;varying float vAlpha,vPulse;
    void main(){vTint=aTint;vAlpha=aPresence;vPulse=aPulse;vLocal=position;
    vec4 eye=modelViewMatrix*instanceMatrix*vec4(position,1.);vEye=-eye.xyz;
    vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);gl_Position=projectionMatrix*eye;}`,
  fragmentShader:`uniform float uTime;varying vec3 vTint,vN,vEye,vLocal;varying float vAlpha,vPulse;
    void main(){float nearFade=smoothstep(.32,1.05,length(vEye));if(vAlpha*nearFade<.005)discard;
    float rim=pow(1.-abs(dot(normalize(vN),normalize(vEye))),2.3);
    float spine=exp(-abs(vLocal.x)*240.)*smoothstep(-.38,-.1,vLocal.y);
    float scan=pow(max(0.,sin(vLocal.y*22.-uTime*9.)),18.);
    float etch=pow(max(0.,cos(vLocal.y*70.+abs(vLocal.x)*80.)),28.)*smoothstep(.006,.014,abs(vLocal.x));
    float light=.25+rim*.9+scan*.22+etch*.35;
    vec3 tint=vTint*light+mix(vTint,vec3(.8,1.,1.),.75)*spine*2.2;
    tint+=mix(vTint,vec3(1.),.55)*vPulse*(.3+spine*.7);
    gl_FragColor=vec4(tint,(.78+rim*.2)*vAlpha*nearFade);}`,
});

export class GameFervorVFX{
  constructor(parent,state,trails){
    this.state=state;this.trails=trails;this.group=new T.Group();parent.add(this.group);
    this.dummy=new T.Object3D();this.color=new T.Color();this.direction=new T.Vector3();this.up=new T.Vector3(0,1,0);this.socket={};
    this.newFrom=MAX_FERVOR;this.upgradeAge=100;
    this.formation=this.makePool(MAX_FERVOR);this.flight=this.makePool(state.projectiles.length);
  }
  makePool(capacity){
    const g=fervorGeometry(this.state.kind);
    for(const [name,size] of [['aTint',3],['aPresence',1],['aPulse',1]])g.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(capacity*size),size).setUsage(T.DynamicDrawUsage));
    const mesh=new T.InstancedMesh(g,material(),capacity);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;mesh.renderOrder=3;this.group.add(mesh);return mesh;
  }
  handle(event){if(event.type==='fervorUpgrade'){this.newFrom=event.from;this.upgradeAge=0;}if(event.type==='revive')this.upgradeAge=100;}
  write(mesh,index,alpha,pulse){
    this.dummy.updateMatrix();mesh.setMatrixAt(index,this.dummy.matrix);
    this.color.toArray(mesh.geometry.attributes.aTint.array,index*3);
    mesh.geometry.attributes.aPresence.array[index]=alpha;mesh.geometry.attributes.aPulse.array[index]=pulse;
  }
  update(dt){
    const s=this.state,g=s.growth,t=s.time,p=s.player;this.upgradeAge+=dt;
    const pulse=Math.max(0,1-this.upgradeAge/2.8)*(1+.4*Math.sin(this.upgradeAge*12));
    this.color.set(g.color);this.formation.count=s.dead?0:g.stacks;
    for(let i=0;i<this.formation.count;i++){
      fervorSource(i,t,p,this.socket);
      const recharge=Math.min(1,Math.max(0,(t-s.fervorVolley.firedAt[i]-.1)/.5));
      const born=i>=this.newFrom?pulse:0;
      this.dummy.position.set(this.socket.x,this.socket.y,this.socket.z);this.dummy.rotation.set(-.18,p.yaw,this.socket.tilt,'YXZ');
      this.dummy.scale.setScalar(.78*(.65+recharge*.35)*(1+born*.14));
      this.write(this.formation,i,.25+recharge*.75,born*1.7);
    }
    let count=0;
    for(const b of s.projectiles){
      const drain=this.trails.age[b.id],consuming=!b.alive&&b.retiredReason==='hit'&&drain<.075;
      if(!b.fervor||(!b.alive&&!consuming)||b.age<b.delay)continue;
      this.trails.getDirection(b.id,this.direction);this.dummy.position.set(b.x,b.y,b.z);
      this.dummy.quaternion.setFromUnitVectors(this.up,this.direction);this.dummy.scale.setScalar(b.finisher?.82:.62);
      if(consuming)this.dummy.scale.y*=Math.max(.001,1-drain/.075);
      this.color.set(b.color);this.write(this.flight,count++,1,b.finisher?.9:.25);
    }
    this.flight.count=count;
    for(const mesh of [this.formation,this.flight]){mesh.material.uniforms.uTime.value=t;mesh.instanceMatrix.needsUpdate=true;for(const a of Object.values(mesh.geometry.attributes))if(a.isInstancedBufferAttribute)a.needsUpdate=true;}
  }
  dispose(){for(const mesh of [this.formation,this.flight]){mesh.geometry.dispose();mesh.material.dispose();}this.group.removeFromParent();}
}
