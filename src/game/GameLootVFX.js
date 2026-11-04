import * as T from 'three';
import { heightAt } from './GameData.js';
import { GEAR_RARITIES } from './GearData.js';
/** Bounded ground markers represent real uncollected items only. */
export class GameLootVFX{
  constructor(scene,state){
    this.state=state;this.group=new T.Group();scene.add(this.group);this.dummy=new T.Object3D();this.color=new T.Color();
    const geo=new T.OctahedronGeometry(1,0);geo.setAttribute('aTint',new T.InstancedBufferAttribute(new Float32Array(96*3),3));
    this.gems=new T.InstancedMesh(geo,new T.ShaderMaterial({vertexShader:'attribute vec3 aTint;varying vec3 vTint,vNormal;void main(){vTint=aTint;vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vTint,vNormal;void main(){float facet=.3+max(0.,dot(normalize(vNormal),normalize(vec3(.3,.8,.5))))*.7;gl_FragColor=vec4(vTint*(facet+1.1),1.);}'}),96);this.gems.frustumCulled=false;this.group.add(this.gems);
    const beamGeo=new T.CylinderGeometry(.08,.32,1,6,1,true);beamGeo.setAttribute('aTint',geo.getAttribute('aTint'));
    this.beams=new T.InstancedMesh(beamGeo,new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,vertexShader:'attribute vec3 aTint;varying vec3 vTint;varying vec2 vUv;void main(){vTint=aTint;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vTint;varying vec2 vUv;void main(){float a=pow(1.-vUv.y,2.)*.3;gl_FragColor=vec4(vTint*1.5,a);}'}),96);this.beams.frustumCulled=false;this.group.add(this.beams);this.gems.count=this.beams.count=0;
  }
  update(){let count=0;const t=this.state.time;for(const d of this.state.drops){if(!d.alive||!d.gear||count>=96||Math.hypot(d.x-this.state.player.x,d.z-this.state.player.z)>48)continue;const rarity=d.gear.rarity,h=heightAt(d.x,d.z);this.color.set(GEAR_RARITIES[rarity].color);this.color.toArray(this.gems.geometry.attributes.aTint.array,count*3);this.dummy.position.set(d.x,h+.24+Math.sin(t*2.5+count)*.055,d.z);this.dummy.rotation.set(.2,t*.7,0);this.dummy.scale.set(.1+rarity*.025,.18+rarity*.04,.1+rarity*.025);this.dummy.updateMatrix();this.gems.setMatrixAt(count,this.dummy.matrix);this.dummy.position.y=h+.45+rarity*.18;this.dummy.rotation.set(0,0,0);this.dummy.scale.set(1+rarity*.2,.9+rarity*.36,1+rarity*.2);this.dummy.updateMatrix();this.beams.setMatrixAt(count++,this.dummy.matrix);}this.gems.count=this.beams.count=count;this.gems.instanceMatrix.needsUpdate=this.beams.instanceMatrix.needsUpdate=true;this.gems.geometry.attributes.aTint.needsUpdate=true;}
  dispose(){for(const m of [this.gems,this.beams]){m.geometry.dispose();m.material.dispose();}this.group.removeFromParent();}
}
