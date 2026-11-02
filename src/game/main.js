import './game.css';
import './title.css';
import './enhancements.css';
import { CLASSES, SETTINGS_KEY } from './GameData.js';
import { readSave } from './GameState.js';
import { itemIcon } from './GameIcons.js';
import { TitleAtmosphere } from './TitleAtmosphere.js';
import { gameMusic } from './GameMusic.js';

const save=readSave(localStorage),backup=readSave(localStorage,'frostbound.rpg.backup');let selected=save?.kind||'sword',game=null;
let settings={quality:'auto',volume:.45,musicMuted:false,route:true,skillCamera:true,shake:!matchMedia('(prefers-reduced-motion: reduce)').matches};
try{const stored=JSON.parse(localStorage.getItem(SETTINGS_KEY));if(stored){if(['auto','high','medium','low'].includes(stored.quality))settings.quality=stored.quality;settings.volume=Math.max(0,Math.min(1,Number(stored.volume)||0));settings.shake=stored.shake!==false;settings.route=stored.route!==false;settings.skillCamera=stored.skillCamera!==false;settings.musicMuted=stored.musicMuted===true;}}catch{}
document.querySelector('#app').innerHTML=`
  <section id="title-screen"><div class="title-scene" aria-hidden="true"><div class="title-art"></div><div class="title-sanctuary-glow"></div><div class="title-mist title-mist-far"></div><canvas class="title-dust"></canvas><div class="title-foreground"></div><div class="title-mist title-mist-near"></div></div><div class="title-shade"></div><header class="title-header"><a href="index.html">✧ FROSTBOUND <span>技能实验室</span></a><span class="title-edition">归墟纪 · 壹 / 单人修行</span></header><div class="title-content"><span class="title-eyebrow">BEYOND THE SEA OF STARS</span><h1>霜界</h1><h2>归墟之门</h2><p class="title-description">诸星沉寂之后，仍有一盏灯为你而亮。<br>穿过听雪林，唤醒古老的封印，寻回失落的天光。</p><div class="class-label">选择你的修行之道 <span>三种流派，共赴归墟</span></div><div class="class-select" role="group" aria-label="选择流派">${Object.entries(CLASSES).map(([id,c])=>`<button data-class="${id}" aria-pressed="${id===selected}"><span class="class-relic" aria-hidden="true">${itemIcon(c.icon)}<span class="relic-glints"><i></i><i></i><i></i></span></span><strong>${c.name}</strong><small>${c.title}</small></button>`).join('')}</div><p id="class-description">${CLASSES[selected].description}</p><div class="start-actions">${save?`<button id="continue-game" class="primary">继续旅途 <span>Lv.${save.level} · ${CLASSES[save.kind].name} →</span></button>`:''}<button id="new-game" class="${save?'secondary':'primary'}">${save?'开启新的旅途':'踏入霜界'}<span>→</span></button></div>${backup?`<button id="restore-game" class="restore-game">切换上一旅途 · Lv.${backup.level} ${CLASSES[backup.kind].name} ↗</button>`:''}<div class="title-meta"><span>WASD 移动</span><i></i><span>自动索敌</span><i></i><span>耳机体验更佳</span></div></div><footer class="title-footer"><span>三座群岛 / 两道封印 / 一场未竟的轮回</span><div class="title-utilities"><div class="music-control"><button id="music-toggle" aria-label="开启国风背景音乐"><span class="music-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span id="music-label">聆听 · 荷塘清音</span></button><input id="title-volume" type="range" min="0" max="1" step=".05" aria-label="背景音量" value="${settings.volume}"></div><button id="credits-button">制作与素材</button></div></footer></section>
  <main id="game-screen" hidden><div id="game-world"></div><div id="game-hud" hidden></div><div id="game-loading" hidden><div class="loading-sigil">✧</div><h2>山海将启</h2><p id="game-loading-text">准备场景…</p><div class="loading-line"><i></i></div></div></main><dialog id="game-dialog"></dialog><dialog id="title-dialog"></dialog>`;
