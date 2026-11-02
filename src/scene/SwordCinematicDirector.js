import * as THREE from 'three';

const { clamp, lerp, smoothstep: smooth } = THREE.MathUtils;
const CHARGE_END = .45;
const RELEASE = .65;
const TRACK_START = .78;
const FRAME_MARGIN = .82;
const TILT = THREE.MathUtils.degToRad(25);
const IDS = ['charge', 'slash', 'flight', 'impact', 'resolve'];
const LABELS = ['势起 · 苍雷蓄力', '断空 · 旋身斩月', '疾行 · 剑气追摄', '命中 · 雷霆迸裂', '余波 · 残雷消散'];

/** Five deterministic shots that keep the crescent's broad face visible. */
export class SwordCinematicDirector {
  constructor(camera) {
    this.camera = camera;
    this.baseFar = camera.far;
    this.target = new THREE.Vector3();
    this.head = new THREE.Vector3();
    this.tail = new THREE.Vector3();
    this.historyTail = new THREE.Vector3();
    this.bladeUpper = new THREE.Vector3();
    this.bladeLower = new THREE.Vector3();
    this.bounds = new THREE.Box3();
    this.shotIndex = 0;
    this.shotId = IDS[0];
    this.shotLabel = LABELS[0];
    this.visibleTrailLength = 0;
    this.framedTrailLength = 0;
    this.direction = new THREE.Vector3(1, 0, 0);
    this.viewDirection = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.bladeAxis = new THREE.Vector3();
    this.bladeForward = new THREE.Vector3();
    this.bladeNormal = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.actor = new THREE.Vector3();
    this.anchor = new THREE.Vector3();
    this.shakeOffset = new THREE.Vector3();
  }

