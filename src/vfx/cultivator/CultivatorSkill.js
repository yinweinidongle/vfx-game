import * as THREE from 'three';
import { MagicMandala } from './MagicMandala.js';
import { DivineAvatar } from './DivineAvatar.js';
import { MeteorStorm, meteorPosition } from './MeteorStorm.js';
import { HaloBolts } from './HaloBolts.js';
const smooth=THREE.MathUtils.smoothstep,clamp=THREE.MathUtils.clamp;

export class CultivationTimeline{
 constructor(){this.time=0;this.duration=5.8;this.launchTime=1.6;this.impactTime=2.42;this.lastImpact=4.4;this.playing=true;}
 get phase(){const t=this.time;return t>=this.duration?'idle':t<.65?'gather':t<1.6?'charge':t<this.impactTime?'flight':t<this.lastImpact+.1?'impact':'dissipate';}
 get progress(){return clamp((this.time-this.launchTime)/(this.lastImpact-this.launchTime),0,1);}
 advance(dt){if(this.playing)this.time=Math.min(this.duration,this.time+Math.max(0,dt));}
 reset(){this.time=0;}
}

/** Deterministic ritual and staggered AoE impacts; seeking never reallocates pools. */
export class CultivatorSkill{
 constructor(scene,camera,config){
  this.kind='cultivator';this.config=config;this.camera=camera;this.timeline=new CultivationTimeline();
  this.root=new THREE.Group();this.root.name='Nascent soul · celestial judgment';scene.add(this.root);
  this.origin=new THREE.Vector3(-8.4,1.5,0);this.target=new THREE.Vector3(7.5,1.25,0);this.position=this.origin.clone();this.flightEnd=this.target.clone();this.direction=new THREE.Vector3(1,0,0);
  this.base=this.origin.clone();this.tip=this.origin.clone();this.loops=0;this.loopWait=0;this.dirty=false;this.active=false;this.disposed=false;
  this.avatar=new DivineAvatar(this.root,config);this.storm=new MeteorStorm(this.root,camera,config);
  this.bolts=new HaloBolts(this.root,camera,config);this.samplePoint=new THREE.Vector3();
  this.sourceSampler=(time,ring,angle,out)=>this.sampleHalo(time,ring,angle,out);
  this.targetSampler=(time,out)=>this.sampleTarget(time,out);
  this.ground=new MagicMandala(this.root,2.6);this.ground.mesh.position.set(-8.4,.045,0);
  this.targetSeal=new MagicMandala(this.root,4.4);this.targetSeal.mesh.position.set(7.5,.041,0);this.targetSeal.uniforms.uRadiance.value=2.35;
  this.sky=new MagicMandala(this.root,5.8);this.sky.mesh.position.set(1.5,14.5,-1.2);this.sky.mesh.rotation.x=-Math.PI/2-.42;
  this.palmSeals=[new MagicMandala(this.root,.32,false),new MagicMandala(this.root,.32,false)];
  const coreMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color(1.4,.8,.24),transparent:true,opacity:0,depthWrite:false});
  const coreGeometry=new THREE.IcosahedronGeometry(.065,1);
  this.cores=[new THREE.Mesh(coreGeometry,coreMaterial),new THREE.Mesh(coreGeometry,coreMaterial)];this.cores.forEach(o=>this.root.add(o));
  this.light=new THREE.PointLight('#ffc85a',0,17,2);this.root.add(this.light);
  this.impactLight=new THREE.PointLight('#ffb953',0,12,2);this.impactLight.position.set(7.5,3,1);this.root.add(this.impactLight);
  this.configure();this.reset();
 }
 configure(){
  this.storm.configure(this.config);this.timeline.impactTime=this.storm.firstImpact;this.timeline.lastImpact=this.storm.lastImpact;this.timeline.duration=this.storm.duration;
  const saved=this.avatar.time;this.bolts.configure(this.config,this.sourceSampler,this.targetSampler);this.avatar.update(saved,this.config);
  this.sampleTarget(this.timeline.time,this.samplePoint);
 }
 bindActors(actors){this.actors=actors;this.dirty=true;}
 bindFighter(fighter){this.fighter=fighter;this.avatar.bind(fighter);this.dirty=true;}
 castingTimeAt(t){return t<=1.95?t:1.95+(t-1.95)/Math.max(.1,this.timeline.duration-1.95)*(5.8-1.95);}
 get castingTime(){return this.castingTimeAt(this.timeline.time);}
 sampleHalo(time,ring,angle,out){
  this.avatar.update(this.castingTimeAt(time),this.config);
  const layer=this.avatar.halo.layers[ring];layer.mesh.updateWorldMatrix(true,false);
  return layer.mesh.localToWorld(out.set(Math.cos(angle)*.85,Math.sin(angle)*.85,.025));
 }
 sampleTarget(time,out){
  let boundary=this.timeline.impactTime;for(const e of this.storm.events)if(e.hero&&e.hit<=time)boundary=e.hit;
  if(this.actors?.sampleTargetPosition)this.actors.sampleTargetPosition(time,boundary,out);else out.copy(this.target);
  return out;
 }
 present(){
  const t=this.timeline.time,tl=this.timeline,alive=tl.phase!=='idle',open=smooth(t,.02,.9),fade=1-smooth(t,tl.duration-1,tl.duration),strength=open*fade;
  this.fighter?.update(this.castingTime);
  if(this.fighter?.status==='ready'){this.base.copy(this.fighter.left);this.tip.copy(this.fighter.right);}else{this.base.set(-8.4,1.5,-.45);this.tip.set(-8.4,1.5,.45);}
  this.avatar.update(this.castingTime,this.config);
  this.ground.update(t,open,strength*.82,this.config.divineColor);
  this.targetSeal.mesh.scale.setScalar(4.4*(this.config.impactRadius??1.6)/1.6);
  this.targetSeal.update(-t,smooth(t,.85,1.7),strength*.65,'#9f42ff');
  this.sky.update(t*.65,smooth(t,1.05,1.85),strength*.58*(1-smooth(t,3.6,4.5)),this.config.divineColor);
  const handPower=smooth(t,.03,.45)*(1-smooth(t,2.2,3.6));
  for(let i=0;i<2;i++){const hand=i?this.tip:this.base;this.palmSeals[i].mesh.position.copy(hand);this.palmSeals[i].mesh.quaternion.copy(this.camera.quaternion);this.palmSeals[i].update(t*(i?1:-1),open,handPower*.8,this.config.divineColor);this.cores[i].position.copy(hand);this.cores[i].visible=alive&&handPower>.01;}
  this.cores[0].material.opacity=handPower;
  this.light.position.copy(this.base).add(this.tip).multiplyScalar(.5);this.light.position.y+=.8;this.light.intensity=alive?strength*2.2:0;
  let leader=this.storm.events.find(e=>t>=e.launch&&t<e.hit&&e.hero);
  if(!leader)leader=this.storm.events.find(e=>t>=e.launch&&t<e.hit);
  if(leader)meteorPosition(leader,t,this.position);else this.position.copy(t<1.6?this.origin:this.target);
  if(!alive){this.storm.reset();this.bolts.reset();this.avatar.group.visible=false;this.impactLight.intensity=0;}
 }
 refreshView(){
  if(!this.active||this.timeline.phase==='idle')return;
  this.storm.update(this.timeline.time);this.bolts.update(this.timeline.time);this.impactLight.intensity=this.storm.impactPulse*5;
  this.palmSeals.forEach(s=>s.mesh.quaternion.copy(this.camera.quaternion));
 }
 update(dt,realDt=dt){
  if(!this.active||this.disposed)return;
  if(this.dirty){const ratio=this.timeline.time/this.timeline.duration;this.configure();this.timeline.time=ratio*this.timeline.duration;this.dirty=false;}
  if(this.timeline.phase==='idle'){
    if(this.config.autoLoop&&this.timeline.playing){this.loopWait+=realDt;if(this.loopWait>.9)this.fire();}return;
  }
  this.timeline.advance(Math.max(0,dt)*(this.config.playbackSpeed??1));this.present();
 }
 seek(time){this.timeline.time=clamp(time,0,this.timeline.duration);this.present();this.refreshView();}
 fire(){this.configure();this.reset();this.timeline.playing=true;this.loops++;this.present();}
 reset(){this.timeline.reset();this.loopWait=0;this.storm.reset();this.bolts.reset();this.light.intensity=this.impactLight.intensity=0;this.avatar.update(0,this.config);for(const s of [this.ground,this.targetSeal,this.sky,...this.palmSeals])s.update(0,0,0);this.cores.forEach(c=>c.visible=false);}
 setActive(active){this.active=active;this.root.visible=active;if(!active)this.reset();}
 dispose(){if(this.disposed)return;this.disposed=true;this.avatar.dispose();this.storm.dispose();this.bolts.dispose();for(const s of [this.ground,this.targetSeal,this.sky,...this.palmSeals])s.dispose();this.cores[0].geometry.dispose();this.cores[0].material.dispose();this.root.removeFromParent();}
}
