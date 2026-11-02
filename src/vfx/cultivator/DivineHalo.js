import * as THREE from 'three';

const vertex=`varying vec2 vP;void main(){vP=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment=`
uniform float uTime,uPresence,uLayer,uRadiance;uniform vec3 uColor;varying vec2 vP;
const float PI=3.14159265359;
float stroke(float d,float w){return 1.-smoothstep(w,w+max(fwidth(d),.001),abs(d));}
float ring(float r,float at,float w){return stroke(r-at,w);}
void main(){
 float r=length(vP);if(r>1.||uPresence<.002)discard;
 float a=atan(vP.y,vP.x),ink=0.,detail=0.;
 if(uLayer<.5){
  ink=ring(r,.974,.0022)+ring(r,.941,.0014)+ring(r,.805,.0016);
  float cell=fract((a+PI)*40./(2.*PI))-.5;
  detail=stroke(cell,.038)*smoothstep(.842,.852,r)*(1.-smoothstep(.922,.93,r));
  float longTick=stroke(fract((a+PI)*10./(2.*PI))-.5,.035);
  detail+=longTick*smoothstep(.805,.81,r)*(1.-smoothstep(.938,.942,r));
  float arc=step(.12,fract((a+PI)*8./(2.*PI)))*step(fract((a+PI)*8./(2.*PI)),.79);
  ink+=ring(r,.885,.002)*arc;
 }else{
  ink=ring(r,.96,.0022)+ring(r,.925,.0012)+ring(r,.73,.0015);
  float cell=fract((a+PI)*12./(2.*PI))-.5;
  float sector=floor((a+PI)*12./(2.*PI));
  for(int j=0;j<3;j++){
   float split=step(.5,fract(sin(sector*7.13+float(j)*3.71)*415.91));
   float gap=mix(1.,smoothstep(.025,.065,abs(cell)),split);
   detail+=ring(r,.79+float(j)*.042,.005)*step(abs(cell),.27)*gap;
  }
  detail+=stroke(abs(cell)-.36,.016)*smoothstep(.77,.78,r)*(1.-smoothstep(.90,.91,r));
 }
 float sweep=pow(max(0.,cos(a-uTime*2.3+uLayer*1.7)),14.);
 float mask=clamp(ink*.65+detail,0.,1.);
 float alpha=mask*uPresence*.53;if(alpha<.007)discard;
 vec3 color=mix(uColor*uColor,vec3(.88,.97,1.),.05+uLayer*.09+detail*.12);
 gl_FragColor=vec4(color*(uRadiance+sweep*.3),alpha);
}`;

/** Two restrained outer wheels leave the apparition's face and torso unobstructed. */
export class DivineHalo{
 constructor(parent){
  this.group=new THREE.Group();this.group.name='Two outer celestial wheels, clear centre';
  this.group.rotation.y=Math.PI/2-.28;this.group.position.set(-12.3,6,0);parent.add(this.group);
  this.geometry=new THREE.PlaneGeometry(2,2);this.layers=[];
  const radii=[6.1,5.25],depth=[-.48,0],speed=[1.8,-2.8];
  for(let i=0;i<2;i++){
   const uniforms={uTime:{value:0},uPresence:{value:0},uLayer:{value:i},uRadiance:{value:[1.35,1.65][i]},uColor:{value:new THREE.Color('#8ac4ff')}};
   const material=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
   const mesh=new THREE.Mesh(this.geometry,material);mesh.position.z=depth[i];mesh.scale.setScalar(radii[i]);mesh.renderOrder=0;mesh.frustumCulled=false;
   this.group.add(mesh);this.layers.push({mesh,uniforms,speed:speed[i]});
  }
 }
 update(time,presence,size,color,centreY=6*size){
  this.group.visible=presence>.001;this.group.scale.setScalar(size*.92);this.group.position.y=centreY;
  for(const layer of this.layers){layer.mesh.rotation.z=time*layer.speed;layer.uniforms.uTime.value=time;layer.uniforms.uPresence.value=presence;layer.uniforms.uColor.value.set(color);}
 }
 dispose(){for(const layer of this.layers)layer.mesh.material.dispose();this.geometry.dispose();this.group.removeFromParent();}
}
