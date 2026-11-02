/** Compact real 3D menu assets, made from the existing game models. */
import {mkdir,stat} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,simplify,textureCompress,meshopt} from '@gltf-transform/functions';
import {MeshoptSimplifier,MeshoptEncoder} from 'meshoptimizer';
import sharp from 'sharp';
await Promise.all([MeshoptSimplifier.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder}),out='public/game/models/title';await mkdir(out,{recursive:true});
for(const [kind,name]of [['sword','storm-sword-v3'],['ice','frost-bow-v2'],['cultivator','celestial-shrine-v1']]){
 const doc=await io.read(`public/game/models/${name}.glb`);
 await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:kind==='cultivator'?.25:.5,error:.003}),dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:85}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
 await io.write(`${out}/${kind}.glb`,doc);console.log(kind,Math.round((await stat(`${out}/${kind}.glb`)).size/1024)+' KiB');
}
