import * as THREE from 'three';

const vertex = `
varying vec2 vP;
void main(){vP=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
const fragment = `
uniform float uTime,uOpen,uOpacity,uVariant,uRadiance; uniform vec3 uColor; varying vec2 vP;
const float PI=3.14159265359;
float line(float d,float width){return 1.-smoothstep(width,width+max(fwidth(d),.0012),abs(d));}
float ring(float r,float at,float width){return line(r-at,width);}
float box(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
void main(){
  float r=length(vP);if(r>1.||uOpacity<.001||uOpen<.001)discard;
  float a=atan(vP.y,vP.x),spin=uTime*.085;
  float grow=smoothstep(r-.07,r+.035,uOpen);
  float outer=ring(r,.96,.0025)+ring(r,.925,.0012)+ring(r,.86,.002);
  float tickAngle=a*48./(2.*PI);float tick=abs(fract(tickAngle)-.5);
  outer+=step(tick,.075)*smoothstep(.885,.89,r)*(1.-smoothstep(.914,.917,r))*.85;
  float oct=a+spin;
  float cells=fract((oct+PI)*8./(2.*PI))-.5;
  float sector=floor((oct+PI)*8./(2.*PI));
  float glyph=0.;
  for(int i=0;i<3;i++){
    float radial=.745+float(i)*.032;
    float split=step(.5,fract(sin(sector*7.13+float(i)*3.71)*415.91));
    float gap=mix(1.,smoothstep(.025,.055,abs(cells)),split);
    glyph+=ring(r,radial,.004)*step(abs(cells),.23)*gap;
  }
  float border=ring(r,.705,.0015)+ring(r,.835,.0015);
  float petal=.46+.145*cos(8.*(a-spin*.75));
  float lotus=line(r-petal,.0027);
  lotus+=line(r-(.43+.115*cos(8.*(a-spin*.75)+PI)),.0011)*.55;
  float seal=ring(r,.305,.002)+ring(r,.265,.0015);
  // Interlocking eightfold diamonds and a clear empty centre.
  float diamond=abs(vP.x)+abs(vP.y);
  float square=max(abs(vP.x),abs(vP.y));
  seal+=line(diamond-.255,.002)+line(square-.18,.0018);
  float ray=pow(max(0.,cos(a*16.+spin)),28.)*ring(r,.65,.012)*.65;
  float scan=pow(max(0.,cos(a-uTime*.5)),20.)*.3;
  float ink=clamp(outer+border+glyph+lotus+seal+ray,0.,1.);
  vec3 color=mix(uColor,vec3(1.),.1);
  float strength=1.15+scan+ring(r,.96,.004)*.45;
  float alpha=ink*uOpacity*grow;
  if(alpha<.008)discard;
  gl_FragColor=vec4(color*strength*uRadiance,alpha);
}
`;

/** Polar seals, lotus engraving and rotating eight-sector glyphs, all real-time. */
export class MagicMandala {
  constructor(parent, radius = 3, horizontal = true) {
    this.uniforms = { uTime:{value:0},uOpen:{value:0},uOpacity:{value:0},uVariant:{value:0},uRadiance:{value:1},uColor:{value:new THREE.Color('#ffc86a')} };
    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    this.mesh = new THREE.Mesh(this.geometry,this.material);this.mesh.scale.setScalar(radius);
    if(horizontal)this.mesh.rotation.x=-Math.PI/2;
    this.mesh.renderOrder=2;this.mesh.frustumCulled=false;parent.add(this.mesh);
  }
  update(time,open,opacity,color){this.uniforms.uTime.value=time;this.uniforms.uOpen.value=open;this.uniforms.uOpacity.value=opacity;if(color)this.uniforms.uColor.value.set(color);this.mesh.visible=opacity>.001&&open>.001;}
  dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
