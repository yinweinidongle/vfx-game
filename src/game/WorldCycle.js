/** Six minutes of active play form a day. Existing playTime keeps old saves in sync. */
export const DAY_DURATION = 360;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function sampleWorldCycle(playTime, out = {}) {
  const time = Number.isFinite(playTime) ? Math.max(0, playTime) : 0;
  const phase = (time / DAY_DURATION + 8 / 24) % 1, hour = phase * 24;
  const night = hour < 12 ? 1 - smooth(5, 7, hour) : smooth(17, 19, hour);
  const dusk = Math.exp(-(((hour - 18) / 1.1) ** 2)), dawn = Math.exp(-(((hour - 6) / 1.1) ** 2));
  const rage = smooth(.48, .94, night);
  Object.assign(out, { phase, hour, night, dusk, dawn, rage, enraged: rage >= .5,
    name: hour < 5 || hour >= 19 ? '夜幕' : hour < 7 ? '破晓' : hour < 17 ? '白昼' : '暮色',
    damage: 1 + rage * .3, speed: 1 + rage * .22, recovery: 1 / (1 + rage * .28),
  });
  return out;
}
