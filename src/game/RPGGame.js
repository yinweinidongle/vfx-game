import {JourneyStorage} from './JourneyStorage.js';
import { warmVFX } from './VFXWarmup.js';
import './gear-ui.css';
import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GameState } from './GameState.js';
import { WorldLighting } from './WorldLighting.js';
import { GameWorld } from './GameWorld.js';
import { GameActors } from './GameActors.js';
import { GameFX } from './GameFX.js';
import { GameAudio } from './GameAudio.js';
import { GameInput } from './GameInput.js';
import { GameNavigation } from './GameNavigation.js';
import { GameRouteGuide } from './GameRouteGuide.js';
import { GameSkillCamera } from './GameSkillCamera.js';
import { GameUI } from './GameUI.js';
import { AwakeningPresentation } from './AwakeningPresentation.js';
import { SAVE_KEY, SETTINGS_KEY, heightAt } from './GameData.js';

export class RPGGame {
  constructor(kind, save, settings, storage) {
    try { this.storage = storage === undefined ? new JourneyStorage(localStorage) : storage; }
    catch { this.storage = null; }
    this.saveAgainAfter = 0;
    this.state = new GameState(kind,save); this.settings=settings; this.container=document.querySelector('#game-world');
    this.scene=new T.Scene();this.scene.background=new T.Color('#8ca9af');this.scene.fog=new T.FogExp2('#8ca9af',.013);
    this.camera=new T.PerspectiveCamera(44,1,.12,260);this.cameraYaw=.65;this.zoom=20;this.cameraTarget=new T.Vector3();this.cameraEye=new T.Vector3();this.cameraSnap=true;this.skillCamera=new GameSkillCamera(this);
    this.renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance'});this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.94;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.container.append(this.renderer.domElement);
    this.renderer.info.autoReset=false;this.renderer.setClearColor('#8ca9af');this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new T.Vector2(1,1),.42,.45,1.1);this.composer.addPass(this.bloom);this.antialias=new SMAAPass();this.composer.addPass(this.antialias);this.composer.addPass(new OutputPass());
    const pmrem=new T.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(new RoomEnvironment(),.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.38;pmrem.dispose();
    this.sky=new T.HemisphereLight('#e0f2f0','#344c50',1.15);this.scene.add(this.sky);
    this.sun=new T.DirectionalLight('#fff1d2',2.4);this.sun.position.set(-20,35,18);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:1,far:90});this.sun.shadow.bias=-.0003;this.sun.shadow.normalBias=.035;this.scene.add(this.sun,this.sun.target);
    const rim=this.rim=new T.DirectionalLight('#7ec6ed',.7);rim.position.set(20,12,-30);this.scene.add(rim);
    this.daylight=new WorldLighting(this);
    this.world=new GameWorld(this.scene,this.state);this.actors=new GameActors(this.scene,this.state);this.audio=new GameAudio(settings.volume);this.audio.start();
    this.raycaster=new T.Raycaster();this.groundPlane=new T.Plane(new T.Vector3(0,1,0),-.25);this.aim=new T.Vector3(-28,.25,10);this.input=new GameInput(this,this.renderer.domElement);
    this.targetRing=new T.Mesh(new T.RingGeometry(.22,.27,40),new T.MeshBasicMaterial({color:'#c6f6ed',transparent:true,opacity:.65,depthWrite:false}));this.targetRing.rotation.x=-Math.PI/2;this.scene.add(this.targetRing);
    this.ready=false;this.paused=true;this.accumulator=0;this.saveClock=0;this.shake=0;this.hitStop=0;this.fps=60;this.frames=0;this.frameTime=0;this.lowFrames=0;this.dpr=1;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.container);this.configure(settings);
    this.onStorageChange = event => {
      if (!this.ready || !this.storage || event.storageArea !== localStorage || (event.key !== SAVE_KEY && event.key !== null)) return;
      if (this.storage.getItem(SAVE_KEY) !== this.storage.lastSave) {
        this.storage.conflict = true;
        this.saveProblem();
      }
    };
    window.addEventListener('storage', this.onStorageChange);
    this.onVisibility=()=>{this.input.clear();if(document.hidden&&this.ready&&!this.paused){this.ui.pause();this.audio.pause();}this.lastTime=performance.now();};document.addEventListener('visibilitychange',this.onVisibility);
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.paused=true;document.querySelector('#game-loading').hidden=false;document.querySelector('#game-loading-text').textContent='图形上下文中断。进度已保存，请刷新页面继续。';this.save();});
    this.lastTime=performance.now();this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
  }
  async load() {
    const loadingLabel=document.querySelector('#game-loading-text');
    const progress=text=>{if(loadingLabel?.isConnected)loadingLabel.textContent=text;};
    await Promise.all([this.world.loadNature(progress),this.actors.load(progress),this.world.loadShrines(),this.world.loadRuins()]);
    this.navigation=new GameNavigation(this.state);
    this.guide=new GameRouteGuide(this.scene,this.state,this.navigation);this.guide.update(0);this.guide.group.visible=this.settings.route!==false;await this.guide.loadTexture(`${import.meta.env.BASE_URL}game/art/route-silk-v1.webp`);
    progress('编织技能与光影…');this.fx=new GameFX(this.scene,this.camera,this.state,this.actors);await this.fx.ready;
    this.ui=new GameUI(this);this.awakeningView=new AwakeningPresentation(this);await Promise.all([this.awakeningView.ready,this.audio.loadAwakening(this.state.kind),this.audio.loot.load(`${import.meta.env.BASE_URL}game/audio/loot/treasure-chimes-v1.wav`)]);this.cameraSnap=true;this.updateCamera(0);this.world.update(0,0);this.actors.update(0);this.fx.update(0);
    progress('准备战斗演出…');await warmVFX(this.renderer,this.scene,this.camera,[this.fx.group,this.fx.thunder.group,this.fx.ascendant.group,this.fx.loot.group,this.actors.warmActor.group]);this.ready=true;this.paused=false;this.lastTime=performance.now();document.querySelector('#game-loading').hidden=true;
    document.querySelector('#game-hud').hidden=false;
    if (this.save() === false && this.storage) { this.saveProblem(); return this; }
    if(this.state.pendingBoons)this.ui.boon();else if(this.state.save.playTime<1)this.ui.tutorial();
    return this;
  }
  updateAim() {
    if(this.input.pointerKnown){this.raycaster.setFromCamera(this.input.mouse,this.camera);this.raycaster.ray.intersectPlane(this.groundPlane,this.aim);}
    else {const p=this.state.player;this.aim.set(p.x+Math.sin(p.yaw)*8,.25,p.z+Math.cos(p.yaw)*8);}
    this.targetRing.position.set(this.aim.x,heightAt(this.aim.x,this.aim.z)+.08,this.aim.z);
    const target=this.state.aimTarget(this.aim.x,this.aim.z,26);this.state.lockedTarget=target;
    if(target){this.targetRing.position.set(target.x,heightAt(target.x,target.z)+.09,target.z);this.targetRing.scale.setScalar(2.5*target.scale);this.targetRing.material.color.set('#f3c77f');}else{this.targetRing.scale.setScalar(1);this.targetRing.material.color.set('#c6f6ed');}
  }
  cast(index) { if(this.paused||!this.ready)return;this.audio.start();this.updateAim();this.state.cast(index,this.aim.x,this.aim.z); }
  heal() { if(!this.paused)this.state.heal(); }
  configure(changes) {
    Object.assign(this.settings,changes);this.audio?.setVolume(this.settings.volume);this.audio?.setMusicMuted(this.settings.musicMuted===true);
    const q=this.settings.quality;this.dpr=Math.min(window.devicePixelRatio||1,q==='high'?1.75:q==='low'?.8:q==='medium'?1.1:1.35);
    this.renderer.shadowMap.enabled=q!=='low';this.sun.shadow.mapSize.setScalar(q==='high'||q==='auto'?2048:1024);
    this.bloom.enabled=q!=='low';this.antialias.enabled=q!=='low';this.resize();try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(this.settings));}catch{}
    if(this.guide)this.guide.group.visible=this.settings.route!==false;
  }
  resize() {
    const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(w,h);this.composer.setPixelRatio(this.dpr);this.composer.setSize(w,h);this.needsRender=true;
  }
  updateCamera(dt) {
    const p=this.state.player,age=this.fx?.divineAge??100,framing=age<4.7?Math.min(1,age*3)*Math.min(1,(4.7-age)*.8):0;
    this.daylight?.update(this.state.cycle,framing);
    const thunder=this.awakeningView?.darkness||0;
    if(thunder>0){this.sun.intensity*=1-thunder*.55;this.sky.intensity*=1-thunder*.35;this.scene.environmentIntensity*=1-thunder*.35;this.scene.background.lerp(this.daylight.colors.night,thunder*.56);this.scene.fog.color.copy(this.scene.background);}
    const cx=p.x+((this.fx?.divineTargetX??p.x)-p.x)*framing*.2,cz=p.z+((this.fx?.divineTargetZ??p.z)-p.z)*framing*.2,zoom=this.zoom+framing*3.8;
    this.cameraTarget.set(cx,heightAt(p.x,p.z)+1.2+framing*1.2,cz);
    const x=cx+Math.sin(this.cameraYaw)*zoom,y=heightAt(p.x,p.z)+zoom*.85,z=cz+Math.cos(this.cameraYaw)*zoom;
    this.cameraEye.set(x,y,z);this.skillCamera.update(dt,this.cameraEye,this.cameraTarget);
    const alpha=this.cameraSnap?1:1-Math.exp(-dt*9);
    this.camera.position.lerp(this.cameraEye,alpha);
    if(this.settings.shake&&this.shake>0){this.camera.position.x+=Math.sin(this.state.time*91)*this.shake;this.camera.position.y+=Math.cos(this.state.time*77)*this.shake*.65;}
    this.camera.lookAt(this.cameraTarget);this.camera.updateMatrixWorld();this.cameraSnap=false;this.shake=Math.max(0,this.shake-dt*1.5);

  }
  handleEvents() {
    const events=this.state.events.splice(0);
    this.audio.loot.handle(events,this.state.player,this.camera);
    if (events.some(e => e.type === 'gearDrop')) this.ui.lootRevealTime = .25;
    for(const e of events){
      if(e.type==='spawn')this.actors.spawn(e.enemy);
      if(e.type==='attack'||e.type==='cast')this.actors.attack(e.index>=2);
      if(e.type==='cast')this.skillCamera.begin(e.index);
      if(e.type==='awakening'){this.awakeningView.begin(e);if(e.index===3)this.audio.awaken(this.state.kind);else this.audio.play(e.index===4?'slash':'frost');}
      if(e.type==='revive'||e.type==='defeat'){this.awakeningView.reset();this.audio.stopAwakening();this.state.awakening.reset();this.skillCamera.cancel();}
      if(e.type==='heavenCleave'){this.shake=e.wave===0?.28:.13;this.hitStop=.045;this.audio.thunder(true);}
      if(e.type==='glacialPulse'){this.shake=e.final?.2:.045;this.audio.play('frost');}
      if(e.type==='thunderStrike'){
        if(this.state.time-(this.lastThunderSound??-10)>.13){this.audio.thunder(e.wave===3);this.lastThunderSound=this.state.time;}
        this.shake=Math.max(this.shake,e.wave===3?.16:.055);
      }
      if(e.type==='hit'&&e.element==='slash'){this.shake=Math.max(this.shake,.09);this.hitStop=.025;}
      if(e.type==='hurt')this.shake=.16;if(e.type==='divine')this.shake=.1;
      this.fx.handle(e);
      const quietEcho=e.fervor&&(e.fervorSplash||this.state.time-(this.lastFervorSound??-1)<.09);
      if(!quietEcho&&e.element!=='awakening'&&(e.element!=='halo'||this.state.time-(this.lastHaloSound??-1)>.09)){this.audio.play(['fervorUpgrade','vitalityUpgrade','spiritUpgrade'].includes(e.type)?'level':e.type);if(e.element==='halo')this.lastHaloSound=this.state.time;if(e.fervor)this.lastFervorSound=this.state.time;}this.ui.handle(e);
    }
  }
  tick(now) {
    this.raf=requestAnimationFrame(this.tick);const rawDt=Math.max(0,(now-this.lastTime)/1000),dt=Math.min(rawDt,.05);this.lastTime=now;
    if(this.ready&&!this.paused){
      this.input.update();if(this.input.dx||this.input.dz||this.state.player.dash>0)this.skillCamera.cancel();
      const simDt=dt*this.skillCamera.timeScale*(this.awakeningView?.timeScale??1);this.updateAim();this.accumulator+=simDt;this.hitStop=Math.max(0,this.hitStop-dt);
      if(this.input.attacking)this.state.attack(this.aim.x,this.aim.z);
      let steps=0;while(this.accumulator>=1/60&&steps<4){if(this.hitStop<=0)this.state.update(1/60,this.input);this.accumulator-=1/60;steps++;}
      this.handleEvents();this.awakeningView.update(dt);this.updateCamera(dt);this.actors.update(this.hitStop>0?0:simDt);this.world.update(this.state.time,simDt);if(this.skillCamera.weight>0)this.world.hero.value.lerp(this.cameraTarget,this.skillCamera.weight);this.fx.update(this.hitStop>0?0:simDt);this.guide.update(this.state.time);
      this.saveClock+=dt;if((this.saveClock>5||this.state.saveDirty) && now>=this.saveAgainAfter){this.save();this.saveClock=0;}
    }else if(!this.ready)this.updateCamera(dt);
    if(this.ready&&(!this.paused||this.needsRender)){this.renderer.info.reset();this.composer.render();this.needsRender=false;this.frames++;this.frameTime+=rawDt;}
    if(this.frameTime>1){this.fps=this.frames/this.frameTime;this.frames=0;this.frameTime=0;if(this.settings.quality==='auto'&&this.ready&&!this.paused){if(this.fps<48)this.lowFrames++;else this.lowFrames=0;if(this.lowFrames>=3&&this.dpr>.75){this.dpr=Math.max(.75,this.dpr-.15);this.resize();this.lowFrames=0;}}}
    if(this.ready&&!this.paused)this.ui.update(dt,this.fps,this.renderer.info.render.calls);this.audio.update();
  }
  save() {
    if (!this.ready || this.saveBlocked || this.storage?.conflict) return false;
    const ok = this.state.write(this.storage);
    if (!ok) {
      this.saveAgainAfter = performance.now() + 10000;
      if (this.storage?.conflict && !this.paused) this.saveProblem();
    }
    return ok;
  }
  saveProblem() {
    if (this.saveBlocked) return;
    this.saveBlocked = true;
    const changed = this.storage?.conflict;
    this.ui.open(`<h1>${changed ? '另一页已更新旅途' : '存档暂时无法写入'}</h1><p>${changed ? '请返回标题读取最新进度。' : '请检查浏览器的存储空间与站点存储权限，再返回标题重试。'}</p><div class="dialog-buttons"><a class="primary" href="game.html">返回标题</a></div>`);
    this.ui.dialog.querySelector('.dialog-close').hidden = true;
  }
  challenge() {
    const previous = this.state;
    const next = previous.nextCycle();
    if (!next) return;
    this.state = next;
    if (this.save() === false) {
      this.state = previous;
      this.saveProblem();
      return;
    }
    window.location.href = 'game.html?continue=1';
  }
  dispose() { if(this.ready)this.save();window.removeEventListener('storage',this.onStorageChange);cancelAnimationFrame(this.raf);this.input.dispose();this.resizeObserver.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);this.awakeningView?.dispose();this.ui?.lootLabels?.dispose();this.fx?.dispose();this.guide?.dispose();this.actors.dispose();this.daylight.dispose();this.world.dispose();this.audio.dispose();this.targetRing.geometry.dispose();this.targetRing.material.dispose();for(const pass of this.composer.passes)pass.dispose();this.composer.dispose();this.environment.dispose();this.sun.shadow.dispose();this.renderer.dispose(); }
}
