import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CinematicDirector } from './CinematicDirector.js';
import { SwordCinematicDirector } from './SwordCinematicDirector.js';
import { CultivatorCinematicDirector } from './CultivatorCinematicDirector.js';
import { StudioLighting } from './StudioLighting.js';

export class SceneManager {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.iceDirector = new CinematicDirector(this.camera);
    this.swordDirector = new SwordCinematicDirector(this.camera);
    this.cultivatorDirector = new CultivatorCinematicDirector(this.camera);
    this.director = config.character === 'cultivator' ? this.cultivatorDirector : config.character === 'sword' ? this.swordDirector : this.iceDirector;
    this.setMode(config.cameraMode);
    const studio = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = pmrem.fromScene(studio, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    studio.dispose(); pmrem.dispose();
    this.lighting = new StudioLighting(this.scene, this.renderer, config);
    this.addStage();
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), config.bloomStrength, 0.45, 1.2);
    this.composer.addPass(this.bloom);
    this.screenFlashPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uFlash: { value: 0 } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform sampler2D tDiffuse;uniform float uFlash;varying vec2 vUv;void main(){vec4 color=texture2D(tDiffuse,vUv);gl_FragColor=vec4(color.rgb+vec3(.80,1.,1.)*uFlash,color.a);}`,
    });
    this.screenFlashPass.enabled = false;
    this.composer.addPass(this.screenFlashPass);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.followTarget = new THREE.Vector3();
    this.followPosition = new THREE.Vector3();
    this.lastMode = config.cameraMode;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }
  addStage() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#303840', roughness: 0.92, metalness: .08 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.14;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 11.65, .14, 128), new THREE.MeshStandardMaterial({ color: '#3d4850', roughness: .78, metalness: .18 }));
    stage.position.y = -.07;
    stage.receiveShadow = true;
    this.scene.add(stage);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(25, 25), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
      vertexShader: `varying vec2 vP; void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vP; void main(){vec2 g=abs(fract(vP-.5)-.5)/max(fwidth(vP),vec2(.0001));float line=1.-min(min(g.x,g.y),1.);float r=length(vP);float edge=1.-smoothstep(10.,11.4,r);float lane=1.-smoothstep(.02,.035,abs(abs(vP.y)-1.35));float ticks=(1.-smoothstep(.02,.04,abs(fract(vP.x*.5)-.5)))*smoothstep(1.27,1.3,abs(vP.y))*(1.-smoothstep(1.48,1.62,abs(vP.y)));float a=(line*.026+lane*.075+ticks*.08)*edge;gl_FragColor=vec4(.36,.52,.58,a);}`,
    }));
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = .006;
    this.scene.add(grid);
    this.addRing(0, 0, 11.1, '#48606c', .14);
    this.addRing(0, 0, 10.95, '#48606c', .08);
    this.addPad(-8.4, '#62a8bb');
    this.addPad(7.5, '#6696a8');
    this.addContactShadows();
    // Etched range markers, intentionally quiet beneath the effect.
    const markerMaterial = new THREE.MeshBasicMaterial({ color: '#4c6976', transparent: true, opacity: .3 });
    for (let i = -6; i <= 6; i += 2) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.035, .22), markerMaterial);
      m.rotation.x = -Math.PI / 2; m.position.set(i, .012, 1.35); this.scene.add(m);
    }
  }
  addContactShadows() {
    // A soft ambient contact layer complements the real directional shadows.
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv;void main(){vec2 p=vUv*2.-1.;float r=dot(p,p);float a=(exp(-r*5.)*.23+exp(-r*18.)*.12)*(1.-smoothstep(.55,1.,r));gl_FragColor=vec4(.025,.035,.045,a);}`,
    });
    for (const x of [-8.4, 7.5]) {
      const shadow = new THREE.Mesh(geometry, material);
      shadow.name = 'Soft ground contact';
      shadow.rotation.x = -Math.PI / 2; shadow.position.set(x, .02, 0);
      shadow.scale.set(.85, .62, 1); shadow.renderOrder = 1;
      this.scene.add(shadow);
    }
  }
  addRing(x, z, radius, color, opacity = .3) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .014, radius + .014, 128), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, .014, z);
    this.scene.add(ring);
    return ring;
  }
  addPad(x, color) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.08, .055, 64), new THREE.MeshStandardMaterial({ color: '#414e57', metalness: .18, roughness: .82 }));
    base.position.set(x, -.015, 0); base.receiveShadow = true; this.scene.add(base);
    this.addRing(x, 0, 1.03, color, .6);
    this.addRing(x, 0, 1.2, color, .2);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(.25, .01, .025), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .5 }));
      tick.position.set(x + Math.cos(a) * 1.38, .012, Math.sin(a) * 1.38); tick.rotation.y = -a; this.scene.add(tick);
    }
  }
  setMode(mode) {
    this.config.cameraMode = mode;
    this.controls.enabled = mode !== 'follow' && mode !== 'cinematic';
    this.controls.enableDamping = this.controls.enabled;
    // Clear residual orbit inertia before an authored shot or a mode switch.
    this.controls.update();
    this.camera.fov = 42; this.camera.updateProjectionMatrix();
    if (mode === 'cinematic') {
      if (this.skill) { this.selectDirector(this.skill); this.director.update(this.directorSkill, this.camera.aspect); }
      else { this.camera.position.set(-4.8, 2.8, 5.8); this.camera.lookAt(-7.5, 1.4, 0); }
      this.controls.target.copy(this.director.target);
      this.camera.updateMatrixWorld();
      return;
    }
    if (mode === 'overview' && this.config.character === 'cultivator') { this.camera.position.set(8, 14, Math.max(32, 18 / Math.max(.4,this.camera.aspect))); this.controls.target.set(-1,5,0); }
    else if (mode === 'overview') { this.camera.position.set(1.0, 6.8, Math.max(21, 10 / (Math.tan(THREE.MathUtils.degToRad(21)) * Math.max(.5, this.camera.aspect)))); this.controls.target.set(0, .9, 0); }
    if (mode === 'detail' && this.config.character === 'cultivator') { this.camera.position.set(2,7.5,15);this.controls.target.set(-10,4,-1.5); }
    else if (mode === 'detail') { this.camera.position.set(-5.0, 2.9, 5.8); this.controls.target.set(-7.7, 1.4, 0); }
    if (mode === 'target') { this.camera.position.set(4.2, 3.2, 6.6); this.controls.target.set(7.25, 1.25, 0); }
    this.controls.update();
  }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    if (this.config.cameraMode === 'overview') this.setMode('overview');
    else if (this.config.cameraMode === 'cinematic' && this.skill) { this.selectDirector(this.skill); this.director.update(this.directorSkill, this.camera.aspect); }
  }
  selectDirector(skill) {
    this.skill = skill;
    // The facade exposes common camera values; the concrete sword also exposes
    // the fighter and weapon endpoints used by its authored framing bounds.
    this.directorSkill = skill.active?.timeline ? skill.active : skill;
    this.director = this.directorSkill.kind === 'cultivator' ? this.cultivatorDirector : this.directorSkill.kind === 'sword' ? this.swordDirector : this.iceDirector;
    return this.director;
  }
  updateScreenFlash(skill) {
    const age = skill.timeline.time - skill.timeline.impactTime;
    const setting = skill.config?.screenFlash ?? this.config.screenFlash;
    const enabled = skill.kind === 'sword' && !!setting && age >= 0 && age < .08 && skill.timeline.phase !== 'idle';
    const strength = typeof setting === 'number' ? THREE.MathUtils.clamp(setting, 0, 1) : 1;
    this.screenFlashPass.enabled = enabled;
    this.screenFlashPass.uniforms.uFlash.value = enabled ? .06 * strength * Math.pow(1 - age / .08, 2) : 0;
  }
  update(dt, skill) {
    this.selectDirector(skill);
    if (this.config.cameraMode !== this.lastMode || this.lastKind !== skill.kind) { this.setMode(this.config.cameraMode); this.lastMode = this.config.cameraMode; this.lastKind = skill.kind; }
    if (this.config.cameraMode === 'cinematic') {
      this.director.update(this.directorSkill, this.camera.aspect);
      this.controls.target.copy(this.director.target);
    } else if (this.config.cameraMode === 'follow') {
      this.followTarget.copy(skill.position); this.followTarget.x -= .6;
      this.followPosition.copy(this.followTarget); this.followPosition.x -= 2.4; this.followPosition.y += 2.2; this.followPosition.z += 6.6;
      const alpha = 1 - Math.exp(-dt * 9);
      this.camera.position.lerp(this.followPosition, alpha);
      this.controls.target.lerp(this.followTarget, alpha);
      this.camera.lookAt(this.controls.target);
    } else this.controls.update();
    this.camera.updateMatrixWorld();
    this.lighting.update(skill);
    this.bloom.strength = this.config.bloomStrength;
    this.updateScreenFlash(skill);
  }
  render() { this.renderer.info.reset(); this.composer.render(); }
  dispose() {
    this.resizeObserver.disconnect(); this.controls.dispose(); this.lighting.dispose();
    this.scene.traverse(o => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>m.dispose()); });
    this.environmentTarget.dispose(); this.bloom.dispose(); this.screenFlashPass.dispose(); this.outputPass.dispose(); this.composer.dispose(); this.renderer.dispose();
  }
}
