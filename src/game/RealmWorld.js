import * as T from 'three';
import { heightAt } from './GameData.js';
import { shoreRadius } from './RealmData.js';
import { Sculpture, realmMaterials } from './RealmSculpture.js';
import { makeRealmTerrain, makeRealmDust } from './RealmTerrain.js';
import { makeRealmAtmosphere } from './RealmAtmosphere.js';

const flat=[Math.PI/2,0,0], tau=Math.PI*2;
const materialsOf=root=>{
  const geometries=new Set(),materials=new Set();
  root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material);});
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
};

function basaltCoast(realm,scenery) {
  const palettes={tide:['#477777','#739991','#9fb8a6'],forge:['#4d3a40','#70514b','#96674e'],stars:['#524962','#716480','#9286a4']};
  const colors=palettes[realm.id];
  const positions=[],tints=[];
  for(let index=0;index<112;index++){
    const angle=index/112*tau, next=(index+1)/112*tau;
    const coast=heading=>[Math.cos(heading)*realm.rx*shoreRadius(realm,heading),Math.sin(heading)*realm.rz*shoreRadius(realm,heading)];
    const [x,z]=coast(angle),[nx,nz]=coast(next);
    const top=[x,heightAt(x+realm.x,z+realm.z)-.028,z], right=[nx,heightAt(nx+realm.x,nz+realm.z)-.028,nz];
    const lower=[x*.94,-2.8-.6*Math.cos(angle*9),z*.94],lowerRight=[nx*.94,-2.8-.6*Math.cos(next*9),nz*.94];
    const bottom=[x*.79,-6.4,z*.79],bottomRight=[nx*.79,-6.4,nz*.79];
    const face=(a,b,c,color)=>{positions.push(...a,...b,...c);const shade=new T.Color(color);for(let n=0;n<3;n++)tints.push(shade.r,shade.g,shade.b);};
    face(top,right,lower,colors[1+Number(index%6===0)]);face(right,lowerRight,lower,colors[1]);face(lower,lowerRight,bottom,colors[0]);face(lowerRight,bottomRight,bottom,colors[0]);
    if(index%2===0 && realm.id==='forge'){
      const reach=1.02+(index%7)*.015,h=1.6+(index%5)*.54;
      scenery.column([x*reach,-2.0+h*.38,z*reach],.84,1.05,h,6,colors[index%3],[.05,index*.71,.07]);
    }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(tints,3));geometry.computeVertexNormals();scenery.body.push(geometry);
}

function coral(sculpt,x,y,z,size,seed) {
  const tip=[x+.19*size,y+size,z];
  sculpt.rod([x,y,z],tip,size*.13,size*.048,'#b2c9b2');
  for(let branch=0;branch<5;branch++){
    const a=branch*2.4+seed, spread=size*(.32+branch*.035), start=[x,y+size*(.17+branch*.11),z];
    const elbow=[x+Math.sin(a)*spread,y+size*(.48+branch*.08),z+Math.cos(a)*spread];
    const end=[elbow[0]+Math.sin(a)*size*.13,elbow[1]+size*.28,elbow[2]+Math.cos(a)*size*.14];
    sculpt.rod(start,elbow,size*.072,size*.041,'#c5d6c1');
    sculpt.rod(elbow,end,size*.048,size*.015,'#eadcc5');
    sculpt.rod(elbow,[end[0]-size*.18,end[1]-.09,end[2]+size*.09],size*.04,size*.012,'#efcfb5');
  }
}

function moonGate(sculpt,x,z,r) {
  const y=r*.81,stone='#c6d5bf', gold='#b59861';
  for(let index=0;index<19;index++){
    if(index===6||index===7||index===17) continue;
    const angle=index/19*tau+.12;
    const arch=new T.TorusGeometry(r,r*.077,7,8,tau/19-.019);
    sculpt.add(arch,index%4===0?'#96bcb2':stone,[x,y,z],[1,1,1],[0,0,angle]);
    if(index%3===0)sculpt.ring([x+Math.cos(angle)*r,y+Math.sin(angle)*r,z],r*.089,r*.012,gold,[0,Math.PI/2,angle]);
  }
  sculpt.orb([x,y+.19,z],[r*.42,r*.42,r*.42],'#99c9b7');
  sculpt.ring([x,y+.19,z+.04],r*.47,.025,'#e0d093',[.36,.2,0],1.15);
  sculpt.ring([x,y+.18,z],r*.44,.018,'#9deddf',[1.17,.32,-.48],1.6,Math.PI*1.46);
  for(const side of [-1,1])sculpt.facet([x+side*r*.79,.3,z],[r*.29,.92,r*.22],stone);
}

