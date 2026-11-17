export const TAICHU_UNLOCK_LEVEL = 51;

export function experienceToNext(level) {
  return 95 * level + 8 * Math.max(0, level - 50) ** 2;
}

// Sum the cost of consecutive levels. Search in batches so a large XP payout
// (including XP carried by an old save) never creates a long upgrade loop.
function experienceCost(level, count) {
  const above = Math.max(0, count - Math.max(0, TAICHU_UNLOCK_LEVEL - level));
  const first = Math.max(1, level - 50);
  const last = above - 1;
  const squares = above * (first * first + first * last + last * (2 * last + 1) / 6);
  return 95 * count * (level + (count - 1) / 2) + 8 * squares;
}

export function levelsEarned(level, experience) {
  let lo = 0, hi = Math.min(Number.MAX_SAFE_INTEGER - level, Math.floor(experience / experienceToNext(level)));
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (experienceCost(level, mid) <= experience) lo = mid;
    else hi = mid - 1;
  }
  return { levels: lo, remaining: Math.max(0, experience - experienceCost(level, lo)) };
}

/** Defense is an enemy attribute, with diminishing returns on damage reduction. */
export function damageThroughDefense(damage, defense = 0) {
  return damage * 100 / (100 + Math.max(0, defense));
}
