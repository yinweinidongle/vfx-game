import * as T from 'three';
import { heightAt } from './GameData.js';
import { shoreRadius } from './RealmData.js';

const groundPatterns = {
  tide:`float grain=fnoise(p*.54);vec2 q=p*.78+vec2(grain*2.4,fnoise(p*.33-1.)*3.);
    float veins=1.-smoothstep(.018,.13,abs(sin(q.x+sin(q.y*.79)+uTime*.23)*.6+cos(q.y*.9+q.x*.23-uTime*.17)*.44));
    float bars=smoothstep(.38,.68,fnoise(p*.19+vec2(4.,0.)));
    vec3 base=mix(vec3(.045,.245,.24),vec3(.31,.56,.47),bars*.78+grain*.2);
    base+=vec3(.11,.23,.17)*veins*(.28+.72*bars);
    base+=vec3(.21,.25,.18)*pow(max(0.,sin(q.y*1.9+grain*4.)),17.)*.29;`,
  forge:`vec2 q=p*.54;float stone=fnoise(p*.78);float cells=cellEdge(q+vec2(fnoise(p*.39),fnoise(p*.47+7.))*.42);
    float seam=1.-smoothstep(.016,.075,cells), hot=1.-smoothstep(.008,.03,cells);
    float bed=smoothstep(.46,.7,fnoise(p*.21-13.));
    vec3 base=mix(vec3(.094,.065,.07),vec3(.285,.155,.097),stone);
    base=mix(base,vec3(.065,.041,.042),seam*.85)+vec3(.9,.21,.043)*hot*bed*(.81+.12*sin(uTime*1.5+p.x*.47));
    float inlay=1.-smoothstep(.022,.08,abs(max(abs(p.x),abs(p.y)) - 12.));base+=vec3(.21,.095,.023)*inlay;`,
  stars:`float n=fnoise(p*.55);vec2 q=mat2(.866,-.5,.5,.866)*p*.29;
    vec2 tile=abs(fract(q)-.5);float seam=smoothstep(.468,.493,max(tile.x,tile.y));
    vec3 base=mix(vec3(.084,.085,.174),vec3(.205,.18,.305),n)*(1.-seam*.27);
    float radial=length(p);float engrave=abs(fract(radial/3.)-.5)*3.;float ring=1.-smoothstep(.023,.064,engrave);
    float angle=atan(p.y,p.x);float notch=step(.65,cos(angle*36.))*(1.-smoothstep(.19,.35,engrave));
    base+=vec3(.28,.21,.13)*(ring*.56+notch*.38)*(1.-smoothstep(13.,18.,radial));
    base+=vec3(.25,.2,.48)*pow(max(0.,sin(q.x*2.+q.y+n*5.+uTime*.27)),22.)*.24;`,
};
const noise=`
float rhash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float rnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(rhash(i),rhash(i+vec2(1,0)),f.x),mix(rhash(i+vec2(0,1)),rhash(i+1.),f.x),f.y);}
float fnoise(vec2 p){return rnoise(p)*.57+rnoise(p*2.03)*.28+rnoise(p*4.08)*.15;}
float cellEdge(vec2 p){vec2 i=floor(p),f=fract(p);float first=8.,second=8.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 b=vec2(float(x),float(y));vec2 h=vec2(rhash(i+b),rhash(i+b+71.));vec2 v=b+.18+.64*h-f;float d=dot(v,v);second=min(second,max(first,d));first=min(first,d);}
 return sqrt(second)-sqrt(first);}
`;

function floorGeometry(realm) {
  const positions=[],indices=[],radii=[],paintUVs=[],sectors=120,rings=24;
  for(let row=0;row<=rings;row++)for(let col=0;col<=sectors;col++){
    const angle=col/sectors*Math.PI*2, radius=row/rings*shoreRadius(realm,angle);
    const x=Math.cos(angle)*radius*realm.rx,z=Math.sin(angle)*radius*realm.rz;
    positions.push(x,heightAt(x+realm.x,z+realm.z),z);radii.push(row/rings);
    paintUVs.push(.5+x/(realm.rx*2.18),.5-z/(realm.rz*2.18));
    if(row && col){const index=row*(sectors+1)+col;indices.push(index-1,index-sectors-2,index-sectors-1,index-1,index-sectors-1,index);}
  }
  const ground=new T.BufferGeometry();ground.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  ground.setAttribute('aShore',new T.Float32BufferAttribute(radii,1));
  ground.setAttribute('aPaintUV',new T.Float32BufferAttribute(paintUVs,2));
  ground.setIndex(indices);ground.computeVertexNormals();
  return ground;
}