function tideScenery(sculpt,realm) {
  moonGate(sculpt,...realm.landmark,3.8);
  for(let index=0;index<36;index++){
    const a=index*2.39996, edge=.68+(index%5)*.045, radius=shoreRadius(realm,a);
    const x=Math.cos(a)*realm.rx*radius*edge,z=Math.sin(a)*realm.rz*radius*edge;
    if(Math.abs(x)<4 && z>7)continue;
    const size=.8+(index%5)*.21;
    sculpt.facet([x,.11,z],[size*.93,.37,size*.67],index%2?'#91b3a2':'#5f8b87',[.03,a,.08]);
    if(index%3!==1)coral(sculpt,x,.16,z,size,index);
    else for(let blade=0;blade<5;blade++){
      const yaw=a+blade*.38;
      sculpt.facet([x+Math.sin(yaw)*.33,.55,z+Math.cos(yaw)*.33],[.13,.68,.18],'#86ccba',[.4,yaw,-.2+blade*.10]);
    }
  }
  for(let index=0;index<13;index++){
    const a=index*.48+2.4,r=32+(index%3)*5,x=Math.cos(a)*r,z=Math.sin(a)*r,h=3+index%5*1.22;
    sculpt.facet([x,-4.1,z],[3.4,h,3.1],'#6a9393',[.12,a,.09]);
    if(index%2===0){
      sculpt.rod([x,h-4.7,z],[x+.75,h-2.6,z+.15],.23,.14,'#576456');
      sculpt.facet([x+.8,h-2.57,z],[2.15,.56,1.45],'#548479',[0,a,.09]);
    }
  }
}

function forgeScenery(sculpt,realm) {
  const bronze='#9f6948', gold='#d6a461', dark='#483b41',[x,z]=realm.landmark;
  for(let step=0;step<3;step++)sculpt.column([x,.18+step*.36,z],3.5-step*.4,3.7-step*.4,.36,8,step%2?bronze:dark);
  for(let foot=0;foot<3;foot++){
    const a=foot*tau/3;
    sculpt.rod([x+Math.sin(a)*2,1,z+Math.cos(a)*2],[x+Math.sin(a)*1.45,3,z+Math.cos(a)*1.45],.34,.45,bronze);
  }
  const profile=[[.58,1.65],[1.42,1.83],[2.2,2.47],[2.45,3.42],[2.33,3.76],[2.60,4.02],[2.6,4.24],[2.24,4.24],[2.13,3.76]];
  sculpt.add(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),40),bronze,[x,0,z]);
  for(const [height,radius] of [[2.52,2.22],[3.48,2.46],[4.22,2.59]])sculpt.ring([x,height,z],radius,.09,gold,flat);
  sculpt.orb([x,3.83,z],[2.12,.24,2.12],'#ff9237',2.05);
  for(let stud=0;stud<16;stud++){
    const a=stud*tau/16;
    sculpt.facet([x+Math.sin(a)*2.39,3.05,z+Math.cos(a)*2.39],[.18,.30,.17],gold,[0,a,.13]);
  }
  for(const side of [-1,1]){
    const path=[[x+side*2.21,3.35,z],[x+side*2.99,4.27,z],[x+side*3.45,5.81,z],[x+side*4.03,6.48,z-.21]];
    for(let n=0;n<3;n++)sculpt.rod(path[n],path[n+1],.35-n*.085,.29-n*.12,bronze);
    sculpt.facet(path[2],[.31,.42,.31],gold);
  }
  for(let index=0;index<32;index++){
    const a=index*2.39996,r=shoreRadius(realm,a),edge=.82+(index%3)*.06,x=Math.cos(a)*realm.rx*r*edge,z=Math.sin(a)*realm.rz*r*edge;
    if(Math.abs(x)<4&&z>7) continue;
    const height=.64+index%4*.52;
    for(let col=0;col<3;col++){
      const dx=Math.cos(a+col*2.3)*.78,dz=Math.sin(a+col*2.3)*.78,h=height*(.55+col*.21);
      sculpt.column([x+dx,h*.42,z+dz],.60,.76,h,6,col===1?'#77504a':dark,[.065,a,.045]);
    }
    if(index%5===0){
      sculpt.ring([x,height*.7+.09,z],.63,.044,gold,flat);
      sculpt.facet([x,height*.76+.15,z],[.28,.48,.26],'#ff862f',[.1,a,.2],1.9);
    }
  }
  for(let index=0;index<25;index++){
    const a=index*2.4,r=31+index%4*3,h=3+index%7*.9;
    sculpt.column([Math.sin(a)*r,-4+h*.28,Math.cos(a)*r],1.65,2.6,h,6,index%3===0?'#8d584b':'#65454b',[.08,a,.1]);
  }
}

