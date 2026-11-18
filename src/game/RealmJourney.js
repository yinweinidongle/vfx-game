import { INTERACTABLES, distance, isLand } from './GameData.js';
import { REALMS, REALM_BY_ID, REALM_ENEMIES, realmReward } from './RealmData.js';
import { createEncounterEnemy, encounterProfile } from './EncounterDirector.js';

export function readRealmProgress(raw) {
  const active = REALMS.find(realm => realm.id === raw?.active)?.id || null;
  const marks = {}, wins = {};
  for (const realm of REALMS) {
    const limit = (1 << realm.nodes.length) - 1;
    const bits = raw?.marks?.[realm.id];
    let value = Number.isSafeInteger(bits) && bits>=0 && bits<=limit ? bits : 0;
    if (realm.id === 'stars') value = [0,1,3,7].includes(value) ? value : 0;
    marks[realm.id] = value;
    wins[realm.id] = Number.isSafeInteger(raw?.wins?.[realm.id]) ? Math.max(0, raw.wins[realm.id]) : 0;
  }
  return {active, marks, wins, finished:!!active && wins[active] > 0 && raw?.finished === true};
}

export function insideRealmStrike(strike, point) {
  const dx = point.x - strike.x, dz = point.z - strike.z;
  if (strike.kind === 'ring') {
    const radius = Math.hypot(dx,dz);
    return radius >= strike.inner && radius <= strike.radius;
  }
  const along = dx*Math.sin(strike.yaw) + dz*Math.cos(strike.yaw);
  const across = dx*Math.cos(strike.yaw) - dz*Math.sin(strike.yaw);
  return Math.abs(along) <= strike.length/2 && Math.abs(across) <= strike.width/2;
}

export class RealmJourney {
  constructor(state) {
    this.state = state;
    this.progress = state.save.realms = readRealmProgress(state.save.realms);
    this.realm = REALM_BY_ID[this.progress.active] || null;
    this.strikes = Array.from({length:24}, () => ({active:false}));
    this.resetVisit();
    if (this.realm) this.arrive(this.realm.arrival, false);
  }

  resetVisit() {
    this.enemyStart = this.state.enemies.length;
    this.started = false;
    this.visited = 0;
    this.charge = 0;
    this.charging = -1;
    this.keeper = null;
    this.guideCamp = null;
    for (const strike of this.strikes) strike.active = false;
  }

  arrive(point, notify=true) {
    const state = this.state, player = state.player;
    Object.assign(player,{x:point.x,z:point.z,yaw:Math.PI,dash:0,vx:0,vz:0,action:'idle',actionTime:0,combat:0,invulnerable:1.25});
    state.nearby = null;
    state.lockedTarget = null;
    state.attackSocket = null;
    state.haloVolley.reset(); state.fervorVolley.reset(); state.taichuSet.reset();
    for (const shot of state.projectiles) shot.alive = false;
    for (const area of state.zones) area.alive = false;
    if (notify) {
      state.emit('realmTravel');
      state.saveDirty = true;
    }
  }

  enter(id) {
    const realm = REALMS.find(def => def.id === id), state = this.state;
    if (!realm || this.realm || state.dead || state.awakening.active || state.pendingBoons || !state.gear.canTrade()) return false;
    const camp = INTERACTABLES.find(site => site.type === 'camp' && distance(site,state.player)<5);
    state.save.checkpoint = camp.id;
    this.resetVisit();
    this.realm = realm;
    this.progress.active = id;
    this.progress.finished = false;
    this.arrive(realm.arrival);
    return true;
  }

  leave() {
    if (!this.realm || this.state.dead || this.state.awakening.active) return false;
    const state = this.state, realm = this.realm;
    for (const drop of state.drops) {
      if (!drop.alive || Math.abs(drop.x-realm.x)>30 || Math.abs(drop.z-realm.z)>30) continue;
      if (drop.stones) state.collectStones(drop,true);
      else {
        drop.alive = false;
        if (drop.gear) state.gear.grant(drop.gear,false);
      }
    }
    state.gear.syncGround();
    this.retireEnemies();
    this.realm = null;
    this.progress.active = null;
    this.progress.finished = false;
    const camp = INTERACTABLES.find(site => site.id === state.save.checkpoint);
    this.resetVisit();
    this.arrive({x:camp.x,z:camp.z-2.6});
    return true;
  }

  retireEnemies() {
    for (let index=this.enemyStart; index<this.state.enemies.length; index++) this.state.enemies[index].hp = 0;
    this.state.enemies.length = this.enemyStart;
  }

  revive() {
    if (!this.realm) return;
    this.retireEnemies();
    this.resetVisit();
    this.arrive(this.realm.arrival);
  }