const backgrounds = {
  tide:`vec2 q=p*.24;float n=fnoise(q+uTime*.05);float crest=1.-smoothstep(.026,.14,abs(sin(q.y*1.9+q.x*.3+n*6.-uTime*.57)));
    vec3 color=mix(vec3(.012,.077,.116),vec3(.10,.27,.29),n)+vec3(.09,.22,.20)*crest*(.20+n*.48);`,
  forge:`float n=fnoise(p*.25+uTime*.032);float river=1.-smoothstep(.025,.19,abs(n-.51));
    vec3 color=mix(vec3(.048,.025,.033),vec3(.27,.067,.025),n)+vec3(.78,.13,.012)*pow(river,4.);`,
  stars:`float nebula=fnoise(p*.065+vec2(uTime*.005,0.));vec2 tile=p*1.2;float star=rhash(floor(tile));
    float spark=(1.-smoothstep(.017,.08,length(fract(tile)-vec2(.5))))*step(.86,star);
    vec3 color=mix(vec3(.017,.026,.072),vec3(.165,.102,.25),smoothstep(.25,.8,nebula))+spark*vec3(.82,.73,1.15)*(.7+.22*sin(uTime+star*24.));`,
};
export function makeRealmTerrain(group,realm,clock,night) {
  const material=new T.MeshStandardMaterial({roughness:realm.id==='tide'?.48:.75,metalness:realm.id==='stars'?.22:.08});
  const fallback=new T.DataTexture(new Uint8Array([128,128,128,255]),1,1);
  fallback.needsUpdate=true;
  const painting={value:fallback}, paintWeight={value:0};
  let disposed=false;
  const albedo=new T.TextureLoader().load(`${import.meta.env.BASE_URL}game/art/realms/${realm.id}-floor.webp`,texture=>{
    if(disposed)return;
    texture.colorSpace=T.SRGBColorSpace;
    texture.anisotropy=4;
    painting.value=texture;
    paintWeight.value=realm.id==='tide'?.78:.85;
  });
  material.addEventListener('dispose',()=>{disposed=true;albedo.dispose();fallback.dispose();});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uTime=clock;
    shader.uniforms.uPainting=painting;shader.uniforms.uPaintWeight=paintWeight;
    shader.vertexShader='attribute float aShore;attribute vec2 aPaintUV;varying vec2 vPaintUV,vRealm;varying float vEdge;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRealm=position.xz;vEdge=aShore;vPaintUV=aPaintUV;');
    shader.fragmentShader='varying vec2 vPaintUV,vRealm;varying float vEdge;uniform float uTime,uPaintWeight;uniform sampler2D uPainting;\n'+noise+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\nvec2 p=vRealm;'+groundPatterns[realm.id]+`
      vec3 pigment=texture2D(uPainting,vPaintUV).rgb;
      vec3 surface=mix(base,base*.40+pigment*.96,uPaintWeight);
      diffuseColor.rgb=surface*(.97+rnoise(p*18.)*.06)*(1.-.16*smoothstep(.92,1.,vEdge));`);
  };
  material.customProgramCacheKey=()=>'realm-floor-'+realm.id;
  const ground=new T.Mesh(floorGeometry(realm),material);ground.receiveShadow=true;group.add(ground);
  const seaMaterial=new T.ShaderMaterial({uniforms:{uTime:clock,uNight:night},vertexShader:`
    varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:noise+'\nuniform float uTime,uNight;varying vec2 vP;void main(){vec2 p=vP;'+backgrounds[realm.id]+'gl_FragColor=vec4(color*(1.-uNight*.46),1.);}'});
  const sea=new T.Mesh(new T.PlaneGeometry(230,230),seaMaterial);
  sea.position.y=-5.6;sea.rotation.x=-Math.PI/2;group.add(sea);
}

export function makeRealmDust(group,realm,clock) {
  const positions=[],seeds=[];
  for(let index=0;index<196;index++){
    const angle=index*2.39996,radius=5+((index*37)%103)*.34;
    positions.push(Math.sin(angle)*radius,(index*13%57)*.125,Math.cos(angle)*radius);seeds.push((index*19%97)/97);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('aSeed',new T.Float32BufferAttribute(seeds,1));
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    uniforms:{uTime:clock,uColor:{value:new T.Color(realm.color)},uDrift:{value:realm.id==='forge'?1.2:.32}},
    vertexShader:`attribute float aSeed;uniform float uTime,uDrift;varying float vA;
     void main(){vec3 pos=position;pos.y=mod(pos.y+uTime*uDrift,8.);pos.x+=.55*sin(uTime*.55+aSeed*24.);
     vA=smoothstep(0.,.8,pos.y)*(1.-smoothstep(5.8,8.,pos.y))*(.46+.22*sin(aSeed*70.+uTime));
     vec4 eye=modelViewMatrix*vec4(pos,1.);gl_Position=projectionMatrix*eye;gl_PointSize=clamp((30.+aSeed*42.)/max(1.,-eye.z),1.,5.);}`,
    fragmentShader:`uniform vec3 uColor;varying float vA;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>=1.)discard;gl_FragColor=vec4(uColor*2.3,(1.-d*d)*vA);}`});
  group.add(new T.Points(geometry,material));
}
