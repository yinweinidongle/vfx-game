import { heightAt, isLand,segmentDistance } from './GameData.js';
import { AWAKENING_DURATION, AWAKENING_RANGE, awakeningStyle } from './AwakeningConfig.js';

/** Four bounded strike waves. Visuals and damage share the same actual impact positions. */
export class GameAwakening {
  constructor(state) {
    this.state=state;this.active=false;this.age=0;this.generation=0;
    this.strikes=Array.from({length:192},(_,id)=>({id,active:false,hit:false,warned:false}));
    this.icePlans=Array.from({length:360},(_,id)=>({id,active:false}));this.iceCount=0;this.warnPulse=0;
    this.hitByWave=Array.from({length:9},()=>new Set());this.count=0;
  }
  eligible(e) { return e.hp>0&&e.state!=='return'&&(e.spawnGrace||0)<=0&&Math.hypot(e.x-this.x,e.z-this.z)<=AWAKENING_RANGE; }
  begin(index=3) {
    const s=this.state,p=s.player;this.reset();this.active=true;this.index=index;this.generation++;this.x=p.x;this.z=p.z;this.yaw=p.yaw;this.damage=s.stats.damage*s.spirit.damage;this.style=awakeningStyle(s.kind,index);
    this.duration=this.style.duration||AWAKENING_DURATION;
    if(index>=4){
      this.target=s.lockedTarget;this.cx=this.target?.x??p.x;this.cz=this.target?.z??p.z;this.pulse=0;this.warnPulse=0;this.iceCount=0;this.marked=false;this.locked=false;
      s.emit('awakening',{index,kind:s.kind,x:this.x,z:this.z,targetX:this.cx,targetZ:this.cz,yaw:p.yaw,...this.style});return;
    }
    // Snapshot the invocation power, then track moving enemies only until each strike lands.
    this.targets=s.enemies.filter(e=>this.eligible(e)).slice(0,32);
    for(const hits of this.hitByWave)hits.clear();
    for(let wave=0;wave<4;wave++){
      for(let i=0;i<this.targets.length;i++)this.add(this.targets[i].x,this.targets[i].z,.74+wave*.76+(wave===3?0:i*.017),wave,this.targets[i],wave===3?1.3:1);
      // A staggered spiral fills the whole visible battlefield, without creating strikes over the sea.
      const total=wave===3?8:14;
      for(let i=0;i<total;i++){
        const a=i*2.399963+wave*1.12,r=3+Math.sqrt((i+.5)/total)*19,x=this.x+Math.sin(a)*r,z=this.z+Math.cos(a)*r;
        if(isLand(x,z,.2))this.add(x,z,.62+wave*.76+i*.026,wave,null,wave===3?1.3:.8);
      }
    }
    s.emit('awakening',{index,kind:s.kind,x:this.x,z:this.z,yaw:p.yaw,color:this.style.color,name:this.style.name,line:this.style.line});
  }
  add(x,z,at,wave,target,power) {
    if(this.count>=this.strikes.length)return;
    Object.assign(this.strikes[this.count++],{active:true,hit:false,warned:false,x,z,y:heightAt(x,z),at,wave,target,power,generation:this.generation});
  }
  update(dt) {
    if(!this.active)return;if(this.state.dead){this.reset();return;}this.age+=dt;
    if(this.index>=4){this.updateAscendant();return;}
    for(let i=0;i<this.count;i++){
      const strike=this.strikes[i];if(strike.hit)continue;
      if(strike.target?.hp>0&&this.eligible(strike.target)){strike.x=strike.target.x;strike.z=strike.target.z;strike.y=heightAt(strike.x,strike.z);}
      if(!strike.warned&&this.age>=strike.at-.22){strike.warned=true;this.state.emit('thunderMark',{strike,color:this.style.color});}
      if(this.age<strike.at)continue;
      strike.hit=true;const hits=this.hitByWave[strike.wave],radius=strike.wave===3?3.4:2.25;
      // One damage application per enemy per wave, regardless of overlapping telegraphs.
      for(const enemy of this.state.enemies){
        if(!this.eligible(enemy)||hits.has(enemy.id)||Math.hypot(enemy.x-strike.x,enemy.z-strike.z)>radius+enemy.scale*.3)continue;
        hits.add(enemy.id);this.state.hit(enemy,this.damage*(strike.wave===3?4.5:2.1),'awakening',{color:this.style.color,radiance:1.8,skillAccent:this.style.accent});
      }
      this.state.emit('thunderStrike',{x:strike.x,y:strike.y,z:strike.z,wave:strike.wave,power:strike.power,color:this.style.color,accent:this.style.accent,seed:strike.id+this.generation*37});
    }
    if(this.age>=AWAKENING_DURATION){this.active=false;this.state.emit('awakeningEnd');}
  }
  updateAscendant(){
    const s=this.state,t=this.age,blade=this.index===4,lockAt=blade?.92:.75;
    if(!this.locked&&this.target?.hp>0&&this.eligible(this.target)){this.cx=this.target.x;this.cz=this.target.z;this.yaw=Math.atan2(this.cx-this.x,this.cz-this.z);}
    if(t>=lockAt)this.locked=true;
    // Telegraph and rendered effect use this same, eventually locked, anchor.
    if(!this.marked&&t>=.12){this.marked=true;s.emit('ascendantField',{index:this.index,x:this.cx,y:heightAt(this.cx,this.cz),z:this.cz,yaw:this.yaw,radius:blade?4:10.5});}
    if(blade){
      while(this.pulse<2&&t>=[1.25,2.02][this.pulse]){
        const wave=this.pulse++,half=7,dx=Math.sin(this.yaw)*half,dz=Math.cos(this.yaw)*half;
        for(const e of s.enemies){if(!this.eligible(e)||segmentDistance(e.x,e.z,this.cx-dx,this.cz-dz,this.cx+dx,this.cz+dz)>4+e.scale*.25)continue;
          s.hit(e,this.damage*(wave===0?8.8:3.2),'awakening',{color:this.style.color,radiance:2,skillAccent:this.style.accent});e.stagger=Math.max(e.stagger,.6);
        }
        s.emit('heavenCleave',{x:this.cx,y:heightAt(this.cx,this.cz),z:this.cz,yaw:this.yaw,wave,color:this.style.color});
      }
    }else{
      while(this.warnPulse<9&&t>=1.12+this.warnPulse*.38-.28){
        const wave=this.warnPulse++,at=1.12+wave*.38;let count=0;
        for(const e of s.enemies){if(!this.eligible(e)||Math.hypot(e.x-this.cx,e.z-this.cz)>10.5+e.scale*.25||count++>=40)continue;
          const plan=this.icePlans[this.iceCount++];Object.assign(plan,{active:true,x:e.x,y:heightAt(e.x,e.z),z:e.z,wave,at,seed:e.id+wave*71+this.generation*137,final:wave===8});
          s.emit('glacialLance',{x:plan.x,y:plan.y,z:plan.z,seed:plan.seed,wave,final:plan.final,duration:Math.max(.01,at-t)});
        }
      }
      while(this.pulse<9&&t>=1.12+this.pulse*.38){
        const wave=this.pulse++,final=wave===8,hits=this.hitByWave[wave];
        for(let i=0;i<this.iceCount;i++){const plan=this.icePlans[i];if(plan.wave!==wave)continue;
          for(const e of s.enemies){if(hits.has(e.id)||!this.eligible(e)||Math.hypot(e.x-this.cx,e.z-this.cz)>10.5+e.scale*.25||Math.hypot(e.x-plan.x,e.z-plan.z)>2.4+e.scale*.25)continue;
            hits.add(e.id);s.hit(e,this.damage*(final?4.8:1.05),'awakening',{color:this.style.color,radiance:1.7,skillAccent:this.style.accent});e.frozen=Math.max(e.frozen,e.type==='boss'?.16:e.elite?.3:.6);
          }
          s.emit('glacialStrike',{x:plan.x,y:plan.y,z:plan.z,wave,seed:plan.seed,final});
        }
        s.emit('glacialPulse',{x:this.cx,y:heightAt(this.cx,this.cz),z:this.cz,wave,final,radius:10.5});
      }
    }
    if(t>=this.duration){this.active=false;s.emit('awakeningEnd');}
  }
  reset(){this.iceCount=0;this.warnPulse=0;for(const plan of this.icePlans)plan.active=false;this.active=false;this.age=0;this.count=0;for(const strike of this.strikes){strike.active=false;strike.hit=true;}for(const hits of this.hitByWave)hits.clear();}
}
