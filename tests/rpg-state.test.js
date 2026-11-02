import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState, readSave } from '../src/game/GameState.js';
import { ENCOUNTERS, SAVE_KEY, SKILLS, isLand } from '../src/game/GameData.js';
import { GameNavigation } from '../src/game/GameNavigation.js';
const idle={dx:0,dz:0};
const advance=(s,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)s.update(1/60,idle);};
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};

test('RPG primary attacks consume their own recovery window and skills cause real damage and control',()=>{
  const s=new GameState('sword');s.player.x=-29;s.player.z=10;s.spawn(ENCOUNTERS[0]);const e=s.enemies[0];
  assert.ok(s.attack(e.x,e.z));assert.equal(e.hp,e.maxHp);assert.ok(s.projectiles.some(p=>p.alive&&p.kind==='slash'&&p.primary));const hp=e.hp;assert.equal(s.attack(e.x,e.z),false);assert.equal(e.hp,hp);
  assert.ok(s.cast(0,e.x,e.z));assert.equal(s.player.energy,100-SKILLS[0].cost);assert.equal(s.cast(0,e.x,e.z),false);
  advance(s,.2);assert.ok(e.hp===0||e.frozen>0);assert.ok(s.events.some(e=>e.type==='hit'));
});
test('RPG dash grants a bounded invulnerability window and spends regenerating stamina',()=>{
  const s=new GameState();const hp=s.player.hp;assert.ok(s.dodge(1,0));s.hurt(40);assert.equal(s.player.hp,hp);assert.equal(s.player.stamina,65);
  advance(s,.5);s.hurt(40);assert.equal(s.player.hp,hp-40);assert.ok(s.player.stamina>65);assert.ok(isLand(s.player.x,s.player.z));
});
test('RPG land limits and seal gates block shortcuts, then open through actual quest interactions',()=>{
  const s=new GameState();s.player.x=-2.5;s.player.z=-4.5;s.move(s.player,1,0);assert.equal(s.player.x,-2.5);
  s.save.cleared.push('frostkeeper');s.nearby={type:'seal',id:'seal0',seal:0,encounter:'frostkeeper',x:-24,z:-16};s.interact();assert.equal(s.save.seals[0],true);
  s.move(s.player,1,0);assert.equal(s.player.x,-1.5);assert.equal(s.save.seals[1],false);
  const x=s.player.x;s.move(s.player,1000,1000);assert.equal(s.player.x,x);
});
test('RPG equipment changes combat statistics, duplicates do not duplicate inventory, and checkpoints restore after death',()=>{
  const s=new GameState(),base=s.stats.damage;s.grantItem('jade');s.grantItem('jade');assert.equal(s.save.inventory.length,1);assert.ok(s.stats.damage>base);
  s.grantItem('heart');s.equip('heart');assert.equal(s.save.equipment.charm,'heart');assert.equal(s.stats.hp,245);
  s.player.hp=1;s.hurt(30);assert.ok(s.dead);s.revive();assert.equal(s.player.hp,s.stats.hp);assert.equal(s.player.x,-28);assert.equal(s.save.inventory.length,2);
});
test('RPG saved progression is versioned and untrusted or incompatible data cannot create invalid equipment',()=>{
  const s=new GameState('ice'),store=storage();s.grantItem('thunder');s.save.seals[0]=true;s.write(store);const restored=readSave(store);
  assert.equal(restored.kind,'ice');assert.deepEqual(restored.seals,[true,false]);assert.equal(restored.equipment.ring,'thunder');
  store.setItem(SAVE_KEY,JSON.stringify({...restored,level:Infinity,inventory:['unknown'],equipment:{charm:'unknown'}}));const safe=readSave(store);assert.equal(safe.level,1);assert.deepEqual(safe.equipment,{});
  store.setItem(SAVE_KEY,'{broken');assert.equal(readSave(store),null);
});
test('RPG projectile capacity stays fixed and delayed area damage is distinct from telegraph time',()=>{
  const s=new GameState('cultivator'),pool=s.projectiles;s.player.x=-29;s.player.z=10;s.spawn(ENCOUNTERS[0]);const e=s.enemies[0];
  assert.ok(s.cast(2,e.x,e.z));assert.equal(e.hp,e.maxHp);advance(s,.7);assert.equal(e.hp,e.maxHp);advance(s,.3);assert.ok(e.hp<e.maxHp);
  for(let i=0;i<200;i++)s.launch('spirit','player',-30,10,0,1);assert.equal(s.projectiles,pool);assert.equal(pool.length,96);advance(s,4);assert.ok(pool.filter(p=>p.alive).length<96);
});
test('RPG pending growth survives save and reload, and revive resets enemies to their encounter',()=>{
  const s=new GameState(),store=storage();s.gainXP(110);assert.equal(s.pendingBoons,1);s.write(store);
  const restored=new GameState('sword',readSave(store));assert.equal(restored.pendingBoons,1);restored.chooseBoon('vitality');assert.equal(restored.pendingBoons,0);assert.equal(restored.stats.hp,229);
  s.spawn(ENCOUNTERS[0]);const e=s.enemies[0];e.x=-26;e.z=22;e.hp=2;s.revive();assert.equal(e.x,e.homeX);assert.equal(e.z,e.homeZ);assert.equal(e.hp,e.maxHp);
});
test('RPG click navigation goes around a tree and opens the next island only after its seal',()=>{
  const s=new GameState();s.obstacles.push({x:-28,z:17,r:1.4});const nav=new GameNavigation(s),route=nav.find(-28,22,-28,11);
  assert.ok(route.length>1);let prior={x:-28,z:22};for(const p of route){assert.ok(isLand(p.x,p.z,.5));assert.ok(Math.hypot(p.x+28,p.z-17)>=1.99);assert.ok(nav.clearLine(prior.x,prior.z,p.x,p.z));prior=p;}
  assert.equal(nav.find(-8,-4,8,-8),null);s.save.seals[0]=true;const open=nav.find(-8,-4,8,-8);assert.ok(open.length>=1);assert.equal(nav.find(30,1,48,20),null);
  s.save.seals[1]=true;assert.ok(nav.find(30,1,48,20).length>=1);
});
