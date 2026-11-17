import { cleanLootMotion, createLootMotion, serializeLootMotion } from './LootMotion.js';

export const STONE_CAPACITY = 48;

export function rollSpiritStones(enemy, random) {
  const chance = enemy.type === 'boss' ? 1 : enemy.elite ? .93 : .76;
  if (random() >= chance) return 0;
  const level = Math.max(1, Math.floor(enemy.level || 1));
  const grade = enemy.type === 'boss' ? 5 : enemy.elite ? 2.15 : 1;
  const base = (9 + level * 3.6) * grade;
  return Math.round(base * (.72 + random() * .56));
}

export function dropSpiritStones(state, enemy) {
  const amount = rollSpiritStones(enemy, () => state.random());
  if (!amount) return;
  const lootId = state.save.nextLootId++;
  const motion = createLootMotion(enemy.x, enemy.z, lootId, 0);
  const live = state.drops.filter(drop => drop.alive && drop.stones);
  if (live.length >= STONE_CAPACITY) {
    state.collectStones(live[0], true);
  }
  state.drops.push({lootId, x: enemy.x, z: enemy.z, age: 0, alive: true, ...motion,
    flight: .55, arc: .78, stones: amount});
}

export function cleanGroundStones(raw, reservedIds) {
  if (!Array.isArray(raw)) return [];
  const drops = [];
  for (const entry of raw) {
    if (drops.length >= STONE_CAPACITY) break;
    const id = entry?.lootId, amount = entry?.stones;
    if (!Number.isSafeInteger(id) || id < 1 || reservedIds.has(id) ||
        !Number.isSafeInteger(amount) || amount < 1 ||
        !Number.isFinite(entry.x) || !Number.isFinite(entry.z) ||
        Math.abs(entry.x) > 100 || Math.abs(entry.z) > 100) continue;
    reservedIds.add(id);
    drops.push({...cleanLootMotion(entry), lootId: id, x: entry.x, z: entry.z,
      age: Math.min(59, Math.max(0, Number(entry.age) || 0)), stones: amount});
  }
  return drops;
}

export function groundStones(drops) {
  return drops.filter(d => d.alive && d.stones).slice(0, STONE_CAPACITY)
    .map(d => ({...serializeLootMotion(d), stones: d.stones}));
}
