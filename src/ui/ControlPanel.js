import { defaults } from '../VFXConfig.js';
const icons = {
  snow: '<path d="M12 2v20M3.34 7l17.32 10M3.34 17L20.66 7M8 4l4 3 4-3M8 20l4-3 4 3M3 11l4-2-1-5M21 13l-4 2 1 5M6 20l1-5-4-2M18 4l-1 5 4 2"/>',
  seal: '<circle cx="12" cy="12" r="9"/><path d="m12 5 7 7-7 7-7-7ZM8 8l8 8m0-8-8 8"/>',
  sword: '<path d="m14 3 7 0-1 7-9 9-6-6ZM14 3l6 7M4 12l8 8M7 17l-4 4M3 18l3 3"/>',
  arrow: '<path d="M4 20L20 4M10 4h10v10M4 13v7h7"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  cube: '<path d="m12 3 9 5v8l-9 5-9-5V8Zm0 9 9-4M12 12v9M12 12 3 8M7.5 5.5l9 5"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  sliders: '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.snow}</svg>`;
const slider = (name,label,min,max,step,unit,character = '') => `<label class="parameter" ${character ? `data-character-only="${character}"` : ''} for="${name}"><span class="param-label">${label}</span><output id="${name}-value"></output><input id="${name}" type="range" min="${min}" max="${max}" step="${step}" data-unit="${unit}"/></label>`;

const toggle = (name,label,note = '') => `<label class="switch-row" for="${name}"><span class="switch-label">${label}${note ? `<small>${note}</small>` : ''}</span><span class="switch"><input id="${name}" type="checkbox"><span></span></span></label>`;

export function createLayout() {
  document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Frostbound 首页">${icon('snow')}<span>Frostbound</span><small>实时技能实验室</small></a>
    <a class="rpg-entry" href="./game.html" title="进入霜界 · 归墟之门单机 RPG">${icon('sword')}<span>进入霜界 <small>RPG</small></span></a>
    <div class="character-switch" role="group" aria-label="选择角色与技能"><button data-character="cultivator" class="active" aria-pressed="true">${icon('seal')}<span>修士 · 元婴</span></button><button data-character="sword" aria-pressed="false">${icon('sword')}<span>剑客 · 苍雷</span></button><button data-character="ice" aria-pressed="false">${icon('snow')}<span>射手 · 寒冰</span></button></div>
    <div class="top-actions"><button class="fire-button" id="fire"><span id="fire-icon">${icon('sword')}</span><span id="fire-label">释放剑气</span><kbd>Space</kbd></button></div>
  </header>
  <main class="workspace">
    <section class="viewport-wrap" aria-label="实时 3D 技能预览">
      <div id="viewport"></div>
      <div class="viewport-top">
        <div class="scene-caption"><h1 id="skill-title">苍雷 · 断空斩</h1><span><i class="live-dot"></i>实时 3D 预览</span></div>
        <div class="view-actions"><button id="reset-camera" title="重置相机（R）" aria-label="重置相机">${icon('reset')}</button><button id="fullscreen" title="全屏预览" aria-label="全屏预览">${icon('expand')}</button></div>
      </div>
      <div class="camera-tabs" role="group" aria-label="相机模式"><button data-camera="cinematic" class="active" title="电影式技能演出（C）" aria-keyshortcuts="C" aria-pressed="true">演出</button><button data-camera="overview" aria-pressed="false">全景</button><button data-camera="follow" aria-pressed="false">追踪</button><button data-camera="detail" aria-pressed="false">武器特写</button><button data-camera="target" aria-pressed="false">命中区域</button></div>
      <div class="scene-marker origin-marker" id="origin-label"><span class="marker-line"></span>发射点</div><div class="scene-marker target-marker" id="target-label"><span class="marker-line"></span>命中目标</div>
      <div class="viewport-bottom"><div class="viewport-status"><span class="phase-badge"><i></i><span id="phase-label">能量凝聚</span></span><span class="director-status" id="director-status" hidden title="运镜与技能时间轴同步；P 暂停，← / → 单帧，拖动时间轴回看。"><span class="director-shot-number" id="director-shot-number">01</span><span id="director-shot-label">凝霜蓄力</span></span></div><div class="orbit-help" id="manual-camera-help"><span>拖拽旋转</span><span>滚轮缩放</span><span>右键平移</span></div><div class="orbit-help cinematic-help" id="cinematic-camera-help" hidden title="播放速度为全局倍率；演出模式会在关键阶段自动慢放。P 暂停，← / → 单帧察看。"><span>自动运镜 · 演出慢镜</span></div></div>
      <div class="loading" id="loading"><span class="loading-crystal">${icon('snow')}</span><span>正在准备场景</span><small>加载角色与实时材质…</small></div>
    </section>
    <aside class="inspector">
      <div class="inspector-heading"><div>效果参数</div><button id="reset-config" title="恢复默认参数" aria-label="恢复默认参数">${icon('reset')}<span>重置</span></button></div>
      <div class="inspector-scroll">
        <div class="preset-row"><label class="section-kicker" for="preset">特效预设</label><select id="preset" aria-label="特效预设"><option value="balanced">标准苍雷</option><option value="cinematic">雷霆重斩</option><option value="precision">清透剑芒</option></select></div>
        <section class="control-section"><h2>播放</h2><label class="switch-row" for="autoLoop">自动循环<span class="switch"><input id="autoLoop" type="checkbox"><span></span></span></label>${slider('playbackSpeed','播放速度',.15,1.5,.05,'×')}<p class="cinematic-speed-note" id="cinematic-speed-note" hidden>演出模式会在关键阶段自动慢放</p>${slider('flightSpeed','飞行速度',10,35,.5,'m/s')}</section>
        <section class="control-section"><h2 id="trajectory-heading">剑气与轨迹</h2>${slider('meteorCount','陨石数量',12,84,1,'','cultivator')}${slider('meteorSize','陨石大小',.55,1.6,.05,'×','cultivator')}${slider('avatarScale','法相大小',.7,1.25,.05,'×','cultivator')}${slider('avatarFresnel','法相菲涅耳',0,2,.05,'','cultivator')}<label class="spirit-palette" data-character-only="cultivator" for="avatarPalette"><span>法相配色</span><select id="avatarPalette"><option value="#8ac4ff">蓝白灵体</option><option value="#ffd991">金白灵体</option></select></label>${slider('bladeSize','剑气大小',.5,1.6,.05,'×','sword')}${slider('arrowSize','冰箭大小',.25,1.25,.01,'×','ice')}${slider('homingCount','追踪小冰箭',0,6,1,'','ice')}${slider('trailLength','拖尾长度',2,12,.1,'m')}${slider('particleDensity','粒子密度',.2,2,.1,'×')}${slider('shardCount','冰晶碎片',12,90,1,'')}${slider('impactRadius','冰爆范围',.6,3,.1,'×')}</section>
        <section class="control-section"><h2>光与色彩</h2>${slider('bloomStrength','辉光强度',0,1.6,.05,'')}<label class="color-row" for="frostColor"><span id="active-color-label">剑气颜色</span><span class="color-value" id="color-value">#58DFFF</span><input id="frostColor" type="color" aria-label="冰霜颜色" /></label><div class="palette"><button style="--swatch:#58dfff" data-color="#58dfff" aria-label="冰蓝色"></button><button style="--swatch:#9cb5ff" data-color="#9cb5ff" aria-label="冷紫色"></button><button style="--swatch:#77f7df" data-color="#77f7df" aria-label="冰绿色"></button><button style="--swatch:#d5faff" data-color="#d5faff" aria-label="青白色"></button></div></section>
        <section class="control-section impact-controls" data-character-only="sword cultivator"><h2>命中反馈</h2>${toggle('hitStop','命中停顿','50 ms')}${toggle('cameraShake','轻微震屏')}${toggle('screenFlash','命中闪光')}</section>
      </div>
      <div class="performance"><span><i id="fps-dot"></i><strong id="fps">—</strong> FPS</span><span id="drawcalls">— 次绘制</span></div>
    </aside>
    <section class="timeline-panel" aria-label="技能时间轴">
      <div class="transport"><button id="play-pause" aria-label="暂停" title="播放 / 暂停（P）">${icon('pause')}</button><button class="replay" id="replay" title="重新释放" aria-label="重新释放">${icon('reset')}</button><div class="time-readout"><strong id="current-time">0.00</strong><span>/ <span id="duration">2.60</span> s</span></div><span class="timeline-name" id="timeline-name" title="P 播放 / 暂停；← / → 单帧察看；拖动时间轴回看。">技能时间轴</span></div>
      <div class="timeline-track"><div class="time-ticks" id="time-ticks"></div><div class="phase-segments" id="phase-segments"></div><div class="playhead" id="playhead"><span></span></div><input id="scrubber" type="range" min="0" max="2.6" step="any" value="0" aria-label="拖动技能时间轴"></div>
    </section>
  </main>`;
}
const phaseLabels = { gather: '能量凝聚', charge: '拉弓蓄力', launch: '瞬间发射', flight: '高速飞行', impact: '命中冰爆', dissipate: '自然消散', idle: '准备就绪' };
const swordPhaseLabels = { gather: '剑意凝聚', charge: '旋身蓄势', windup: '旋身蓄势', launch: '拔剑斩出', strike: '拔剑斩出', flight: '苍雷破空', impact: '雷爆命中', dissipate: '雷光消散', recovery: '收势', idle: '准备就绪' };
const cultivationLabels = {gather:'灵台聚元',charge:'法相显圣',flight:'群星应召',impact:'流火天罚',dissipate:'归元散尽',idle:'准备就绪'};
const presetNames = { cultivator:['法相天劫','万星镇世','金轮清辉'], sword: ['标准苍雷','雷霆重斩','清透剑芒'], ice: ['标准寒冰','极光重击','清透冰晶'] };
const commonPresetKeys = ['autoLoop','playbackSpeed','flightSpeed','particleDensity','shardCount','trailLength','bloomStrength','impactRadius'];
export class ControlPanel {
  constructor(config, skill, scene) {
    this.config = config; this.skill = skill; this.scene = scene;
    this.cameraButtons = [...document.querySelectorAll('[data-camera]')];
    this.characterButtons = [...document.querySelectorAll('[data-character]')];
    this.characterOnlyNodes = [...document.querySelectorAll('[data-character-only]')];
    this.lastKind = null;
    this.lastTimelineKind = null;
    this.lastImpactTime = NaN;
    this.characterButtons.forEach(button => button.onclick = () => {
      if (button.dataset.character === this.kind || typeof skill.select !== 'function') return;
      skill.select(button.dataset.character);
      this.lastPlaying = null;
      this.syncInputs();
    });
    this.viewportWrap = document.querySelector('.viewport-wrap');
    this.phaseBadge = document.querySelector('.phase-badge');
    this.directorStatus = document.querySelector('#director-status');
    this.directorShotNumber = document.querySelector('#director-shot-number');
    this.directorShotLabel = document.querySelector('#director-shot-label');
    this.manualCameraHelp = document.querySelector('#manual-camera-help');
    this.cinematicCameraHelp = document.querySelector('#cinematic-camera-help');
    this.cinematicSpeedNote = document.querySelector('#cinematic-speed-note');
    this.timelineName = document.querySelector('#timeline-name');
    this.lastCameraMode = null;
    this.lastShotLabel = null;
    this.lastShotIndex = null;
    document.querySelector('#playbackSpeed').setAttribute('aria-description', '播放速度为全局倍率；演出模式会在关键阶段自动慢放。');
    document.querySelector('#playbackSpeed').closest('label').title = '播放速度为全局倍率；演出模式会在关键阶段自动慢放。';
    this.sliders = [...document.querySelectorAll('.parameter input')];
    this.sliders.forEach(input => input.addEventListener('input', () => { config[input.id] = Number(input.value); this.syncInputs(); skill.dirty = true; }));
    document.querySelector('#autoLoop').addEventListener('change', e => { config.autoLoop = e.target.checked; });
    document.querySelector('#avatarPalette').onchange=e=>{config.avatarColor=e.target.value;skill.dirty=true;};
    document.querySelector('#fire').onclick = () => skill.fire();
    document.querySelector('#replay').onclick = () => skill.fire();
    document.querySelector('#play-pause').onclick = () => this.togglePlay();
    document.querySelector('#frostColor').addEventListener('input', e => this.setColor(e.target.value));
    document.querySelectorAll('[data-color]').forEach(b => b.onclick = () => this.setColor(b.dataset.color));
    for (const name of ['hitStop','cameraShake','screenFlash']) document.querySelector(`#${name}`).addEventListener('change', event => {
      config[name] = event.target.checked;
      skill.dirty = true;
    });
    this.cameraButtons.forEach(b => b.onclick = () => { scene.setMode(b.dataset.camera); this.syncCameraUI(); });
    document.querySelector('#reset-camera').onclick = () => { scene.setMode('overview'); this.syncInputs(); };
    document.querySelector('#reset-config').onclick = () => { const character = this.kind; Object.assign(config, defaults, { character }); scene.setMode(defaults.cameraMode); document.querySelector('#preset').value = 'balanced'; skill.fire(); this.syncInputs(); };
    document.querySelector('#preset').onchange = e => this.applyPreset(e.target.value);
    document.querySelector('#fullscreen').onclick = async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.viewport-wrap').requestFullscreen(); }
      catch { document.querySelector('.viewport-wrap').classList.toggle('expanded'); scene.resize(); }
    };
    this.scrubber = document.querySelector('#scrubber');
    this.scrubber.addEventListener('input', e => { skill.timeline.playing = false; skill.seek(Number(e.target.value)); });
    window.addEventListener('keydown', e => {
      if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); skill.fire(); }
      if (e.code === 'KeyP') this.togglePlay();
      if (e.code === 'KeyR') { scene.setMode('overview'); this.syncInputs(); }
      if (e.code === 'KeyC' && !e.repeat) {
        e.preventDefault();
        scene.setMode(config.cameraMode === 'cinematic' ? 'overview' : 'cinematic');
        this.syncCameraUI();
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        const direction = e.code === 'ArrowLeft' ? -1 : 1;
        skill.timeline.playing = false;
        skill.seek(Math.max(0, Math.min(skill.timeline.duration, skill.timeline.time + direction / 60)));
      }
    });
    this.lastDuration = 0;
    this.lastPlaying = null;
    this.syncInputs();
  }
  get kind() { return this.skill.kind || this.config.character || 'ice'; }
  get activeColorKey() { return this.kind === 'cultivator' ? 'divineColor' : this.kind === 'sword' ? 'energyColor' : 'frostColor'; }
  setColor(value) { this.config[this.activeColorKey] = value; this.syncInputs(); this.skill.dirty = true; }
  applyPreset(name) {
    const config = this.config;
    const sword = this.kind === 'sword';
    if(this.kind === 'cultivator'){
      const presets={balanced:{meteorCount:60,meteorSize:1,avatarScale:1,avatarFresnel:1.25,avatarColor:'#8ac4ff',divineColor:'#ffc86a',bloomStrength:.65,particleDensity:1,impactRadius:1.6,flightSpeed:18},cinematic:{meteorCount:84,meteorSize:1.25,avatarScale:1.15,avatarFresnel:1.5,avatarColor:'#8ac4ff',divineColor:'#ffd58b',bloomStrength:.75,particleDensity:1.3,impactRadius:2.1,flightSpeed:18},precision:{meteorCount:36,meteorSize:.8,avatarScale:.9,avatarFresnel:.8,avatarColor:'#8ac4ff',divineColor:'#ffe9a6',bloomStrength:.4,particleDensity:.65,impactRadius:1.3,flightSpeed:20}};
      Object.assign(config,presets[name]||presets.balanced);this.syncInputs();this.skill.fire();return;
    }
    if (name === 'balanced') {
      for (const key of commonPresetKeys) config[key] = defaults[key];
      const keys = sword ? ['bladeSize','energyColor','lightningColor','hitStop','cameraShake','screenFlash'] : ['arrowSize','homingCount','frostColor'];
      for (const key of keys) config[key] = defaults[key];
    }
    if (name === 'cinematic') Object.assign(config,
      { playbackSpeed: .45, particleDensity: 1.4, shardCount: 64, trailLength: 10, bloomStrength: .8, impactRadius: 2.2 },
      sword ? { bladeSize: 1.2, energyColor: '#69dbff', lightningColor: '#ab83ff' } : { arrowSize: .66, frostColor: '#9cb5ff' });
    if (name === 'precision') Object.assign(config,
      { playbackSpeed: .6, particleDensity: .6, shardCount: 28, trailLength: 5.5, bloomStrength: .3, impactRadius: 1.2 },
      sword ? { bladeSize: .85, energyColor: '#8ceaff', lightningColor: '#a9b8ff' } : { arrowSize: .48, frostColor: '#78e8ff' });
    this.syncInputs(); this.skill.fire();
  }
  syncCharacterUI() {
    const kind = this.kind;
    const sword = kind === 'sword', cultivator = kind === 'cultivator';
    document.body.dataset.character=kind;
    this.lastKind = kind;
    this.characterButtons.forEach(button => {
      const selected = button.dataset.character === kind;
      button.classList.toggle('active', selected);button.setAttribute('aria-pressed', String(selected));
    });
    this.characterOnlyNodes.forEach(element => { element.hidden = !element.dataset.characterOnly.split(' ').includes(kind); });
    this.viewportWrap.dataset.skillKind = kind;
    document.querySelector('#skill-title').textContent = cultivator ? '元婴 · 法相天劫' : sword ? '苍雷 · 断空斩' : '寒霜贯星';
    document.querySelector('#fire-label').textContent = cultivator ? '敕令天劫' : sword ? '释放剑气' : '发射冰箭';
    document.querySelector('#fire-icon').innerHTML = icon(cultivator ? 'seal' : sword ? 'sword' : 'arrow');
    document.querySelector('#trajectory-heading').textContent = cultivator ? '法相与天劫' : sword ? '剑气与轨迹' : '冰晶与轨迹';
    document.querySelector('label[for="shardCount"] .param-label').textContent = cultivator ? '岩石碎片' : sword ? '冲击碎片' : '冰晶碎片';
    document.querySelector('label[for="impactRadius"] .param-label').textContent = cultivator ? '轰击范围' : sword ? '雷爆范围' : '冰爆范围';
    document.querySelector('#active-color-label').textContent = cultivator ? '法阵颜色' : sword ? '剑气颜色' : '冰霜颜色';
    document.querySelector('#frostColor').setAttribute('aria-label', cultivator ? '法阵颜色' : sword ? '剑气颜色' : '冰霜颜色');
    const names = presetNames[kind];
    [...document.querySelector('#preset').options].forEach((option, index) => { option.textContent = names[index]; });
    document.querySelector('label[for="flightSpeed"] .param-label').textContent=cultivator?'陨落速度':'飞行速度';
    document.querySelector('label[for="trailLength"]').hidden=cultivator;
    document.querySelector('label[for="shardCount"]').hidden=cultivator;
    document.querySelector('label[for="hitStop"]').hidden=cultivator;
    document.querySelector('label[for="screenFlash"]').hidden=cultivator;
    document.querySelector('[data-camera="detail"]').textContent=cultivator?'法相特写':'武器特写';
    const palette = cultivator ? ['#ffc86a','#ffe9a6','#efa067','#b2e4d1'] : sword ? ['#39dfff','#9170ff','#77f7df','#e9faff'] : ['#58dfff','#9cb5ff','#77f7df','#d5faff'];
    document.querySelectorAll('[data-color]').forEach((button,index) => {
      button.dataset.color = palette[index];button.style.setProperty('--swatch', palette[index]);
      button.setAttribute('aria-label', `${cultivator ? '法阵' : sword ? '剑气' : '冰霜'}颜色 ${palette[index].toUpperCase()}`);
    });
    document.title = `${cultivator ? '元婴 · 法相天劫' : sword ? '苍雷 · 断空斩' : '寒霜贯星'} | Frostbound`;
    this.lastShotIndex = null;this.lastShotLabel = null;
  }
  togglePlay() { const tl = this.skill.timeline; if (tl.phase === 'idle') this.skill.fire(); else tl.playing = !tl.playing; }
  syncInputs() {
    if (this.lastKind !== this.kind) this.syncCharacterUI();
    this.sliders.forEach(input => {
      const v = this.config[input.id]; input.value = v;
      input.style.setProperty('--fill', `${100 * (v - input.min) / (input.max - input.min)}%`);
      const digits = ['shardCount', 'homingCount', 'meteorCount'].includes(input.id) ? 0 : (input.id === 'flightSpeed' ? 1 : 2);
      document.querySelector(`#${input.id}-value`).textContent = `${Number(v).toFixed(digits)}${input.dataset.unit ? ' ' + input.dataset.unit : ''}`;
    });
    document.querySelector('#autoLoop').checked = this.config.autoLoop;
    document.querySelector('#avatarPalette').value=this.config.avatarColor;
    const color = this.config[this.activeColorKey];
    document.querySelector('#frostColor').value = color;
    document.querySelector('#color-value').textContent = color.toUpperCase();
    for (const name of ['hitStop','cameraShake','screenFlash']) document.querySelector(`#${name}`).checked = this.config[name];
    this.syncCameraUI();
    document.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('active', b.dataset.color === color));
  }
  syncCameraUI() {
    const cinematic = this.config.cameraMode === 'cinematic';
    this.lastCameraMode = this.config.cameraMode;
    this.cameraButtons.forEach(button => {
      const selected = button.dataset.camera === this.config.cameraMode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    this.viewportWrap.classList.toggle('cinematic-mode', cinematic);
    this.phaseBadge.hidden = cinematic;
    this.directorStatus.hidden = !cinematic;
    this.manualCameraHelp.hidden = cinematic;
    this.cinematicCameraHelp.hidden = !cinematic;
    this.cinematicSpeedNote.hidden = !cinematic;
    this.timelineName.textContent = cinematic ? '技能时间轴 · 运镜同步' : '技能时间轴';
  }
  update(fps, draws) {
    const tl = this.skill.timeline;
    const kind = this.kind;
    if (this.lastKind !== kind) this.syncInputs();
    const labels = kind === 'cultivator' ? cultivationLabels : kind === 'sword' ? swordPhaseLabels : phaseLabels;
    if (this.lastCameraMode !== this.config.cameraMode) this.syncCameraUI();
    if (this.config.cameraMode === 'cinematic') {
      const director = this.scene.director;
      const shotIndex = Number.isFinite(director?.shotIndex) ? director.shotIndex : 0;
      const shotLabel = director?.shotLabel || labels[tl.phase] || '准备就绪';
      if (shotIndex !== this.lastShotIndex) {
        this.directorShotNumber.textContent = String(shotIndex + 1).padStart(2, '0');
        this.lastShotIndex = shotIndex;
      }
      if (shotLabel !== this.lastShotLabel) {
        this.directorShotLabel.textContent = shotLabel;
        this.lastShotLabel = shotLabel;
      }
    }
    document.querySelector('#current-time').textContent = tl.time.toFixed(2);
    document.querySelector('#phase-label').textContent = labels[tl.phase] || tl.phase;
    document.querySelector('#playhead').style.left = `${100 * tl.time / tl.duration}%`;
    this.scrubber.value = tl.phase === 'idle' ? tl.duration : Number(tl.time.toFixed(6));
    if (this.lastPlaying !== tl.playing) { document.querySelector('#play-pause').innerHTML = icon(tl.playing ? 'pause' : 'play'); document.querySelector('#play-pause').setAttribute('aria-label', tl.playing ? '暂停' : '播放'); this.lastPlaying = tl.playing; }
    if (kind !== this.lastTimelineKind || Math.abs(tl.duration - this.lastDuration) > .001 || Math.abs(tl.impactTime - this.lastImpactTime) > .001) {
      this.lastDuration = tl.duration; this.lastImpactTime = tl.impactTime; this.lastTimelineKind = kind; this.scrubber.max = tl.duration;
      document.querySelector('#duration').textContent = tl.duration.toFixed(2);
      const stops = kind === 'cultivator' ? [0,.65,1.6,tl.impactTime,tl.lastImpact,tl.lastImpact+.5,tl.duration] : kind === 'sword' ? [0,.3,.45,.65,tl.impactTime,tl.impactTime+.35,tl.duration] : [0,.4,.75,Math.min(.9,tl.impactTime),tl.impactTime,tl.impactTime+.35,tl.duration];
      for (let index = 1; index < stops.length; index++) stops[index] = Math.max(stops[index-1], Math.min(tl.duration, stops[index]));
      const titles = kind === 'cultivator' ? ['聚元','显圣','召星','天劫','余震','归元'] : kind === 'sword' ? ['聚能','蓄势','拔斩','飞行','雷爆','消散'] : ['凝聚','蓄力','发射','飞行','冰爆','消散'];
      document.querySelector('#phase-segments').innerHTML = titles.map((s,i) => `<div class="segment segment-${i}" style="width:${(stops[i+1]-stops[i])/tl.duration*100}%">${s}</div>`).join('');
      document.querySelector('#time-ticks').innerHTML = Array.from({length: 7},(_,i)=>`<span style="left:${i/6*100}%">${(tl.duration*i/6).toFixed(2)}</span>`).join('');
    }
    document.querySelector('#fps').textContent = Math.round(fps);
    document.querySelector('#fps-dot').classList.toggle('slow',fps<30);
    document.querySelector('#drawcalls').textContent = `${draws} 次绘制`;
  }
}