  nearestCamp() {
    return INTERACTABLES.filter(site=>site.type==='camp' && (site.id==='camp' || this.state.save.seals[0]))
      .reduce((best, site)=>distance(site,this.state.player)<distance(best,this.state.player)?site:best);
  }

  get mask() { return this.progress.marks[this.realm.id]; }
  get allMarked() { return this.mask === (1 << this.realm.nodes.length) - 1; }
  marked(index) { return !!(this.mask & (1<<index)); }
  nextIndex() {
    const {realm, state} = this;
    let best=-1;
    for (let index=0; index<realm.nodes.length; index++) {
      if (this.marked(index)) continue;
      if (realm.id==='stars') return index;
      if (best<0 || distance(realm.nodes[index],state.player)<distance(realm.nodes[best],state.player)) best=index;
    }
    return best;
  }

  objective() {
    if (this.guideCamp && !this.realm) {
      if (this.state.gear.canTrade()) this.guideCamp=null;
      else return {...this.guideCamp,title:'山海秘境',text:'前往灯台，脱离战斗后选择秘境'};
    }
    if (!this.realm) return null;
    const realm = this.realm;
    if (this.progress.finished) return {...realm.entry,title:realm.name+' · 已通关',text:'返回渡口按 F，或从「秘境」直接回灯台'};
    if (this.allMarked) {
      const target=this.keeper||realm.altar;
      return {x:target.x,z:target.z,title:realm.name+' · 镇守现身',text:this.keeper?.trait || realm.tactic};
    }
    const index=this.nextIndex(), node=realm.nodes[index];
    const count=realm.nodes.reduce((total,_,i)=>total+Number(this.marked(i)),0);
    const hint=realm.id==='tide' ? (this.charge>0?'月露凝聚 '+Math.floor(this.charge/2.4*100)+'%':'在发光的潮眼内停留') :
      realm.id==='forge'?'攻击供火炉心，侧移躲开突刺':'前往'+node.name+'，按 F 点星';
    return {...node,title:realm.name+' · '+realm.action+' '+count+'/'+realm.nodes.length,text:hint};
  }

  interaction() {
    const realm=this.realm, player=this.state.player;
    if (distance(player,realm.entry)<3) return {type:'realmExit',name:'渡口 · 返回灯台'};
    if (realm.id==='stars' && !this.progress.finished && !this.allMarked) {
      const index=this.nextIndex();
      if(distance(player,realm.nodes[index])<2.8) return {type:'realmStar',index,name:'点亮'+realm.nodes[index].name};
    }
    return null;
  }

  mark(index) {
    if(this.progress.finished || this.marked(index)) return;
    const realm=this.realm, node=realm.nodes[index];
    this.progress.marks[realm.id] |= 1<<index;
    this.charge=0; this.charging=-1;
    this.state.saveDirty=true;
    this.state.emit('realmMark',{x:node.x,z:node.z,color:realm.color,realm:realm.id,
      text:this.allMarked?'机关已解 · '+REALM_ENEMIES[realm.keeper].name+'现身':node.name+'已'+(realm.id==='forge'?'熄灭':realm.id==='tide'?'归潮':'点亮')});
  }

  spawn(type, point, index) {
    const state=this.state, realm=this.realm;
    const profile=encounterProfile({level:realm.level},state.save.challenge);
    const enemy=createEncounterEnemy(type,point,profile,realm.id,state.enemies.length,index+1);
    enemy.realm=realm.id;
    enemy.node=index;
    if(enemy.keeper) enemy.timer=0;
    state.enemies.push(enemy);
    state.emit('spawn',{enemy});
    return enemy;
  }

