import { heightAt, isLand } from './GameData.js';
import { AWAKENING_DURATION, AWAKENING_RANGE, awakeningStyle } from './AwakeningConfig.js';

/** Four bounded strike waves. Visuals and damage share the same actual impact positions. */
export class GameAwakening {
  constructor(state) {
    this.state=state;this.active=false;this.age=0;this.generation=0;
    this.strikes=Array.from({length:192},(_,id)=>({id,active:false,hit:false,warned:false}));
    this.hitByWave=Array.from({length:4},()=>new Set());this.count=0;
  }
  eligible(e) { return e.hp>0&&e.state!=='return'&&(e.spawnGrace||0)<=0&&Math.hypot(e.x-this.x,e.z-this.z)<=AWAKENING_RANGE; }
  begin() {
    const s=this.state,p=s.player;this.reset();this.active=true;this.generation++;this.x=p.x;this.z=p.z;this.yaw=p.yaw;this.damage=s.stats.damage*s.spirit.damage;this.style=awakeningStyle(s.kind);
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
    s.emit('awakening',{kind:s.kind,x:this.x,z:this.z,yaw:p.yaw,color:this.style.color,name:this.style.name,line:this.style.line});
  }
  add(x,z,at,wave,target,power) {
    if(this.count>=this.strikes.length)return;
    Object.assign(this.strikes[this.count++],{active:true,hit:false,warned:false,x,z,y:heightAt(x,z),at,wave,target,power,generation:this.generation});
  }
  update(dt) {
    if(!this.active)return;if(this.state.dead){this.reset();return;}this.age+=dt;
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
  reset(){this.active=false;this.age=0;this.count=0;for(const strike of this.strikes){strike.active=false;strike.hit=true;}for(const hits of this.hitByWave)hits.clear();}
}
