const THRESHOLDS=[1,1.22,1.5,1.9];
const NAMES=['初鸣','共鸣','裂空','天华'];
const EFFECTS=['凝霜锋刃','双重追击 · 流光脉冲','三重追击 · 星芒冲击','四重追击 · 双环裂光'];
const COLORS={
  sword:['#64dcff','#879dff','#b687ff','#edc4ff'],
  ice:['#71e4ff','#67c3ff','#959dff','#cdb4ff'],
  cultivator:['#92ccff','#a49aff','#c18fff','#ffe0a3'],
};

/** Derived from real attack power, so equipment and saved upgrades use the same rules. */
export const MAX_FERVOR=50;
export function attackGrowth(kind,damage,baseDamage,power=0){
  const ratio=damage/baseDamage;let tier=0;
  for(let i=1;i<THRESHOLDS.length;i++)if(ratio>=THRESHOLDS[i]-1e-6)tier=i;
  const stacks=Math.max(0,Math.min(MAX_FERVOR,Math.floor(power))),finishTier=Math.floor(stacks/5);
  return {tier,ratio,name:NAMES[tier],effect:EFFECTS[tier],shots:tier+1,color:COLORS[kind][tier],
    stacks,echoes:stacks,finishTier,finishRadius:finishTier?1.1+finishTier*.12:0,
    nextFervor:stacks<MAX_FERVOR?Math.min(MAX_FERVOR,(finishTier+1)*5):null,
    spiritName:kind==='ice'?'冰魄针':kind==='sword'?'剑魄针':'灵虚针',
    radiance:1.15+Math.min(.75,Math.max(0,ratio-1)*.7),
    haloCount:48+tier*16,nextDamage:tier<3?baseDamage*THRESHOLDS[tier+1]:null};
}
export function projectileColor(kind,tier){return COLORS[kind==='slash'?'sword':kind==='arrow'||kind==='frost'?'ice':'cultivator'][tier];}
