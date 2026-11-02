import * as T from 'three';
import { heightAt } from './GameData.js';
import { awakeningStyle } from './AwakeningConfig.js';

/** Short, cancellable skill shots; gameplay and UI continue to run. */
export class GameSkillCamera{
  constructor(game){
    this.game=game;this.age=100;this.duration=0;this.weight=0;this.index=-1;this.cancelled=false;this.label='';
    this.origin=new T.Vector3();this.target=new T.Vector3();this.focus=new T.Vector3();this.eye=new T.Vector3();this.forward=new T.Vector3();this.side=new T.Vector3();
  }
  begin(index){
    if(this.game.settings.skillCamera===false)return;
    const p=this.game.state.player,target=this.game.state.lockedTarget;
    this.age=0;this.duration=index===3?4.85:index===2?4.15:T.MathUtils.clamp(Math.hypot((target?.x??p.x)-p.x,(target?.z??p.z)-p.z)/24/(index===0?.52:.6)+.4,1.22,2.45);this.index=index;this.cancelled=false;this.trackedHalo=null;
    this.origin.set(p.x,heightAt(p.x,p.z)+1.2,p.z);this.target.set(target?.x??p.x,heightAt(target?.x??p.x,target?.z??p.z)+1.3,target?.z??p.z);
    this.closeRange=this.origin.distanceTo(this.target)<6;
    this.forward.set(Math.sin(p.yaw),0,Math.cos(p.yaw));this.side.set(this.forward.z,0,-this.forward.x);
    this.bolt=this.game.state.projectiles.find(b=>b.alive&&!b.primary&&b.kind===(index===0?'frost':'slash')&&b.age<.15);
  }
  cancel(){if(this.age<this.duration&&!this.cancelled){this.cancelled=true;this.age=Math.max(this.age,this.duration-.25);}}
  get timeScale(){return this.index===3?1:!this.cancelled&&this.age<this.duration-.25?(this.index===0?.52:this.index===1?.6:this.age<.85?.85:1):1;}
  update(dt,normalEye,normalTarget){
    this.age+=dt;const t=this.age,g=this.game;let fov=44;
    if(g.settings.skillCamera===false)this.cancel();
    if(t<this.duration){
      const weight=T.MathUtils.smoothstep(t,0,.14)*(1-T.MathUtils.smoothstep(t,this.duration-.28,this.duration));this.weight=weight;
      if(this.index===3){
        const pull=T.MathUtils.smoothstep(t,.6,1.6),orbit=Math.max(0,t-1.6)*.045;
        this.focus.copy(this.origin).lerp(this.target,pull*.35);this.focus.y=heightAt(this.focus.x,this.focus.z)+1.1;
        this.eye.copy(this.focus).addScaledVector(this.forward,5.2-pull*21).addScaledVector(this.side,2+pull*15+orbit*9);this.eye.y+=1.1+pull*27;
        fov=36+pull*15;this.label=awakeningStyle(g.state.kind).name+(t<1.1?' · 觉醒':' · 万雷临世');
      }else if(this.index<2){
        if(this.bolt?.alive)this.focus.set(this.bolt.x,this.bolt.y,this.bolt.z);else this.focus.copy(this.target);
        if(this.index===0){
          const reverse=t>.42;this.eye.copy(this.focus).addScaledVector(this.forward,reverse?4.7:-5).addScaledVector(this.side,reverse?2.8:3.6);this.eye.y+=2.1;fov=38;
          this.label=reverse?'寒霜贯星 · 反打命中':'寒霜贯星 · 追箭';
          if(this.closeRange){this.focus.copy(this.origin).lerp(this.target,.55);this.eye.copy(this.focus).addScaledVector(this.forward,-7).addScaledVector(this.side,6);this.eye.y+=4.5;fov=46;this.label='寒霜贯星 · 近身穿击';}
        }else{
          this.eye.copy(this.focus).addScaledVector(this.side,6.2).addScaledVector(this.forward,-4.5+t*2);this.eye.y+=3;fov=44;
          this.label=t<.55?'苍雷断空 · 出鞘':'苍雷断空 · 掠空';
          if(this.closeRange){this.eye.copy(this.focus).addScaledVector(this.side,8).addScaledVector(this.forward,-5);this.eye.y+=4.5;fov=46;}
        }
      }else if(t<1.05){
        this.focus.copy(this.origin).addScaledVector(this.forward,-2.5);this.focus.y+=2.3;
        this.eye.copy(this.origin).addScaledVector(this.forward,5.5).addScaledVector(this.side,7);this.eye.y+=.8+t*1.1;fov=46;this.label='法相天劫 · 显圣';
      }else if(t<2.65){
        if(!this.trackedHalo)this.trackedHalo=g.state.haloVolley.bolts.find(b=>b.alive);
        const b=this.trackedHalo;
        if(b)this.focus.set(b.x,b.y,b.z);else this.focus.copy(this.origin).lerp(this.target,.55);
        this.eye.copy(this.focus).addScaledVector(this.forward,-6).addScaledVector(this.side,7);this.eye.y+=4;fov=48;this.label='法相天劫 · 灵光追魂';
      }else{
        this.focus.copy(this.target);this.focus.y+=1;
        this.eye.copy(this.target).addScaledVector(this.side,10).addScaledVector(this.forward,-7);this.eye.y+=8;fov=47;this.label='法相天劫 · 陨星镇敌';
      }
      this.eye.y=Math.max(heightAt(this.eye.x,this.eye.z)+1.65,this.eye.y);
      normalEye.lerp(this.eye,weight);normalTarget.lerp(this.focus,weight);fov=44+(fov-44)*weight;
    }else{this.label='';this.weight=0;}
    const next=T.MathUtils.damp(g.camera.fov,fov,10,dt);if(Math.abs(next-g.camera.fov)>.001){g.camera.fov=next;g.camera.updateProjectionMatrix();}
  }
}
