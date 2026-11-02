/** Lightweight layered title background; model cards own their separate renderer. */
export class TitleAtmosphere {
  constructor(root) {
    this.root = root; this.canvas = root.querySelector('.title-dust'); this.ctx = this.canvas.getContext('2d');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)'); this.abort = new AbortController();
    this.x = this.y = this.tx = this.ty = this.last = 0;
    this.motes = Array.from({ length: 44 }, (_, i) => ({ x: (i * .6180339) % 1, y: (i * .381966) % 1, depth: .2 + ((i * .27) % .8), phase: i * 2.39 }));
    const opts = { signal: this.abort.signal };
    root.addEventListener('pointermove', e => { this.tx = e.clientX / innerWidth - .5; this.ty = e.clientY / innerHeight - .5; }, opts);
    root.addEventListener('pointerleave', () => { this.tx = this.ty = 0; }, opts);
    this.resize = () => { this.w = innerWidth; this.h = innerHeight; const dpr = Math.min(devicePixelRatio, 1.5); this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    window.addEventListener('resize', this.resize, opts); this.resize();
    this.tick = this.tick.bind(this); this.frame = requestAnimationFrame(this.tick);
  }
  tick(now) {
    this.frame = requestAnimationFrame(this.tick);
    if (document.hidden || this.reduced.matches || now - this.last < 32) return;
    const dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    this.x += (this.tx - this.x) * (1 - Math.exp(-dt * 3)); this.y += (this.ty - this.y) * (1 - Math.exp(-dt * 3));
    this.root.style.setProperty('--look-x', `${this.x}px`); this.root.style.setProperty('--look-y', `${this.y}px`);
    const c = this.ctx, t = now * .001; c.clearRect(0, 0, this.w, this.h);
    for (const p of this.motes) {
      const x = ((p.x + t * .002 * p.depth) % 1) * this.w + Math.sin(t * .25 + p.phase) * 24 + this.x * p.depth * 35;
      const y = (1 - (p.y + t * .006 * p.depth) % 1) * this.h + this.y * p.depth * 25;
      const alpha = (.13 + .15 * Math.sin(t * .7 + p.phase) ** 2) * p.depth;
      c.fillStyle = `rgba(255,225,166,${alpha})`; c.shadowColor = '#ffe5ab'; c.shadowBlur = p.depth * 8;
      c.beginPath(); c.ellipse(x, y, .6 + p.depth, .6 + p.depth * 2, -.4, 0, Math.PI * 2); c.fill();
    }
    c.shadowBlur = 0;
  }
  dispose() { cancelAnimationFrame(this.frame); this.abort.abort(); }
}
