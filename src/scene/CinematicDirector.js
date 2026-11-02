import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;
const LAUNCH_TIME = 0.75;
const FRAME_MARGIN = 0.84;
const LABELS = ['蓄弓 · 凝聚', '离弦 · 破空', '后跟 · 箭尾追摄', '反打 · 箭尖迎拍', '命中 · 霜晶迸裂', '余霜 · 消散'];
const IDS = ['draw', 'flight', 'rear', 'front', 'impact', 'resolve'];

/**
 * Deterministic, authored camera coverage. All cameras stay on the +Z side of
 * the action. update() depends on skill time, never on previous frames or dt.
 *
 * Public: target, head, tail, bounds, shotIndex, shotId, shotLabel.
 * head/tail are the framed arrow tip and chosen history endpoint in flight.
 * Release establishes the trajectory; rear/front match cuts track crystal detail.
 * bounds contains the world-space subject envelope used for frustum fitting.
 */
export class CinematicDirector {
  constructor(camera) {
    this.camera = camera;
    this.baseFar = camera.far;
    this.target = new THREE.Vector3();
    this.head = new THREE.Vector3();
    this.tail = new THREE.Vector3();
    this.historyTail = new THREE.Vector3();
    this.bounds = new THREE.Box3();
    this.shotIndex = 0;
    this.shotId = IDS[0];
    this.shotLabel = LABELS[0];
    this.visibleTrailLength = 0;
    this.framedTrailLength = 0;
    this.direction = new THREE.Vector3(1, 0, 0);
    this.viewDirection = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.point = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.anchor = new THREE.Vector3();
    this.launchSubject = new THREE.Vector3();
  }

