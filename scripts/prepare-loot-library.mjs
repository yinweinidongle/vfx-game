import {NodeIO,getBounds} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';import {mergeDocuments,unpartition,dedup,prune} from '@gltf-transform/functions';import {mkdir,writeFile} from 'node:fs/promises';import {optimizeEquipment} from './equipment-pipeline.mjs';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),ids=['armor-v1','boots-v1','wings-v1','cloak-v1','weapon-v1','bow-base','jian-base','wings-star','wings-phoenix','cloak-star','cloak-imperial','bow-star','bow-imperial','dao-imperial','jian-imperial'];let combined;const report={};
for(const id of ids){const path=id==='bow-base'?'public/game/models/frost-bow-v2.glb':id==='jian-base'?'public/game/models/storm-sword-v3.glb':`public/game/models/equipment/${id}.glb`,doc=await io.read(path);report[id]=await optimizeEquipment(doc,650,128,78);
 const scene=doc.getRoot().listScenes()[0];
 // Held bows use a YZ firing plane. Ground items share XY before their landing rotation.
 if(id.startsWith('bow-')){const plane=doc.createNode(id+'-plane').setRotation([0,Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)]);for(const child of scene.listChildren()){scene.removeChild(child);plane.addChild(child);}scene.addChild(plane);}
 const b=getBounds(scene),size=b.max.map((n,i)=>n-b.min[i]),scale=1/Math.max(...size),node=doc.createNode(id).setExtras({lootId:id}).setScale([scale,scale,scale]).setTranslation(b.max.map((n,i)=>-(n+b.min[i])*.5*scale));
 for(const child of scene.listChildren()){scene.removeChild(child);node.addChild(child);}scene.addChild(node);
 if(!combined)combined=doc;else{const map=mergeDocuments(combined,doc);combined.getRoot().listScenes()[0].addChild(map.get(node));map.get(scene).dispose();}
}
await combined.transform(unpartition(),dedup(),prune());await mkdir('public/game/models/equipment',{recursive:true});await io.write('public/game/models/equipment/loot-library.glb',combined);await writeFile('public/game/models/equipment/loot-manifest.json',JSON.stringify(report,null,2)+'\n');console.log('Loot library:',ids.length,'shapes',Object.values(report).reduce((s,r)=>s+r.triangles,0),'triangles total');
