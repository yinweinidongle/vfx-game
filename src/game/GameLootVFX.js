import * as T from 'three';
import {heightAt} from './GameData.js';
import {GEAR_RARITIES, TAICHU_RARITY} from './GearData.js';
import {equipmentProfile} from './EquipmentCatalog.js';
import {LootFlare} from './LootFlare.js';
import {STONE_CAPACITY} from './SpiritStones.js';

const CAP=96;

function makeStonePool() {
 const geometry = new T.OctahedronGeometry(1).scale(.78,1,.68);
 const material = new T.ShaderMaterial({
  uniforms:{uTime:{value:0}},
  vertexShader:`
   varying vec3 vNormal,vEye,vLocal;
   void main(){
    vec4 view=modelViewMatrix*instanceMatrix*vec4(position,1.);
    vNormal=normalize(mat3(modelViewMatrix*instanceMatrix)*normal);
    vEye=-view.xyz; vLocal=position;
    gl_Position=projectionMatrix*view;
   }`,
  fragmentShader:`
   uniform float uTime;
   varying vec3 vNormal,vEye,vLocal;
   void main(){
    vec3 n=normalize(vNormal),view=normalize(vEye);
    float diffuse=max(0.,dot(n,normalize(vec3(-.5,.9,.4))));
    float rim=pow(clamp(1.-abs(dot(n,view)),0.,1.),2.4);
    float glint=pow(max(0.,sin(vLocal.y*7.-uTime*4.4)),13.)*.28;
    vec3 jade=mix(vec3(.075,.27,.17),vec3(.34,1.54,.94),diffuse);
    gl_FragColor=vec4(jade+rim*vec3(.64,1.3,.81)+vec3(.72,1.08,.83)*glint,1.);
   }`,
 });
 const mesh = new T.InstancedMesh(geometry,material,STONE_CAPACITY);
 mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
 mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;
 return mesh;
}

