export const SAVE_KEY = 'frostbound.rpg.save.v1';
export const SETTINGS_KEY = 'frostbound.rpg.settings.v1';
export const CLASSES = {
  sword: { name: '苍雷剑客', title: '以剑破万法', icon: 1, color: '#b0a5ff', hp: 180, damage: 30, speed: 7.6, primary: '断云连斩', description: '远程剑气 · 自动追敌 · 多重断空', model: 'standing-melee-360' },
  ice: { name: '霜羽行者', title: '一箭封千山', icon: 0, color: '#83e7ff', hp: 145, damage: 25, speed: 8.2, primary: '逐霜之矢', description: '曲线追击 · 冰冻控制 · 多重飞羽', model: 'standing-aim-recoil' },
  cultivator: { name: '太虚修士', title: '举手召星河', icon: 2, color: '#f2d397', hp: 160, damage: 26, speed: 7.2, primary: '灵光追魂', description: '追踪灵光 · 法相齐射 · 群星陨落', model: 'standing-magic-area' },
};
export const SKILLS = [
  { id: 'frost', key: 'Q', name: '寒霜贯星', icon: 0, cost: 34, cooldown: 5.2, description: '冰箭弧线追敌并冻结目标；命中后分裂追踪。' },
  { id: 'slash', key: 'E', name: '苍雷断空', icon: 13, cost: 46, cooldown: 7.5, description: '月牙剑气自动朝向敌人，远程追击并引发雷爆。' },
  { id: 'divine', key: 'R', name: '法相天劫', icon: 14, cost: 82, cooldown: 22, description: '法相显圣，背后法阵齐射追踪灵光，向敌群降下陨星。' },
  { id: 'awakening', key: 'G', name: '雷霆觉醒', icon: 13, cost: 90, cooldown: 64, unlockLevel: 30, description: '30 级觉醒。四轮雷击席卷周围 32 米战场，自动追踪敌人；同一轮不会重复叠加伤害。' },
  { id: 'heavenBlade', key: 'H', name: '天刃镇岳', icon: 1, cost: 95, cooldown: 78, unlockLevel: 35, description: '35 级觉醒。锁定敌群召出巨刃，劈开长 14 米、宽 8 米的地面，随后引爆余震。' },
  { id: 'iceStorm', key: 'J', name: '万象冰劫', icon: 0, cost: 100, cooldown: 92, unlockLevel: 40, description: '40 级觉醒。在敌群中心降下半径 10.5 米的冰暴，持续八次冰击，最后引爆冰封领域。' },
];
export const ITEMS = {
  jade: { name: '听雪玉坠', slot: 'charm', rarity: '稀有', icon: 9, color: '#82cbec', power: .12, vitality: 15, description: '封存着听雪林第一场霜。伤害 +12%，生命 +15。' },
  thunder: { name: '苍雷之戒', slot: 'ring', rarity: '史诗', icon: 10, color: '#c9a4f6', crit: .15, haste: .08, description: '每次心跳都伴随雷鸣。暴击 +15%，技能冷却 -8%。' },
  gauntlet: { name: '镇岳护手', slot: 'arms', rarity: '稀有', icon: 11, color: '#82cbec', power: .08, vitality: 40, description: '曾属于守门者的遗物。生命 +40，伤害 +8%。' },
  heart: { name: '不融之心', slot: 'charm', rarity: '史诗', icon: 3, color: '#c9a4f6', vitality: 65, haste: .1, description: '严寒深处，生机不息。生命 +65，技能冷却 -10%。' },
  star: { name: '归墟星核', slot: 'ring', rarity: '传说', icon: 15, color: '#f1d395', power: .25, crit: .12, description: '诸天陨落之后，留下的第一颗星。伤害 +25%，暴击 +12%。' },
  sigil: { name: '太虚法印', slot: 'arms', rarity: '传说', icon: 2, color: '#f1d395', power: .15, haste: .18, description: '轮回尽头，仍有回声。伤害 +15%，技能冷却 -18%。' },
};
export const BOONS = [
  { id: 'power', name: '锋芒', icon: 1, description: '基础攻击 +12%；新增一枚可见灵锋、一道追击。每五层强化终结爆发。' },
  { id: 'vitality', name: '长生', icon: 3, description: '生命 +35，增加可吸收伤害的长生护罩；连续 6 秒未受击后恢复。' },
  { id: 'spirit', name: '灵息', icon: 5, description: '灵力上限 +3，回灵速度 +4%，技能威力 +1.4%；强化 Q / E / R 特效。' },
];
export const ZONES = [
  { id: 'forest', name: '听雪林地', sub: '风过古木，旧梦初醒', x: -28, z: 6, radius: 28, color: '#b5d9d2' },
  { id: 'ruins', name: '悬星遗迹', sub: '千年残垣，仍守星光', x: 18, z: -10, radius: 24, color: '#b4c4d5' },
  { id: 'throne', name: '归墟王座', sub: '最后一位守门者，在此等候', x: 51, z: 24, radius: 22, color: '#a7b0cf' },
];
export const CONNECTIONS = [[-10, -1, 4, -7, 5.2], [31, 2, 42, 14, 5.2]];
export const ENCOUNTERS = [
  { id: 'path', name: '古道残魂', chapter: 1, level: 1, x: -29, z: 8, radius: 12, types: ['melee', 'melee'], reinforcements: [['melee']] },
  { id: 'grove', name: '密林伏击', chapter: 1, level: 2, x: -41, z: -2, radius: 11, types: ['melee', 'caster', 'melee'], reinforcements: [['ranger', 'melee']] },
  { id: 'frostkeeper', name: '听雪守印', chapter: 1, level: 3, x: -24, z: -13, radius: 12, types: ['elite', 'melee', 'caster'], reinforcements: [['melee', 'ranger', 'melee', 'caster']], seal: 0 },
  { id: 'bridge', name: '幽弦封桥', chapter: 2, level: 4, x: 3, z: -7, radius: 9, types: ['ranger', 'melee', 'ranger', 'melee'], reinforcements: [['rangerElite', 'melee', 'melee', 'caster']] },
  { id: 'court', name: '断垣围猎', chapter: 2, level: 5, x: 17, z: -7, radius: 12, types: ['melee', 'caster', 'ranger', 'melee', 'melee'], reinforcements: [['elite', 'ranger', 'caster', 'melee', 'melee']] },
  { id: 'library', name: '蚀星秘藏', chapter: 2, level: 6, x: 28, z: -21, radius: 11, types: ['caster', 'stormElite', 'melee', 'ranger', 'caster'], reinforcements: [['caster', 'caster', 'melee', 'rangerElite', 'melee', 'ranger']] },
  { id: 'starkeeper', name: '悬星双卫', chapter: 2, level: 7, x: 16, z: -24, radius: 10, types: ['stormElite', 'elite', 'ranger', 'caster', 'melee', 'melee'], reinforcements: [['rangerElite', 'melee', 'caster', 'ranger', 'melee', 'melee']], seal: 1 },
  { id: 'stair', name: '王座禁军', chapter: 3, level: 8, x: 42, z: 16, radius: 9, types: ['elite', 'rangerElite', 'ranger', 'melee', 'melee', 'caster', 'melee'], reinforcements: [['stormElite', 'melee', 'ranger', 'caster', 'melee', 'melee', 'ranger']] },
  { id: 'sovereign', name: '万象归墟', chapter: 3, level: 9, x: 53, z: 29, radius: 15, types: ['boss', 'melee', 'melee', 'ranger'], reinforcements: [['elite', 'caster', 'ranger', 'melee', 'melee'], ['stormElite', 'rangerElite', 'melee', 'ranger', 'melee']], boss: true },
];
export const INTERACTABLES = [
  { id: 'camp', type: 'camp', name: '听雪灯台', x: -28, z: 25 },
  { id: 'camp2', type: 'camp', name: '悬星灯台', x: 13, z: 0 },
  { id: 'seal0', type: 'seal', name: '听雪封印', x: -24, z: -16, encounter: 'frostkeeper', seal: 0 },
  { id: 'seal1', type: 'seal', name: '悬星封印', x: 16, z: -28, encounter: 'starkeeper', seal: 1 },
  { id: 'chest0', type: 'chest', name: '遗落的行囊', x: -38, z: 21, reward: 'jade' },
  { id: 'chest1', type: 'chest', name: '林间秘藏', x: -46, z: -6, reward: 'gauntlet' },
  { id: 'chest2', type: 'chest', name: '守林者宝匣', x: -17, z: -15, reward: 'thunder' },
  { id: 'chest3', type: 'chest', name: '观星者遗物', x: 29, z: -26, reward: 'heart' },
  { id: 'chest4', type: 'chest', name: '沉眠星核', x: 61, z: 14, reward: 'star' },
  { id: 'memory0', type: 'memory', name: '风中的残简', x: -39, z: 12, text: '“若听见林中钟响，莫回头。那是旧世的守林者，在寻找未归的人。”\n循石路向北，解除听雪封印。灯台能恢复生命，并将旅途记在这片土地上。' },
  { id: 'memory1', type: 'memory', name: '观星者手记', x: 25, z: 2, text: '“我们曾以为群星永不陨落。直到王座上的人，亲手关闭了天空。”\n两道封印共鸣之时，通往归墟的桥会再次显现。' },
];
export const ENEMY_TYPES = {
  melee: { name: '失魂守卫', hp: 92, damage: 12, speed: 3.5, range: 2.1, windup: .72, cooldown: 1.8, xp: 28, scale: 1, color: '#718f96' },
  ranger: { name: '幽弦游猎者', hp: 76, damage: 13, speed: 2.7, range: 10, windup: .95, cooldown: 2.5, xp: 34, scale: .94, color: '#70b1c7' },
  caster: { name: '蚀星司祭', hp: 85, damage: 18, speed: 2.3, range: 11, windup: 1.2, cooldown: 3.5, xp: 42, scale: 1.05, color: '#b194c8' },
  elite: { name: '镇岳守望者', elite: true, ability: 'quake', trait: '震地 · 双重冲击', hp: 250, damage: 23, speed: 3.2, range: 4, windup: 1.15, cooldown: 3.3, xp: 110, scale: 1.4, color: '#efb763' },
  rangerElite: { name: '幽弦追猎者', elite: true, ability: 'volley', trait: '穿云 · 扇形连射', hp: 200, damage: 18, speed: 3.5, range: 12, windup: 1.05, cooldown: 3, xp: 120, scale: 1.2, color: '#f095b4' },
  stormElite: { name: '蚀星雷使', elite: true, ability: 'storm', trait: '雷罚 · 三重落雷', hp: 220, damage: 21, speed: 2.8, range: 12, windup: 1.25, cooldown: 3.8, xp: 135, scale: 1.3, color: '#b8a1ff' },
  boss: { name: '归墟之主 · 无相', hp: 1850, damage: 28, speed: 2.9, range: 4, windup: 1.15, cooldown: 2.8, xp: 420, scale: 2.5, color: '#b5c9e3' },
};
export function chapterAllows(seals, x, z) {
  return (seals[0] || x <= -2) && (seals[1] || x <= 37 || z <= 4);
}
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function segmentDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / Math.max(1e-12, dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
export function isLand(x, z, margin = 0) {
  return ZONES.some(a => Math.hypot(x - a.x, z - a.z) < a.radius - margin) || CONNECTIONS.some(a => segmentDistance(x, z, ...a.slice(0, 4)) < a[4] - margin);
}
export function heightAt(x, z) { return .15 + Math.sin(x * .11) * .18 + Math.cos(z * .13) * .16; }
export function zoneAt(x, z) { return x > 37 && z > 4 ? ZONES[2] : x > -3 ? ZONES[1] : ZONES[0]; }
