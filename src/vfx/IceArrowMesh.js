import * as THREE from 'three';

const crystalVertex = /* glsl */`
  attribute float aFacet;
  attribute float aAxial;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vFacet;
  varying float vAxial;
  void main() {
    vLocal = position;
    vFacet = aFacet;
    vAxial = aAxial;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const crystalFragment = /* glsl */`
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uFormation;
  uniform float uCharge;
  uniform float uCompression;
  uniform float uCore;
  uniform float uImpact;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vFacet;
  varying float vAxial;
  float segment(vec2 p, vec2 a, vec2 b) {
    vec2 ab=b-a;
    return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));
  }
  void main() {
    float reveal = smoothstep(-2.2, 1.43, vAxial);
    if (reveal > uFormation + 0.02) discard;
    float axial=clamp((vAxial+2.03)/3.45,0.0,1.0);
    vec3 cell=floor(vec3(vAxial,vLocal.yz)*vec3(18.0,31.0,31.0));
    float grain=fract(sin(dot(cell,vec3(127.1,311.7,74.7)))*43758.5453);
    float impactField=1.0-axial+(grain-0.5)*0.085+sin(vLocal.y*49.0+vLocal.z*35.0)*0.012;
    float remaining=impactField-uImpact;
    if(uImpact>=0.9999||(uImpact>0.0&&remaining<0.0))discard;
    float fractureEdge=(1.0-smoothstep(0.0,0.065,remaining))*step(0.0001,uImpact);
    float spark=step(0.82,grain)*pow(0.5+0.5*sin(uTime*89.0+grain*73.0),4.0);
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(vView);
    float fresnel = pow(max(0.0, 1.0 - abs(dot(n, viewDir))), 4.0);
    float facet = pow(max(dot(n,normalize(vec3(-0.4,0.8,0.6))),0.0), 5.0);
    float secondLight = pow(max(dot(n,normalize(vec3(0.75,-0.2,0.55))),0.0), 18.0);
    float reflection = pow(max(0.0,1.0-abs(dot(reflect(-viewDir,n),normalize(vec3(-0.4,0.75,0.4))))),19.0);
    float pulse = pow(0.5 + 0.5 * sin(vAxial * 8.5 - uTime * 10.0), 9.0);
    float striation = pow(0.5+0.5*sin(vLocal.x*30.0-uTime*17.0+vLocal.y*51.0+vLocal.z*27.0),26.0);
    vec2 p=vec2(vLocal.x,vLocal.y+vLocal.z*0.6);
    float fracture=min(segment(p,vec2(-0.27,0.015),vec2(0.36,0.1)),segment(p,vec2(0.36,0.1),vec2(0.98,0.025)));
    fracture=min(fracture,segment(p,vec2(0.1,0.065),vec2(-0.02,0.27)));
    fracture=min(fracture,segment(p,vec2(0.52,0.08),vec2(0.31,-0.18)));
    float veins=exp(-fracture*220.0)*0.65+exp(-fracture*70.0)*0.09;
    float thick=clamp(abs(vLocal.y)*1.7+abs(vLocal.z)*1.3,0.0,1.0);
    // Dark blue refraction pockets preserve the crystal cuts under bloom.
    vec3 deep=mix(vec3(0.012,0.055,0.19),uColor*0.3,0.42);
    vec3 blue=mix(deep,uColor*0.65,facet*0.52+vFacet*0.21);
    vec3 ice=mix(blue,vec3(0.53,0.82,0.96),facet*0.45+secondLight*0.22);
    ice*=0.57+vFacet*0.57;
    ice+=uColor*(fresnel*0.6+reflection*0.19+veins*0.62+striation*pulse*0.09);
    ice+=vec3(0.45,0.79,1.0)*(uCharge*0.025+uCompression*0.18);
    ice=mix(ice,mix(uColor*1.25,vec3(1.25,1.65,1.9),pulse)*(0.7+uCharge*0.15+uCompression*0.5),uCore);
    float alpha=(0.84+thick*0.07+fresnel*0.07)*smoothstep(0.0,0.16,uFormation);
    ice+=mix(uColor,vec3(0.72,1.0,1.12),0.4)*fractureEdge*(0.72+spark*1.35);
    gl_FragColor=vec4(ice,mix(alpha,0.96,uCore));
  }
