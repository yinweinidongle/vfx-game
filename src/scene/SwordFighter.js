import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { SwordWeapon, disposeSwordObject } from './SwordWeapon.js';

export const SWORD_TIMING=Object.freeze({
  chargeEnd:0.45,strikeEnd:0.65,recoveryEnd:1.65,releaseTime:0.65,
  sourceWindupEnd:0.76,sourceStrikeEnd:1.075,sourceDuration:3.1666667461395264,
});

function hermite(u,start,end,startTangent,endTangent){
  const u2=u*u,u3=u2*u;
  return (2*u3-3*u2+1)*start+(u3-2*u2+u)*startTangent+(-2*u3+3*u2)*end+(u3-u2)*endTangent;
}

/** Source clip time with continuous speed at charge/strike/recovery boundaries. */
export function swordClipTime(time,clipDuration=SWORD_TIMING.sourceDuration){
  const t=Math.max(0,Number.isFinite(time)?time:0);
  const strikeRate=(SWORD_TIMING.sourceStrikeEnd-SWORD_TIMING.sourceWindupEnd)/.2;
  if(t<=0.45)return hermite(t/0.45,0,0.76,0.45,0.45*strikeRate);
  if(t<=0.65)return 0.76+(t-0.45)*strikeRate;
  const end=Math.max(SWORD_TIMING.sourceStrikeEnd,clipDuration-0.0001);
  if(t>=1.65)return end;
  return Math.min(end,hermite((t-0.65),SWORD_TIMING.sourceStrikeEnd,end,strikeRate,0));
}

/**
 * Independent, selectable swordsman. Starts hidden so the existing archer stays
 * active until the owner calls setVisible(true). All character textures remain
 * original; the sword is a separate, metre-scale right-palm attachment.
 */
export class SwordFighter {
  constructor(scene,config){
    this.scene=scene;this.config=config;this.disposed=false;
    this.group=new THREE.Group();this.group.name='Swordsman · Standing Melee Attack 360 High';
    this.group.visible=false;scene.add(this.group);
    this.wrapper=new THREE.Group();this.wrapper.position.set(-8.4,0,0);this.wrapper.rotation.y=Math.PI/2;this.group.add(this.wrapper);
    this.weapon=new SwordWeapon(config);this.group.add(this.weapon.group);
    this.root=null;this.mixer=null;this.action=null;this.clip=null;this.hand=null;
    this.time=0;this.phase='idle';this.impactTime=SWORD_TIMING.releaseTime;this.lastPoseTime=NaN;
    this.status={character:'loading',sword:'procedural'};
    this.timing=SWORD_TIMING;
    this.materials=[];
    this.handQuaternion=new THREE.Quaternion();
    // A sword exits the index/thumb side of a closed right fist. +Y blade maps
    // to the hand's +X axis; +Z keeps the broad blade face aligned with the palm.
    this.gripAlignment=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2);
    this.palmOffset=new THREE.Vector3(0.35,7.3,2.45);
    this.tempPosition=new THREE.Vector3();
    this.textureURLs=new Set();
    this.applyFallbackPose();

