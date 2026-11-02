import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import * as THREE from 'three';
import { PaintedCrescentBlade, extractPaintedCrescentProfile, createPaintedCrescentGeometry, samplePaintedSurface } from '../src/vfx/sword/PaintedCrescentBlade.js';
import { BranchingLightning } from '../src/vfx/sword/BranchingLightning.js';

const artwork=await sharp(new URL('../public/textures/anime-crescent-v1.png',import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const profile=extractPaintedCrescentProfile(artwork.data,artwork.info.width,artwork.info.height);
const config={bladeSize:1,energyColor:'#39dfff',lightningColor:'#9170ff'};

test('alpha contour extraction rejects isolated specks and preserves the original image aspect',()=>{
  const width=64,height=64,pixels=new Uint8Array(width*height*4);
  for(let y=8;y<=55;y++){
    const end=Math.floor(55-(y-31.5)**2/45);
    for(let x=end-8;x<=end;x++)pixels[(y*width+x)*4+3]=255;
  }
  pixels[(1*width+1)*4+3]=255;pixels[(62*width+62)*4+3]=255;
  const result=extractPaintedCrescentProfile(pixels,width,height);
  assert.equal(result.pixelBounds.minY,8);assert.equal(result.pixelBounds.maxY,55);assert.ok(result.pixelBounds.minX>1);assert.ok(result.pixelBounds.maxX<62);
  assert.equal(result.coverage[65],0);assert.equal(result.coverage[62*width+62],0);
  const expected=(result.pixelBounds.maxX-result.pixelBounds.minX+1)/(result.pixelBounds.maxY-result.pixelBounds.minY+1)*3.6;
  assert.ok(Math.abs(result.maxX-result.minX-expected)<1e-9);assert.equal(result.maxX,.75);
});

test('the actual painted crescent becomes a closed 3.6 metre lens with original source UVs and finite normals',()=>{
  const geometry=createPaintedCrescentGeometry(profile),positions=geometry.attributes.position,uv=geometry.attributes.uv;
  assert.ok(profile.componentPixels>400000);assert.ok(profile.maxX-profile.minX>3.5&&profile.maxX-profile.minX<3.6);
  assert.ok(Math.abs(geometry.boundingBox.max.y-geometry.boundingBox.min.y-3.6)<1e-6);
  assert.ok(Math.abs(geometry.boundingBox.max.x-.75)<1e-6);assert.ok(Math.abs(geometry.boundingBox.max.z-geometry.boundingBox.min.z-.08)<1e-6);
  assert.ok(geometry.attributes.normal.array.every(Number.isFinite));assert.ok(positions.array.every(Number.isFinite));
  for(let i=0;i<uv.count;i++)assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);
  const sourceScale=3.6/(profile.pixelBounds.maxY-profile.pixelBounds.minY+1);
  for(let i=0;i<positions.count;i+=17){
    const sourceX=uv.getX(i)*profile.width;
    assert.ok(Math.abs(positions.getX(i)-((sourceX-profile.pixelBounds.maxX-1)*sourceScale+.75))<1e-6,'UV must retain its painted image coordinate');
  }
  const edges=new Map(),index=geometry.index.array;
  for(let i=0;i<index.length;i+=3)for(let j=0;j<3;j++){const a=index[i+j],b=index[i+(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;edges.set(key,(edges.get(key)||0)+1);}
  assert.ok([...edges.values()].every(count=>count===2));geometry.dispose();
});

test('painted attachment APIs follow arbitrary swing planes, actual horns and the tilted rear seam',()=>{
  const blade=new PaintedCrescentBlade(config),texture=new THREE.Texture();blade.installTexture(texture,profile);
  blade.group.position.set(-2,1.6,.3);blade.group.quaternion.setFromEuler(new THREE.Euler(.6,-.4,1.1));blade.update(.7,{config});
  const upper=new THREE.Vector3(),lower=new THREE.Vector3();blade.getTipPositions(upper,lower);
  assert.ok(upper.distanceTo(profile.upperTip.clone().applyMatrix4(blade.surfaceFrame))<1e-9);
  assert.ok(lower.distanceTo(profile.lowerTip.clone().applyMatrix4(blade.surfaceFrame))<1e-9);
  const local=new THREE.Vector3(),world=new THREE.Vector3();blade.sampleLocalSurface(.43,.72,local,1,.004);blade.sampleSurface(.43,.72,world);
  assert.ok(world.distanceTo(local.applyMatrix4(blade.surfaceFrame))<1e-9);
  const seam=new Float32Array(75);assert.equal(blade.getTrailProfile(seam),true);
  const expected=new THREE.Vector3(),tilt=new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(25));
  for(let i=0;i<25;i++){samplePaintedSurface(profile,i/24,.025,expected,0);expected.applyMatrix4(tilt);assert.ok(expected.distanceTo(new THREE.Vector3().fromArray(seam,i*3))<1e-6);}
  assert.notEqual(profile.upperTip.x,profile.lowerTip.x,'painted horns preserve the authored asymmetry');blade.dispose();
});

test('surface lightning uses the painted frame and live contours, while replay reuses the art mesh and buffers',()=>{
  const scene=new THREE.Scene(),blade=new PaintedCrescentBlade(config),texture=new THREE.Texture();blade.installTexture(texture,profile);scene.add(blade.group);
  const lightning=new BranchingLightning(scene,config);lightning.setSurfaceProvider(blade);
  const geometry=blade.geometry,positions=geometry.attributes.position.array,mesh=blade.meshes[0],material=mesh.material;
  const upper=new THREE.Vector3(),lower=new THREE.Vector3(),sample=new THREE.Vector3(),expected=new THREE.Vector3();
  for(let i=0;i<30;i++){
    blade.group.quaternion.setFromEuler(new THREE.Euler(.2+i*.01,.3,.9));blade.update(.65+i/30,{formation:1,config});blade.getTipPositions(upper,lower);
    lightning.update(.65+i/30,blade.group.position,.85,'flight',config,lower,upper);
    lightning.sampleSurface(.5,.8,1,.9,sample);blade.sampleLocalSurface(.5,.8,expected,1,.004);expected.applyMatrix4(blade.surfaceFrame);
    assert.ok(sample.distanceTo(expected)<1e-9);assert.equal(blade.geometry,geometry);assert.equal(blade.meshes[0],mesh);assert.equal(mesh.material,material);assert.equal(geometry.attributes.position.array,positions);
    assert.ok(lightning.positions.every(Number.isFinite));
  }
  blade.update(2.6,{formation:1,life:0,impact:1,config});assert.equal(blade.uniforms.uLife.value,0);assert.equal(blade.uniforms.uImpact.value,1);
  blade.update(.5,{formation:.6,life:1,impact:0,config});assert.equal(blade.uniforms.uImpact.value,0);assert.equal(blade.uniforms.uFormation.value,.6);
  let textureDisposals=0;texture.addEventListener('dispose',()=>textureDisposals++);blade.dispose();blade.dispose();lightning.dispose();assert.equal(textureDisposals,1);assert.equal(scene.children.length,0);
});
