import * as T from 'three';
import {heightAt} from './GameData.js';
import {GEAR_RARITIES} from './GearData.js';
import {equipmentProfile} from './EquipmentCatalog.js';
import {LootFlare} from './LootFlare.js';

const CAP=96;
/** Fifteen actual item silhouettes; instanced pools share textures and never spawn real lights. */
export class GameLootVFX{
 constructor(scene,state,templates={},camera=null){
  this.state=state;this.camera=camera;this.group=new T.Group();scene.add(this.group);this.dummy=new T.Object3D();this.color=new T.Color();this.buckets=new Map();this.visibleDrops=[];this.flare=new LootFlare(this.group,camera);
  for(const [id,root]of Object.entries(templates)){
   root.updateWorldMatrix(true,true);const parts=[],bounds=new T.Box3().setFromObject(root),clearance=-bounds.min.z;
   root.traverse(o=>{if(!o.isMesh)return;const geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);geo.setAttribute('aLootTint',new T.InstancedBufferAttribute(new Float32Array(CAP*3),3));const material=(Array.isArray(o.material)?o.material[0]:o.material).clone();material.onBeforeCompile=shader=>{shader.vertexShader='attribute vec3 aLootTint;varying vec3 vLootTint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLootTint=aLootTint;');shader.fragmentShader='varying vec3 vLootTint;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','float rim=pow(clamp(1.-abs(dot(normalize(normal),normalize(vViewPosition))),0.,1.),3.);outgoingLight=max(outgoingLight,diffuseColor.rgb*.65)+vLootTint*rim*.25;\n#include <opaque_fragment>');};material.customProgramCacheKey=()=>'ground-equipment-v2';
    const mesh=new T.InstancedMesh(geo,material,CAP);mesh.count=0;mesh.frustumCulled=false;mesh.visible=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.group.add(mesh);parts.push(mesh);
   });this.buckets.set(id,{parts,count:0,clearance});
  }
  const beamGeo=new T.CylinderGeometry(.025,.07,1,6,1,true);beamGeo.setAttribute('aTint',new T.InstancedBufferAttribute(new Float32Array(CAP*3),3));
  this.beams=new T.InstancedMesh(beamGeo,new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,blending:T.AdditiveBlending,vertexShader:'attribute vec3 aTint;varying vec3 vTint;varying vec2 vUv;void main(){vTint=aTint;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vTint;varying vec2 vUv;void main(){float core=pow(max(0.,sin(vUv.x*3.14159)),3.);float a=pow(1.-vUv.y,2.)*(.08+core*.09);gl_FragColor=vec4(vTint*1.7,a);}'}),CAP);this.beams.count=0;this.beams.frustumCulled=false;this.group.add(this.beams);
 }
 handle(event){if(event.type==='gearDrop'||event.type==='gearLand')this.flare.emit(event);}
 update(dt=0){
  this.visibleDrops.length=0;for(const bucket of this.buckets.values())bucket.count=0;let beams=0;
  for(const d of this.state.drops){if(!d.alive||!d.gear||this.visibleDrops.length>=CAP||Math.hypot(d.x-this.state.player.x,d.z-this.state.player.z)>40)continue;
   d.modelId ||=equipmentProfile(d.gear,this.state.kind).id;const bucket=this.buckets.get(d.modelId);if(!bucket)continue;this.visibleDrops.push(d);const rarity=d.gear.rarity,flight=d.flight||.7,t=Math.min(1,d.age/flight),size=(d.gear.slot==='wings'?1.15:d.gear.slot==='weapon'?1.02:.77)*(1+rarity*.035),seed=d.seed||d.lootId*.7,clearance=bucket.clearance*size+.015;
   this.color.set(GEAR_RARITIES[rarity].color);this.dummy.position.set(d.x,(d.y??heightAt(d.x,d.z)+.14)-.14+clearance,d.z);this.dummy.rotation.set(-Math.PI/2*t+Math.sin(seed)*.7*(1-t),seed+(1-t)*Math.PI*2,Math.cos(seed)*.6*(1-t),'YXZ');this.dummy.scale.setScalar(size);this.dummy.updateMatrix();for(const mesh of bucket.parts){mesh.setMatrixAt(bucket.count,this.dummy.matrix);this.color.toArray(mesh.geometry.attributes.aLootTint.array,bucket.count*3);}bucket.count++;
   if(t>=1&&rarity>0&&beams<CAP){const h=rarity===2?1.9:1.2;this.dummy.position.set(d.x,heightAt(d.x,d.z)+h*.5,d.z);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(1,h,1);this.dummy.updateMatrix();this.beams.setMatrixAt(beams,this.dummy.matrix);this.color.toArray(this.beams.geometry.attributes.aTint.array,beams++*3);}
  }
  for(const bucket of this.buckets.values())for(const mesh of bucket.parts){mesh.count=bucket.count;mesh.visible=bucket.count>0;if(bucket.count){mesh.instanceMatrix.needsUpdate=true;mesh.geometry.attributes.aLootTint.needsUpdate=true;}}
  this.beams.count=beams;this.beams.instanceMatrix.needsUpdate=beams>0;this.beams.geometry.attributes.aTint.needsUpdate=beams>0;
  this.flare.update(dt);
 }
 dispose(){this.group.traverse(o=>{if(o.isMesh){if(o.isInstancedMesh)o.dispose();o.geometry.dispose();o.material.dispose();}});this.group.removeFromParent();}
}
