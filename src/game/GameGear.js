import { createLootMotion, serializeLootMotion } from './LootMotion.js';
import { weaponKind } from './EquipmentCatalog.js';
import { GEAR_CAPACITY,GEAR_SLOTS,TAICHU_RARITY,gearName,lootRoll,enhancementInfo,gearSellValue,cultivationCost,shopStock } from './GearData.js';
import { INTERACTABLES,distance } from './GameData.js';

/** All transactions validate again at execution; UI labels are never authoritative. */
export class GameGear{
  constructor(state){this.state=state;this.revision=0;}
  find(uid){return this.state.save.gearBag.find(g=>g.uid===uid);}
  canTrade(){const s=this.state;return !s.dead&&INTERACTABLES.some(o=>o.type==='camp'&&distance(o,s.player)<5)&&!s.enemies.some(e=>e.hp>0&&e.state!=='return'&&distance(e,s.player)<10);}
  changed(){this.revision++;this.state.recalculate();this.state.settleCappedBoons();this.state.saveDirty=true;}
  grant(spec,notify=true){
    const s=this.state;
    if (!Object.hasOwn(GEAR_SLOTS,spec.slot) || !Number.isInteger(spec.rarity) || spec.rarity<0 || spec.rarity>TAICHU_RARITY) return null;
    if (s.save.gearBag.length >= GEAR_CAPACITY) {
      const protectedIds = new Set(Object.values(s.save.gearEquipped));
      let replace;
      for (const item of s.save.gearBag) {
        if (protectedIds.has(item.uid) || item.locked || item.enhance || item.rarity >= spec.rarity) continue;
        if (!replace || item.rarity < replace.rarity || (item.rarity === replace.rarity && gearSellValue(item) < gearSellValue(replace))) replace = item;
      }
      if (!replace && spec.rarity !== TAICHU_RARITY) {
        const value = gearSellValue({...spec, enhance: spec.enhance || 0});
        s.save.gold += value; s.saveDirty = true;
        s.emit('toast', {text: `行囊已满，新装备已回收为 ${value} 灵石。`});
        return null;
      }
      if (replace) this.sell(replace.uid);
      else s.emit('toast', {text:'行囊已满，太初装备已保留在行囊中。'});
    }
    const level = Number.isFinite(spec.level) ? spec.level : s.save.level;
    const item={uid:'g'+s.save.nextGearId++,slot:spec.slot,rarity:spec.rarity,level:Math.max(1,Math.floor(level)),enhance:Math.max(0,Math.min(20,Math.floor(spec.enhance||0)))};
    if (spec.rarity === TAICHU_RARITY || spec.locked) item.locked = true;
    if(item.slot==='weapon')item.weaponKind=weaponKind(spec,s.kind);
    s.save.gearBag.push(item);s.saveDirty=true;this.revision++;if(notify)s.emit('gearLoot',{item});return item;
  }
  drop(enemy){
    const s = this.state;
    const roll = lootRoll(enemy, () => s.random(), s.save.gearPity, s.save.level);
    if (!roll) { s.save.gearPity++; return; }
    s.save.gearPity = 0;
    const taichu = roll.rarity === TAICHU_RARITY;
    const level = Math.max((enemy.level || 1) + s.save.challenge * 3, Math.floor(s.save.level * (taichu ? 1 : .85)));
    const gear = {...roll, level, enhance:0};
    if (gear.slot === 'weapon') gear.weaponKind = s.kind === 'ice' ? 'bow' : s.save.nextLootId % 2 ? 'dao' : 'jian';
    const ground = s.drops.filter(d => d.alive && d.gear);
    if (ground.length >= 96) {
      const oldest = ground.reduce((least, drop) => drop.gear.rarity < least.gear.rarity ? drop : least);
      oldest.alive = false;
      if (oldest.gear.rarity === TAICHU_RARITY) this.grant(oldest.gear);
      else s.save.gold += gearSellValue(oldest.gear);
      s.emit('toast', {text:'散落装备较多，已结算一件地面装备。'});
    }
    const lootId = s.save.nextLootId++;
    const motion = createLootMotion(enemy.x, enemy.z, lootId, roll.rarity);
    s.drops.push({lootId, x:enemy.x, z:enemy.z, age:0, alive:true, gear, ...motion});
    this.syncGround();
    s.emit('gearDrop', {lootId, x:enemy.x, y:motion.y, z:enemy.z, rarity:roll.rarity, gear});
  }
  syncGround(dirty=true){const s=this.state;s.save.groundGear=s.drops.filter(d=>d.alive&&d.gear).slice(0,96).map(d=>({...serializeLootMotion(d),gear:{...d.gear}}));if(dirty)s.saveDirty=true;}
  equip(uid){const item=this.find(uid);if(!item||this.state.dead)return false;this.state.save.gearEquipped[item.slot]=uid;this.changed();this.state.emit('gearEquipped',{item});return true;}
  unequip(slot){if(!Object.hasOwn(GEAR_SLOTS,slot)||!this.state.save.gearEquipped[slot])return false;delete this.state.save.gearEquipped[slot];this.changed();return true;}
  toggleLock(uid) {
    const item = this.find(uid);
    if (!item || this.state.dead) return false;
    if (item.locked) delete item.locked;
    else item.locked = true;
    this.revision++;
    this.state.saveDirty = true;
    return true;
  }
  canSell(item) {
    return !!item && !this.state.dead && !item.locked && this.state.save.gearEquipped[item.slot] !== item.uid;
  }
  saleQuote(ids) {
    const requested = new Set(ids);
    const items = this.state.save.gearBag.filter(item => requested.has(item.uid) && this.canSell(item));
    return {items, value: items.reduce((total, item) => total + gearSellValue(item), 0)};
  }
  sellMany(ids) {
    const s = this.state, quote = this.saleQuote(ids);
    if (!quote.items.length) return quote;
    const sold = new Set(quote.items.map(item => item.uid));
    s.save.gearBag = s.save.gearBag.filter(item => !sold.has(item.uid));
    s.save.gold += quote.value;
    s.saveDirty = true;
    this.revision++;
    const subject = quote.items.length === 1 ? gearName(quote.items[0]) : `${quote.items.length} 件装备`;
    s.emit('toast', {text: `已出售 ${subject}，获得 ${quote.value.toLocaleString()} 灵石。`});
    return quote;
  }
  sell(uid) { return this.sellMany([uid]).items.length === 1; }
  enhance(uid){
    const item=this.find(uid),s=this.state;if(!item||!this.canTrade())return {ok:false,reason:'请在安全的灯台附近强化。'};
    const info=enhancementInfo(item);if(info.max)return {ok:false,reason:'已达到 +20 强化上限。'};if(s.save.gold<info.cost)return {ok:false,reason:'灵石不足。'};
    s.save.gold-=info.cost;const success=s.random()<info.chance;if(success)item.enhance++;this.changed();s.emit('gearEnhanced',{item,success,cost:info.cost});
    return {ok:true,success,level:item.enhance,cost:info.cost};
  }
  inheritanceTargets(source) {
    if (source?.rarity !== TAICHU_RARITY || source.enhance <= 0) return [];
    return this.state.save.gearBag.filter(target => target.rarity === TAICHU_RARITY &&
      target.slot === source.slot && target.level > source.level && target.enhance === 0);
  }
  inherit(sourceId, targetId) {
    if (!this.canTrade()) return {ok:false,reason:'请在安全的灯台附近继承。'};
    const source = this.find(sourceId), target = this.find(targetId);
    if (!this.inheritanceTargets(source).includes(target)) {
      return {ok:false,reason:'请选择同部位的两件太初装备。承接装备等级须更高，且强化为 +0。'};
    }
    const rank = source.enhance;
    source.enhance = 0;
    target.enhance = rank;
    this.changed();
    return {ok:true,source,target,rank};
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
