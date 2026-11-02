import { heightAt, clamp } from './GameData.js';

const CAPACITY=160,HISTORY=32;
const random=i=>{const n=Math.sin(i*127.1+13.7)*43758.5453;return n-Math.floor(n);};
const point=()=>({x:0,y:0,z:0});
const stateRadiance=state=>state.growth?.radiance||1.15;

/** Live, damage-bearing homing bolts. HaloBolts renders these exact flight histories. */
export class GameHaloVolley{
  constructor(state){
    this.state=state;this.active=false;this.count=0;this.next=0;
    this.bolts=Array.from({length:CAPACITY},(_,i)=>({i,live:true,started:false,alive:false,impact:false,
      start:point(),end:point(),p1:point(),history:new Float32Array(HISTORY*3),historyCount:0,
      x:0,y:0,z:0,vx:0,vy:0,vz:0,launch:Infinity,hit:Infinity,sampleTime:0,size:.055+random(i+11)*.03}));
  }
  begin(event,count,damage){
    this.reset();this.active=true;this.count=clamp(Math.round(count),1,CAPACITY);this.startedAt=this.state.time;this.originX=event.x-Math.sin(event.yaw)*2.5;
    this.originZ=event.z-Math.cos(event.yaw)*2.5;this.baseY=heightAt(this.originX,this.originZ);this.yaw=event.yaw;this.damage=damage;this.style={color:event.color,tier:event.tier||0,radiance:stateRadiance(this.state)};
  }
  target(x,z,offset=0){
    let best=null,score=Infinity;
    for(const e of this.state.enemies){
      if(e.hp<=0||e.state==='return'||Math.hypot(e.x-this.originX,e.z-this.originZ)>30)continue;
      const d=Math.hypot(e.x-x,e.z-z)+((e.id+offset)%3)*2.4;
      if(d<score){score=d;best=e;}
    }return best;
  }
  emit(b,time){
    const target=this.target(this.originX,this.originZ,b.i);if(!target)return;
    const ring=b.i%2,a=-.63+random(b.i+4)*4.4,r=(ring?5.25*.925:6.1*.974)*.64*.92;
    const x=Math.cos(a)*r,y=3.4+Math.sin(a)*r,z=-.8+(ring?0:-.48*.64*.92),s=Math.sin(this.yaw),c=Math.cos(this.yaw);
    Object.assign(b,{started:true,alive:true,impact:false,target,launch:time,hit:Infinity,historyCount:1,sampleTime:time});
    b.x=this.originX+c*x+s*z;b.y=this.baseY+y;b.z=this.originZ-s*x+c*z;
    Object.assign(b.start,{x:b.x,y:b.y,z:b.z});
    const side=Math.sign(x)||1;
    b.vx=c*side*(4+random(b.i+10)*3)+s*5;b.vz=-s*side*(4+random(b.i+10)*3)+c*5;b.vy=2+random(b.i+20)*4;
    Object.assign(b.p1,{x:b.x+b.vx,y:b.y+b.vy,z:b.z+b.vz});
    Object.assign(b.end,{x:target.x,y:heightAt(target.x,target.z)+target.scale*.9,z:target.z});
    for(let j=0;j<HISTORY;j++){b.history[j*3]=b.x;b.history[j*3+1]=b.y;b.history[j*3+2]=b.z;}
  }
  update(dt){
    if(!this.active)return;
    const time=this.state.time,age=time-this.startedAt;
    while(this.next<this.count&&age>=.5+this.next/Math.max(1,this.count-1)*1.85){this.emit(this.bolts[this.next],time);this.next++;}
    let alive=false;
    for(const b of this.bolts){
      if(!b.started)continue;
      if(!b.alive){if(time-b.hit<.75)alive=true;continue;}
      alive=true;const elapsed=time-b.launch;
      if(!b.target||b.target.hp<=0||b.target.state==='return')b.target=this.target(b.x,b.z,b.i);
      if(b.target)Object.assign(b.end,{x:b.target.x,y:heightAt(b.target.x,b.target.z)+b.target.scale*.9,z:b.target.z});
      const dx=b.end.x-b.x,dy=b.end.y-b.y,dz=b.end.z-b.z,d=Math.hypot(dx,dy,dz),speed=14+Math.min(1,elapsed*1.7)*15;
      const turn=(1-Math.exp(-dt*(5+elapsed*8)))*clamp((elapsed-.09)*8,0,1);
      if(d>.001){b.vx+=(dx/d*speed-b.vx)*turn;b.vy+=(dy/d*speed-b.vy)*turn;b.vz+=(dz/d*speed-b.vz)*turn;}
      const travel=Math.hypot(b.vx,b.vy,b.vz)*dt;
      if(d<Math.max(.5,travel+.14)){
        b.x=b.end.x;b.y=b.end.y;b.z=b.end.z;b.alive=false;b.hit=time;b.impact=Boolean(b.target?.hp>0);
        if(b.impact)this.state.hit(b.target,this.damage,'halo',this.style);
      }else{b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;}
      if(elapsed>2.5){b.alive=false;b.hit=time;b.impact=false;Object.assign(b.end,{x:b.x,y:b.y,z:b.z});}
      b.history.copyWithin(3,0,(HISTORY-1)*3);b.history[0]=b.x;b.history[1]=b.y;b.history[2]=b.z;
      b.historyCount=Math.min(HISTORY,b.historyCount+1);b.sampleTime=time;
    }
    if(this.next>=this.count&&!alive)this.active=false;
  }
  reset(){this.active=false;this.count=0;this.next=0;for(const b of this.bolts){b.started=b.alive=b.impact=false;b.launch=b.hit=Infinity;b.historyCount=0;}}
}
