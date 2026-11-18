import { REALMS, realmReward } from './RealmData.js';

function returnToCamp(ui) {
  if(!ui.state.realms.leave()) return;
  ui.game.handleEvents();
  ui.game.save();
  ui.close();
}

export function openRealmAtlas(ui) {
  const state=ui.state, journey=state.realms;
  if(state.dead || ui.game.lootReveal?.active || state.awakening.active) return;
  const canEnter=!journey.realm && state.gear.canTrade();
  const cards=REALMS.map(realm=>{
    const victories=journey.progress.wins[realm.id];
    const reward=realmReward(realm,!victories,state.save.challenge);
    const saved=realm.nodes.filter((_,index)=>journey.progress.marks[realm.id]&(1<<index)).length;
    const status=journey.realm===realm?'当前秘境':saved?'机关 '+saved+'/'+realm.nodes.length:victories?'已通关 '+victories+' 次':'';
    const action=journey.realm===realm?'查看境内地图':journey.realm?'从灯台启程':canEnter?(saved?'继续挑战':'进入秘境'):'引路至灯台';
    return `<article class="realm-card" style="--realm-color:${realm.color}">
      <div class="realm-cover"><img src="${import.meta.env.BASE_URL}game/art/realms/${realm.id}.webp" alt=""><span>建议 Lv.${realm.level+state.save.challenge*2}</span>${status?`<small>${status}</small>`:''}</div>
      <div class="realm-card-body"><h2>${realm.name}</h2><p>${realm.summary}</p>
        <div class="realm-reward"><span>${victories?'再临':'首通'}</span> ${reward.gold} 灵石 · ${reward.xp} 历练</div>
        <button data-enter-realm="${realm.id}" aria-label="${action} · ${realm.name}" ${journey.realm&&journey.realm!==realm?'disabled':''}>${action}<span aria-hidden="true">↗</span></button>
      </div></article>`;
  }).join('');
  const detail=journey.realm?'已完成的机关会保留，返回灯台即可选择另一处秘境。':canEnter?'选择一处秘境，自灯台渡行。完成机关后，将迎战此境镇守。':'从安全灯台进入。可选择下方引路，返回最近已解锁的灯台。';
  ui.open(`<div class="realm-heading"><h1>山海秘境</h1><p>${detail}</p></div><div class="realm-cards">${cards}</div>
    ${journey.realm?'<div class="realm-actions"><button data-realm-return>返回灯台</button></div>':''}`,'realm-dialog');
  for(const button of ui.dialog.querySelectorAll('[data-enter-realm]')){
    button.onclick=()=>{
      if(journey.realm){openRealmMap(ui);return;}
      if(!state.gear.canTrade()){
        journey.guideCamp=journey.nearestCamp();
        ui.game.configure({route:true});ui.game.guide.update(state.time);
        ui.close();return;
      }
      if(journey.enter(button.dataset.enterRealm)){
        ui.game.handleEvents();ui.game.save();ui.close();
      }
    };
  }
  const back=ui.dialog.querySelector('[data-realm-return]');
  if(back)back.onclick=()=>returnToCamp(ui);
}

export function openRealmMap(ui) {
  const journey=ui.state.realms, realm=journey.realm, progress=journey.progress;
  const first=progress.wins[realm.id]===1;
  const reward=realmReward(realm,first,ui.state.save.challenge);
  const nodes=realm.nodes.map((node,index)=>{
    const done=progress.finished||journey.marked(index);
    return `<li data-done="${done}"><b aria-hidden="true">${done?'◆':'◇'}</b> ${node.name}<small>${done?'已完成':realm.id==='stars'&&index!==journey.nextIndex()?'待接续':'待完成'}</small></li>`;
  }).join('');
  ui.open(`<h1>${realm.name}</h1><div class="atlas-content realm-map" style="--realm-color:${realm.color}">
    <div><canvas id="large-map" width="1440" height="920" aria-label="${realm.name}境内地图"></canvas>
    <div class="map-legend"><span>◈ 当前位置</span><span>◇ 机关</span><span>✦ 返程渡口</span></div></div>
    <section><h2>${progress.finished?'秘境已通关':realm.action}</h2><p>${realm.tactic}</p><ul>${nodes}</ul>
    <p>${progress.finished?`${first?'首通':'再临'}奖励已领取 · ${reward.gold} 灵石 · ${reward.xp} 历练`:'机关进度随旅途自动保存。'}</p>
    <button data-realm-return>返回灯台</button><button data-realm-resume>继续探索</button></section></div>`,'wide-dialog atlas-dialog');
  ui.drawMap(ui.dialog.querySelector('canvas'));
  ui.dialog.querySelector('[data-realm-return]').onclick=()=>returnToCamp(ui);
  ui.dialog.querySelector('[data-realm-resume]').onclick=()=>ui.close();
}