function groundMaterial(source, clock) {
 const material=source.clone();
 material.onBeforeCompile=shader=>{
  shader.uniforms.uLootTime=clock;
  shader.vertexShader=`attribute vec4 aLootTint;
    varying vec4 vLootTint;
    `+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vLootTint=aLootTint;`);
  shader.fragmentShader=`uniform float uLootTime; varying vec4 vLootTint;
    `+shader.fragmentShader.replace('#include <opaque_fragment>',`
      float rim=pow(clamp(1.-abs(dot(normalize(normal),normalize(vViewPosition))),0.,1.),3.);
      float gleam=.40+.60*pow(max(0.,sin(uLootTime*11.)),6.);
      outgoingLight=max(outgoingLight,diffuseColor.rgb*.65)+vLootTint.rgb*rim*.25;
      float landed=step(1.5,vLootTint.w);
      float rare=step(.5,vLootTint.w);
      float contact=max(0.,vLootTint.w-2.);
      float glowing=mix(rim*(.50+gleam*.98),rim*(.54+contact*.38),landed);
      outgoingLight+=rare*vec3(.12,1.75,1.20)*glowing;
      #include <opaque_fragment>
    `);
 };
 material.customProgramCacheKey=()=> 'ground-equipment-v3';
 return material;
}

// A thin back-face shell traces the actual item's silhouette. The front
// surface keeps its own texture and occludes the shell as usual.
function outlineMaterial() {
 return new T.ShaderMaterial({
  transparent:true,depthTest:true,depthWrite:false,side:T.BackSide,
  vertexShader:`
    attribute vec4 aLootTint;
    varying float vVisible,vContact;
    void main(){
      vVisible=step(1.5,aLootTint.w);
      vContact=max(0.,aLootTint.w-2.);
      vec3 shell=position+normal*(.012+vContact*.008);
      gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(shell,1.);
    }`,
  fragmentShader:`
    varying float vVisible,vContact;
    void main(){
      if(vVisible<.5)discard;
      vec3 teal=vec3(.15,1.87,1.35);
      vec3 peak=vec3(1.14,4.18,3.01);
      gl_FragColor=vec4(mix(teal,peak,vContact),.84);
    }`,
 });
}

/** Instanced equipment shells and currency share the same simulated drop positions. */
export class GameLootVFX{
 constructor(scene,state,templates={},camera=null){
  this.state=state;this.camera=camera;this.group=new T.Group();scene.add(this.group);this.dummy=new T.Object3D();this.color=new T.Color();this.buckets=new Map();this.visibleDrops=[];this.flare=new LootFlare(this.group,camera);
  this.stones=makeStonePool();this.group.add(this.stones);
  this.clock={value:0};
  for(const [id,root]of Object.entries(templates)){
   root.updateWorldMatrix(true,true);const parts=[],outlines=[],bounds=new T.Box3().setFromObject(root),clearance=-bounds.min.z;
   root.traverse(o=>{
    if(!o.isMesh)return;
    const geo=o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    geo.setAttribute('aLootTint',new T.InstancedBufferAttribute(new Float32Array(CAP*4),4).setUsage(T.DynamicDrawUsage));
    const material=groundMaterial(Array.isArray(o.material)?o.material[0]:o.material,this.clock);
    const mesh=new T.InstancedMesh(geo,material,CAP);
    mesh.count=0;mesh.frustumCulled=false;mesh.visible=false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.group.add(mesh);parts.push(mesh);
    if(id.endsWith('-taichu')){
     const outline=new T.InstancedMesh(geo,outlineMaterial(),CAP);
     outline.instanceMatrix=mesh.instanceMatrix;
     outline.count=0;outline.visible=false;outline.frustumCulled=false;
     outline.renderOrder=7;this.group.add(outline);outlines.push(outline);
    }
   });this.buckets.set(id,{parts,outlines,count:0,landed:0,clearance});
  }
  const beamGeo=new T.CylinderGeometry(.025,.07,1,6,1,true);beamGeo.setAttribute('aTint',new T.InstancedBufferAttribute(new Float32Array(CAP*3),3));
  this.beams=new T.InstancedMesh(beamGeo,new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,blending:T.AdditiveBlending,vertexShader:'attribute vec3 aTint;varying vec3 vTint;varying vec2 vUv;void main(){vTint=aTint;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vTint;varying vec2 vUv;void main(){float core=pow(max(0.,sin(vUv.x*3.14159)),3.);float a=pow(1.-vUv.y,2.)*(.08+core*.09);gl_FragColor=vec4(vTint*1.7,a);}'}),CAP);this.beams.count=0;this.beams.frustumCulled=false;this.group.add(this.beams);
 }
 handle(event){
  if(event.rarity===TAICHU_RARITY){
   if(event.type==='gearDrop')this.flare.emit(event,this.state.drops.find(d=>d.lootId===event.lootId));
   if(event.type==='gearLand')this.flare.settle(event.lootId);
  } else if(event.type==='gearDrop'||event.type==='gearLand')this.flare.emit(event);
 }
 update(dt=0,presenting=false){
  this.clock.value+=dt;
  this.visibleDrops.length=0;for(const bucket of this.buckets.values())bucket.count=bucket.landed=0;let beams=0,stones=0;
  for(const d of this.state.drops){
   if(!d.alive||(!d.gear&&!d.stones)||Math.hypot(d.x-this.state.player.x,d.z-this.state.player.z)>40)continue;
   if(d.stones){
    if(stones<STONE_CAPACITY)this.drawStone(d,stones++);
    continue;
   }
   if(this.visibleDrops.length>=CAP)continue;
   d.modelId ||=equipmentProfile(d.gear,this.state.kind).id;const bucket=this.buckets.get(d.modelId);if(!bucket)continue;this.visibleDrops.push(d);const rarity=d.gear.rarity,flight=d.flight||.7,t=Math.min(1,d.age/flight),size=(d.gear.slot==='wings'?1.15:d.gear.slot==='weapon'?1.02:.77)*(1+rarity*.035),seed=d.seed||d.lootId*.7,clearance=bucket.clearance*size+.015;
   this.color.set(GEAR_RARITIES[rarity].color);
   this.dummy.position.set(d.x,(d.y??heightAt(d.x,d.z)+.14)-.14+clearance,d.z);
   this.dummy.rotation.set(-Math.PI/2*t+Math.sin(seed)*.7*(1-t),seed+(1-t)*Math.PI*2,Math.cos(seed)*.6*(1-t),'YXZ');
   this.dummy.scale.setScalar(size);this.dummy.updateMatrix();
   const taichu=rarity===TAICHU_RARITY;
   const contact=taichu&&d.landed;
   const peak=contact?1-T.MathUtils.smoothstep(d.age-flight,0,.32):0;
   const phase=contact?2+peak:Number(taichu);
   for(const mesh of bucket.parts){
    mesh.setMatrixAt(bucket.count,this.dummy.matrix);
    mesh.geometry.attributes.aLootTint.setXYZW(bucket.count,this.color.r,this.color.g,this.color.b,phase);
   }
   bucket.count++;
   if(contact)bucket.landed++;
   if(!taichu&&t>=1&&rarity>0&&beams<CAP){
    const h=rarity===2?1.9:1.2;
    this.dummy.position.set(d.x,heightAt(d.x,d.z)+h*.5,d.z);
    this.dummy.rotation.set(0,0,0);this.dummy.scale.set(1,h,1);this.dummy.updateMatrix();
    this.beams.setMatrixAt(beams,this.dummy.matrix);
    this.color.toArray(this.beams.geometry.attributes.aTint.array,beams++*3);
   }
  }
  for(const bucket of this.buckets.values()){
   for(const mesh of bucket.parts){mesh.count=bucket.count;mesh.visible=bucket.count>0;if(bucket.count){mesh.instanceMatrix.needsUpdate=true;mesh.geometry.attributes.aLootTint.needsUpdate=true;}}
   for(const outline of bucket.outlines){outline.count=bucket.count;outline.visible=bucket.landed>0;}
  }
  this.beams.count=beams;this.beams.instanceMatrix.needsUpdate=beams>0;this.beams.geometry.attributes.aTint.needsUpdate=beams>0;
  this.stones.count=stones;
  this.stones.visible=stones>0;
  if(stones){this.stones.material.uniforms.uTime.value=this.state.time;this.stones.instanceMatrix.needsUpdate=true;}
  this.flare.update(dt,presenting);
 }
 drawStone(drop,index) {
  const size=.18+Math.min(.16,Math.log1p(drop.stones)*.025);
  const floor=heightAt(drop.x,drop.z),t=drop.age/drop.flight;
  const tumble=Math.max(0,1-t);
  this.dummy.position.set(drop.x,Math.max(drop.y??floor+.14,floor+size),drop.z);
  this.dummy.rotation.set(.52+tumble*4.4,drop.seed*.17+tumble*5.1,.21+tumble*.46);
  this.dummy.scale.setScalar(size);
  this.dummy.updateMatrix();
  this.stones.setMatrixAt(index,this.dummy.matrix);
 }
 dispose(){
  const geometries=new Set();
  this.group.traverse(o=>{if(o.isMesh){if(o.isInstancedMesh)o.dispose();geometries.add(o.geometry);o.material.dispose();}});
  for(const geometry of geometries)geometry.dispose();
  this.group.removeFromParent();
 }
}
