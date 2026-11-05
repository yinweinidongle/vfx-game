import {REGIONS, bountyProgress} from './RegionBounties.js';
import { GameLootLabels } from './GameLootLabels.js';
import * as T from 'three';
import { BOONS, CLASSES, INTERACTABLES, ITEMS, SKILLS, ZONES, zoneAt, heightAt } from './GameData.js';
import { itemIcon } from './GameIcons.js';
import { GameMap } from './GameMap.js';
import { swordEvolution } from './SwordEvolution.js';
import { MAX_FERVOR } from './AttackGrowth.js';
import { vitalityGrowth, spiritGrowth } from './CultivationGrowth.js';
import { awakeningStyle } from './AwakeningConfig.js';
import { GameGearUI,gearIcon } from './GameGearUI.js';
import { gearName,GEAR_RARITIES } from './GearData.js';
export class GameUI {
  constructor(game) {
    this.game = game; this.state = game.state; this.frame = 0; this.toastTimer = 0; this.regionTimer = 0; this.lastObjective = ''; this.lastHP = -1;
    this.project = new T.Vector3(); this.numbers = Array.from({ length: 40 }, () => ({ age: 2, x: 0, z: 0, element: document.createElement('span') }));
    const p = CLASSES[this.state.kind];
    const skillMarkup=SKILLS.map((s,i)=>{const awakening=i>=3,name=awakening?awakeningStyle(this.state.kind,i).name:s.name;return `<button class="skill-slot ${awakening?`awakening-slot awakening-${i}`:''}" data-skill="${i}" title="${name} · 消耗 ${s.cost} 灵力 · ${s.description}" aria-label="${name}（${s.key}）">${awakening?'<span class="awakening-icon" aria-hidden="true"></span>':itemIcon(s.icon)}<i class="cooldown-mask"></i><strong class="cooldown-text"></strong><kbd>${s.key}</kbd><span class="skill-name">${name}</span><small class="mana-cost">${s.cost}</small></button>`;}).join('');
    document.querySelector('#game-hud').innerHTML = `
      <section class="hero-status"><div class="hero-medallion">${itemIcon(p.icon)}<b id="hero-level">1</b></div><div class="hero-vitals"><div class="hero-name"><strong>${p.name}</strong><span id="hero-gold">0 灵石</span></div><div class="hp-track"><i id="hp-fill"></i><span id="hp-label"></span></div><div id="shield-status" hidden><div class="shield-track"><i id="shield-fill"></i></div><small id="shield-label"></small></div><div class="energy-track"><i id="energy-fill"></i></div><small id="energy-label"></small><div class="stamina-track"><i id="stamina-fill"></i></div></div></section>
      <section class="quest-card"><span class="kicker">当前旅程</span><h2 id="quest-title"></h2><p id="quest-text"></p><div class="quest-route"><span id="quest-distance"></span><button id="route-toggle" title="切换路线提示（V）">引路 <kbd>V</kbd></button></div><div id="encounter-status" hidden><span></span><small></small></div></section>
      <section class="map-corner"><div class="map-caption"><span id="map-region">听雪林地</span><button id="map-open" title="展开地图（M）" aria-label="展开地图">总览 <kbd>M</kbd></button></div><div id="world-cycle" class="world-cycle"><i aria-hidden="true"></i><span></span><small></small></div><canvas id="minimap" width="440" height="368" aria-label="区域地图"></canvas><div class="world-actions"><button id="inventory-button">行囊 <kbd>I</kbd></button><button id="shop-button">商会 <kbd>B</kbd></button><button id="pause-button" aria-label="暂停游戏">暂停 <kbd>Esc</kbd></button></div></section>
      <section class="boss-status" hidden><span>失落的守门者</span><h2>归墟之主 · 无相</h2><div><i id="boss-fill"></i></div><p id="boss-phase">第一式 · 守界</p></section>
      <div id="skill-shot" hidden><span id="skill-shot-label"></span><small>移动 / 闪避可结束镜头</small></div><div id="target-status"></div><div id="region-toast"><span id="region-sub"></span><h2 id="region-name"></h2><i></i></div><div id="game-toast" role="status"></div><div id="loot-toast"></div>
      <div id="interact-prompt" hidden><kbd>F</kbd><span></span></div>
      <section class="skill-dock"><div class="basic-hint">${itemIcon(p.icon)}<span>鼠标左键<br><b>${p.primary}</b><small id="attack-form"></small><small id="fervor-count"></small><i id="fervor-progress" aria-hidden="true"></i></span></div><div class="skill-slots">${skillMarkup}<button class="skill-slot heal-slot" id="heal-button" title="恢复 45% 生命，冷却 18 秒" aria-label="治疗（C）">${itemIcon(4)}<i class="cooldown-mask"></i><strong class="cooldown-text"></strong><kbd>C</kbd><span class="skill-name">回春</span></button></div><div class="dodge-hint"><kbd>Space</kbd><span>闪避 · 35 耐力</span></div></section>
      <div class="xp-line"><i id="xp-fill"></i></div><div class="control-reminder"><span><kbd>W A S D</kbd> 移动</span><span>自动索敌 · 鼠标优先</span><span><kbd>F</kbd> 交互</span><span id="performance-readout"></span></div><div id="damage-layer"></div><div id="hurt-vignette"></div>
    `;
    this.gearUI=new GameGearUI(this);this.lootLabels=new GameLootLabels(game);
    this.hp = document.querySelector('#hp-fill'); this.energy = document.querySelector('#energy-fill'); this.stamina = document.querySelector('#stamina-fill');
    this.skillButtons = [...document.querySelectorAll('[data-skill]')];
    this.skillButtons.forEach(b => b.onclick = () => game.cast(Number(b.dataset.skill)));
    document.querySelector('#route-toggle').onclick=()=>this.toggleRoute();
    document.querySelector('#heal-button').onclick = () => game.heal();
    document.querySelector('#shop-button').onclick=()=>this.shop();
    document.querySelector('#inventory-button').onclick = () => this.inventory(); document.querySelector('#pause-button').onclick = () => this.pause(); document.querySelector('#map-open').onclick = () => this.map();
    this.mapCanvas = document.querySelector('#minimap'); this.mapContext = this.mapCanvas.getContext('2d');this.atlas=new GameMap(game);
    for (const n of this.numbers) { n.element.className = 'damage-number'; n.element.hidden = true; document.querySelector('#damage-layer').append(n.element); }
    this.enemyLabels = new Map(); this.dialog = document.querySelector('#game-dialog'); this.dialog.addEventListener('cancel', e => { e.preventDefault(); if (!this.state.dead && !this.dialog.querySelector('[data-boon]')) this.close(); });
    this.labelRects = new Float32Array(32 * 4);
    // An attack held through a level-up must not select the card under its release.
    this.awaitingRelease=false;this.ignoreClicksUntil=0;
    window.addEventListener('pointerup',()=>{if(this.awaitingRelease){this.awaitingRelease=false;this.ignoreClicksUntil=performance.now()+150;}},{capture:true,signal:game.input.abort.signal});
    this.dialog.addEventListener('pointerdown',()=>{this.awaitingRelease=false;this.ignoreClicksUntil=0;},true);
    this.dialog.addEventListener('click',e=>{if(this.awaitingRelease||performance.now()<this.ignoreClicksUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
    this.dialog.addEventListener('close', () => { game.input.clear(); });
    this.region(zoneAt(this.state.player.x,this.state.player.z));
  }
  open(html, className = '') {
    this.awaitingRelease ||= this.game.input.attacking;
    this.game.paused = true; this.game.input.clear();this.game.audio.pause(); this.dialog.className = className;
    this.dialog.innerHTML = `<button class="dialog-close" aria-label="关闭">×</button>${html}`;
    this.dialog.querySelector('.dialog-close').onclick = () => this.close(); if (!this.dialog.open) this.dialog.showModal();
  }
  close() {
    if (this.state.dead || this.game.storage?.conflict || this.game.saveBlocked) return;
    if (!this.state.awakening.active) {
      if (this.deferredVictory) { this.deferredVictory=false; this.victory(); return; }
      if (this.state.pendingBoons > 0) { this.boon(); return; }
    }
    this.dialog.close(); this.game.paused = false; this.game.audio.resume(); this.game.input.clear();
  }
  pause() {
    const saved = this.game.save();
    if (this.game.saveBlocked) return;
    this.open(`<span class="kicker">FROSTBOUND / JOURNEY PAUSED</span><h1>片刻，亦是修行。</h1><p>${saved ? '旅途已经记录在此设备。重新进入时从最近的灯台出发。' : '进度尚未写入，请检查浏览器的站点存储权限和可用空间。'}</p><div class="dialog-buttons"><button class="primary" id="resume-game">继续旅程 <span>→</span></button><button id="settings-game">声音与画质</button><button id="controls-game">操作指南</button><a href="game.html">返回标题</a><a href="index.html">返回技能实验室</a></div>`);
    this.dialog.querySelector('#resume-game').onclick = () => this.close(); this.dialog.querySelector('#settings-game').onclick = () => this.settings(); this.dialog.querySelector('#controls-game').onclick = () => this.tutorial();
  }
  settings() {
    const s = this.game.settings;
    this.open(`<span class="kicker">SETTINGS</span><h1>声音与画面</h1><div class="settings-list"><label>画质<select id="quality-setting"><option value="auto">自动 · 动态分辨率</option><option value="high">精致 · 完整光影</option><option value="medium">均衡</option><option value="low">流畅</option></select></label><label>主音量<input id="volume-setting" type="range" min="0" max="1" step=".05" value="${s.volume}"></label><label>受击震屏<input id="shake-setting" type="checkbox" ${s.shake ? 'checked' : ''}></label><label>技能特写镜头<input id="camera-setting" type="checkbox" ${s.skillCamera!==false ? 'checked' : ''}></label><label>旅途路线提示<input id="route-setting" type="checkbox" ${s.route!==false ? 'checked' : ''}></label><label>国风背景音乐<input id="music-setting" type="checkbox" ${!s.musicMuted ? 'checked' : ''}></label></div><p class="muted">画质实时生效。自动模式会根据帧率调整渲染分辨率。</p><button class="primary" id="settings-done">完成</button>`);
    const select = this.dialog.querySelector('#quality-setting'); select.value = s.quality; select.onchange = () => this.game.configure({ quality: select.value });
    this.dialog.querySelector('#volume-setting').oninput = e => this.game.configure({ volume: Number(e.target.value) }); this.dialog.querySelector('#shake-setting').onchange = e => this.game.configure({ shake: e.target.checked }); this.dialog.querySelector('#camera-setting').onchange=e=>this.game.configure({skillCamera:e.target.checked});this.dialog.querySelector('#route-setting').onchange=e=>this.game.configure({route:e.target.checked});this.dialog.querySelector('#music-setting').onchange=e=>this.game.configure({musicMuted:!e.target.checked});this.dialog.querySelector('#settings-done').onclick = () => this.close();
  }
  tutorial() {
    this.open(`<span class="kicker">旅途须知</span><h1>风雪已至，向前而行。</h1><div class="tutorial-grid"><article><kbd>W A S D</kbd><h3>探索世界</h3><p>键盘移动，右键指定位置；金色路线指引当前目标，V 可开关。靠近灯台、宝箱或封印，按 F 交互。</p></article><article><kbd>鼠标左键</kbd><h3>连贯进攻</h3><p>按住左键，自动锁定附近敌人；鼠标附近的目标优先。Q 追踪冰箭、E 远程剑气、R 法相齐射与陨星。30 级 G 全场落雷，35 级 H 巨刃镇岳，40 级 J 冰暴领域。技能镜头可通过移动或闪避结束。</p></article><article><kbd>Space / C</kbd><h3>攻守取舍</h3><p>红色区域是敌人的攻击预警。闪避短暂无敌；回春恢复生命。留意耐力与灵力。夜间敌人赤目狂暴，伤害与追击速度增强，黎明时恢复。</p></article><article><kbd>I / B / M / Esc</kbd><h3>整备与成长</h3><p>I 打开行囊穿戴五类装备，装备可回收灵石；B 打开商会，在安全灯台可购买、强化至 +20、提升三道修行。M 查看地图，可追踪区域清剿悬赏。</p></article></div><button class="primary" id="tutorial-done">踏入霜界 <span>→</span></button>`);
    this.dialog.querySelector('#tutorial-done').onclick = () => this.close();
  }
  inventory(){this.gearUI.inventory();}
  shop(){this.gearUI.shop();}
  relicInventory() {
    const s = this.state.save, stats = this.state.stats;
    const comparison=id=>{
      const item=ITEMS[id];if(s.equipment[item.slot]===id)return '';
      const next=this.state.statsFor({...s.equipment,[item.slot]:id});
      const changes=[['damage','伤害',1],['hp','生命',1],['crit','暴击',100],['haste','冷却缩减',100]].map(([key,label,mult])=>{const delta=Math.round((next[key]-stats[key])*mult);return delta?`<span class="${delta>0?'upgrade':'downgrade'}">${label} ${delta>0?'+':''}${delta}${mult===100?'%':''}</span>`:'';}).filter(Boolean);
      return changes.length?`<div class="item-comparison">${changes.join('')}</div>`:'';
    };
    this.open(`<span class="kicker">BELONGINGS / 行囊</span><h1>随身之物，皆有来处。</h1><div class="inventory-summary"><span>伤害 <b>${Math.round(stats.damage)}</b></span><span>生命 <b>${stats.hp}</b></span><span>暴击 <b>${Math.round(stats.crit * 100)}%</b></span><span>冷却缩减 <b>${Math.round(stats.haste * 100)}%</b></span></div>${this.growthInfo()}${this.cultivationInfo()}<div class="equipment-slots">${['charm', 'ring', 'arms'].map((slot, i) => { const id = s.equipment[slot]; return `<div><small>${['灵坠','戒指','护手'][i]}</small>${id ? itemIcon(ITEMS[id].icon) + '<strong>' + ITEMS[id].name + '</strong>' : '<strong>尚未装备</strong>'}</div>`; }).join('')}</div><div class="inventory-grid">${s.inventory.length ? s.inventory.map(id => { const item = ITEMS[id], equipped = s.equipment[item.slot] === id; return `<button data-item="${id}" class="inventory-item" style="--rarity:${item.color}">${itemIcon(item.icon)}<div><small>${item.rarity}${equipped ? ' · 已装备' : ''}</small><h3>${item.name}</h3><p>${item.description}</p>${comparison(id)}</div><span>${equipped ? '✓' : '装备'}</span></button>`; }).join('') : '<p class="empty-inventory">探索林地的宝箱，寻找第一件遗物。</p>'}</div>`,'wide-dialog');
    this.dialog.querySelectorAll('[data-item]').forEach(b => b.onclick = () => { this.state.equip(b.dataset.item); this.game.save(); this.inventory(); });
  }
  map() {
    const save = this.state.save;
    const regions = REGIONS.map(region => {
      const b = bountyProgress(save, region), tracked = save.trackedChapter === region.chapter;
      const status = !b.next ? '已完成' : !b.available ? '待解封' : tracked ? '返回主线' : '追踪';
      return `<article><div><strong>${region.name}</strong><small>${b.cleared} / ${b.total} 处净化</small></div><p>历练 +${b.xp} · 灵石 +${b.gold}</p><button data-bounty="${region.chapter}" aria-pressed="${tracked}" ${b.available && b.next ? '' : 'disabled'}>${status}</button></article>`;
    }).join('');
    this.open(`<span class="kicker">ATLAS / 归墟群岛</span><h1>星途所向</h1><div class="atlas-content"><div><canvas id="large-map" width="1440" height="920" aria-label="世界地图"></canvas><div class="map-legend"><span>◈ 当前位置</span><span>◇ 当前目标</span><span>✦ 灯台</span><span>□ 宝箱</span></div></div><section class="region-bounties"><h2>区域清剿</h2><p>净化区域内全部据点，自动领取本轮悬赏。</p><div>${regions}</div></section></div>`, 'wide-dialog atlas-dialog');
    this.drawMap(this.dialog.querySelector('canvas'));
    for (const button of this.dialog.querySelectorAll('[data-bounty]')) button.onclick = () => {
      if (this.state.trackBounty(Number(button.dataset.bounty))) {
        this.game.guide.update(this.state.time);
        this.game.save();
        this.map();
      }
    };
  }
  toggleRoute() { this.game.configure({route:this.game.settings.route===false});this.toast(this.game.settings.route?'引路已开启 · 沿金色光带前进':'引路已收起'); }
  growthInfo() {
    const g=this.state.growth;
    return `<div class="growth-summary" style="--growth:${g.color}"><span>攻势 · ${g.name}</span><strong>${g.shots} 重主弹道 + ${g.echoes} 道灵锋</strong><p>${g.spiritName}列阵 · 每层锋芒增添一枚，攻击时逐批追敌<br>灵锋各造成攻击力 10% 的伤害；每五层强化末枚灵锋的爆发与范围<br>剑气 · ${swordEvolution(g.stacks).name}：锋芒每层增强刃纹、色阶与一体流光拖尾<br>${g.nextFervor?`下一次终结进阶：锋芒 ${g.nextFervor} 层`:'锋芒圆满 · 五十灵锋列阵'} · 法相 ${g.haloCount+this.state.spirit.haloBonus} 道灵光</p></div>`;
  }
  cultivationInfo(){
    const s=this.state,v=s.vitality,m=s.spirit;
    return `<div class="cultivation-info"><article><small>长生 ${v.level} 层 · ${v.name}</small><strong>护罩 ${Math.ceil(s.player.shield)} / ${v.capacity}</strong><p>先吸收伤害，破盾后扣除生命；6 秒未受击后，每秒恢复 ${v.regen.toFixed(1)}。</p></article><article><small>灵息 ${m.level} 层 · ${m.name}</small><strong>灵力 ${Math.floor(s.player.energy)} / ${s.stats.energyMax}</strong><p>自然恢复 ${s.stats.regen.toFixed(1)} / 秒，施法后停顿 1.4 秒。技能威力 +${Math.round((m.damage-1)*100)}%。</p></article></div>`;
  }
  cultivationPreview(id){
    if(id==='power')return this.fervorPreview();
    const s=this.state,n=s.save.boons[id];if(n>=50)return '<div class="fervor-preview"><b>此道圆满 · 50 层</b></div>';
    if(id==='vitality'){const next=vitalityGrowth(n+1);return `<div class="fervor-preview"><b>长生 ${n} → ${n+1} 层</b><span>护罩容量 <strong>${s.vitality.capacity} → ${next.capacity}</strong></span><span>生命 <strong>${s.stats.hp} → ${s.stats.hp+35}</strong></span><small>${s.vitality.name} → ${next.name}；色阶加深，受击涟漪增强</small></div>`;}
    const next=spiritGrowth(n+1),effect=next.stage>s.spirit.stage?`✦ ${next.name}：技能形态进阶`:'能量流纹、碎光与法相齐射增强';
    return `<div class="fervor-preview"><b>灵息 ${n} → ${n+1} 层</b><span>灵力上限 <strong>${s.stats.energyMax} → ${next.energyMax}</strong></span><span>技能威力 <strong>+${((next.damage-1)*100).toFixed(1)}%</strong></span><small>${effect}</small></div>`;
  }
  fervorPreview() {
    const g=this.state.growth,n=g.stacks,next=n+1;
    if(n>=MAX_FERVOR)return '<div class="fervor-preview"><b>锋芒圆满 · 50 层</b><span>五十灵锋列阵已成</span></div>';
    return `<div class="fervor-preview"><b>锋芒 ${n} → ${next} 层</b><span>${g.spiritName}列阵 <strong>${n} → ${next} 枚</strong></span><span>每轮追击 <strong>${n} → ${next} 道</strong></span><span>攻击 <strong>${this.state.stats.damage.toFixed(1)} → ${(this.state.stats.damage+this.state.attackBase()*.12).toFixed(1)}</strong></span><small>剑气 · ${swordEvolution(next).name}，色阶与流纹增强${next%5===0?' · 终结爆发进阶':''}</small></div>`;
  }
  camp() {
    const cost = 100 + this.state.save.boons.power * 65;
    this.open(`<span class="kicker">SANCTUARY / 灯火长明</span><h1>在此，重整心神。</h1><p>生命、护罩、灵力与耐力已恢复。灯台已记录为新的归途。</p><div class="camp-upgrade">${itemIcon(2)}<div><h3>淬炼灵锋</h3><p>基础攻击 +12%，新增一枚灵锋与一次追击</p><strong>${cost} 灵石 · 持有 ${this.state.save.gold}</strong></div></div>${this.fervorPreview()}<div class="dialog-buttons"><button class="primary" id="camp-upgrade" ${this.state.save.gold < cost || this.state.growth.stacks>=MAX_FERVOR ? 'disabled' : ''}>${this.state.growth.stacks>=MAX_FERVOR?'锋芒圆满':`淬炼 · ${cost} 灵石`}</button><button id="camp-store">商会 · 强化 · 修行</button><button id="camp-leave">继续旅途</button>${this.state.save.won ? '<button id="challenge-start">开启轮回 · 敌人增强，地面装备结算入包</button>' : ''}</div>`);
    this.dialog.querySelector('#camp-upgrade').onclick = () => { if (this.state.upgrade()) { this.game.save(); this.game.audio.play('level'); this.camp(); } };
    this.dialog.querySelector('#camp-store').onclick=()=>this.shop();
    this.dialog.querySelector('#camp-leave').onclick = () => this.close();
    if (this.state.save.won) this.dialog.querySelector('#challenge-start').onclick = () => this.game.challenge();
  }
  boon() {
    const readyAt=performance.now()+400;
    this.open(`<span class="kicker">ASCENSION / 境界提升</span><h1>修行，有了新的回响。</h1><p>等级 ${this.state.save.level} · 选择一项永久成长</p><div class="boon-grid">${BOONS.map(b => `<button data-boon="${b.id}" ${this.state.save.boons[b.id]>=MAX_FERVOR?'disabled':''}>${itemIcon(b.icon)}<h2>${b.name}</h2><p>${b.description}</p>${this.cultivationPreview(b.id)}<span>选择此道 →</span></button>`).join('')}</div>`,'wide-dialog'); this.dialog.querySelector('.dialog-close').hidden = true;
    this.dialog.querySelectorAll('[data-boon]').forEach(b => b.onclick = () => { if(performance.now()<readyAt)return;this.state.chooseBoon(b.dataset.boon); this.game.save(); if (this.state.pendingBoons) this.boon(); else this.close(); });
  }
  defeat() {
    this.open(`<span class="kicker">轮回未尽</span><h1>灯火还在，归来便是。</h1><p>已解开的封印、装备与成长都会保留。</p><button class="primary" id="revive-button">于灯台重生 <span>→</span></button>`); this.dialog.querySelector('.dialog-close').hidden = true;
    this.dialog.querySelector('#revive-button').onclick = () => { this.state.revive();this.deferredBoon=false;this.close(); this.game.cameraSnap = true; };
  }
  victory() {
    const s = this.state.save;
    this.open(`<span class="kicker">JOURNEY COMPLETE / 天光再临</span><h1>归墟尽头，仍有新生。</h1><p>两道封印已经解除。王座不再沉默，群岛迎来千年后的第一缕晨光。</p><div class="victory-relic">${itemIcon(2)}<div><small>传说遗物</small><h2>太虚法印</h2><p>已收入行囊</p></div></div><div class="inventory-summary"><span>等级 <b>${s.level}</b></span><span>净化敌人 <b>${s.kills}</b></span><span>探索宝箱 <b>${s.opened.length} / 5</b></span><span>旅途 <b>${Math.ceil(s.playTime / 60)} 分钟</b></span></div><button class="primary" id="victory-continue">继续探索 · 灯台可开启轮回</button>`,'wide-dialog');
    this.dialog.querySelector('#victory-continue').onclick = () => { this.state.pendingBoons ? this.boon() : this.close(); };
  }
  toast(text) { const e = document.querySelector('#game-toast'); e.textContent = text; e.classList.add('visible'); this.toastTimer = 4; }
  region(zone) { document.querySelector('#region-name').textContent = zone.name; document.querySelector('#region-sub').textContent = zone.sub; document.querySelector('#region-toast').classList.add('visible'); this.regionTimer = 3.8; }
  handle(event) {
    if (this.state.dead && ['level','victory','memory','camp','awakeningEnd'].includes(event.type)) {
      if (event.type === 'victory') this.deferredVictory = true;
      return;
    }
    if(event.type==='awakeningUnlocked')this.toast(event.text);
        if(event.type==='awakeningEnd'){
      if(this.deferredVictory){this.deferredVictory=false;this.deferredBoon=false;this.victory();}
      else if(this.deferredBoon){this.deferredBoon=false;if(this.state.pendingBoons)this.boon();}
    }
    if(event.type==='dayNight')this.toast(event.text);
    if(event.type==='cast')this.regionTimer=0;
    if (event.type === 'hit') {
      const merged=this.numbers.find(n=>n.enemyId===event.enemyId&&n.elementType===event.element&&n.age<((event.element==='halo'||event.fervor)?.32:.16));const n = merged || this.numbers.find(n => n.age > 1.1) || this.numbers[0];const damage=(merged?n.damage:0)+event.damage;Object.assign(n, { age: merged?n.age:0, enemyId:event.enemyId,elementType:event.element,damage, x: event.x, z: event.z, height:heightAt(event.x,event.z)+1.8*event.scale }); n.element.textContent = Math.round(damage); n.element.className = 'damage-number' + (event.critical ? ' critical' : ''); n.element.hidden = false;
    }
    if (['toast','clear','seal','wave','ascend','fervorUpgrade','vitalityUpgrade','spiritUpgrade'].includes(event.type)) this.toast(event.text);
    if(event.type==='gearLoot'){const e=document.querySelector('#loot-toast'),item=event.item;e.innerHTML=gearIcon(item)+`<div><small style="color:${GEAR_RARITIES[item.rarity].color}">获得${GEAR_RARITIES[item.rarity].name}装备</small><strong style="color:${GEAR_RARITIES[item.rarity].color}">${gearName(item)}</strong><span>按 I 查看穿戴与强化</span></div>`;e.classList.add('visible');this.lootTimer=5;}
    if (event.type === 'loot') { const item = ITEMS[event.id], e = document.querySelector('#loot-toast'); e.innerHTML = `${itemIcon(item.icon)}<div><small>获得${item.rarity}遗物</small><strong>${item.name}</strong><span>按 I 查看装备</span></div>`; e.classList.add('visible'); this.lootTimer = 5; }
    if (event.type === 'region') this.region(event.zone);
    if (event.type === 'camp') this.camp(); if (event.type === 'defeat') this.defeat();
    if (event.type === 'memory') this.open(`<span class="kicker">ECHOES / 旧世回声</span><h1>${event.name}</h1><p class="memory-text">${event.text}</p><button class="primary" id="memory-close">收起残简</button>`), this.dialog.querySelector('#memory-close').onclick = () => this.close();
    if (event.type === 'victory') {if(this.state.awakening.active||this.lootRevealTime>0)this.deferredVictory=true;else this.victory();}
    if (event.type === 'level' && this.state.pendingBoons && !this.state.dead) {if(this.state.awakening.active||this.lootRevealTime>0)this.deferredBoon=true;else if (!this.dialog?.open) this.boon();}
    if (event.type === 'hurt') { document.querySelector('#hurt-vignette').classList.add('active'); this.hurtTimer = .25; }
    if (event.type === 'bossPhase') this.toast(['','无相 · 星陨之式','无相 · 万象俱灭'][event.phase]);
  }
  drawMap(canvas = this.mapCanvas) { this.atlas.draw(canvas); }
  update(dt, fps, calls) {
    if (this.lootRevealTime > 0) {
      this.lootRevealTime = Math.max(0,this.lootRevealTime - dt);
      if (!this.lootRevealTime && !this.state.awakening.active && !this.state.dead && !this.dialog.open) {
        if (this.deferredVictory) { this.deferredVictory=false; this.deferredBoon=false; this.victory(); }
        else if (this.deferredBoon) { this.deferredBoon=false; if(this.state.pendingBoons)this.boon(); }
      }
    }
    this.lootLabels?.update(dt);
    const p = this.state.player, s = this.state.save, stats = this.state.stats; this.frame++;
    this.toastTimer -= dt; this.regionTimer -= dt; this.lootTimer = (this.lootTimer || 0) - dt; this.hurtTimer = (this.hurtTimer || 0) - dt;
    if (this.toastTimer <= 0) document.querySelector('#game-toast').classList.remove('visible'); if (this.regionTimer <= 0) document.querySelector('#region-toast').classList.remove('visible'); if (this.lootTimer <= 0) document.querySelector('#loot-toast').classList.remove('visible'); if (this.hurtTimer <= 0) document.querySelector('#hurt-vignette').classList.remove('active');
    this.hp.style.width = `${p.hp / stats.hp * 100}%`; this.energy.style.width = `${p.energy/stats.energyMax*100}%`; this.stamina.style.width = `${p.stamina}%`;
    if (this.frame % 6 === 0) {
      const ward=document.querySelector('#shield-status');ward.hidden=this.state.vitality.level===0;document.querySelector('#shield-fill').style.background=this.state.vitality.color;document.querySelector('#shield-fill').style.width=`${this.state.vitality.capacity?p.shield/this.state.vitality.capacity*100:0}%`;document.querySelector('#shield-label').textContent=`长生 ${this.state.vitality.level} · 护罩 ${Math.ceil(p.shield)} / ${this.state.vitality.capacity}${p.shieldDelay>0?' · '+Math.ceil(p.shieldDelay)+'s':''}`;document.querySelector('#energy-label').textContent=`灵力 ${Math.floor(p.energy)} / ${stats.energyMax} · 灵息 ${this.state.spirit.level}`;
      document.querySelector('#hp-label').textContent = `${Math.ceil(p.hp)} / ${stats.hp}`; document.querySelector('#hero-level').textContent = s.level; document.querySelector('#hero-gold').textContent = `${s.gold} 灵石`;
      document.querySelector('#xp-fill').style.width = `${s.xp / (s.level * 95) * 100}%`;
      const o = this.state.objective(); document.querySelector('#quest-title').textContent = o.title; document.querySelector('#quest-text').textContent = o.text; document.querySelector('#quest-distance').textContent = `${Math.round(this.game.guide?.distance||Math.hypot(p.x-o.x,p.z-o.z))} m · ${this.game.settings.route!==false?'沿光带前进':'路线已隐藏'}`;
      const prompt = document.querySelector('#interact-prompt'); prompt.hidden = !this.state.nearby; if (this.state.nearby) prompt.querySelector('span').textContent = this.state.nearby.name;
      const cycle=this.state.cycle,cycleHUD=document.querySelector('#world-cycle');cycleHUD.classList.toggle('is-night',cycle.enraged);cycleHUD.querySelector('span').textContent=cycle.name+' '+String(Math.floor(cycle.hour)).padStart(2,'0')+':'+String(Math.floor(cycle.hour%1*60)).padStart(2,'0');cycleHUD.querySelector('small').textContent=cycle.enraged?'赤目 · 狂暴':'昼夜流转';cycleHUD.title='一昼夜约 6 分钟；夜间敌人伤害 +30%、追击速度 +22%、攻击恢复加快。';
      document.querySelector('#map-region').textContent = zoneAt(p.x,p.z).name; this.drawMap();
      const g=this.state.growth;const form=document.querySelector('#attack-form');form.textContent=`${this.state.kind==='sword'?swordEvolution(g.stacks).name:g.name} · ${g.shots} 重追击`;form.style.color=`${g.color}`;document.querySelector('#fervor-count').textContent=`锋芒 ${g.stacks} 层 · ${g.echoes} 枚${g.spiritName}`;document.querySelector('#fervor-progress').style.setProperty('--fill',`${g.stacks===MAX_FERVOR?100:g.stacks%5*20}%`);document.querySelector('#route-toggle').setAttribute('aria-pressed',String(this.game.settings.route!==false));const shot=document.querySelector('#skill-shot');shot.hidden=!this.game.skillCamera.label;document.querySelector('#skill-shot-label').textContent=this.game.skillCamera.label;document.querySelector('#target-status').textContent=this.state.lockedTarget?`锁定 · ${this.state.lockedTarget.name}`:'';
      document.querySelector('#performance-readout').textContent = `${Math.round(fps)} FPS`;
      const battle=this.state.encounters.status(),battleHUD=document.querySelector('#encounter-status');battleHUD.hidden=!battle;
      if(battle){const alive=this.state.enemies.filter(e=>e.encounter===battle.encounter.id&&e.hp>0);battleHUD.querySelector('span').textContent=`${battle.encounter.name} · 第 ${Math.max(1,battle.wave+1)} / ${battle.waves.length} 波`;battleHUD.querySelector('small').textContent=`敌境 Lv.${battle.encounter.level+s.challenge*2} · ${alive.length} 敌人${alive.some(e=>e.elite)?' · 精英 '+alive.filter(e=>e.elite).length:''}${battle.nextIn>=0?' · 援军将至':''}`;}
      [...this.skillButtons, document.querySelector('#heal-button')].forEach((b,i) => {
        const skill=SKILLS[i],time=skill?p.cooldowns[i]:p.potion,duration=skill?skill.cooldown*(1-stats.haste):18,locked=skill?.unlockLevel>s.level;
        const hasTarget=i>=3?this.state.enemies.some(e=>e.hp>0&&e.state!=='return'&&(e.spawnGrace||0)<=0&&Math.hypot(e.x-p.x,e.z-p.z)<=32):!!this.state.lockedTarget;
        const unavailable=skill?(locked||(i>=3&&this.state.awakening.active)||p.energy<skill.cost||!hasTarget||time>.1):(p.hp>=stats.hp||time>.1);
        b.querySelector('.cooldown-mask').style.height=`${time/duration*100}%`;b.querySelector('.cooldown-text').textContent=locked?`Lv.${skill.unlockLevel}`:time>.1?time.toFixed(time<1?1:0):'';
        b.classList.toggle('unavailable',unavailable);b.classList.toggle('locked',locked);b.setAttribute('aria-disabled',String(unavailable));
        if(i>=3)b.classList.toggle('awakening-ready',!unavailable);
      });
      const boss = this.state.boss, element = document.querySelector('.boss-status'); element.hidden = !boss || boss.hp <= 0; if (boss) { document.querySelector('#boss-fill').style.width = `${boss.hp / boss.maxHp * 100}%`; document.querySelector('#boss-phase').textContent = ['第一式 · 守界','第二式 · 星陨','终式 · 万象俱灭'][boss.phase]; }
    }
    const width = this.game.container.clientWidth, height = this.game.container.clientHeight;
    for (const n of this.numbers) if (n.age <= 1.1) {
      n.age += dt; this.project.set(n.x,n.height+n.age*1.5,n.z).project(this.game.camera); n.element.style.transform = `translate(${(this.project.x*.5+.5)*width}px,${(-this.project.y*.5+.5)*height}px) translate(-50%,-50%)`; n.element.style.opacity = String(Math.min(1,(1.1-n.age)*3)); n.element.hidden=n.age>1.1||this.project.z>1||this.project.z< -1;
    }
    let labelCount=0;
    for(let pass=0;pass<2;pass++)for (const e of this.state.enemies) {
      if((e===this.state.lockedTarget)!==(pass===0))continue;
      let label = this.enemyLabels.get(e.id);
      if(e.hp<=0){if(label){label.remove();this.enemyLabels.delete(e.id);}continue;}
      if (!label) { label = document.createElement('div'); label.className = 'enemy-label'+(e.elite?' elite-label':''); label.innerHTML = `<span>${e.elite?'◆ 精英 · ':''}${e.name} <em>Lv.${e.level}</em></span>${e.elite?`<small>${e.trait}</small>`:''}<div><i></i></div>`;if(e.elite)label.style.setProperty('--elite',e.color); document.querySelector('#damage-layer').append(label); this.enemyLabels.set(e.id,label); }
      this.project.set(e.x,heightAt(e.x,e.z)+2.45*e.scale,e.z).project(this.game.camera); const visible = e.hp > 0 && e.type !== 'boss' && Math.hypot(e.x-p.x,e.z-p.z)<18 && Math.abs(this.project.x)<1 && Math.abs(this.project.y)<1&&this.project.z<1&&this.project.z> -1;
      label.hidden = !visible; if (visible) {
        const x=(this.project.x*.5+.5)*width,y=(-this.project.y*.5+.5)*height,half=e.elite?82:54,h=e.elite?42:25;
        let compact=false;for(let i=0;i<labelCount;i++){const j=i*4;if(x+half>this.labelRects[j]&&x-half<this.labelRects[j+2]&&y>this.labelRects[j+1]&&y-h<this.labelRects[j+3]){compact=true;break;}}
        if(!compact&&labelCount<32){const j=labelCount++*4;this.labelRects[j]=x-half;this.labelRects[j+1]=y-h;this.labelRects[j+2]=x+half;this.labelRects[j+3]=y;}
        label.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`; label.querySelector('i').style.width=`${e.hp/e.maxHp*100}%`; label.classList.toggle('enraged-label',e.nightRage>=.5);label.classList.toggle('frozen',e.frozen>0);label.classList.toggle('compact-label',compact);
      }
    }
  }
}
