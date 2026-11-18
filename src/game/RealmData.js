const definitions = [
  {
    id: 'tide', name: '镜潮渡', sub: '潮退见珠，月落成门', color: '#80eadb',
    level: 1, x: -56, z: -68, rx: 20, rz: 22, gold: 80, xp: 100,
    summary: '守住两座潮眼，唤醒沉在月门下的巨鳐。',
    tactic: '留在潮眼内收集月露。环潮落下前，贴近圆心或退到环外。',
    action: '守住潮眼', nodes: [[-8,3,'西潮眼'],[8,-4,'东潮眼']],
    entry: [0,15], altar: [-2,-12], landmark:[-6,-1.6], obstacles:[[-9,-1.6,.84],[-3,-1.6,.84]], keeper: 'moonray', minion: 'skate',
    sky: '#6baeb0', sun: '#dcfff3', ink: '#155464', land: '#377c7d',
  },
  {
    id: 'forge', name: '赤砂烬炉', sub: '百尺铜炉，地火未熄', color: '#ffab69',
    level: 4, x: -37, z: 73, rx: 22, rz: 19, gold: 155, xp: 240,
    summary: '击碎两枚供火炉心，逼出藏在铜炉下的焰蝎。',
    tactic: '炉心可以直接攻击。侧移避开焰蝎的直线突刺，利用它收招时反击。',
    action: '击碎炉心', nodes: [[-8,3,'西炉心'],[9,-3,'东炉心']],
    entry: [1,14], altar: [0,-11], landmark:[-8,-4], obstacles:[[-8,-4,3.5]], keeper: 'crucible', minion: 'cinderling',
    sky: '#aa745e', sun: '#ffcb91', ink: '#593428', land: '#966244',
  },
  {
    id: 'stars', name: '星沉天阙', sub: '以身为引，重续星宿', color: '#c2adff',
    level: 7, x: 63, z: -68, rx: 21, rz: 23, gold: 240, xp: 420,
    summary: '依次点亮三星，在交错星轨间迎战天衡仪。',
    tactic: '循金线到亮起的星枢，按 F 点星。十字星轨锁定后，向斜角撤出。',
    action: '依序点星', nodes: [[-8,6,'天枢'],[8,0,'天璇'],[-5,-8,'天玑']],
    entry: [1,16], altar: [1,-14], landmark:[-6,-1.5], obstacles:[[-6,-1.5,2.55]], keeper: 'orrery', minion: 'astrolabe',
    sky: '#514c77', sun: '#e9ddff', ink: '#342f58', land: '#635780',
  },
];

export const REALMS = definitions.map(def => {
  const at = ([dx,dz,name]) => ({x:def.x+dx, z:def.z+dz, name});
  return {...def, entry:at(def.entry), arrival:at([def.entry[0],def.entry[1]-2.25]), altar:at(def.altar), nodes:def.nodes.map(at),
    obstacles:def.obstacles.map(([dx,dz,r])=>({x:def.x+dx,z:def.z+dz,r}))};
});
export const REALM_BY_ID = Object.fromEntries(REALMS.map(realm => [realm.id, realm]));

export function realmReward(realm, first, cycle) {
  const factor=(first ? 1 : .35)*(1+.15*cycle);
  return {gold:Math.round(realm.gold*factor),xp:Math.round(realm.xp*factor)};
}

export function realmAt(x, z) {
  if (z > -40 && z < 48) return null;
  return REALMS.find(realm => Math.abs(x-realm.x) < realm.rx*1.22 && Math.abs(z-realm.z) < realm.rz*1.22) || null;
}

export function shoreRadius(realm, angle) {
  if (realm.id === 'tide') return .93 + .095*Math.cos(3*angle-.7) + .042*Math.sin(5*angle+.5);
  if (realm.id === 'forge') return .95 / Math.cos(((angle+Math.PI*3) % (Math.PI/4))-Math.PI/8);
  return .91 + .14*Math.cos(3*angle+.85) + .06*Math.cos(6*angle+1.7);
}

export function onRealmLand(realm, x, z, margin=0) {
  const dx=(x-realm.x)/realm.rx, dz=(z-realm.z)/realm.rz;
  return Math.hypot(dx,dz) + margin/Math.min(realm.rx,realm.rz) < shoreRadius(realm,Math.atan2(dz,dx));
}

export const REALM_ENEMIES = {
  skate: {name:'逐月鳐', family:'ray', hp:48, damage:8, speed:3, range:7, windup:.55, cooldown:3.2, xp:19, scale:.85, color:'#76ead4'},
  moonray: {name:'望舒 · 镜海鲸鳐', family:'ray', keeper:true, elite:true, trait:'回潮 · 外环先落，圆心后涨', hp:345, damage:16, speed:2.4, range:15, windup:.65, cooldown:3.5, xp:74, scale:1.65, color:'#9cf9e5'},
  cinderling: {name:'铜甲火蝎', family:'scorpion', hp:64, damage:11, speed:4, range:6, windup:.42, cooldown:2.8, xp:24, scale:.85, color:'#fb985f'},
  furnaceHeart: {name:'供火炉心', family:'core', hp:96, damage:9, speed:0, range:6, windup:.65, cooldown:4, xp:16, scale:1, color:'#ffd18a'},
  crucible: {name:'焚岳 · 鼎脊蝎王', family:'scorpion', keeper:true, elite:true, trait:'裂地 · 从扇形预警之间侧移', hp:410, damage:18, speed:3.1, range:14, windup:.55, cooldown:3.3, xp:100, scale:1.45, color:'#ffb365'},
  astrolabe: {name:'巡宿星鸢', family:'astral', hp:70, damage:12, speed:3.3, range:9, windup:.6, cooldown:3, xp:30, scale:.88, color:'#beaeff'},
  orrery: {name:'天衡 · 司夜星仪', family:'astral', keeper:true, elite:true, trait:'交轨 · 第二次星轨旋转四十五度', hp:435, damage:18, speed:2.7, range:16, windup:.65, cooldown:3.4, xp:110, scale:1.5, color:'#ecceff'},
};
