import { gameMusic } from './GameMusic.js';
import { LootSound } from './LootSound.js';
/** Local instrumental music and responsive synthesized combat SFX. */
export class GameAudio {
  constructor(volume = .5) { this.volume = volume; this.context = null; this.nextNote = 0; this.noteIndex = 0; this.loot = new LootSound(this); }
  start() {
    if(this.disposed)return;
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.context.createGain(); this.master.gain.value = this.volume * .34; this.master.connect(this.context.destination);
      const length = this.context.sampleRate * 2, buffer = this.context.createBuffer(1, length, this.context.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * .08;
      this.noiseBuffer=buffer;
      this.wind = this.context.createBufferSource(); this.wind.buffer = buffer; this.wind.loop = true;
      const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 450; this.wind.connect(filter).connect(this.master); this.wind.start();
    }
    this.resume(); gameMusic.configure(this.volume); gameMusic.start();
  }
  setVolume(v) { this.volume = v; gameMusic.configure(v); if (this.master) this.master.gain.setTargetAtTime(v * .34, this.context.currentTime, .1); }
  setMusicMuted(muted) { gameMusic.configure(this.volume,muted);if(!muted)gameMusic.start(); }
  tone(freq, duration, gain = .2, type = 'sine', slide = 1) {
    const c = this.context; if (!c || c.state !== 'running') return;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, c.currentTime); o.frequency.exponentialRampToValueAtTime(freq * slide, c.currentTime + duration);
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(gain, c.currentTime + .012); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + duration);
    o.connect(g).connect(this.master); o.start(); o.stop(c.currentTime + duration + .02); o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  sweep(duration,frequency,endFrequency,gain=.5,type='bandpass') {
    const c=this.context;if(!c||c.state!=='running')return;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),envelope=c.createGain();source.buffer=this.noiseBuffer;
    filter.type=type;filter.Q.value=.8;filter.frequency.setValueAtTime(frequency,c.currentTime);filter.frequency.exponentialRampToValueAtTime(endFrequency,c.currentTime+duration);
    envelope.gain.setValueAtTime(0,c.currentTime);envelope.gain.linearRampToValueAtTime(gain,c.currentTime+.018);envelope.gain.exponentialRampToValueAtTime(.001,c.currentTime+duration);
    source.connect(filter).connect(envelope).connect(this.master);source.start(0,Math.random()*.8);source.stop(c.currentTime+duration+.03);source.onended=()=>{source.disconnect();filter.disconnect();envelope.disconnect();};
  }
  play(type) {
    if (type === 'attack') { this.sweep(.22,3400,350,1.8);this.tone(150,.1,.03,'triangle',.4); }
    if (type === 'hit') { this.sweep(.13,2400,700,1.8);this.tone(110, .14, .13, 'triangle', .45); this.tone(1900, .12, .025, 'sine', .75); }
    if(type==='slash'){this.sweep(.9,180,4800,2.5);this.tone(110,.9,.16,'triangle',.45);}
    if(type==='frost'){this.sweep(.5,5500,1600,1.4,'highpass');this.tone(1568,.7,.055,'sine',.6);}
    if (type === 'cast') { this.sweep(.5,500,4000,1.2);this.tone(260, .55, .08, 'triangle', 2); this.tone(780, .4, .05, 'sine', .7); }
    if (type === 'dodge') this.sweep(.23,1400,160,1.5);
    if(type==='shieldHit'){this.tone(640,.18,.055,'sine',1.4);this.sweep(.13,2800,1100,.65);}
    if (type === 'hurt') this.tone(105, .22, .3, 'triangle', .45);
    if (type === 'pickup') this.tone(1050, .18, .06);
    if (['level','seal','loot','clear','victory'].includes(type)) for (const f of [392, 494, 587, 784]) this.tone(f, 1.2, .08);
    if (type === 'heal') for (const f of [523, 659, 784]) this.tone(f, .8, .09);
    if (type === 'burst') {this.sweep(.6,1800,90,2.2,'lowpass');this.tone(75, .45, .22, 'triangle', .3);}
  }
  async loadAwakening(kind){
    try{const response=await fetch(`${import.meta.env.BASE_URL}game/audio/awakening/${kind}-v1.mp3`);if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.arrayBuffer();if(!this.disposed)this.awakeningVoice=await this.context.decodeAudioData(data);}
    catch(error){console.warn('觉醒语音加载失败：',error.message);}
  }
  awaken(kind){
    this.start();this.stopAwakening();const c=this.context;if(!c||this.disposed)return;
    const notes=kind==='ice'?[988,1480,1976]:kind==='cultivator'?[147,294,440]:[220,330,880];
    for(const f of notes)this.tone(f,kind==='cultivator'?1.35:.85,.11,kind==='sword'?'triangle':'sine',kind==='ice'?1.04:.98);
    this.sweep(.65,380,kind==='ice'?5800:3200,2.5,'bandpass');
    if(this.awakeningVoice){const source=c.createBufferSource(),gain=c.createGain();source.buffer=this.awakeningVoice;gain.gain.value=3.7;source.connect(gain).connect(this.master);source.start(c.currentTime+.08);source.onended=()=>{source.disconnect();gain.disconnect();if(this.voice===source)this.voice=null;};this.voice=source;}
    this.duckUntil=c.currentTime+2.1;gameMusic.duck(.28);
  }
  thunder(final=false){this.sweep(final?.8:.4,final?850:1800,55,final?7:4,'lowpass');this.tone(final?48:85,final?.7:.3,final?.35:.16,'triangle',.45);this.sweep(.095,5800,900,final?3.5:2.2,'highpass');}
  stopAwakening(){if(this.voice){try{this.voice.stop();}catch{}this.voice=null;}this.duckUntil=0;gameMusic.duck(1);}
  update() {if(this.duckUntil&&this.context?.currentTime>=this.duckUntil){this.duckUntil=0;gameMusic.duck(1);}}
  pause() { if(!this.disposed)this.context?.suspend().catch(()=>{}); gameMusic.pause(); }
  resume() { if(!this.disposed&&this.context?.state!=='closed')this.context?.resume().catch(()=>{}); gameMusic.start(); }
  dispose() { if(this.disposed)return;this.stopAwakening();this.loot.dispose();this.disposed=true;this.wind?.stop();this.context?.close().catch(()=>{}); }
}
