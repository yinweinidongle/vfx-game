// Local-only VFX review fixture. No progress or settings writes are permitted.
import { RPGGame } from '../src/game/RPGGame.js';
import { GameState } from '../src/game/GameState.js';
import { ENCOUNTERS, heightAt } from '../src/game/GameData.js';
export async function setup(){
  window.__beforeStorage=JSON.stringify({...localStorage});
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(String(k).startsWith('frostbound.rpg'))return;return original.call(this,k,v);};
  const save=new GameState('cultivator').save;Object.assign(save,{playTime:125,cleared:ENCOUNTERS.map(e=>e.id),boons:{power:3,vitality:0,spirit:0}});
  document.querySelector('#title-screen').hidden=true;document.querySelector('#game-screen').hidden=false;
  const g=window.__spiritGame=new RPGGame('cultivator',save,{quality:'high',volume:0,musicMuted:true,route:false,skillCamera:false,shake:false});
  g.save=()=>{};try{await g.load();}finally{Storage.prototype.setItem=original;}
  cancelAnimationFrame(g.raf);g.paused=true;g.input.clear();g.input.dispose();g.ui.handle=()=>{};g.targetRing.visible=false;
  const s=g.state,p=s.player;p.x=20;p.z=-2;p.yaw=Math.PI;p.invulnerable=100;s.events.length=0;s.encounters.active.clear();s.started=new Set(ENCOUNTERS.map(e=>e.id));s.enemies=[];
  for(const [i,[x,z]]of [[17,-14],[12,-12],[23,-13],[20,-18]].entries()){
    const e={id:i,type:'melee',name:'遗迹守卫',level:1,x,z,homeX:x,homeZ:z,hp:100000,maxHp:100000,scale:1,speed:0,range:2,damage:0,timer:10,windup:1,cooldown:10,state:'chase',flash:0,frozen:0,stagger:0,spawnGrace:0,deathAge:0,phase:0,sequence:0,xp:0,yaw:0};s.enemies.push(e);g.actors.spawn(e);
  }
  s.updateEnemies=dt=>{for(const e of s.enemies){e.flash=Math.max(0,e.flash-dt);e.stagger=Math.max(0,e.stagger-dt);}};g.zoom=15;g.cameraYaw=.65;g.cameraSnap=true;g.updateCamera(0);g.actors.update(0);g.world.update(s.time,0);g.fx.update(0);g.composer.render();g.ui.update(0,60,0);
  window.__spiritHits=0;
  window.spiritStage=(power=3,night=false)=>{
    s.save.boons.power=power;s.save.playTime=night?240:125;s.recalculate();s.events.length=0;s.player.attackCooldown=0;s.player.energy=s.stats.energyMax;s.fervorVolley.reset();for(const b of s.projectiles)b.alive=false;g.fx.projectileTrails.reset();g.fx.spiritBolts.reset();for(const p of g.fx.shards)p.alive=false;for(const p of g.fx.bursts)p.alive=false;s.update(1/60,{dx:0,dz:0});s.events.length=0;
    return {power,tier:s.growth.tier,shots:s.growth.shots};
  };
  window.spiritStep=(frames=1,attack=false)=>{
    for(let i=0;i<frames;i++){
      if(attack)s.attack(s.enemies[0].x,s.enemies[0].z);
      s.update(1/60,{dx:0,dz:0});window.__spiritHits+=s.events.filter(e=>e.type==='hit').length;g.handleEvents();g.awakeningView.update(1/60);g.updateCamera(1/60);g.actors.update(1/60);g.world.update(s.time,1/60);g.fx.update(1/60);
    }
    g.renderer.info.reset();g.composer.render();g.ui.update(frames/60,60,g.renderer.info.render.calls);
    return {heads:g.fx.spiritBolts.body.count,sparks:g.fx.spiritBolts.fragments.count,flashes:g.fx.spiritBolts.flashes.count,hits:window.__spiritHits,shaderErrors:g.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length,saved:JSON.stringify({...localStorage})!==window.__beforeStorage};
  };
  window.spiritClose=()=>{g.dispose();g.renderer.domElement.remove();return JSON.stringify({...localStorage})===window.__beforeStorage;};
  window.__spiritReady=true;return true;
}
