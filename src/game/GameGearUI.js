import { equipmentIcon,equipmentProfile } from './EquipmentCatalog.js';
import { GEAR_SLOTS,GEAR_RARITIES,GEAR_CAPACITY,TAICHU_RARITY,TAICHU_SET_SIZE,gearName,gearStats,gearSellValue,enhancementInfo,enhancementStyle,cultivationCost } from './GearData.js';

const labels={hp:'生命',damage:'攻击',speed:'移速',attackSpeed:'攻速',regen:'回灵 / 秒',energyMax:'灵力上限'};
const format=(key,n)=>['speed','attackSpeed'].includes(key)?`${(n*100).toFixed(1)}%`:key==='regen'?n.toFixed(1):Math.round(n);
export function gearIcon(item) {
  const placeholder = typeof item === 'string';
  const slot = placeholder ? item : item.slot;
  const id = placeholder ? slot+'-v1' : equipmentIcon(item);
  const icon = `<img class="gear-icon" src="${import.meta.env.BASE_URL}game/art/equipment/${id}.webp" alt="${GEAR_SLOTS[slot].name}">`;
  if (placeholder) return icon;
  const phase = (-.31*((Number(item.uid?.slice(1)) || item.level) % 13)).toFixed(2);
  const stars = '<i></i>'.repeat(item.rarity === TAICHU_RARITY ? 4 : item.rarity === 2 ? 3 : 2);
  return `<span class="gear-icon-shell" data-slot="${slot}" data-rarity="${item.rarity}"
    style="--glint-color:${GEAR_RARITIES[item.rarity].color};--glint-phase:${phase}s">${icon}
    <span class="equipment-glints" aria-hidden="true">${stars}</span>
  </span>`;
}

export function gearNameMarkup(item) {
  const name = gearName(item);
  return item.rarity === TAICHU_RARITY ? `<span class="taichu-name">${name}</span>` : name;
}

