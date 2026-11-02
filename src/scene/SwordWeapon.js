import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Right-hand weapon frame: grip at (0,0,0), blade along local +Y. */
export class SwordWeapon {
  constructor(config) {
    this.config = config;
    this.group = new THREE.Group();
    this.group.name = 'Sword · right palm attachment';
    this.height = 1.5;
    this.bladeBaseY = 0.155;
    this.bladeTipY = 1.245;
    this.available = false;
    this.disposed = false;
    this.loadId = 0;
    this.model = null;
    this.materialStates = [];
    this.tint = new THREE.Color();
    this.fallback = this.createFallback();
    this.group.add(this.fallback);
    this.metadata = { source: 'procedural fallback', generated: false, height: this.height };
  }

  createFallback() {
    const group = new THREE.Group();
    group.name = 'Procedural beveled sword fallback';
    const steel = new THREE.MeshStandardMaterial({ color: '#b6c9d6', metalness: 0.92, roughness: 0.23 });
    const edge = new THREE.MeshStandardMaterial({ color: '#e3f0f6', metalness: 0.94, roughness: 0.17 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: '#274453', metalness: 0.82, roughness: 0.32 });
    const leather = new THREE.MeshStandardMaterial({ color: '#122731', metalness: 0.18, roughness: 0.74 });
    this.runeMaterial = new THREE.MeshStandardMaterial({ color: '#5fcff4', emissive: '#6bdcff', emissiveIntensity: 0.45, metalness: 0.35, roughness: 0.28 });

    // Eight faces across the blade make the bevel, edge, and central ridge real
    // geometry. The taper and final point do not rely on alpha textures.
    const sections = [[0.155, 0.061, 0.018], [0.24, 0.079, 0.019], [0.85, 0.057, 0.016], [1.08, 0.035, 0.012], [1.245, 0.0002, 0.0002]];
    const cross = [[-1,0],[-0.7,1],[0,1.4],[0.7,1],[1,0],[0.7,-1],[0,-1.4],[-0.7,-1]];
    const positions = [];
    const indices = [];
    const geometry = new THREE.BufferGeometry();
    for (const [y, width, depth] of sections) for (const [x,z] of cross) positions.push(x*width,y,z*depth);
    for (let section=0;section<sections.length-1;section++) {
      for (let face=0;face<8;face++) {
        const a=section*8+face,b=section*8+(face+1)%8,c=(section+1)*8+face,d=(section+1)*8+(face+1)%8;
        const start=indices.length;
        indices.push(a,b,c,b,d,c);
        geometry.addGroup(start,6,[0,3,4,7].includes(face)?1:0);
      }
    }
    // Close the blade heel beneath the guard.
    for (let i=1;i<7;i++) indices.push(0,i+1,i);
    geometry.addGroup(indices.length-18,18,0);
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);
    const faceted=geometry.toNonIndexed();
    faceted.computeVertexNormals();
    geometry.dispose();
    const blade=new THREE.Mesh(faceted,[steel,edge]);
    blade.castShadow=true;
    group.add(blade);

