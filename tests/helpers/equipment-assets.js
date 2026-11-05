import * as T from 'three';import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';import {VARIANT_IDS,equipmentModelPath} from '../../src/game/EquipmentCatalog.js';
export async function equipmentSources(){const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),templates={};for(const id of ['armor-v1','boots-v1','wings-v1','cloak-v1','weapon-v1','bow-base','jian-base',...VARIANT_IDS]){
 const doc=await io.read('public/'+equipmentModelPath(id)),root=new T.Group();root.userData={...doc.getRoot().listScenes()[0].getExtras()};
 for(const node of doc.getRoot().listNodes())if(node.getMesh())for(const p of node.getMesh().listPrimitives()){const g=new T.BufferGeometry();for(const [key,semantic,size]of [['position','POSITION',3],['normal','NORMAL',3],['uv','TEXCOORD_0',2]]){const a=p.getAttribute(semantic);if(a)g.setAttribute(key,new T.BufferAttribute(a.getArray(),size));}if(p.getIndices())g.setIndex(new T.BufferAttribute(p.getIndices().getArray(),1));g.applyMatrix4(new T.Matrix4().fromArray(node.getWorldMatrix()));root.add(new T.Mesh(g,new T.MeshStandardMaterial()));}
 templates[id]=root;
 }for(const slot of ['armor','boots','wings','cloak','weapon'])templates[slot]=templates[slot+'-v1'];return templates;}

export async function lootSources(){
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/game/models/equipment/loot-library.glb'),templates={};
 for(const source of doc.getRoot().listScenes()[0].listChildren()){
  const root=new T.Group();templates[source.getName()]=root;
  function visit(node){for(const p of node.getMesh()?.listPrimitives()||[]){const geo=new T.BufferGeometry();for(const [key,semantic,size]of [['position','POSITION',3],['normal','NORMAL',3],['uv','TEXCOORD_0',2]]){const a=p.getAttribute(semantic);if(a)geo.setAttribute(key,new T.BufferAttribute(a.getArray(),size));}if(p.getIndices())geo.setIndex(new T.BufferAttribute(p.getIndices().getArray(),1));geo.applyMatrix4(new T.Matrix4().fromArray(node.getWorldMatrix()));root.add(new T.Mesh(geo,new T.MeshStandardMaterial()));}for(const child of node.listChildren())visit(child);}visit(source);
 }return templates;
}
