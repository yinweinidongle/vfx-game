import { awakeningStyle } from './AwakeningConfig.js';
import './awakening.css';

/** A short real-time cut-in: simulation slows, browser input and the overlay keep running. */
export class AwakeningPresentation {
  constructor(game) {
    this.game=game;this.age=100;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.style=awakeningStyle(game.state.kind);
    const root=this.root=document.createElement('div');root.className='awakening-cutin';root.hidden=true;root.setAttribute('aria-hidden','true');root.style.setProperty('--awakening-color',this.style.color);
    root.innerHTML=`<div class="awakening-shade"></div><div class="awakening-lattice"></div><div class="awakening-slash"></div><div class="awakening-portrait"><img alt="" src="${import.meta.env.BASE_URL}game/art/awakening/${this.style.portrait}-v1.webp"></div><div class="awakening-copy"><span>境界觉醒 <i>·</i> ${this.style.motif}</span><h1>${this.style.name}</h1><div class="awakening-rule"></div><p>${this.style.line}</p><small>THUNDER ANSWERS YOUR CALL</small></div><div class="awakening-flash"></div>`;
    document.querySelector('#game-screen').append(root);this.portrait=root.querySelector('.awakening-portrait');this.copy=root.querySelector('.awakening-copy');this.flash=root.querySelector('.awakening-flash');this.slash=root.querySelector('.awakening-slash');
    this.ready=root.querySelector('img').decode().catch(()=>{root.classList.add('portrait-unavailable');});
  }
  begin(){this.age=0;this.root.hidden=false;this.root.style.opacity='0';this.game.input.clear();}
  get timeScale(){return this.age<.085?0:this.age<.64?.24:1;}
  get darkness(){return this.age<.9?Math.min(1,this.age*12):Math.max(0,1-(this.age-.9)/3.7)*.8;}
  update(dt){
    this.age+=dt;const t=this.age,life=1.32;
    if(t>=life){this.root.hidden=true;return;}
    const enter=Math.min(1,t/.12),exit=Math.max(0,(t-1.02)/.3),ease=1-Math.pow(1-enter,3);
    this.root.style.opacity=String(Math.min(1,enter*2)*(1-exit));
    this.portrait.style.transform=this.reduced?'none':`translate3d(${(1-ease)*18-exit*22-t*1.1}%,${-t*.6}%,0) scale(${1.04+t*.035})`;
    this.copy.style.transform=this.reduced?'none':`translate3d(${-(1-ease)*24+exit*8}px,0,0)`;
    this.slash.style.transform=`translate3d(${(t/.5)*180-100}%,0,0) skewX(-25deg)`;
    this.flash.style.opacity=this.reduced?'0':String(Math.max(0,1-Math.abs(t-.075)/.045)*.32);
  }
  reset(){this.age=100;this.root.hidden=true;}
  dispose(){this.root.remove();}
}
