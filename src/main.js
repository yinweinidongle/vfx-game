import './style.css';
import * as THREE from 'three';
import { config } from './VFXConfig.js';
import { SceneManager } from './scene/SceneManager.js';
import { Actors } from './scene/Actors.js';
import { SwordFighter } from './scene/SwordFighter.js';
import { Cultivator } from './scene/Cultivator.js';
import { CharacterStatusFX } from './vfx/CharacterStatusFX.js';
import { SkillShowcase } from './SkillShowcase.js';
import { ControlPanel, createLayout } from './ui/ControlPanel.js';

createLayout();
try {
  const scene = new SceneManager(document.querySelector('#viewport'), config);
  const actors = new Actors(scene.scene, config);
  const swordsman = new SwordFighter(scene.scene, config);
  const cultivator = new Cultivator(scene.scene, config);
  const statusFX = new CharacterStatusFX(scene.scene, actors, config);
  const skill = new SkillShowcase(scene.scene, scene.camera, config, actors, swordsman, statusFX, cultivator);
  const ui = new ControlPanel(config, skill, scene);
  document.querySelector('#loading small').textContent = '加载修士、法相专属动作、剑客与射手…';
  const clock = new THREE.Clock();
  const originLabel = document.querySelector('#origin-label');
  const targetLabel = document.querySelector('#target-label');
  const marker = new THREE.Vector3();
  let frames = 0, elapsed = 0, fps = 60;
  let ready = false;
  let raf;
  const projectMarker = (element, x) => {
    marker.set(x, .05, 1.9).project(scene.camera);
    const w = scene.container.clientWidth, h = scene.container.clientHeight;
    element.style.left = `${(marker.x * .5 + .5) * w}px`;
    element.style.top = `${(-marker.y * .5 + .5) * h + 17}px`;
    element.style.opacity = marker.z > 1 || Math.abs(marker.x) > .9 || ['follow', 'cinematic'].includes(config.cameraMode) ? '0' : '.8';
  };
  function animate() {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .05);
    scene.selectDirector(skill);
    if (ready) {
      const tempo = config.cameraMode === 'cinematic' ? scene.director.getTimeScale(skill) : 1;
      skill.update(dt * tempo, dt);
      skill.updateActors(dt);
    }
    scene.update(dt, skill);
    // Rebuild camera-facing ribbons after a cut, without advancing any simulation.
    if (ready) skill.refreshView();
    scene.render();
    frames++; elapsed += dt;
    if (elapsed > .5) { fps = frames / elapsed; frames = 0; elapsed = 0; }
    ui.update(fps, scene.renderer.info.render.calls);
    projectMarker(originLabel, -8.4);
    projectMarker(targetLabel, 7.5);
  }
  animate();
  const assetsReady = Promise.allSettled([
    actors.ready,
    swordsman.ready,
    cultivator.ready,
    skill.cultivator.avatar.loadStandingAnimation(`${import.meta.env.BASE_URL}models/divine-standing.fbx`),
    skill.ice.loadArrowAsset(`${import.meta.env.BASE_URL}models/frost-arrow-v2.glb`, {
      forwardAxis: '+Y', rotationXYZ: [Math.PI / 2, 0, 0], preserveAspect: true,
      detailStrength: 1.15, envMapIntensity: 0.85, core: false,
    }),
    actors.loadGeneratedBow(`${import.meta.env.BASE_URL}models/frost-bow-v2.glb`, {
      rotationXYZ: [0, Math.PI / 2, 0], height: 1.9,
      gripPoint: [0, 0, 0.08],
      stringAnchors: [[-0.25631, -0.56569, 0], [-0.25631, 0.59072, 0]],
      // This asset's baked string corridor; replace it with the live drawn string.
      embeddedStringCut: {
        min: [-0.014, -0.565, -0.192], max: [0.014, 0.59, -0.155],
        axis: 'y', maxRemovalFraction: 0.08,
      },
    }),
    swordsman.loadSwordAsset(`${import.meta.env.BASE_URL}models/storm-sword-v3.glb`, {
      height: 1.5, rotationXYZ: [0, 0, 0], gripFraction: .17,
    }),
    Promise.resolve().then(() => skill.sword.blade.loadTexture(`${import.meta.env.BASE_URL}textures/anime-crescent-v1.png`, { alphaThreshold: 24 })).then(() => {
      const profile = new Float32Array(75);
      if (skill.sword.blade.getTrailProfile(profile, 25)) {
        skill.sword.trail.setProfile(profile, { launchStretch: true });
        skill.sword.lightning.setSurfaceProvider(skill.sword.blade);
      }
    }),
  ]);
  assetsReady.then(results => {
    for (const result of results) if (result.status === 'rejected') console.warn('Optional asset fallback:', result.reason);
  }).finally(() => {
    skill.bindActors();
    ready = true;
    document.querySelector('#loading').classList.add('hidden');
    document.querySelector('#loading').setAttribute('aria-hidden', 'true');
    skill.fire();
    // The complete first launch is shown at the selected preview speed.
    clock.getDelta();
  });
  document.addEventListener('visibilitychange', () => { clock.getDelta(); });
  window.addEventListener('beforeunload', () => { ready = false; cancelAnimationFrame(raf); statusFX.dispose(); skill.dispose(); swordsman.dispose(); cultivator.dispose(); actors.dispose(); scene.dispose(); });
  window.__frostbound = { config, scene, skill, actors, swordsman, cultivator, statusFX, ui, cultivatorSkill: skill.cultivator, iceSkill: skill.ice, swordSkill: skill.sword, assetsReady };
} catch (error) {
  console.error(error);
  document.querySelector('#loading').innerHTML = '<div class="error">无法初始化 WebGL 场景。请使用开启硬件加速的桌面浏览器。<br><small></small></div>';
  document.querySelector('#loading small').textContent = error.message;
}
