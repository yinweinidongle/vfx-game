/** One local soundtrack shared by the title and the journey. */
class GameMusic {
  constructor() {
    this.audio = new Audio(`${import.meta.env?.BASE_URL || '/'}game/audio/lotus-pond-loop.mp3`);
    this.audio.loop = true; this.audio.preload = 'metadata'; this.audio.volume = 0;
    this.volume = .45; this.muted = false; this.started = false; this.duckGain=1;this.listeners = new Set();
    this.visibility = () => { if (document.hidden) this.pause(); else if (this.started) this.start(); };
    document.addEventListener('visibilitychange', this.visibility);
  }
  async start() {
    if (document.hidden || this.muted || this.volume === 0) return;
    try { await this.audio.play(); this.started = true; this.fade(this.volume * .55*this.duckGain); }
    catch { /* Playback waits for a user gesture. The music button remains available. */ }
    this.notify();
  }
  configure(volume, muted = this.muted) {
    this.volume = Math.max(0, Math.min(1, volume)); this.muted = muted;
    this.fade(muted ? 0 : this.volume * .55*this.duckGain);
    if (!muted && this.started && this.audio.paused) this.start();
    this.notify();
  }
  fade(target) {
    cancelAnimationFrame(this.frame); const from = this.audio.volume, start = performance.now();
    const step = now => {
      // A resumed/background frame can carry a timestamp older than this fade.
      const t = Math.max(0, Math.min(1, (now - start) / 550));
      this.audio.volume = from + (target - from) * (t * t * (3 - 2 * t));
      if (t < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
  duck(gain){this.duckGain=Math.max(0,Math.min(1,gain));this.fade(this.muted?0:this.volume*.55*this.duckGain);}
  pause() { cancelAnimationFrame(this.frame); this.audio.pause(); this.audio.volume = 0; this.notify(); }
  notify() { for (const fn of this.listeners) fn(this); }
  dispose() { this.pause(); document.removeEventListener('visibilitychange', this.visibility); this.listeners.clear(); }
}
export const gameMusic = new GameMusic();
