const smooth=(t,a,b)=>{const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x);};
/** +Y is the blade's length, +X its cutting edge. Hilt rests on ground before/after a real edge-first chop. */
export function sampleHeavenBlade(age,cx,cz,yaw,ground,out={}){
 const chop=smooth(age,.94,1.25),recover=smooth(age,1.4,1.94),pitch=chop*(1-recover)*Math.PI/2;
 const lift=Math.sin(chop*Math.PI)*4.5*(1-recover);
 out.x=cx-Math.sin(yaw)*5.8;out.z=cz-Math.cos(yaw)*5.8;out.y=ground+.13+lift+Math.sin(pitch)*.72;
 out.pitch=pitch;out.roll=-Math.PI/2;out.yaw=yaw;return out;
}