    // A dark central fuller and inset luminous runes on both broad faces.
    const fullerGeometry = new THREE.BoxGeometry(0.012,0.78,0.008);
    for (const sign of [-1,1]) {
      const fuller=new THREE.Mesh(fullerGeometry,darkSteel);
      fuller.position.set(0,0.64,sign*0.025);
      group.add(fuller);
      for (const y of [0.33,0.51,0.69,0.87]) {
        const runeShape=new THREE.Shape();
        runeShape.moveTo(-0.016,y+0.035);runeShape.lineTo(0.006,y+0.01);
        runeShape.lineTo(-0.006,y+0.006);runeShape.lineTo(0.015,y-0.034);
        runeShape.lineTo(-0.002,y-0.006);runeShape.lineTo(0.009,y-0.003);runeShape.closePath();
        const rune=new THREE.Mesh(new THREE.ShapeGeometry(runeShape),this.runeMaterial);
        rune.position.z=sign*0.03;
        if(sign<0)rune.rotation.y=Math.PI;
        group.add(rune);
      }
    }
    // Swept, beveled quillons; a compact cross-guard never hides the hand.
    const guardShape = new THREE.Shape();
    guardShape.moveTo(-0.22,0.09);guardShape.lineTo(-0.18,0.17);guardShape.lineTo(-0.065,0.19);
    guardShape.lineTo(0,0.16);guardShape.lineTo(0.065,0.19);guardShape.lineTo(0.18,0.17);
    guardShape.lineTo(0.22,0.09);guardShape.lineTo(0.16,0.115);guardShape.lineTo(0.045,0.12);
    guardShape.lineTo(-0.045,0.12);guardShape.lineTo(-0.16,0.115);guardShape.closePath();
    const guardGeometry=new THREE.ExtrudeGeometry(guardShape,{depth:0.046,bevelEnabled:true,bevelSegments:1,bevelSize:0.006,bevelThickness:0.006,steps:1});
    guardGeometry.translate(0,0,-0.023);
    const guard=new THREE.Mesh(guardGeometry,steel);guard.castShadow=true;group.add(guard);
    const grip=new THREE.Mesh(new THREE.CylinderGeometry(0.027,0.024,0.29,10),leather);
    grip.position.y=-0.025;grip.castShadow=true;group.add(grip);
    const bandGeometry=new THREE.TorusGeometry(0.026,0.0025,4,10);
    for(let i=0;i<8;i++){
      const band=new THREE.Mesh(bandGeometry,darkSteel);band.rotation.x=Math.PI/2;
      band.position.y=-0.145+i*0.036;group.add(band);
    }
    const pommel=new THREE.Mesh(new THREE.OctahedronGeometry(0.043,0),steel);
    pommel.position.y=-0.212;pommel.scale.set(0.85,1,0.72);group.add(pommel);
    for(const z of [-0.033,0.033]){
      const gem=new THREE.Mesh(new THREE.OctahedronGeometry(0.025,0),this.runeMaterial);
      gem.position.set(0,0.151,z);gem.scale.set(0.8,1.15,0.4);group.add(gem);
    }
    return group;
  }

  /**
   * Normalize a +Y blade GLB without replacing its PBR material. Rotation is
   * applied first. gripPoint is in source coordinates; the default pivot is
   * 17% of the oriented length from its bottom, centered in X/Z.
   */
  async load(url, options={}) {
    if(this.disposed)throw new Error('SwordWeapon has been disposed.');
    const request=++this.loadId;
    const gltf=await new GLTFLoader().loadAsync(url);
    if(this.disposed||request!==this.loadId){disposeSwordObject(gltf.scene);throw new DOMException('Sword load superseded.','AbortError');}
    const orientation=new THREE.Group();
    orientation.rotation.set(...(options.rotationXYZ??[0,0,0]));
    orientation.add(gltf.scene);orientation.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(orientation);
    const size=box.getSize(new THREE.Vector3());
    if(!Number.isFinite(size.y)||size.y<1e-6){disposeSwordObject(orientation);throw new Error('Sword asset has no usable +Y extent.');}
    const height=options.height??1.5;
    if(!Number.isFinite(height)||height<=0){disposeSwordObject(orientation);throw new Error('Sword height must be positive.');}
    const gripFraction=options.gripFraction??0.17;
    const pivot=options.gripPoint?new THREE.Vector3(...options.gripPoint).applyEuler(orientation.rotation):box.getCenter(new THREE.Vector3());
    if(!options.gripPoint)pivot.y=box.min.y+size.y*gripFraction;
    orientation.position.copy(pivot).negate();
    const fitted=new THREE.Group();fitted.name='Generated storm sword · normalized';
    const scale=height/size.y;fitted.scale.setScalar(scale);fitted.add(orientation);
    if(options.gripOffset)fitted.position.fromArray(options.gripOffset);
    const states=[];const seen=new Set();let triangles=0;let vertices=0;
    gltf.scene.traverse(object=>{
      if(!object.isMesh)return;
      object.castShadow=true;object.receiveShadow=true;
      vertices+=object.geometry.attributes.position?.count??0;
      triangles+=(object.geometry.index?.count??object.geometry.attributes.position?.count??0)/3;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(seen.has(material))continue;seen.add(material);
        states.push({material,emissive:material.emissive?.clone(),emissiveIntensity:material.emissiveIntensity??1});
      }
    });
    if(this.model){this.model.removeFromParent();disposeSwordObject(this.model);}
    this.model=fitted;this.group.add(fitted);this.fallback.visible=false;
    this.materialStates=states;this.height=height;
    this.bladeBaseY=(box.min.y+size.y*(options.bladeStartFraction??0.28)-pivot.y)*scale+(options.gripOffset?.[1]??0);
    this.bladeTipY=(box.max.y-pivot.y)*scale+(options.gripOffset?.[1]??0);
    this.available=true;
    this.metadata={source:url,generated:true,height,scale,gripFraction,gripPoint:options.gripPoint??null,bladeBaseY:this.bladeBaseY,bladeTipY:this.bladeTipY,triangles,vertices,materials:states.length};
    return this.metadata;
  }

  update(time,phase='idle') {
    const charge=phase==='idle'?0:THREE.MathUtils.smoothstep(time,0.03,0.45)*(1-THREE.MathUtils.smoothstep(time,0.65,1.1));
    const strike=Math.exp(-Math.pow((time-0.59)/0.07,2));
    const color=this.config.swordColor??this.config.frostColor??'#79dcff';
    this.runeMaterial.emissive.set(color);
    this.runeMaterial.emissiveIntensity=0.35+charge*1.6+strike*1.4;
    const energy=charge*0.1+strike*0.08;
    this.tint.set(color).multiplyScalar(energy);
    for(const state of this.materialStates){
      if(!state.emissive)continue;
      if(energy>0){state.material.emissive.copy(state.emissive).multiplyScalar(state.emissiveIntensity).add(this.tint);state.material.emissiveIntensity=1;}
      else{state.material.emissive.copy(state.emissive);state.material.emissiveIntensity=state.emissiveIntensity;}
    }
  }

  getBladeSegment(outBase,outTip) {
    this.group.updateWorldMatrix(true,false);
    outBase.set(0,this.bladeBaseY,0).applyMatrix4(this.group.matrixWorld);
    outTip.set(0,this.bladeTipY,0).applyMatrix4(this.group.matrixWorld);
  }

  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.loadId++;
    disposeSwordObject(this.group);this.group.clear();this.group.removeFromParent();
    this.model=null;this.materialStates.length=0;this.available=false;
  }
}

export function disposeSwordObject(root){
  const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();
  root.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[])materials.add(material);
    object.skeleton?.dispose();
  });
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials){for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}
  for(const texture of textures){if(texture.source?.data)images.add(texture.source.data);texture.dispose();}
  for(const image of images)image.close?.();
}
