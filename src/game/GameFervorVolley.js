import { heightAt, distance } from './GameData.js';

/** The renderer and combat use the same world-space sockets. Adding a stack
 * never repositions older blades; each complete row contains five pairs. */
export function fervorSource(index,time,player,out){
  const side=index%2===0?1:-1,row=Math.floor(index/10),pair=Math.floor(index%10/2);
  const x=side*(.6+pair*.36+row*.12),z=-.65-pair*.1-row*.34;
  const s=Math.sin(player.yaw),c=Math.cos(player.yaw);
  out.x=player.x+x*c+z*s;out.z=player.z-x*s+z*c;
  out.y=heightAt(player.x,player.z)+2.45-pair*.23+row*.37+Math.sin(time*1.8+index*.7)*.045;
  out.tilt=-side*(.28+pair*.14);return out;
}

/** Bounded, damage-bearing echoes. Repeated attacks refresh one barrage rather
 * than queueing unbounded volleys. Four launch slots per 120 ms at most. */
export class GameFervorVolley{
  constructor(state){this.state=state;this.source={x:0,y:0,z:0,tilt:0};this.firedAt=new Float64Array(50).fill(-100);this.reset();}
  reset(){this.active=false;this.next=0;this.refreshUntil=-1;this.firedAt.fill(-100);}
  request(target){
    const s=this.state;if(!s.growth.stacks||!target||target.hp<=0)return;
    if(this.active){this.refreshUntil=s.time+.55;return;}
    this.active=true;this.count=s.growth.stacks;this.next=0;this.nextAt=s.time+.15;
    this.deadline=s.time+3.4;this.target=target;this.damage=s.stats.damage*.1;
    this.color=s.growth.color;this.rank=s.growth.finishTier;this.radius=s.growth.finishRadius;
  }
  update(){
    const s=this.state;if(!this.active)return;
    if(s.dead||s.time>this.deadline){this.reset();return;}
    if(s.time<this.nextAt)return;
    const target=s.aimTarget(this.target.x,this.target.z,26);
    if(!target){this.active=false;this.refreshUntil=-1;return;}
    this.target=target;
    for(let n=0;n<4&&this.next<this.count;n++){
      const i=this.next,source=fervorSource(i,s.time,s.player,this.source),finisher=i===this.count-1&&this.rank>0;
      const angle=Math.atan2(target.x-source.x,target.z-source.z),arc=(i%2?-.4:.4);
      const p=s.launch('fervor','player',source.x,source.z,angle+arc,this.damage*(finisher?1+this.rank*.3:1),{
        y:source.y,target,speed:22+(i%3)*2,radius:.25,life:2,arc,
        fervor:true,sourceIndex:i,aspect:s.kind,finisher,finishTier:this.rank,finishRadius:this.radius,
        color:this.color,radiance:finisher?1.6:1.3,scale:finisher?1.15:.7,tier:0,echo:true,
      });
      if(!p)break;
      this.firedAt[i]=s.time;this.next++;
    }
    this.nextAt=s.time+.12;
    if(this.next===this.count){
      this.active=false;
      if(this.refreshUntil>s.time){this.refreshUntil=-1;this.request(target);}
    }
  }
  impact(projectile,enemy){
    if(!projectile.finisher)return;
    const s=this.state;
    for(const other of s.enemies)if(other!==enemy&&other.hp>0&&distance(other,enemy)<projectile.finishRadius){
      s.hit(other,projectile.damage*.6,'fervor',{...projectile,fervorSplash:true});
    }
  }
}
