import * as THREE from 'three';
import { GeneratedArrowAsset } from './GeneratedArrowAsset.js';
import { IceArrowMesh } from './IceArrowMesh.js';
import { FrostTrail } from './FrostTrail.js';
import { FrostParticles } from './FrostParticles.js';
import { IceImpact } from './IceImpact.js';
import { HomingArrows } from './HomingArrows.js';
import { SkillTimeline } from './SkillTimeline.js';
import { ORIGIN, TARGET } from '../VFXConfig.js';

const IMPACT_CONSUME_TIME = 0.18;
const LOCAL_FORWARD = new THREE.Vector3(1, 0, 0);
const PLANE_NORMAL = new THREE.Vector3(0, 0, 1);

export class IceArrowSkill {
  constructor(scene, camera, config) {
    this.config = config;
    this.scene = scene;
    this.camera = camera;
    this.actors = null;
    this.chargeRing = null;
    this.origin = new THREE.Vector3(...ORIGIN);
    this.target = new THREE.Vector3(...TARGET);
    this.position = this.origin.clone();
    this.direction = new THREE.Vector3(1, 0, 0);
    this.flightOrientation = new THREE.Quaternion();
    this.orientation = new THREE.Quaternion();
    this.flightEnd = this.target.clone().addScaledVector(this.direction, -1.42 * config.arrowSize);
    this.lastArrowSize = config.arrowSize;
    this.timeline = new SkillTimeline(this.origin.distanceTo(this.flightEnd), config.flightSpeed);
    this.arrow = new IceArrowMesh(config);
    scene.add(this.arrow.group);
    this.trail = new FrostTrail(scene, config);
    this.particles = new FrostParticles(scene, config);
    this.impact = new IceImpact(scene, config);
    this.homing = new HomingArrows(scene, config);
    this.homingTarget = this.target.clone();
    this.homingContext = {
      origin: this.origin, mainPosition: this.position, mainEnd: this.flightEnd, mainArcHeight: 0, target: this.homingTarget,
      impactTime: this.timeline.impactTime, arrowSize: config.arrowSize, camera, config,
      targetAtTime: (time, out) => this.sampleTarget(time, out),
    };
    this.launched = false;
    this.hit = false;
    this.launchFlash = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), new THREE.ShaderMaterial({
      uniforms: { uAge: { value: 1 }, uColor: { value: new THREE.Color(config.frostColor) } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;uniform float uAge;uniform vec3 uColor;void main(){vec2 p=vUv-.5;float r=length(p);float a=atan(p.y,p.x);float ring=exp(-abs(r-(.08+uAge*2.5))*90.)*.6;float star=pow(max(0.,1.-abs(sin(a*3.))),24.)*exp(-r*12.);float core=exp(-r*60.)*2.;float fade=pow(max(0.,1.-uAge/.15),2.);gl_FragColor=vec4(mix(uColor*1.6,vec3(2.),.6),(ring+star+core)*fade);}`,
    }));
    this.launchFlash.quaternion.setFromUnitVectors(PLANE_NORMAL, this.direction);
    this.launchFlash.position.copy(this.origin);
    this.launchFlash.renderOrder = 5;
    this.launchFlash.visible = false;
    scene.add(this.launchFlash);
    this.loops = 0;
    this.loopWait = 0;
    this.light = new THREE.PointLight('#58dfff', 0, 5, 2);
    scene.add(this.light);
  }
  /** Actors stay optional so the VFX can also be used without a character rig. */
  bindActors(actors) {
    this.actors = actors;
    this.calibrateTrajectory();
    this.dirty = true;
  }
  calibrateTrajectory() {
    if (this.actors) {
      this.actors.sampleArrowPose(.75, 'charge', this.timeline.impactTime, this.config.arrowSize, this.origin, this.flightOrientation);
    }
    this.direction.subVectors(this.target, this.origin).normalize();
    this.flightOrientation.setFromUnitVectors(LOCAL_FORWARD, this.direction);
    this.flightEnd.copy(this.target).addScaledVector(this.direction, -1.42 * this.config.arrowSize);
    this.timeline.retime(this.origin.distanceTo(this.flightEnd), this.config.flightSpeed);
    this.lastArrowSize = this.config.arrowSize;
    this.launchFlash.position.copy(this.origin);
    this.launchFlash.quaternion.setFromUnitVectors(PLANE_NORMAL, this.direction);
  }
  sampleTarget(time, out) {
    if (this.actors) this.actors.sampleTargetPosition(time, this.timeline.impactTime, out);
    else out.copy(this.target);
    return out;
  }
  async loadArrowAsset(url, options = {}) {
    const asset = new GeneratedArrowAsset(this.config);
    try { await asset.load(url, options); }
    catch (error) { asset.dispose(); throw error; }
    const previous = this.arrow;
    const ring = this.chargeRing || previous.ring;
    if (ring) { ring.removeFromParent(); asset.group.add(ring); this.chargeRing = ring; }
    asset.group.position.copy(this.position);
    asset.group.quaternion.copy(this.orientation);
    asset.group.visible = previous.group.visible;
    this.scene.add(asset.group);
    this.arrow = asset;
    previous.dispose();
    this.dirty = true;
    return asset.metadata;
  }
  updateChargeRing(time, charge) {
    if (!this.chargeRing) return;
    this.chargeRing.visible = charge > 0.015;
    this.chargeRing.material.uniforms.uTime.value = time;
    this.chargeRing.material.uniforms.uColor.value.set(this.config.frostColor);
    this.chargeRing.material.uniforms.uAlpha.value = charge * 0.55;
  }
  reset() {
    this.timeline.reset();
    this.calibrateTrajectory();
    this.position.copy(this.origin);
    this.orientation.copy(this.flightOrientation);
    this.trail.reset(); this.particles.reset(); this.impact.reset(); this.homing.reset();
    this.arrow.setImpact(0);
    this.launched = false; this.hit = false; this.loopWait = 0;
    this.arrow.group.visible = false;
    this.launchFlash.visible = false;
  }
  fire() { this.reset(); this.timeline.playing = true; this.loops++; }
  seek(time) {
    const paused = this.timeline.playing;
    this.reset(); this.timeline.playing = true;
    const targetTime = THREE.MathUtils.clamp(time, 0, this.timeline.duration);
    while (this.timeline.time < targetTime - 0.000001) this.step(Math.min(1 / 120, targetTime - this.timeline.time));
    this.timeline.playing = paused;
    if (targetTime === 0) this.present(0);
  }
  updateArrowPose() {
    const tl = this.timeline;
    if (tl.time < .75 && this.actors) {
      this.actors.sampleArrowPose(tl.time, tl.phase, tl.impactTime, this.config.arrowSize, this.position, this.orientation);
    } else {
      this.position.lerpVectors(this.origin, this.flightEnd, tl.progress);
      this.orientation.copy(this.flightOrientation);
    }
  }
  /** Render time-dependent state without advancing simulation or emitting particles. */
  present(dt, poseReady = false) {
    const { timeline: tl, config: c } = this;
    const t = tl.time;
    if (!poseReady) this.updateArrowPose();
    const formation = THREE.MathUtils.smoothstep(t, .03, .48);
    const charge = t < .75 ? THREE.MathUtils.smoothstep(t, .35, .75) : 0;
    const consume = THREE.MathUtils.clamp((t - tl.impactTime) / IMPACT_CONSUME_TIME, 0, 1);
    this.arrow.setImpact(consume);
    this.arrow.group.visible = t > .025 && consume < 1 && tl.phase !== 'idle';
    // Nose-to-tail dissolve and equal translation keep its cut edge at the contact plane.
    this.arrow.group.position.copy(this.position).addScaledVector(this.direction, 3.42 * c.arrowSize * consume);
    this.arrow.group.quaternion.copy(this.orientation);
    this.arrow.update(t, formation, charge, c);
    this.updateChargeRing(t, charge);
    this.sampleTarget(t, this.homingTarget);
    this.homingContext.impactTime = tl.impactTime;
    this.homingContext.arrowSize = c.arrowSize;
    this.homing.update(t, this.homingContext);
    this.launchFlash.visible = t >= .75 && t < .9;
    this.launchFlash.material.uniforms.uAge.value = t - .75;
    this.launchFlash.material.uniforms.uColor.value.set(c.frostColor);
    this.launchFlash.scale.setScalar(Math.max(.65, c.arrowSize));
    this.light.position.copy(this.hit ? this.target : this.position);
    if (!this.hit) { this.light.position.y += .14; this.light.position.z += .18; }
    this.light.color.set(c.frostColor);
    this.light.intensity = this.hit ? 0 : formation * (.4 + charge * .7);
    if (tl.phase === 'idle') {
      this.light.intensity = 0; this.arrow.group.visible = false; this.launchFlash.visible = false;
      this.homing.reset();
    }
  }
  step(dt) {
    const { timeline: tl, config: c } = this;
    tl.advance(dt);
    this.updateArrowPose();
    const t = tl.time, eventTime = t + 1e-9;
    if (eventTime >= .75 && !this.launched) { this.launched = true; this.particles.burst(this.origin, 'launch', c); }
    if (eventTime >= tl.impactTime && !this.hit) {
      this.hit = true;
      this.impact.trigger(this.target, c);
      this.particles.burst(this.target, 'impact', c);
      this.trail.impact(this.target, tl.impactTime);
    }
    this.trail.update(dt, t, this.position, eventTime >= .75 && eventTime < tl.impactTime, this.camera, c, this.direction);
    this.particles.update(dt, t, this.position, tl.phase, c);
    this.impact.update(dt, t, c);
    this.present(dt, true);
    if (tl.phase === 'idle') { this.trail.reset(); this.particles.reset(); this.impact.reset(); }
  }
  update(dt) {
    if (this.config.flightSpeed !== this.timeline.speed || this.config.arrowSize !== this.lastArrowSize) {
      this.calibrateTrajectory();
      this.dirty = true;
    }
    if (this.dirty) { this.dirty = false; this.seek(this.timeline.time); }
    if (!this.timeline.playing) {
      this.present(0);
      this.trail.update(0, this.timeline.time, this.position, false, this.camera, this.config, this.direction);
      this.impact.update(0, this.timeline.time, this.config);
      return;
    }
    if (this.timeline.phase === 'idle') {
      if (this.config.autoLoop) { this.loopWait += dt; if (this.loopWait > .65) this.fire(); }
      return;
    }
    let remaining = Math.min(dt, .1) * this.config.playbackSpeed;
    while (remaining > .000001) { const step = Math.min(remaining, 1 / 90); this.step(step); remaining -= step; }
  }
  refreshView() {
    if (this.timeline.phase === 'idle') return;
    this.homing.update(this.timeline.time, this.homingContext);
    this.trail.update(0, this.timeline.time, this.position, false, this.camera, this.config, this.direction);
  }
  dispose() {
    if (this.chargeRing) { this.chargeRing.geometry.dispose(); this.chargeRing.material.dispose(); this.chargeRing.removeFromParent(); }
    this.arrow.dispose(); this.trail.dispose(); this.particles.dispose(); this.impact.dispose(); this.homing.dispose();
    this.light.removeFromParent(); this.launchFlash.geometry.dispose(); this.launchFlash.material.dispose(); this.launchFlash.removeFromParent();
  }
}
