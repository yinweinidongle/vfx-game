import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState, readSave } from '../src/game/GameState.js';
import { ENCOUNTERS, SAVE_KEY, isLand, distance } from '../src/game/GameData.js';
import { encounterProfile, MAX_ACTIVE_ENEMIES } from '../src/game/EncounterDirector.js';
import { spiritViewFade } from '../src/game/SpiritViewFade.js';

const idle={dx:0,dz:0};
function arena(index=0,cycle=0) {
  const s=new GameState('ice'),encounter=ENCOUNTERS[index];
  s.save.challenge=cycle;s.save.seals=[true,true];s.player.x=encounter.x;s.player.z=encounter.z+6;
  s.started=new Set(ENCOUNTERS.filter(e=>e!==encounter).map(e=>e.id));s.spawn(encounter);
  return s;
}
const tick=(s,time)=>{for(let i=0;i<Math.ceil(time*60);i++)s.update(1/60,idle);};
const killWave=s=>{for(const e of [...s.enemies])if(e.hp>0)s.hit(e,1e8,'frost');};

test('R into Q tracking does not expose giant halo polygons across the near plane',()=>{
  assert.equal(spiritViewFade(2.143,6.309,-1.431),0,'recorded R-to-Q camera intersection');
  assert.equal(spiritViewFade(0,2,6),1);assert.equal(spiritViewFade(9,3.4,-.8),1);
  let previous=0;for(let d=.8;d<=2.7;d+=.05){const fade=spiritViewFade(0,3.4,-.8-d);assert.ok(Number.isFinite(fade)&&fade>=previous&&fade<=1);previous=fade;}
});

test('authored campaign increases population, health, damage, rewards and recovery pressure independent of player upgrades',()=>{
  let count=0,health=0,damage=0,reward=0;
  for(const e of ENCOUNTERS){
    const n=e.types.length+e.reinforcements.flat().length,p=encounterProfile(e);
    assert.ok(n>=count&&p.health>health&&p.damage>damage&&p.reward>reward);count=n;health=p.health;damage=p.damage;reward=p.reward;
  }
  const base=arena(5),strong=arena(5);strong.save.level=30;strong.save.boons.power=20;strong.recalculate();
  assert.equal(base.enemies[0].maxHp,strong.enemies[0].maxHp);
  const ng=arena(5,2);assert.ok(ng.enemies.length>base.enemies.length);assert.ok(ng.enemies[0].hp>base.enemies[0].hp);assert.ok(ng.enemies[0].xp>base.enemies[0].xp);
});

test('clearing an opening wave does not unlock its seal; last wave clears exactly once and survives saves',()=>{
  const s=arena(2);killWave(s);assert.equal(s.save.cleared.includes('frostkeeper'),false);
  s.nearby={type:'seal',seal:0,encounter:'frostkeeper'};s.save.seals[0]=false;s.interact();assert.equal(s.save.seals[0],false);s.save.seals[0]=true;
  tick(s,1.3);assert.equal(s.enemies.filter(e=>e.hp>0).length,0);
  tick(s,.25);assert.equal(s.enemies.filter(e=>e.hp>0).length,4);
  killWave(s);assert.equal(s.save.cleared.filter(x=>x==='frostkeeper').length,1);const gold=s.save.gold;
  tick(s,2);assert.equal(s.save.gold,gold);assert.equal(s.enemies.length,7);
  const restored=readSave({getItem:()=>JSON.stringify(s.save)}),next=new GameState('ice',restored);next.spawn(ENCOUNTERS[2]);assert.equal(next.enemies.length,0);
});

test('reinforcements respect land, colliders, separation and a safe distance from the player',()=>{
  const s=arena(7);killWave(s);s.obstacles.push({x:42,z:16,r:2.6});tick(s,1.6);
  const alive=s.enemies.filter(e=>e.hp>0);assert.equal(alive.length,7);
  for(const e of alive){assert.ok(isLand(e.x,e.z,.8));assert.ok(distance(e,s.player)>4);assert.ok(Math.hypot(e.x-42,e.z-16)>3.4);}
  for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++)assert.ok(distance(alive[i],alive[j])>1.5);
});

test('wave spawning defers under nearby capacity and retries; distant packs cannot block a new region',()=>{
  const s=arena(0);killWave(s);
  for(let i=0;i<MAX_ACTIVE_ENEMIES;i++)s.enemies.push({id:s.enemies.length,hp:1,x:-29+i*.01,z:8,encounter:'other',state:'return'});
  s.encounters.update(2);assert.equal(s.enemies.filter(e=>e.encounter==='path'&&e.hp>0).length,0);
  for(const e of s.enemies)if(e.encounter==='other'){e.x=60;e.z=30;}
  s.encounters.update(.1);assert.equal(s.enemies.filter(e=>e.encounter==='path'&&e.hp>0).length,1);
});

test('chapter triggers respect both seals and do not reveal late packs through a locked bridge',()=>{
  const s=new GameState();s.player.x=-3;s.player.z=-7;s.update(1/60,idle);assert.equal(s.started.has('bridge'),false);
  s.save.seals[0]=true;s.update(1/60,idle);assert.equal(s.started.has('bridge'),true);
  s.player.x=38;s.player.z=14;s.update(1/60,idle);assert.equal(s.started.has('stair'),false);
  s.save.seals[1]=true;s.update(1/60,idle);assert.equal(s.started.has('stair'),true);
});