    const manager=new THREE.LoadingManager();
    const texturesReady=new Promise(resolve=>{manager.onLoad=()=>{
      for(const url of this.textureURLs)URL.revokeObjectURL(url);
      this.textureURLs.clear();resolve();
    };});
    manager.setURLModifier(url=>{if(url.startsWith('blob:'))this.textureURLs.add(url);return url;});
    const loader=new FBXLoader(manager);
    const base=import.meta.env?.BASE_URL??'/';
    this.ready=Promise.all([this.loadCharacter(loader,`${base}models/standing-melee-360.fbx`),texturesReady]).then(()=>{
      if(!this.disposed)this.update(this.time,this.phase,this.impactTime);
      return this.status;
    });
  }

  async loadCharacter(loader,url){
    try{
      const root=await loader.loadAsync(url);
      if(this.disposed){disposeSwordObject(root);return;}
      const bounds=new THREE.Box3().setFromObject(root);
      const scale=2.1/(bounds.max.y-bounds.min.y);
      root.scale.setScalar(scale);this.wrapper.position.y=-bounds.min.y*scale;
      const seen=new Set();
      root.traverse(object=>{
        if(!object.isMesh)return;
        object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          if(seen.has(material))continue;seen.add(material);
          if(material.map)material.map.colorSpace=THREE.SRGBColorSpace;
          if(material.emissiveMap)material.emissiveMap.colorSpace=THREE.SRGBColorSpace;
          if(material.normalMap)material.normalMap.colorSpace=THREE.NoColorSpace;
          if(material.specularMap)material.specularMap.colorSpace=THREE.NoColorSpace;
          this.materials.push(material);
        }
      });
      const original=root.animations.find(clip=>clip.duration>0);
      if(!original)throw new Error('Swordsman FBX has no animation.');
      const clip=original.clone();
      const translation=clip.tracks.find(track=>/Hips\.position$/.test(track.name));
      if(translation){
        const x=translation.values[0],z=translation.values[2];
        for(let i=0;i<translation.values.length;i+=3){translation.values[i]=x;translation.values[i+2]=z;}
      }
      // The hip quaternion contains the authored 360-degree rotation. Never
      // flatten yaw or remove that track when making the motion in-place.
      this.wrapper.add(root);this.root=root;this.clip=clip;
      this.mixer=new THREE.AnimationMixer(root);this.action=this.mixer.clipAction(clip);
      this.action.setLoop(THREE.LoopOnce,1);this.action.clampWhenFinished=true;this.action.play();
      this.hand=root.getObjectByName('mixamorigRightHand');
      if(!this.hand)throw new Error('Swordsman FBX has no right-hand bone.');
      this.status.character='ready';
      this.metadata={name:root.getObjectByProperty('isSkinnedMesh',true)?.name??'Ch03',height:2.1,scale,clipDuration:clip.duration,clipName:clip.name,materials:this.materials.length,source:url};
      this.applyPose(this.time);
    }catch(error){
      console.warn('Swordsman FBX could not load; using a procedural stand-in.',error);
      if(this.disposed)return;
      if(this.root){this.root.removeFromParent();disposeSwordObject(this.root);}
      this.root=null;this.mixer=null;this.hand=null;this.action=null;this.materials.length=0;
      this.createStandIn();this.status.character='fallback';
    }
  }

  createStandIn(){
    const material=new THREE.MeshStandardMaterial({color:'#3a5262',roughness:0.65,metalness:0.25});
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.24,0.66,4,8),material);body.position.y=1.25;this.wrapper.add(body);
    const head=new THREE.Mesh(new THREE.IcosahedronGeometry(0.22,1),material);head.position.y=1.96;this.wrapper.add(head);
    for(const z of [-0.16,0.16]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(0.11,0.64,3,6),material);leg.position.set(0,0.46,z);this.wrapper.add(leg);}
  }

  applyFallbackPose(){
    this.weapon.group.position.set(-8.27,1.18,0.36);
    this.weapon.group.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/4);
    this.weapon.group.updateWorldMatrix(true,true);
  }

  applyPose(skillTime){
    if(!this.mixer||!this.hand)return;
    if(this.lastPoseTime===skillTime)return;
    this.lastPoseTime=skillTime;
    this.action.paused=false;
    this.mixer.setTime(swordClipTime(skillTime,this.clip.duration));
    this.root.updateWorldMatrix(true,true);
    this.tempPosition.copy(this.palmOffset);
    this.hand.localToWorld(this.tempPosition);
    this.hand.getWorldQuaternion(this.handQuaternion);
    this.weapon.group.position.copy(this.tempPosition);
    this.weapon.group.quaternion.copy(this.handQuaternion).multiply(this.gripAlignment);
    this.weapon.group.updateWorldMatrix(true,true);
  }

  setVisible(visible){this.group.visible=Boolean(visible);}

  update(skillTime,phase='idle',impactTime=this.impactTime){
    if(this.disposed)return;
    this.time=Math.max(0,Number.isFinite(skillTime)?skillTime:0);this.phase=phase;this.impactTime=impactTime;
    this.applyPose(this.time);this.weapon.update(this.time,phase);
  }

  getBladeSegment(outBase,outTip){this.weapon.getBladeSegment(outBase,outTip);}

  /**
   * Sample any skill time without leaving the visible rig in that pose.
   * Outputs are world-space blade heel, tip, and the weapon's +Y quaternion.
   * Caller supplies reusable Vector3/Quaternion objects. Returns rig readiness.
   */
  sampleSwordPose(time,outBase,outTip,outQuaternion){
    const savedTime=this.time;
    this.applyPose(Math.max(0,Number.isFinite(time)?time:0));
    this.weapon.getBladeSegment(outBase,outTip);
    if(outQuaternion)this.weapon.group.getWorldQuaternion(outQuaternion);
    this.applyPose(savedTime);
    return this.status.character==='ready';
  }

  async loadSwordAsset(url,options={}){
    this.status.sword='loading';
    try{
      const result=await this.weapon.load(url,options);
      if(!this.disposed){this.status.sword='generated';this.weapon.update(this.time,this.phase);}
      return result;
    }catch(error){this.status.sword=this.weapon.available?'generated':'procedural';throw error;}
  }

  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.mixer?.stopAllAction();if(this.root)this.mixer?.uncacheRoot(this.root);
    this.weapon.dispose();disposeSwordObject(this.wrapper);this.group.clear();this.group.removeFromParent();
    this.root=null;this.mixer=null;this.materials.length=0;
  }
}
