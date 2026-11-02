/** Offline production step. Requires the downloaded/created masters in assets/. */
import { mkdir } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, textureCompress, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),out=process.env.RPG_ASSET_OUTPUT || 'public/game/models';await mkdir(out,{recursive:true});
const weapons=[['storm-sword-v3',.2,.004],['frost-bow-v2',.15,.004],['frost-arrow-v2',.035,.004]];
for(const [name,ratio,error]of process.argv.includes('--nature-only')?[]:[...weapons,['celestial-shrine-v1',.055,.004]]){
  const shrine=name.startsWith('celestial'),doc=await io.read(shrine?`assets/generated/${name}-master.glb`:`public/models/${name}.glb`);
  await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio,error}),dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:shrine?[2048,2048]:[1024,1024],quality:shrine?92:90}));
  await io.write(`${out}/${name}.glb`,doc);console.log(name,'optimized');
}
const names=['CommonTree_1','CommonTree_3','CommonTree_5','TwistedTree_2','DeadTree_2','Pine_2','Bush_Common','Bush_Common_Flowers','Fern_1','Grass_Common_Short','Flower_3_Group','Flower_4_Group','Plant_1','Mushroom_Common','Rock_Medium_1','Rock_Medium_2','Rock_Medium_3','Pebble_Round_1','RockPath_Round_Wide'];
let combined;
for(const name of names){
  const doc=await io.read(`assets/rpg-source/nature/glTF/${name}.gltf`),scene=doc.getRoot().listScenes()[0],wrapper=doc.createNode(name);
  // Source FBX export contains values ~1.0001; legal glTF vertex colors are 0…1.
  for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
    const color=primitive.getAttribute('COLOR_0');if(color&&color.getArray() instanceof Float32Array)color.setArray(color.getArray().map(n=>Math.max(0,Math.min(1,n))));
  }
  for(const child of scene.listChildren()){scene.removeChild(child);wrapper.addChild(child);}scene.addChild(wrapper);
  if(!combined)combined=doc;else{const map=mergeDocuments(combined,doc),target=combined.getRoot().listScenes()[0];target.addChild(map.get(wrapper));map.get(scene).dispose();}
}
await combined.transform(unpartition(),dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:88}));await io.write(`${out}/nature-library.glb`,combined);
const artOut=process.env.RPG_ART_OUTPUT || 'public/game/art';await mkdir(artOut,{recursive:true});
for(const name of ['frostbound-keyart','relic-atlas'])await sharp(`assets/rpg-source/art/${name}.png`).webp({quality:92}).toFile(`${artOut}/${name}.webp`);
console.log('Nature and UI art optimized');
