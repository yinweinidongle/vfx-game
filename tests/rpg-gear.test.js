import test from 'node:test';
import assert from 'node:assert/strict';
import {GameState,readSave} from '../src/game/GameState.js';
import {GEAR_SLOTS,GEAR_CAPACITY,gearStats,enhancementInfo,enhancementStyle,lootRoll,gearSellValue} from '../src/game/GearData.js';

const add=(s,slot,extra={})=>s.gear.grant({slot,level:20,rarity:1,...extra},false);

test('equipment saves migrate alongside all legacy relics; invalid or duplicated instances cannot equip',()=>{
 const s=new GameState();s.save.inventory=['jade'];s.save.equipment.charm='jade';delete s.save.gearBag;delete s.save.gearEquipped;
 const old=readSave({getItem:()=>JSON.stringify(s.save)});assert.deepEqual(old.gearBag,[]);assert.equal(old.equipment.charm,'jade');
 const g=add(new GameState(),'armor');old.gearBag=[g,{...g}, {...g,uid:'<script>'},{...g,uid:'g2',slot:'weapon',level:Infinity,enhance:99}];old.gearEquipped={armor:'g1',wings:'g2',weapon:'g2'};old.gold=10000000;
 const loaded=readSave({getItem:()=>JSON.stringify(old)});assert.equal(loaded.gearBag.length,2);assert.equal(loaded.gearBag[1].enhance,20);assert.equal(loaded.gearEquipped.wings,undefined);assert.equal(loaded.gearEquipped.armor,'g1');assert.equal(loaded.gold,10000000);assert.ok(loaded.nextGearId>2);
 const state=new GameState('sword',loaded),next=add(state,'boots');assert.ok(!['g1','g2'].includes(next.uid));assert.equal(state.save.equipment.charm,'jade');
});

test('five slots alter real health, movement, attack cadence, mana regeneration/cap and damage without refill exploits',()=>{
 const s=new GameState('sword'),base={...s.stats};s.player.hp=100;s.player.energy=10;
 for(const slot of Object.keys(GEAR_SLOTS)){const g=add(s,slot);assert.ok(s.gear.equip(g.uid));}
 assert.ok(s.stats.hp>base.hp);assert.ok(s.stats.damage>base.damage);assert.ok(s.stats.speed>base.speed);assert.ok(s.stats.attackSpeed>base.attackSpeed);assert.ok(s.stats.regen>base.regen);assert.ok(s.stats.energyMax>base.energyMax);
 assert.equal(s.player.hp,100);assert.equal(s.player.energy,10,'gear swaps must never regenerate mana');
 const cloak=s.save.gearEquipped.cloak;for(let i=0;i<4;i++){s.gear.unequip('cloak');s.gear.equip(cloak);}assert.equal(s.player.energy,10);
 s.player.hp=s.stats.hp;s.gear.unequip('armor');assert.equal(s.player.hp,base.hp);assert.equal(s.gear.equip('missing'),false);assert.equal(s.gear.unequip('missing'),false);
 const live=new GameState('sword'),w=add(live,'wings');live.gear.equip(w.uid);live.enemies=[];live.attack(live.player.x,live.player.z-1);assert.ok(live.player.attackCooldown<.48);
 const e=add(s,'weapon'),before=s.save.gold;assert.ok(s.gear.equip(e.uid));assert.equal(s.gear.sell(e.uid),false);s.gear.unequip('weapon');assert.equal(s.gear.sell(e.uid),true);assert.equal(s.save.gold,before+gearSellValue(e));assert.equal(s.gear.sell(e.uid),false);
});

test('merchant transactions recheck safety, cash, sold stock and bag capacity; purchases survive reload',()=>{
 const s=new GameState();s.save.gold=100000;assert.ok(s.gear.canTrade());const offer=s.gear.stock()[0],cash=s.save.gold;assert.ok(s.gear.buy(offer.stockId));assert.equal(s.save.gold,cash-offer.price);assert.equal(s.gear.buy(offer.stockId),false);
 const saved=readSave({getItem:()=>JSON.stringify(s.save)}),loaded=new GameState('sword',saved);assert.equal(loaded.gear.buy(offer.stockId),false);
 loaded.player.x=50;assert.equal(loaded.gear.buy(loaded.gear.stock()[1].stockId),false);assert.equal(loaded.gear.enhance(loaded.save.gearBag[0].uid).ok,false);assert.equal(loaded.gear.cultivate('power'),false);
 s.save.gold=0;assert.equal(s.gear.buy(s.gear.stock()[1].stockId),false);s.save.gold=100000;
 while(s.save.gearBag.length<GEAR_CAPACITY)add(s,'armor');const full=s.save.gold;assert.equal(s.gear.buy(s.gear.stock()[1].stockId),false);assert.equal(s.save.gold,full);assert.equal(add(s,'weapon'),null);assert.ok(s.save.gold>full,'overflow loot converts to currency');
 s.save.playTime=301;assert.ok(!s.gear.stock()[0].sold);assert.ok(s.gear.cultivate('power'));assert.equal(s.save.boons.power,1);assert.equal(s.gear.cultivate('invalid'),false);
});

