import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GEAR_SLOTS,enhancementStyle } from './GearData.js';

/** Generated equipment is fitted in metre space, then follows the actual animated FBX bones. */
export class GameGearAppearance{
  constructor(view,state,templates){
    this.view=view;this.state=state;this.templates=templates;this.parts=[];this.revision=-1;this.time={value:0};this.inverse=new T.Matrix4();this.delta=new T.Matrix4();this.bindings={};this.tint=new T.Color();
    view.group.updateMatrixWorld(true);this.inverse.copy(view.pivot.matrixWorld).invert();
    for(const name of ['Spine2','Spine1','Hips','LeftArm','RightArm','LeftFoot','RightFoot','RightHand']){
      const bone=view.model.getObjectByName('mixamorig'+name);if(!bone)continue;
      const bind=new T.Matrix4().multiplyMatrices(this.inverse,bone.matrixWorld);
      this.bindings[name]={bone,worldInverse:bone.matrixWorld.clone().invert(),bindInverse:bind.clone().invert(),position:new T.Vector3().setFromMatrixPosition(bind)};
    }
  }
  static async load(){
    const loader=new GLTFLoader(),templates={};
    await Promise.all(Object.keys(GEAR_SLOTS).map(async slot=>{templates[slot]=(await loader.loadAsync(`${import.meta.env.BASE_URL}game/models/equipment/${slot}-v1.glb`)).scene;}));return templates;
  }
  add(slot,boneName,dimensions,offset=[0,0,0],mirror=false){
    const binding=this.bindings[boneName];if(!binding||!this.templates[slot])return;
    const root=this.templates[slot].clone(true),box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3()),centre=box.getCenter(new T.Vector3()),carrier=new T.Group();
    // Bake source root transforms into a regular attachment hierarchy. Signed X mirrors the boot pair.
    const fit=new T.Group();fit.scale.set(dimensions[0]/size.x*(mirror?-1:1),dimensions[1]/size.y,dimensions[2]/size.z);root.position.sub(centre);fit.add(root);carrier.add(fit);
    const at=binding.position.clone().add(new T.Vector3(...offset));const rest=new T.Matrix4().makeTranslation(at.x,at.y,at.z);
    if(slot==='weapon'&&boneName==='RightHand'){
      const local=new T.Matrix4().compose(new T.Vector3(.35,7.3,2.45),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-Math.PI/2),new T.Vector3().setScalar(1/this.view.sourceScale));
      rest.copy(binding.bindInverse).invert().multiply(local);fit.position.y=.52;
    }
    carrier.matrixAutoUpdate=false;carrier.matrix.copy(rest);this.view.pivot.add(carrier);
    const energy={tint:{value:new T.Color()},power:{value:0},rank:{value:0},time:this.time},materials=[];
    root.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;const own=source=>{
      const m=source.clone();m.metalness=Math.min(.62,m.metalness);m.roughness=Math.max(.28,m.roughness);m.side=slot==='cloak'||slot==='wings'?T.DoubleSide:T.FrontSide;
      m.onBeforeCompile=shader=>{
        shader.uniforms.uForgeTint=energy.tint;shader.uniforms.uForgePower=energy.power;shader.uniforms.uForgeRank=energy.rank;shader.uniforms.uForgeTime=energy.time;
        shader.vertexShader='varying vec3 vForgeLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvForgeLocal=position;');
        shader.fragmentShader='varying vec3 vForgeLocal;uniform vec3 uForgeTint;uniform float uForgePower,uForgeRank,uForgeTime;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
          float rim=pow(1.-abs(dot(normalize(normal),normalize(vViewPosition))),3.6);
          float scan=pow(max(0.,sin(vForgeLocal.y*37.-uForgeTime*2.8+vForgeLocal.x*7.)),28.);
          float crest=pow(max(0.,sin(vForgeLocal.x*61.+vForgeLocal.y*25.)),24.);
          outgoingLight=max(outgoingLight,diffuseColor.rgb*.45);
          outgoingLight+=uForgeTint*uForgePower*(rim*1.45+scan*.17+crest*.06*min(1.,uForgeRank*.3));
          #include <opaque_fragment>`);
      };m.customProgramCacheKey=()=>`rpg-forged-equipment-v1`;materials.push(m);return m;
    };o.material=Array.isArray(o.material)?o.material.map(own):own(o.material);});
    const part={slot,carrier,fit,binding,rest,energy,materials,skinned:[]};
    if(slot==='armor')this.skinArmor(part);
    this.parts.push(part);
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
  clear(){for(const p of this.parts){p.carrier.removeFromParent();for(const mesh of p.skinned){mesh.geometry.dispose();mesh.skeleton.dispose();}p.materials.forEach(m=>m.dispose());}this.parts.length=0;}
  rebuild(){
    this.clear();
    const equipped=this.state.save.gearEquipped,has=slot=>!!this.state.gear.find(equipped[slot]),kind=this.state.kind;
    if(has('armor'))this.add('armor','Spine2',[.74,.69,.42],[0,-.085,.018]);
    if(has('boots'))for(const side of ['Left','Right'])this.add('boots',side+'Foot',[.205,.35,.34],[0,.04,.035],side==='Right');
    if(has('wings'))this.add('wings','Spine2',[2.6,1.5,.25],[0,.13,-.29]);
    if(has('cloak'))this.add('cloak','Spine2',[.8,1.18,.19],[0,-.37,-.265]);
    if(has('weapon')){
      if(kind==='sword')this.add('weapon','RightHand',[.2,1.55,.085],[0,.57,0]);
      else if(kind==='cultivator')this.add('weapon','Spine2',[.14,1.35,.07],[.27,-.08,-.43]);
    }
    if(this.view.weapon)this.view.weapon.visible=!(kind==='sword'&&has('weapon'));
    this.revision=this.state.gear.revision;
  }
  update(){
    if(this.revision!==this.state.gear.revision){const key=Object.keys(GEAR_SLOTS).map(slot=>this.state.save.gearEquipped[slot]||'').join('|');if(key!==this.signature){this.rebuild();this.signature=key;}this.revision=this.state.gear.revision;}this.time.value=this.state.time;
    this.view.pivot.updateWorldMatrix(true,true);this.inverse.copy(this.view.pivot.matrixWorld).invert();
    for(const p of this.parts){
      if(p.slot==='armor')p.carrier.matrix.copy(p.rest);else{this.delta.multiplyMatrices(this.inverse,p.binding.bone.matrixWorld).multiply(p.binding.bindInverse);p.carrier.matrix.multiplyMatrices(this.delta,p.rest);}p.carrier.matrixWorldNeedsUpdate=true;
      const item=this.state.gear.find(this.state.save.gearEquipped[p.slot]);if(!item)continue;
      const style=enhancementStyle(item.enhance);p.energy.tint.value.set(style.from).lerp(this.tint.set(style.to),style.mix);p.energy.power.value=style.power;p.energy.rank.value=item.enhance;
      // A little secondary movement remains anchored to the spine, rather than floating in world space.
      if(p.slot==='wings')p.fit.rotation.y=Math.sin(this.state.time*2.1)*.018;
      if(p.slot==='cloak')p.fit.rotation.x=Math.sin(this.state.time*2.4)*.025+(this.state.player.action==='run'?.14:0);
    }
    const weapon=this.state.gear.find(this.state.save.gearEquipped.weapon);this.weaponStyle=weapon?enhancementStyle(weapon.enhance):null;
  }
  dispose(){this.clear();}
}
