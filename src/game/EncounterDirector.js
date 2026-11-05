import {REGIONS, bountyProgress} from './RegionBounties.js';
import { ENCOUNTERS, ENEMY_TYPES, distance, isLand, zoneAt, clamp } from './GameData.js';

export const MAX_ACTIVE_ENEMIES = 18;
const HEALTH = [1, 1.25, 1.65, 2.25, 2.9, 3.7, 4.6, 5.7, 7];

/** Authored regional difficulty: never scales in response to buying an upgrade. */
export function encounterProfile(encounter, challenge = 0) {
  const step = clamp((encounter.level || 1) - 1, 0, 8), cycle = clamp(Math.floor(challenge), 0, 20);
  return {
    level: step + 1 + cycle * 2,
    health: HEALTH[step] * (1 + cycle * .42 + cycle * cycle * .07),
    damage: (1 + step * .14 + step * step * .009) * (1 + cycle * .18),
    speed: 1 + Math.min(.18, step * .025 + cycle * .015),
    recovery: 1 / (1 + step * .035 + Math.min(cycle, 5) * .04),
    reward: (1 + step * .12) * (1 + cycle * .15),
  };
}

export class EncounterDirector {
  constructor(state) { this.state = state; this.active = new Map(); }
  accessible(encounter) { return (encounter.chapter < 2 || this.state.save.seals[0]) && (encounter.chapter < 3 || this.state.save.seals[1]); }
  start(encounter) {
    const s = this.state;
    if (s.started.has(encounter.id)) return;
    s.started.add(encounter.id);
    const waves = [encounter.types, ...(encounter.reinforcements || [])].map((types, wave) => {
      const result = [...types];
      if (s.save.challenge > 0) result.push(wave % 2 ? 'ranger' : 'melee');
      if (s.save.challenge > 1) result.push(wave ? 'stormElite' : 'caster');
      return result;
    });
    const battle = { encounter, waves, wave: -1, nextIn: 0, requested: 0, done: false };
    this.active.set(encounter.id, battle); this.deploy(battle);
    s.emit('encounter', { id: encounter.id });
  }
  placement(encounter, index, wave) {
    const s = this.state;
    // Search actual land and collider clearance; never place reinforcements on the player.
    for (let attempt = 0; attempt < 160; attempt++) {
      const angle = index * 2.39996 + attempt * .91 + wave * .8;
      const radius = !index && !wave && !attempt ? 0 : 2.8 + ((index + attempt) % 11) * .61;
      const x = encounter.x + Math.sin(angle) * radius, z = encounter.z + Math.cos(angle) * radius;
      if (!isLand(x, z, .8) || zoneAt(x, z) !== zoneAt(encounter.x, encounter.z)) continue;
      if (wave > 0 && Math.hypot(x - s.player.x, z - s.player.z) < 4.5) continue;
      if (s.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.r + .85)) continue;
      if (s.enemies.some(e => e.hp > 0 && Math.hypot(x - e.x, z - e.z) < 1.7)) continue;
      return { x, z };
    }
    return null; // Retry later if the arena is genuinely full, rather than spawning in geometry.
  }
  deploy(battle) {
    const s = this.state, next = battle.wave + 1, types = battle.waves[next];
    if (!types || s.enemies.filter(e => e.hp > 0 && distance(e, battle.encounter) < 38).length + types.length > MAX_ACTIVE_ENEMIES) return false;
    const placed = [], profile = encounterProfile(battle.encounter, s.save.challenge);
    for (let i = 0; i < types.length; i++) {
      const point = this.placement(battle.encounter, i, next);
      if (!point) {
        // Roll back only this attempted wave. No spawn events have been emitted yet.
        s.enemies.splice(s.enemies.length - placed.length, placed.length);
        return false;
      }
      const type = types[i], spec = ENEMY_TYPES[type], health = Math.round(spec.hp * profile.health * (spec.elite ? 1.35 : 1));
      const e = { ...spec, ...point, id: s.enemies.length, encounter: battle.encounter.id, type,
        level: profile.level, maxHp: health, hp: health,
        damage: Math.round(spec.damage * profile.damage), speed: spec.speed * profile.speed,
        cooldown: spec.cooldown * profile.recovery, xp: Math.round(spec.xp * profile.reward),
        yaw: Math.PI, state: 'chase', timer: .65 + i * .19, spawnGrace: .75,
        frozen: 0, stagger: 0, flash: 0, deathAge: 0, phase: 0, sequence: 0, targetX: 0, targetZ: 0 };
      e.homeX = e.x; e.homeZ = e.z; s.enemies.push(e); placed.push(e);
    }
    for (const e of placed) {
      s.emit('spawn', { enemy: e });
      if (e.type === 'boss') { s.boss = e; s.emit('boss', { text: e.name }); }
    }
    battle.wave = next; battle.nextIn = -1;
    s.emit('wave', { text: `${battle.encounter.name} · 第 ${next + 1} / ${battle.waves.length} 波`, elite: placed.some(e => e.elite) });
    return true;
  }
  bossPhase(enemy, phase) {
    const battle = this.active.get(enemy.encounter);
    if (battle && !battle.done) { battle.requested = Math.max(battle.requested, phase); battle.nextIn = .85; }
  }
  onDeath(enemy) {
    const battle = this.active.get(enemy.encounter);
    if (!battle || battle.done) return;
    const s = this.state, encounter = battle.encounter;
    if (encounter.boss) {
      if (enemy.type !== 'boss') return;
      // The summoner's death ends the fight, including queued summons and hostile projectiles.
      for (const e of s.enemies) if (e.encounter === encounter.id && e.hp > 0) { e.hp = 0; e.state = 'dead'; s.emit('death', { enemy: e }); }
      for (const b of s.projectiles) if (b.owner === 'enemy') { b.alive = false; b.retiredAt = s.time; }
      for (const z of s.zones) if (z.owner === 'enemy') z.alive = false;
    } else {
      if (s.enemies.some(e => e.encounter === encounter.id && e.hp > 0)) return;
      if (battle.wave < battle.waves.length - 1) { battle.nextIn = 1.5; s.emit('toast', { text: '灵潮未息 · 援军即将抵达' }); return; }
    }
    battle.done = true;
    const firstClear = !s.save.cleared.includes(encounter.id);
    if (firstClear) s.save.cleared.push(encounter.id);
    const reward = 20 + encounter.level * 6; s.save.gold += reward;
    s.emit('clear', { text: encounter.boss ? '归墟之主已被击败' : `此处已净化 · 灵石 +${reward}` });
    if (firstClear) {
      const region = REGIONS[encounter.chapter - 1];
      const bounty = bountyProgress(s.save, region);
      if (!bounty.next) {
        s.gainXP(bounty.xp);
        s.save.gold += bounty.gold;
        if (s.save.trackedChapter === region.chapter) s.save.trackedChapter = 0;
        s.emit('toast', {text: `${region.name}清剿完成 · 历练 +${bounty.xp} · 灵石 +${bounty.gold}`});
      }
    }
    if (encounter.boss) { s.save.won = true; s.grantItem('sigil'); s.emit('victory'); }
    s.saveDirty = true;
  }
  update(dt) {
    const s = this.state;
    for (const encounter of ENCOUNTERS) if (!s.started.has(encounter.id) && this.accessible(encounter) && distance(s.player, encounter) < encounter.radius) this.start(encounter);
    for (const b of this.active.values()) {
      if (b.done || distance(s.player, b.encounter) > 30) continue;
      if (b.nextIn >= 0) b.nextIn = Math.max(0, b.nextIn - dt);
      const requested = !b.encounter.boss || b.wave < b.requested;
      if (b.nextIn === 0 && (b.wave < 0 || requested)) this.deploy(b);
      // A skipped boss threshold still gets its own group once there is room.
      if (b.encounter.boss && b.wave < b.requested && b.nextIn < 0) b.nextIn = 1.2;
    }
  }
  status() {
    let nearest = null, best = 30;
    for (const b of this.active.values()) if (!b.done) {
      const d = distance(this.state.player, b.encounter); if (d < best) { best = d; nearest = b; }
    }
    return nearest;
  }
}
