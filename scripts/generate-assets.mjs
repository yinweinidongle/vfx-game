/** Server-side asset authoring only. Never import this script into the browser. */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
const legacySpecs = [
  { name:'frost-arrow-v2', image:'public/concepts/frost-arrow-v2-input.png', seed:28417,
    prompt:'Single complete premium frost magic arrow matching the reference, long slim shaft, sharp layered sapphire crystal spearhead with swept ice barbs, silver filigree collar, four short crystal tail fins, deep blue ice, white internal fractures. Preserve exact silhouette and details. All parts connected with real thickness. No glow clouds, particles, floor, bow or scene.' },
  { name:'frost-bow-v2', image:'public/concepts/frost-bow-v2.png', seed:28418,
    prompt:'One complete elegant recurve bow matching the reference. Tall curved sapphire crystal limbs with sharp ice barbs and silver filigree structural inlays, usable narrow central grip, single thin taut string. Deep blue ice and white internal fractures, real thickness, refined PBR details. No arrow, particles, glow clouds, pedestal, character or background.' },
];
const specIndex=process.argv.indexOf('--specs');
const specs = specIndex>=0 ? JSON.parse(await readFile(resolve(root,process.argv[specIndex+1]),'utf8')) : process.argv.includes('--equipment') ? JSON.parse(await readFile(resolve(root,'asset-specs/equipment.json'),'utf8')) : process.argv.includes('--rpg-relic') ? [{
  name: 'celestial-shrine-v1', image: 'assets/rpg-source/art/celestial-shrine-reference.png',
  model: 'doubao-seed3d-2-0-260328', prompt: '',
  flags: '--subdivisionlevel high --fileformat glb',
}] : process.argv.includes('--sword-seed3d') ? [{
  name: 'storm-sword-v3', image: 'public/concepts/storm-sword-v2.png',
  model: 'doubao-seed3d-2-0-260328', prompt: '',
  flags: '--subdivisionlevel high --fileformat glb',
}] : process.argv.includes('--sword') ? [{
  name: 'storm-sword-v2', image: 'public/concepts/storm-sword-v2.png', seed: 39571,
  prompt: 'SINGLE SWORD WEAPON ONLY. Reconstruct the pictured sword, point up, pommel down. Long narrow silver steel blade, dark cobalt fuller with cyan-violet engraved inlays, swept silver and blue crystal guard, indigo wrapped handle, gemstone pommel. All parts connected. No character, creature, armor, hands, scene or effects. Preserve the complete sword silhouette.',
  flags: '--mesh_mode Raw --hd_texture true --material PBR --addons HighPack --quality_override 1000000 --use_original_alpha false --TAPose false --fileformat glb',
  imageFirst: true,
}] : legacySpecs;
const flags = '--mesh_mode Raw --hd_texture true --material PBR --addons HighPack --quality_override 1000000 --use_original_alpha true --TAPose false --fileformat glb';
await mkdir(resolve(root,'.generation'),{recursive:true});
await mkdir(resolve(root,'assets/generated'),{recursive:true});
async function readSecret(){
  if(process.env.ARK_API_KEY) return process.env.ARK_API_KEY;
  if(!process.stdin.isTTY) throw new Error('Set ARK_API_KEY or run in a terminal for hidden input.');
  process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
  process.stdout.write('Ready for API key on hidden stdin.\n');
  return new Promise((resolve,reject)=>{
    let secret='';
    const handler=data=>{
      for(const char of data){
        if(char==='\u0003'){process.stdin.setRawMode(false);process.stdin.pause();reject(new Error('Cancelled'));return;}
        if(char==='\n'||char==='\r'){process.stdin.off('data',handler);process.stdin.setRawMode(false);process.stdin.pause();resolve(secret.trim());return;}
        if(char==='\u007f')secret=secret.slice(0,-1);else secret+=char;
      }
    };process.stdin.on('data',handler);
  });
}
let key=await readSecret();
const redact=s=>String(s).replaceAll(key,'[REDACTED]');
async function request(path='',body){
  // GET status polls are idempotent; task submissions are deliberately never retried blindly.
  for(let attempt=0;attempt<5;attempt++){
    try{
      const response=await fetch(endpoint+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});
      if(!body&&[429,500,502,503,504].includes(response.status)&&attempt<4){await new Promise(r=>setTimeout(r,Math.min(15000,2000*2**attempt)));continue;}
      const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{throw new Error(`HTTP ${response.status}: invalid JSON`);}
      if(!response.ok)throw new Error(`HTTP ${response.status}: ${redact(JSON.stringify(data))}`);return data;
    }catch(error){if(body||attempt===4)throw error;await new Promise(r=>setTimeout(r,Math.min(15000,2000*2**attempt)));}
  }
}
async function saveState(name,state){await writeFile(resolve(root,`.generation/${name}.json`),JSON.stringify(state,null,2));}
const jobs=[];
try{
  for(const spec of specs){
    let state;try{state=JSON.parse(await readFile(resolve(root,`.generation/${spec.name}.json`),'utf8'));}catch{}
    if(!state?.id){
      const image=await readFile(resolve(root,spec.image));
      const activeFlags=spec.flags??flags;
      const textContent={type:'text',text:`${spec.prompt} ${activeFlags}`};
      const imageContent={type:'image_url',image_url:{url:`data:image/png;base64,${image.toString('base64')}`}};
      const content=spec.imageFirst?[imageContent,textContent]:[textContent,imageContent];
      const data=await request('',{model:spec.model??'hyper3d-gen2-260112',seed:spec.seed,content});
      if(!data.id)throw new Error('Generation returned no task ID; inspect provider before resubmitting.');
      state={id:data.id,name:spec.name,status:'submitted',model:spec.model??'hyper3d-gen2-260112',prompt:spec.prompt,flags:spec.flags??flags,createdAt:new Date().toISOString()};
      await saveState(spec.name,state);
    }
    jobs.push({...spec,state});console.log(`${spec.name}: task ${state.id} ${state.status}`);
  }
  while(jobs.some(j=>!['downloaded','failed','cancelled','expired'].includes(j.state.status))){
    for(const job of jobs){
      if(['downloaded','failed','cancelled','expired'].includes(job.state.status))continue;
      const data=await request('/'+encodeURIComponent(job.state.id));
      if(data.status!==job.state.status){job.state.status=data.status;console.log(`${job.name}: ${data.status}`);}
      if(data.status==='succeeded'){
        const url=data.content?.file_url;
        if(!url)throw new Error(`${job.name}: succeeded without file_url`);
        const response=await fetch(url,{signal:AbortSignal.timeout(180000)});
        if(!response.ok)throw new Error(`${job.name}: download HTTP ${response.status}`);
        let bytes=Buffer.from(await response.arrayBuffer());
        if(bytes.readUInt32LE(0)!==0x46546c67){
          const source=resolve(root,`assets/generated/${job.name}-result.bin`);
          await writeFile(source,bytes);
          if(bytes.readUInt32LE(0)===0x04034b50){
            const entries=unzipSync(bytes);
            const glb=Object.keys(entries).find(name=>name.toLowerCase().endsWith('.glb'));
            if(!glb)throw new Error(`${job.name}: ZIP has no GLB; inspect saved result container.`);
            bytes=Buffer.from(entries[glb]);
            console.log(`${job.name}: extracted GLB from result ZIP`);
          }
          if(bytes.readUInt32LE(0)!==0x46546c67)throw new Error(`${job.name}: unsupported result container (${response.headers.get('content-type')}, signature ${bytes.subarray(0,8).toString('hex')}); saved locally.`);
        }
        const output=`assets/generated/${job.name}-master.glb`;
        await writeFile(resolve(root,output),bytes);
        Object.assign(job.state,{status:'downloaded',output,bytes:bytes.length,usage:data.usage,completedAt:new Date().toISOString()});
        console.log(`${job.name}: downloaded ${(bytes.length/1048576).toFixed(1)} MB to ${output}`);
      }
      if(data.error)job.state.error=data.error;
      await saveState(job.name,job.state);
      if(data.status==='failed')console.log(`${job.name}: ${redact(JSON.stringify(data.error||{}))}`);
    }
    if(jobs.some(j=>!['downloaded','failed','cancelled','expired'].includes(j.state.status)))await new Promise(resolve=>setTimeout(resolve,15000));
  }
  if(jobs.some(j=>j.state.status!=='downloaded'))process.exitCode=1;
}catch(error){console.error(redact(error.message));process.exitCode=1;}
finally{key='';}
