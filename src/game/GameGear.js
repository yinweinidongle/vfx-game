import { GEAR_CAPACITY,GEAR_SLOTS,GEAR_RARITIES,gearName,lootRoll,enhancementInfo,gearSellValue,cultivationCost,shopStock } from './GearData.js';
import { INTERACTABLES,distance } from './GameData.js';

/** All transactions validate again at execution; UI labels are never authoritative. */
export class GameGear{
  constructor(state){this.state=state;this.revision=0;}
  find(uid){return this.state.save.gearBag.find(g=>g.uid===uid);}
  canTrade(){const s=this.state;return !s.dead&&INTERACTABLES.some(o=>o.type==='camp'&&distance(o,s.player)<5)&&!s.enemies.some(e=>e.hp>0&&e.state!=='return'&&distance(e,s.player)<10);}
  changed(){this.revision++;this.state.recalculate();this.state.saveDirty=true;}
  grant(spec,notify=true){
    const s=this.state;if(!Object.hasOwn(GEAR_SLOTS,spec.slot)||!Number.isInteger(spec.rarity)||spec.rarity<0||spec.rarity>2)return null;
    if(s.save.gearBag.length>=GEAR_CAPACITY){const value=gearSellValue({...spec,enhance:spec.enhance||0});s.save.gold+=value;s.saveDirty=true;s.emit('toast',{text:`行囊已满，新装备自动回收为 ${value} 灵石。`});return null;}
    const item={uid:'g'+s.save.nextGearId++,slot:spec.slot,rarity:spec.rarity,level:Math.max(1,Math.min(50,Math.floor(spec.level||s.save.level))),enhance:Math.max(0,Math.min(20,Math.floor(spec.enhance||0)))};
    s.save.gearBag.push(item);s.saveDirty=true;this.revision++;if(notify)s.emit('gearLoot',{item});return item;
  }
  drop(enemy){
    const s=this.state,roll=lootRoll(enemy,()=>s.random(),s.save.gearPity);
    if(!roll){s.save.gearPity++;return;}
    s.save.gearPity=0;const level=Math.min(50,Math.max(1,(enemy.level||1)+s.save.challenge*3,Math.floor(s.save.level*.85)));
    const spec={...roll,level,enhance:0};const ground=s.drops.filter(d=>d.alive&&d.gear);if(ground.length>=96){const oldest=ground[0];oldest.alive=false;s.save.gold+=gearSellValue(oldest.gear);s.emit('toast',{text:'散落装备较多，最早的装备已自动回收为灵石。'});}
    s.drops.push({lootId:s.save.nextLootId++,x:enemy.x,z:enemy.z,age:0,alive:true,gear:spec});this.syncGround();s.emit('gearDrop',{x:enemy.x,z:enemy.z,rarity:roll.rarity});
  }
  syncGround(){const s=this.state;s.save.groundGear=s.drops.filter(d=>d.alive&&d.gear).slice(0,96).map(d=>({lootId:d.lootId,x:d.x,z:d.z,age:d.age,gear:{...d.gear}}));s.saveDirty=true;}
  equip(uid){const item=this.find(uid);if(!item||this.state.dead)return false;this.state.save.gearEquipped[item.slot]=uid;this.changed();this.state.emit('gearEquipped',{item});return true;}
  unequip(slot){if(!Object.hasOwn(GEAR_SLOTS,slot)||!this.state.save.gearEquipped[slot])return false;delete this.state.save.gearEquipped[slot];this.changed();return true;}
  sell(uid){const item=this.find(uid),s=this.state;if(!item||Object.values(s.save.gearEquipped).includes(uid))return false;s.save.gold+=gearSellValue(item);s.save.gearBag.splice(s.save.gearBag.indexOf(item),1);s.saveDirty=true;this.revision++;s.emit('toast',{text:`已回收 ${gearName(item)}，获得 ${gearSellValue(item)} 灵石。`});return true;}
  enhance(uid){
    const item=this.find(uid),s=this.state;if(!item||!this.canTrade())return {ok:false,reason:'请在安全的灯台附近强化。'};
    const info=enhancementInfo(item);if(info.max)return {ok:false,reason:'已达到 +20 强化上限。'};if(s.save.gold<info.cost)return {ok:false,reason:'灵石不足。'};
    s.save.gold-=info.cost;const success=s.random()<info.chance;if(success)item.enhance++;this.changed();s.emit('gearEnhanced',{item,success,cost:info.cost});
    return {ok:true,success,level:item.enhance,cost:info.cost};
  }
  refreshStock(){const s=this.state,epoch=Math.min(1000000,s.save.challenge*1000+Math.floor(s.save.playTime/300));if(epoch>s.save.shopEpoch){s.save.shopEpoch=epoch;s.save.shopBought=[];s.saveDirty=true;}}
  stock(){this.refreshStock();return shopStock(this.state.save);}
  buy(id){
    const s=this.state;if(!this.canTrade())return false;const entry=this.stock().find(e=>e.stockId===id);if(!entry||entry.sold||s.save.gold<entry.price||s.save.gearBag.length>=GEAR_CAPACITY)return false;
    s.save.gold-=entry.price;s.save.shopBought.push(id);const item=this.grant(entry);s.saveDirty=true;return !!item;
  }
  cultivate(id){
    const s=this.state;if(!['power','vitality','spirit'].includes(id)||!this.canTrade()||s.save.boons[id]>=50)return false;const cost=cultivationCost(id,s.save.boons[id]);if(s.save.gold<cost)return false;
    s.save.gold-=cost;s.save.boons[id]++;this.changed();s.player.hp=Math.min(s.player.hp,s.stats.hp);s.emit('toast',{text:`${id==='power'?'锋芒':id==='vitality'?'长生':'灵息'}提升至 ${s.save.boons[id]} 层。`});return true;
  }
}
