import * as T from 'three';
import { heightAt } from './GameData.js';

/** Thin spatial rune arcs accompany spell casts and wrap the moving ice arrow.
 * They are tubes with depth, never camera-sized transparent cards. */
export class GameSkillResonance{
  constructor(parent,state,trails){
    this.state=state;this.trails=trails;this.casts=Array.from({length:8},()=>({alive:false}));
    this.dummy=new T.Object3D();this.axis=new T.Vector3(0,0,1);this.direction=new T.Vector3();this.roll=new T.Quaternion();this.color=new T.Color();
    const geometry=new T.TorusGeometry(.115,.0035,4,48,Math.PI*.72);
    this.tint=new Float32Array(128*3);this.alpha=new Float32Array(128);
    geometry.setAttribute('aTint',new T.InstancedBufferAttribute(this.tint,3));geometry.setAttribute('aAlpha',new T.InstancedBufferAttribute(this.alpha,1));
    const material=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,
      vertexShader:`attribute vec3 aTint;attribute float aAlpha;varying vec3 vTint;varying float vAlpha,vDepth;void main(){vTint=aTint;vAlpha=aAlpha;vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);vDepth=length(p.xyz);gl_Position=projectionMatrix*p;}`,
      fragmentShader:`varying vec3 vTint;varying float vAlpha,vDepth;void main(){float a=vAlpha*smoothstep(.25,1.,vDepth);if(a<.003)discard;gl_FragColor=vec4(vTint*1.3,a);}`});
    this.mesh=new T.InstancedMesh(geometry,material,128);this.mesh.frustumCulled=false;this.mesh.renderOrder=3;this.mesh.count=0;parent.add(this.mesh);
  }
  handle(event){
    if(event.type==='revive')for(const c of this.casts)c.alive=false;
    if(event.type!=='cast'||!event.spiritLevel)return;
    const c=this.casts.find(c=>!c.alive)||this.casts[0],p=this.state.player,hand=event.index===0?this.state.attackSocket:null;
    Object.assign(c,{alive:true,age:0,x:hand?.x??p.x+Math.sin(p.yaw)*.7,y:hand?.y??heightAt(p.x,p.z)+1.35,z:hand?.z??p.z+Math.cos(p.yaw)*.7,yaw:p.yaw,level:event.spiritLevel,stage:event.skillStage,color:event.skillAccent});
  }
  write(index,alpha){this.dummy.updateMatrix();this.mesh.setMatrixAt(index,this.dummy.matrix);this.color.toArray(this.tint,index*3);this.alpha[index]=alpha;}
  update(dt){
    const time=this.state.time;let count=0;
    for(const c of this.casts)if(c.alive){
      c.age+=dt;if(c.age>.65){c.alive=false;continue;}
      this.color.set(c.color);
      for(let i=0;i<Math.min(3,c.stage);i++){
        this.dummy.position.set(c.x,c.y,c.z);this.dummy.rotation.set(0,c.yaw,c.age*(i%2?-6:6)+i*2,'YXZ');
        this.dummy.scale.setScalar((1.1+c.stage*.13+i*.36)*(1+c.age*.65));this.write(count++,(1-c.age/.65)*.65);
      }
    }
    for(const p of this.state.projectiles){
      if(!p.alive||p.kind!=='frost'||!p.spiritLevel||p.age<p.delay)continue;
      this.color.set(p.skillAccent);this.trails.getDirection(p.id,this.direction);
      const n=p.echo?1:Math.min(4,1+Math.floor(p.spiritLevel/10));
      for(let i=0;i<n&&count<128;i++){
        this.dummy.position.set(p.x,p.y,p.z).addScaledVector(this.direction,-.12-i*.16);
        this.dummy.quaternion.setFromUnitVectors(this.axis,this.direction).multiply(this.roll.setFromAxisAngle(this.axis,time*(i%2?-5:5)+i*1.5));
        this.dummy.scale.setScalar((.8+i*.07+p.spiritLevel*.003)*p.scale);this.write(count++,(p.echo?.2:.4)+Math.sin(time*8+i)*.04);
      }
    }
    this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;this.mesh.geometry.attributes.aTint.needsUpdate=this.mesh.geometry.attributes.aAlpha.needsUpdate=true;
  }
  dispose(){this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh.removeFromParent();}
}
