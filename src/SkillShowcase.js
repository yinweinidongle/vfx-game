import * as THREE from 'three';
import { IceArrowSkill } from './vfx/IceArrowSkill.js';
import { SwordSlashSkill } from './vfx/sword/SwordSlashSkill.js';
import { CultivatorSkill } from './vfx/cultivator/CultivatorSkill.js';

/** Stable UI / camera interface while the selected character changes. */
export class SkillShowcase {
  constructor(scene,camera,config,actors,swordsman,statusFX,cultivator=null){
    this.cultivatorActor=cultivator;this.sharedConfig=config;this.actors=actors;this.swordsman=swordsman;this.statusFX=statusFX;this.disposed=false;
    this.iceRoot=new THREE.Group();this.iceRoot.name='Ice archer skill';scene.add(this.iceRoot);
    this.ice=new IceArrowSkill(this.iceRoot,camera,config);this.ice.kind='ice';
    this.sword=new SwordSlashSkill(scene,camera,config);
    this.cultivator=cultivator?new CultivatorSkill(scene,camera,config):null;
    this.skills={ice:this.ice,sword:this.sword,...(this.cultivator?{cultivator:this.cultivator}:{})};this.active=this.skills[config.character]||this.sword;
    this.select(config.character||'sword',false);
  }
  select(kind,replay=true){
    if(this.disposed)return;
    kind=this.skills[kind]?kind:'sword';
    for(const value of Object.values(this.skills))value.reset();this.sharedConfig.character=kind;this.active=this.skills[kind];
    this.ice.light.intensity=0;
    this.iceRoot.visible=kind==='ice';this.sword.setActive(kind==='sword');this.swordsman.setVisible(kind==='sword');
    if(this.actors.shooter)this.actors.shooter.wrapper.visible=kind==='ice';
    this.actors.bow.visible=kind==='ice';
    this.cultivator?.setActive(kind==='cultivator');this.cultivatorActor?.setVisible(kind==='cultivator');
    this.statusFX.update(0,0,'idle',this.timeline.impactTime);this.statusFX.group.visible=kind==='ice';
    if(replay)this.fire();
    this.updateActors(0);
  }
  bindActors(){this.ice.bindActors(this.actors);this.sword.bindFighter(this.swordsman);if(this.cultivator){this.cultivator.bindFighter(this.cultivatorActor);this.cultivator.bindActors(this.actors);}this.select(this.sharedConfig.character,false);}
  get kind(){return this.active.kind;}
  get config(){return this.active.config;}
  get timeline(){return this.active.timeline;}
  get position(){return this.active.position;}
  get origin(){return this.active.origin;}
  get target(){return this.active.target;}
  get direction(){return this.active.direction;}
  get flightEnd(){return this.active.flightEnd;}
  get homingTarget(){return this.active.homingTarget||this.active.target;}
  get homing(){return this.ice.homing;}
  get blade(){return this.sword.blade;}
  get fighter(){return this.active.fighter;}
  get base(){return this.active.base;}
  get tip(){return this.active.tip;}
  get loops(){return this.active.loops;}
  set dirty(value){this.active.dirty=value;}
  get dirty(){return this.active.dirty;}
  fire(){this.active.fire();}
  seek(time){this.active.seek(time);}
  update(dt,realDt){if(!this.disposed)this.active.update(dt,realDt);}
  refreshView(){this.active.refreshView();}
  updateActors(dt){
    if(this.disposed)return;
    const tl=this.timeline;
    this.actors.effectColor=this.kind==='cultivator'?this.sharedConfig.divineColor:this.kind==='sword'?this.sharedConfig.lightningColor:null;
    let impactBoundary=tl.impactTime;
    if(this.kind==='cultivator')for(const e of this.cultivator.storm.events)if(e.hero&&e.hit<=tl.time)impactBoundary=e.hit;
    this.actors.update(dt,tl.time,tl.phase,impactBoundary);
    if(this.kind==='sword'){
      this.swordsman.update(tl.time,tl.phase,tl.impactTime);
      this.statusFX.update(0,0,'idle',tl.impactTime);
      this.statusFX.group.visible=false;
    }else if(this.kind==='cultivator'){
      this.cultivatorActor.update(this.cultivator.castingTime);
      this.statusFX.update(0,0,'idle',tl.impactTime);this.statusFX.group.visible=false;
    }else this.statusFX.update(dt,tl.time,tl.phase,tl.impactTime);
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.ice.dispose();this.sword.dispose();this.cultivator?.dispose();this.iceRoot.removeFromParent();}
}
