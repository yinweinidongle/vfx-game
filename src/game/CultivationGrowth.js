const bounded=n=>Math.max(0,Math.min(50,Math.floor(Number(n)||0)));
const blend=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
export const SHIELD_STAGES=Object.freeze([
  [1,'#e2f3f2','浅色'],[5,'#ffd6d3','浅红色'],[10,'#ffa6a1','淡红'],
  [20,'#f34b57','红'],[35,'#c42040','深红'],[50,'#a60728','血红'],
]);

export function vitalityGrowth(stacks){
  const level=bounded(stacks),capacity=level?24+level*14:0;
  let stage=0;while(stage<SHIELD_STAGES.length-1&&level>=SHIELD_STAGES[stage+1][0])stage++;
  const a=SHIELD_STAGES[stage],b=SHIELD_STAGES[Math.min(stage+1,SHIELD_STAGES.length-1)];
  const t=b[0]===a[0]?0:Math.max(0,(level-a[0])/(b[0]-a[0]));
  return {level,capacity,regen:capacity*.12,delay:6,presence:level? .20+.5*(1-Math.exp(-level/14))+.22*level/50:0,
    radius:1.2+level*.003,color:blend(a[1],b[1],t),stage,name:a[2]};
}
export function spiritGrowth(stacks){
  const level=bounded(stacks);let stage=0;for(const threshold of [1,5,10,20,35])if(level>=threshold)stage++;
  return {level,stage,name:['凝息','灵纹','流光','雷华','星陨','天极'][stage],energyMax:100+level*3,
    regenMultiplier:1+level*.04,damage:1+level*.014,size:1+level*.005,
    accent:blend('#9bdfff','#ffdb9a',level/50),haloBonus:level,meteorBonus:Math.min(45,level)};
}
export function skillColor(index,level){
  return blend(['#71dfff','#69cbff','#93ccff'][index],['#b8d0ff','#cfabff','#c3c5ff'][index],bounded(level)/50);
}
