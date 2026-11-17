import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Matrix4,PerspectiveCamera,Scene,Vector3} from 'three';
import {GameState, readSave} from '../src/game/GameState.js';
import {ENCOUNTERS, SAVE_KEY} from '../src/game/GameData.js';
import {encounterProfile} from '../src/game/EncounterDirector.js';
import {experienceToNext, levelsEarned, TAICHU_UNLOCK_LEVEL} from '../src/game/Progression.js';
import {GEAR_CAPACITY, GEAR_SLOTS, TAICHU_RARITY, gearSellValue, lootRoll, shopStock, taichuDropChance} from '../src/game/GearData.js';
import {TAICHU_MODELS, equipmentProfile} from '../src/game/EquipmentCatalog.js';
import {rollSpiritStones} from '../src/game/SpiritStones.js';
import {GameLootVFX} from '../src/game/GameLootVFX.js';
import {equipmentSources, lootSources} from './helpers/equipment-assets.js';

function reload(state) {
  let value;
  assert.ok(state.write({setItem: (key, data) => {assert.equal(key,SAVE_KEY);value=data;}}));
  return new GameState(state.kind,readSave({getItem:()=>value}));
}

function roll(...values) {
  return () => {
    assert.ok(values.length, 'unexpected random sample');
    return values.shift();
  };
}

test('existing level-50 saves can advance, expensive levels consume the exact remaining XP, and later levels persist', () => {
  const old = new GameState();
  old.save.level = 50;
  old.save.xp = 4750;
  const state = reload(old);
  state.gainXP(1);
  assert.equal(state.save.level,51);
  assert.equal(state.save.xp,1);
  assert.ok(state.pendingBoons > 0);
  assert.ok(experienceToNext(180) > experienceToNext(90));
  let experience = 4;
  for (let level=51;level<180;level++) experience += experienceToNext(level);
  state.gainXP(experience);
  assert.equal(state.save.level,180);
  assert.equal(state.save.xp,5);
  assert.equal(reload(state).save.level,180);
  const large = levelsEarned(1,Number.MAX_SAFE_INTEGER);
  assert.ok(large.levels > 100000 && large.remaining >= 0 && large.remaining < experienceToNext(large.levels+1));
});

test('late reincarnation increases actual enemy level, attack and effective defense past the old twentieth-cycle cap', () => {
  const encounter = ENCOUNTERS[0];
  const earlier = encounterProfile(encounter,20);
  const later = encounterProfile(encounter,35);
  for (const stat of ['level','health','damage','defense']) assert.ok(later[stat] > earlier[stat]);
  const state = new GameState(), old = new GameState();
  for (const [s,challenge] of [[old,20],[state,35]]) {s.save.challenge=challenge;s.spawn(encounter);s.random=()=>.99;}
  const first = old.enemies[0], second = state.enemies[0];
  for (const [s,e] of [[old,first],[state,second]]) s.hit(e,500,'slash');
  assert.ok(state.events.find(e=>e.type==='hit').damage < old.events.find(e=>e.type==='hit').damage);
  assert.ok(second.damage > first.damage && second.level > first.level);
  assert.equal(reload(state).save.challenge,35);
});

test('random spirit stones replace a kill payment and each remaining drop is awarded once after reloading', () => {
  const state = new GameState('ice');
  state.spawn(ENCOUNTERS[0]);
  const enemy = state.enemies[0];
  Object.assign(enemy,{x:state.player.x,z:state.player.z,level:14,hp:1,defense:0});
  state.random=roll(.99,.98,.10,.7); // noncrit, no gear, currency chance, amount
  state.hit(enemy,50,'physical');
  const stone=state.drops.find(d=>d.stones);
  assert.ok(stone.stones > 45);
  assert.equal(state.save.gold,0);
  const reloaded = reload(state);
  reloaded.started = new Set(ENCOUNTERS.map(e=>e.id));
  for(let i=0;i<180;i++) reloaded.update(1/60,{dx:0,dz:0});
  assert.equal(reloaded.save.gold,stone.stones);
  assert.equal(reloaded.events.filter(e=>e.type==='stonePickup').length,1);
  assert.equal(reload(reloaded).drops.length,0);
  assert.equal(rollSpiritStones({level:12},roll(.999)),0);
  assert.ok(rollSpiritStones({level:30},roll(.1,.2)) > rollSpiritStones({level:2},roll(.1,.2)));
});

