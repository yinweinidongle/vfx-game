import '/src/game/game.css';
import '/src/game/enhancements.css';
import * as T from 'three';
import { RPGGame } from '/src/game/RPGGame.js';
import { GameState } from '/src/game/GameState.js';
import { GameAudio } from '/src/game/GameAudio.js';
import { gameMusic } from '/src/game/GameMusic.js';
import { heightAt, ENCOUNTERS } from '/src/game/GameData.js';

// This production tool renders the real game simulation with fixed frame timestamps.
// It is deliberately outside both Vite production entry points and cannot save a game.
const W=1920,H=1080,FPS=60;
const SHOTS={
  ice:{kind:'ice',duration:4.5,title:'寒霜贯星',subtitle:'霜羽行者 · 曲线追击 / 冰晶爆发',tint:'#b8f0ff',cast:0,at:1.15,power:12,spirit:10},
  sword:{kind:'sword',duration:4.5,title:'苍雷断空',subtitle:'苍雷剑客 · 月牙剑气 / 雷霆斩击',tint:'#c9bcff',cast:1,at:1.12,power:25,spirit:12},
  cultivator:{kind:'cultivator',duration:6,title:'法相天劫',subtitle:'太虚修士 · 灵光追魂 / 群星陨落',tint:'#e2c88e',cast:2,at:.3,power:12,spirit:15},
  awakening:{kind:'sword',duration:5,title:'万剑敕雷',subtitle:'三十级觉醒 · 万雷临世',tint:'#d6c7ff',cast:3,at:.1,power:12,spirit:10},
};
const controls=document.querySelector('#reel-controls'),status=document.querySelector('#status');
const css=document.createElement('style');css.textContent=`body{background:#071820}#game-screen,#game-world{position:absolute!important;width:${W}px!important;height:${H}px!important;inset:0!important}#game-hud,.awakening-cutin{display:none!important}#reel-controls{position:fixed;bottom:12px;left:12px;right:12px;z-index:100;background:#07121de8;padding:12px;color:#fff;font:12px system-ui;display:flex;gap:12px;align-items:center}#reel-controls button,#reel-controls select{padding:8px;border:1px solid #99bccb;background:#163043;color:white}#status{flex:1}#reel-output{position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#071820;z-index:50;pointer-events:none}`;document.head.append(css);
const output=document.createElement('canvas');output.id='reel-output';output.width=W;output.height=H;document.body.append(output);const ctx=output.getContext('2d',{alpha:false});
let g=null,shot=null,key=null,time=0,frame=0,cast=false,clock=0,offline=null,events=[],recording=false,focus=new T.Vector3(),eye=new T.Vector3(),previousEye=new T.Vector3(),smoothFocus=new T.Vector3();
const empty={dx:0,dz:0};let random=978521;
const seeded=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
const smooth=(t,a,b)=>T.MathUtils.smoothstep(t,a,b);
const report=text=>{status.textContent=text;window.reelStatus=text;};
async function upload(ext,body){const r=await fetch(`http://127.0.0.1:5188/${key}.${ext}`,{method:'POST',body});if(!r.ok)throw new Error('保存失败 '+ext);}

function audioForExport(){
  const voice=g.audio.awakeningVoice;g.audio.dispose();
  offline=new OfflineAudioContext(2,Math.round(shot.duration*48000),48000);
  const virtual=new Proxy(offline,{get(target,prop){
    if(prop==='currentTime')return clock;if(prop==='state')return 'running';
    if(['resume','suspend','close'].includes(prop))return ()=>Promise.resolve();
    if(prop==='createBufferSource'||prop==='createOscillator')return ()=>{const node=target[prop](),start=node.start.bind(node);node.start=(at=clock,...rest)=>start(at===0?clock:at,...rest);return node;};
    const value=Reflect.get(target,prop,target);return typeof value==='function'?value.bind(target):value;
  }});
  const a=new GameAudio(.82);a.context=virtual;a.master=offline.createGain();a.master.gain.value=.82*.34;a.master.connect(offline.destination);
  a.noiseBuffer=offline.createBuffer(1,96000,48000);const noise=a.noiseBuffer.getChannelData(0);for(let i=0;i<noise.length;i++)noise[i]=(seeded()*2-1)*.08;
  a.awakeningVoice=voice;g.audio=a;
}

