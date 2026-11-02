import * as THREE from 'three';
import { meteorPosition } from '../vfx/cultivator/MeteorStorm.js';

const smooth=THREE.MathUtils.smoothstep,lerp=THREE.MathUtils.lerp;
const labels=['结印 · 掌心推进','显圣 · 仰视升镜','法相 · 威仪近景','天门 · 升空拉远','陨星 · 俯冲跟拍','天罚 · 低机位冲击','镇世 · 环绕轰击','归元 · 拉远收势'];
const ids=['seal','reveal','portrait','sky','dive','impact','barrage','resolve'];

/** Authored eight-shot sequence. Every camera sample depends only on skill time. */
export class CultivatorCinematicDirector{
 constructor(camera){
  this.camera=camera;this.target=new THREE.Vector3();this.view=new THREE.Vector3();this.right=new THREE.Vector3();this.up=new THREE.Vector3();this.worldUp=new THREE.Vector3(0,1,0);this.point=new THREE.Vector3();this.offset=new THREE.Vector3();this.bounds=new THREE.Box3();
  this.meteor=new THREE.Vector3();this.tail=new THREE.Vector3();this.head=new THREE.Vector3();this.chest=new THREE.Vector3();this.shotIndex=0;this.shotLabel=labels[0];
 }
 setTiming(skill){
  const tl=skill.timeline,flight=tl.impactTime-tl.launchTime;
  this.impact=tl.impactTime;this.last=tl.lastImpact;
  this.portraitEnd=Math.min(1.9,tl.launchTime+flight*.30);
  this.skyEnd=tl.launchTime+flight*.62;
  this.diveEnd=this.impact+.025;this.impactEnd=this.impact+.44;
 }
 getTimeScale(skill){
  this.setTiming(skill);const t=skill.timeline.time;
  if(t<.48)return .9;
  if(t<1.48)return .36;
  if(t<this.portraitEnd)return .46;
  if(t<this.skyEnd)return .95;
  if(t<this.impact)return .42;
  if(t<this.impact+.24)return .46;
  return t<this.last+.16?.82:1;
 }
 update(skill,aspect=this.camera.aspect){
  this.setTiming(skill);
  const t=skill.timeline.time,scale=skill.config.avatarScale??1,avatar=skill.avatar;
  this.shotIndex=t<.48?0:t<1.48?1:t<this.portraitEnd?2:t<this.skyEnd?3:t<this.diveEnd?4:t<this.impactEnd?5:t<this.last+.16?6:7;
  this.shotLabel=labels[this.shotIndex];this.shotId=ids[this.shotIndex];
  if(avatar?.available){this.head.copy(avatar.headPosition);this.chest.copy(avatar.chestPosition);}
  else{this.head.set(-11.2,lerp(5.9,10.1,smooth(t,.28,1.9))*scale,0);this.chest.copy(this.head);this.chest.y-=1.8*scale;}
  let minimum=8,fov=40,roll=0;
  switch(this.shotIndex){
   case 0:{
    const p=smooth(t,0,.48);
    this.target.set(-8.25,lerp(1.3,1.65,p),0);
    this.view.set(lerp(.65,.85,p),.16,1);
    this.bounds.min.set(-9.4,.25,-1.15);this.bounds.max.set(-7,2.65,1.15);
    minimum=lerp(6.5,5.6,p);fov=lerp(43,37,p);break;
   }
   case 1:{
    const p=smooth(t,.48,1.48);
    this.target.set(-10.4,lerp(4,5.7,p)*scale,0);
    this.view.set(lerp(1.15,1.45,p),lerp(-.4,-.24,p),lerp(.46,.25,p));
    this.bounds.min.set(-13.1,-.05,-3.5*scale);this.bounds.max.set(-6.9,this.head.y+1.05*scale,3.5*scale);
    minimum=11*scale;fov=lerp(46,40,p);break;
   }
   case 2:{
    const p=smooth(t,1.48,this.portraitEnd),angle=lerp(.20,.43,p);
    this.target.copy(this.chest).lerp(this.head,.54);
    this.view.set(Math.cos(angle),lerp(-.08,-.045,p),Math.sin(angle));
    this.bounds.min.set(this.head.x-1.5*scale,this.head.y-lerp(4,3.4,p)*scale,this.head.z-2.35*scale);
    this.bounds.max.set(this.head.x+1.5*scale,this.head.y+1.05*scale,this.head.z+2.35*scale);
    minimum=8*scale;fov=lerp(36,31,p);break;
   }
   case 3:{
    const p=smooth(t,this.portraitEnd,this.skyEnd);
    this.target.set(-.5,lerp(6.2,7.1,p),0);this.view.set(.4,lerp(.25,.5,p),1);
    this.bounds.min.set(-14.5,-.1,-7.5);this.bounds.max.set(12,18.4,7.5);
    minimum=27;fov=48;break;
   }
   case 4:{
    const event=skill.storm.events[0],p=smooth(t,this.skyEnd,this.diveEnd);
    const headTime=Math.min(t,event.hit);
    meteorPosition(event,headTime,this.meteor);meteorPosition(event,Math.max(event.launch,headTime-.13),this.tail);
    this.target.copy(this.meteor).lerp(event.end,.08+.08*p);
    this.view.set(lerp(-.65,-.5,p),lerp(.6,.44,p),1);
    this.bounds.makeEmpty().expandByPoint(this.meteor).expandByPoint(this.tail).expandByScalar(1.05*Math.max(.7,event.radius/.62));
    minimum=lerp(6.8,5.8,p);fov=lerp(39,34,p);roll=-.025*Math.sin(p*Math.PI);break;
   }
   case 5:{
    const p=smooth(t,this.diveEnd,this.impactEnd);
    this.target.set(7.5,lerp(1.25,1.7,p),0);this.view.set(lerp(.8,.55,p),.16,1);
    const range=Math.max(1,(skill.config.impactRadius??1.6)/1.6);
    this.bounds.min.set(7.5-2.5*range,-.08,-2.7*range);this.bounds.max.set(7.5+2.5*range,4.5,2.7*range);
    minimum=lerp(9,8,p);fov=lerp(43,39,p);break;
   }
   case 6:{
    const p=smooth(t,this.impactEnd,this.last+.16);
    this.target.set(lerp(6.5,7.2,p),3.8,0);this.view.set(lerp(.65,.15,p),lerp(.7,.45,p),1);
    this.bounds.min.set(1.5,-.1,-5.3);this.bounds.max.set(12.3,12,5.3);
    minimum=18;fov=lerp(44,40,p);break;
   }
   default:{
    const p=smooth(t,this.last+.16,skill.timeline.duration);
    this.target.set(-.8,lerp(4.2,3.6,p),0);this.view.set(.3,lerp(.27,.4,p),1);
    this.bounds.min.set(-14.2,-.1,-6.7);this.bounds.max.set(12,12.4*scale,6.7);
    minimum=lerp(25,30,p);fov=lerp(42,46,p);
   }
  }
  this.view.normalize();this.right.crossVectors(this.worldUp,this.view).normalize();this.up.crossVectors(this.view,this.right).normalize();
  const ty=Math.tan(THREE.MathUtils.degToRad(fov*.5)),tx=ty*Math.max(.15,aspect);let distance=minimum;
  for(let i=0;i<8;i++){
   this.point.set(i&1?this.bounds.max.x:this.bounds.min.x,i&2?this.bounds.max.y:this.bounds.min.y,i&4?this.bounds.max.z:this.bounds.min.z);
   this.offset.subVectors(this.point,this.target);const toward=this.offset.dot(this.view);
   distance=Math.max(distance,toward+Math.abs(this.offset.dot(this.right))/(tx*.84),toward+Math.abs(this.offset.dot(this.up))/(ty*.84));
  }
  // Keep the rising head below the overlay controls without losing the low angle.
  if(this.shotIndex===1){
   this.point.copy(this.head);this.point.y+=.7*scale;this.offset.subVectors(this.point,this.target);
   distance=Math.max(distance,this.offset.dot(this.view)+this.offset.dot(this.up)/(ty*.55));
  }
  this.camera.position.copy(this.target).addScaledVector(this.view,distance);
  // Low-angle framing can otherwise put the eye beneath the stage at the start
  // of the rise or on wide screens, where its dark underside fills the frame.
  this.camera.position.y=Math.max(.65,this.camera.position.y);
  if(skill.config.cameraShake&&(this.shotIndex===5||this.shotIndex===6)){
   const pulse=skill.storm?.impactPulse??0;this.camera.position.x+=Math.sin(t*83)*pulse*.045;this.camera.position.y+=Math.sin(t*117)*pulse*.03;
  }
  this.camera.fov=fov;this.camera.aspect=aspect;this.camera.far=Math.max(120,distance+65);this.camera.up.set(0,1,0);this.camera.lookAt(this.target);this.camera.rotateZ(roll);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
 }
}
