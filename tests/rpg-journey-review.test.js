import test from 'node:test';
import assert from 'node:assert/strict';
import {GameState,readSave} from '../src/game/GameState.js';
import {GameUI} from '../src/game/GameUI.js';
import {SAVE_KEY,ENCOUNTERS,SKILLS} from '../src/game/GameData.js';
import {REGIONS,bountyProgress} from '../src/game/RegionBounties.js';
import {JourneyStorage,BACKUP_KEY,recoverJourneyTransfer} from '../src/game/JourneyStorage.js';
import {GEAR_CAPACITY} from '../src/game/GearData.js';

function memory() {
  const data = new Map();
  return {getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k)};
}
const json = kind => JSON.stringify(new GameState(kind).save);

test('switching two journeys commits after load; interruptions recover both original slots', () => {
  const current=json('ice'), previous=json('sword'), next=json('cultivator'), store=memory();
  store.setItem(SAVE_KEY,current);store.setItem(BACKUP_KEY,previous);
  const writer=new JourneyStorage(store);
  writer.switching=true;
  assert.equal(store.getItem(BACKUP_KEY),previous);
  const original=store.setItem;
  store.setItem=(key,value)=>{if(key===SAVE_KEY)throw Error('quota');return original(key,value);};
  assert.throws(()=>writer.setItem(SAVE_KEY,next));
  assert.equal(store.getItem(SAVE_KEY),current);
  assert.equal(store.getItem(BACKUP_KEY),previous);
  store.setItem=original;
  writer.setItem(SAVE_KEY,next);
  assert.equal(store.getItem(SAVE_KEY),next);
  assert.equal(store.getItem(BACKUP_KEY),current);
  // Simulate a closed page just after it moved the current journey into backup.
  store.setItem('frostbound.rpg.transfer.v1',JSON.stringify({before:next,previousBackup:current}));
  store.setItem(BACKUP_KEY,next);
  recoverJourneyTransfer(store);
  assert.equal(store.getItem(BACKUP_KEY),current);
  assert.equal(store.getItem(SAVE_KEY),next);
});

test('a stale tab cannot overwrite newer progress, including on tab close', () => {
  const storage=memory(), first=new JourneyStorage(storage), stale=new JourneyStorage(storage);
  first.setItem(SAVE_KEY,json('ice'));
  assert.throws(()=>stale.setItem(SAVE_KEY,json('sword')));
  assert.ok(stale.conflict);
  assert.equal(readSave(storage).kind,'ice');
});

test('optional malformed save fields recover independently; long play time and future RNG survive reload', () => {
  const state=new GameState('ice'), storage=memory();state.save.playTime=136200;state.save.level=37;
  state.random();state.random();assert.ok(state.write(storage));
  const expected=state.random(), partial=JSON.parse(storage.getItem(SAVE_KEY));
  Object.assign(partial,{opened:{bad:true},cleared:['path','path','unlisted'],inventory:['__proto__','jade'],memories:[null]});
  storage.setItem(SAVE_KEY,JSON.stringify(partial));
  const clean=readSave(storage);
  assert.deepEqual(clean.inventory,['jade']);assert.deepEqual(clean.cleared,['path']);assert.deepEqual(clean.opened,[]);
  assert.equal(clean.level,37);assert.equal(clean.playTime,136200);
  assert.equal(new GameState('ice',clean).random(),expected);
  storage.setItem(SAVE_KEY,JSON.stringify({...partial,kind:'constructor'}));assert.equal(readSave(storage),null);
});

test('post-victory levels and levels earned while reading a memory always lead to a usable reward screen', () => {
  const state=new GameState();state.save.won=true;state.gainXP(95);
  let choices=0,resumed=0;
  const ui={state,dialog:{open:true,close(){resumed++;}},game:{paused:true,input:{clear(){}},audio:{resume(){}}},boon(){choices++;}};
  GameUI.prototype.handle.call(ui,{type:'level'});
  assert.equal(choices,0,'finish the current interaction first');
  GameUI.prototype.close.call(ui);assert.equal(choices,1);
  state.chooseBoon('vitality');GameUI.prototype.close.call(ui);assert.equal(resumed,1);
  ui.dialog.open=false;state.gainXP(state.save.level*95);GameUI.prototype.handle.call(ui,{type:'level'});assert.equal(choices,2);
});

