// Local-only capture sink. Fixed names and origin; never included in the production build.
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir=resolve('output/reel-source');await mkdir(dir,{recursive:true});
const names=new Set(['ice','sword','cultivator','awakening'].flatMap(s=>['h264','wav','json','png'].map(ext=>`${s}.${ext}`)));
createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(origin!=='http://127.0.0.1:5173'){res.writeHead(403).end();return;}
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
  const name=req.url.slice(1);
  if(req.method!=='POST'||!names.has(name)){res.writeHead(404).end();return;}
  try{
    let size=0;const buffers=[];
    for await(const chunk of req){size+=chunk.length;if(size>160e6)throw new Error('Capture too large');buffers.push(chunk);}
    await writeFile(resolve(dir,name),Buffer.concat(buffers));res.writeHead(200,{'Content-Type':'text/plain'}).end('saved');
    console.log(`Saved ${name}: ${size} bytes`);
  }catch(error){res.writeHead(400).end('Capture rejected');console.error(error.message);}
}).listen(5188,'127.0.0.1',()=>console.log('Capture sink: http://127.0.0.1:5188 → '+dir));
