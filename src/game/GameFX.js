import { GameAscendantVFX } from './GameAscendantVFX.js';
import { GameLootVFX } from './GameLootVFX.js';
import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { GameProjectileTrails } from './GameProjectileTrails.js';
import { SwordTrail } from '../vfx/sword/SwordTrail.js';
import { PaintedCrescentBlade } from '../vfx/sword/PaintedCrescentBlade.js';
import { MagicMandala } from '../vfx/cultivator/MagicMandala.js';
import { DivineHalo } from '../vfx/cultivator/DivineHalo.js';
import { HaloBolts } from '../vfx/cultivator/HaloBolts.js';
import { MeteorStorm } from '../vfx/cultivator/MeteorStorm.js';
import { defaults } from '../VFXConfig.js';
import { heightAt } from './GameData.js';
import { spiritViewFade } from './SpiritViewFade.js';
import { GameFervorVFX } from './GameFervorVFX.js';
import { GameShieldVFX } from './GameShieldVFX.js';
import { GameSkillResonance } from './GameSkillResonance.js';
import { GameThunderVFX } from './GameThunderVFX.js';
import { GameSpiritBolts, isSpiritBolt } from './GameSpiritBolts.js';

const N=96,SHARDS=600;
const PALETTE={enemy:'#d069a5',arrow:'#79ddff',frost:'#70dfff',spirit:'#a6a3ff',slash:'#8aa0ff',star:'#ffd29a',heal:'#8aefbf'};
const crystalMaterial=()=>new T.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:`attribute vec3 aTint;varying vec3 vTint,vNormal,vView;void main(){vTint=aTint;vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.);vec3 ss=vec3(dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz));vNormal=normalize(normalMatrix*mat3(instanceMatrix)*(normal/max(ss,vec3(.00001))));vView=-mv.xyz;gl_Position=projectionMatrix*mv;}`,fragmentShader:`varying vec3 vTint,vNormal,vView;void main(){vec3 n=normalize(vNormal),v=normalize(vView);float rim=pow(1.-abs(dot(n,v)),2.4),facet=max(0.,dot(n,normalize(vec3(.3,.8,.6)))),shine=pow(max(0.,dot(n,normalize(v+vec3(-.3,.8,.6)))),22.);vec3 c=vTint*(.17+facet*.32+rim*.65)+vec3(.65,.85,1.)*shine*.7;gl_FragColor=vec4(c,.82+rim*.16);}`});

