const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
/** Four damped cloth control points and two inertial wing hinges. No random frame-dependent forcing. */
export class GearDynamics{
 constructor(){this.cloak=new Float32Array(16);this.wings=new Float32Array(2);this.position=new Float64Array(8);this.velocity=new Float64Array(8);this.hingeVelocity=new Float64Array(2);this.ready=false;this.phase=0;this.speed=0;}
 reset(p){this.x=p.x;this.z=p.z;this.yaw=p.yaw;this.vx=this.vz=0;this.ready=true;this.position.fill(0);this.velocity.fill(0);this.cloak.fill(0);this.wings.fill(0);this.hingeVelocity.fill(0);}
 update(dt,p,time=0){
  if(!this.ready){this.reset(p);return;}if(dt<=0)return;dt=Math.min(dt,.08);
  const dx=p.x-this.x,dz=p.z-this.z;if(Math.hypot(dx,dz)>4){this.reset(p);return;}
  const sin=Math.sin(p.yaw),cos=Math.cos(p.yaw),vx=(dx*cos-dz*sin)/dt,vz=(dx*sin+dz*cos)/dt,turn=clamp(angle(p.yaw-this.yaw)/dt,-9,9),blend=1-Math.exp(-dt*12);
  const ax=clamp((vx-this.vx)/dt,-35,35),az=clamp((vz-this.vz)/dt,-35,35);this.vx+=(vx-this.vx)*blend;this.vz+=(vz-this.vz)*blend;this.speed=Math.hypot(this.vx,this.vz);
  const steps=Math.ceil(dt/(1/120)),h=dt/steps;
  for(let k=0;k<steps;k++){
   this.phase+=h;
   for(let i=0;i<4;i++){
    const w=(i+1)/4,parentX=i?this.position[(i-1)*2]:0,parentZ=i?this.position[(i-1)*2+1]:0;
    const x=clamp(-this.vx*.009*w-ax*.0015*w-turn*.015*w*w+Math.sin(time*1.7-w*3.4)*.011*w,-.22,.22),z=clamp(-this.vz*.018*w-az*.0018*w-Math.abs(turn)*.008*w+Math.sin(time*2.-w*3.)*.018*w,-.32,.13);
    for(let j=0;j<2;j++){const id=i*2+j,target=(j?z:x)*.65+(j?parentZ:parentX)*.5;this.velocity[id]+=((target-this.position[id])*34-this.velocity[id]*6.8)*h;this.position[id]=clamp(this.position[id]+this.velocity[id]*h,-.34,.34);}
   }
   for(let side=0;side<2;side++){
    const sign=side?1:-1,target=.055+Math.sin(time*1.5+side*.2)*.035+Math.min(.19,this.speed*.016)+sign*turn*.025-az*.002;
    this.hingeVelocity[side]+=((target-this.wings[side])*27-this.hingeVelocity[side]*5.8)*h;this.wings[side]=clamp(this.wings[side]+this.hingeVelocity[side]*h,-.28,.42);
   }
  }
  for(let i=0;i<4;i++){const w=(i+1)/4;this.cloak[i*4]=this.position[i*2];this.cloak[i*4+1]=this.position[i*2+1];this.cloak[i*4+2]=Math.sin(time*2.7-w*4.5)*(.008+Math.min(.02,this.speed*.002))*w*w;this.cloak[i*4+3]=clamp(Math.abs(this.position[i*2+1])*.2,0,.045);}
  this.x=p.x;this.z=p.z;this.yaw=p.yaw;
 }
}