async function loadShot(id){
  if(recording)return;report('载入角色与场景…');
  if(g){g.dispose();g.renderer.forceContextLoss();g.renderer.domElement.remove();document.querySelectorAll('.awakening-cutin').forEach(e=>e.remove());}
  key=id;shot=SHOTS[id];time=0;frame=0;clock=0;cast=false;events=[];random=978521;
  gameMusic.pause();gameMusic.start=()=>{};gameMusic.configure=()=>{};gameMusic.duck=()=>{};
  const save=new GameState(shot.kind).save;Object.assign(save,{level:30,playTime:id==='awakening'?240:id==='cultivator'?220:125,seals:[true,true],cleared:ENCOUNTERS.map(e=>e.id),boons:{power:shot.power,vitality:2,spirit:shot.spirit},pendingBoons:0});
  // Block settings writes as well as save writes before constructing the isolated game.
  const savedSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).startsWith('frostbound.rpg'))return;return savedSet.call(this,k,v);};
  try{g=new RPGGame(shot.kind,save,{quality:'high',volume:0,musicMuted:true,route:false,skillCamera:true,shake:false});g.save=()=>{};await g.load();}
  finally{Storage.prototype.setItem=savedSet;}
  cancelAnimationFrame(g.raf);g.paused=true;g.input.clear();g.input.dispose();g.resizeObserver.disconnect();document.removeEventListener('visibilitychange',g.onVisibility);
  g.dpr=1;g.renderer.setPixelRatio(1);g.renderer.setSize(W,H);g.composer.setPixelRatio(1);g.composer.setSize(W,H);g.camera.aspect=W/H;g.camera.updateProjectionMatrix();
  g.ui.handle=()=>{};g.guide.group.visible=false;g.targetRing.visible=false;
  const s=g.state,p=s.player;p.x=20;p.z=-2;p.yaw=Math.PI;p.invulnerable=100;p.hp=s.stats.hp;p.energy=s.stats.energyMax;
  s.events.length=0;s.encounters.active.clear();s.started=new Set(ENCOUNTERS.map(e=>e.id));s.enemies=[];
  const locations=id==='awakening'?[[8,-11],[12,-13],[16,-12],[20,-15],[24,-11],[10,-19],[16,-20],[22,-21]]:[[17,-15],[12,-13],[22,-15],[14,-20],[21,-21]];
  for(const [i,[x,z]] of locations.entries()){
    const enemy={id:i,type:i===2?'caster':'melee',name:'遗迹守卫',level:30,color:i===2?'#a295c2':'#8296a8',x,z,homeX:x,homeZ:z,hp:id==='awakening'?1900:3400,maxHp:id==='awakening'?1900:3400,scale:1,speed:.75,range:2,damage:8,timer:.9,windup:1,cooldown:1.7,state:'chase',flash:0,frozen:0,stagger:0,spawnGrace:0,deathAge:0,phase:0,sequence:0,xp:0,yaw:0};
    s.enemies.push(enemy);g.actors.spawn(enemy);
  }
  g.actors.player.group.rotation.y=Math.PI;g.actors.update(0);g.fx.update(0);g.world.update(s.time,0);g.cameraYaw=.65;g.zoom=19;
  audioForExport();await document.fonts.ready;directCamera(0,true);g.composer.render();composite(0);report(`镜头 ${id} 已就绪 · ${shot.duration}s / ${shot.duration*FPS} 帧`);window.reelGame=g;
}

function directCamera(t,snap=false){
  const p=g.state.player,h=heightAt(p.x,p.z);previousEye.copy(g.camera.position);g.updateCamera(1/FPS);
  if(key==='awakening'){g.camera.updateMatrixWorld();return;}
  g.camera.position.copy(previousEye);
  const target=g.state.lockedTarget||g.state.enemies[0];
  if(key==='cultivator'){
    const pull=smooth(t,1.7,3.3);
    focus.set(p.x,h+5.3*(1-pull)+1.6*pull,p.z+1-pull*11);
    eye.set(p.x+12+pull*8+Math.max(0,t-3.3)*.45,h+3.5+pull*18,p.z-12+pull*18-Math.max(0,t-3.3)*.4);
    g.camera.fov=46+pull*4;
  }else{
    const baseX=p.x+10.5,baseY=h+7.5,baseZ=p.z+7.5;
    const follow=g.state.projectiles.find(b=>b.alive&&!b.primary&&!b.echo&&b.kind===(key==='ice'?'frost':'slash'));
    const track=follow?smooth(t,shot.at,shot.at+.18)*(1-smooth(t,shot.at+1.15,shot.at+1.65)):0;
    focus.set(p.x,h+1.45,p.z-6.5);eye.set(baseX+t*.5,baseY,baseZ);
    if(follow){focus.lerp(new T.Vector3(follow.x,follow.y,follow.z),track*.78);eye.lerp(new T.Vector3(follow.x+7.3,follow.y+3.8,follow.z+5.6),track*.72);}
    if(t>2.6){const u=smooth(t,2.6,4.4);focus.lerp(new T.Vector3(target.x,h+1.4,target.z),u*.38);eye.y+=u*3;}
    g.camera.fov=43;
  }
  if(snap){g.camera.position.copy(eye);smoothFocus.copy(focus);}else{g.camera.position.lerp(eye,1-Math.exp(-1/FPS*7));smoothFocus.lerp(focus,1-Math.exp(-1/FPS*9));}g.cameraTarget.copy(smoothFocus);g.camera.lookAt(smoothFocus);g.camera.updateProjectionMatrix();g.camera.updateMatrixWorld();
}

