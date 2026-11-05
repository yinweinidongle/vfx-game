import {ENCOUNTERS, ZONES} from './GameData.js';

const baseXP = [320, 760, 1320];
const baseGold = [65, 130, 210];
export const REGIONS = ZONES.map((zone, i) => ({
  chapter: i + 1,
  name: zone.name,
  encounters: ENCOUNTERS.filter(e => e.chapter === i + 1),
}));

export function bountyProgress(save, region) {
  const remaining = region.encounters.filter(e => !save.cleared.includes(e.id));
  const cycle = Math.min(20, save.challenge);
  return {
    available: region.chapter === 1 || save.seals[region.chapter - 2],
    total: region.encounters.length,
    cleared: region.encounters.length - remaining.length,
    next: remaining[0],
    xp: Math.round(baseXP[region.chapter - 1] * (1 + 1.5 * cycle)),
    gold: Math.round(baseGold[region.chapter - 1] * (1 + .35 * cycle)),
  };
}
