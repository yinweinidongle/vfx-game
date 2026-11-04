import { GameGearAppearance } from './GameGearAppearance.js';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { compactMaterialGroups } from '../scene/Cultivator.js';
import { CLASSES, heightAt } from './GameData.js';
import { GameArcherRig } from './GameArcherRig.js';
import { NightEyes } from './NightEyes.js';
import { EliteInsignia } from './EliteInsignia.js';

class CharacterTextureLoader extends T.TextureLoader {
  load(url,...callbacks) {
    // This source references an external author-local map that was not supplied.
    if(/(?:^|[/\\])akai_normal\.png$/i.test(url)&&!/^(blob:|data:)/.test(url)){
      const texture=new T.Texture();texture.userData.missingExternalNormal=true;return texture;
    }
    return super.load(url,...callbacks);
  }
}

export class GameActors {
  constructor(scene, state) { this.scene = scene; this.state = state; this.night={value:state.cycle?.night||0};this.nightEyes=new NightEyes(scene); this.enemies = new Map(); this.templates = []; this.assets = {}; this.motion = {}; }
  async load(onProgress) {
    const base = import.meta.env.BASE_URL, kind = this.state.kind;
    const manager = new T.LoadingManager(),embeddedURLs=new Set();
    const texturesReady=new Promise(resolve=>{manager.onLoad=()=>{for(const url of embeddedURLs)URL.revokeObjectURL(url);resolve();};});
    manager.setURLModifier(url=>{if(url.startsWith('blob:'))embeddedURLs.add(url);return url;});
    manager.addHandler(/\.png$/i,new CharacterTextureLoader(manager));
    manager.onProgress = (_, loaded, total) => onProgress?.(`唤醒角色与装备 · ${loaded} / ${total}`);
    const fbx = new FBXLoader(manager), gltf = new GLTFLoader(manager);
    const jobs = [
      fbx.loadAsync(`${base}models/${CLASSES[kind].model}.fbx`).then(root => { this.playerSource = root; this.prepare(root); }),
      fbx.loadAsync(`${base}models/kick-reaction.fbx`).then(root => { this.enemySource = root; this.prepare(root); }),
      fetch(`${base}game/models/${kind}-motion.json`).then(r => r.json()).then(data => { this.motion[kind] = data.map(c => T.AnimationClip.parse(c)); }),
      fetch(`${base}game/models/enemy-motion.json`).then(r => r.json()).then(data => { this.motion.enemy = data.map(c => T.AnimationClip.parse(c)); }),
    ];
    for (const [id, file] of [['sword','storm-sword-v3'], ['bow','frost-bow-v2'], ['arrow','frost-arrow-v2']]) jobs.push(gltf.loadAsync(`${base}game/models/${file}.glb`).then(g => { this.assets[id] = g.scene; this.templates.push(g.scene); }));
    const gearJob=GameGearAppearance.load().then(models=>{this.gearTemplates=models;this.templates.push(...Object.values(models));});
    await Promise.all([...jobs,gearJob,texturesReady]); this.player = this.create(this.playerSource, this.motion[kind], 2.1, null);
    this.addWeapon(this.player, kind === 'ice' ? 'bow' : kind === 'sword' ? 'sword' : null);
    this.weaponMaterials=[];this.growthTint=new T.Color();
    this.player.weapon?.traverse(o=>{if(!o.isMesh)return;const own=m=>{const c=m.clone();this.weaponMaterials.push(c);return c;};o.material=Array.isArray(o.material)?o.material.map(own):own(o.material);});
    this.templates.push(this.playerSource, this.enemySource);
    this.gearAppearance=new GameGearAppearance(this.player,this.state,this.gearTemplates);
  }
  prepare(root) {
    root.traverse(o => {
      if (!o.isMesh) return;
      compactMaterialGroups(o.geometry); o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.map) m.map.colorSpace = T.SRGBColorSpace;
        if(m.normalMap?.userData.missingExternalNormal)m.normalMap=null;
        if (m.normalMap) m.normalMap.colorSpace = T.NoColorSpace;
      }
    });
  }
  create(source, motion, height, enemy) {
    const model = clone(source), group = new T.Group(), pivot = new T.Group(); group.add(pivot); pivot.add(model); this.scene.add(group);
    const box = new T.Box3().setFromObject(model), scale = height / (box.max.y - box.min.y);
    model.scale.setScalar(scale); model.position.y = -box.min.y * scale;
    const materials = [];
    model.traverse(o => {
      if (!o.isMesh) return;
      const owned = (Array.isArray(o.material) ? o.material : [o.material]).map(m => {
        const c = m.clone(); c.transparent = true; c.opacity = 1; c.depthWrite = true;
        if (enemy) c.color.lerp(new T.Color(enemy.color), enemy.elite ? .4 : .22);
        const edge = enemy?.elite ? new T.Color(enemy.color).multiplyScalar(.65).toArray().join(',') : enemy ? '.035,.045,.065' : '.06,.15,.19';
        c.onBeforeCompile=shader=>{
          shader.uniforms.uWorldNight=this.night;shader.fragmentShader='uniform float uWorldNight;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
            float silhouette=pow(1.-abs(dot(normalize(normal),normalize(vViewPosition))),3.);
            outgoingLight=max(outgoingLight,diffuseColor.rgb*mix(${enemy?'.8':'1.35'},${enemy?'.24':'.52'},uWorldNight));
            outgoingLight+=silhouette*vec3(${edge});
            #include <opaque_fragment>`);
        };
        c.customProgramCacheKey=()=>enemy?.elite?`rpg-elite-${enemy.color}`:enemy?'rpg-enemy-cycle-fill':'rpg-hero-cycle-fill';
        materials.push(c); return c;
      });
      o.material = Array.isArray(o.material) ? owned : owned[0];
    });
    const mixer = new T.AnimationMixer(model), actions = {};
    for (const clip of motion) actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
    const attackClip = source.animations[0].clone();
    const hip = attackClip.tracks.find(t => /Hips\.position$/.test(t.name));
    if (hip) for (let i = 0; i < hip.values.length; i += 3) { hip.values[i] = hip.values[0]; hip.values[i + 2] = hip.values[2]; }
    actions.attack = mixer.clipAction(attackClip); actions.attack.setLoop(T.LoopOnce, 1); actions.attack.clampWhenFinished = true;
    actions.idle.play();
    const view = { group, pivot, model, mixer, actions, active: actions.idle, current: 'idle', materials, sourceScale: scale, enemy, upperArm: model.getObjectByName('mixamorigRightArm'), forearm: model.getObjectByName('mixamorigRightForeArm'), hand: model.getObjectByName('mixamorigRightHand') };
    view.eyes=['mixamorigLeftEye','mixamorigRightEye'].map(name=>model.getObjectByName(name));
    if (enemy?.elite) view.insignia = new EliteInsignia(pivot,enemy.color);
    if (enemy && enemy.type === 'boss') {
      const m = new T.MeshBasicMaterial({ color: '#bdefff', transparent: true, opacity: .75, toneMapped: false });
      const crown = new T.Mesh(new T.TorusGeometry(.39, .025, 6, 40), m); crown.rotation.x = Math.PI / 2; crown.position.y = 2.2; pivot.add(crown); view.crown = crown;
    }
    return view;
  }
  addWeapon(view, id) {
    if (!id) return;
    if(id==='bow'){view.archerRig=new GameArcherRig(view,this.assets.bow,this.state);return;}
    const source = this.assets[id], asset = source.clone(true), box = new T.Box3().setFromObject(asset), size = box.getSize(new T.Vector3()), centre = box.getCenter(new T.Vector3());
    const normalized = new T.Group(), height = id === 'bow' ? 1.75 : 1.42, s = height / size.y;
    asset.scale.setScalar(s); asset.position.set(-centre.x * s, -box.min.y * s - height * (id === 'bow' ? .5 : .17), -centre.z * s); normalized.add(asset);
    const hand = view.model.getObjectByName(id === 'bow' ? 'mixamorigLeftHand' : 'mixamorigRightHand'); if (!hand) return;
    normalized.scale.setScalar(1 / view.sourceScale); normalized.rotation.set(0, id === 'bow' ? Math.PI / 2 : 0, -Math.PI / 2);
    normalized.position.set(.35, 7.3, 2.45); hand.add(normalized); view.weapon = normalized;
    asset.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  switch(view, key, duration = .15) {
    const action = view.actions[key]; if (!action || view.current === key) return;
    action.reset().play(); action.setEffectiveWeight(1); action.setEffectiveTimeScale(key === 'attack' ? view.actions.attack.getClip().duration / .75 : 1);
    view.active.crossFadeTo(action, duration, false); view.active = action; view.current = key;
  }
  attack(cast = false) {
    const view = this.player; if (!view) return;
    if (view.current === 'attack') { view.active.reset().play();view.active.setEffectiveTimeScale(view.active.getClip().duration/(cast?1.2:.65/this.state.stats.attackSpeed));return; }
    this.switch(view, 'attack', .07); view.active.setEffectiveTimeScale(view.active.getClip().duration / (cast ? 1.2 : .65/this.state.stats.attackSpeed));
  }
  spawn(enemy) {
    const view = this.create(this.enemySource, this.motion.enemy, 2.2, enemy); view.group.scale.setScalar(enemy.scale);
    if (enemy.type !== 'caster' && enemy.ability !== 'storm') this.addWeapon(view, 'sword'); this.enemies.set(enemy.id, view);
  }
  update(dt) {
    const p = this.state.player, view = this.player;
    if (!view) return;
    if ((p.action !== 'attack' && p.action !== 'cast') || p.actionTime > .75) this.switch(view, p.action === 'run' ? 'run' : 'idle');
    view.group.position.set(p.x, heightAt(p.x, p.z), p.z);
    const turn=Math.atan2(Math.sin(p.yaw-view.group.rotation.y),Math.cos(p.yaw-view.group.rotation.y));
    view.group.rotation.y+=turn*(1-Math.exp(-dt*(p.action==='attack'?35:18)));view.archerRig?.restore();view.mixer.update(dt);
    view.pivot.rotation.z = p.dash > 0 ? -.25 : T.MathUtils.damp(view.pivot.rotation.z, 0, 12, dt);
    view.archerRig?.update();
    this.gearAppearance?.update();
    this.growthTint.set(this.state.growth.color);
    for(const m of this.weaponMaterials)if(m.emissive){m.emissive.copy(this.growthTint);m.emissiveIntensity=this.state.growth.tier*(p.action==='attack'?.3:.09);if(this.gearAppearance?.weaponStyle){const f=this.gearAppearance.weaponStyle;m.emissive.set(f.from).lerp(this.growthTint.set(f.to),f.mix);m.emissiveIntensity+=f.power*.32;}}
    for (const m of view.materials) if (m.emissive) m.emissive.setRGB(p.hurtFlash > 0 ? .16 : 0, 0, 0);
    for (const [id, v] of this.enemies) {
      const e = this.state.enemies[id];
      if (e.hp <= 0) {
        if (e.deathAge >= 1.4) { this.release(v);this.enemies.delete(id);continue; }
        v.pivot.rotation.x = Math.min(1.35, e.deathAge * 2); for (const m of v.materials) m.opacity = Math.max(0, 1 - e.deathAge / 1.4); if(v.insignia)v.insignia.group.visible=false;continue;
      }
      if (Math.hypot(e.x - p.x, e.z - p.z) > 48) { v.group.visible = false; continue; }
      v.group.visible = true; v.group.position.set(e.x, heightAt(e.x, e.z), e.z);
      for(const m of v.materials)m.opacity=Math.min(1,1-(e.spawnGrace||0)/.8);
      v.insignia?.update(this.state.time,e);
      v.group.rotation.y+=Math.atan2(Math.sin(e.yaw-v.group.rotation.y),Math.cos(e.yaw-v.group.rotation.y))*(1-Math.exp(-dt*14));
      this.switch(v, e.state === 'return'||e.state === 'chase' && Math.hypot(e.x - p.x, e.z - p.z) > e.range ? 'run' : 'idle');
      v.mixer.update(e.frozen > 0 ? dt * .025 : dt * .8*(1+(e.nightRage||0)*.22));
      if (e.state === 'windup' && v.upperArm) { v.upperArm.rotation.z -= .7; v.upperArm.rotation.x -= .8 * (1 - e.timer / e.windup); }
      if (e.state === 'recover' && v.upperArm) v.upperArm.rotation.x += Math.max(0, 1 - (e.cooldown - e.timer) * 3) * 1.2;
      for (const m of v.materials) if (m.emissive) m.emissive.setRGB(e.flash * 1.1 + (e.frozen > 0 ? .008 : 0), e.flash * .9 + (e.frozen > 0 ? .05 : 0), e.flash * .9 + (e.frozen > 0 ? .13 : 0));
      if (v.crown) v.crown.rotation.z += dt * .4;
    }
    this.nightEyes.update(this.enemies,this.state.time,this.state.cycle.rage);
  }
  release(v) {
    v.archerRig?.dispose();v.insignia?.dispose();v.crown?.geometry.dispose();v.crown?.material.dispose();
    v.mixer.stopAllAction();v.mixer.uncacheRoot(v.model);v.group.removeFromParent();v.materials.forEach(m=>m.dispose());
    v.model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});
  }
  dispose() {
    this.nightEyes.dispose();this.gearAppearance?.dispose();
    const views = [this.player, ...this.enemies.values()].filter(Boolean);
    for (const v of views) this.release(v);
    this.weaponMaterials?.forEach(m=>m.dispose());
    for (const root of this.templates) root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); } } });
  }
}
