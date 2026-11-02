/** Shared presentation / simulation contract. No browser or renderer dependencies. */
export const AWAKENING_LEVEL = 30;
export const AWAKENING_DURATION = 4.15;
export const AWAKENING_RANGE = 32;
export const AWAKENING_STYLES = {
  sword: { name: '万剑敕雷', line: '一剑，敕雷！', color: '#ab8bff', core: '#dcfaff', accent: '#ff99de', motif: 'SWORD / THUNDER', voice: 'sword', portrait: 'sword' },
  ice: { name: '霜天雷羽', line: '霜落，雷鸣！', color: '#64dbff', core: '#eaffff', accent: '#96a8ff', motif: 'FROST / TEMPEST', voice: 'ice', portrait: 'ice' },
  cultivator: { name: '诸天雷诏', line: '诸天，听令！', color: '#f6cf80', core: '#efffff', accent: '#95bfff', motif: 'HEAVEN / DECREE', voice: 'cultivator', portrait: 'cultivator' },
};
export const awakeningStyle = kind => AWAKENING_STYLES[kind] || AWAKENING_STYLES.sword;
