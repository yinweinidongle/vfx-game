import * as T from 'three';

/** Fix the light topology first. Compile under the same light counts used during combat. */
export async function warmVFX(renderer,scene,camera,roots){
  const textures=new Set(),saved=[];
  scene.traverse(o=>{if(!o.material)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
    if(m.isShaderMaterial&&m.transparent&&m.side===T.DoubleSide)m.forceSinglePass=true;
    for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
    for(const uniform of Object.values(m.uniforms||{}))if(uniform.value?.isTexture)textures.add(uniform.value);
  }});
  for(const texture of textures)renderer.initTexture(texture);
  await renderer.compileAsync(scene,camera);
  // Hidden pools already have shaders, but still need their first GPU buffer upload.
  for(const root of roots)root.traverse(o=>{saved.push([o,o.visible,o.frustumCulled,o.isInstancedMesh?o.count:null]);o.visible=true;if(o.isMesh||o.isPoints||o.isLine)o.frustumCulled=false;if(o.isInstancedMesh&&o.count===0)o.count=1;});
  const target=new T.WebGLRenderTarget(8,8),previous=renderer.getRenderTarget(),auto=renderer.autoClear;
  try{renderer.autoClear=true;renderer.setRenderTarget(target);renderer.render(scene,camera);}
  finally{renderer.setRenderTarget(previous);renderer.autoClear=auto;target.dispose();for(const [o,visible,cull,count]of saved){o.visible=visible;o.frustumCulled=cull;if(count!==null)o.count=count;}}
}
