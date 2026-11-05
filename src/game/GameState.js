import {REGIONS, bountyProgress} from './RegionBounties.js';
import { advanceLoot } from './LootMotion.js';
import { BOONS, CLASSES, ENCOUNTERS, INTERACTABLES, ITEMS, SAVE_KEY, SKILLS, chapterAllows, clamp, distance, heightAt, isLand, segmentDistance, zoneAt } from './GameData.js';
import { attackGrowth, projectileColor, MAX_FERVOR } from './AttackGrowth.js';
import { GameFervorVolley } from './GameFervorVolley.js';
import { GameHaloVolley } from './GameHaloVolley.js';
import { EncounterDirector } from './EncounterDirector.js';
import { swordEvolution } from './SwordEvolution.js';
import { sampleWorldCycle } from './WorldCycle.js';
import { GameAwakening } from './GameAwakening.js';
import { AWAKENING_RANGE } from './AwakeningConfig.js';
import { vitalityGrowth, spiritGrowth, skillColor } from './CultivationGrowth.js';
import { readGearSave, equippedGearStats } from './GearData.js';
import { GameGear } from './GameGear.js';

const fresh = kind => ({ version: 1, kind, level: 1, xp: 0, gold: 0, seals: [false, false], cleared: [], opened: [], memories: [], inventory: [], equipment: {}, boons: { power: 0, vitality: 0, spirit: 0 }, checkpoint: 'camp', playTime: 0, kills: 0, deaths: 0, won: false, challenge: 0, pendingBoons: 0, trackedChapter: 0, gearBag:[],gearEquipped:{},nextGearId:1,gearPity:0,shopEpoch:0,shopBought:[],groundGear:[],nextLootId:1 });
export function readSave(storage,key=SAVE_KEY) {
  try {
    const s = JSON.parse(storage.getItem(key));
    if (s?.version !== 1 || !Object.hasOwn(CLASSES, s.kind)) return null;
    const d = fresh(s.kind);
    const numeric = (value, min, max) => Number.isFinite(Number(value)) ? clamp(Number(value), min, max) : min;
    d.level = Math.floor(numeric(s.level, 1, 50));
    for (const key of ['xp', 'gold', 'kills', 'deaths', 'challenge']) d[key] = Math.floor(numeric(s[key], 0, key === 'gold' ? 1e9 : 1e7));
    d.playTime = numeric(s.playTime, 0, Number.MAX_SAFE_INTEGER);
    d.pendingBoons = Math.floor(numeric(s.pendingBoons, 0, 50));
    d.trackedChapter = Math.floor(numeric(s.trackedChapter, 0, REGIONS.length));
    if (Number.isInteger(s.rng) && s.rng >= 0 && s.rng <= 0xffffffff) d.rng = s.rng;
    d.won = s.won === true;
    d.seals = [s.seals?.[0] === true, s.seals?.[1] === true];
    const ids = (list, valid) => [...new Set((Array.isArray(list) ? list : []).filter(id => typeof id === 'string' && valid(id)))];
    d.cleared = ids(s.cleared, id => ENCOUNTERS.some(e => e.id === id));
    d.opened = ids(s.opened, id => INTERACTABLES.some(e => e.id === id && e.type === 'chest'));
    d.memories = ids(s.memories, id => INTERACTABLES.some(e => e.id === id && e.type === 'memory'));
    d.inventory = ids(s.inventory, id => Object.hasOwn(ITEMS, id));
    for (const slot of ['charm', 'ring', 'arms']) if (d.inventory.includes(s.equipment?.[slot])&&ITEMS[s.equipment[slot]].slot===slot) d.equipment[slot] = s.equipment[slot];
    for (const b of BOONS) d.boons[b.id] = clamp(Math.floor(Number(s.boons?.[b.id]) || 0), 0, 50);
    if (INTERACTABLES.some(i => i.type === 'camp' && i.id === s.checkpoint)) d.checkpoint = s.checkpoint;
    readGearSave(s,d);
    return d;
  } catch { return null; }
}

