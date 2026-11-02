import { ZONES, CONNECTIONS, INTERACTABLES, segmentDistance, heightAt, isLand } from './GameData.js';

/** A cached relief atlas of the playable terrain, with crisp live cartography. */
export class GameMap {
  constructor(game) { this.game=game;this.state=game.state;this.bounds={x:-64,z:-43,w:142,h:100};this.makeRelief(); }
  makeRelief() {
    const map=this.terrain=document.createElement('canvas');map.width=1136;map.height=800;const c=map.getContext('2d'),data=c.createImageData(map.width,map.height),b=this.bounds;
    for(let iy=0;iy<map.height;iy++)for(let ix=0;ix<map.width;ix++){
      const x=b.x+ix/8,z=b.z+iy/8;let edge=Infinity,zone=0;
      for(let i=0;i<ZONES.length;i++){const a=ZONES[i],d=Math.hypot(x-a.x,z-a.z)-a.radius;if(d<edge){edge=d;zone=i;}}
      for(const a of CONNECTIONS)edge=Math.min(edge,segmentDistance(x,z,...a.slice(0,4))-a[4]);
      const n=Math.sin(x*.53+Math.sin(z*.41))*.25+Math.sin(z*1.19+x*.31)*.13+Math.sin(x*4.1+z*2.8)*.035;
      const k=(iy*map.width+ix)*4;let color;
      if(edge<0){const base=[[57,91,77],[75,90,92],[66,78,99]][zone];const relief=Math.sin(x*.11)*.12+Math.sin(z*.13)*.07;const light=.94+n*.24+relief-Math.exp(edge*1.3)*.24;const shore=Math.exp(-Math.pow((edge+.38)/.12,2))*.6;color=base.map((v,i)=>v*light+shore*[94,104,89][i]);}
      else{const glow=Math.exp(-edge*.8)*.4;color=[13+glow*20+n*4,29+glow*28+n*6,38+glow*27+n*7];}
      data.data[k]=color[0];data.data[k+1]=color[1];data.data[k+2]=color[2];data.data[k+3]=255;
    }
    c.putImageData(data,0,0);c.save();c.scale(8,8);c.translate(-b.x,-b.z);c.lineCap='round';c.lineJoin='round';
    this.drawContours(c);
    for(const road of [[[-28,25],[-24,-16]],[[-24,-3],[18,-10],[51,24]]]){
      c.beginPath();road.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle='#c2ba9632';c.lineWidth=2.4;c.stroke();c.strokeStyle='#cfcaad50';c.lineWidth=.35;c.stroke();
    }
    for(let i=0;i<this.state.obstacles.length;i++){
      const o=this.state.obstacles[i];if(o.r>.81)continue;
      const forest=o.x< -5;c.fillStyle=forest?'#163c3477':'#162b3e66';c.beginPath();c.ellipse(o.x+.2,o.z+.25,o.r*1.4,o.r,0,0,Math.PI*2);c.fill();
      c.fillStyle=forest?['#83a18b','#688c78','#527867'][i%3]:'#94a5a8aa';c.beginPath();
      if(forest){for(let j=0;j<7;j++){const angle=j*Math.PI*2/7,r=o.r*(1+(j%2)*.2);c.lineTo(o.x+Math.cos(angle)*r,o.z+Math.sin(angle)*r);}c.closePath();}else c.rect(o.x-o.r*.7,o.z-o.r*.7,o.r*1.4,o.r*1.4);
      c.fill();c.strokeStyle='#c7d6b63d';c.lineWidth=.1;c.stroke();
    }
    for(const [x,z,r]of [[18,-10,10],[51,24,13]]){c.strokeStyle='#a9bfbc35';c.lineWidth=.2;for(let i=0;i<3;i++){c.beginPath();c.arc(x,z,r-i*2.8,0,Math.PI*2);c.stroke();}c.beginPath();c.moveTo(x-r,z);c.lineTo(x+r,z);c.moveTo(x,z-r);c.lineTo(x,z+r);c.stroke();}
    c.restore();
  }
  drawContours(c) {
    const b=this.bounds;
    // Marching squares over the same height function used by the world surface.
    for(const level of [-.08,0,.08,.16,.24,.32,.4]){
      c.beginPath();c.strokeStyle='#c1d3ac32';c.lineWidth=.11;
      for(let z=b.z;z<b.z+b.h;z++)for(let x=b.x;x<b.x+b.w;x++){
        if(!isLand(x+.5,z+.5,1))continue;
        const points=[[x,z],[x+1,z],[x+1,z+1],[x,z+1]],crossings=[];
        for(let k=0;k<4;k++){const a=points[k],d=points[(k+1)%4],ha=heightAt(...a),hb=heightAt(...d);if((ha<level)===(hb<level))continue;const t=(level-ha)/(hb-ha);crossings.push([a[0]+(d[0]-a[0])*t,a[1]+(d[1]-a[1])*t]);}
        for(let k=0;k+1<crossings.length;k+=2){c.moveTo(...crossings[k]);c.lineTo(...crossings[k+1]);}
      }
      c.stroke();
    }
  }
  draw(canvas) {
    const c=canvas.getContext('2d'),w=canvas.width/2,h=canvas.height/2,large=w>300,p=this.state.player,b=this.bounds;
    const scale=large?Math.min(w/b.w,h/b.h):w/46,cx=large?7:p.x,cz=large?7:p.z-2;
    const sx=x=>w/2+(x-cx)*scale,sy=z=>h/2+(z-cz)*scale;
    c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,w,h);c.fillStyle='#0d1d26';c.fillRect(0,0,w,h);
    c.drawImage(this.terrain,sx(b.x),sy(b.z),b.w*scale,b.h*scale);
    // Delicate chart grid and inset frame stay at display-pixel resolution.
    c.strokeStyle='#b3cfb80b';c.lineWidth=.6;for(let x=Math.floor((cx-w/scale/2)/10)*10;x<cx+w/scale/2;x+=10){c.beginPath();c.moveTo(sx(x),0);c.lineTo(sx(x),h);c.stroke();}for(let z=Math.floor((cz-h/scale/2)/10)*10;z<cz+h/scale/2;z+=10){c.beginPath();c.moveTo(0,sy(z));c.lineTo(w,sy(z));c.stroke();}
    for(let i=1;i<3;i++)if(!this.state.save.seals[i-1]){const z=ZONES[i];c.fillStyle='#0719238c';c.beginPath();c.arc(sx(z.x),sy(z.z),z.radius*scale,0,Math.PI*2);c.fill();}
    const path=this.game.guide?.path;
    if(this.game.settings.route!==false&&path?.length){c.save();c.beginPath();path.forEach((q,i)=>i?c.lineTo(sx(q.x),sy(q.z)):c.moveTo(sx(q.x),sy(q.z)));c.strokeStyle='#e5c68c30';c.lineWidth=5;c.lineJoin='round';c.stroke();c.strokeStyle='#f0d398';c.lineWidth=1.35;c.setLineDash([3,3.2]);c.lineDashOffset=-this.state.time*5;c.stroke();c.restore();}
    const mark=(x,z,kind,color,size=4)=>{
      x=sx(x);z=sy(z);if(x<8||x>w-8||z<8||z>h-8)return;
      c.save();c.translate(x,z);c.shadowColor='#06131c';c.shadowBlur=4;c.fillStyle='#102833';c.strokeStyle=color;c.lineWidth=1.2;
      if(kind==='camp'){c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?size*.32:size;c.lineTo(Math.sin(a)*r,Math.cos(a)*r);}c.closePath();c.fill();c.stroke();}
      else if(kind==='chest'){c.fillRect(-size,-size*.65,size*2,size*1.3);c.strokeRect(-size,-size*.65,size*2,size*1.3);c.beginPath();c.moveTo(-size,-1);c.lineTo(size,-1);c.stroke();}
      else{c.rotate(Math.PI/4);c.fillRect(-size*.65,-size*.65,size*1.3,size*1.3);c.strokeRect(-size*.65,-size*.65,size*1.3,size*1.3);}
      c.restore();
    };
    for(const o of INTERACTABLES){if(o.type==='chest'&&this.state.save.opened.includes(o.id)||o.type==='memory')continue;mark(o.x,o.z,o.type,o.type==='camp'?'#a5e2d7':o.type==='seal'?'#baa3df':'#d9c293',large?4:3.5);}
    for(const e of this.state.enemies)if(e.hp>0&&Math.hypot(e.x-p.x,e.z-p.z)<26){mark(e.x,e.z,'enemy',e===this.state.lockedTarget?'#ffd38b':e.elite?e.color:'#e58a91',e.type==='boss'?6:e.elite?4.5:3);}
    const o=this.state.objective(),tx=sx(o.x),tz=sy(o.z),dx=tx-w/2,dz=tz-h/2,ratio=Math.min(1,(w/2-15)/Math.max(.01,Math.abs(dx)),(h/2-17)/Math.max(.01,Math.abs(dz))),ox=w/2+dx*ratio,oz=h/2+dz*ratio;
    c.save();c.translate(ox,oz);c.strokeStyle='#f0d29a';c.fillStyle='#153139';c.lineWidth=1.2;c.shadowColor='#ffe4a6';c.shadowBlur=7;c.beginPath();c.arc(0,0,6+Math.sin(this.state.time*2)*.5,0,Math.PI*2);c.fill();c.stroke();c.shadowBlur=0;c.rotate(ratio<1?Math.atan2(dz,dx)+Math.PI/2:0);c.fillStyle='#f7dda8';c.beginPath();c.moveTo(0,-3);c.lineTo(2.6,2.3);c.lineTo(-2.6,2.3);c.fill();c.restore();
    c.save();c.translate(sx(p.x),sy(p.z));c.rotate(-p.yaw);const cone=c.createRadialGradient(0,0,0,0,0,24);cone.addColorStop(0,'#d3f2df26');cone.addColorStop(1,'#d3f2df00');c.fillStyle=cone;c.beginPath();c.moveTo(0,0);c.arc(0,0,24,Math.PI*.32,Math.PI*.68);c.closePath();c.fill();c.shadowColor='#c9fff1';c.shadowBlur=7;c.fillStyle='#dcfff4';c.strokeStyle='#133c3b';c.lineWidth=1.3;c.beginPath();c.moveTo(0,6);c.lineTo(-4,-4);c.lineTo(0,-2);c.lineTo(4,-4);c.closePath();c.fill();c.stroke();c.restore();
    const vignette=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.max(w,h)*.66);vignette.addColorStop(0,'#06162200');vignette.addColorStop(1,'#06162265');c.fillStyle=vignette;c.fillRect(0,0,w,h);
    c.strokeStyle='#c9c19b35';c.lineWidth=.6;c.strokeRect(5.5,5.5,w-11,h-11);c.fillStyle='#ddcfad';c.font='9px Inter, sans-serif';c.textAlign='center';c.fillText('N',w/2,15);c.beginPath();c.moveTo(w/2,19);c.lineTo(w/2,24);c.stroke();
    if(large){c.font='15px "Songti SC",serif';for(const z of ZONES){c.fillStyle='#d5ddce';c.shadowColor='#07171f';c.shadowBlur=6;c.fillText(z.name,sx(z.x),sy(z.z-z.radius*.65));}c.shadowBlur=0;}
    else{c.strokeStyle='#b4cbb390';c.beginPath();c.moveTo(14,h-17);c.lineTo(14+scale*5,h-17);c.stroke();c.fillStyle='#bbcdbba0';c.font='8px Inter,sans-serif';c.textAlign='left';c.fillText('5 m',14,h-22);}
  }
}