function step(){
  const dt=1/FPS,s=g.state,target=s.enemies[0];clock=time;
  if(!cast&&time>=shot.at){s.cast(shot.cast,target.x,target.z);cast=true;}
  if((key==='ice'||key==='sword')&&((time<shot.at-.18&&time>.04)||time>2.65))s.attack(target.x,target.z);
  const simDt=dt*(key==='cultivator'?.82:g.skillCamera.timeScale)*g.awakeningView.timeScale*(key==='awakening'?.82:1);
  g.hitStop=Math.max(0,g.hitStop-dt);g.accumulator+=simDt;let steps=0;
  while(g.accumulator>=1/60&&steps<4){if(g.hitStop<=0)s.update(1/60,empty);g.accumulator-=1/60;steps++;}
  for(const e of s.events)if(['cast','attack','hit','thunderStrike','divine','burst'].includes(e.type))events.push({t:time,type:e.type,index:e.index,element:e.element});
  g.handleEvents();g.awakeningView.update(dt);directCamera(time);
  g.actors.update(g.hitStop>0?0:simDt);g.world.update(s.time,simDt);g.world.hero.value.copy(g.cameraTarget);g.fx.update(g.hitStop>0?0:simDt);g.audio.update();
  g.renderer.info.reset();g.composer.render();composite(time);time+=dt;frame++;
}

function composite(t){
  ctx.globalAlpha=1;ctx.drawImage(g.renderer.domElement,0,0,W,H);
  const shade=ctx.createLinearGradient(0,H*.74,0,H);shade.addColorStop(0,'#04131c00');shade.addColorStop(1,'#04131caa');ctx.fillStyle=shade;ctx.fillRect(0,H*.74,W,H*.26);
  ctx.fillStyle='#ecede3';ctx.font='500 22px system-ui';ctx.fillText('F R O S T B O U N D',72,63);ctx.font='19px "Songti SC",serif';ctx.fillStyle='#d9cba7';ctx.fillText('霜 界  ·  归 墟 之 门',W-306,63);
  const a=Math.min(1,t*5,Math.max(0,(shot.duration-t)*4));ctx.globalAlpha=a;ctx.fillStyle=shot.tint;ctx.fillRect(74,H-158,40,2);
  ctx.font='42px "Songti SC",serif';ctx.fillStyle='#f5f3e9';ctx.fillText(shot.title,72,H-96);ctx.font='18px system-ui';ctx.fillStyle='#d0dcdf';ctx.fillText(shot.subtitle,74,H-55);ctx.globalAlpha=1;
  if(key==='awakening'){
    const v=g.awakeningView,t=v.age;
    if(t<1.32){
      const fade=Math.min(1,t/.065)*Math.max(0,Math.min(1,(1.32-t)/.3));ctx.globalAlpha=fade;
      const gradient=ctx.createLinearGradient(0,0,W,0);gradient.addColorStop(0,'#061321fa');gradient.addColorStop(.5,'#111a39dc');gradient.addColorStop(1,'#111a3980');ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
      const img=v.root.querySelector('img'),enter=1-Math.pow(1-Math.min(1,t/.12),3),zoom=1.04+t*.035,ih=H*1.4*zoom,iw=ih*img.naturalWidth/img.naturalHeight;
      ctx.drawImage(img,W*.40+(1-enter)*W*.12-t*15,-H*.13-t*5,iw,ih);
      ctx.fillStyle='#cbbcff';ctx.font='20px system-ui';ctx.fillText('境 界 觉 醒   /   S W O R D  T H U N D E R',W*.08,H*.38);
      ctx.font='92px "Songti SC",serif';ctx.fillStyle='#f2f3ec';ctx.fillText('万剑敕雷',W*.08,H*.51);
      ctx.fillStyle='#c0b0ef';ctx.fillRect(W*.08,H*.56,W*.25,1);ctx.font='34px "Songti SC",serif';ctx.fillStyle='#f2f3ec';ctx.fillText('一剑，敕雷！',W*.08,H*.64);
      const flash=Math.max(0,1-Math.abs(t-.075)/.045)*.26;ctx.globalAlpha=flash;ctx.fillStyle='#f1efff';ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;
    }
  }
  const fadeIn=key==='ice'?1-Math.min(1,t/.16):0,fadeOut=key==='awakening'?smooth(t,4.65,5):0;
  ctx.globalAlpha=Math.max(fadeIn,fadeOut);ctx.fillStyle='#041018';ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;
}

