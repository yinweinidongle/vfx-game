/** Quaternius CC0 FBX modules → one shared, metre-scaled glTF library. */
import { readFile, mkdir } from 'node:fs/promises';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { dedup, prune, weld } from '@gltf-transform/functions';

globalThis.window = { URL: { createObjectURL: () => '' } };
globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(value) {} }) };
const names = ['Arch_Round','Arch_Gothic','Wall_ArchRound_Broken','Wall_Broken','Wall_Half','Column_Round','Column_Round_Short','Statue_Stag','Statue_Fox','Bricks','Floor_Squares','Floor_Diamond'];
const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('Ruins'), materials = new Map();
const colors = { Main:'#607980', Black:'#263e49', Highlights:'#91a9aa', Stone:'#64808b' };
for (const name of names) {
  const bytes = await readFile(`assets/rpg-source/ruins/FBX/${name}.fbx`);
  const asset = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  asset.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(asset), center = box.getCenter(new T.Vector3()), batches = new Map();
  asset.traverse(o => {
    if (!o.isMesh) return;
    const geometry = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    geometry.applyMatrix4(o.matrixWorld); geometry.translate(-center.x,-box.min.y,-center.z); geometry.scale(.01,.01,.01);
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const group of geometry.groups.length ? geometry.groups : [{ start:0,count:geometry.attributes.position.count,materialIndex:0 }]) {
      const key = list[group.materialIndex].name, part = new T.BufferGeometry();
      for (const attribute of ['position','normal','uv']) {
        const source = geometry.getAttribute(attribute); if (!source) continue;
        part.setAttribute(attribute,new T.BufferAttribute(source.array.slice(group.start*source.itemSize,(group.start+group.count)*source.itemSize),source.itemSize));
      }
      if (!batches.has(key)) batches.set(key,[]); batches.get(key).push(part);
    }
    geometry.dispose();
  });
  const mesh = doc.createMesh(name);
  for (const [key,parts] of batches) {
    if (!materials.has(key)) {
      const c = new T.Color(colors[key] || '#607980');
      materials.set(key,doc.createMaterial(key).setBaseColorFactor([c.r,c.g,c.b,1]).setRoughnessFactor(.92));
    }
    const geo = mergeGeometries(parts), primitive = doc.createPrimitive().setMaterial(materials.get(key));
    for (const [attr,semantic,type] of [['position','POSITION','VEC3'],['normal','NORMAL','VEC3'],['uv','TEXCOORD_0','VEC2']]) {
      const a = geo.getAttribute(attr); if (a) primitive.setAttribute(semantic,doc.createAccessor().setType(type).setArray(new Float32Array(a.array)).setBuffer(buffer));
    }
    mesh.addPrimitive(primitive); geo.dispose(); parts.forEach(p=>p.dispose());
  }
  scene.addChild(doc.createNode(name).setMesh(mesh));
}
await doc.transform(weld(),dedup(),prune());
const output=process.env.RPG_ASSET_OUTPUT || 'public/game/models'; await mkdir(output,{recursive:true});
await new NodeIO().write(`${output}/ruins-library.glb`,doc);
console.log(`${names.length} CC0 ruin modules prepared.`);
