import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GEAR_SLOTS,enhancementStyle } from './GearData.js';
import { equipmentProfile,VARIANT_IDS,equipmentModelPath } from './EquipmentCatalog.js';
import { GearDynamics } from './GearDynamics.js';
import { dressMaterial } from './GearMaterial.js';

/** Real equipment follows animated bones. Cloth and feathers use inertial control points on the GPU. */
export class GameGearAppearance{
 constructor(view,state,templates){
  this.view=view;this.state=state;this.templates=templates;this.parts=[];this.cache=new Map();this.drapeCache=new Map();this.revision=-1;this.time={value:0};this.lastTime=state.time;this.dynamics=new GearDynamics();this.inverse=new T.Matrix4();this.delta=new T.Matrix4();this.bindings={};this.tint=new T.Color();
  view.group.updateMatrixWorld(true);this.inverse.copy(view.pivot.matrixWorld).invert();
  for(const name of ['Spine2','Spine1','Hips','LeftArm','RightArm','LeftFoot','RightFoot','RightHand']){const bone=view.model.getObjectByName('mixamorig'+name);if(!bone)continue;const bind=new T.Matrix4().multiplyMatrices(this.inverse,bone.matrixWorld);this.bindings[name]={bone,worldInverse:bone.matrixWorld.clone().invert(),bindInverse:bind.clone().invert(),position:new T.Vector3().setFromMatrixPosition(bind)};}
 }
 static async load(){
  const loader=new GLTFLoader(),templates={};
  await Promise.all([...Object.keys(GEAR_SLOTS).map(slot=>slot+'-v1'),...VARIANT_IDS].map(async id=>{templates[id]=(await loader.loadAsync(`${import.meta.env.BASE_URL}${equipmentModelPath(id)}`)).scene;}));
  for(const slot of Object.keys(GEAR_SLOTS))templates[slot]=templates[slot+'-v1'];return templates;
 }
 drapeGeometry(mesh,matrix,box){
  const key=mesh.geometry.uuid+matrix.elements.join(',');let cached=this.drapeCache.get(key);if(cached)return cached;
  const geo=mesh.geometry.clone(),pos=geo.getAttribute('position'),coord=new Float32Array(pos.count*3),point=new T.Vector3(),centre=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
  for(let i=0;i<pos.count;i++){point.fromBufferAttribute(pos,i).applyMatrix4(matrix);coord[i*3]=(point.x-centre.x)/size.x;coord[i*3+1]=(box.max.y-point.y)/size.y;coord[i*3+2]=(point.z-centre.z)/size.z;}
  geo.setAttribute('aDrape',new T.BufferAttribute(coord,3));const transform=new T.Matrix3().setFromMatrix4(matrix).invert().multiply(new T.Matrix3().set(size.x,0,0,0,size.y,0,0,0,size.z));cached={geo,transform};this.drapeCache.set(key,cached);return cached;
 }
 add(slot,boneName,dimensions,offset=[0,0,0],mirror=false,profile){
  const binding=this.bindings[boneName];if(!binding)return;
  const id=profile?.id||slot+'-v1',key=`${slot}:${boneName}:${id}:${profile?.tier||0}`;let part=this.cache.get(key);
  if(part){this.view.pivot.add(part.carrier);part.carrier.visible=true;this.parts.push(part);return;}
  const source=this.templates[id]||this.templates[slot];if(!source)throw new Error('Missing equipment model: '+id);
  const root=source.clone(true),box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3()),centre=box.getCenter(new T.Vector3()),carrier=new T.Group(),fit=new T.Group(),matrices=new Map();
  let attachmentZ=offset[2];
  if(slot==='cloak'){
   // Generated capes have different collar depth. Fit the collar itself to the
   // shoulders, and make the hem curve away from the body instead of through it.
   let top=0,hem=0,tops=0,hems=0;const point=new T.Vector3();root.updateMatrixWorld(true);
   root.traverse(o=>{if(!o.isMesh)return;const pos=o.geometry.attributes.position;for(let i=0;i<pos.count;i++){point.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);if(point.y>box.max.y-size.y*.1){top+=point.z;tops++;}if(point.y<box.min.y+size.y*.3){hem+=point.z;hems++;}}});
   const flip=top/Math.max(1,tops)<hem/Math.max(1,hems);if(flip){root.rotation.y+=Math.PI;box.setFromObject(root);box.getCenter(centre);}
   const collarZ=(flip?-1:1)*top/Math.max(1,tops);attachmentZ=-.17-(collarZ-centre.z)/size.z*dimensions[2];
  }
  root.updateMatrixWorld(true);root.traverse(o=>{if(o.isMesh)matrices.set(o,o.matrixWorld.clone());});
  fit.scale.set(dimensions[0]/size.x*(mirror?-1:1),dimensions[1]/size.y,dimensions[2]/size.z);root.position.sub(centre);fit.add(root);carrier.add(fit);
  const at=binding.position.clone().add(new T.Vector3(offset[0],offset[1],attachmentZ)),rest=new T.Matrix4().makeTranslation(at.x,at.y,at.z);
  if(slot==='weapon'&&boneName==='RightHand'){const local=new T.Matrix4().compose(new T.Vector3(.35,7.3,2.45),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-Math.PI/2),new T.Vector3().setScalar(1/this.view.sourceScale));rest.copy(binding.bindInverse).invert().multiply(local);fit.position.y=dimensions[1]*.32;}
  carrier.matrixAutoUpdate=false;carrier.matrix.copy(rest);this.view.pivot.add(carrier);
  const energy={tint:{value:new T.Color()},power:{value:0},rank:{value:0},time:this.time},materials=[];
  root.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;o.frustumCulled=false;let drape=null;if(slot==='cloak'||slot==='wings'){
   const cached=this.drapeGeometry(o,matrices.get(o),box);o.geometry=cached.geo;
   // Inertia bends a garment in proportion to its length, not its very thin depth.
   drape=cached.transform.clone().multiply(new T.Matrix3().set(1,0,0,0,1,0,0,0,dimensions[1]/dimensions[2]));
  }materials.push(...dressMaterial(o,slot,energy,this.dynamics,drape));});
  part={slot,profile,carrier,fit,binding,rest,energy,materials,skinned:[]};if(slot==='armor')this.skinArmor(part);this.cache.set(key,part);this.parts.push(part);
 }
 addBow(profile){
  if(!this.view.archerRig||profile.id==='bow-base')return;
  const key='weapon:'+profile.id;let part=this.cache.get(key);
  if(!part){const source=this.templates[profile.id];if(!source)throw new Error('Missing bow model: '+profile.id);const carrier=source.clone(true),energy={tint:{value:new T.Color()},power:{value:0},rank:{value:0},time:this.time},materials=[];carrier.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;materials.push(...dressMaterial(o,'weapon',energy,this.dynamics,null));}});part={slot:'weapon',profile,carrier,energy,materials,skinned:[],bow:true};this.cache.set(key,part);}
  this.view.archerRig.installEquipment(part.carrier,profile.tier);this.parts.push(part);
 }
  skinArmor(part){
    const bindings=['Spine2','LeftArm','RightArm'].map(n=>this.bindings[n]);if(bindings.some(b=>!b))return;
    this.view.pivot.updateWorldMatrix(true,true);const pivotInverse=this.view.pivot.matrixWorld.clone().invert(),meshes=[];part.carrier.traverse(o=>{if(o.isMesh)meshes.push(o);});
    for(const mesh of meshes){
      const geo=mesh.geometry.clone(),positions=geo.getAttribute('position'),weights=new Float32Array(positions.count*4),indices=new Uint16Array(positions.count*4),toRest=new T.Matrix4().multiplyMatrices(pivotInverse,mesh.matrixWorld),point=new T.Vector3();
      for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i).applyMatrix4(toRest);
        const shoulder=T.MathUtils.smoothstep(Math.abs(point.x),.22,.38)*T.MathUtils.smoothstep(point.y,bindings[0].position.y-.015,bindings[0].position.y+.16);
        const left=(point.x>0)===(bindings[1].position.x>0);indices.set([0,left?1:2,0,0],i*4);weights.set([1-shoulder,shoulder,0,0],i*4);
      }
      geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geo.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
      const skinned=new T.SkinnedMesh(geo,mesh.material);skinned.position.copy(mesh.position);skinned.quaternion.copy(mesh.quaternion);skinned.scale.copy(mesh.scale);skinned.castShadow=true;skinned.receiveShadow=true;skinned.frustumCulled=false;
      const skeleton=new T.Skeleton(bindings.map(b=>b.bone),bindings.map(b=>b.worldInverse.clone()));skinned.bind(skeleton,toRest);mesh.parent.add(skinned);mesh.removeFromParent();part.skinned.push(skinned);
    }
  }
 clear(){for(const p of this.cache.values()){p.carrier.removeFromParent();for(const mesh of p.skinned){mesh.geometry.dispose();mesh.skeleton.dispose();}p.materials.forEach(m=>m.dispose());}this.parts.length=0;this.cache.clear();}
 rebuild(){
  for(const p of this.parts)p.carrier.removeFromParent();this.parts.length=0;this.view.archerRig?.restoreDefaultBow();
  const kind=this.state.kind,item=slot=>this.state.gear.find(this.state.save.gearEquipped[slot]);
  if(item('armor'))this.add('armor','Spine2',[.74,.69,.42],[0,-.085,.018],false,equipmentProfile(item('armor'),kind));
  if(item('boots'))for(const side of ['Left','Right'])this.add('boots',side+'Foot',[.205,.35,.34],[0,.04,.035],side==='Right',equipmentProfile(item('boots'),kind));
  if(item('wings')){const p=equipmentProfile(item('wings'),kind),n=p.tier;this.add('wings','Spine2',[[2.05,1.1,.22],[2.7,1.35,.24],[3.35,1.6,.27]][n],[0,.16,-.3],false,p);}
  if(item('cloak')){const p=equipmentProfile(item('cloak'),kind),dimensions=[[.78,1.13,.19],[1.05,1.3,.22],[1.35,1.45,.24]][p.tier];this.add('cloak','Spine2',dimensions,[0,.10-dimensions[1]*.5,-.29],false,p);}
  if(item('weapon')){const p=equipmentProfile(item('weapon'),kind),n=p.tier;if(kind==='sword')this.add('weapon','RightHand',[p.family==='dao'?.19+n*.035:.13+n*.025,1.45+n*.18,.08],[0,.57,0],false,p);else if(kind==='cultivator')this.add('weapon','Spine2',[.15+n*.02,1.4+n*.12,.075],[.29,-.08,-.43],false,p);else this.addBow(p);}
  if(this.view.weapon&&kind==='sword')this.view.weapon.visible=!item('weapon');
 }
 refresh(){
  const equipped=this.state.save.gearEquipped;const key=Object.keys(GEAR_SLOTS).map(slot=>{const g=this.state.gear.find(equipped[slot]);if(!g)return '';const p=equipmentProfile(g,this.state.kind);return p.id+':'+p.tier;}).join('|');
  if(key!==this.signature){this.rebuild();this.signature=key;}
  for(const p of this.parts){const item=this.state.gear.find(equipped[p.slot]);if(!item)continue;const style=enhancementStyle(item.enhance);p.energy.tint.value.set(style.from).lerp(this.tint.set(style.to),style.mix);p.energy.power.value=style.power;p.energy.rank.value=item.enhance;}
  const weapon=this.state.gear.find(equipped.weapon);this.weaponStyle=weapon?enhancementStyle(weapon.enhance):null;if(this.view.archerRig){if(this.weaponStyle){const f=this.weaponStyle;this.view.archerRig.string.material.color.set(f.from).lerp(this.tint.set(f.to),f.mix).multiplyScalar(1+f.power*.25);}else this.view.archerRig.string.material.color.setRGB(.8,1.35,1.6);}this.revision=this.state.gear.revision;
 }
 update(dt=this.state.time-this.lastTime){
  if(this.revision!==this.state.gear.revision)this.refresh();this.time.value=this.state.time;this.dynamics.update(dt,this.state.player,this.state.time);this.lastTime=this.state.time;
  this.view.pivot.updateWorldMatrix(true,true);this.inverse.copy(this.view.pivot.matrixWorld).invert();
  for(const p of this.parts){if(p.bow)continue;if(p.slot==='armor')p.carrier.matrix.copy(p.rest);else{this.delta.multiplyMatrices(this.inverse,p.binding.bone.matrixWorld).multiply(p.binding.bindInverse);p.carrier.matrix.multiplyMatrices(this.delta,p.rest);}p.carrier.matrixWorldNeedsUpdate=true;}
 }
 dispose(){this.clear();for(const {geo}of this.drapeCache.values())geo.dispose();this.drapeCache.clear();}
}
