import * as THREE from 'three';
import { SwordTimeline } from './SwordTimeline.js';
import { PaintedCrescentBlade as CrescentBlade } from './PaintedCrescentBlade.js';
import { SwordTrail } from './SwordTrail.js';
import { SwordParticles } from './SwordParticles.js';
import { SwordImpact } from './SwordImpact.js';
import { BranchingLightning } from './BranchingLightning.js';
import { SwordAura } from './SwordAura.js';
import { SwordSwingTrail } from './SwordSwingTrail.js';

const clamp=THREE.MathUtils.clamp,smooth=THREE.MathUtils.smoothstep;
export class SwordSlashSkill {
  constructor(scene,camera,sharedConfig){
    this.kind='sword';this.scene=scene;this.camera=camera;this.sharedConfig=sharedConfig;
    this.config=new Proxy(sharedConfig,{get(target,key){if(key==='arrowSize')return target.bladeSize??1;if(key==='frostColor'||key==='swordColor')return target.energyColor??'#39dfff';return target[key];}});
    this.origin=new THREE.Vector3(-6.25,1.6,0);this.target=new THREE.Vector3(7.5,1.7,0);this.position=this.origin.clone();this.direction=new THREE.Vector3(1,0,0);this.orientation=new THREE.Quaternion();this.xAxis=new THREE.Vector3(1,0,0);
    this.flightEnd=this.target.clone().addScaledVector(this.direction,-.75*(this.config.bladeSize??1));this.timeline=new SwordTimeline(this.origin.distanceTo(this.flightEnd),this.config.flightSpeed);
    this.root=new THREE.Group();this.root.name='Cang Lei · Severing Sky';scene.add(this.root);
    this.blade=new CrescentBlade(this.config);this.root.add(this.blade.group);
    this.trail=new SwordTrail(this.root,this.config);this.particles=new SwordParticles(this.root,this.config);this.impact=new SwordImpact(this.root,this.config);this.lightning=new BranchingLightning(this.root,this.config);this.aura=new SwordAura(this.root,this.config);this.swingTrail=new SwordSwingTrail(this.root,this.config);
    this.base=new THREE.Vector3();this.tip=new THREE.Vector3();this.tipUpper=new THREE.Vector3();this.tipLower=new THREE.Vector3();this.swordQuaternion=new THREE.Quaternion();
    this.lightning.setSurfaceProvider(this.blade);
    this.slashOrientation=new THREE.Quaternion();this.releaseOrientation=new THREE.Quaternion();this.flightOrientation=new THREE.Quaternion();
    this.inverseContentTilt=this.blade.content.quaternion.clone().invert();
    this.slashForward=new THREE.Vector3(1,0,0);this.slashSpan=new THREE.Vector3(0,1,0);this.slashNormal=new THREE.Vector3(0,0,1);
    this.releasePlaneNormal=new THREE.Vector3();this.frameForward=new THREE.Vector3();this.frameSpan=new THREE.Vector3();this.frameNormal=new THREE.Vector3();this.frameMatrix=new THREE.Matrix4();
    this.beforeTip=new THREE.Vector3();this.afterTip=new THREE.Vector3();this.sampleBase=new THREE.Vector3();this.sampleVelocity=new THREE.Vector3();this.fallbackOrigin=this.origin.clone();
    this.light=new THREE.PointLight('#39dfff',0,4,2);this.root.add(this.light);
    this.fighter=null;this.loops=0;this.loopWait=0;this.hitStopRemaining=0;this.hit=false;this.launched=false;this.lastSize=this.config.bladeSize;this.dirty=false;this.active=true;this.disposed=false;
    this.bladeState={formation:0,life:1,impact:0,phase:'gather',config:this.config};this.reset();
  }
  bindFighter(fighter){this.fighter=fighter;this.calibrateTrajectory();this.dirty=true;}
  // +X follows the cutting direction; +Y spans the slash; +Z is its normal.
  frameFromDirection(forward,out){
    this.frameForward.copy(forward).normalize();if(this.frameForward.lengthSq()<1e-8)this.frameForward.set(1,0,0);
    this.frameNormal.copy(this.releasePlaneNormal).addScaledVector(this.frameForward,-this.releasePlaneNormal.dot(this.frameForward));
    if(this.frameNormal.lengthSq()<1e-8){this.frameNormal.set(0,1,0).addScaledVector(this.frameForward,-this.frameForward.y);if(this.frameNormal.lengthSq()<1e-8)this.frameNormal.set(0,0,1);}
    this.frameNormal.normalize();this.frameSpan.crossVectors(this.frameNormal,this.frameForward).normalize();
    this.frameMatrix.makeBasis(this.frameForward,this.frameSpan,this.frameNormal);return out.setFromRotationMatrix(this.frameMatrix);
  }
  floorLift(position,orientation){
    const bounds=this.blade.geometry.boundingBox;if(!bounds)return 0;
    this.frameForward.set(1,0,0).applyQuaternion(orientation);this.frameSpan.set(0,1,0).applyQuaternion(orientation);this.frameNormal.set(0,0,1).applyQuaternion(orientation);
    const lowest=(this.frameForward.y>=0?bounds.min.x:bounds.max.x)*this.frameForward.y*1.22+(this.frameSpan.y>=0?bounds.min.y:bounds.max.y)*this.frameSpan.y+(this.frameNormal.y>=0?bounds.min.z:bounds.max.z)*this.frameNormal.y;
    return Math.max(0,.06-position.y-lowest*(this.config.bladeSize??1));
  }
  calibrateTrajectory(){
    const launch=this.timeline.launchTime;
    if(this.fighter){
      // Cache the real swing plane once per calibration, avoiding extra FBX
      // mixer samples during every simulation step.
      this.fighter.sampleSwordPose(launch-.02,this.sampleBase,this.beforeTip,this.swordQuaternion);
      this.fighter.sampleSwordPose(launch+.02,this.sampleBase,this.afterTip,this.swordQuaternion);
      this.fighter.sampleSwordPose(launch,this.base,this.tip,this.swordQuaternion);
      this.sampleVelocity.subVectors(this.afterTip,this.beforeTip);this.frameForward.subVectors(this.tip,this.base).normalize();
      this.releasePlaneNormal.crossVectors(this.frameForward,this.sampleVelocity);
      if(this.releasePlaneNormal.lengthSq()<1e-8)this.releasePlaneNormal.set(0,1,0);
      else this.releasePlaneNormal.normalize();
      if(this.releasePlaneNormal.y<0)this.releasePlaneNormal.negate();
      this.origin.copy(this.tip);this.frameFromDirection(this.frameForward,this.releaseOrientation);
    }else{
      this.origin.copy(this.fallbackOrigin);this.releasePlaneNormal.set(0,0,1).applyQuaternion(this.blade.content.quaternion);
      this.frameFromDirection(this.xAxis,this.releaseOrientation);
    }
    this.origin.y+=this.floorLift(this.origin,this.releaseOrientation);
    this.direction.subVectors(this.target,this.origin).normalize();this.frameFromDirection(this.direction,this.flightOrientation);
    this.flightEnd.copy(this.target).addScaledVector(this.direction,-.75*(this.config.bladeSize??1));
    this.timeline.retime(this.origin.distanceTo(this.flightEnd),this.config.flightSpeed);this.lastSize=this.config.bladeSize;
  }
  pose(){
    if(this.fighter)this.fighter.sampleSwordPose(this.timeline.time,this.base,this.tip,this.swordQuaternion);
    else{this.base.copy(this.origin).addScaledVector(this.direction,-1.3);this.tip.copy(this.origin);}
    if(this.timeline.time<this.timeline.launchTime){
      this.frameForward.subVectors(this.tip,this.base);this.frameFromDirection(this.frameForward,this.slashOrientation);
      this.position.copy(this.tip);this.position.y+=this.floorLift(this.position,this.slashOrientation);
    }else{
      this.position.lerpVectors(this.origin,this.flightEnd,this.timeline.progress);
      const settle=smooth(this.timeline.progress,0,.20);
      this.slashOrientation.slerpQuaternions(this.releaseOrientation,this.flightOrientation,settle);
    }
    this.orientation.copy(this.slashOrientation).multiply(this.inverseContentTilt);
    this.slashForward.set(1,0,0).applyQuaternion(this.slashOrientation);this.slashSpan.set(0,1,0).applyQuaternion(this.slashOrientation);this.slashNormal.set(0,0,1).applyQuaternion(this.slashOrientation);
  }
  present(){
    const t=this.timeline.time,age=t-this.timeline.impactTime,c=this.config;
    const formation=t<.45?0:Math.pow(smooth(t,.45,.65),.48),consume=clamp(age/.22,0,1);
    this.bladeState.formation=formation;this.bladeState.impact=consume;this.bladeState.life=this.timeline.phase==='idle'?0:1;this.bladeState.phase=this.timeline.phase;
    this.blade.group.position.copy(this.position).addScaledVector(this.direction,.7*(c.bladeSize??1)*consume);this.blade.group.quaternion.copy(this.orientation);this.blade.update(t,this.bladeState);
    this.blade.group.visible=t>=.45&&consume<1&&this.timeline.phase!=='idle';
    const charge=smooth(t,.02,.28)*(1-smooth(t,.48,.67));this.aura.update(t,this.base,this.tip,charge);
    this.blade.getTipPositions(this.tipUpper,this.tipLower);
    if(t<.65)this.lightning.update(t,this.tip,charge*.7,'charge',c,this.base,this.tip);
    else if(age<.27)this.lightning.update(t,this.position,(1-smooth(age,0,.27))*.85,'flight',c,this.tipLower,this.tipUpper);
    else this.lightning.reset();
    this.light.position.copy(t<.65?this.tip:this.position);this.light.position.z+=.5;this.light.position.y+=.25;this.light.intensity=this.timeline.phase==='idle'?0:charge*.35+(t>=.65&&age<0?.3:0);
  }
  step(dt){
    const tl=this.timeline;tl.advance(dt);this.pose();this.present();const t=tl.time;this.swingTrail.update(dt,t,this.base,this.tip,this.config);
    if(t>=.65-1e-9&&!this.launched){this.launched=true;this.particles.burst(this.origin,'launch',this.config);}
    if(t>=tl.impactTime-1e-9&&!this.hit){this.hit=true;this.impact.trigger(this.target,this.config);this.particles.burst(this.target,'impact',this.config);this.trail.impact(this.target,tl.impactTime,this.orientation);if(!this.seeking&&this.config.hitStop)this.hitStopRemaining=.05;}
    this.trail.update(dt,t,this.position,t>=.65&&t<tl.impactTime,this.camera,this.config,this.direction,this.orientation);
    this.particles.update(dt,t,this.position,tl.phase,this.config,t<.65?this.base:this.tipLower,t<.65?this.tip:this.tipUpper);
    this.impact.update(dt,t,this.config);
    if(tl.phase==='idle')this.clearEffects();
  }
  update(dt,realDt=dt){
    if(!this.active||this.disposed)return;
    if(this.config.flightSpeed!==this.timeline.speed||this.config.bladeSize!==this.lastSize){this.calibrateTrajectory();this.dirty=true;}
    if(this.dirty){this.dirty=false;this.seek(this.timeline.time);}
    if(!this.timeline.playing){this.refreshFrozenFrame();return;}
    if(this.timeline.phase==='idle'){if(this.config.autoLoop){this.loopWait+=realDt;if(this.loopWait>.8)this.fire();}return;}
    let frameDt=Math.max(0,dt);
    if(this.hitStopRemaining>0){
      // Consume wall time, not scaled skill time; retain the part of the frame
      // after the stop expires instead of adding a whole extra frozen frame.
      const wallDt=Math.max(0,realDt),held=Math.min(this.hitStopRemaining,wallDt);
      this.hitStopRemaining=Math.max(0,this.hitStopRemaining-held);
      if(this.hitStopRemaining<1e-8)this.hitStopRemaining=0;
      frameDt=wallDt>0?frameDt*(1-held/wallDt):0;
      if(frameDt<=1e-6){this.refreshFrozenFrame();return;}
    }
    let left=Math.min(frameDt,.1)*this.config.playbackSpeed;
    while(left>1e-6){const s=Math.min(left,1/120);this.step(s);left-=s;if(this.hitStopRemaining>0)break;}
  }
  refreshFrozenFrame(){
    this.pose();this.present();
    const t=this.timeline.time;
    this.swingTrail.update(0,t,this.base,this.tip,this.config);
    this.particles.update(0,t,this.position,this.timeline.phase,this.config,t<.65?this.base:this.tipLower,t<.65?this.tip:this.tipUpper);
    this.impact.update(0,t,this.config);this.refreshView();
  }
  refreshView(){if(this.timeline.phase!=='idle')this.trail.update(0,this.timeline.time,this.position,false,this.camera,this.config,this.direction,this.orientation);}
  clearEffects(){this.blade.group.visible=false;this.trail.reset();this.particles.reset();this.impact.reset();this.lightning.reset();this.aura.reset();this.swingTrail.reset();this.light.intensity=0;}
  reset(){this.timeline.reset();this.calibrateTrajectory();this.position.copy(this.origin);this.hit=false;this.launched=false;this.loopWait=0;this.hitStopRemaining=0;this.dirty=false;this.clearEffects();}
  fire(){this.reset();this.timeline.playing=true;this.loops++;}
  seek(time){const playing=this.timeline.playing;this.reset();this.seeking=true;this.timeline.playing=true;const end=clamp(time,0,this.timeline.duration);while(this.timeline.time<end-1e-6)this.step(Math.min(1/120,end-this.timeline.time));if(end===0){this.pose();this.present();}this.seeking=false;this.hitStopRemaining=0;this.timeline.playing=playing;}
  setActive(active){const wasActive=this.active;this.active=active;this.root.visible=active;if(!active){this.clearEffects();this.hitStopRemaining=0;}else if(!wasActive)this.dirty=true;}
  dispose(){if(this.disposed)return;this.disposed=true;this.active=false;this.blade.dispose();this.trail.dispose();this.particles.dispose();this.impact.dispose();this.lightning.dispose();this.aura.dispose();this.swingTrail.dispose();this.root.removeFromParent();}
}
