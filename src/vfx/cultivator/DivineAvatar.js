import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {DivineHalo} from './DivineHalo.js';
const smooth=THREE.MathUtils.smoothstep;

export function standingClipTime(time,duration){
 return THREE.MathUtils.clamp((time-.28)/2.25,0,1)*duration;
}

/** Independent Standing action, sampled deterministically once, then held. */
export class DivineAvatar{
 constructor(parent,config){
  this.config=config;this.group=new THREE.Group();this.group.name='Colossal translucent Dharma spirit';this.group.position.set(-11.2,.65,0);this.group.rotation.y=Math.PI/2-.28;parent.add(this.group);
  this.rigs=[];this.ownedGeometry=[];this.presence={value:0};this.clock={value:0};this.rimStrength={value:config.avatarFresnel??1.25};this.spiritColor={value:new THREE.Color(config.avatarColor??'#8ac4ff')};this.size={value:1};
  this.waistHeight={value:6};this.hipsPosition=new THREE.Vector3();this.headPosition=new THREE.Vector3(-11.2,10,0);this.chestPosition=new THREE.Vector3(-11.2,8,0);this.time=0;this.disposed=false;this.standingClip=null;
  this.material=new THREE.MeshStandardMaterial({color:'#20477c',metalness:0,roughness:.8,transparent:true,opacity:1,depthWrite:false});
  this.material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{uDivinePresence:this.presence,uDivineTime:this.clock,uDivineRim:this.rimStrength,uSpiritColor:this.spiritColor,uDivineSize:this.size,uDivineWaist:this.waistHeight});
   shader.vertexShader='varying vec3 vDivineWorld;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvDivineWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
   shader.fragmentShader=`
    uniform float uDivinePresence,uDivineTime,uDivineRim,uDivineSize,uDivineWaist;uniform vec3 uSpiritColor;varying vec3 vDivineWorld;
    float spiritHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float spiritNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(spiritHash(i),spiritHash(i+vec3(1,0,0)),f.x),mix(spiritHash(i+vec3(0,1,0)),spiritHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(spiritHash(i+vec3(0,0,1)),spiritHash(i+vec3(1,0,1)),f.x),mix(spiritHash(i+vec3(0,1,1)),spiritHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
   `+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
    vec3 pD=vDivineWorld/max(.1,uDivineSize);
    float nD=spiritNoise(pD*1.25+vec3(0.,uDivineTime*.07,0.))*.65+spiritNoise(pD*2.6)*.35;
    float rimD=pow(max(0.,1.-abs(dot(normalize(normal),normalize(vViewPosition)))),3.6);
    // Soften the lower silhouette with the waist; fade the whole figure uniformly.
    float lowerD=smoothstep(uDivineWaist-1.7,uDivineWaist+.15,pD.y+(nD-.5)*.5);
    if(uDivinePresence<.002||lowerD<.006)discard;
    float veinsD=1.-smoothstep(.014,.055,abs(sin(pD.y*3.3+pD.z*1.8+nD*6.)));
    float fineD=pow(max(0.,sin(pD.y*23.+pD.z*4.+nD*8.)),28.)*.12;
    float faceD=max(0.,dot(normalize(normal),normalize(vec3(.2,.8,.5))));
    vec3 coreD=mix(uSpiritColor,vec3(1.),.8);
    outgoingLight=uSpiritColor*uSpiritColor*(.25+faceD*.4)+coreD*rimD*uDivineRim*1.9;
    outgoingLight+=uSpiritColor*(veinsD*.38+fineD);
    diffuseColor.a=uDivinePresence*lowerD*clamp(.78+rimD*.14+veinsD*.04,.0,.96);
    #include <opaque_fragment>
   `);
  };
  this.material.customProgramCacheKey=()=> 'divine-spirit-standing-v4';
  this.halo=new DivineHalo(parent);
  this.available=false;
 }
 async loadStandingAnimation(url){
  const source=await new FBXLoader().loadAsync(url);
  if(this.disposed)return false;
  const clip=source.animations.find(a=>a.duration>0);
  if(!clip)throw new Error('Standing FBX 缺少法相动画');
  this.setStandingAnimation(clip);return true;
 }
 setStandingAnimation(clip){
  // Both supplied files use the same Mixamo bind skeleton. Preserve rotations and
  // vertical rise; lock lateral root drift so the spirit stays behind the caster.
  this.standingClip=clip.clone();this.standingClip.name='Divine Standing';
  const hip=this.standingClip.tracks.find(track=>/Hips\.position$/.test(track.name));
  if(hip)for(let i=0;i<hip.values.length;i+=3){hip.values[i]=0;hip.values[i+2]=0;}
  this.metadata={source:'divine-standing.fbx',duration:clip.duration,mode:'once-and-hold'};
  for(const rig of this.rigs){rig.mixer.stopAllAction();rig.mixer.uncacheRoot(rig.root);this.attachAction(rig);}
  this.update(this.time);
 }
 attachAction(rig){
  rig.action=rig.mixer.clipAction(this.standingClip??this.clip);rig.action.setLoop(THREE.LoopOnce,1);rig.action.clampWhenFinished=true;rig.action.play();
  if(!this.standingClip){rig.mixer.setTime(2);rig.action.paused=true;}
 }
 bind(fighter){
  if(!fighter?.root||this.available)return;
  this.clip=fighter.clip;
  const root=clone(fighter.root);root.scale.multiplyScalar(5.0);root.scale.x*=1.22;
  root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;o.material=this.material;o.renderOrder=1;}});
  this.group.add(root);const mixer=new THREE.AnimationMixer(root);
  const rig={root,mixer,hips:root.getObjectByName('mixamorigHips'),head:root.getObjectByName('mixamorigHead'),chest:root.getObjectByName('mixamorigSpine2')};
  this.attachAction(rig);this.rigs.push(rig);this.available=true;this.update(this.time);
 }
 update(t,config=this.config){
  this.time=t;
  const open=smooth(t,.28,1.35),fade=1-smooth(t,4.35,5.65),presence=open*fade,color=config.avatarColor??'#8ac4ff';
  this.group.visible=presence>.001;this.presence.value=presence;this.clock.value=t;this.rimStrength.value=config.avatarFresnel??1.25;this.spiritColor.value.set(color);
  const size=config.avatarScale??1;this.size.value=size;this.group.scale.setScalar(size);
  for(const rig of this.rigs){
   if(this.standingClip){rig.action.enabled=true;rig.action.paused=false;rig.mixer.setTime(standingClipTime(t,this.standingClip.duration));}
   this.group.updateWorldMatrix(true,true);
   rig.hips?.getWorldPosition(this.hipsPosition);rig.head?.getWorldPosition(this.headPosition);rig.chest?.getWorldPosition(this.chestPosition);
   this.waistHeight.value=this.hipsPosition.y/size;
  }
  // Centre the ring on the visible upper body; the offset compensates low-angle
  // parallax, and the minimum keeps the rising circle above the floor.
  const haloY=this.available?Math.max(5.75*size,(this.headPosition.y+this.hipsPosition.y)*.5+.15*size):5.75*size;
  this.halo.update(t,presence,size,color,haloY);
 }
 dispose(){if(this.disposed)return;this.disposed=true;for(const r of this.rigs){r.mixer.stopAllAction();r.mixer.uncacheRoot(r.root);r.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});}this.material.dispose();this.halo.dispose();this.group.removeFromParent();}
}