/** Deterministic combat simulation. No renderer, DOM or wall-clock dependencies. */
export class GameState {
  constructor(kind = 'sword', save = null) {
    this.save = save || fresh(kind); if(!this.save.gearBag)readGearSave(this.save,this.save);this.kind = this.save.kind;this.gear=new GameGear(this);
    this.cycle = sampleWorldCycle(this.save.playTime);
    this.time = 0; this.events = []; this.enemies = []; this.obstacles = [];
    this.projectiles = Array.from({ length: 96 }, (_, id) => ({ id, alive: false, hit: new Set() }));
    this.zones = Array.from({ length: 24 }, () => ({ alive: false }));
    this.haloVolley=new GameHaloVolley(this);this.fervorVolley=new GameFervorVolley(this);this.awakening=new GameAwakening(this);this.lockedTarget=null;
    this.drops = (this.save.groundGear||[]).filter(d=>isLand(d.x,d.z,.1)).map(d=>({...d,gear:{...d.gear},alive:true}));this.save.nextLootId ||= 1;this.save.groundGear ||= [];this.pendingBoons = this.save.pendingBoons || 0; this.started = new Set(this.save.cleared);
    this.encounters = new EncounterDirector(this);
    this.player = { x: -28, z: 22, yaw: 0, hp: 1, energy: 100, stamina: 100, invulnerable: 0, action: 'idle', actionTime: 0, cooldowns: SKILLS.map(()=>0), attackCooldown: 0, potion: 0, combat: 0, dash: 0, dashX: 0, dashZ: 0, combo: 0 };
    const camp = INTERACTABLES.find(i => i.id === this.save.checkpoint); this.player.x = camp.x; this.player.z = camp.z - 3;
    Object.assign(this.player,{shield:0,shieldDelay:0,regenLock:0,energyHitAt:-10,hurtFlash:0});
    this.recalculate(); this.player.hp = this.stats.hp; this.dead = false; this.boss = null; this.nearby = null;
    this.saveDirty = false; this.rng = this.save.rng ?? 19387; this.lastZone = zoneAt(this.player.x, this.player.z).id;
    this.settleCappedBoons();
  }
  random() { this.rng = (Math.imul(1664525, this.rng) + 1013904223) >>> 0; return this.rng / 4294967296; }
  emit(type, detail = {}) { this.events.push({ ...detail, type }); }
  recalculate() {
    const previous = this.growth,oldShield=this.vitality,oldSpirit=this.spirit;
    this.vitality=vitalityGrowth(this.save.boons.vitality);this.spirit=spiritGrowth(this.save.boons.spirit);
    this.stats=this.statsFor();this.growth=attackGrowth(this.kind,this.stats.damage,CLASSES[this.kind].damage,this.save.boons.power);
    this.player.shield=Math.min(this.vitality.capacity,(this.player.shield||0)+Math.max(0,this.vitality.capacity-(oldShield?.capacity||0)));
    this.player.energy=oldSpirit?Math.min(this.stats.energyMax,this.player.energy+Math.max(0,this.spirit.energyMax-oldSpirit.energyMax)):this.stats.energyMax;
    this.player.hp=Math.min(this.player.hp,this.stats.hp);
    if(oldShield&&this.vitality.level>oldShield.level)this.emit('vitalityUpgrade',{text:`长生 ${this.vitality.level} 层 · 护罩可吸收 ${this.vitality.capacity} 点伤害`});
    if(oldSpirit&&this.spirit.level>oldSpirit.level)this.emit('spiritUpgrade',{text:`灵息 ${this.spirit.level} 层 · ${this.spirit.name} · 灵力上限 ${this.stats.energyMax}`});
    if (previous && this.growth.tier > previous.tier) this.emit('ascend', { ...this.growth, x: this.player.x, z: this.player.z, text: `攻势觉醒 · ${this.growth.name} · ${this.growth.shots} 重追击` });
    if(previous&&this.growth.stacks>previous.stacks)this.emit('fervorUpgrade',{from:previous.stacks,stacks:this.growth.stacks,finishTier:this.growth.finishTier,text:`锋芒 ${this.growth.stacks} 层 · 新增一枚${this.growth.spiritName} · ${this.growth.echoes} 道追击${this.growth.finishTier>previous.finishTier?' · 终结爆发进阶':''}`});
  }
  attackBase() { return CLASSES[this.kind].damage + equippedGearStats(this.save).damage; }
  statsFor(equipment=this.save.equipment,gearEquipped=this.save.gearEquipped) {
    const c = CLASSES[this.kind], b = this.save.boons, items = Object.values(equipment).map(id => ITEMS[id]).filter(Boolean);
    const sum = k => items.reduce((n, i) => n + (i[k] || 0), 0);
    const spirit=spiritGrowth(b.spirit),gear=equippedGearStats(this.save,gearEquipped);
    return { hp: c.hp + (this.save.level - 1) * 14 + b.vitality * 35 + sum('vitality')+gear.hp, damage: (c.damage+gear.damage) * (1 + b.power * .12 + sum('power') + (this.save.level - 1) * .10), crit: Math.min(.7, .08 + sum('crit') + (this.kind === 'ice' ? .1 : 0)), haste: Math.min(.55, sum('haste') + b.spirit * .05), regen: (this.kind === 'cultivator' ? 2.8 : 2.2) * spirit.regenMultiplier+gear.regen, energyMax:spirit.energyMax+gear.energyMax, speed: c.speed*(1+Math.min(.65,gear.speed)),attackSpeed:1+Math.min(1.4,gear.attackSpeed) };
  }
  write(storage) { try { this.gear.syncGround(false);this.save.rng=this.rng;storage.setItem(SAVE_KEY, JSON.stringify(this.save)); this.saveDirty = false; return true; } catch { this.emit('toast', { text: '浏览器无法保存进度，请检查存储空间。' }); return false; } }
  trackBounty(chapter) {
    const region = REGIONS[chapter - 1];
    const progress = region && bountyProgress(this.save, region);
    if (!progress?.available || !progress.next) return false;
    this.save.trackedChapter = this.save.trackedChapter === chapter ? 0 : chapter;
    this.saveDirty = true;
    return true;
  }
  objective() {
    const region = REGIONS[this.save.trackedChapter - 1];
    if (region) {
      const next = region.encounters.find(e => !this.save.cleared.includes(e.id));
      if (next && this.encounters.accessible(next)) {
        return {title: region.name + ' · 清剿悬赏', text: '前往' + next.name + '，击退全部敌人', x: next.x, z: next.z};
      }
    }
    if (this.save.won) { const camp=INTERACTABLES.filter(i=>i.type==='camp').sort((a,b)=>distance(a,this.player)-distance(b,this.player))[0];return { title:'归墟已醒',text:'回到任意灯台，开启更高难度的轮回。',x:camp.x,z:camp.z }; }
    if (!this.save.seals[0]) return { title: '第一章 · 风雪旧梦', text: this.save.cleared.includes('frostkeeper') ? '激活听雪封印' : '击败北方的封印守望者', x: -24, z: -16 };
    if (!this.save.seals[1]) return { title: '第二章 · 悬星遗梦', text: this.save.cleared.includes('starkeeper') ? '激活悬星封印' : '穿过石桥，解除遗迹深处的封印', x: 16, z: -28 };
    return { title: '终章 · 万象归墟', text: '前往东南王座，击败归墟之主', x: 53, z: 29 };
  }
  move(entity, dx, dz, radius = .45) {
    let x = entity.x + dx, z = entity.z + dz;
    if (!isLand(x, z, radius)) return;
    if (entity === this.player && !chapterAllows(this.save.seals,x,z)) return;
    for (const o of this.obstacles) {
      const ox = x - o.x, oz = z - o.z, d = Math.hypot(ox, oz), min = radius + o.r;
      if (d < min && d > .0001) { x = o.x + ox / d * min; z = o.z + oz / d * min; }
    }
    if (isLand(x,z,radius) && (entity !== this.player || chapterAllows(this.save.seals,x,z))) { entity.x=x; entity.z=z; }
  }
  spawn(encounter) {
    this.encounters.start(encounter);
  }
  launch(kind, owner, x, z, yaw, damage, options = {}) {
    const p = this.projectiles.find(p => !p.alive&&(owner!=='enemy'||p.id>=32)&&(!options.fervor||p.id>=16)&&(p.retiredAt===undefined||this.time-p.retiredAt>.3)); if (!p) return null;
    Object.assign(p, { generation:(p.generation||0)+1,retiredReason:null,alive: true, kind, owner, x, z,y:heightAt(x,z)+1.2, originX: x, originZ: z, yaw, damage, age: 0, life:2, delay:0, speed:kind==='enemy'?9:24, radius:kind==='slash'?1.7:.45, pierce:kind==='slash', target:null,tier:0,radiance:1.15,color:projectileColor(kind,0),scale:1,arc:0,primary:false,homing:owner==='player',...options });
    p.fervor=options.fervor===true;p.finisher=options.finisher===true;p.fervorSplash=false;p.spiritLevel=options.spiritLevel||0;p.skillStage=options.skillStage||0;p.skillAccent=options.skillAccent||p.color;
    p.fervorLevel=kind==='slash'?this.growth.stacks:0;p.swordStyle=kind==='slash'?swordEvolution(p.fervorLevel,p.spiritLevel):null;
    if(p.swordStyle){p.color=p.swordStyle.color;p.skillAccent=p.swordStyle.edge;}
    p.launchY=p.y;p.hit.clear(); this.emit('projectile', { projectile: p }); return p;
  }
  volley(kind,target,yaw,damage,primary=false){
    const p=this.player,g=this.growth,count=g.shots,socket=this.kind==='ice'&&(kind==='arrow'||kind==='frost')?this.attackSocket:null;
    const magic=!primary?this.spirit:null,index=kind==='frost'?0:1;
    const targets=this.enemies.filter(e=>e.hp>0&&e.state!=='return'&&distance(e,p)<24).sort((a,b)=>distance(a,target||p)-distance(b,target||p));
    let launched = 0;
    for(let i=0;i<count;i++){
      const enemy=(i===0 && target) || targets[i%Math.max(1,targets.length)]||target,angle=enemy?Math.atan2(enemy.x-p.x,enemy.z-p.z):yaw;
      const lane=i-(count-1)/2,sign=count===1?(p.combo%2?1:-1):Math.sign(lane)||1;
      const arc=(kind==='arrow'||kind==='frost'||kind==='spirit')?sign*(.34+Math.abs(lane)*.16):lane*.1;
      const near=enemy?Math.min(1,distance(enemy,p)/5):1;
      // The primary projectile keeps its full damage after a form unlock; echoes add damage.
      const shot = this.launch(kind,'player',(socket?.x??p.x)+Math.cos(angle)*lane*.16,(socket?.z??p.z)-Math.sin(angle)*lane*.16,angle+arc*near,damage*(i===0?1:.42),
        {y:socket?.y??heightAt(p.x,p.z)+1.2,target:enemy,arc,delay:.12,tier:g.tier,radiance:g.radiance,color:magic?.level?skillColor(index,magic.level):projectileColor(kind,g.tier),spiritLevel:magic?.level||0,skillStage:magic?.stage||0,skillAccent:magic?.accent,
          radius:kind==='slash'?(primary?.72:1.9):.48,scale:(kind==='slash'?(primary?.62:1.12):kind==='frost'?1.25:.85)*(i?.85:1)*(magic?.size||1),
          life:2,homing:true,pierce:kind==='slash'&&!primary,primary,echo:i>0});
      if (shot) launched++;
    }
    return launched;
  }
  attack(aimX, aimZ) {
    const p = this.player; if (this.dead || p.attackCooldown > 0 || p.dash > 0 || (this.awakening.active&&this.awakening.age<.5)) return false;
    const target=this.aimTarget(aimX,aimZ,24),yaw=Math.atan2((target?.x??aimX)-p.x,(target?.z??aimZ)-p.z);this.lockedTarget=target;p.yaw=yaw;p.combo=(p.combo+1)%3;
    p.action = 'attack'; p.actionTime = 0; p.attackCooldown = (this.kind === 'sword' ? .48 : .55) / ((1 + this.growth.tier * .045)*this.stats.attackSpeed);
    this.volley(this.kind==='sword'?'slash':this.kind==='ice'?'arrow':'spirit',target,yaw,this.stats.damage*(this.kind==='sword'&&p.combo===0?1.2:1),true);
    this.fervorVolley.request(target);
    this.emit('attack', { kind: this.kind, tier:this.growth.tier, color:this.growth.color }); return true;
  }
  aimTarget(x, z, range) {
    let target = null, best = Infinity;
    for (const e of this.enemies) if (e.hp > 0 && e.state!=='return' && distance(e, this.player) < range) {
      const cursor=Math.hypot(e.x-x,e.z-z),d=cursor<3?cursor-100:distance(e,this.player)*.75+cursor*.12;
      if (d < best) { best = d; target = e; }
    }
    return target;
  }
  cast(index, aimX, aimZ) {
    const p = this.player, skill = SKILLS[index];
    if (!skill || this.dead || p.dash > 0 || p.cooldowns[index] > 0 || (this.awakening.active&&this.awakening.age<.5)) return false;
    if(skill.unlockLevel&&this.save.level<skill.unlockLevel){this.emit('toast',{text:`角色达到 ${skill.unlockLevel} 级后，解锁 ${skill.key} · ${skill.name}。`});return false;}
    if(index>=3&&this.awakening.active)return false;
    const target=index>=3?this.enemies.filter(e=>e.hp>0&&e.state!=='return'&&(e.spawnGrace||0)<=0&&distance(e,p)<=AWAKENING_RANGE).sort((a,b)=>distance(a,p)-distance(b,p))[0]:this.aimTarget(aimX,aimZ,26);
    if(!target){this.emit('toast',{text:'附近暂无可攻击的敌人，技能与灵力已保留。'});return false;}
    this.lockedTarget=target;aimX=target.x;aimZ=target.z;
    if (p.energy < skill.cost) { this.emit('toast', { text: '灵力不足，普通攻击与时间流逝可以恢复灵力。' }); return false; }
    const yaw = Math.atan2(aimX - p.x, aimZ - p.z);
    const area = index === 2 ? this.zones.find(z => !z.alive) : null;
    let hasEffect = true;
    if (index < 2) {
      const damage = this.stats.damage * (index === 0 ? 2.3 : 3.3) * this.spirit.damage;
      hasEffect = this.volley(skill.id, target, yaw, damage) > 0;
    } else if (index === 2) {
      hasEffect = !!area;
    }
    if (!hasEffect) {
      this.emit('toast', {text: '当前攻势密集，请稍后再释放。'});
      return false;
    }
    p.energy -= skill.cost;p.regenLock=1.4; p.cooldowns[index] = skill.cooldown * (1 - this.stats.haste);
    p.yaw = Math.atan2(aimX - p.x, aimZ - p.z); p.action = index >= 2 ? 'cast' : 'attack'; p.actionTime = 0;
    if(index>=3){p.invulnerable=Math.max(p.invulnerable,.65);p.attackCooldown=Math.max(p.attackCooldown,.5);this.awakening.begin(index);}
    else if (index === 2) {
      const d = Math.hypot(aimX - p.x, aimZ - p.z), limit = Math.min(d, 26) / Math.max(d, .001);
      const x = p.x + (aimX - p.x) * limit, z = p.z + (aimZ - p.z) * limit;
      const color=this.spirit.level?skillColor(2,this.spirit.level):this.growth.color;
      Object.assign(area, { alive: true, owner: 'player', x, z, radius: 5*this.spirit.size, age: 0, delay: .85, life: 3.8, tick: .85, damage: this.stats.damage * 1.4*this.spirit.damage, tier:this.growth.tier, color, radiance:this.growth.radiance,spiritLevel:this.spirit.level,skillStage:this.spirit.stage,skillAccent:this.spirit.accent });
      const event={x:p.x,z:p.z,targetX:x,targetZ:z,yaw:p.yaw,tier:this.growth.tier,color,spiritLevel:this.spirit.level,skillStage:this.spirit.stage,skillAccent:this.spirit.accent};
      this.haloVolley.begin(event,this.growth.haloCount+this.spirit.haloBonus,this.stats.damage*(.12+this.growth.tier*.015)*this.spirit.damage);
      this.emit('divine',event);
    }
    this.fervorVolley.request(target);this.emit('cast', { index,spiritLevel:this.spirit.level,skillStage:this.spirit.stage,skillAccent:this.spirit.accent }); return true;
  }
  dodge(dx, dz) {
    const p = this.player; if (this.dead || p.stamina < 35 || p.dash > 0) return false;
    const len = Math.hypot(dx, dz); p.dashX = len ? dx / len : Math.sin(p.yaw); p.dashZ = len ? dz / len : Math.cos(p.yaw);
    p.stamina -= 35; p.dash = .26; p.invulnerable = .32; p.action = 'dodge'; p.actionTime = 0;
    this.emit('dodge', { x: p.x, z: p.z }); return true;
  }
  heal() {
    const p = this.player; if (this.dead || p.potion > 0 || p.hp >= this.stats.hp) return false;
    p.hp = Math.min(this.stats.hp, p.hp + this.stats.hp * .45); p.potion = 18;
    this.emit('heal', { x: p.x, z: p.z }); return true;
  }
  hit(enemy, amount, element, style=null) {
    if (enemy.hp <= 0) return;
    const critical = this.random() < this.stats.crit, damage = Math.round(amount * (critical ? 1.75 : 1));
    enemy.hp = Math.max(0, enemy.hp - damage); enemy.flash = .15;
    if (element === 'frost') enemy.frozen = enemy.type === 'boss' ? .35 : enemy.elite ? .7 : 1.65;
    else if (enemy.type !== 'boss' && !enemy.elite) enemy.stagger = .16;
    if (enemy.state === 'windup' && (enemy.frozen > 0 || enemy.stagger > 0)) { enemy.state = 'chase'; enemy.timer = .45; }
    this.player.combat = 4;
    // Only a normal attack's main projectile restores mana, once per attack interval.
    // Echoes, area ticks and spell bolts must never refill the entire pool.
    if(style?.primary&&!style.echo&&!style.fervor&&this.time-this.player.energyHitAt>=.45){this.player.energy=Math.min(this.stats.energyMax,this.player.energy+1);this.player.energyHitAt=this.time;}
    this.emit('hit', { x: enemy.x, z: enemy.z, damage, critical, element, scale: enemy.scale,enemyId:enemy.id,primary:style?.primary,color:style?.color,radiance:style?.radiance,tier:style?.tier??this.growth.tier,echo:style?.echo,fervor:style?.fervor,finisher:style?.finisher,finishTier:style?.finishTier,finishRadius:style?.finishRadius,fervorSplash:style?.fervorSplash,spiritLevel:style?.spiritLevel||0,skillStage:style?.skillStage||0,skillAccent:style?.skillAccent });
    if (enemy.hp === 0) {
      enemy.state = 'dead'; this.save.kills++; this.save.gold += enemy.type === 'boss' ? 200 : Math.round(enemy.xp * .45); this.gainXP(enemy.xp);
      this.drops.push({ x: enemy.x, z: enemy.z, age: 0, alive: true });this.gear.drop(enemy); this.emit('death', { enemy });
      this.encounters.onDeath(enemy);
      this.saveDirty = true;
    }
  }
  hurt(damage,source=null) {
    const p = this.player; if (this.dead || p.invulnerable > 0) return;
    const absorbed=Math.min(p.shield,Math.max(0,damage));p.shield-=absorbed;p.shieldDelay=this.vitality.delay;
    p.hp = Math.max(0, p.hp - (damage-absorbed)); p.invulnerable = .4; p.combat = 5;
    if(absorbed>0){const dx=(source?.x??p.x+Math.sin(p.yaw))-p.x,dz=(source?.z??p.z+Math.cos(p.yaw))-p.z,len=Math.hypot(dx,dz)||1;this.emit('shieldHit',{absorbed,broken:p.shield<=0,nx:dx/len,nz:dz/len});}
    if(damage>absorbed){p.hurtFlash=.12;this.emit('hurt', { damage:damage-absorbed, x: p.x, z: p.z });}
    if (p.hp <= 0) { this.dead = true; this.save.deaths++; this.emit('defeat'); this.saveDirty = true; }
  }
  gainXP(xp) {
    this.save.xp += xp;
    while (this.save.level < 50 && this.save.xp >= this.save.level * 95) { this.save.xp -= this.save.level * 95; this.save.level++; this.pendingBoons++; this.save.pendingBoons=this.pendingBoons; this.saveDirty=true; this.recalculate(); if (!this.dead) this.player.hp = this.stats.hp; this.emit('level');const unlocked=SKILLS.find(k=>k.unlockLevel===this.save.level);if(unlocked)this.emit('awakeningUnlocked',{text:`觉醒已至 · ${unlocked.key} · ${unlocked.name} 已解锁。`}); }
    this.settleCappedBoons();
    if (this.save.level === 50) this.save.xp = Math.min(this.save.xp, 50 * 95);
  }
  settleCappedBoons() {
    if (!this.pendingBoons || BOONS.some(b => this.save.boons[b.id] < MAX_FERVOR)) return;
    const gold = this.pendingBoons * 120;
    this.pendingBoons = this.save.pendingBoons = 0;
    this.save.gold += gold;
    this.saveDirty = true;
    this.emit('toast', {text: `三道圆满，本次修行奖励折合 ${gold} 灵石。`});
  }
  chooseBoon(id) {
    if (this.pendingBoons <= 0 || !BOONS.some(b => b.id === id) || this.save.boons[id]>=MAX_FERVOR) return;
    this.save.boons[id]++; this.pendingBoons--; this.save.pendingBoons=this.pendingBoons; this.recalculate(); this.player.hp = this.stats.hp; this.saveDirty = true;
    if(id==='vitality'){this.player.shield=this.vitality.capacity;this.player.shieldDelay=0;}
    this.settleCappedBoons();
  }
  grantItem(id) {
    if (!this.save.inventory.includes(id)) this.save.inventory.push(id);
    const slot = ITEMS[id].slot; if (!this.save.equipment[slot]) { this.save.equipment[slot] = id; this.recalculate(); }
    this.emit('loot', { id }); this.saveDirty = true;
  }
  equip(id) {
    if (!this.save.inventory.includes(id)) return;
    this.save.equipment[ITEMS[id].slot] = id; this.recalculate(); this.player.hp = Math.min(this.player.hp, this.stats.hp); this.saveDirty = true;
  }
  interact() {
    const o = this.nearby; if (!o || this.dead) return;
    if (o.type === 'camp') {
      if (this.enemies.some(e => e.hp > 0 && distance(e, this.player) < 10)) { this.emit('toast', { text: '附近尚有敌人，暂时无法休整。' }); return; }
      this.save.checkpoint = o.id; this.player.hp = this.stats.hp; this.player.energy=this.stats.energyMax;this.player.shield=this.vitality.capacity;this.player.shieldDelay=this.player.regenLock=0; this.player.stamina = 100; this.player.potion = 0; this.saveDirty = true; this.emit('camp');
    } else if (o.type === 'chest') {
      if (this.save.opened.includes(o.id)) return;
      this.save.opened.push(o.id); this.save.gold += 45; this.grantItem(o.reward); this.emit('chest', { id: o.id, x: o.x, z: o.z });
    } else if (o.type === 'memory') {
      if (!this.save.memories.includes(o.id)) { this.save.memories.push(o.id); this.gainXP(25); this.saveDirty = true; }
      this.emit('memory', { name: o.name, text: o.text });
    } else if (o.type === 'seal') {
      if (!this.save.cleared.includes(o.encounter)) { this.emit('toast', { text: '击败守望者后，方能解除封印。' }); return; }
      if (this.save.seals[o.seal]) return;
      this.save.seals[o.seal] = true; this.gainXP(90); this.saveDirty = true; this.emit('seal', { x: o.x, z: o.z, text: o.seal ? '双印共鸣 · 归墟之门已开启' : '听雪封印解除 · 石桥已开启' });
    }
  }
  upgrade() {
    const cost = 100 + this.save.boons.power * 65;
    if (this.save.gold < cost || this.save.boons.power>=MAX_FERVOR) return false;
    this.save.gold -= cost; this.save.boons.power++; this.recalculate(); this.saveDirty = true; return true;
  }
  nextCycle() {
    if (!this.save.won || !this.gear.canTrade()) return null;
    const progress = structuredClone(this.save);
    Object.assign(progress, {challenge: progress.challenge + 1, won: false, seals: [false, false],
      cleared: [], opened: [], trackedChapter: 0, checkpoint: 'camp', groundGear: [], rng: this.rng});
    const next = new GameState(this.kind, progress);
    for (const drop of this.drops) {
      if (drop.alive && drop.gear) next.gear.grant(drop.gear, false);
    }
    return next;
  }
  revive() {
    const camp = INTERACTABLES.find(o => o.id === this.save.checkpoint); const p = this.player;
    p.x = camp.x; p.z = camp.z - 3; p.hp = this.stats.hp;p.energy=this.stats.energyMax;p.shield=this.vitality.capacity;p.shieldDelay=p.regenLock=0;p.energyHitAt=-10;p.hurtFlash=0; p.stamina = 100; p.invulnerable = 2; this.dead = false;
    p.dash=0;p.action='idle';p.actionTime=0;p.cooldowns.fill(0);p.attackCooldown=p.potion=0;this.awakening.reset();
    for (const e of this.enemies) if (e.hp > 0) { e.x=e.homeX;e.z=e.homeZ;e.hp=e.maxHp;e.frozen=e.stagger=0;e.state = 'chase'; e.timer = 1.5; }
    for (const p of this.projectiles) p.alive = false; for (const z of this.zones) z.alive = false;
    this.haloVolley.reset();this.fervorVolley.reset();this.lockedTarget=null;
    this.emit('revive');
  }
  update(dt, input) {
    if (this.dead) return;
    dt = Math.min(dt, .04); this.time += dt; this.save.playTime += dt;
    const wasNight=this.cycle.enraged;sampleWorldCycle(this.save.playTime,this.cycle);
    if(wasNight!==this.cycle.enraged)this.emit('dayNight',{night:this.cycle.enraged,text:this.cycle.enraged?'夜幕降临 · 妖物赤目狂暴，伤害与攻势增强':'晨光初现 · 妖物狂暴消退'});
    const p = this.player, lastX=p.x, lastZ=p.z; p.actionTime += dt; p.attackCooldown = Math.max(0, p.attackCooldown - dt); p.potion = Math.max(0, p.potion - dt);
    p.hurtFlash=Math.max(0,p.hurtFlash-dt);p.invulnerable = Math.max(0, p.invulnerable - dt); p.combat = Math.max(0, p.combat - dt);
    for (let i=0;i<p.cooldowns.length;i++) p.cooldowns[i]=Math.max(0,p.cooldowns[i]-dt);
    const manaDt=Math.max(0,dt-p.regenLock),shieldDt=Math.max(0,dt-p.shieldDelay);
    p.regenLock=Math.max(0,p.regenLock-dt);p.shieldDelay=Math.max(0,p.shieldDelay-dt);
    p.energy = Math.min(this.stats.energyMax, p.energy + manaDt * this.stats.regen);p.shield=Math.min(this.vitality.capacity,p.shield+shieldDt*this.vitality.regen); p.stamina = Math.min(100, p.stamina + dt * 24);
    if (p.combat === 0) p.hp = Math.min(this.stats.hp, p.hp + dt * 1.7);
    if (p.dash > 0) { p.dash -= dt; this.move(p, p.dashX * 25 * dt, p.dashZ * 25 * dt); }
    else if (input.dx || input.dz) {
      const len = Math.hypot(input.dx, input.dz), speed = this.stats.speed * (p.action === 'cast' && p.actionTime < .65 ? .45 : 1);
      this.move(p, input.dx / len * speed * dt, input.dz / len * speed * dt);
      if (p.attackCooldown < .2 && (p.action !== 'cast' || p.actionTime > .8)) { p.yaw = Math.atan2(input.dx, input.dz); p.action = 'run'; }
    } else if (p.actionTime > .8 || p.action === 'run' || p.action === 'dodge') p.action = 'idle';
    p.vx=dt>0?(p.x-lastX)/dt:0;p.vz=dt>0?(p.z-lastZ)/dt:0;
    const zone = zoneAt(p.x, p.z); if (zone.id !== this.lastZone) { this.lastZone = zone.id; this.emit('region', { zone }); }
    this.encounters.update(dt);
    this.updateEnemies(dt); this.updateProjectiles(dt);this.haloVolley.update(dt);this.fervorVolley.update();this.awakening.update(dt);
    for (const z of this.zones) if (z.alive) {
      z.age += dt;
      if (z.age >= z.tick) {
        if (z.owner === 'enemy') { if (Math.hypot(p.x - z.x, p.z - z.z) < z.radius + .3) this.hurt(z.damage,z); z.alive = false; }
        else { for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - z.x, e.z - z.z) < z.radius) this.hit(e, z.damage, 'star', z); z.tick += .42; }
        this.emit('burst', { x: z.x, z: z.z, element: z.owner === 'enemy' ? 'enemy' : 'star', radius: z.radius, color:z.color, tier:z.tier,spiritLevel:z.spiritLevel||0,skillStage:z.skillStage||0,skillAccent:z.skillAccent });
      }
      if (z.age > z.life) z.alive = false;
    }
    for (const d of this.drops) if (d.alive) {
      d.age += dt;
      if(d.gear){if(advanceLoot(d,dt,p))this.emit('gearLand',{lootId:d.lootId,x:d.x,y:d.y,z:d.z,rarity:d.gear.rarity});}
      const len = distance(d, p);
      if (!d.gear&&len < 7) { const t = Math.min(1, dt * (2 + d.age * 2)); d.x += (p.x - d.x) * t; d.z += (p.z - d.z) * t; }
      if (len < (d.gear?1.2:.6)&&(!d.gear||d.age>(d.flight||.7)+.24)) { d.alive = false;if(d.gear){this.gear.grant(d.gear);this.gear.syncGround();}else{p.hp = Math.min(this.stats.hp, p.hp + 4); p.energy = Math.min(this.stats.energyMax, p.energy + 2);}this.emit('pickup'); }
      if(d.alive&&d.age>(d.gear?120:20)){d.alive=false;if(d.gear){this.gear.grant(d.gear);this.gear.syncGround();}}
    }
    if(this.drops.length>192)this.drops=this.drops.filter(d=>d.alive);
    let near = null, best = 3;
    for (const o of INTERACTABLES) if (!(o.type === 'chest' && this.save.opened.includes(o.id)) && !(o.type === 'seal' && this.save.seals[o.seal])) {
      const d = distance(p, o); if (d < best) { best = d; near = o; }
    }
    this.nearby = near;
  }
  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.hp <= 0) { e.deathAge += dt; continue; }
      e.nightRage = this.cycle.rage;
      e.flash = Math.max(0, e.flash - dt); e.frozen = Math.max(0, e.frozen - dt); e.stagger = Math.max(0, e.stagger - dt);
      e.spawnGrace = Math.max(0, (e.spawnGrace || 0) - dt); if (e.spawnGrace > 0) continue;
      if (e.frozen > 0 || e.stagger > 0) continue;
      const homeDistance=Math.hypot(e.x-e.homeX,e.z-e.homeZ);
      if(Math.hypot(p.x-e.homeX,p.z-e.homeZ)>22||homeDistance>19||e.state==='return'){
        e.state='return';e.timer=1;e.hp=Math.min(e.maxHp,e.hp+e.maxHp*dt*.15);
        if(homeDistance>.5){e.yaw=Math.atan2(e.homeX-e.x,e.homeZ-e.z);this.move(e,Math.sin(e.yaw)*e.speed*dt,Math.cos(e.yaw)*e.speed*dt,.5);}else e.state='chase';
        continue;
      }
      const d = distance(e, p); if (d > 27) continue;
      p.combat = 3; e.yaw = Math.atan2(p.x - e.x, p.z - e.z); e.timer -= dt;
      if (e.type === 'boss') {
        const phase = e.hp < e.maxHp * .33 ? 2 : e.hp < e.maxHp * .66 ? 1 : 0;
        if (phase > e.phase) { e.phase = phase; e.timer = 1.6; this.encounters.bossPhase(e,phase); this.emit('bossPhase', { phase, x: e.x, z: e.z }); }
      }
      if (e.state === 'windup') {
        if((e.type==='ranger'||e.ability==='volley')&&e.timer>.3){const lead=Math.min(.5,(e.level||1)*.05);e.targetX=p.x+(p.vx||0)*lead;e.targetZ=p.z+(p.vz||0)*lead;}
        if (e.timer <= 0) {
          const damage=e.damage*this.cycle.damage;
          if (e.elite) this.eliteAttack(e,damage);
          else if (e.type === 'ranger') this.launch('enemy', 'enemy', e.x, e.z, Math.atan2(e.targetX - e.x, e.targetZ - e.z), damage);
          else if (e.type === 'caster' || e.type === 'boss' && e.sequence % 3 !== 0) this.enemyZone(e.targetX, e.targetZ, e.type === 'boss' ? 3.6 : 2.5, .8, damage);
          else if (d < e.range + .7) this.hurt(damage,e);
          if (e.type === 'boss' && e.phase > 0) for (let i = 0; i < 6 + e.phase * 2; i++) this.launch('enemy', 'enemy', e.x, e.z, i / (6 + e.phase * 2) * Math.PI * 2 + this.time * .3, damage * .7, { life: 2.5 });
          this.emit('enemyAttack', { x: e.x, z: e.z, yaw: e.yaw, range: e.range, enemyType: e.type });
          e.state = 'recover'; e.timer = e.cooldown*this.cycle.recovery / (1 + e.phase * .25);
        }
      } else if (e.state === 'recover') { if (e.timer <= 0) e.state = 'chase'; }
      else if (d < e.range && e.timer <= 0) {
        e.state = 'windup'; e.timer = e.windup; e.sequence++; e.targetX = p.x; e.targetZ = p.z;
        this.emit('telegraph', { enemy: e });
      } else if (d > e.range * .8) {
        let dx = (p.x - e.x) / Math.max(.01, d), dz = (p.z - e.z) / Math.max(.01, d);
        for (const other of this.enemies) if (other !== e && other.hp > 0) {
          const len = distance(e, other); if (len < 1.4 && len > .01) { dx += (e.x - other.x) / len * .6; dz += (e.z - other.z) / len * .6; }
        }
        const norm = Math.max(1, Math.hypot(dx, dz)); this.move(e, dx / norm * e.speed * this.cycle.speed * dt, dz / norm * e.speed * this.cycle.speed * dt, .5);
      }
    }
  }
  eliteAttack(e, damage=e.damage*this.cycle.damage) {
    const yaw = Math.atan2(e.targetX - e.x, e.targetZ - e.z);
    if (e.ability === 'volley') {
      for (let wave=0;wave<2;wave++) for (let i=-2;i<=2;i++) this.launch('enemy','enemy',e.x,e.z,yaw+i*.19+wave*.07,damage*.72,{delay:wave*.3,speed:11,life:2.8,color:e.color});
    } else if (e.ability === 'storm') {
      // Locks the cast location at windup; dodging genuinely escapes all three strikes.
      for (let i=0;i<3;i++) {
        const side=i-1;
        this.enemyZone(e.targetX+Math.cos(yaw)*side*2.6,e.targetZ-Math.sin(yaw)*side*2.6,1.9,.65+i*.24,damage);
      }
    } else {
      this.enemyZone(e.targetX,e.targetZ,2.8,.5,damage);
      this.enemyZone(e.x,e.z,4.3,1.15,damage*.75);
    }
  }
  enemyZone(x, z, radius, delay, damage) {
    const area = this.zones.find(a => !a.alive); if (!area) return;
    Object.assign(area, { alive: true, owner: 'enemy', x, z, radius, age: 0, delay, tick: delay, life: delay + .1, damage,spiritLevel:0,skillStage:0,skillAccent:undefined,tier:0,color:undefined });
  }
  updateProjectiles(dt) {
    for (const b of this.projectiles) if (b.alive) {
      b.age += dt; if (b.age > b.life) { b.alive=false;b.retiredReason='timeout';b.retiredAt=this.time;continue; }
      if(b.age<b.delay)continue;
      if(b.homing&&(!b.target||b.target.hp<=0||b.hit.has(b.target.id))){
        let best=Infinity;b.target=null;
        for(const e of this.enemies)if(e.hp>0&&e.state!=='return'&&!b.hit.has(e.id)){const d=distance(e,b);if(d<best&&d<20){b.target=e;best=d;}}
      }
      if(b.target?.hp>0){const angle=Math.atan2(b.target.x-b.x,b.target.z-b.z);b.yaw+=Math.atan2(Math.sin(angle-b.yaw),Math.cos(angle-b.yaw))*(1-Math.exp(-dt*(10+b.age*12)));}
      const lastX=b.x,lastZ=b.z;
      b.x+=Math.sin(b.yaw)*b.speed*dt;b.z+=Math.cos(b.yaw)*b.speed*dt;
      const lift=clamp((b.age-b.delay)/.28,0,1);b.y=b.launchY+(heightAt(b.x,b.z)+1.2-b.launchY)*lift+(b.arc?Math.sin(Math.PI*Math.min(1,b.age/.8))*.6:0);
      if (b.owner === 'enemy') {
        if(segmentDistance(this.player.x,this.player.z,lastX,lastZ,b.x,b.z)<.75){this.hurt(b.damage,{x:lastX,z:lastZ});b.alive=false;b.retiredAt=this.time;}
      } else for (const e of this.enemies) if (e.hp > 0 && !b.hit.has(e.id) && segmentDistance(e.x,e.z,lastX,lastZ,b.x,b.z) < b.radius + .5 * e.scale) {
        b.hit.add(e.id); this.hit(e, b.damage, b.kind,b);
        if(b.fervor)this.fervorVolley.impact(b,e);
        if (b.kind === 'frost') for (let i = 0; i < 3+Math.min(3,b.skillStage); i++) {
          const target = this.enemies.filter(n => n.hp > 0 && n !== e && distance(n, e) < 9)[i];
          if (target) this.launch('spirit', 'player', e.x, e.z, b.yaw + (i - 1), b.damage * .32, { target, speed: 18, tier:b.tier, color:b.color, radiance:b.radiance,spiritLevel:b.spiritLevel,skillStage:b.skillStage,skillAccent:b.skillAccent, echo:true });
        }
        if (!b.pierce||!this.enemies.some(n=>n.hp>0&&!b.hit.has(n.id)&&distance(n,e)<12)) {b.retiredReason='hit'; b.x=e.x;b.z=e.z;b.y=heightAt(e.x,e.z)+1.1;b.alive=false;b.retiredAt=this.time;break; }
      }
    }
  }
}
