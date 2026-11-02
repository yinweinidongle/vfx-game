export class GameInput {
  constructor(game, canvas) {
    this.game = game; this.canvas = canvas; this.keys = new Set(); this.dx = 0; this.dz = 0; this.attacking = false; this.clickTarget = null;
    this.mouse = { x: 0, y: 0 }; this.pointerKnown = false; this.abort = new AbortController(); const opts = { signal: this.abort.signal };
    window.addEventListener('keydown', e => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === 'Escape') { if (!game.ui) return; if (!game.ui.dialog.open) { e.preventDefault(); game.ui.pause(); } return; }
      if (game.paused || !game.ready) return;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code); if (e.repeat) return;
      if (e.code === 'Space') game.state.dodge(this.dx,this.dz);
      if (e.code === 'KeyQ') game.cast(0); if (e.code === 'KeyE') game.cast(1); if (e.code === 'KeyR') game.cast(2);
      if (e.code === 'KeyG') { e.preventDefault(); game.cast(3); }
      if (e.code === 'KeyV') game.ui.toggleRoute();
      if (e.code === 'KeyF') game.state.interact(); if (e.code === 'KeyC') game.heal();
      if (e.code === 'KeyI') game.ui.inventory(); if (e.code === 'KeyM') game.ui.map();
    }, opts);
    window.addEventListener('keyup', e => this.keys.delete(e.code), opts); window.addEventListener('blur', () => this.clear(), opts);
    canvas.addEventListener('pointermove', e => this.position(e), opts);
    canvas.addEventListener('pointerdown', e => { this.position(e); game.audio.start(); if (game.paused||!game.ready) return; if (e.button === 0) this.attacking = true; if (e.button === 2) { game.updateAim();const p=game.state.player;this.path=game.navigation.find(p.x,p.z,game.aim.x,game.aim.z);this.pathIndex=0;this.clickTarget=this.path?.[0]||null;if(!this.path)game.ui.toast('此处暂时无法到达，试着沿石路前进。'); } }, opts);
    window.addEventListener('pointerup', e => { if (e.button === 0) this.attacking = false; }, opts);
    canvas.addEventListener('contextmenu', e => e.preventDefault(), opts);
    canvas.addEventListener('wheel', e => { e.preventDefault(); game.skillCamera.cancel();game.zoom = Math.max(14,Math.min(28,game.zoom+e.deltaY*.015)); }, { ...opts, passive: false });
  }
  position(e) { const r = this.canvas.getBoundingClientRect(); this.mouse.x = (e.clientX-r.left)/r.width*2-1; this.mouse.y = -(e.clientY-r.top)/r.height*2+1; this.pointerKnown = true; }
  update() {
    const k = this.keys, x = Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft')), y=Number(k.has('KeyW')||k.has('ArrowUp'))-Number(k.has('KeyS')||k.has('ArrowDown'));
    this.dx=x*Math.cos(this.game.cameraYaw)-y*Math.sin(this.game.cameraYaw); this.dz=-x*Math.sin(this.game.cameraYaw)-y*Math.cos(this.game.cameraYaw);
    if (x||y) this.clickTarget=null;
    else if (this.clickTarget) {
      const p=this.game.state.player;
      while(this.clickTarget&&Math.hypot(this.clickTarget.x-p.x,this.clickTarget.z-p.z)<.3)this.clickTarget=this.path?.[++this.pathIndex]||null;
      this.dx=this.clickTarget?this.clickTarget.x-p.x:0;this.dz=this.clickTarget?this.clickTarget.z-p.z:0;
    }
  }
  clear() { this.keys.clear(); this.dx=this.dz=0; this.attacking=false; this.clickTarget=null; }
  dispose() { this.abort.abort(); }
}