  update(skill, aspect = this.camera.aspect) {
    const timeline = skill.timeline;
    const impact = Math.max(RELEASE + .05, timeline.impactTime);
    const duration = Math.max(impact + .01, timeline.duration);
    const time = clamp(Number.isFinite(timeline.time) ? timeline.time : 0, 0, duration);
    const config = skill.config || {};
    this.bladeLocalBounds = skill.blade?.geometry?.boundingBox || null;
    this.bladeStretch = Math.max(1, skill.blade?.content?.scale.x ?? 1);
    const size = Math.max(.1, config.bladeSize ?? 1);
    const origin = skill.origin, position = skill.position, contact = skill.target;
    this.direction.subVectors(skill.flightEnd || contact, origin);
    if (this.direction.lengthSq() < 1e-8) this.direction.set(1, 0, 0);
    else this.direction.normalize();
    this.up.copy(this.worldUp).addScaledVector(this.direction, -this.direction.y).normalize();
    if (this.up.lengthSq() < .01) this.up.set(0, 0, 1);
    this.right.crossVectors(this.direction, this.up).normalize();
    this.bladeAxis.copy(this.up).multiplyScalar(Math.cos(TILT)).addScaledVector(this.right, Math.sin(TILT));
    this.bladeNormal.copy(this.right).multiplyScalar(Math.cos(TILT)).addScaledVector(this.up, -Math.sin(TILT));
    this.bladeForward.copy(skill.slashForward || this.direction);
    if (skill.slashSpan && skill.slashNormal) {
      this.bladeAxis.copy(skill.slashSpan);
      this.bladeNormal.copy(skill.slashNormal);
    }
    const horizontalSlash = Math.abs(this.bladeNormal.y);
    this.head.copy(position).addScaledVector(this.direction, .92 * size);
    this.tail.copy(position).addScaledVector(this.direction, -.20 * size);
    this.bladeUpper.copy(position).addScaledVector(this.direction, -.827 * size).addScaledVector(this.bladeAxis, 1.8 * size);
    this.bladeLower.copy(position).addScaledVector(this.direction, -.827 * size).addScaledVector(this.bladeAxis, -1.8 * size);
    this.historyTail.copy(this.tail);
    this.bounds.makeEmpty();
    this.shakeOffset.set(0, 0, 0);
    this.visibleTrailLength = 0;
    this.framedTrailLength = 0;
    if (skill.fighter?.wrapper) {
      skill.fighter.wrapper.getWorldPosition(this.actor);
      this.actor.y += 1.25;
    } else {
      this.actor.copy(origin).addScaledVector(this.direction, -2.0);
      this.actor.y -= .40;
    }
    let fov = 38, minimum = 6, pullback = 1;

    if (time < CHARGE_END) {
      this._setShot(0);
      const progress = smooth(time, 0, CHARGE_END);
      this.anchor.copy(skill.base || origin).add(skill.tip || origin).multiplyScalar(.5);
      this.target.lerpVectors(this.actor, this.anchor, .32);
      this.target.y -= .12;
      this.viewDirection.set(lerp(-.24, -.17, progress), .14, 1).normalize();
      fov = lerp(37.5, 35.5, progress);
      minimum = lerp(5.9, 5.2, progress);
      this._include(this.actor, .90, .94, .66);
      this._includeWeapon(skill, origin);
    } else if (time < Math.min(TRACK_START, impact)) {
      this._setShot(1);
      const progress = smooth(time, CHARGE_END, TRACK_START);
      this.target.lerpVectors(this.actor, position, .54);
      this.target.y += .08;
      this.viewDirection.set(lerp(-.36, -.28, progress), lerp(.19, .68, horizontalSlash), 1).normalize();
      fov = 39;
      minimum = 7.7;
      this.anchor.copy(this.actor); this.anchor.y -= .15;
      this._include(this.anchor, 1.05, 1.25, .85);
      this._includeWeapon(skill, origin);
      this._includeBlade(position, size);
    } else if (time < impact) {
      this._setShot(2);
      const progress = smooth(time, TRACK_START, impact);
      this.visibleTrailLength = Math.min(Math.max(0, config.trailLength ?? 5.5), origin.distanceTo(position));
      this.framedTrailLength = Math.min(this.visibleTrailLength, lerp(3.7, 3.1, progress));
      this.historyTail.copy(this.tail).addScaledVector(this.direction, -this.visibleTrailLength);
      this.tail.addScaledVector(this.direction, -this.framedTrailLength);
      this.target.lerpVectors(this.head, this.tail, .43);
      // A shallow rail orbit shows surface flow and thickness without turning
      // the thin crescent edge-on. The leading face stays on the right third.
      if (horizontalSlash > .5) {
        this.viewDirection.copy(this.bladeNormal);
        if (this.viewDirection.y < 0) this.viewDirection.negate();
        this.viewDirection.addScaledVector(this.direction, lerp(-.30, .20, progress));
        this.viewDirection.z += .72;
        this.viewDirection.normalize();
      } else this.viewDirection.set(lerp(-.30, .20, progress), lerp(.16, .19, progress), 1).normalize();
      fov = lerp(36.5, 35.5, progress);
      minimum = lerp(7.7, 7.25, progress);
      this._includeBlade(position, size);
      this._includeWake(this.tail, size);
    } else {
      const age = time - impact;
      const resolveAt = Math.min(impact + .45, duration);
      const resolving = time >= resolveAt;
      const progress = resolving ? smooth(time, resolveAt, Math.max(resolveAt + .001, duration)) : 0;
      this._setShot(resolving ? 4 : 3);
      const radius = clamp(config.impactRadius ?? 1.6, .3, 4) / 1.6;
      this.target.copy(contact).addScaledVector(this.direction, -.12);
      this.target.y += .13 - progress * .08;
      this.viewDirection.set(lerp(-.60, -.35, progress), lerp(.21, .28, progress), 1).normalize();
      fov = 39;
      minimum = 8.5;
      pullback = 1 + progress * .13;
      // Both tilted and ground shockwaves, shards, and the frozen target fit.
      this._include(contact, 3.18 * radius, 2.72 * radius, 3.18 * radius);
      // Keep a large configured blade inside the contact shot while it erodes.
      // This envelope stays fixed so consumption cannot trigger a camera zoom.
      this._include(contact, Math.max(2.2, -(this.bladeLocalBounds?.min.x ?? -1.25) + .85) * size, 1.9 * size, 1.1 * size);
      this.anchor.copy(contact).addScaledVector(this.direction, -.75 * size);
      this._includeBlade(this.anchor, size);
      this.anchor.addScaledVector(this.direction, .7 * size);
      this._includeBlade(this.anchor, size);
      this.anchor.copy(contact); this.anchor.y = .12;
      this._include(this.anchor, 1.0, .12, .8);
      this.head.copy(contact);
      this.tail.copy(contact).addScaledVector(this.direction, -3.0 * (1 - smooth(age, 0, .34)));
      this._include(this.tail, .24, 1.8 * size * (1 - smooth(age, .12, .34)), .88 * size);
      // Anything below the opaque stage is not part of the visible envelope.
      this.bounds.min.y = Math.max(.015, this.bounds.min.y);
      if (config.cameraShake && age >= 0 && age < .15) {
        const strength = typeof config.cameraShake === 'number' ? clamp(config.cameraShake, 0, 1) : 1;
        const envelope = smooth(age, 0, .012) * (1 - smooth(age, .012, .15)) * strength;
        this.right.crossVectors(this.worldUp, this.viewDirection).normalize();
        this.up.crossVectors(this.viewDirection, this.right).normalize();
        this.shakeOffset.copy(this.right).multiplyScalar(Math.sin(age * 155) * .04 * envelope);
        this.shakeOffset.addScaledVector(this.up, Math.sin(age * 195 + .8) * .025 * envelope);
      }
    }

    const safeAspect = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 1, .25, 4);
    this.camera.aspect = safeAspect;
    this.camera.fov = fov;
    const distance = this._fitDistance(minimum, safeAspect, fov) * pullback;
    const radius = this.bounds.getSize(this.offset).length() * .5;
    this.camera.far = Math.max(this.baseFar, distance + radius * 2 + 10);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.target).addScaledVector(this.viewDirection, distance).add(this.shakeOffset);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
    return this;
  }

  getTimeScale(skill) {
    const { time, impactTime, duration } = skill.timeline;
    if (!Number.isFinite(time) || time >= duration) return 1;
    if (time < CHARGE_END) return .72;
    if (time < RELEASE) return .9;
    if (time < impactTime) return .55;
    return time < impactTime + .45 ? .52 : 1;
  }

  _setShot(index) {
    this.shotIndex = index;
    this.shotId = IDS[index];
    this.shotLabel = LABELS[index];
  }

  _includeWeapon(skill, fallback) {
    this._include(skill.base || fallback, .26, .28, .28);
    this._include(skill.tip || fallback, .26, .28, .28);
  }

  _includeBlade(position, size) {
    // Transformed local volume includes the purple echo and launch stretch.
    for (let corner = 0; corner < 8; corner++) {
      this.point.copy(position)
        .addScaledVector(this.bladeForward, (corner & 1 ? Math.max(.94, (this.bladeLocalBounds?.max.x ?? .75) + .08) : Math.min(-1.25, (this.bladeLocalBounds?.min.x ?? -1.15) - .10)) * size * this.bladeStretch)
        .addScaledVector(this.bladeAxis, (corner & 2 ? 1.9 : -1.9) * size)
        .addScaledVector(this.bladeNormal, (corner & 4 ? .30 : -.30) * size);
      this.bounds.expandByPoint(this.point);
    }
  }

  _include(center, x, y, z) {
    this.point.set(center.x - x, center.y - y, center.z - z);
    this.bounds.expandByPoint(this.point);
    this.point.set(center.x + x, center.y + y, center.z + z);
    this.bounds.expandByPoint(this.point);
  }

  _includeWake(center, size) {
    for (let corner = 0; corner < 8; corner++) {
      this.point.copy(center)
        .addScaledVector(this.direction, (corner & 1 ? .3 : -.3) * size)
        .addScaledVector(this.bladeAxis, (corner & 2 ? 1.48 : -1.48) * size)
        .addScaledVector(this.bladeNormal, (corner & 4 ? .25 : -.25) * size);
      this.bounds.expandByPoint(this.point);
    }
  }

  _fitDistance(minimum, aspect, fov) {
    this.right.crossVectors(this.worldUp, this.viewDirection).normalize();
    this.up.crossVectors(this.viewDirection, this.right).normalize();
    const tanY = Math.tan(THREE.MathUtils.degToRad(fov * .5));
    const tanX = tanY * aspect;
    let distance = minimum;
    for (let corner = 0; corner < 8; corner++) {
      this.point.set(corner & 1 ? this.bounds.max.x : this.bounds.min.x,
        corner & 2 ? this.bounds.max.y : this.bounds.min.y,
        corner & 4 ? this.bounds.max.z : this.bounds.min.z);
      this.offset.subVectors(this.point, this.target);
      const towardCamera = this.offset.dot(this.viewDirection);
      distance = Math.max(distance,
        towardCamera + Math.abs(this.offset.dot(this.right)) / (tanX * FRAME_MARGIN),
        towardCamera + Math.abs(this.offset.dot(this.up)) / (tanY * FRAME_MARGIN),
        towardCamera + this.camera.near + .5);
    }
    return distance;
  }
}
