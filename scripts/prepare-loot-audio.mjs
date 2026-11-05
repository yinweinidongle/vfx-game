import {mkdir,writeFile} from 'node:fs/promises';
import {LOOT_SOUNDS} from '../src/game/LootSound.js';

// Original modal percussion. A short clasp, a two-note jade chime, and a bronze
// bell with ascending gold chimes. Each has a separate, lighter landing answer.
const sampleRate=32000, wave=new Float64Array(Math.ceil(3.86*sampleRate));
const tau=2*Math.PI;
let noiseState=0x260411;
function noise(){noiseState=(Math.imul(noiseState,1664525)+1013904223)>>>0;return noiseState/2147483648-1;}
function strike(t,hz,tail,modes){
  if(t<0)return 0;
  let sound=0;
  for(const [ratio,level,damping] of modes){
    const phase=t*hz*ratio+.0018*hz*ratio*(1-Math.exp(-t*30));
    sound+=level*Math.exp(-t*damping/tail)*Math.sin(tau*phase);
  }
  return sound*(1-Math.exp(-t*720));
}
const silver=[[1,1,4],[2.68,.31,8],[4.13,.19,11],[6.19,.07,16]];
const jade=[[1,1,3.8],[2.12,.36,5.7],[3.82,.15,8.8],[5.22,.07,12]];
const bronze=[[1,.68,3.9],[1.49,.48,4.3],[2.39,.28,5.3],[3.14,.22,7],[4.32,.14,8.2],[5.66,.08,9]];
function render(phase,tier){
  const cue=LOOT_SOUNDS[phase][tier],length=Math.floor(cue.length*sampleRate),samples=new Float64Array(length);
  let lastNoise=0,peak=0;
  for(let i=0;i<length;i++){
    const t=i/sampleRate,r=noise(),high=r-lastNoise;lastNoise+=.31*high;
    let sound=0;
    if(phase==='gearDrop'){
      if(tier===0)sound=.60*strike(t,1130,.23,silver)+.15*strike(t+.001,2190,.08,jade);
      if(tier===1)sound=.55*strike(t,790,.52,jade)+.44*strike(t-.064,1185,.48,jade)+.08*strike(t-.12,2369,.35,silver);
      if(tier===2)sound=.57*strike(t,174.61,1.12,bronze)+.42*strike(t+.001,698.46,.87,jade)+.39*strike(t-.062,1046.50,.86,jade)+.32*strike(t-.138,1396.91,.93,silver)+.095*strike(t-.238,2093,.56,jade);
      sound+=high*(.22+.08*tier)*Math.exp(-t*115)*(1-Math.exp(-t*1200));
      if(tier===2)sound+=high*.10*Math.exp(-Math.pow((t-.04)/.039,2))+Math.sin(tau*72*t)*.12*Math.exp(-t*20);
    }else{
      sound=high*.27*Math.exp(-t*125)*(1-Math.exp(-t*1400));
      sound+=.28*strike(t,170+tier*37,.10,bronze)+.35*strike(t,[890,987.77,1046.50][tier],[.13,.27,.42][tier],jade);
      if(tier===2)sound+=.16*strike(t-.044,1567.98,.34,silver);
    }
    // Preserve literal silence between cues; avoid clicks at slice boundaries.
    const edge=Math.min(1,t/.002,(cue.length-t)/.022);
    samples[i]=sound*Math.max(0,edge);peak=Math.max(peak,Math.abs(samples[i]));
  }
  const start=Math.round(cue.offset*sampleRate),gain=.86/peak;
  for(let i=0;i<length;i++)wave[start+i]=samples[i]*gain;
}
for(const phase of Object.keys(LOOT_SOUNDS))for(let tier=0;tier<3;tier++)render(phase,tier);
const wav=Buffer.alloc(44+wave.length*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wave.length*2,40);
for(let i=0;i<wave.length;i++)wav.writeInt16LE(Math.round(wave[i]*32767),44+i*2);
await mkdir('public/game/audio/loot',{recursive:true});await writeFile('public/game/audio/loot/treasure-chimes-v1.wav',wav);
console.log(`Wrote six cues, ${wave.length/sampleRate} s, ${wav.length} bytes`);
