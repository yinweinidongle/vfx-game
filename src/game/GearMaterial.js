import * as T from 'three';
const drapeDecl=`attribute vec3 aDrape;uniform vec4 uCloth[4];uniform vec2 uWing;uniform mat3 uDrapeToLocal;uniform float uForgeTime;
vec4 clothCurve(float v){float x=clamp(v,0.,1.)*4.;if(x<1.)return uCloth[0]*x;if(x<2.)return mix(uCloth[0],uCloth[1],x-1.);if(x<3.)return mix(uCloth[1],uCloth[2],x-2.);return mix(uCloth[2],uCloth[3],min(1.,x-3.));}
`;
function deformation(slot){return slot==='cloak'?`vec4 bend=clothCurve(aDrape.y);float anchor=pow(clamp(aDrape.y,0.,1.),1.25);vec3 delta=vec3(bend.x+bend.z*aDrape.x,bend.w,bend.y+sin(aDrape.x*10.+uForgeTime*2.5-aDrape.y*5.)*.009*anchor);transformed+=uDrapeToLocal*delta;`:`float span=abs(aDrape.x)*2.;float hinge=(aDrape.x<0.?uWing.x:uWing.y)*smoothstep(.1,.5,span);float flex=sin(uForgeTime*2.1-span*5.)*.009*span*span;vec3 delta=vec3((cos(hinge)-1.)*aDrape.x,sin(hinge)*span*.48+flex,-sin(hinge)*span*.17);transformed+=uDrapeToLocal*delta;`;}
/** Same vertex deformation is applied to both the PBR surface and its shadow. */
export function dressMaterial(mesh,slot,energy,dynamics,drape){
 const dynamic=slot==='cloak'||slot==='wings',materials=[];
 const vertex=shader=>{if(dynamic){shader.uniforms.uCloth={value:dynamics.cloak};shader.uniforms.uWing={value:dynamics.wings};shader.uniforms.uDrapeToLocal={value:drape};shader.vertexShader=drapeDecl+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+deformation(slot));}};
 const own=source=>{const m=source.clone();m.metalness=Math.min(.62,m.metalness);m.roughness=Math.max(.28,m.roughness);m.side=dynamic?T.DoubleSide:T.FrontSide;
  m.onBeforeCompile=shader=>{shader.uniforms.uForgeTint=energy.tint;shader.uniforms.uForgePower=energy.power;shader.uniforms.uForgeRank=energy.rank;shader.uniforms.uForgeTime=energy.time;shader.uniforms.uForgeWidth=energy.width;shader.uniforms.uTaichu=energy.taichu;vertex(shader);
   shader.vertexShader='varying vec3 vForgeLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvForgeLocal=position;');
   shader.fragmentShader='varying vec3 vForgeLocal;uniform vec3 uForgeTint;uniform float uForgePower,uForgeRank,uForgeTime,uForgeWidth,uTaichu;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
     float facing=clamp(abs(dot(normalize(normal),normalize(vViewPosition))),0.,1.);
     float edge=1.-smoothstep(uForgeWidth*.15,uForgeWidth,facing);
     float fresnel=pow(1.-facing,3.8);
     float scan=pow(max(0.,sin(vForgeLocal.y*37.-uForgeTime*2.8+vForgeLocal.x*7.)),28.);
     float engraving=pow(max(0.,sin(vForgeLocal.x*61.+vForgeLocal.y*25.)),24.);
     float rank=clamp(uForgeRank/20.,0.,1.);
     // A fixed luminance for the rim keeps purple and red upgrades brighter
     // as the rank rises, even though the source colors have different values.
     vec3 chroma=mix(uForgeTint/max(dot(uForgeTint,vec3(.2126,.7152,.0722)),.1),vec3(1.),.40);
     float rimPower=uForgePower*(edge*1.28+fresnel*.31+scan*.14*rank+engraving*.075*rank);
     float jade=clamp(diffuseColor.g-diffuseColor.r,0.,.45);
     outgoingLight=max(outgoingLight,diffuseColor.rgb*.50);
     outgoingLight+=chroma*rimPower+uTaichu*vec3(.10,1.16,.83)*(fresnel*.55+jade*(.7+.85*scan));
     #include <opaque_fragment>
   `);
  };m.customProgramCacheKey=()=>`rpg-forged-v3-${dynamic?slot:'rigid'}`;materials.push(m);return m;
 };
 mesh.material=Array.isArray(mesh.material)?mesh.material.map(own):own(mesh.material);
 if(dynamic){const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide});depth.onBeforeCompile=shader=>{shader.uniforms.uForgeTime=energy.time;vertex(shader);};depth.customProgramCacheKey=()=>`rpg-forged-shadow-v2-${slot}`;mesh.customDepthMaterial=depth;materials.push(depth);}
 return materials;
}