test('Taichu is an independent rare roll gated at 51, remains distinct from the store and preserves higher item levels', () => {
  assert.equal(TAICHU_UNLOCK_LEVEL,51);
  const normal = {type:'melee',level:55};
  assert.equal(lootRoll(normal,roll(.01,0,.99),0,50).rarity,2);
  assert.equal(lootRoll(normal,roll(taichuDropChance(normal)/2,.99),0,51).rarity,TAICHU_RARITY);
  assert.equal(lootRoll(normal,roll(taichuDropChance(normal),.99),0,51),null);
  assert.ok(taichuDropChance(normal)<taichuDropChance({elite:true})&&taichuDropChance({elite:true})<taichuDropChance({type:'boss'}));
  const state = new GameState('ice');
  state.save.level = 90;
  state.random=roll(.00001,.99);
  state.gear.drop({...normal,x:state.player.x,z:state.player.z});
  const drop=state.drops[0],event=state.events.find(e=>e.type==='gearDrop');
  assert.equal(drop.gear.rarity,3);
  assert.equal(event.gear,drop.gear);
  assert.equal(equipmentProfile(drop.gear,'ice').id,'bow-taichu');
  assert.equal(reload(state).drops[0].gear.level,90);
  assert.ok(shopStock(state.save).every(g=>g.rarity<TAICHU_RARITY));
});

test('Taichu stays protected in an entirely locked full bag and through a world transition', () => {
  const state = new GameState();
  for(let i=0;i<GEAR_CAPACITY;i++) state.gear.grant({slot:'armor',rarity:1,level:70,locked:true},false);
  state.save.level=71;
  state.random=roll(0,.9);
  state.gear.drop({type:'melee',level:68,x:state.player.x,z:state.player.z});
  state.save.won=true;
  const next=state.nextCycle();
  assert.equal(next.save.gearBag.length,GEAR_CAPACITY+1);
  const reloaded=reload(next),item=reloaded.save.gearBag.find(g=>g.rarity===TAICHU_RARITY);
  assert.ok(item?.locked);
  assert.ok(item.level>=71);
  assert.equal(reloaded.gear.sell(item.uid),false);
  assert.equal(reloaded.drops.length,0);
});

test('selling a batch retests protection at commit and credits distinct still eligible items only once', () => {
  const state=new GameState(),gear=state.gear;
  const grant=(slot,rarity=0)=>gear.grant({slot,rarity,level:71},false);
  const a=grant('weapon'), b=grant('armor',1), c=grant('cloak',2), d=grant('wings',3);
  const selection=[a.uid,a.uid,b.uid,c.uid,d.uid,'g999'];
  assert.equal(gear.saleQuote(selection).items.length,3);
  gear.toggleLock(b.uid);gear.equip(c.uid);
  const sold=gear.sellMany(selection);
  assert.deepEqual(sold.items,[a]);
  assert.equal(state.save.gold,gearSellValue(a));
  assert.equal(gear.sellMany(selection).value,0);
  assert.equal(reload(state).gear.saleQuote(selection).items.length,0);
});

test('each of the seven Taichu pieces has a distinct model for wearing and for ground loot', async () => {
  const sources=await equipmentSources(),ground=await lootSources();
  for (const id of TAICHU_MODELS) {
    assert.ok(sources[id]?.children.length, id+' worn');
    assert.ok(ground[id]?.children.length, id+' drop');
  }
  const bow=sources['bow-taichu'].userData.gearFit;
  assert.ok(bow.lower[1]<-.4&&bow.upper[1]>.4&&bow.lower[2]<-.08);
  assert.ok(bow.removedStringTriangles>0,'the dynamic bowstring replaces the baked string');
  const dimensions = id => new Box3().setFromObject(sources[id]).getSize(new Vector3());
  const wings=dimensions('wings-taichu'), boots=dimensions('boots-taichu');
  assert.ok(wings.x>8*wings.z && wings.x>wings.y,'the feather span must follow the shoulders');
  assert.ok(boots.z>2*boots.x,'the length of the sole must follow the foot bone');
});