  update(skill, aspect = this.camera.aspect) {
    const timeline = skill.timeline;
    const impact = Math.max(LAUNCH_TIME + 0.05, timeline.impactTime);
    const duration = Math.max(impact + 0.01, timeline.duration);
    const time = clamp(Number.isFinite(timeline.time) ? timeline.time : 0, 0, duration);
    const config = skill.config || {};
    const size = Math.max(0.1, config.arrowSize ?? 0.52);
    const source = skill.origin;
    const contact = skill.target;
    const position = skill.position;
    this.direction.subVectors(skill.flightEnd || contact, source);
    if (this.direction.lengthSq() < 1e-8) this.direction.set(1, 0, 0);
    else this.direction.normalize();
    this.head.copy(position).addScaledVector(this.direction, 1.42 * size);
    this.tail.copy(position).addScaledVector(this.direction, -1.94 * size);
    this.bounds.makeEmpty();
    this.visibleTrailLength = 0;
    this.framedTrailLength = 0;
    this.historyTail.copy(this.tail);
    let fov;
    let minimumDistance;
    let pullback = 1;

    if (time < LAUNCH_TIME) {
      this._setShot(0);
      const draw = smooth(time, 0, LAUNCH_TIME);
      this.target.copy(source).addScaledVector(this.direction, -0.35);
      this.target.y -= 0.12;
      this.viewDirection.set(0.20 - draw * 0.025, 0.14, 1).normalize();
      fov = lerp(37, 35.5, draw);
      minimumDistance = lerp(6.1, 5.4, draw);
      // Upper body, both hands, bow limbs, and the complete formed arrow.
      this.anchor.copy(source).addScaledVector(this.direction, -0.42);
      this._include(this.anchor, 1.2, 1.24, 0.6);
      this._include(this.head, 0.2, 0.48, 0.42);
      this._include(this.tail, 0.16, 0.45, 0.42);
    } else if (time < impact) {
      const flight = clamp((time - LAUNCH_TIME) / (impact - LAUNCH_TIME), 0, 1);
      this.visibleTrailLength = Math.min(Math.max(0, config.trailLength ?? 7.5), source.distanceTo(position));
      this.historyTail.copy(this.tail).addScaledVector(this.direction, -this.visibleTrailLength);
      if (flight < 0.18) {
        this._setShot(1);
        this.framedTrailLength = this.visibleTrailLength;
        this.tail.addScaledVector(this.direction, -this.framedTrailLength);
        this.target.lerpVectors(this.head, this.tail, 0.30);
        this.target.y -= 0.06;
        this.viewDirection.set(-0.12, 0.19, 1).normalize();
        fov = 40;
        minimumDistance = 6.7;
        this._include(this.head, 0.3, 0.7, 0.65);
        this._include(this.tail, 0.25, 0.65, 0.65);
        const opening = 1 - smooth(flight, 0.02, 0.18);
        this.launchSubject.copy(source).addScaledVector(this.direction, -0.65);
        this.anchor.lerpVectors(this.tail, this.launchSubject, opening);
        this._include(this.anchor, 0.55 * opening, 0.65 + 0.55 * opening, 0.5);
      } else {
        const front = flight >= 0.56;
        this._setShot(front ? 3 : 2);
        const progress = front ? smooth(flight, 0.56, 1) : smooth(flight, 0.18, 0.56);
        this.framedTrailLength = Math.min(this.visibleTrailLength, front ? 0.75 : 1.0);
        this.tail.addScaledVector(this.direction, -this.framedTrailLength);
        // Both match cuts pin the same geometric arrow centre to screen centre.
        // Camera stays +Z; changing the signed X offset reveals tail then tip.
        this.target.copy(position).addScaledVector(this.direction, -0.29 * size);
        if (front) {
          // Ease toward a side angle just before contact so the target's body
          // does not sit between the lens and the approaching crystal tip.
          const contactClearance = smooth(flight, 0.86, 1);
          this.viewDirection.set(lerp(0.85, 0.28, contactClearance), 0.18, 1).normalize();
          fov = lerp(35, 34.5, progress);
          minimumDistance = lerp(3.9, 3.65, progress);
        } else {
          this.viewDirection.set(lerp(-0.92, -0.82, progress), 0.22, 1).normalize();
          fov = lerp(36, 35, progress);
          minimumDistance = lerp(4.3, 3.8, progress);
        }
        const crystalRadius = Math.max(0.28, 0.62 * size);
        this._include(this.head, 0.16, crystalRadius, crystalRadius);
        this.anchor.copy(position).addScaledVector(this.direction, -2.0 * size);
        this._include(this.anchor, 0.12, crystalRadius * 0.72, crystalRadius * 0.72);
        this._include(this.tail, 0.12, 0.22, 0.25);
      }
    } else {
      const age = time - impact;
      const resolveAt = Math.min(impact + 0.48, duration);
      const resolving = time >= resolveAt;
      this._setShot(resolving ? 5 : 4);
      const resolve = resolving ? smooth(time, resolveAt, Math.max(resolveAt + 0.001, duration)) : 0;
      const radius = clamp(config.impactRadius ?? 1.6, 0.5, 3);
      this.target.copy(contact);
      this.target.x -= 0.25;
      this.target.y -= 0.30 + resolve * 0.10;
      // Hold through all six staggered contacts; only then slowly widen/orbit.
      this.viewDirection.set(lerp(-0.28, -0.13, resolve), lerp(0.22, 0.29, resolve), 1).normalize();
      fov = 40;
      minimumDistance = 8.3;
      pullback = 1 + resolve * 0.12;
      this._include(contact, 1.0 + radius * 1.55, 1.0 + radius * 0.8, 0.75 + radius * 1.05);
      this.anchor.copy(contact);
      this.anchor.y = Math.min(contact.y - 0.8, 0.35);
      this._include(this.anchor, 1.3, 0.35, 1.15);
      // Incoming companion paths and the frozen main arrow contact remain in
      // coverage even while the animated chest lowers after the first hit.
      if (skill.homingTarget) this._include(skill.homingTarget, 0.8, 0.85, 0.8);
      this.head.copy(contact);
      this.tail.copy(contact).addScaledVector(this.direction, -Math.max(1.8, 3.2 * (1 - smooth(age, 0.1, 0.65))));
      this._include(this.tail, 0.4, 0.75, 0.65);
    }

    const safeAspect = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 1, 0.25, 4);
    this.camera.aspect = safeAspect;
    this.camera.fov = fov;
    const distance = this._fitDistance(minimumDistance, safeAspect, fov) * pullback;
    // Long trails on a very narrow view can need a greater camera distance.
    // Keep the fitted subject inside the far plane without narrowing coverage.
    const envelopeRadius = this.bounds.getSize(this.offset).length() * 0.5;
    this.camera.far = Math.max(this.baseFar, distance + envelopeRadius * 2 + 10);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.target).addScaledVector(this.viewDirection, distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
    return this;
  }

  /** Authored pacing multiplier; SceneManager applies it before skill.update. */
  getTimeScale(skill) {
    const { time, impactTime: impact, duration } = skill.timeline;
    if (!Number.isFinite(time) || time >= duration) return 1;
    if (time < LAUNCH_TIME) return 0.72;
    if (time < impact) {
      const flight = clamp((time - LAUNCH_TIME) / Math.max(0.05, impact - LAUNCH_TIME), 0, 1);
      if (flight < 0.18) return 1;
      return flight < 0.56 ? 0.48 : 0.42;
    }
    const age = time - impact;
    if (age <= 0.42) return 0.46;
    const recover = lerp(0.46, 0.8, smooth(age, 0.42, 0.70));
    return lerp(recover, 1, smooth(time, Math.max(impact + 0.70, duration - 0.25), duration));
  }

  _setShot(index) {
    this.shotIndex = index;
    this.shotId = IDS[index];
    this.shotLabel = LABELS[index];
  }

  _include(center, x, y, z) {
    this.point.set(center.x - x, center.y - y, center.z - z);
    this.bounds.expandByPoint(this.point);
    this.point.set(center.x + x, center.y + y, center.z + z);
    this.bounds.expandByPoint(this.point);
  }

  _fitDistance(minimum, aspect, fov) {
    this.right.crossVectors(this.worldUp, this.viewDirection).normalize();
    this.up.crossVectors(this.viewDirection, this.right).normalize();
    const tanY = Math.tan(THREE.MathUtils.degToRad(fov * 0.5));
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
        towardCamera + this.camera.near + 0.5);
    }
    return distance;
  }
}
