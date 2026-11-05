// Times in seconds within the original six-cue mono sound bank.
export const LOOT_SOUNDS = {
  gearDrop: [
    {offset: 0, length: .32, gain: .52},
    {offset: .40, length: .70, gain: .68},
    {offset: 1.20, length: 1.26, gain: .84},
  ],
  gearLand: [
    {offset: 2.55, length: .19, gain: .26},
    {offset: 2.83, length: .35, gain: .34},
    {offset: 3.28, length: .55, gain: .43},
  ],
};

export class LootSound {
  constructor(audio) {
    this.audio = audio;
    this.last = {gearDrop: {time: -Infinity, tier: -1}, gearLand: {time: -Infinity, tier: -1}};
    this.voices = new Set();
  }

  async load(url) {
    const context = this.audio.context;
    if (!context) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (!this.audio.disposed) this.buffer = buffer;
    } catch (error) {
      console.warn('掉落音色载入失败，将使用合成提示音。', error.message);
    }
  }

  // Play the highest quality in each event batch, preferring the nearest on a tie.
  handle(events, player, camera) {
    if (this.audio.context?.state !== 'running') return;
    let drop, landing;
    let dropRange = Infinity, landingRange = Infinity;
    for (const event of events) {
      if (event.type !== 'gearDrop' && event.type !== 'gearLand') continue;
      const range = Math.hypot(event.x - player.x, event.z - player.z);
      if (range > 40) continue;
      if (event.type === 'gearDrop') {
        if (!drop || event.rarity > drop.rarity || (event.rarity === drop.rarity && range < dropRange)) {
          drop = event;
          dropRange = range;
        }
      } else if (!landing || event.rarity > landing.rarity || (event.rarity === landing.rarity && range < landingRange)) {
        landing = event;
        landingRange = range;
      }
    }
    if (drop) this.play(drop, dropRange, player, camera);
    if (landing) this.play(landing, landingRange, player, camera);
  }

  play(event, range, player, camera) {
    const context = this.audio.context, now = context.currentTime;
    const tier = Math.min(2, Math.max(0, Math.trunc(event.rarity) || 0));
    const isDrop = event.type === 'gearDrop';
    const last = this.last[event.type], gap = isDrop ? .10 : .14;
    if (now - last.time < gap && tier <= last.tier) return;
    const priority = tier + (isDrop ? 3 : 0);
    if (this.voices.size >= 6) {
      let lowest;
      for (const voice of this.voices) {
        if (!lowest || voice.priority < lowest.priority) lowest = voice;
      }
      if (lowest.priority > priority) return;
      lowest.gain.gain.setTargetAtTime(0, now, .004);
      lowest.source.stop(now + .018);
      this.voices.delete(lowest);
    }
    last.time = now;
    last.tier = tier;
    const cue = LOOT_SOUNDS[event.type][tier], attenuation = 1 / (1 + range * .035);
    if (!this.buffer) {
      this.audio.tone([1046.5, 1318.5, 1568][tier], cue.length, .13 * attenuation, 'sine', isDrop ? 1.06 : .94);
      return;
    }
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = this.buffer;
    gain.gain.value = cue.gain * attenuation;
    source.connect(gain);
    const pan = context.createStereoPanner?.();
    if (pan) {
      const axes = camera?.matrixWorld.elements;
      const side = axes ? (event.x - player.x) * axes[0] + (event.z - player.z) * axes[2] : 0;
      pan.pan.value = Math.max(-.68, Math.min(.68, side / 17));
      gain.connect(pan).connect(this.audio.master);
    } else {
      gain.connect(this.audio.master);
    }
    const voice = {source, gain, priority};
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
      pan?.disconnect();
    };
    source.start(now, cue.offset, cue.length);
  }

  dispose() {
    for (const voice of this.voices) voice.source.stop();
    this.voices.clear();
    this.buffer = null;
  }
}