`;

const edgeVertex = /* glsl */`
  attribute float aAxial;
  varying float vAxial;
  varying vec3 vEdgeLocal;
  void main(){vAxial=aAxial;vEdgeLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
const edgeFragment = /* glsl */`
  uniform vec3 uColor;
  uniform float uFormation;
  uniform float uCompression;
  uniform float uImpact;
  varying float vAxial;
  varying vec3 vEdgeLocal;
  void main(){
    if(smoothstep(-2.2,1.43,vAxial)>uFormation+0.02)discard;
    float axial=clamp((vAxial+2.03)/3.45,0.0,1.0);
    vec3 cell=floor(vec3(vAxial,vEdgeLocal.yz)*vec3(18.0,31.0,31.0));
    float grain=fract(sin(dot(cell,vec3(127.1,311.7,74.7)))*43758.5453);
    float impactField=1.0-axial+(grain-0.5)*0.085+sin(vEdgeLocal.y*49.0+vEdgeLocal.z*35.0)*0.012;
    if(uImpact>=0.9999||(uImpact>0.0&&impactField<uImpact))discard;
    float bright=0.54+0.22*uCompression;
    gl_FragColor=vec4(mix(uColor,vec3(0.77,0.98,1.0),0.35),bright*smoothstep(0.0,0.2,uFormation));
  }
`;

function addFacetAttribute(geometry) {
  const values=new Float32Array(geometry.attributes.position.count);
  for(let i=0;i<values.length;i+=3){
    const seed=0.2+((Math.sin((i/3+1)*127.1)*43758.5453)%1+1)%1*0.8;
    values[i]=values[i+1]=values[i+2]=seed;
  }
  geometry.setAttribute('aFacet',new THREE.BufferAttribute(values,1));
  return geometry;
}

// A thick, double-bevelled arrowhead. Every face has its own normal.
// Unlike a cone, its silhouette has swept barbs and a pronounced central ridge.
function bladeGeometry(length = 1, width = 1, depth = 1) {
  const outline = [[1.42,0],[0.18,0.31],[-0.43,0.56],[-0.23,0.13],[-0.5,0],[-0.23,-0.13],[-0.43,-0.56],[0.18,-0.31]];
  const vertices = [];
  const push = (a,b,c) => vertices.push(...a,...b,...c);
  const coord = (p,z) => [p[0]*length,p[1]*width,z*depth];
  const inset=outline.map((p,i)=>[
    0.16+(p[0]-0.16)*(i===0?0.88:0.77),p[1]*0.68,
  ]);
  for (let i=0;i<outline.length;i++) {
    const j=(i+1)%outline.length;
    const a=outline[i],b=outline[j],ia=inset[i],ib=inset[j];
    const za=i===0?0:0.027,zb=j===0?0:0.027;
    const iaz=i===0?0.055:(i===4?0.12:0.15);
    const ibz=j===0?0.055:(j===4?0.12:0.15);
    for(const side of [1,-1]){
      const ridge=[0.12*length,0,0.28*depth*side];
      const aa=coord(a,za*side),bb=coord(b,zb*side);
      const ai=coord(ia,iaz*side),bi=coord(ib,ibz*side);
      if(side>0){push(ridge,ai,bi);push(ai,aa,bb);push(ai,bb,bi);}
      else{push(ridge,bi,ai);push(ai,bb,aa);push(ai,bi,bb);}
    }
    push(coord(a,za),coord(a,-za),coord(b,-zb));
    push(coord(a,za),coord(b,-zb),coord(b,zb));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.computeVertexNormals();
  return addFacetAttribute(geo);
}

function spearGeometry(start,end,width,depth) {
  const positions=[];
  const ring = [[0,width,0],[0,0,depth],[0,-width,0],[0,0,-depth]];
  for (let i=0;i<4;i++) {
    const a=[(start+end)*0.5,ring[i][1],ring[i][2]];
    const b=[(start+end)*0.5,ring[(i+1)%4][1],ring[(i+1)%4][2]];
    positions.push(start,0,0,...b,...a, end,0,0,...a,...b);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.computeVertexNormals();
  return addFacetAttribute(geo);
}

export class IceArrowMesh {
  constructor(config) {
    this.group=new THREE.Group();
    this.group.name='Faceted frost arrow';
    this.uniforms={uColor:{value:new THREE.Color(config.frostColor)},uTime:{value:0},uFormation:{value:1},uCharge:{value:0},uCompression:{value:0},uCore:{value:0},uImpact:{value:0}};
    this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:crystalVertex,fragmentShader:crystalFragment,transparent:true,depthWrite:true,side:THREE.DoubleSide});
    this.edgeMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:edgeVertex,fragmentShader:edgeFragment,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
    this.crystals=[];
    const addCrystal=(geometry,scale=1,rotation=0) => {
      const holder=new THREE.Group();
      const mesh=new THREE.Mesh(geometry,this.material);
      mesh.renderOrder=4;
      holder.add(mesh);
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,16),this.edgeMaterial);
      edges.renderOrder=5;
      holder.add(edges);
      holder.scale.setScalar(scale);
      holder.rotation.x=rotation;
      this.group.add(holder);
      this.crystals.push(holder);
      return holder;
    };
    addCrystal(bladeGeometry());
    const cross=addCrystal(bladeGeometry(0.84,0.66,0.72),1,Math.PI/2);
    cross.position.x=-0.05;
    addCrystal(spearGeometry(-1.95,0.43,0.085,0.075));
    // Four swept crystal feathers make the silhouette readable from any orbit angle.
    for(let i=0;i<4;i++) {
      const fin=addCrystal(bladeGeometry(0.37,0.38,0.19),1,i*Math.PI/2);
      fin.position.x=-1.55;
      fin.rotation.z=Math.PI;
    }
    this.flanges=[];
    for(let i=0;i<3;i++){
      const angle=i*Math.PI*2/3+0.35;
      const flange=addCrystal(spearGeometry(-0.9,0.28,0.055,0.035),1,angle);
      flange.position.set(-0.24,Math.cos(angle)*0.25,Math.sin(angle)*0.25);
      this.flanges.push({holder:flange,angle});
    }
    this.coreMaterial=new THREE.ShaderMaterial({uniforms:{...this.uniforms,uCore:{value:1}},vertexShader:crystalVertex,fragmentShader:crystalFragment,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
    this.core=new THREE.Mesh(spearGeometry(-2.03,1.3,0.024,0.024),this.coreMaterial);
    this.core.renderOrder=6;
    this.group.add(this.core);
    this.ringUniforms={uTime:this.uniforms.uTime,uColor:this.uniforms.uColor,uAlpha:{value:0}};
    this.ring=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.8),new THREE.ShaderMaterial({
      uniforms:this.ringUniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
      vertexShader:'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:/* glsl */`varying vec2 vUv; uniform float uTime; uniform float uAlpha; uniform vec3 uColor;
      void main(){ vec2 p=vUv-0.5; float r=length(p); float a=atan(p.y,p.x); float ring=exp(-abs(r-0.34)*280.0); float ring2=exp(-abs(r-0.39)*190.0)*step(0.2,sin(a*6.0+uTime*1.8)); float ticks=step(0.965,sin(a*24.0))*smoothstep(0.31,0.33,r)*(1.0-smoothstep(0.37,0.39,r)); float cross=exp(-min(abs(p.x),abs(p.y))*280.0)*smoothstep(0.22,0.3,r)*(1.0-smoothstep(0.4,0.43,r)); float v=ring*0.65+ring2*0.3+ticks*0.5+cross*0.45; gl_FragColor=vec4(uColor*1.25,v*uAlpha); }`
    }));
    this.ring.rotation.y=Math.PI/2;
    this.ring.position.x=1.55;
    this.ring.renderOrder=3;
    this.group.add(this.ring);
    // Bake each crystal's axial coordinate in arrow space. The core, shell and
    // edge pass consequently share the same formation frontier, including fins.
    this.group.updateMatrixWorld(true);
    const point=new THREE.Vector3();
    this.group.traverse(object=>{
      if(!object.geometry||object===this.ring)return;
      const positions=object.geometry.attributes.position;
      const axial=new Float32Array(positions.count);
      for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld);
        axial[i]=point.x;
      }
      object.geometry.setAttribute('aAxial',new THREE.BufferAttribute(axial,1));
    });
  }
  setImpact(progress) {
    this.uniforms.uImpact.value=THREE.MathUtils.clamp(progress,0,1);
  }
  update(time,formation,charge,config) {
    this.uniforms.uTime.value=time;
    this.uniforms.uFormation.value=Math.max(0,Math.min(1,formation));
    this.uniforms.uCharge.value=charge;
    const compression=charge>0?THREE.MathUtils.smoothstep(time,0.67,0.725)*(1-THREE.MathUtils.smoothstep(time,0.74,0.75)):0;
    this.uniforms.uCompression.value=compression;
    this.uniforms.uColor.value.set(config.frostColor);
    const scale=config.arrowSize*(0.88+Math.min(formation,1)*0.12);
    this.group.scale.set(scale*(1+compression*0.025),scale*(1-compression*0.065),scale*(1-compression*0.065));
    for(const flange of this.flanges){
      const radius=0.25+Math.sin(time*2+flange.angle)*0.012-compression*0.045;
      flange.holder.position.y=Math.cos(flange.angle)*radius;
      flange.holder.position.z=Math.sin(flange.angle)*radius;
    }
    this.ring.scale.setScalar(1-compression*0.24);
    this.ringUniforms.uAlpha.value=charge*(0.65+compression*0.35);
    this.ring.visible=charge>0.015;
    this.core.visible=formation>0.14;
  }
  dispose() {
    const geometries=new Set();
    const materials=new Set();
    this.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    this.group.removeFromParent();
  }
}