test('enhancement is monotonic through +20, consumes each attempt once, and failure cannot downgrade or destroy',()=>{
 const s=new GameState();s.save.gold=100000000;const g=add(s,'weapon');s.gear.equip(g.uid);let previous=0,chance=2,stats=0;
 for(let n=0;n<20;n++){g.enhance=n;const info=enhancementInfo(g);assert.ok(info.cost>previous);assert.ok(info.chance<chance);assert.ok(gearStats(g).damage>stats);previous=info.cost;chance=info.chance;stats=gearStats(g).damage;
  s.random=()=>0;const gold=s.save.gold,r=s.gear.enhance(g.uid);assert.equal(r.success,true);assert.equal(g.enhance,n+1);assert.equal(s.save.gold,gold-info.cost);
 }
 const gold=s.save.gold;assert.equal(s.gear.enhance(g.uid).ok,false);assert.equal(s.save.gold,gold);assert.equal(g.enhance,20);
 g.enhance=14;s.random=()=>.9999;const info=enhancementInfo(g);assert.equal(s.gear.enhance(g.uid).success,false);assert.equal(g.enhance,14);assert.equal(s.gear.find(g.uid),g);assert.equal(s.save.gold,gold-info.cost);
 const colors=new Set([0,5,10,15,20].map(n=>enhancementStyle(n).from+enhancementStyle(n).to+enhancementStyle(n).mix));assert.equal(colors.size,5);
});

test('drop rates favour common gear, elites improve rare outcomes, bosses always drop and pity caps dry streaks',()=>{
 function sample(enemy){let n=0,drop=0,counts=[0,0,0];const rand=()=>{n=(Math.imul(n||9137,1664525)+1013904223)>>>0;return n/4294967296;};for(let i=0;i<30000;i++){const g=lootRoll(enemy,rand);if(g){drop++;counts[g.rarity]++;}}return {drop,counts};}
 const a=sample({}),e=sample({elite:true}),b=sample({type:'boss'});for(const r of [a,e,b])assert.ok(r.counts[0]>r.counts[1]&&r.counts[1]>r.counts[2]);assert.ok(e.drop>a.drop*2);assert.equal(b.drop,30000);assert.ok(e.counts[2]/e.drop>a.counts[2]/a.drop);assert.ok(lootRoll({},()=>.99,11));assert.equal(lootRoll({},()=>.99,10),null);
 const s=new GameState();s.started=new Set();s.random=()=>.99;for(let i=0;i<12;i++)s.gear.drop({x:s.player.x,z:s.player.z,level:1});assert.equal(s.drops.length,1);s.update(1/60,{dx:0,dz:0});assert.equal(s.save.gearBag.length,1);assert.equal(s.drops[0].alive,false);
});


test('uncollected gear survives refresh and pickup cannot duplicate it; malformed ground entries cannot erase an otherwise valid save',()=>{
 const s=new GameState();s.random=()=>.1;s.gear.drop({x:s.player.x,z:s.player.z-10,level:10,type:'boss'});assert.equal(s.save.groundGear.length,1);
 s.save.groundGear.push(null,{lootId:999,x:0,z:0,gear:{slot:'__proto__'}});const saved=readSave({getItem:()=>JSON.stringify(s.save)});assert.ok(saved);assert.equal(saved.groundGear.length,1);const restored=new GameState('sword',saved);assert.equal(restored.drops.length,1);restored.player.x=restored.drops[0].x;restored.player.z=restored.drops[0].z;restored.update(1/60,{dx:0,dz:0});assert.equal(restored.save.gearBag.length,1);assert.equal(restored.save.groundGear.length,0);restored.update(1/60,{dx:0,dz:0});assert.equal(restored.save.gearBag.length,1);
 assert.equal(s.gear.grant({slot:'__proto__',rarity:0}),null);
});
