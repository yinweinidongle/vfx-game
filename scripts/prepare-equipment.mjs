/** Generated masters stay offline. Runtime assets use shared PBR maps and bounded meshes. */
import { mkdir,writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify,dedup,prune,textureCompress,weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),dir='public/game/models/equipment',report={};
await mkdir(dir,{recursive:true});
for(const slot of ['armor','boots','wings','cloak','weapon']){
  const doc=await io.read(`assets/generated/equipment-${slot}-v1-master.glb`);
  let before=0;for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())before+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
  await doc.transform(weld());
  const aware={simplify(indices,positions,stride,target,error,flags){
    let prim;for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())if(p.getAttribute('POSITION').getArray()===positions)prim=p;
    const uv=prim?.getAttribute('TEXCOORD_0')?.getArray(),normal=prim?.getAttribute('NORMAL')?.getArray(),attributes=new Float32Array(positions.length/3*5);
    for(let i=0;i<positions.length/3;i++){for(let j=0;j<3;j++)attributes[i*5+j]=normal?.[i*3+j]||0;for(let j=0;j<2;j++)attributes[i*5+3+j]=uv?.[i*2+j]||0;}
    return MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,attributes,5,[.02,.02,.02,.15,.15],null,target,error,[...flags,'Permissive']);
  }};
  await doc.transform(simplify({simplifier:aware,ratio:Math.min(1,10000/before),error:.035}),dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[768,768],quality:86}));
  let triangles=0;for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
  await io.write(`${dir}/${slot}-v1.glb`,doc);report[slot]={sourceTriangles:before,triangles};console.log(slot,report[slot]);
}
await writeFile(`${dir}/manifest.json`,JSON.stringify(report,null,2)+'\n');