function starScenery(sculpt,realm,orbitAssembly) {
  const brass='#c6a16a', pale='#ecddac',slate='#61567c',[x,z]=realm.landmark;
  for(let step=0;step<3;step++)sculpt.column([x,.14+step*.31,z],2.5-step*.37,2.8-step*.4,.31,12,step%2?brass:slate);
  sculpt.column([x,1.73,z],.53,1.36,1.94,8,slate);
  const centre=[0,0,0];
  for(const [radius,tube,rotation] of [[3.2,.11,[.14,.45,.1]],[2.85,.085,[1.14,.14,.33]],[2.52,.095,[.75,-.7,-.80]],[1.88,.036,[1.53,0,0]]]){
    orbitAssembly.ring(centre,radius,tube,brass,rotation);
  }
  orbitAssembly.orb(centre,[.64,.64,.64],'#fbe1a2',2.3);
  for(let index=0;index<34;index++){
    const a=index*tau/34;
    orbitAssembly.rod([Math.cos(a)*3.04,Math.sin(a)*3.04,0],[Math.cos(a)*3.29,Math.sin(a)*3.29,0],.029,.027,pale);
    if(index%5===0)orbitAssembly.facet([Math.cos(a)*2.78,0,Math.sin(a)*2.78],[.17,.17,.17],'#c1b9ff',[0,a,0],1.8);
  }
  for(let index=0;index<22;index++){
    const a=index*tau/22,r=shoreRadius(realm,a)*(.83+index%3*.045),x=Math.cos(a)*realm.rx*r,z=Math.sin(a)*realm.rz*r;
    if(Math.abs(x)<4 && z>8)continue;
    const h=1+index%4*.62;
    sculpt.column([x,.15,z],.80,.98,.38,6,slate);
    sculpt.column([x,h*.45,z],.38,.59,h,5,slate,[0,a,.035]);
    sculpt.column([x,h*.91,z],.40,.47,.11,5,brass,[0,a,0]);
    sculpt.facet([x,h+.43,z],[.23,.57,.23],index%2?pale:'#b8b0ff',[0,a,0],1.23);
  }
  for(let index=0;index<24;index++){
    const a=index*2.4,r=27+index%6*2,h=index%5,x=Math.sin(a)*r,z=Math.cos(a)*r;
    sculpt.facet([x,-4+h*.61,z],[1.4+h*.39,2.2+h*.51,1.5+h*.32],slate,[.1,a,.23]);
    if(index%3===0)sculpt.ring([x,-1.7+h*.8,z],1.9,.04,brass,flat);
  }
}

function landingMark(group,point,realm,materials,isExit) {
  const build=new Sculpture(), tint=isExit?'#dac797':realm.color;
  build.column([0,.08,0],isExit?1.32:1.03,isExit?1.45:1.13,.16,realm.id==='forge'?8:24,realm.ink);
  build.ring([0,.19,0],isExit?1.14:.91,.035,'#d8c18e',flat);
  if(isExit){
    build.ring([0,1.18,0],.86,.075,'#b59569',[.12,.43,0],0,Math.PI*1.80);
    build.facet([0,1.2,0],[.15,.29,.15],tint,[0,.25,0],1.65);
  }else if(realm.id==='tide'){
    for(let index=0;index<7;index++){
      const a=index*tau/7;
      build.facet([Math.cos(a)*.53,.30,Math.sin(a)*.53],[.20,.30,.14],'#d1e4cb',[.43,a,.12]);
    }
    build.orb([0,.55,0],[.27,.27,.27],tint,1.4);
  }else if(realm.id==='stars'){
    build.column([0,.38,0],.22,.45,.64,6,'#786584');
    build.ring([0,1.07,0],.37,.038,'#d1ae73');
    build.facet([0,1.07,0],[.13,.25,.13],tint,[0,.4,0],1.45);
  }
  const result=build.build(group,materials);
  result.position.set(point.x-realm.x,heightAt(point.x,point.z),point.z-realm.z);
  return result;
}

