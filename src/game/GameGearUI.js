import { equipmentIcon,equipmentProfile } from './EquipmentCatalog.js';
import { GEAR_SLOTS,GEAR_RARITIES,GEAR_CAPACITY,gearName,gearStats,gearSellValue,enhancementInfo,cultivationCost } from './GearData.js';

const labels={hp:'生命',damage:'攻击',speed:'移速',attackSpeed:'攻速',regen:'回灵 / 秒',energyMax:'灵力上限'};
const format=(key,n)=>['speed','attackSpeed'].includes(key)?`${(n*100).toFixed(1)}%`:key==='regen'?n.toFixed(1):Math.round(n);
export const gearIcon=(item)=>{const slot=typeof item==='string'?item:item.slot,id=typeof item==='string'?slot+'-v1':equipmentIcon(item);return `<img class="gear-icon" src="${import.meta.env.BASE_URL}game/art/equipment/${id}.webp" alt="${GEAR_SLOTS[slot].name}">`;}

export class GameGearUI{
  constructor(ui){this.ui=ui;this.s=ui.state;this.mode='bag';this.filter='all';this.selected=null;this.feedback='';}
  inventory(){this.mode='bag';this.render();}
  shop(){this.mode='shop';this.render();}
  card(item,stock=false){
    const rarity=GEAR_RARITIES[item.rarity],equipped=!stock&&this.s.save.gearEquipped[item.slot]===item.uid,key=stock?item.stockId:item.uid;
    return `<button class="gear-card ${key===this.selected?'selected':''}" data-gear-select="${key}" style="--gear-rarity:${rarity.color}">${gearIcon(item)}<div><small>${rarity.name} · Lv.${item.level}${equipped?' · 已穿戴':''}${item.locked?' · 锁定':''}</small><strong>${gearName(item)}</strong><span>${Object.entries(gearStats(item)).map(([k,v])=>`${labels[k]} +${format(k,v)}`).join(' · ')}</span></div>${stock?`<em>${item.sold?'售罄':item.price+' 灵石'}</em>`:`<b>+${item.enhance}</b>`}</button>`;
  }
  render(){
    const s=this.s,merchant=s.gear.canTrade(),stock=this.mode==='shop'?s.gear.stock():[],bag=s.save.gearBag;
    let list=this.mode==='shop'?stock:bag.slice().sort((a,b)=>b.rarity-a.rarity||b.enhance-a.enhance||b.level-a.level);
    if(this.filter!=='all')list=list.filter(g=>g.slot===this.filter);
    if(!list.some(g=>(this.mode==='shop'?g.stockId:g.uid)===this.selected))this.selected=list[0]?(this.mode==='shop'?list[0].stockId:list[0].uid):null;
    const item=list.find(g=>(this.mode==='shop'?g.stockId:g.uid)===this.selected),stats=s.stats;
    const head=`<header class="gear-header"><div><span class="kicker">FROSTBOUND / 装备与修行</span><h1>${this.mode==='shop'?'云游商会':this.mode==='forge'?'星炉淬炼':this.mode==='cultivate'?'三道同修':'随身行囊'}</h1></div><div class="gear-wallet"><small>持有灵石</small><strong>${s.save.gold.toLocaleString()}</strong><span>行囊 ${bag.length} / ${GEAR_CAPACITY}</span></div></header>`;
    const tabs=`<nav class="gear-tabs">${[['bag','行囊'],['shop','商店'],['forge','强化'],['cultivate','修行']].map(([key,name])=>`<button data-gear-tab="${key}" class="${this.mode===key?'active':''}">${name}</button>`).join('')}<button id="gear-relics">旧世遗物</button></nav>`;
    const attributes=`<div class="gear-attributes"><span>攻击 <b>${Math.round(stats.damage)}</b></span><span>生命 <b>${stats.hp}</b></span><span>移速 <b>${stats.speed.toFixed(2)}</b></span><span>攻速 <b>×${stats.attackSpeed.toFixed(2)}</b></span><span>回灵 <b>${stats.regen.toFixed(1)}/s</b></span><span>灵力 <b>${stats.energyMax}</b></span></div>`;
    const equipped=`<div class="gear-equipped">${Object.keys(GEAR_SLOTS).map(slot=>{const g=s.gear.find(s.save.gearEquipped[slot]);return `<button data-slot-select="${slot}" style="--gear-rarity:${g?GEAR_RARITIES[g.rarity].color:'#657e8c'}"><small>${GEAR_SLOTS[slot].name}</small>${gearIcon(g||slot)}<span>${g?gearName(g):'尚未穿戴'}</span></button>`;}).join('')}</div>`;
    const filters=`<div class="gear-filters">${[['all','全部'],...Object.entries(GEAR_SLOTS).map(([k,v])=>[k,v.name])].map(([key,name])=>`<button data-gear-filter="${key}" class="${this.filter===key?'active':''}">${name}</button>`).join('')}</div>`;
    const content=this.mode==='cultivate'?this.cultivation(merchant):`${this.mode==='bag'?equipped:''}${filters}<div class="gear-layout"><div class="gear-list">${list.map(g=>this.card(g,this.mode==='shop')).join('')||'<div class="gear-empty">行囊尚空<br><small>击败敌人拾取装备，或到灯台商会购买。</small></div>'}</div>${this.detail(item,merchant)}</div>`;
    this.ui.open(`${head}${tabs}${attributes}<p class="gear-feedback ${this.feedback?'has-message':''}" role="status">${this.feedback||((this.mode==='shop'||this.mode==='forge'||this.mode==='cultivate')?(merchant?'灯台商会已开放 · 离开前记得整备':'靠近安全的灯台可购买、强化与修行；回收装备可随时进行。'):'行囊满时，高品质掉落优先替换未穿戴、未锁定且未强化的低品质装备。')}</p>${content}`,'gear-dialog');
    const d=this.ui.dialog;
    d.querySelectorAll('[data-gear-tab]').forEach(b=>b.onclick=()=>{this.mode=b.dataset.gearTab;this.feedback='';this.render();});
    d.querySelector('#gear-relics').onclick=()=>this.ui.relicInventory();
    d.querySelectorAll('[data-gear-select]').forEach(b=>b.onclick=()=>{this.selected=b.dataset.gearSelect;this.feedback='';this.render();});
    d.querySelectorAll('[data-gear-filter]').forEach(b=>b.onclick=()=>{this.filter=b.dataset.gearFilter;this.render();});
    d.querySelectorAll('[data-slot-select]').forEach(b=>b.onclick=()=>{this.filter=b.dataset.slotSelect;this.selected=s.save.gearEquipped[this.filter];this.render();});
    const act=(selector,fn)=>{const b=d.querySelector(selector);if(b)b.onclick=()=>{fn();this.ui.game.save();this.render();};};
    act('#gear-equip',()=>{if(s.gear.equip(item.uid))this.feedback='已穿戴 '+gearName(item);});
    act('#gear-unequip',()=>{s.gear.unequip(item.slot);this.feedback='装备已收回行囊。';});
    act('#gear-lock',()=>{if(s.gear.toggleLock(item.uid))this.feedback=item.locked?'装备已锁定，回收时会保留。':'装备锁定已解除。';});
    act('#gear-sell',()=>{const value=gearSellValue(item);if(s.gear.sell(item.uid))this.feedback=`回收完成，获得 ${value} 灵石。`;});
    act('#gear-buy',()=>{this.feedback=s.gear.buy(item.stockId)?'购买成功，装备已收入行囊。':'当前无法购买，请检查灵石、容量及商会位置。';});
    act('#gear-enhance',()=>{const r=s.gear.enhance(item.uid);this.feedback=!r.ok?r.reason:r.success?`淬炼成功！${gearName(item)} · 消耗 ${r.cost} 灵石`:`淬炼未成，保留 +${r.level}；消耗 ${r.cost} 灵石。`;if(r.ok)this.ui.game.audio.play(r.success?'level':'pickup');});
    d.querySelectorAll('[data-cultivate]').forEach(b=>b.onclick=()=>{if(s.gear.cultivate(b.dataset.cultivate)){this.feedback='修行提升成功。';this.ui.game.audio.play('level');}else this.feedback='当前无法提升，请检查灵石、层数及灯台位置。';this.ui.game.save();this.render();});
  }
  detail(item,merchant){
    if(!item)return '<aside class="gear-detail gear-empty">选择一件装备<br><small>查看属性、穿戴对比与强化结果</small></aside>';
    const rarity=GEAR_RARITIES[item.rarity],isShop=this.mode==='shop',equipped=!isShop&&this.s.save.gearEquipped[item.slot]===item.uid,info=enhancementInfo(item),next=gearStats({...item,enhance:info.next});
    const current=this.s.gear.find(this.s.save.gearEquipped[item.slot]),old=current?gearStats(current):{};
    const values=Object.entries(gearStats(item)).map(([key,v])=>{const diff=v-(old[key]||0);return `<div><span>${labels[key]}</span><b>+${format(key,v)}</b>${!equipped?`<small class="${diff>=0?'positive':'negative'}">${diff>=0?'+':''}${format(key,diff)}</small>`:''}</div>`;}).join('');
    return `<aside class="gear-detail" style="--gear-rarity:${rarity.color}"><div class="gear-showcase">${gearIcon(item)}<i></i></div><small class="gear-rarity">${rarity.name} · ${GEAR_SLOTS[item.slot].name} · 装备等级 ${item.level} · ${equipmentProfile(item).form}</small><h2>${gearName(item)}</h2><div class="gear-stat-lines">${values}</div><p class="gear-detail-note">${isShop?'购买后收入行囊，穿戴即可改变属性与角色外观。20／35 级或 +8／+16 进阶形制。':equipped?'当前已穿戴；强化成功后立即作用于角色。':'对比右侧数值为当前同部位装备的差值。'}</p>${isShop?`<button class="primary" id="gear-buy" ${!merchant||item.sold||this.s.save.gold<item.price||this.s.save.gearBag.length>=GEAR_CAPACITY?'disabled':''}>${item.sold?'已售罄':'购买 · '+item.price+' 灵石'}</button><small>库存每 5 分钟有效游戏时间更新</small>`:`<div class="gear-action-row"><button id="${equipped?'gear-unequip':'gear-equip'}" class="primary">${equipped?'卸下装备':'立即穿戴'}</button><button id="gear-lock" aria-pressed="${!!item.locked}">${item.locked?'解锁':'锁定'}</button><button id="gear-sell" ${equipped||item.locked?'disabled':''}>回收 +${gearSellValue(item)}</button></div><div class="forge-box"><div><strong>星炉强化 <em>${info.max?"+20 · 圆满":`+${item.enhance} → +${info.next}`}</em></strong><b>${info.max?"MAX":(info.chance*100).toFixed(1)+"%"}</b></div><div class="forge-steps">${['浅蓝','湛蓝','流紫','绯红','鎏金'].map((n,i)=>`<span class="${item.enhance>=i*5?'lit':''}" style="--forge-color:${['#b9ecff','#399bff','#a561ff','#ff3d65','#ffc85c'][i]}">${n}<small>+${i*5}</small></span>`).join('')}</div><p>${info.max?'已达最高强化等级':Object.entries(next).map(([k,v])=>`${labels[k]} +${format(k,v)}`).join(' · ')}</p><button class="primary" id="gear-enhance" ${!merchant||info.max||this.s.save.gold<info.cost?'disabled':''}>${info.max?'强化圆满 · +20':'强化 · '+info.cost+' 灵石'}</button><small>成功率为本次实际概率。失败保留等级；消耗不返还。</small></div>`}</aside>`;
  }
  cultivation(merchant){
    return `<div class="gear-cultivation">${[['power','锋芒','攻击与灵锋','weapon'],['vitality','长生','生命与护罩','armor'],['spirit','灵息','灵力与技能','cloak']].map(([id,name,sub,icon])=>{const n=this.s.save.boons[id],cost=cultivationCost(id,n);return `<article>${gearIcon(icon)}<small>${sub}</small><h2>${name} <span>${n} 层</span></h2>${this.ui.cultivationPreview(id)}<button class="primary" data-cultivate="${id}" ${!merchant||n>=50||this.s.save.gold<cost?'disabled':''}>${n>=50?'此道圆满':`提升 · ${cost} 灵石`}</button></article>`;}).join('')}</div>`;
  }
}
