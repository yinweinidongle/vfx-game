import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt } from './GameData.js';

/** Authored ruins: broken silhouettes, carved stone, open sightlines. */
export async function loadRuins(world) {
  const gltf=await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}game/models/ruins-library.glb`);
  world.resources.push(gltf.scene);
  const placements=new Map();
  const add=(name,x,z,scale=1,yaw=0,y=heightAt(x,z))=>{
    if(!placements.has(name))placements.set(name,[]);
    placements.get(name).push({x,z,y,scale,yaw});
  };
  const column=(x,z,scale=1,short=false)=>{
    add(short?'Column_Round_Short':'Column_Round',x,z,scale);
    world.colliders.push({x,z,r:scale*.4});
  };
  const arch=(name,x,z,scale=1,yaw=0)=>{
    add(name,x,z,scale,yaw);
    for(const side of [-1,1])world.colliders.push({x:x+Math.cos(yaw)*1.25*scale,z:z-Math.sin(yaw)*1.25*scale,r:.37*scale});
  };
  // The ruined observatory is a cloister, with gaps framing the combat floor.
  for(const x of [7,29])for(const z of [-19,-11,-3])column(x,z,1.05,z===-3);
  for(const x of [10,18,26])arch('Arch_Round',x,-22,1.55);
  arch('Arch_Gothic',18,-31,1.35);
  for(const [x,z,yaw]of [[4,-16,Math.PI/2],[32,-16,Math.PI/2],[10,-29,0],[25,-30,0]]){
    add('Wall_ArchRound_Broken',x,z,1.05,yaw);
    for(const s of [-1,1])world.colliders.push({x:x+Math.cos(yaw)*1.5*s,z:z-Math.sin(yaw)*1.5*s,r:.65});
  }
  for(const [x,z,scale,yaw]of [[10,-27,.66,.3],[26,-27,.66,-.3],[46,38,.9,.3],[59,38,.9,-.3]]){
    add('Statue_Stag',x,z,scale,yaw);world.colliders.push({x,z,r:.9*scale});
  }
  for(const [x,z,yaw]of [[4,-24,.4],[31,-7,1.2],[11,-32,.1],[27,-3,-.4],[35,-20,.7]])add('Wall_Broken',x,z,.6,yaw);
  for(let i=0;i<16;i++){
    const a=i*2.39996,r=12.5+(i%3)*1.2,x=18+Math.sin(a)*r,z=-10+Math.cos(a)*r;
    add('Bricks',x,z,.38+(i%4)*.12,a);
  }
  // Broken floor edging gives the broad arena a human scale without clutter.
  for(let x=8;x<=28;x+=2)for(let z=-20;z<=0;z+=2){
    if(Math.abs(x-18)<7&&Math.abs(z+10)<7)continue;
    if((x*7+z*3)%11===0)continue;
    add('Floor_Squares',x,z,.96,Math.PI*.5*((x+z)%4),heightAt(x,z)-.055);
  }
  for(let i=0;i<11;i++){
    const a=.15+i/11*Math.PI*2,x=51+Math.sin(a)*17,z=24+Math.cos(a)*17;
    column(x,z,.95+(i%3)*.12,i%3===1);
  }
  arch('Arch_Gothic',52,41,2.0,Math.PI);
  arch('Arch_Round',42,14,1.5,-.68);
  for(let i=0;i<30;i++){
    const a=i/30*Math.PI*2;add('Floor_Diamond',51+Math.sin(a)*13.5,24+Math.cos(a)*13.5,.9,a,heightAt(51+Math.sin(a)*13.5,24+Math.cos(a)*13.5)-.05);
  }
  // Distant fragments sit low in the haze, rather than becoming giant white towers.
  for(const [x,z,s,yaw]of [[-43,-42,2.1,.7],[16,-60,2.7,-.3],[78,-28,2.8,.6],[87,45,2.4,-.8]]){
    add('Arch_Gothic',x,z,s,yaw,-8);add('Wall_Broken',x+3*s,z,s,yaw,-8);
  }

  const dummy=new T.Object3D(),relative=new T.Matrix4(),inverse=new T.Matrix4();
  for(const [name,instances]of placements){
    const source=gltf.scene.getObjectByName(name);source.updateMatrixWorld(true);inverse.copy(source.matrixWorld).invert();
    source.traverse(o=>{
      if(!o.isMesh)return;
      const geometry=o.geometry.clone().applyMatrix4(relative.copy(inverse).multiply(o.matrixWorld)),material=o.material.clone();
      material.onBeforeCompile=s=>{
        s.uniforms.uHero=world.hero;
        s.vertexShader='varying vec3 vRuins;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRuins=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;');
        s.fragmentShader='uniform vec3 uHero;varying vec3 vRuins;\n'+s.fragmentShader;
        s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float grain=fract(sin(dot(floor(vRuins.xz*25.+vRuins.y*3.),vec2(12.9898,78.233)))*43758.54);
          float stain=.5+.5*sin(vRuins.x*.8+sin(vRuins.z*1.7)+vRuins.y*.9);
          diffuseColor.rgb*=.83+grain*.13+stain*.16;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.055,.10,.073),.17*stain*(1.-smoothstep(.2,1.2,vRuins.y)));
          vec3 ray=uHero-cameraPosition,frag=vRuins-cameraPosition;float along=dot(frag,ray)/max(.01,dot(ray,ray));
          if(along>0.&&along<.97&&vRuins.y>1.4){float hide=smoothstep(.65,1.35,length(frag-ray*along));if(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.54)>hide)discard;}`);
      };
      material.customProgramCacheKey=()=> 'rpg-carved-ruins';
      const mesh=new T.InstancedMesh(geometry,material,instances.length);mesh.castShadow=mesh.receiveShadow=true;
      instances.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.computeBoundingSphere();world.group.add(mesh);world.geometries.push(geometry);world.materials.push(material);
    });
  }
}
