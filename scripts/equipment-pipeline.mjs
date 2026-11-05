import {simplify,dedup,prune,textureCompress,weld} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';import sharp from 'sharp';
export const triangleCount=doc=>doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
export async function optimizeEquipment(doc,target=8000,pixels=512,quality=87){
 await MeshoptSimplifier.ready;const before=triangleCount(doc);await doc.transform(weld());
 const aware={simplify(indices,positions,stride,count,error,flags){let prim;for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())if(p.getAttribute('POSITION').getArray()===positions)prim=p;
  const uv=prim?.getAttribute('TEXCOORD_0')?.getArray(),normal=prim?.getAttribute('NORMAL')?.getArray(),a=new Float32Array(positions.length/3*5);
  for(let i=0;i<positions.length/3;i++){for(let j=0;j<3;j++)a[i*5+j]=normal?.[i*3+j]||0;for(let j=0;j<2;j++)a[i*5+3+j]=uv?.[i*2+j]||0;}
  return MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,a,5,[.02,.02,.02,.15,.15],null,count,error,[...flags,'Permissive']);}};
 await doc.transform(simplify({simplifier:aware,ratio:Math.min(1,target/before),error:target<1000?.1:.035}),dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[pixels,pixels],quality}));return {sourceTriangles:before,triangles:triangleCount(doc)};
}