document.querySelectorAll('[data-class]').forEach(b=>b.onclick=()=>{selected=b.dataset.class;document.querySelectorAll('[data-class]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));document.querySelector('#class-description').textContent=CLASSES[selected].description;});
const atmosphere=new TitleAtmosphere(document.querySelector('#title-screen'));
gameMusic.configure(settings.volume,settings.musicMuted);
const persistSettings=()=>{try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}};
const updateMusic=()=>{const playing=!gameMusic.audio.paused&&!gameMusic.muted&&gameMusic.volume>0;const button=document.querySelector('#music-toggle');button.classList.toggle('playing',playing);button.setAttribute('aria-pressed',String(playing));button.setAttribute('aria-label',playing?'静音背景音乐':'播放国风背景音乐');document.querySelector('#music-label').textContent=playing?'荷塘清音 · 正在播放':'聆听 · 荷塘清音';};
gameMusic.listeners.add(updateMusic);updateMusic();
document.querySelector('#music-toggle').onclick=()=>{settings.musicMuted=!gameMusic.audio.paused&&!gameMusic.muted&&settings.volume>0;if(!settings.musicMuted&&settings.volume===0){settings.volume=.45;document.querySelector('#title-volume').value=.45;}gameMusic.configure(settings.volume,settings.musicMuted);if(!settings.musicMuted)gameMusic.start();persistSettings();};
document.querySelector('#title-volume').oninput=e=>{settings.volume=Number(e.target.value);settings.musicMuted=false;gameMusic.configure(settings.volume,false);gameMusic.start();persistSettings();};
const unlockMusic=e=>{if(e.target.closest?.('.music-control'))return;gameMusic.start();document.removeEventListener('pointerdown',unlockMusic);};document.addEventListener('pointerdown',unlockMusic);
async function start(saved){
  atmosphere.dispose();gameMusic.start();
  document.querySelector('#title-screen').hidden=true;document.querySelector('#game-screen').hidden=false;document.querySelector('#game-loading').hidden=false;
  try{const{RPGGame}=await import('./RPGGame.js');game=new RPGGame(saved?.kind||selected,saved,settings);window.__rpg=game;await game.load();}
  catch(error){console.error(error);document.querySelector('#game-loading').innerHTML='<h2>旅途暂未开启</h2><p id="load-error"></p><a class="primary" href="game.html">重新准备</a>';document.querySelector('#load-error').textContent=error.message;}
}
document.querySelector('#new-game').onclick=()=>{
  if(!save)return start(null);
  const d=document.querySelector('#title-dialog');d.innerHTML='<span class="kicker">新的旅途</span><h2>开始一场新的修行？</h2><p>当前进度将备份到本地，新旅途会成为默认存档。</p><div class="dialog-buttons"><button class="primary" id="confirm-new">开始新旅途</button><button id="cancel-new">保留当前旅途</button></div>';d.showModal();d.querySelector('#cancel-new').onclick=()=>d.close();d.querySelector('#confirm-new').onclick=()=>{try{localStorage.setItem('frostbound.rpg.backup',JSON.stringify(save));}catch{}d.close();start(null);};
};
if(save)document.querySelector('#continue-game').onclick=()=>start(save);
if(backup)document.querySelector('#restore-game').onclick=()=>{
  const d=document.querySelector('#title-dialog');d.innerHTML=`<span class="kicker">旅途仍在</span><h2>切换至 ${CLASSES[backup.kind].name}？</h2><p>等级 ${backup.level} · 已解除 ${backup.seals.filter(Boolean).length} 道封印。当前旅途会保留为上一份存档，可再次切回。</p><div class="dialog-buttons"><button class="primary" id="confirm-restore">继续这场旅途</button><button id="cancel-restore">暂不切换</button></div>`;d.showModal();d.querySelector('#cancel-restore').onclick=()=>d.close();d.querySelector('#confirm-restore').onclick=()=>{try{if(save)localStorage.setItem('frostbound.rpg.backup',JSON.stringify(save));}catch{}d.close();start(backup);};
};
document.querySelector('#credits-button').onclick=()=>{const d=document.querySelector('#title-dialog');d.innerHTML='<span class="kicker">CRAFTED FOR FROSTBOUND</span><h2>世界的来处</h2><p>原创分层仙境主视觉、云雾、松枝风铃、道具图集与星环灯台概念：内置 ImageGen。武器与灯台：图生 3D 后优化。角色与动作：用户提供的 Mixamo 素材及 Three.js 官方 Mixamo 示例。植被、岩石与遗迹：Quaternius Stylized Nature MegaKit 与 Ultimate Modular Ruins，CC0。</p><p>背景音乐：BiteMe Games《Lotus Pond》，古筝与笛乐，来自 <a href="https://bitemegames.itch.io/chinese-game-music" target="_blank" rel="noopener">Chinese Game Music</a> 免费游戏配乐包。战斗与光影实时运行，音乐在本地播放。无需登录，存档保存在当前浏览器。</p><button class="primary" id="credits-close">返回</button>';d.showModal();d.querySelector('#credits-close').onclick=()=>d.close();};
window.addEventListener('beforeunload',()=>{atmosphere.dispose();game?.dispose();gameMusic.dispose();});
if(save&&new URLSearchParams(location.search).has('continue'))start(save);