const accentMaterial=()=>new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
  uniforms:{uTime:{value:0},uState:{value:0},uCharge:{value:0},uColor:{value:new T.Color()}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec2 vUv;uniform vec3 uColor;uniform float uTime,uState,uCharge;
   void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x),w=max(fwidth(r),.005);
   float rim=1.-smoothstep(.012,.018+w,abs(r-.945));float inner=1.-smoothstep(.006,.013+w,abs(r-.855));
   float marks=step(.57,cos(a*16.))*(1.-smoothstep(.015,.034+w,abs(r-.90)));
   float progress=step(fract(a/6.283185+1.),uCharge)*(1.-smoothstep(.014,.032+w,abs(r-.80)));
   float fill=(1.-smoothstep(.85,.95,r))*.095;float alpha=(fill+rim*.90+inner*.53+marks*.6+progress)*mix(.25,1.,uState);
   if(alpha<.012)discard;gl_FragColor=vec4(uColor*(1.11+uState*.46+.10*sin(uTime*2.)),min(.94,alpha));}`});

function makeStrikes(group,state,realm){
  const count=state.realms.strikes.length, geo=new T.PlaneGeometry(1,1,12,12);geo.rotateX(-Math.PI/2);
  const data=new Float32Array(count*4);
  geo.setAttribute('aStrike',new T.InstancedBufferAttribute(data,4).setUsage(T.DynamicDrawUsage));
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTint:{value:new T.Color(realm.color)}},
    vertexShader:`
    attribute vec4 aStrike;
    varying vec2 vUv;
    varying vec4 vStrike;
    void main(){
      vUv=uv;
      vStrike=aStrike;
      vec4 point=modelMatrix*instanceMatrix*vec4(position,1.);
      // Conform to the same height field as the walkable floor and the hit test.
      point.y=.20+sin(point.x*.11)*.18+cos(point.z*.13)*.16;
      gl_Position=projectionMatrix*viewMatrix*point;
    }`,
    fragmentShader:`varying vec2 vUv;varying vec4 vStrike;uniform vec3 uTint;void main(){
    vec2 p=abs(vUv*2.-1.);float ring=vStrike.x,inner=vStrike.y,t=vStrike.z,flash=vStrike.w;
    float r=length(p),sd=ring>.5?max(r-1.,inner>0.?inner-r:-1.):max(p.x,p.y)-1.;
    float aa=max(.003,fwidth(sd));float mask=1.-smoothstep(-aa,aa,sd);if(mask<.01) discard;
    float rim=1.-smoothstep(.022,.04+aa,abs(sd));float sweep=ring>.5?r:vUv.y;
    float fill=.24+(.5+.5*cos((sweep-t)*15.))*.075;
    float moving=1.-smoothstep(.016,.035+aa,abs(sweep-t));float alpha=mask*(fill+rim*.64+moving*.22);
    vec3 danger=mix(vec3(.66,.115,.065),uTint,.25);
    vec3 color=mix(danger,vec3(1.8,.91,.51),rim*.8+moving*.14);color=mix(color,uTint*2.4+vec3(.3),flash);
    gl_FragColor=vec4(color,min(.94,alpha+flash*.5)*max(.0,1.-max(0.,t-1.)));}`});
  const mesh=new T.InstancedMesh(geo,material,count);mesh.frustumCulled=false;mesh.count=0;mesh.renderOrder=3;group.add(mesh);
  const dummy=new T.Object3D();
  return ()=>{
    let index=0;
    for(const hit of state.realms.strikes)if(hit.active&&hit.age>=hit.cueAfter){
      const ring=hit.kind==='ring',extent=ring?hit.radius*2:0;
      dummy.position.set(hit.x-realm.x,0,hit.z-realm.z);
      dummy.scale.set(ring?extent:hit.width,1,ring?extent:hit.length);dummy.rotation.y=hit.yaw;dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
      const offset=index++*4,tail=Math.max(0,hit.age-hit.delay)/.34;
      const cue=(hit.age-hit.cueAfter)/(hit.delay-hit.cueAfter);
      data[offset]=Number(ring);data[offset+1]=ring?hit.inner/hit.radius:0;data[offset+2]=hit.fired?1+tail:cue;data[offset+3]=hit.fired?1-tail:0;
    }
    mesh.count=index;if(index){geo.attributes.aStrike.needsUpdate=true;mesh.instanceMatrix.needsUpdate=true;}
  };
}

export class RealmWorld {
  constructor(scene,state,clock,night,hero){this.scene=scene;this.state=state;this.clock=clock;this.night=night;this.hero=hero;this.worlds=new Map();this.active=null;}
  build(realm){
    const root=new T.Group();root.name=realm.name;root.position.set(realm.x,0,realm.z);this.scene.add(root);
    const materials=realmMaterials(), sculpt=new Sculpture(), armillary=new Sculpture();
    for(const material of Object.values(materials)){
      material.onBeforeCompile=shader=>{
        shader.uniforms.uFocus=this.hero;
        shader.vertexShader='varying vec3 vScenery;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvScenery=(modelMatrix*vec4(transformed,1.)).xyz;');
        shader.fragmentShader='uniform vec3 uFocus;varying vec3 vScenery;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          vec3 ray=uFocus-cameraPosition;float t=dot(vScenery-cameraPosition,ray)/max(.01,dot(ray,ray));
          if(t>0.&&t<1.&&vScenery.y>.9){float d=distance(vScenery,cameraPosition+t*ray);
          if(fract(dot(gl_FragCoord.xy,vec2(.7548777,.5698403)))>smoothstep(.81,1.55,d)) discard;}`);
      };
      material.customProgramCacheKey=()=>'realm-scenery-focus-v1';
    }
    makeRealmTerrain(root,realm,this.clock,this.night);basaltCoast(realm,sculpt);
    if(realm.id==='tide')tideScenery(sculpt,realm);
    else if(realm.id==='forge')forgeScenery(sculpt,realm);
    else starScenery(sculpt,realm,armillary);
    sculpt.build(root,materials);
    const orbit=armillary.build(root,materials);orbit.position.set(realm.landmark[0],5.25,realm.landmark[1]);
    landingMark(root,realm.entry,realm,materials,true);
    const rings=realm.nodes.map(point=>{
      const marker=landingMark(root,point,realm,materials,false);
      const material=accentMaterial();material.uniforms.uColor.value.set(realm.color);
      const size=realm.id==='tide'?2*2.45/.945:3.45;
      const ring=new T.Mesh(new T.PlaneGeometry(size,size),material);ring.rotation.x=-Math.PI/2;ring.position.y=.10;ring.renderOrder=1;marker.add(ring);
      return material.uniforms;
    });
    const links=[];
    if(realm.id==='stars')for(let index=0;index<realm.nodes.length-1;index++){
      const a=realm.nodes[index],b=realm.nodes[index+1],length=distance2D(a,b), geo=new T.PlaneGeometry(.10,length);geo.rotateX(-Math.PI/2);
      const material=new T.MeshBasicMaterial({color:'#f6d99f',transparent:true,opacity:.75,depthWrite:false});
      const beam=new T.Mesh(geo,material);beam.position.set((a.x+b.x)/2-realm.x,Math.max(heightAt(a.x,a.z),heightAt(b.x,b.z))+.16,(a.z+b.z)/2-realm.z);
      beam.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);root.add(beam);links.push(beam);
    }
    makeRealmDust(root,realm,this.clock);
    makeRealmAtmosphere(root,realm,this.clock,this.night);
    return {root,rings,links,orbit,updateStrikes:makeStrikes(root,this.state,realm)};
  }
  update(time){
    const run=this.state.realms, realm=run.realm;
    if(this.active!==realm){
      if(this.active)this.worlds.get(this.active.id).root.visible=false;
      this.active=realm;
      if(realm){
        if(!this.worlds.has(realm.id))this.worlds.set(realm.id,this.build(realm));
        this.worlds.get(realm.id).root.visible=true;
      }
    }
    if(!realm)return;
    const world=this.worlds.get(realm.id), next=run.nextIndex();
    world.orbit.rotation.y=time*.15;
    for(const [index,u]of world.rings.entries()){
      const done=run.progress.finished||run.marked(index);
      u.uTime.value=time;u.uState.value=done?.28:realm.id==='stars'&&index!==next?.1:1;
      u.uCharge.value=done?1:run.charging===index?run.charge/2.4:0;
    }
    world.links.forEach((beam,index)=>{beam.visible=run.progress.finished||run.marked(index);});
    world.updateStrikes();
  }
  dispose(){for(const {root}of this.worlds.values()){root.removeFromParent();materialsOf(root);}}
}
const distance2D=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