test('maxed cultivation converts a pending level reward to spirit stones exactly once across reloads', () => {
  const storage=memory(), state=new GameState();
  state.save.boons={power:50,vitality:50,spirit:50};state.save.pendingBoons=2;state.save.gold=5;
  storage.setItem(SAVE_KEY,JSON.stringify(state.save));
  const restored=new GameState('sword',readSave(storage));assert.equal(restored.save.gold,245);assert.equal(restored.pendingBoons,0);
  restored.write(storage);const again=new GameState('sword',readSave(storage));assert.equal(again.save.gold,245);
  again.gainXP(95);assert.equal(again.pendingBoons,0);assert.equal(again.save.gold,365);
});

test('full bags preserve locked, equipped and enhanced items and admit a higher rarity for the cheapest eligible item', () => {
  const state=new GameState(), bag=state.gear;
  const armor=()=>bag.grant({slot:'armor',rarity:0,level:1});
  const locked=armor(), worn=armor(), forged=armor(), sellable=armor();
  bag.toggleLock(locked.uid);bag.equip(worn.uid);forged.enhance=1;
  while(state.save.gearBag.length<GEAR_CAPACITY)bag.grant({slot:'boots',rarity:1,level:25});
  assert.equal(bag.sell(locked.uid),false);
  const epic=bag.grant({slot:'weapon',rarity:2,level:40});
  assert.ok(epic);assert.ok(!bag.find(sellable.uid));
  for(const item of [locked,worn,forged])assert.ok(bag.find(item.uid));
  const store=memory();state.write(store);const loaded=new GameState('sword',readSave(store));
  assert.equal(loaded.gear.find(locked.uid).locked,true);
  assert.ok(loaded.gear.toggleLock(locked.uid));assert.ok(loaded.gear.sell(locked.uid));
});

test('Q, E and R reserve capacity before charging mana or cooldown; the primary shot honors a cursor target at max range', () => {
  const s=new GameState(),p=s.player;s.spawn(ENCOUNTERS[0]);
  const [target,decoy]=s.enemies;Object.assign(target,{x:p.x+25,z:p.z,spawnGrace:0});Object.assign(decoy,{x:p.x+5,z:p.z,spawnGrace:0});
  const mana=p.energy;for(const b of s.projectiles)b.alive=true;
  for(const i of [0,1]){assert.equal(s.cast(i,target.x,target.z),false);assert.equal(p.energy,mana);assert.equal(p.cooldowns[i],0);}
  for(const z of s.zones)z.alive=true;assert.equal(s.cast(2,target.x,target.z),false);assert.equal(p.energy,mana);
  s.projectiles[0].alive=false;assert.ok(s.cast(0,target.x,target.z));assert.equal(s.projectiles[0].target,target);
  assert.equal(p.energy,mana-SKILLS[0].cost);
});

test('a regional bounty tracks accessible uncleared fights and pays once on the final wave', () => {
  const s=new GameState(),region=REGIONS[0];assert.equal(s.trackBounty(3),false);assert.ok(s.trackBounty(1));
  assert.equal(s.objective().x,region.encounters[0].x);
  s.save.cleared.push('path','grove');const last=region.encounters[2];
  s.player.x=last.x;s.player.z=last.z+6;s.spawn(last);
  const clear=()=>{for(const e of [...s.enemies])if(e.hp>0)s.hit(e,e.maxHp+1,'physical');};
  clear();s.encounters.update(2);clear();
  assert.equal(s.save.trackedChapter,0);assert.equal(bountyProgress(s.save,region).cleared,3);
  assert.equal(s.events.filter(e=>e.type==='toast'&&e.text.includes('清剿完成')).length,1);
  const gold=s.save.gold;s.encounters.onDeath(s.enemies[0]);assert.equal(s.save.gold,gold);
  const store=memory();s.write(store);const loaded=new GameState('sword',readSave(store));
  assert.equal(loaded.trackBounty(1),false);loaded.spawn(last);assert.equal(loaded.save.gold,gold);
});

test('an obstacle beside a sealed bridge cannot push the player through a chapter gate', () => {
  const s=new GameState(),p=s.player;
  Object.assign(p,{x:-2.32,z:-4});
  s.obstacles.push({x:-2.7,z:-4,r:1.5});
  s.move(p,.15,0);
  assert.ok(p.x<=-2);
  s.save.seals[0]=true;s.move(p,.15,0);assert.ok(p.x>-2);
});

test('an unreadable interrupted-transfer record never disables valid main or backup saves', () => {
  const store=memory(), first=json('ice'), old=json('sword');
  store.setItem(SAVE_KEY,first);store.setItem(BACKUP_KEY,old);
  store.setItem('frostbound.rpg.transfer.v1','{bad');
  const writer=new JourneyStorage(store);
  assert.equal(readSave(writer).kind,'ice');
  writer.setItem(SAVE_KEY,json('cultivator'));
  assert.equal(readSave(writer,BACKUP_KEY).kind,'sword');
});
