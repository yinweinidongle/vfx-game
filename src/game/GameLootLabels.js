import * as T from 'three';import {gearName,GEAR_RARITIES} from './GearData.js';import {heightAt} from './GameData.js';
/** At most twelve labels, prioritized by rarity, with simple screen-space overlap avoidance. */
export class GameLootLabels{
 constructor(game){this.game=game;this.age=0;this.point=new T.Vector3();this.root=document.createElement('div');this.root.className='loot-label-layer';document.querySelector('#game-hud').append(this.root);this.slots=Array.from({length:12},()=>{const e=document.createElement('div');e.className='loot-label';e.hidden=true;this.root.append(e);return {e,id:-1,x:0,y:0,w:0};});}
 update(dt){this.age+=dt;if(this.age<1/30)return;this.age=0;let count=0;const g=this.game,width=g.container.clientWidth,height=g.container.clientHeight,drops=g.fx.loot.visibleDrops;
  for(let rarity=2;rarity>=0;rarity--)for(const d of drops){if(d.gear.rarity!==rarity||count>=12)continue;this.point.set(d.x,Math.max(heightAt(d.x,d.z)+.32,d.y||0)+.38,d.z).project(g.camera);if(this.point.z>1||this.point.z< -1)continue;const x=(this.point.x*.5+.5)*width,y=(-this.point.y*.5+.5)*height;if(x<40||x>width-40||y<145||y>height-125)continue;
   const name=gearName(d.gear),w=Math.min(220,name.length*11+18);let chosen=NaN;
   for(const offset of [0,-23,-46,23,46]){const yy=y+offset;if(yy<145||yy>height-125)continue;let overlaps=false;for(let j=0;j<count;j++){const b=this.slots[j];if(Math.abs(x-b.x)<(w+b.w)*.5+4&&Math.abs(yy-b.y)<22){overlaps=true;break;}}if(!overlaps){chosen=yy;break;}}
   if(!Number.isFinite(chosen))continue;const slot=this.slots[count++];if(slot.id!==d.lootId){slot.e.textContent=name;slot.id=d.lootId;slot.e.style.setProperty('--loot-color',GEAR_RARITIES[rarity].color);slot.e.dataset.rarity=rarity;}slot.x=x;slot.y=chosen;slot.w=w;slot.e.hidden=false;slot.e.style.transform=`translate3d(${x}px,${chosen}px,0) translate(-50%,-100%)`;slot.e.style.opacity=String(Math.min(1,d.age*7));
  }
  for(let i=count;i<12;i++)this.slots[i].e.hidden=true;
 }
 dispose(){this.root.remove();}
}
