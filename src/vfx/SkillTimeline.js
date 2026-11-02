export class SkillTimeline {
  constructor(distance = 15, speed = 20) {
    this.distance = distance;
    this.time = 0;
    this.speed = speed;
    this.playing = true;
  }
  get impactTime() { return 0.75 + this.distance / this.speed; }
  get duration() { return this.impactTime + 1.1; }
  get progress() { return Math.min(1, Math.max(0, (this.time - 0.75) / (this.impactTime - 0.75))); }
  get phase() {
    const t = this.time + 1e-9;
    if (t < 0.4) return 'gather';
    if (t < 0.75) return 'charge';
    if (t < Math.min(0.9, this.impactTime)) return 'launch';
    if (t < this.impactTime) return 'flight';
    if (t < this.impactTime + 0.35) return 'impact';
    if (t < this.duration) return 'dissipate';
    return 'idle';
  }
  setSpeed(speed) { this.retime(this.distance, speed); }
  retime(distance, speed = this.speed) {
    const fraction = this.progress;
    const after = this.time >= this.impactTime;
    const impactAge = this.time - this.impactTime;
    this.speed = Math.max(1, speed);
    this.distance = Math.max(0.01, distance);
    if (after) this.time = this.impactTime + impactAge;
    else if (this.time > 0.75) this.time = 0.75 + fraction * this.distance / this.speed;
  }
  advance(dt) {
    if (this.playing) {
      const next = this.time + Math.max(0, dt);
      this.time = next >= this.duration - 1e-9 ? this.duration : next;
    }
    return this.time;
  }
  seek(time) { this.time = Math.max(0, Math.min(this.duration, time)); }
  reset() { this.time = 0; }
}
