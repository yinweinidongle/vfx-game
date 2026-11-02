import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A reusable hinged jade coffer, with bevelled brass fittings and an inlaid seal. */
export function makeRelicChest() {
  const root=new T.Group(),lid=new T.Group();lid.name='relic-chest-lid';lid.position.set(0,.77,-.5);root.add(lid);
  const jade=new T.MeshStandardMaterial({color:'#153c49',metalness:.35,roughness:.38});
  const brass=new T.MeshStandardMaterial({color:'#bd9a5b',metalness:.78,roughness:.32});
  const inset=new T.MeshStandardMaterial({color:'#112833',metalness:.2,roughness:.65});
  const buckets=new Map();
  const add=(geometry,material,parent=root)=>{if(geometry.index){const source=geometry;geometry=source.toNonIndexed();source.dispose();}const key=parent===root?'body':'lid';if(!buckets.has(key))buckets.set(key,new Map());const map=buckets.get(key);if(!map.has(material))map.set(material,[]);map.get(material).push(geometry);};
  const box=(w,h,d,x,y,z,material,parent=root)=>{const g=new RoundedBoxGeometry(w,h,d,2,Math.min(w,h,d)*.16);g.translate(x,y,z);add(g,material,parent);};
  // Four separate walls leave a real recessed cavity when the lid opens.
  box(1.64,.14,1,0,.22,0,jade);box(1.73,.12,1.08,0,.16,0,brass);
  for(const z of [-.445,.445]){box(1.64,.49,.11,0,.49,z,jade);box(1.7,.075,.1,0,.74,z,brass);}
  for(const x of [-.765,.765]){box(.11,.49,.8,x,.49,0,jade);box(.1,.075,.99,x,.74,0,brass);}
  const velvet=new T.MeshStandardMaterial({color:'#18353b',roughness:.94,metalness:0});
  box(1.4,.035,.76,0,.3,0,velvet);
  for(const x of [-.698,.698])box(.025,.38,.78,x,.51,0,velvet);
  for(const z of [-.38,.38])box(1.42,.38,.025,0,.51,z,velvet);
  for(const x of [-.64,.64])box(.025,.02,.7,x,.33,0,brass);
  for(const z of [-.34,.34])box(1.3,.02,.025,0,.33,z,brass);
  for(const x of [-.72,.72]){box(.11,.59,1.025,x,.46,0,brass);for(const z of [-.4,.4])box(.22,.16,.23,x,.07,z,brass);}
  box(1.15,.36,.025,0,.46,.51,inset);
  for(const x of [-.42,.42]){const g=new T.BoxGeometry(.28,.28,.024);g.rotateZ(Math.PI/4);g.translate(x,.46,.53);add(g,brass);}
  const roof=(depth,scale,x,material)=>{const shape=new T.Shape();shape.moveTo(-.5*scale,0);shape.lineTo(.5*scale,0);shape.bezierCurveTo(.5*scale,.24*scale,.28*scale,.42*scale,0,.42*scale);shape.bezierCurveTo(-.28*scale,.42*scale,-.5*scale,.24*scale,-.5*scale,0);const g=new T.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelThickness:.018,bevelSize:.018,bevelSegments:2,curveSegments:12});g.rotateY(Math.PI/2);g.translate(x-depth/2,0,.5);add(g,material,lid);};
  roof(1.63,1,0,jade);for(const x of [-.71,.71])roof(.09,1.035,x,brass);
  // The underside is visible after opening: inset suede, a brass border and relief seal.
  box(1.48,.035,.85,0,-.025,.5,brass,lid);box(1.35,.04,.72,0,-.048,.5,velvet,lid);
  for(const x of [-.58,.58])for(const z of [.2,.8]){const rivet=new T.SphereGeometry(.035,8,6);rivet.scale(1,.35,1);rivet.translate(x,-.074,z);add(rivet,brass,lid);}
  const medallion=new T.CylinderGeometry(.17,.17,.018,8);medallion.rotateY(Math.PI/8);medallion.translate(0,-.08,.5);add(medallion,brass,lid);
  const jewel=new T.OctahedronGeometry(.09);jewel.scale(1,.3,1);jewel.translate(0,-.104,.5);add(jewel,jade,lid);
  for(const x of [-.55,.55]){const hinge=new T.CylinderGeometry(.06,.06,.22,12);hinge.rotateZ(Math.PI/2);hinge.translate(x,.75,-.48);add(hinge,brass);}
  box(.17,.35,.08,0,.02,1.03,brass,lid);
  const seal=new T.OctahedronGeometry(.12,0);seal.scale(1,1.4,.35);seal.translate(0,-.015,1.085);add(seal,new T.MeshStandardMaterial({color:'#86dfde',emissive:'#2a7d8c',emissiveIntensity:.7,metalness:.4,roughness:.18}),lid);
  for(const [part,map]of buckets)for(const [material,geometries]of map){const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());const mesh=new T.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;(part==='body'?root:lid).add(mesh);}
  const contents=new T.Group();contents.name='relic-chest-contents';root.add(contents);
  const treasure=new T.MeshStandardMaterial({color:'#d9ba75',metalness:.72,roughness:.26,emissive:'#8d602c',emissiveIntensity:.25});
  const coinGeometry=new T.CylinderGeometry(.095,.095,.025,12);
  for(let i=0;i<13;i++){const coin=new T.Mesh(coinGeometry,treasure);coin.position.set(Math.sin(i*2.4)*.43,.34+(i%3)*.028,Math.cos(i*2.4)*.22);coin.rotation.set((i%3)*.13,i*.7,Math.sin(i)*.2);contents.add(coin);}
  const relic=new T.Mesh(new T.OctahedronGeometry(.16),new T.MeshStandardMaterial({color:'#c5e5d5',emissive:'#8ee7d3',emissiveIntensity:.65,metalness:.35,roughness:.2}));relic.position.set(.14,.49,.02);relic.scale.set(.7,1.3,.7);contents.add(relic);
  const glow=new T.Mesh(new T.PlaneGeometry(1.35,.76),new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,uniforms:{uAlpha:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float uAlpha;void main(){float a=pow(max(0.,1.-length((vUv-.5)*2.)),1.6);gl_FragColor=vec4(1.8,1.1,.35,a*uAlpha);}'}));glow.name='relic-chest-glow';glow.rotation.x=-Math.PI/2;glow.position.y=.34;root.add(glow);
  return root;
}