export class GameGearUI{
  constructor(ui){
    this.ui=ui;this.s=ui.state;this.mode='bag';this.filter='all';this.selected=null;this.feedback='';
    this.saleSelection = new Set();
  }
  openMode(mode){
    if(this.mode!==mode){
      this.saleSelection.clear();
      this.confirmSale=false;
      this.forgeOutcome='';
      this.feedback='';
    }
    this.mode=mode;
    this.render();
  }
  inventory(){this.openMode('bag');}
  shop(){this.openMode('shop');}
  card(item,stock=false){
    const rarity=GEAR_RARITIES[item.rarity],equipped=!stock&&this.s.save.gearEquipped[item.slot]===item.uid,key=stock?item.stockId:item.uid;
    const taichuSlot = this.mode==='bag' && item.rarity===TAICHU_RARITY;
    return `<button class="gear-card ${key===this.selected?'selected':''}${taichuSlot?' taichu-slot':''}" data-gear-select="${key}" style="--gear-rarity:${rarity.color}">${gearIcon(item)}<div><small>${rarity.name} · Lv.${item.level}${equipped?' · 已穿戴':''}${item.locked?' · 锁定':''}</small><strong>${gearNameMarkup(item)}</strong><span>${Object.entries(gearStats(item)).map(([k,v])=>`${labels[k]} +${format(k,v)}`).join(' · ')}</span></div>${stock?`<em>${item.sold?'售罄':item.price+' 灵石'}</em>`:`<b>+${item.enhance}</b>`}</button>`;
  }
  saleCard(item) {
    const eligible = this.s.gear.canSell(item);
    const reason = item.locked ? '已锁定' : !eligible ? '已穿戴' : '';
    const rarity = GEAR_RARITIES[item.rarity];
    return `<label class="gear-card sale-card" style="--gear-rarity:${rarity.color}">
      <input type="checkbox" data-sale-item="${item.uid}" aria-label="选择 ${gearName(item)}" ${eligible?'':'disabled'} ${this.saleSelection.has(item.uid)?'checked':''}>
      ${gearIcon(item)}<div><small>${rarity.name} · Lv.${item.level}${reason ? ' · '+reason : ''}</small><strong>${gearNameMarkup(item)}</strong></div>
      <em>${gearSellValue(item).toLocaleString()} 灵石</em>
    </label>`;
  }
  salePanel() {
    const {items,value} = this.s.gear.saleQuote(this.saleSelection);
    const special = items.filter(item => item.enhance > 0 || item.rarity === TAICHU_RARITY);
    if (this.confirmSale && items.length) {
      const names = special.slice(0,3).map(gearName).join('、');
      return `<small>核对出售</small><h2>出售 ${items.length} 件装备</h2>${items.length===1?`<p>${gearNameMarkup(items[0])}</p>`:''}<p>将获得 <b>${value.toLocaleString()}</b> 灵石。</p>
        ${special.length?`<p class="sale-special">含 ${special.length} 件强化或太初装备。${names}</p>`:''}
        <div class="gear-action-row"><button class="primary" id="sale-confirm">确认出售</button><button id="sale-cancel">返回选择</button></div>`;
    }
    return `<small>出售清单</small><h2>已选 ${items.length} 件</h2><p>预计获得 <b>${value.toLocaleString()}</b> 灵石</p>
      ${items.length?`<ol>${items.slice(0,4).map(item=>`<li>${gearNameMarkup(item)}</li>`).join('')}${items.length>4?`<li>另有 ${items.length-4} 件</li>`:''}</ol>`:'<p>勾选要出售的装备。</p>'}
      <button class="primary" id="sale-review" ${items.length?'':'disabled'}>核对并出售</button>`;
  }
  wireSale(d) {
    const checkboxes = [...d.querySelectorAll('[data-sale-item]')];
    const visible = checkboxes.filter(input=>!input.disabled);
    const aside = d.querySelector('#gear-sale-summary');
    const refresh = () => {
      for (const input of checkboxes) input.checked = this.saleSelection.has(input.dataset.saleItem);
      d.querySelector('#sale-clear').disabled = !this.saleSelection.size;
      aside.innerHTML = this.salePanel();
      const review = aside.querySelector('#sale-review');
      if (review) review.onclick = () => { this.confirmSale=true;refresh();aside.querySelector('#sale-confirm')?.focus(); };
      const confirm = aside.querySelector('#sale-confirm');
      if (!confirm) return;
      confirm.onclick = () => {
        const quote = this.s.gear.sellMany(this.saleSelection);
        this.saleSelection.clear();
        this.confirmSale=false;
        this.feedback=quote.items.length?`已出售 ${quote.items.length} 件，获得 ${quote.value.toLocaleString()} 灵石。`:'所选装备当前无法出售。';
        this.ui.game.save();
        if (!this.ui.game.saveBlocked) this.render();
      };
      aside.querySelector('#sale-cancel').onclick = () => { this.confirmSale=false;refresh();aside.querySelector('#sale-review')?.focus(); };
    };
    for (const input of visible) input.onchange = () => {
      if (input.checked) this.saleSelection.add(input.dataset.saleItem);
      else this.saleSelection.delete(input.dataset.saleItem);
      this.confirmSale=false;refresh();
    };
    d.querySelector('#sale-all').onclick = () => {
      for (const input of visible) this.saleSelection.add(input.dataset.saleItem);
      this.confirmSale=false;refresh();
    };
    d.querySelector('#sale-invert').onclick = () => {
      for (const input of visible) {
        const uid=input.dataset.saleItem;
        if (!this.saleSelection.delete(uid)) this.saleSelection.add(uid);
      }
      this.confirmSale=false;refresh();
    };
    d.querySelector('#sale-clear').onclick = () => { this.saleSelection.clear();this.confirmSale=false;refresh(); };
    refresh();
  }
  inheritance(merchant) {
    const gear = this.s.gear;
    const sources = this.s.save.gearBag.filter(item => item.rarity===TAICHU_RARITY && item.enhance>0);
    const source = sources.find(item => item.uid===this.inheritSource) ||
      sources.find(item => gear.inheritanceTargets(item).length) || sources[0];
    const targets = gear.inheritanceTargets(source);
    const target = targets.find(item => item.uid===this.inheritTarget) || targets[0];
    const options = (items, selected) => items.map(item =>
      `<option value="${item.uid}" ${item===selected?'selected':''}>Lv.${item.level} · ${gearName(item)}</option>`).join('');
    const preview = (item, after) => item ?
      `<div class="inherit-preview">${gearIcon(item)}<div><strong>${gearNameMarkup(item)}</strong><small>装备 Lv.${item.level} · ${GEAR_SLOTS[item.slot].name}</small><b>+${item.enhance} → +${after}</b></div></div>` :
      '<div class="inherit-empty">暂无符合条件的装备</div>';
    return `<section class="gear-inheritance">
      <p>同部位的太初装备可免费继承。承接装备须等级更高且强化为 +0。</p>
      <div class="inherit-columns">
        <article><label for="inherit-source">传出装备</label><select id="inherit-source" ${sources.length?'':'disabled'}>${options(sources,source)||'<option>暂无已强化的太初装备</option>'}</select>${preview(source,0)}</article>
        <article><label for="inherit-target">承接装备</label><select id="inherit-target" ${targets.length?'':'disabled'}>${options(targets,target)||'<option>暂无同部位的高等级 +0 太初装备</option>'}</select>${preview(target,source?.enhance||0)}</article>
      </div>
      <button class="primary" id="inherit-apply" ${!merchant||!target?'disabled':''}>确认继承${target?' · +'+source.enhance:''}</button>
    </section>`;
  }
  wireInheritance(dialog) {
    const source = dialog.querySelector('#inherit-source'), target = dialog.querySelector('#inherit-target');
    source.onchange = () => { this.inheritSource=source.value;this.inheritTarget=null;this.feedback='';this.render(); };
    target.onchange = () => { this.inheritTarget=target.value;this.feedback='';this.render(); };
    dialog.querySelector('#inherit-apply').onclick = () => {
      const result = this.s.gear.inherit(source.value,target.value);
      if (!result.ok) this.feedback=result.reason;
      else if (this.ui.game.save() === false) {
        result.source.enhance=result.rank;
        result.target.enhance=0;
        this.s.gear.changed();
        this.feedback='存档未写入，已恢复原强化等级。';
      } else {
        this.feedback=`继承完成 · ${gearName(result.target)} ，传出装备强化已归零。`;
        void this.ui.game.audio.loot.forge(true);
      }
      if (!this.ui.game.saveBlocked) this.render();
    };
  }
  render(){
    const s=this.s,merchant=s.gear.canTrade(),stock=this.mode==='shop'?s.gear.stock():[],bag=s.save.gearBag;
    let list=this.mode==='shop'?stock:bag.slice().sort((a,b)=>b.rarity-a.rarity||b.enhance-a.enhance||b.level-a.level);
    if(this.filter!=='all')list=list.filter(g=>g.slot===this.filter);
    if(!list.some(g=>(this.mode==='shop'?g.stockId:g.uid)===this.selected))this.selected=list[0]?(this.mode==='shop'?list[0].stockId:list[0].uid):null;
    const item=list.find(g=>(this.mode==='shop'?g.stockId:g.uid)===this.selected),stats=s.stats;
    const selling = this.mode === 'sell';
    const title={bag:'随身行囊',sell:'出售装备',shop:'云游商会',forge:'星炉淬炼',inherit:'太初强化继承',cultivate:'三道同修'}[this.mode];
    const head=`<header class="gear-header"><div><span class="kicker">FROSTBOUND / 装备与修行</span><h1>${title}</h1></div><div class="gear-wallet"><small>持有灵石</small><strong>${s.save.gold.toLocaleString()}</strong><span>行囊 ${bag.length} / ${GEAR_CAPACITY}</span></div></header>`;
    const tabs=`<nav class="gear-tabs">${[['bag','行囊'],['sell','出售'],['shop','商店'],['forge','强化'],['inherit','继承'],['cultivate','修行']].map(([key,name])=>`<button data-gear-tab="${key}" class="${this.mode===key?'active':''}">${name}</button>`).join('')}<button id="gear-relics">旧世遗物</button></nav>`;
    const attributes=`<div class="gear-attributes"><span>攻击 <b>${Math.round(stats.damage)}</b></span><span>生命 <b>${stats.hp}</b></span><span>移速 <b>${stats.speed.toFixed(2)}</b></span><span>攻速 <b>×${stats.attackSpeed.toFixed(2)}</b></span><span>回灵 <b>${stats.regen.toFixed(1)}/s</b></span><span>灵力 <b>${stats.energyMax}</b></span></div>`;
    const equipped=`<div class="gear-equipped">${Object.keys(GEAR_SLOTS).map(slot=>{const g=s.gear.find(s.save.gearEquipped[slot]);return `<button data-slot-select="${slot}" class="${g?.rarity===TAICHU_RARITY?'taichu-slot':''}" style="--gear-rarity:${g?GEAR_RARITIES[g.rarity].color:'#657e8c'}"><small>${GEAR_SLOTS[slot].name}</small>${gearIcon(g||slot)}<span>${g?gearNameMarkup(g):'尚未穿戴'}</span></button>`;}).join('')}</div>`;
    const setBonus=stats.taichuCount?`<div class="gear-set-bonus" data-active="${stats.taichu}"><strong>太初套装 <b>${stats.taichuCount}/${TAICHU_SET_SIZE}</b></strong><span>${stats.taichu?'已激活':'集齐生效'} · 攻击 +100% · 移动幻影 · 攻击 5% 概率召唤陨星</span></div>`:'';
    const filters=`<div class="gear-filters">${[['all','全部'],...Object.entries(GEAR_SLOTS).map(([k,v])=>[k,v.name])].map(([key,name])=>`<button data-gear-filter="${key}" class="${this.filter===key?'active':''}">${name}</button>`).join('')}</div>`;
    const selectable=selling&&list.some(g=>s.gear.canSell(g));
    const toolbar=selling?`<div class="sale-toolbar"><span>选择当前列表</span><button id="sale-all" ${selectable?'':'disabled'}>全选</button><button id="sale-invert" ${selectable?'':'disabled'}>反选</button><button id="sale-clear">清空已选</button></div>`:'';
    const rows=list.map(g=>selling?this.saleCard(g):this.card(g,this.mode==='shop')).join('');
    const content=this.mode==='inherit'?this.inheritance(merchant):this.mode==='cultivate'?this.cultivation(merchant):`${this.mode==='bag'?equipped+setBonus:''}${filters}${toolbar}<div class="gear-layout"><div class="gear-list">${rows||'<div class="gear-empty">当前分类没有装备</div>'}</div>${selling?'<aside class="gear-detail sale-summary" id="gear-sale-summary" aria-live="polite"></aside>':this.detail(item,merchant)}</div>`;
    const guidance = selling ? '已锁定或穿戴中的装备受保护。' :
      this.mode==='bag' ? '太初掉落自动锁定。' :
      merchant ? '灯台商会已开放' : '靠近安全的灯台可购买、强化、继承与修行。';
    this.ui.open(`${head}${tabs}${selling||this.mode==='inherit'?'':attributes}<p class="gear-feedback ${this.feedback?'has-message':''}" role="status">${this.feedback||guidance}</p>${content}`,'gear-dialog');
    const d=this.ui.dialog;
    d.querySelectorAll('[data-gear-tab]').forEach(b=>b.onclick=()=>this.openMode(b.dataset.gearTab));
    d.querySelector('#gear-relics').onclick=()=>this.ui.relicInventory();
    if (this.mode==='inherit') { this.wireInheritance(d); return; }
    d.querySelectorAll('[data-gear-select]').forEach(b=>b.onclick=()=>{this.selected=b.dataset.gearSelect;this.feedback='';this.forgeOutcome='';this.render();});
    d.querySelectorAll('[data-gear-filter]').forEach(b=>b.onclick=()=>{this.filter=b.dataset.gearFilter;this.confirmSale=false;this.render();});
    d.querySelectorAll('[data-slot-select]').forEach(b=>b.onclick=()=>{this.filter=b.dataset.slotSelect;this.selected=s.save.gearEquipped[this.filter];this.render();});
    if (selling) { this.wireSale(d); return; }
    const act=(selector,fn)=>{const b=d.querySelector(selector);if(b)b.onclick=()=>{fn();this.ui.game.save();if(!this.ui.game.saveBlocked)this.render();};};
    act('#gear-equip',()=>{if(s.gear.equip(item.uid))this.feedback='已穿戴 '+gearName(item);});
    act('#gear-unequip',()=>{s.gear.unequip(item.slot);this.feedback='装备已收回行囊。';});
    act('#gear-lock',()=>{if(s.gear.toggleLock(item.uid))this.feedback=item.locked?'装备已锁定，回收时会保留。':'装备锁定已解除。';});
    const sell = d.querySelector('#gear-sell');
    if (sell) sell.onclick = () => {
      if (!s.gear.canSell(item)) return;
      this.mode='sell';this.saleSelection=new Set([item.uid]);this.confirmSale=true;this.render();
      d.querySelector('#sale-confirm')?.focus();
    };
    act('#gear-buy',()=>{this.feedback=s.gear.buy(item.stockId)?'购买成功，装备已收入行囊。':'当前无法购买，请检查灵石、容量及商会位置。';});
    act('#gear-enhance',()=>{
      const r=s.gear.enhance(item.uid);
      this.feedback=!r.ok?r.reason:r.success?`强化成功 · ${gearName(item)} · 消耗 ${r.cost.toLocaleString()} 灵石`:`强化失败 · 保留 +${r.level} · 消耗 ${r.cost.toLocaleString()} 灵石`;
      this.forgeOutcome=r.ok?(r.success?'success':'failure'):'';
      if(r.ok)void this.ui.game.audio.loot.forge(r.success);
    });
    d.querySelectorAll('[data-cultivate]').forEach(b=>b.onclick=()=>{if(s.gear.cultivate(b.dataset.cultivate)){this.feedback='修行提升成功。';this.ui.game.audio.play('level');}else this.feedback='当前无法提升，请检查灵石、层数及灯台位置。';this.ui.game.save();this.render();});
  }
  detail(item,merchant){
    if(!item)return '<aside class="gear-detail gear-empty">选择一件装备<br><small>查看属性、穿戴对比与强化结果</small></aside>';
    const rarity=GEAR_RARITIES[item.rarity],isShop=this.mode==='shop',equipped=!isShop&&this.s.save.gearEquipped[item.slot]===item.uid,info=enhancementInfo(item),next=gearStats({...item,enhance:info.next});
    const forge=enhancementStyle(item.enhance);
    const current=this.s.gear.find(this.s.save.gearEquipped[item.slot]),old=current?gearStats(current):{};
    const values=Object.entries(gearStats(item)).map(([key,v])=>{const diff=v-(old[key]||0);return `<div><span>${labels[key]}</span><b>+${format(key,v)}</b>${!equipped?`<small class="${diff>=0?'positive':'negative'}">${diff>=0?'+':''}${format(key,diff)}</small>`:''}</div>`;}).join('');
    return `<aside class="gear-detail" style="--gear-rarity:${rarity.color}"><div class="gear-showcase" style="--forge-tint:color-mix(in srgb,${forge.from} ${100-forge.mix*100}%,${forge.to});--forge-halo:${Math.round(forge.power*5)}px">${gearIcon(item)}<i></i></div><small class="gear-rarity">${rarity.name} · ${GEAR_SLOTS[item.slot].name} · 装备等级 ${item.level} · ${equipmentProfile(item).form}</small><h2>${gearNameMarkup(item)}</h2><div class="gear-stat-lines">${values}</div><p class="gear-detail-note">${isShop?'购买后收入行囊，穿戴即可改变属性与角色外观。20／35 级或 +8／+16 进阶形制。':equipped?'当前已穿戴；强化成功后立即作用于角色。':'对比右侧数值为当前同部位装备的差值。'}</p>${isShop?`<button class="primary" id="gear-buy" ${!merchant||item.sold||this.s.save.gold<item.price||this.s.save.gearBag.length>=GEAR_CAPACITY?'disabled':''}>${item.sold?'已售罄':'购买 · '+item.price+' 灵石'}</button><small>库存每 5 分钟有效游戏时间更新</small>`:`<div class="gear-action-row"><button id="${equipped?'gear-unequip':'gear-equip'}" class="primary">${equipped?'卸下装备':'立即穿戴'}</button><button id="gear-lock" aria-pressed="${!!item.locked}">${item.locked?'解锁':'锁定'}</button><button id="gear-sell" ${equipped||item.locked?'disabled':''}>出售 +${gearSellValue(item).toLocaleString()}</button></div><div class="forge-box" data-result="${this.forgeOutcome||''}"><div><strong>星炉强化 <em>${info.max?"+20 · 圆满":`+${item.enhance} → +${info.next}`}</em></strong><b>${info.max?"MAX":(info.chance*100).toFixed(1)+"%"}</b></div><div class="forge-steps">${['浅蓝','湛蓝','流紫','绯红','鎏金'].map((n,i)=>`<span class="${item.enhance>=i*5?'lit':''}" style="--forge-color:${['#b9ecff','#399bff','#a561ff','#ff3d65','#ffc85c'][i]}">${n}<small>+${i*5}</small></span>`).join('')}</div><p>${info.max?'已达最高强化等级':Object.entries(next).map(([k,v])=>`${labels[k]} +${format(k,v)}`).join(' · ')}</p><button class="primary" id="gear-enhance" ${!merchant||info.max||this.s.save.gold<info.cost?'disabled':''}>${info.max?'强化圆满 · +20':'强化 · '+info.cost.toLocaleString()+' 灵石'}</button><small>强化等级越高，发光越亮。失败保留强化等级，仍消耗灵石。</small></div>`}</aside>`;
  }
  cultivation(merchant){
    return `<div class="gear-cultivation">${[['power','锋芒','攻击与灵锋','weapon'],['vitality','长生','生命与护罩','armor'],['spirit','灵息','灵力与技能','cloak']].map(([id,name,sub,icon])=>{const n=this.s.save.boons[id],cost=cultivationCost(id,n);return `<article>${gearIcon(icon)}<small>${sub}</small><h2>${name} <span>${n} 层</span></h2>${this.ui.cultivationPreview(id)}<button class="primary" data-cultivate="${id}" ${!merchant||n>=50||this.s.save.gold<cost?'disabled':''}>${n>=50?'此道圆满':`提升 · ${cost} 灵石`}</button></article>`;}).join('')}</div>`;
  }
}
