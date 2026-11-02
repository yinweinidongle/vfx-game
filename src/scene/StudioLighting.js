import * as THREE from 'three';

const smooth = THREE.MathUtils.smoothstep;

/** Warm key / cool rim studio lighting, with one off-body spell bounce. */
export class StudioLighting {
  constructor(scene, renderer, config) {
    this.scene = scene; this.renderer = renderer; this.config = config; this.disposed = false;
    this.previous = {
      background: scene.background, fog: scene.fog, environmentIntensity: scene.environmentIntensity,
      exposure: renderer.toneMappingExposure, shadowEnabled: renderer.shadowMap.enabled, shadowType: renderer.shadowMap.type,
    };
    this.group = new THREE.Group(); this.group.name = 'Cinematic frost studio lighting'; scene.add(this.group);
    this.background = new THREE.Color('#2b3540'); this.fog = new THREE.FogExp2('#2b3540', .014);
    this.exposure = 1.12; this.environmentIntensity = .30;
    scene.background = this.background; scene.fog = this.fog; scene.environmentIntensity = this.environmentIntensity;
    renderer.toneMappingExposure = this.exposure; renderer.shadowMap.enabled = true;
    // PCF respects the light's radius; PCFSoft uses a fixed kernel in Three.js.
    renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.needsUpdate = true;

    this.hemisphere = new THREE.HemisphereLight('#d2e1ed', '#57534e', 1.05);
    this.hemisphere.name = 'Restrained sky and warm floor fill'; this.hemisphere.position.set(0, 12, 0);
    this.group.add(this.hemisphere);

    this.key = new THREE.DirectionalLight('#fff1df', 2.75);
    this.key.name = 'Warm neutral key · soft contact shadows'; this.key.position.set(-3.5, 10.5, 7);
    this.key.target.position.set(0, .55, 0); this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -12.5, right: 12.5, top: 7.5, bottom: -7, near: .5, far: 29 });
    this.key.shadow.camera.updateProjectionMatrix(); this.key.shadow.radius = 2.35;
    this.key.shadow.normalBias = .013; this.key.shadow.bias = -.00008; this.key.shadow.intensity = .90;
    this.group.add(this.key, this.key.target);

    this.rim = new THREE.DirectionalLight('#99cbe6', 1.48);
    this.rim.name = 'Cool rear separation'; this.rim.position.set(2.5, 5.7, -7.5);
    this.rim.target.position.set(0, 1.05, 0); this.group.add(this.rim, this.rim.target);

    this.fill = new THREE.DirectionalLight('#dce7f1', .68);
    this.fill.name = 'Soft camera-side texture fill'; this.fill.position.set(1, 3.5, 12);
    this.fill.target.position.set(0, 1.15, 0); this.group.add(this.fill, this.fill.target);

    // Positioned above and in front of the action: a broad environment response,
    // never a second intense point source embedded inside the actor's skin.
    this.bounce = new THREE.PointLight(config.frostColor, 0, 10, 2);
    this.bounce.name = 'Off-body icy floor bounce'; this.bounce.position.set(-7.5, 4.3, 2.8);
    this.bounce.castShadow = false; this.group.add(this.bounce);
    this.white = new THREE.Color('#e1f5ff'); this.anchor = new THREE.Vector3();
  }

  update(skill) {
    if (this.disposed || !skill?.timeline) return;
    const { timeline } = skill, time = timeline.time, impactTime = timeline.impactTime;
    const sword = skill.kind === 'sword', cultivator = skill.kind === 'cultivator', launchTime = cultivator ? 1.6 : sword ? .65 : .75;
    const skillConfig = skill.config || this.config;
    this.background.set(cultivator ? '#182538' : '#2b3540');this.fog.color.copy(this.background);
    this.key.color.set(cultivator ? '#dce7ff' : '#fff1df');
    if (timeline.phase === 'idle' || time <= .015 || !Number.isFinite(time)) {
      this.bounce.intensity = 0; return;
    }
    const launched = time >= launchTime, hit = time >= impactTime;
    this.anchor.copy(hit ? skill.target : launched ? skill.position : skill.origin);
    this.bounce.position.copy(this.anchor);
    this.bounce.position.x -= .65;
    this.bounce.position.y = Math.max(3.5, this.anchor.y + 2.6);
    this.bounce.position.z += 2.8;
    this.bounce.color.set(cultivator ? (skillConfig.divineColor || '#ffc86a') : sword ? (skillConfig.energyColor || skillConfig.swordColor || '#39dfff') : (skillConfig.frostColor || this.config.frostColor)).lerp(this.white, .28);
    let intensity;
    if (!launched) {
      const formation = smooth(time, .03, .27), charge = smooth(time, sword ? .28 : .35, launchTime);
      intensity = formation * (.15 + charge * .7);
    } else if (!hit) {
      const launchAge = time - launchTime;
      const flight = smooth(time, launchTime, impactTime);
      intensity = 2.2 * Math.exp(-launchAge * 30) + .65 * (1 - flight * .35);
    } else {
      const age = time - impactTime;
      intensity = 3.8 * Math.exp(-age * 12) * (1 - smooth(age, .42, .8));
    }
    this.bounce.intensity = Math.max(0, Math.min(3.8, intensity));
  }

  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.bounce.intensity = 0; this.key.shadow.dispose(); this.group.removeFromParent();
    if (this.scene.background === this.background) this.scene.background = this.previous.background;
    if (this.scene.fog === this.fog) this.scene.fog = this.previous.fog;
    if (this.scene.environmentIntensity === this.environmentIntensity) this.scene.environmentIntensity = this.previous.environmentIntensity;
    if (this.renderer.toneMappingExposure === this.exposure) this.renderer.toneMappingExposure = this.previous.exposure;
    if (this.renderer.shadowMap.type === THREE.PCFShadowMap) this.renderer.shadowMap.type = this.previous.shadowType;
    this.renderer.shadowMap.enabled = this.previous.shadowEnabled; this.renderer.shadowMap.needsUpdate = true;
  }
}
