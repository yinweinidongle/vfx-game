const STOPS = [
  [0, '#46d9ff', '#6484ff', '凝刃'], [1, '#668fff', '#ac85ff', '鸣雷'],
  [5, '#925cff', '#4ce7ff', '紫电'], [10, '#d060ff', '#8cdcff', '裂霄'],
  [20, '#fa86d7', '#7cf5ff', '星华'], [35, '#ffcc7d', '#bca0ff', '天穹'],
  [50, '#ffe5a6', '#82eaff', '太虚'],
];
const mix = (a, b, t) => {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  return '#' + [16, 8, 0].map(s => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t).toString(16).padStart(2, '0')).join('');
};
/** Snapshot at launch; equipment tiers and spirit cannot erase permanent blade growth. */
export function swordEvolution(power = 0, spirit = 0) {
  const level = Math.max(0, Math.min(50, Math.floor(Number(power) || 0)));
  let index = 0;while (index < STOPS.length - 1 && level >= STOPS[index + 1][0]) index++;
  const a = STOPS[index], b = STOPS[Math.min(index + 1, STOPS.length - 1)], t = b[0] === a[0] ? 0 : (level - a[0]) / (b[0] - a[0]);
  return { level, name: a[3], color: mix(a[1], b[1], t), edge: mix(a[2], b[2], t),
    strength: level / 50, glow: 1.35 + level * .027, trail: 1 + level * .017,
    flow: 1 + level * .022, shards: level < 3 ? 0 : Math.min(3, 1 + Math.floor(level / 16)),
    spirit: Math.max(0, Math.min(50, spirit)) / 50 };
}