function wav(buffer){
  const length=buffer.length,channels=2,result=new ArrayBuffer(44+length*channels*2),v=new DataView(result);let o=0;
  const text=s=>{for(const c of s)v.setUint8(o++,c.charCodeAt(0));};text('RIFF');v.setUint32(o,result.byteLength-8,true);o+=4;text('WAVEfmt ');v.setUint32(o,16,true);o+=4;v.setUint16(o,1,true);o+=2;v.setUint16(o,channels,true);o+=2;v.setUint32(o,48000,true);o+=4;v.setUint32(o,192000,true);o+=4;v.setUint16(o,4,true);o+=2;v.setUint16(o,16,true);o+=2;text('data');v.setUint32(o,length*4,true);o+=4;
  const left=buffer.getChannelData(0),right=buffer.getChannelData(1);for(let i=0;i<length;i++)for(const channel of [left,right]){v.setInt16(o,Math.max(-32768,Math.min(32767,channel[i]*32767)),true);o+=2;}return result;
}
async function render(){
  const id=document.querySelector('#shot').value;await loadShot(id);recording=true;controls.querySelectorAll('button,select').forEach(b=>b.disabled=true);
  const chunks=[];let encodeError=null;
  const config={codec:'avc1.64002a',width:W,height:H,framerate:FPS,bitrate:22000000,latencyMode:'realtime',avc:{format:'annexb'}};
  const supported=await VideoEncoder.isConfigSupported(config);if(!supported.supported)throw new Error('H.264 encoder unavailable');
  const encoder=new VideoEncoder({output:chunk=>{const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);chunks.push(bytes);},error:e=>{encodeError=e;}});encoder.configure(config);
  try{
    for(let i=0;i<Math.round(shot.duration*FPS);i++){
      step();const f=new VideoFrame(output,{timestamp:Math.round(i*1e6/FPS),duration:Math.round(1e6/FPS)});encoder.encode(f,{keyFrame:i%60===0});f.close();
      if(encodeError)throw encodeError;
      if(i%12===0){report(`导出 ${key} · ${i+1}/${shot.duration*FPS} 帧`);await new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(0);});}
      if(encoder.encodeQueueSize>8)await encoder.flush();
    }
    await encoder.flush();encoder.close();report('保存视频与同步音效…');
    await upload('h264',new Blob(chunks,{type:'video/h264'}));const rendered=await offline.startRendering();await upload('wav',wav(rendered));
    const audit={shot:key,width:W,height:H,fps:FPS,frames:frame,duration:shot.duration,events,enemyDamage:g.state.enemies.map(e=>e.maxHp-e.hp),shaderFailures:g.renderer.info.programs.filter(p=>p.diagnostics&&!p.diagnostics.runnable).length};
    await upload('json',JSON.stringify(audit,null,2));report(`完成 ${key} · ${frame} 帧 · 实际命中 ${events.filter(e=>e.type==='hit').length} 次`);window.reelResult=audit;
  }finally{recording=false;controls.querySelectorAll('button,select').forEach(b=>b.disabled=false);}
}
document.querySelector('#load').onclick=()=>loadShot(document.querySelector('#shot').value).catch(e=>report(e.stack));
document.querySelector('#preview').onclick=async()=>{await loadShot(document.querySelector('#shot').value);for(let i=0;i<Math.round((key==='cultivator'?1.5:key==='awakening'?1.8:1.55)*FPS);i++)step();report('关键帧预览 · '+key);await upload('png',await new Promise(resolve=>output.toBlob(resolve,'image/png')));};
document.querySelector('#record').onclick=()=>render().catch(e=>{report(e.stack);console.error(e);});
window.reel={loadShot,step,render,output,async sample(t){await loadShot(document.querySelector('#shot').value);for(let i=0;i<Math.round(t*FPS);i++)step();return time;}};

document.querySelector('#record-all').onclick=async()=>{try{for(const id of Object.keys(SHOTS)){document.querySelector('#shot').value=id;await render();}report('四段导出完成 · 1200 帧 / 20 秒');}catch(e){report(e.stack);console.error(e);}};
