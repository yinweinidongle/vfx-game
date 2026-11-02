import { SkillTimeline } from '../SkillTimeline.js';

export class SwordTimeline extends SkillTimeline {
  get launchTime() { return .65; }
  get impactTime() { return this.launchTime + this.distance / this.speed; }
  get progress() { return Math.min(1, Math.max(0, (this.time - this.launchTime) / (this.impactTime - this.launchTime))); }
  get phase() {
    const t = this.time + 1e-9;
    if (t < .30) return 'gather';
    if (t < .45) return 'charge';
    if (t < .65) return 'launch';
    if (t < this.impactTime) return 'flight';
    if (t < this.impactTime + .35) return 'impact';
    return t < this.duration ? 'dissipate' : 'idle';
  }
  retime(distance, speed = this.speed) {
    const fraction = this.progress, hit = this.time >= this.impactTime, age = this.time - this.impactTime;
    this.speed = Math.max(1, speed); this.distance = Math.max(.01, distance);
    if (hit) this.time = this.impactTime + age;
    else if (this.time > this.launchTime) this.time = this.launchTime + fraction * this.distance / this.speed;
  }
}
