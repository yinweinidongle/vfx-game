/** Shared presentation / simulation contract. No browser or renderer dependencies. */
export const AWAKENING_LEVEL = 30;
export const AWAKENING_DURATION = 4.15;
export const AWAKENING_RANGE = 32;
export const AWAKENING_STYLES = {
  sword: { name: '万剑敕雷', line: '一剑，敕雷！', color: '#ab8bff', core: '#dcfaff', accent: '#ff99de', motif: 'SWORD / THUNDER', voice: 'sword', portrait: 'sword' },
  ice: { name: '霜天雷羽', line: '霜落，雷鸣！', color: '#64dbff', core: '#eaffff', accent: '#96a8ff', motif: 'FROST / TEMPEST', voice: 'ice', portrait: 'ice' },
  cultivator: { name: '诸天雷诏', line: '诸天，听令！', color: '#f6cf80', core: '#efffff', accent: '#95bfff', motif: 'HEAVEN / DECREE', voice: 'cultivator', portrait: 'cultivator' },
};
export const ASCENDANT_SKILLS={
  4:{name:'天刃镇岳',line:'一刃，镇山河！',color:'#ffc765',core:'#fff9df',accent:'#ff7466',motif:'CELESTIAL / CLEAVE',subtitle:'A BLADE TO SUNDER THE HEAVENS',duration:3.8},
  5:{name:'万象冰劫',line:'万象，尽封！',color:'#65ddff',core:'#e8ffff',accent:'#a08bff',motif:'GLACIAL / CATACLYSM',subtitle:'LET THE WORLD FALL STILL',duration:5.3},
};
export const awakeningStyle = (kind,index=3) => ({...(AWAKENING_STYLES[kind] || AWAKENING_STYLES.sword),...(ASCENDANT_SKILLS[index]||{})});