export class GameFX {
  constructor(scene, camera, state, actors) {
    this.scene = scene; this.camera = camera; this.state = state; this.actors = actors; this.group = new T.Group(); scene.add(this.group);
    this.dummy = new T.Object3D(); this.color = new T.Color(); this.point = new T.Vector3(); this.view = new T.Vector3(); this.side = new T.Vector3(); this.direction = new T.Vector3();
    this.projectileTrails=new GameProjectileTrails(this.group,camera);this.motion=new T.Vector3();this.yAxis=new T.Vector3(0,1,0);this.zAxis=new T.Vector3(0,0,1);
    this.spiritBolts=state.kind==='cultivator'?new GameSpiritBolts(this.group,camera,state,this.projectileTrails):null;
    this.fervor=new GameFervorVFX(this.group,state,this.projectileTrails);this.shield=new GameShieldVFX(this.group,state);this.resonance=new GameSkillResonance(this.group,state,this.projectileTrails);
    const headGeometry=new T.OctahedronGeometry(1);this.headColors=new Float32Array(N*3);headGeometry.setAttribute('aTint',new T.InstancedBufferAttribute(this.headColors,3));
    this.heads=new T.InstancedMesh(headGeometry,crystalMaterial(),N);this.heads.frustumCulled=false;this.group.add(this.heads);
    const arrowSource=actors.assets.arrow, arrowBox=new T.Box3().setFromObject(arrowSource), arrowCentre=arrowBox.getCenter(new T.Vector3()), arrowScale=1/arrowBox.getSize(new T.Vector3()).y;
    this.arrowHeads=Array.from({length:24},()=>{const root=new T.Group(),align=new T.Group(),asset=arrowSource.clone(true);
      const energy={tint:{value:new T.Color('#71e4ff')},power:{value:1.1},rank:{value:0},spirit:{value:0},time:{value:0}};root.userData.energy=energy;
      asset.traverse(o=>{if(!o.isMesh)return;const cloneMaterial=source=>{const material=source.clone();material.onBeforeCompile=shader=>{shader.uniforms.uArrowTint=energy.tint;shader.uniforms.uArrowPower=energy.power;shader.uniforms.uArrowRank=energy.rank;shader.uniforms.uArrowTime=energy.time;shader.uniforms.uArrowSpirit=energy.spirit;shader.vertexShader='varying vec3 vArrowLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvArrowLocal=position;');shader.fragmentShader='varying vec3 vArrowLocal;uniform vec3 uArrowTint;uniform float uArrowPower,uArrowRank,uArrowTime,uArrowSpirit;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','float iceRim=pow(1.-abs(dot(normalize(normal),normalize(vViewPosition))),2.8);float facetLight=pow(max(0.,dot(normalize(normal),normalize(vec3(.3,.8,.5)))),22.);float engraving=pow(max(0.,sin(vArrowLocal.y*75.-uArrowTime*20.)),18.)*min(1.,uArrowRank*.4);float spiritFlow=pow(max(0.,sin(vArrowLocal.y*95.-uArrowTime*27.+sin(vArrowLocal.x*50.)*2.)),22.)*uArrowSpirit;outgoingLight+=uArrowTint*(.12+iceRim*3.0+facetLight+engraving*.7)*uArrowPower+vec3(.55,.75,1.)*spiritFlow*1.25;\n#include <opaque_fragment>');};material.customProgramCacheKey=()=>'frost-arrow-game-spirit-v4';return material;};o.material=Array.isArray(o.material)?o.material.map(cloneMaterial):cloneMaterial(o.material);});asset.scale.setScalar(arrowScale);asset.position.copy(arrowCentre).multiplyScalar(-arrowScale);align.add(asset);align.rotation.x=Math.PI/2;root.add(align);root.visible=false;this.group.add(root);return root;});

    this.shards = Array.from({ length: SHARDS }, () => ({ alive: false }));
    const shardGeometry = new T.OctahedronGeometry(1); shardGeometry.scale(.45, 1, .24);
    this.shardColors=new Float32Array(SHARDS*3);shardGeometry.setAttribute('aTint',new T.InstancedBufferAttribute(this.shardColors,3));this.shardMesh = new T.InstancedMesh(shardGeometry,crystalMaterial(),SHARDS); this.shardMesh.frustumCulled = false; this.group.add(this.shardMesh);
    this.bursts = Array.from({ length: 36 }, () => ({ alive: false })); this.makeRings(); this.makeTelegraphs();
    this.blade = new PaintedCrescentBlade({ ...defaults, bladeSize: 1.25, frostColor: '#59dcff' }); this.group.add(this.blade.group); this.blade.group.visible = false;
    this.bladePool=[];this.bladeProfile=new Float32Array(75);
    this.ready=this.blade.loadTexture(`${import.meta.env.BASE_URL}textures/anime-crescent-v1.png`,{alphaThreshold:24}).then(()=>{
      this.blade.getTrailProfile(this.bladeProfile);
      for(let i=0;i<24;i++){
        const group=this.blade.group.clone(true);let uniforms;
        group.traverse(o=>{if(!o.isMesh)return;const original=o.material;o.material=original.clone();uniforms=o.material.uniforms;for(const key of Object.keys(uniforms))if(original.uniforms[key].value?.isTexture)uniforms[key].value=original.uniforms[key].value;});
        group.visible=false;this.group.add(group);const config={...defaults,bladeSize:1,trailLength:2.6};const trail=new SwordTrail(this.group,config);trail.setProfile(this.bladeProfile,{launchStretch:false});this.bladePool.push({group,uniforms,trail,config,projectile:null,generation:-1,last:new T.Vector3(),drain:10,wasAlive:false});
      }
    });
    this.storm = new MeteorStorm(this.group, camera, { ...defaults, meteorCount: 28, meteorSize: .65, impactRadius: 1.2, particleDensity: .7 });
    this.storm.group.visible = false; this.divineAge = 100; this.portal = new MagicMandala(this.group, 4.8); this.portal.mesh.visible = false;
    this.targetSeal=new MagicMandala(this.group,5);this.targetSeal.mesh.visible=false;
    this.installSpirit();
    this.haloBolts=new HaloBolts(this.group,camera,defaults,state.haloVolley.bolts.length);this.haloBolts.events=state.haloVolley.bolts;
    this.light = new T.PointLight('#73dcff', 0, 9, 2); this.group.add(this.light); this.lightAge = 0;this.baseLightPosition=new T.Vector3();this.baseLightColor=new T.Color();
    this.ascendant=new GameAscendantVFX(scene,camera,state,actors.gearTemplates['dao-imperial']||actors.gearTemplates.weapon,{arrow:actors.assets.arrow});this.loot=new GameLootVFX(scene,state,actors.lootTemplates,camera);this.thunder=new GameThunderVFX(scene,camera,state);this.lightCues=[...this.thunder.lights,this.ascendant.light];this.ready=Promise.all([this.ready,this.thunder.ready,this.ascendant.ready]);
  }
  makeRings() {
    const g = new T.PlaneGeometry(2, 2); this.ringAges = new Float32Array(36); this.ringKinds = new Float32Array(36);this.ringColors=new Float32Array(108);
    g.setAttribute('aColor',new T.InstancedBufferAttribute(this.ringColors,3));
    g.setAttribute('aAge', new T.InstancedBufferAttribute(this.ringAges, 1)); g.setAttribute('aKind', new T.InstancedBufferAttribute(this.ringKinds, 1));
    const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, vertexShader: 'attribute vec3 aColor;attribute float aAge,aKind;varying vec3 vTint;varying vec2 vP;varying float vAge,vKind;void main(){vTint=aColor;vP=uv*2.-1.;vAge=aAge;vKind=aKind;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 vTint;varying vec2 vP;varying float vAge,vKind;void main(){float r=length(vP);float ring=exp(-pow((r-(.15+vAge*.76))*40.,2.))*(1.-vAge);float star=(exp(-abs(vP.x)*55.)*pow(1.-abs(vP.y),3.)+exp(-abs(vP.y)*55.)*pow(1.-abs(vP.x),3.))*max(0.,1.-vAge*5.);float angle=atan(vP.y,vP.x);float rays=pow(max(0.,cos(angle*6.)),32.)*pow(max(0.,1.-r),2.)*smoothstep(.02,.18,r);float secondary=exp(-pow((r-(.03+vAge*.66))*65.,2.))*step(4.5,vKind);float air=step(1.5,vKind);float a=mix(ring*.65+star*.7,(star*.9+rays*2.)*pow(1.-vAge,4.)+secondary*.35*(1.-vAge),air);if(a<.004)discard;vec3 c=mix(vTint*1.4,vec3(1.6,2.,2.1),min(1.,star)*.45);gl_FragColor=vec4(c,a);}' });
    this.rings = new T.InstancedMesh(g, m, 36); this.rings.frustumCulled = false; this.rings.renderOrder = 4; this.group.add(this.rings);
  }
  makeTelegraphs() {
    const g = new T.PlaneGeometry(2, 2); this.warningProgress = new Float32Array(64); g.setAttribute('aProgress', new T.InstancedBufferAttribute(this.warningProgress, 1));
    const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, vertexShader: 'attribute float aProgress;varying float vProgress;varying vec2 vP;void main(){vP=uv*2.-1.;vProgress=aProgress;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}', fragmentShader: 'varying float vProgress;varying vec2 vP;void main(){float r=length(vP);if(r>1.)discard;float border=smoothstep(.95,.975,r);float moving=exp(-pow((r-vProgress)*30.,2.));float stripe=step(.5,fract((vP.x+vP.y)*8.));gl_FragColor=vec4(1.,.24,.31,.12+border*.65+moving*.25+stripe*.055);}' });
    this.warnings = new T.InstancedMesh(g, m, 64); this.warnings.frustumCulled = false; this.warnings.renderOrder = 2; this.group.add(this.warnings);
  }
  installSpirit() {
    const source = this.actors.playerSource, model = clone(source), wrapper = new T.Group(); wrapper.add(model); this.group.add(wrapper);
    const bounds = new T.Box3().setFromObject(model), size = bounds.getSize(new T.Vector3()); model.scale.setScalar(6.5 / size.y); model.position.y = -bounds.min.y * model.scale.y;
    this.presence = { value: 0 }; this.spiritBase = { value: 0 };
    this.spiritMaterial = new T.MeshStandardMaterial({ color: '#3c7aab', transparent: true, depthWrite: false, roughness: .4, metalness: .2 });
    this.spiritMaterial.onBeforeCompile = s => {
      s.uniforms.uSpiritPresence = this.presence; s.uniforms.uSpiritBase = this.spiritBase;
      s.vertexShader = 'varying float vSpiritY;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSpiritY=(modelMatrix*vec4(transformed,1.)).y;');
      s.fragmentShader = 'uniform float uSpiritPresence,uSpiritBase;varying float vSpiritY;\n' + s.fragmentShader;
      s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', 'float rim=pow(1.-abs(dot(normalize(normal),normalize(vViewPosition))),2.4);outgoingLight=mix(vec3(.035,.12,.24),vec3(.65,1.65,2.5),rim);diffuseColor.a=uSpiritPresence*(.58+rim*.36)*smoothstep(.05,.85,vSpiritY-uSpiritBase);\n#include <opaque_fragment>');
    };
    model.traverse(o => { if (o.isMesh) { o.material = this.spiritMaterial; o.castShadow = false; o.frustumCulled = false; } });
    const mixer = new T.AnimationMixer(model); mixer.clipAction(this.actors.motion[this.state.kind][0]).play(); mixer.setTime(.4);
    wrapper.visible = false; this.spirit = wrapper; this.spiritModel = model; this.halo = new DivineHalo(wrapper); this.halo.group.rotation.set(0,0,0);this.halo.group.position.set(0,3.4,-.8);
  }
  beginDivine(event) {
    this.divineAge = 0;this.divineSpirit=event.spiritLevel||0;this.divineAccent=event.skillAccent||event.color;this.divineTier=event.tier||0;this.divineColor=event.color||'#9acfff';this.haloBolts.material.uniforms.uTint.value.set(this.divineColor).lerp(this.color.set('#ffffff'),.4);this.haloBolts.heads.material.color.set(this.divineColor).multiplyScalar(3.2);this.divineTargetX=event.targetX;this.divineTargetZ=event.targetZ;
    this.storm.configure({ ...defaults, meteorCount: 28+this.divineTier*3+Math.min(45,this.divineSpirit), meteorSize: .65+this.divineSpirit*.003, impactRadius: 1.2+this.divineSpirit*.004, particleDensity: .7+this.divineSpirit*.006 });
    for (const m of this.storm.events) {
      const sx=m.start.x-7.5,sz=m.start.z,ex=m.end.x-7.5,ez=m.end.z,s=Math.sin(event.yaw),c=Math.cos(event.yaw),ground=heightAt(event.targetX,event.targetZ);
      m.start.set(event.targetX+sx*s-sz*c,m.start.y+ground-4.8,event.targetZ+sx*c+sz*s);
      m.end.set(event.targetX+ex*s-ez*c,m.end.y+ground,event.targetZ+ex*c+ez*s);
    }
    this.portal.mesh.position.set(event.targetX-6*Math.sin(event.yaw)+1.2*Math.cos(event.yaw),heightAt(event.targetX,event.targetZ)+9.7,event.targetZ-6*Math.cos(event.yaw)-1.2*Math.sin(event.yaw));
    this.portal.mesh.rotation.set(-Math.PI/2+.42,event.yaw-Math.PI/2,0,'YXZ');
    this.targetSeal.mesh.position.set(event.targetX,heightAt(event.targetX,event.targetZ)+.13,event.targetZ);
    if (!this.spirit) this.installSpirit();
    const x = event.x - Math.sin(event.yaw) * 2.5, z = event.z - Math.cos(event.yaw) * 2.5;
    this.spirit.position.set(x, heightAt(x, z), z); this.spiritBase.value = heightAt(x, z); this.spirit.rotation.y = event.yaw;
  }
  burst(x, z, element = 'frost', radius = 1, count = 12, style=null) {
    if(style?.spiritLevel){radius*=1+style.spiritLevel*.003;count+=Math.min(8,style.skillStage||0);}
    const color=this.color.set(style?.color||PALETTE[element]||PALETTE.frost).multiplyScalar(style?.radiance||1.3);
    const ring = this.bursts.find(b => !b.alive); if (ring) Object.assign(ring, { alive: true, x, z, age: 0, radius, element,air:false,rank:style?.tier||0,r:color.r,g:color.g,b:color.b });
    if((style?.tier||0)>=2){const flare=this.bursts.find(b=>!b.alive);if(flare)Object.assign(flare,{alive:true,x,z,age:0,radius:radius*.78,element,air:true,rank:style.tier,r:color.r,g:color.g,b:color.b});}
    for (let i = 0; i < count; i++) {
      const p = this.shards.find(p => !p.alive); if (!p) break;
      const a = Math.random() * Math.PI * 2, speed = 2 + Math.random() * radius * 5;
      Object.assign(p, { alive: true, x, y: heightAt(x, z) + 1, z, vx: Math.sin(a) * speed, vy: 1.5 + Math.random() * 5, vz: Math.cos(a) * speed, life: .35 + Math.random() * .65, age: 0, size: .025 + Math.random() * .065 * Math.sqrt(radius), spin: Math.random() * 10, r: color.r * 1.4, g: color.g * 1.4, b: color.b * 1.4 });
    }
    if((style?.skillStage||0)>=2&&!style.echo){const orbit=this.bursts.find(b=>!b.alive);if(orbit){this.color.set(style.skillAccent);Object.assign(orbit,{alive:true,x,z,age:-.07,radius:radius*(1.12+style.skillStage*.05),element,air:false,rank:0,r:this.color.r,g:this.color.g,b:this.color.b});}}
    this.baseLightPosition.set(x, heightAt(x, z) + 2, z); this.baseLightColor.copy(color); this.lightAge = .2;
  }
  handle(event) {
    this.loot.handle(event);this.thunder.handle(event);this.ascendant.handle(event);
    this.spiritBolts?.handle(event);
    this.fervor.handle(event);this.shield.handle(event);this.resonance.handle(event);
    if(event.type==='revive'){this.divineAge=100;this.projectileTrails.reset();for(const slot of this.bladePool){slot.trail.reset();slot.projectile=null;slot.group.visible=false;}for(const b of this.bursts)b.alive=false;for(const p of this.shards)p.alive=false;this.melee=null;}
    if(event.type==='attack'&&event.kind==='ice'){const p=this.state.attackSocket||this.state.player;this.burst(p.x,p.z,'arrow',.18,3);}
    if(event.type==='hit'&&event.fervor&&!event.fervorSplash)this.burst(event.x,event.z,'spirit',event.finisher?event.finishRadius:.4,event.finisher?12:3,{color:event.color,radiance:1.35,tier:event.finisher?3:0});
    if (event.type === 'hit'&&event.element!=='halo'&&event.element!=='awakening'&&!event.fervor&&!(this.spiritBolts&&event.element==='spirit'&&event.primary)) this.burst(event.x,event.z,event.element,event.element==='frost'||event.element==='slash'?1.5:.65,event.element==='arrow'?7:12,event.echo?{color:event.color,radiance:event.radiance,spiritLevel:event.spiritLevel,skillStage:event.skillStage,skillAccent:event.skillAccent,echo:true}:event);
    if (event.type === 'burst' || event.type === 'seal' || event.type === 'bossPhase' || event.type === 'ascend') this.burst(event.x, event.z, event.element || 'star', event.radius || 2, 20,event);
    if(event.type==='spawn'&&event.enemy.elite)this.burst(event.enemy.x,event.enemy.z,'enemy',.8,6,{color:event.enemy.color});
    if (event.type === 'divine') this.beginDivine(event);
    if(event.type==='chest')this.burst(event.x,event.z,'star',.45,8);
    if (event.type === 'heal' || event.type === 'dodge') this.burst(event.x, event.z, event.type === 'heal' ? 'heal' : 'frost', 1.4, 18);
    if (event.type === 'melee') {
      this.melee = { age: 0, x: event.x + Math.sin(event.yaw), z: event.z + Math.cos(event.yaw), yaw: event.yaw, combo: event.combo };
    }
    if(event.type==='projectile'){
      const b=event.projectile;this.projectileTrails.begin(b);
      if(b.kind==='slash'){
        const slot=this.bladePool.find(s=>!s.projectile||s.drain>.35)||this.bladePool.find(s=>!s.projectile.alive);
        if(slot){slot.projectile=b;slot.generation=b.generation;slot.drain=0;slot.wasAlive=true;slot.trail.reset();slot.last.set(b.x,b.y,b.z);slot.config.bladeSize=b.scale;slot.config.trailLength=(b.primary?1.85:2.6)*(b.swordStyle?.trail||1);slot.config.gameStyle=true;slot.config.fervorStrength=b.swordStyle?.strength||0;slot.config.energyColor=b.color;slot.config.lightningColor=b.skillAccent||b.color;slot.lastShed=-1;}
      }
    }
  }
  update(dt) {
    this.thunder.update(dt);this.ascendant.update(dt);this.loot.update(dt);
    const t=this.state.time;this.blade.group.visible=false;this.haloBolts.update(t);this.projectileTrails.update(dt,t,this.state.projectiles);
    this.spiritBolts?.update(dt);
    this.fervor.update(dt);this.shield.update(dt);this.resonance.update(dt);
    let heads=0,arrowHeads=0;for(const root of this.arrowHeads)root.visible=false;
    for(const b of this.state.projectiles){
      const drain=this.projectileTrails.age[b.id],consuming=!b.alive&&b.retiredReason==='hit'&&drain<.075;
      if((!b.alive&&!consuming)||b.age<b.delay||b.kind==='slash'||b.fervor||(this.spiritBolts&&isSpiritBolt(b)))continue;
      this.projectileTrails.getDirection(b.id,this.motion);this.dummy.position.set(b.x,b.y,b.z);
      if((b.kind==='frost'||b.kind==='arrow')&&arrowHeads<this.arrowHeads.length){const root=this.arrowHeads[arrowHeads++];root.visible=true;root.position.copy(this.dummy.position);root.quaternion.setFromUnitVectors(this.zAxis,this.motion);root.scale.setScalar(b.scale);root.userData.energy.tint.value.set(b.color);root.userData.energy.power.value=Math.min(1.5,b.radiance);root.userData.energy.rank.value=b.tier;root.userData.energy.spirit.value=b.spiritLevel/50;root.userData.energy.time.value=t;if(consuming){root.position.addScaledVector(this.motion,drain*2);root.scale.z*=Math.max(.001,1-drain/.075);}}
      else {const size=b.owner==='enemy'?.075:.045;this.dummy.quaternion.setFromUnitVectors(this.yAxis,this.motion);this.dummy.scale.set(size,size*2.6,size*.6);this.dummy.updateMatrix();this.heads.setMatrixAt(heads,this.dummy.matrix);this.color.set(b.owner==='enemy'?PALETTE.enemy:b.color).multiplyScalar(Math.min(1.8,b.radiance));this.color.toArray(this.headColors,heads++*3);}
    }
    for(const slot of this.bladePool){
      const b=slot.projectile;if(!b){slot.group.visible=false;continue;}
      const alive=b.alive&&b.generation===slot.generation,emitting=alive&&b.age>=b.delay;
      if(emitting){slot.last.set(b.x,b.y,b.z);slot.group.position.copy(slot.last);slot.group.rotation.set(-1.05+(b.id%3-1)*.15,b.yaw-Math.PI/2,0,'YXZ');slot.group.scale.setScalar(b.scale);slot.drain=0;}
      else if(!alive)slot.drain+=dt;
      slot.group.visible=emitting||(!alive&&slot.drain<.15);
      const u=slot.uniforms;u.uTime.value=t;u.uFormation.value=Math.min(1,Math.max(0,b.age-b.delay)*16);u.uLife.value=alive?Math.min(1,(b.life-b.age)*8):Math.max(0,1-slot.drain/.15);u.uImpact.value=alive?0:Math.min(1,slot.drain/.15);u.uColor.value.set(slot.config.energyColor);u.uPurple.value.set(slot.config.lightningColor);if(u.uRank)u.uRank.value=b.tier;if(u.uSpirit)u.uSpirit.value=b.spiritLevel/50;if(u.uGameStyle)u.uGameStyle.value=1;if(u.uFervor)u.uFervor.value=b.swordStyle?.strength||0;
      if(emitting&&(b.spiritLevel||b.swordStyle?.shards)&&t-slot.lastShed>(b.primary?.16:.1)){this.shedSpellFragments(slot,b);slot.lastShed=t;}
      if(slot.wasAlive&&!alive&&b.retiredReason==='hit'){this.point.set(b.x,b.y,b.z);slot.trail.impact(this.point,t,slot.group.quaternion);}
      slot.trail.update(dt,t,slot.last,emitting,this.camera,slot.config,undefined,slot.group.quaternion);slot.wasAlive=alive;
      if(slot.drain>.4){slot.projectile=null;slot.group.visible=false;slot.trail.reset();}
    }
    this.heads.count=heads;this.heads.instanceMatrix.needsUpdate=true;this.heads.geometry.attributes.aTint.needsUpdate=true;
    let shards = 0;
    for (const p of this.shards) if (p.alive) {
      p.age += dt; if (p.age >= p.life) { p.alive = false; continue; }
      p.x += p.vx * dt; p.z += p.vz * dt; p.vy -= dt * 9; p.y += p.vy * dt;
      const size = p.size * (1 - p.age / p.life); this.dummy.position.set(p.x, p.y, p.z); this.dummy.rotation.set(p.age * p.spin, p.age * 3, p.age * 8); this.dummy.scale.setScalar(size); this.dummy.updateMatrix();
      this.shardMesh.setMatrixAt(shards, this.dummy.matrix); this.color.setRGB(p.r, p.g, p.b); this.color.toArray(this.shardColors,shards++*3);
    }
    this.shardMesh.count = shards; this.shardMesh.instanceMatrix.needsUpdate = true; this.shardMesh.geometry.attributes.aTint.needsUpdate=true;
    let rings = 0;
    for (const b of this.bursts) if (b.alive) {
      b.age += dt; if(b.age<0)continue; if (b.age > .55) { b.alive = false; continue; }
      this.dummy.position.set(b.x,heightAt(b.x,b.z)+(b.air?1.15:.06),b.z);if(b.air)this.dummy.quaternion.copy(this.camera.quaternion);else this.dummy.rotation.set(-Math.PI/2,0,0);this.dummy.scale.setScalar(b.radius*1.6);this.dummy.updateMatrix();this.rings.setMatrixAt(rings,this.dummy.matrix);this.ringAges[rings]=b.age/.55;this.ringKinds[rings]=b.air?2+b.rank:0;this.ringColors[rings*3]=b.r;this.ringColors[rings*3+1]=b.g;this.ringColors[rings*3+2]=b.b;rings++;
    }
    this.rings.count = rings; this.rings.instanceMatrix.needsUpdate = true; this.rings.geometry.attributes.aAge.needsUpdate = this.rings.geometry.attributes.aKind.needsUpdate = true;
    this.rings.geometry.attributes.aColor.needsUpdate=true;
    this.updateWarnings(); this.lightAge -= dt; this.light.intensity = Math.max(0, this.lightAge) * 80;this.light.position.copy(this.baseLightPosition);this.light.color.copy(this.baseLightColor);this.light.distance=12;
    for(const cue of this.lightCues)if(cue.intensity>this.light.intensity){this.light.position.copy(cue.position);this.light.color.copy(cue.color);this.light.intensity=cue.intensity;this.light.distance=24;}
    this.divineAge += dt;
    if (this.divineAge < 4.7) {
      const age = this.divineAge; this.storm.group.visible = true; this.storm.update(age + 1.6);
      const opacity = Math.min(1, age * 2.5) * Math.max(0, Math.min(1, (4.2 - age) * 2));
      this.portal.update(t, Math.min(1, age * 2), opacity * .55, '#a9def0');
      this.targetSeal.update(t*1.8,Math.min(1,age*3),opacity*.62,'#b990ff');
      this.spirit.updateWorldMatrix(true,false);this.view.copy(this.camera.position);this.spirit.worldToLocal(this.view);
      const clear=spiritViewFade(this.view.x,this.view.y,this.view.z);
      this.spirit.visible = clear>.001; this.presence.value = opacity*clear; this.halo.update(t,opacity*clear*.9,.64,this.divineColor,3.4);
    } else { this.storm.group.visible = false; this.portal.mesh.visible = this.targetSeal.mesh.visible = false; if (this.spirit) this.spirit.visible = false; }
  }
  shedSpellFragments(slot,b){
    slot.group.updateMatrixWorld(true);this.color.set(b.skillAccent);
    for(let j=0;j<Math.min(3,Math.max(b.skillStage,b.swordStyle?.shards||0));j++){
      const shard=this.shards.find(s=>!s.alive);if(!shard)return;
      const index=(Math.floor(this.state.time*20)+j*8)%25;this.point.fromArray(this.bladeProfile,index*3).applyMatrix4(slot.group.matrixWorld);
      Object.assign(shard,{alive:true,x:this.point.x,y:this.point.y,z:this.point.z,vx:-Math.sin(b.yaw)*2+(j-1)*.8,vz:-Math.cos(b.yaw)*2,vy:1.3,life:.35+j*.07,age:0,size:.025+Math.max(b.spiritLevel,b.fervorLevel||0)*.0003,spin:5+j*3,r:this.color.r*1.5,g:this.color.g*1.5,b:this.color.b*1.5});
    }
  }
  updateWarnings() {
    let count = 0;
    const write = (x, z, radius, phase) => { if (count >= 64) return; this.dummy.position.set(x, heightAt(x, z) + .07, z); this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.scale.setScalar(radius); this.dummy.updateMatrix(); this.warnings.setMatrixAt(count, this.dummy.matrix); this.warningProgress[count++] = phase; };
    for (const e of this.state.enemies) if (e.hp > 0) {
      if(e.spawnGrace>0)write(e.x,e.z,.9,1-e.spawnGrace/.75);
      if(e.state==='windup'){const targeted=e.type==='caster'||e.ability==='storm';write(targeted?e.targetX:e.x,targeted?e.targetZ:e.z,targeted?1.9:Math.min(e.range,3.5),1-e.timer/e.windup);}
    }
    for (const z of this.state.zones) if (z.alive && z.owner === 'enemy') write(z.x, z.z, z.radius, z.age / z.delay);
    this.warnings.count = count; this.warnings.instanceMatrix.needsUpdate = true; this.warnings.geometry.attributes.aProgress.needsUpdate = true;
  }
  dispose() {
    this.thunder.dispose();this.ascendant.dispose();this.loot.dispose();
    this.spiritBolts?.dispose();
    this.shield.dispose();this.resonance.dispose();this.fervor.dispose();this.projectileTrails.dispose();for(const s of this.bladePool)s.trail.dispose();this.blade.dispose(); this.storm.dispose(); this.portal.dispose(); this.targetSeal.dispose(); this.halo?.dispose();this.haloBolts.dispose();
    const geometries = new Set(), materials = new Set(); this.group.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m); });
    // Spirit geometry is shared with the actor source and is released there.
    this.spiritModel?.traverse(o => { if (o.geometry) geometries.delete(o.geometry); if (o.isSkinnedMesh) o.skeleton.dispose(); });
    for(const root of this.arrowHeads)root.traverse(o=>{if(o.geometry)geometries.delete(o.geometry);});
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.group.removeFromParent();
  }
}