  update(dt) {
    const realm=this.realm, state=this.state;
    if(!realm || this.progress.finished) return;
    if(!this.started) {
      if(distance(state.player,realm.arrival)<3) return;
      this.started=true;
    }
    if(this.allMarked) {
      if(!this.keeper) {
        this.keeper=this.spawn(realm.keeper,realm.altar,-1);
        state.emit('toast',{text:this.keeper.name+' · '+this.keeper.trait});
      }
    } else {
      const target=this.nextIndex();
      for(let index=0;index<realm.nodes.length;index++){
        const node=realm.nodes[index];
        if(this.marked(index) || ((1<<index)&this.visited) || (realm.id==='stars' && index!==target)) continue;
        if(distance(state.player,node)>13.3) continue;
        this.visited |= 1<<index;
        this.spawn(realm.minion,{x:node.x-1.6,z:node.z-2.3},index);
        if(realm.id==='forge') this.spawn('furnaceHeart',node,index);
        if(realm.id==='tide' && index===1) this.spawn('skate',{x:node.x+2.4,z:node.z-1.2},index);
      }
      if(realm.id==='tide'){
        const inside=distance(state.player,realm.nodes[target])<2.45;
        if(inside){
          if(this.charging!==target){this.charge=0;this.charging=target;}
          this.charge+=dt;
          if(this.charge>=2.4) this.mark(target);
        } else {this.charge=0;this.charging=-1;}
      }
    }
    for(const strike of this.strikes) if(strike.active){
      if(strike.source.hp<=0 && !strike.fired){strike.active=false;continue;}
      strike.age+=dt;
      if(!strike.fired && strike.age>=strike.delay){
        strike.fired=true;
        if(insideRealmStrike(strike,state.player)) state.hurt(strike.damage,strike);
        if(strike.lunge && isLand(strike.endX,strike.endZ,.8)) {
          const e=strike.source;
          e.rushLeft=.20;e.rushDX=strike.endX-e.x;e.rushDZ=strike.endZ-e.z;
        }
        state.emit('realmImpact',{x:strike.x,z:strike.z,color:realm.color,realm:realm.id});
      }
      if(strike.age>strike.delay+.34) strike.active=false;
    }
  }

  strike(source, fields) {
    const slot=this.strikes.find(strike=>!strike.active);
    if(slot) Object.assign(slot,{source,active:true,age:0,fired:false,lunge:false,inner:0,yaw:0,cueAfter:0},fields);
  }

  attack(enemy, damage) {
    const yaw=Math.atan2(enemy.targetX-enemy.x,enemy.targetZ-enemy.z), x=enemy.targetX, z=enemy.targetZ;
    if(enemy.family==='ray' || enemy.family==='core'){
      const core=enemy.family==='core';
      this.strike(enemy,{kind:'ring',x:core?enemy.x:x,z:core?enemy.z:z,inner:core?0:enemy.keeper?2.3:1.25,
        radius:core?4.1:enemy.keeper?6.1:3.8,delay:enemy.keeper?1.05:.9,damage});
      if(enemy.keeper) this.strike(enemy,{kind:'ring',x,z,inner:0,radius:2.15,cueAfter:1.16,delay:2.05,damage:damage*.75});
    } else if(enemy.family==='scorpion'){
      const length=Math.min(enemy.keeper?17:11,Math.hypot(x-enemy.x,z-enemy.z)+2.1);
      const angles=enemy.keeper?[-.43,0,.43]:[0];
      for(const offset of angles){
        const heading=yaw+offset,dx=Math.sin(heading)*length,dz=Math.cos(heading)*length;
        this.strike(enemy,{kind:'line',x:enemy.x+dx/2,z:enemy.z+dz/2,yaw:heading,length,width:enemy.keeper?1.6:1.2,
          delay:.87+Math.abs(offset)*.55,damage,lunge:offset===0,endX:enemy.x+dx*.85,endZ:enemy.z+dz*.85});
      }
    } else {
      const axis=(enemy.sequence%2)*Math.PI/4;
      for(let arm=0;arm<2;arm++) this.strike(enemy,{kind:'line',x,z,yaw:axis+arm*Math.PI/2,
        length:enemy.keeper?15:8,width:1.5,delay:1.06,damage});
      if(enemy.keeper) {
        for(let arm=0;arm<2;arm++) this.strike(enemy,{kind:'line',x,z,yaw:axis+Math.PI/4+arm*Math.PI/2,
          length:12,width:1.3,cueAfter:1.17,delay:1.95,damage:damage*.7});
      }
    }
  }

  onDeath(enemy) {
    if(!this.realm || enemy.realm!==this.realm.id || this.progress.finished) return;
    if(enemy.family==='core') this.mark(enemy.node);
    if(!enemy.keeper) return;
    const realm=this.realm, first=this.progress.wins[realm.id]===0, state=this.state;
    const {gold,xp}=realmReward(realm,first,state.save.challenge);
    this.progress.finished=true;
    this.progress.wins[realm.id]++;
    this.progress.marks[realm.id]=0;
    for(const strike of this.strikes) strike.active=false;
    for(const enemy of state.enemies.slice(this.enemyStart)) if(enemy.hp>0){
      enemy.hp=0;enemy.state='dead';state.emit('death',{enemy});
    }
    state.save.gold+=gold;
    state.gainXP(xp);
    state.saveDirty=true;
    state.emit('realmClear',{realm:realm.id,text:realm.name+(first?' · 首通':' · 再临')+'　灵石 +'+gold+'　历练 +'+xp});
  }
}