test('Taichu inheritance moves all ranks to a higher same-slot +0 item, including when worn and across a reload', () => {
  const state=new GameState('sword'), gear=state.gear;
  const grant=(slot, level, rarity, enhance)=>gear.grant({slot,level,rarity,enhance},false);
  const source=grant('weapon',60,3,10);
  const target=grant('weapon',80,3,0);
  const wrongSlot=grant('armor',81,3,0);
  const alreadyForged=grant('weapon',82,3,3);
  const tooLow=grant('weapon',55,3,0);
  const epic=grant('weapon',90,2,0);
  const mundaneSource=grant('weapon',59,2,12);
  gear.equip(target.uid);
  const attack=state.stats.damage, gold=state.save.gold;
  for (const item of [wrongSlot,alreadyForged,tooLow,epic,source]) {
    assert.equal(gear.inherit(source.uid,item.uid).ok,false);
    assert.equal(source.enhance,10);
  }
  assert.equal(gear.inherit(mundaneSource.uid,target.uid).ok,false);
  state.player.x=44;
  assert.equal(gear.inherit(source.uid,target.uid).ok,false);
  state.player.x=-28;
  assert.deepEqual(gear.inheritanceTargets(source),[target]);
  assert.equal(gear.inherit(source.uid,target.uid).rank,10);
  assert.equal(target.level,80);
  assert.equal(source.level,60);
  assert.equal(source.enhance,0);
  assert.equal(target.enhance,10);
  assert.ok(state.stats.damage>attack);
  assert.equal(state.save.gold,gold);
  assert.equal(gear.inherit(source.uid,target.uid).ok,false);
  const restored=reload(state);
  assert.equal(restored.gear.find(source.uid).enhance,0);
  assert.equal(restored.gear.find(target.uid).enhance,10);
  assert.equal(restored.save.gearEquipped.weapon,target.uid);
  assert.ok(restored.gear.find(target.uid).locked);
});

test('the Taichu flash follows a flying item but keeps its rays fixed, then gives way to the outline', async () => {
  const ground=await lootSources();
  const state=new GameState();
  const eye=new PerspectiveCamera();eye.position.set(4,7,10);
  const fx=new GameLootVFX(new Scene(),state,{'dao-taichu':ground['dao-taichu']},eye);
  const item={lootId:1,alive:true,age:.3,flight:.87,x:state.player.x,z:state.player.z,
    landed:false,gear:{slot:'weapon',weaponKind:'dao',level:60,rarity:3,enhance:0}};
  state.drops.push(item);
  fx.handle({type:'gearDrop',rarity:3,lootId:1,x:item.x,y:2,z:item.z});
  fx.update(.3,true);
  assert.equal(fx.flare.layers[1].count,0);
  fx.update(0);
  const bucket=fx.buckets.get('dao-taichu');
  const rays=fx.flare.layers[1],a=new Matrix4(),b=new Matrix4();
  assert.equal(rays.count,1);rays.getMatrixAt(0,a);
  const start=rays.geometry.attributes.aCue.getX(0);
  eye.position.set(-12,9,15);item.x+=1;item.age=.52;
  fx.update(0);rays.getMatrixAt(0,b);
  assert.deepEqual(a.elements.slice(0,12),b.elements.slice(0,12));
  assert.equal(b.elements[12],item.x);
  assert.ok(rays.geometry.attributes.aCue.getX(0)>start);
  assert.ok(bucket.outlines.every(mesh=>!mesh.visible));
  item.age=item.flight;
  item.landed=true;
  fx.handle({type:'gearLand',rarity:3,lootId:1,x:item.x,z:item.z});
  fx.update(1/60);
  assert.equal(rays.count,0);
  assert.ok(bucket.outlines.length&&bucket.outlines.every(mesh=>mesh.visible&&mesh.count===1));
  assert.equal(bucket.parts[0].geometry.attributes.aLootTint.getW(0),3);
  item.age+=1;
  fx.update(1/60);
  assert.equal(bucket.parts[0].geometry.attributes.aLootTint.getW(0),2);
  assert.ok(!fx.flare.pool.some(burst=>burst.alive));
  fx.dispose();
});