test('elite attacks differ mechanically; normal hits cannot stunlock elites and frost can interrupt them',()=>{
  const s=arena(2),e=s.enemies.find(e=>e.elite);e.state='windup';e.timer=.9;s.stats.crit=0;s.hit(e,1,'arrow');assert.equal(e.state,'windup');assert.equal(e.stagger,0);
  s.hit(e,1,'frost');assert.equal(e.state,'chase');assert.equal(e.frozen,.7);
  const position={x:-24,z:-13,targetX:-24,targetZ:-8,damage:20,color:'#b8a1ff'};
  s.eliteAttack({...position,ability:'quake'});assert.equal(s.zones.filter(z=>z.alive).length,2);
  for(const z of s.zones)z.alive=false;s.eliteAttack({...position,ability:'storm'});
  const zones=s.zones.filter(z=>z.alive);assert.equal(zones.length,3);assert.ok(zones[0].tick<zones[1].tick&&zones[1].tick<zones[2].tick);
  s.eliteAttack({...position,ability:'volley'});const shots=s.projectiles.filter(b=>b.alive);assert.equal(shots.length,10);assert.equal(new Set(shots.map(b=>b.delay)).size,2);assert.equal(shots[0].homing,false);
});

test('boss thresholds summon guards and boss defeat cancels every pending guard and hostile effect',()=>{
  const s=arena(8),boss=s.boss;boss.spawnGrace=0;boss.hp=boss.maxHp*.6;s.updateEnemies(.01);assert.equal(boss.phase,1);
  s.encounters.update(.9);assert.equal(s.enemies.length,9);
  boss.hp=boss.maxHp*.2;s.updateEnemies(.01);s.encounters.update(.9);assert.equal(s.enemies.length,14);
  s.launch('enemy','enemy',53,29,0,20);s.enemyZone(53,29,3,2,20);s.hit(boss,1e8,'slash');
  assert.ok(s.save.won);assert.equal(s.enemies.filter(e=>e.hp>0).length,0);assert.equal(s.projectiles.some(b=>b.alive&&b.owner==='enemy'),false);assert.equal(s.zones.some(z=>z.alive&&z.owner==='enemy'),false);
  s.encounters.update(3);assert.equal(s.enemies.length,14);assert.equal(s.events.filter(e=>e.type==='victory').length,1);
});

test('death between waves preserves completed waves, while revive clears all live projectiles',()=>{
  const s=arena(0);killWave(s);s.player.hp=1;s.player.invulnerable=0;s.hurt(2);tick(s,3);assert.equal(s.enemies.length,2);
  s.revive();s.player.x=-29;s.player.z=14;tick(s,1.6);assert.equal(s.enemies.length,3);
  assert.equal(s.projectiles.filter(b=>b.alive).length,0);assert.equal(s.encounters.active.get('path').wave,1);
});

test('dense elite volleys cannot consume the slots reserved for player skills',()=>{
  const s=arena(2);for(let i=0;i<150;i++)s.launch('enemy','enemy',-24,-13,0,1);
  assert.equal(s.projectiles.filter(b=>b.alive).length,64);s.save.boons.power=8;s.recalculate();
  assert.ok(s.cast(0,-24,-13));assert.equal(s.projectiles.filter(b=>b.alive&&b.owner==='player').length,4);assert.equal(s.projectiles.length,96);
});

test('growth adds genuine volley damage without weakening the primary, is legible at every tier, and persists',()=>{
  for(const kind of ['sword','ice','cultivator']){
    const s=new GameState(kind);const totals=[];let previousPrimary=0;
    for(const power of [0,2,5,8]){
      s.save.boons.power=power;s.recalculate();for(const b of s.projectiles)b.alive=false;s.player.attackCooldown=0;
      s.attack(0,0);const shots=s.projectiles.filter(b=>b.alive),primary=shots.find(b=>!b.echo);
      assert.ok(primary.damage>=previousPrimary);assert.equal(shots.length,s.growth.shots);assert.ok(shots.every(b=>b.tier===s.growth.tier&&b.color));
      totals.push(shots.reduce((n,b)=>n+b.damage,0));previousPrimary=primary.damage;assert.ok(s.growth.radiance<2);
    }
    assert.ok(totals.every((v,i)=>!i||v>totals[i-1]));assert.ok(totals[3]>totals[0]*4);
    const stored=new Map();s.write({setItem:(k,v)=>stored.set(k,v)});const loaded=new GameState(kind,readSave({getItem:k=>stored.get(k)}));assert.equal(loaded.growth.tier,3);assert.equal(loaded.stats.damage,s.stats.damage);
  }
});

test('entire authored campaign can finish every wave and every gate, including a second cycle',()=>{
  for(const cycle of [0,2]) {
    const s=new GameState('sword');s.save.challenge=cycle;
    for(const encounter of ENCOUNTERS){
      s.player.x=encounter.x;s.player.z=encounter.z+6;s.spawn(encounter);
      for(let wave=0;wave<5&&!s.save.cleared.includes(encounter.id);wave++) {killWave(s);s.encounters.update(2);}
      assert.ok(s.save.cleared.includes(encounter.id),encounter.id);
      while(s.pendingBoons)s.chooseBoon('power');
      if(encounter.seal!==undefined){s.nearby={type:'seal',seal:encounter.seal,encounter:encounter.id,x:encounter.x,z:encounter.z};s.interact();}
    }
    assert.ok(s.save.won);assert.ok(s.save.seals.every(Boolean));assert.ok(s.save.level>=8);assert.equal(s.growth.tier,3);
  }
});
