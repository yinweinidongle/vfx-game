/** Persistent, renderer-independent equipment rules. Values are never read from saved descriptions. */
export const GEAR_CAPACITY=150;
export const GEAR_SLOTS={
  armor:{name:'护甲',base:'玄玉战甲',stat:'生命',asset:'armor'},
  boots:{name:'战靴',base:'踏云战靴',stat:'移动速度',asset:'boots'},
  wings:{name:'翅膀',base:'琉光之翼',stat:'攻击速度',asset:'wings'},
  cloak:{name:'披风',base:'归墟披风',stat:'回灵与灵力上限',asset:'cloak'},
  weapon:{name:'武器',base:'斩星灵兵',stat:'攻击力',asset:'weapon'},
};
export const GEAR_RARITIES=[
  {name:'普通',prefix:'青霜',color:'#91b5c4',multiplier:1,value:1},
  {name:'稀有',prefix:'星渊',color:'#61b4ff',multiplier:1.7,value:2.4},
  {name:'史诗',prefix:'太初',color:'#c18aff',multiplier:2.8,value:6},
];
const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const int=(v,a,b)=>Math.max(a,Math.min(b,Math.floor(finite(v))));
export function cleanGear(raw){
  if(!raw||!/^g[1-9]\d{0,8}$/.test(raw.uid)||!Object.hasOwn(GEAR_SLOTS,raw.slot))return null;
  return {uid:raw.uid,slot:raw.slot,rarity:int(raw.rarity,0,2),level:int(raw.level,1,50),enhance:int(raw.enhance,0,20)};
}
export function readGearSave(raw,target){
  const inputs=Array.isArray(raw.gearBag)?raw.gearBag:[],equipped=raw.gearEquipped,ground=raw.groundGear;const ids=new Set();target.gearBag=[];
  for(const input of inputs){const g=cleanGear(input);if(g&&!ids.has(g.uid)&&target.gearBag.length<GEAR_CAPACITY){ids.add(g.uid);target.gearBag.push(g);}}
  target.gearEquipped={};for(const slot of Object.keys(GEAR_SLOTS)){const g=target.gearBag.find(g=>g.uid===equipped?.[slot]&&g.slot===slot);if(g)target.gearEquipped[slot]=g.uid;}
  target.nextGearId=Math.max(1,int(raw.nextGearId,1,99999999),...target.gearBag.map(g=>Number(g.uid.slice(1))+1));
  target.gearPity=int(raw.gearPity,0,11);
  target.groundGear=[];const groundIds=new Set();for(const d of Array.isArray(ground)?ground:[]){if(!d||typeof d!=='object')continue;const g=cleanGear({...d.gear,uid:'g1'}),id=int(d.lootId,1,999999999);if(!g||groundIds.has(id)||!Number.isFinite(d.x)||!Number.isFinite(d.z)||Math.abs(d.x)>100||Math.abs(d.z)>100||target.groundGear.length>=96)continue;groundIds.add(id);const {uid,...gear}=g;target.groundGear.push({lootId:id,x:d.x,z:d.z,age:int(d.age,0,119),gear});}
  target.nextLootId=Math.max(1,int(raw.nextLootId,1,99999999),...target.groundGear.map(d=>d.lootId+1));
  target.shopEpoch=int(raw.shopEpoch,0,1000000);target.shopBought=(Array.isArray(raw.shopBought)?raw.shopBought:[]).filter(v=>typeof v==='string'&&/^\d+-[a-z]+-[012]$/.test(v)).slice(0,15);
}
export const gearName=g=>`${GEAR_RARITIES[g.rarity].prefix}·${GEAR_SLOTS[g.slot].base}${g.enhance?' +'+g.enhance:''}`;
export function gearStats(g){
  const m=GEAR_RARITIES[g.rarity].multiplier*(1+g.enhance*.08+g.enhance*g.enhance*.007),l=g.level;
  if(g.slot==='armor')return {hp:Math.round((35+l*7)*m)};
  if(g.slot==='boots')return {speed:(.025+l*.0009)*m};
  if(g.slot==='wings')return {attackSpeed:(.04+l*.0013)*m};
  if(g.slot==='cloak')return {regen:(.2+l*.03)*m,energyMax:Math.round((8+l*1.2)*m)};
  return {damage:Math.round((6+l*1.7)*m)};
}
export function equippedGearStats(save,equipped=save.gearEquipped){
  const total={hp:0,speed:0,attackSpeed:0,regen:0,energyMax:0,damage:0};
  for(const slot of Object.keys(GEAR_SLOTS)){const g=(save.gearBag||[]).find(g=>g.uid===equipped?.[slot]&&g.slot===slot);if(g)for(const [key,n]of Object.entries(gearStats(g)))total[key]+=n;}
  return total;
}
export function enhancementInfo(g){
  const capped=g.enhance>=20;return {max:capped,next:Math.min(20,g.enhance+1),chance:capped?0:Math.max(.12,1-g.enhance*.046),cost:capped?0:Math.round((24+g.level*3)*GEAR_RARITIES[g.rarity].value*Math.pow(1.22,g.enhance)*(1+g.enhance*.1))};
}
export const gearSellValue=g=>Math.round((15+g.level*4)*GEAR_RARITIES[g.rarity].value*(1+g.enhance*.12));
export function enhancementStyle(level){
  const stops=[[0,'#b9ecff',.12],[5,'#399bff',.5],[10,'#a561ff',.95],[15,'#ff3d65',1.45],[20,'#ffc85c',2.1]];
  const n=int(level,0,20),index=Math.min(3,Math.floor(n/5)),t=(n-stops[index][0])/5;
  return {from:stops[index][1],to:stops[index+1][1],mix:t,power:stops[index][2]+(stops[index+1][2]-stops[index][2])*t,tier:Math.floor(n/5)};
}
export function lootRoll(enemy,random,misses=0){
  const chance=enemy.type==='boss'?1:enemy.elite?.72:.28;
  if(misses<11&&random()>=chance)return null;
  const roll=random(),epic=enemy.type==='boss'?.18:enemy.elite?.09:.025,rare=enemy.type==='boss'?.34:enemy.elite?.29:.18;
  return {slot:Object.keys(GEAR_SLOTS)[Math.min(4,Math.floor(random()*5))],rarity:roll<epic?2:roll<epic+rare?1:0};
}
export const cultivationCost=(id,n)=>Math.round((id==='power'?100:id==='vitality'?85:95)+n*(id==='power'?65:55));

/** Stock is a pure function of character level and the persisted, five-minute stock epoch. */
export function shopStock(save){
  const stock=[];for(const slot of Object.keys(GEAR_SLOTS))for(let rarity=0;rarity<3;rarity++){
    const item={slot,rarity,level:Math.max(1,Math.min(50,save.level)),enhance:0};const id=`${save.shopEpoch||0}-${slot}-${rarity}`;
    stock.push({...item,stockId:id,sold:(save.shopBought||[]).includes(id),price:Math.round((60+save.level*10)*GEAR_RARITIES[rarity].value*(rarity===2?1.8:1))});
  }return stock;
}