test('five actual Taichu slots double total attack for every class and persist across save and load', () => {
  for(const kind of ['sword','ice','cultivator']){
    const s=new GameState(kind);
    s.save.level=63;s.save.boons.power=12;
    for(const slot of Object.keys(GEAR_SLOTS).filter(key=>key!=='armor'))s.gear.equip(s.gear.grant({slot,rarity:3,level:64},false).uid);
    const attack=s.stats.damage;
    const armor=s.gear.grant({slot:'armor',rarity:3,level:60},false);
    assert.equal(s.stats.taichuCount,4);assert.equal(s.stats.taichu,false);
    s.gear.equip(armor.uid);
    assert.equal(s.stats.taichu,true);assert.equal(s.stats.damage,attack*2);
    assert.equal(s.events.filter(e=>e.type==='taichuSet').length,1);
    assert.equal(reload(s).stats.damage,attack*2);
    s.gear.unequip('armor');assert.equal(s.stats.damage,attack);
    assert.equal(s.stats.taichu,false);
  }
});

function suitCombat() {
  const s=new GameState('ice');
  for(const slot of Object.keys(GEAR_SLOTS))s.gear.equip(s.gear.grant({slot,rarity:3,level:55},false).uid);
  s.spawn(ENCOUNTERS[1]);
  s.started=new Set(ENCOUNTERS.map(e=>e.id));
  const p=s.player;
  for(const [i,e] of s.enemies.entries()){
    const x=p.x,z=p.z-5-i*1.8;
    Object.assign(e,{x,z,homeX:x,homeZ:z,hp:100000,maxHp:100000,spawnGrace:0,speed:0,state:'chase',timer:60});
  }
  s.events.length=0;
  return s;
}

test('only successful targeted actions roll once for a meteor; extra projectiles and hits do not reroll',()=>{
  const s=suitCombat(),e=s.enemies[0];
  let draws=0,value=.05;
  s.random=()=>{draws++;return value;};
  assert.ok(s.attack(e.x,e.z));assert.equal(draws,1);
  assert.equal(s.taichuSet.events.filter(e=>e.active).length,0);
  assert.equal(s.attack(e.x,e.z),false);assert.equal(draws,1);
  s.player.energy=0;assert.equal(s.cast(0,e.x,e.z),false);assert.equal(draws,1);
  s.player.energy=s.stats.energyMax;value=.049999;
  assert.ok(s.cast(0,e.x,e.z));assert.equal(draws,2);
  assert.ok(s.events.filter(e=>e.type==='projectile').length>1);
  s.hit(e,10,'arrow');assert.equal(draws,3); // crit roll only
  assert.equal(s.taichuSet.events.filter(e=>e.active).length,1);
  const noTarget=s.enemies.splice(0);s.player.attackCooldown=0;
  assert.ok(s.attack(e.x,e.z));assert.equal(draws,3);
  s.enemies.push(...noTarget);s.gear.unequip('boots');s.player.attackCooldown=0;
  assert.ok(s.attack(e.x,e.z));assert.equal(draws,3);
});

test('a proc damages enemies once at the visible impact location, and is cleared on revive',()=>{
  const s=suitCombat(),[target,nearby,away]=s.enemies;
  assert.ok(nearby&&away);
  s.random=()=>.04;
  assert.ok(s.attack(target.x,target.z));
  s.random=()=>.99;
  const meteor=s.taichuSet.events.find(e=>e.active);
  assert.deepEqual([meteor.end.x,meteor.end.z],[target.x,target.z]);
  for(const b of s.projectiles)b.alive=false; // Isolate the meteor from the triggering arrows.
  target.x=target.homeX+=6;away.x=away.homeX+=8;
  while(s.time+1/60<meteor.hit)s.update(1/60,{dx:0,dz:0});
  assert.ok(s.enemies.every(e=>e.hp===e.maxHp));
  s.update(1/60,{dx:0,dz:0});
  const impacts=s.events.filter(e=>e.type==='hit'&&e.element==='taichu');
  assert.equal(target.hp,target.maxHp);assert.equal(away.hp,away.maxHp);
  assert.ok(nearby.hp<nearby.maxHp);
  assert.equal(impacts.filter(hit=>hit.enemyId===nearby.id).length,1);
  assert.equal(impacts.length,1);
  for(let i=0;i<30;i++)s.update(1/60,{dx:0,dz:0});
  assert.equal(s.events.filter(e=>e.type==='hit'&&e.element==='taichu').length,1);
  s.revive();assert.ok(s.taichuSet.events.every(e=>!e.active));
});
