import * as THREE from 'three';

const HALF_ANGLE = 1.40;
const RADIUS_X = 1.90;
const RADIUS_Y = 1.8 / Math.sin(HALF_ANGLE);
const OFFSET_X = 1.15;
const TILT = THREE.MathUtils.degToRad(25);

// Rear-facing, asymmetric tears leave the original forward arc and tips intact.
// Lightning travels at V >= .18, outside this narrow silhouette-only region.
function rearTear(u) {
  // Three authored sweeps: a long lower talon, a secondary fork and one short
  // upper break. Unequal run-in/run-out lengths give a decisive raked cut.
  const rake = (start, peak, end, length) => length * Math.max(0, Math.min((u - start) / (peak - start), (end - u) / (end - peak)));
  return rake(.025, .075, .105, .64) + rake(.13, .205, .23, .34) + rake(.57, .65, .68, .20);
}

/** Closed, curved lenticular volume. U follows the arc, V crosses its thickness. */
export function createCrescentGeometry({ segments = 100, bands = 8, widthScale = 1, vMin = 0, vMax = 1, thicknessScale = 1 } = {}) {
  const columns = bands + 1, rows = segments + 1, perSide = columns * rows;
  const positions = new Float32Array(perSide * 2 * 3);
  const uvs = new Float32Array(perSide * 2 * 2);
  const indices = [];
  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1;
    for (let i = 0; i <= segments; i++) {
      const u = i / segments, angle = (u * 2 - 1) * HALF_ANGLE;
      const taper = Math.pow(Math.max(0, Math.sin(u * Math.PI)), .72);
      const width = (.65 * taper + .004) * widthScale;
      const outerX = RADIUS_X * Math.cos(angle) - OFFSET_X;
      const outerY = RADIUS_Y * Math.sin(angle);
      const tear = rearTear(u) * widthScale;
      for (let j = 0; j <= bands; j++) {
        const v = THREE.MathUtils.lerp(vMin, vMax, j / bands), index = side * perSide + i * columns + j;
        positions[index * 3] = outerX - width * (1 - v) - tear * Math.pow(Math.max(0, 1 - v / .18), 3);
        const rearMask = Math.pow(Math.max(0, 1 - v / .18), 3);
        const rakeY = Math.min(tear * .24, Math.max(0, outerY + 1.8) * .55) * rearMask;
        positions[index * 3 + 1] = outerY - Math.sin(angle) * width * (1 - v) * .12 - rakeY;
        positions[index * 3 + 2] = sign * (.084 * taper + .0015) * Math.sin(v * Math.PI) * thicknessScale;
        uvs[index * 2] = u; uvs[index * 2 + 1] = v;
      }
    }
  }
  for (let side = 0; side < 2; side++) {
    const base = side * perSide;
    for (let i = 0; i < segments; i++) for (let j = 0; j < bands; j++) {
      const a = base + i * columns + j, b = a + 1, c = a + columns, d = c + 1;
      if (side === 0) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  const closeEdge = (a, b) => indices.push(a, a + perSide, b, b, a + perSide, b + perSide);
  for (let i = 0; i < segments; i++) {
    closeEdge(i * columns, (i + 1) * columns);
    closeEdge((i + 1) * columns + bands, i * columns + bands);
  }
  for (let j = 0; j < bands; j++) {
    closeEdge(j + 1, j);
    closeEdge(segments * columns + j, segments * columns + j + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

const vertexShader = /* glsl */`
  uniform float uTime;
  uniform float uRole;
  varying vec2 vUv;
  varying vec3 vN,vView;
  void main(){
    vUv=uv;vec3 p=position;
    float endMask=sin(uv.x*3.14159265);
    p.z+=sin(uv.x*25.0-uTime*12.0+uRole)*.018*endMask;
    // Keep the cutting silhouette decisive; movement lives inside the blade.
    p.x+=sin(uv.x*53.0-uTime*17.0)*.002*endMask*pow(uv.y,3.0);
    vec4 mv=modelViewMatrix*vec4(p,1.0);
    vN=normalize(normalMatrix*normal);vView=-mv.xyz;
    gl_Position=projectionMatrix*mv;
  }
`;
const fragmentShader = /* glsl */`
  uniform vec3 uColor,uPurple;
  uniform float uTime,uFormation,uLife,uImpact,uRole,uHasTexture;
  uniform sampler2D uFlowMap;
  varying vec2 vUv;varying vec3 vN,vView;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){return noise(p)*.57+noise(p*2.07+4.3)*.28+noise(p*4.11-3.7)*.15;}
  float rake(float u,float start,float peak,float end){return max(0.0,min((u-start)/(peak-start),(end-u)/(end-peak)));}
  float window(float u,float start,float end,float edge){return smoothstep(start,start+edge,u)*(1.0-smoothstep(end-edge,end,u));}
  float coreBoundary(float u){
    float taper=.43+.37*smoothstep(.59,1.0,u)+.43*(1.0-smoothstep(.015,.16,u));
    return min(.97,taper+.23*rake(u,.19,.225,.34)+.19*rake(u,.59,.625,.715));
  }
  float lightSlash(vec2 uv,float offset){
    float along=fract(uv.x-uTime*.43+offset);
    float run=window(along,.06,.30,.025);
    float line=.46+(along-.06)*1.45;
    float width=.022*(1.0-smoothstep(.13,.30,along));
    float aa=max(fwidth(uv.y)*1.15,.0018);
    return (1.0-smoothstep(width,width+aa,abs(uv.y-line)))*run;
  }
  void main(){
    if(uLife<=.001||uFormation<=.001||uImpact>=.9999)discard;
    float lead=uRole<.5?0.0:uRole<1.5?.10:uRole<2.5?-.065:-.10;
    float frontier=clamp(uFormation+lead*(1.0-uFormation),0.0,1.0);
    float n=fbm(vec2(vUv.x*7.0-uTime*1.25,vUv.y*4.0));
    if(vUv.x>frontier)discard;
    float tex=texture2D(uFlowMap,vec2(fract(vUv.x*1.55-uTime*.48),vUv.y*.65+.15)).r;
    n=mix(n,n*.55+tex*.45,uHasTexture);
    float impactField=1.0-vUv.y*.74-n*.26;
    if(uImpact>0.0&&impactField<uImpact)discard;
    float fracture=exp(-abs(impactField-uImpact)*70.0)*step(.001,uImpact);
    float arcEnds=smoothstep(0.0,.025,vUv.x)*(1.0-smoothstep(.975,1.0,vUv.x));
    float fresnel=pow(max(0.0,1.0-abs(dot(normalize(vN),normalize(vView)))),3.5);
    float aa=max(fwidth(vUv.y)*1.1,.002);
    float core=coreBoundary(vUv.x);
    float slash=lightSlash(vUv,0.0)+lightSlash(vUv,.53)*.5;
    // Real negative cuts stay at the trailing edge so they cannot disconnect
    // the charged outer blade or the lightning travelling across its face.
    float notch=.145*rake(vUv.x,.10,.12,.165)+.165*rake(vUv.x,.22,.245,.30)+.11*rake(vUv.x,.67,.69,.735);
    if(vUv.y<notch)discard;
    vec3 color;float alpha;
    if(uRole<.5){
      // Two broad cel-painted regions, with designed diagonal intrusions.
      // Low-frequency flow only modulates intensity, never their silhouette.
      vec3 cobalt=mix(vec3(.012,.075,.46),uColor*.38,.22);
      float blueCut=.15+core*.22+.10*rake(vUv.x,.29,.34,.46);
      color=mix(cobalt,uColor*.85,smoothstep(blueCut-aa,blueCut+aa,vUv.y));
      color*=.98+n*.035;
      color+=uColor*(slash*.17+fresnel*.075);
      alpha=.97*arcEnds;
    }else if(uRole<1.5){
      float band=smoothstep(core-aa,core+aa,vUv.y);
      float lip=smoothstep(core+.018,core+.055,vUv.y);
      color=mix(uColor*.99,vec3(.78,1.06,1.16),lip);
      float hotFront=smoothstep(.79,.99,vUv.y);
      color*=1.0+hotFront*.32+slash*.30;
      alpha=band*.98*arcEnds;
    }else if(uRole<2.5){
      // The blue echo is two separated brush shapes, not another full ring.
      float pieces=max(window(vUv.x,.025,.32,.025),window(vUv.x,.52,.78,.025));
      float face=1.0-smoothstep(.56,.66,vUv.y);
      if(pieces<.02||face<.02)discard;
      color=mix(vec3(.012,.06,.43),uColor*.56,smoothstep(.25,.6,vUv.y));
      alpha=pieces*face*.66*arcEnds;
    }else{
      float pieces=max(window(vUv.x,.025,.235,.02),window(vUv.x,.575,.69,.018));
      float face=1.0-smoothstep(.32,.47,vUv.y);
      if(pieces<.02||face<.02)discard;
      color=mix(uPurple*.16,uPurple*.36,smoothstep(.04,.35,vUv.y));
      alpha=pieces*face*.73*arcEnds;
    }
    float growthEdge=exp(-abs(vUv.x-frontier)*120.0)*(1.0-step(.999,frontier));
    color+=mix(uColor,vec3(.7,1.0,1.1),.5)*(growthEdge*.55+fracture*.9);
    gl_FragColor=vec4(color,max(0.0,alpha)*uLife);
  }
`;

export class CrescentBlade {
  constructor(config) {
    this.config=config;this.group=new THREE.Group();this.group.name='Cang Lei crescent energy blade';
    this.content=new THREE.Group();this.content.rotation.x=TILT;this.group.add(this.content);
    this.disposed=false;this.textureRequest=0;
    this.flowTexture=new THREE.DataTexture(new Uint8Array([127,127,127,255]),1,1);this.flowTexture.needsUpdate=true;
    this.uniforms={uTime:{value:0},uFormation:{value:0},uLife:{value:1},uImpact:{value:0},uColor:{value:new THREE.Color(config.energyColor??config.frostColor??'#39dfff')},uPurple:{value:new THREE.Color(config.lightningColor??'#9170ff')},uFlowMap:{value:this.flowTexture},uHasTexture:{value:0}};
    this.meshes=[];
    const layers=[
      {role:3,widthScale:1.16,x:-.21,z:-.13,scaleY:1.025,order:1},
      {role:2,widthScale:1.20,x:-.085,z:-.055,scaleY:1.015,order:2},
      {role:0,widthScale:1,x:0,z:0,scaleY:1,order:4},
      {role:1,widthScale:1,vMin:.40,vMax:1,x:.003,z:.004,scaleY:1,order:5},
    ];
    for(const layer of layers){
      const geometry=createCrescentGeometry(layer);
      const material=new THREE.ShaderMaterial({uniforms:{...this.uniforms,uRole:{value:layer.role}},vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true,side:THREE.FrontSide,blending:THREE.NormalBlending});
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(layer.x,0,layer.z);mesh.scale.y=layer.scaleY;mesh.renderOrder=layer.order;mesh.frustumCulled=false;
      this.content.add(mesh);this.meshes.push(mesh);
      if(layer.role===0)this.geometry=geometry;
    }
    this.upperTip=new THREE.Vector3(RADIUS_X*Math.cos(HALF_ANGLE)-OFFSET_X,1.8,0);
    this.lowerTip=new THREE.Vector3(this.upperTip.x,-1.8,0);
    this.textureReady=Promise.resolve(false);
    if(config.flowTextureUrl)this.textureReady=this.loadFlowTexture(config.flowTextureUrl);
  }
  async loadFlowTexture(url=`${import.meta.env?.BASE_URL || '/'}textures/storm-energy-flow.png`){
    const request=++this.textureRequest;
    try{
      const texture=await new THREE.TextureLoader().loadAsync(url);
      if(this.disposed||request!==this.textureRequest){texture.dispose();return false;}
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;
      this.flowTexture.dispose();this.flowTexture=texture;this.uniforms.uFlowMap.value=texture;this.uniforms.uHasTexture.value=1;return true;
    }catch{return false;}
  }
  update(time,{formation=1,life=1,impact=0,phase='flight',config=this.config}={}){
    this.config=config;this.uniforms.uTime.value=time;this.uniforms.uFormation.value=THREE.MathUtils.clamp(formation,0,1);
    this.uniforms.uLife.value=THREE.MathUtils.clamp(life,0,1);this.uniforms.uImpact.value=THREE.MathUtils.clamp(impact,0,1);
    this.uniforms.uColor.value.set(config.energyColor??config.frostColor??'#39dfff');this.uniforms.uPurple.value.set(config.lightningColor??'#9170ff');
    this.group.scale.setScalar(config.bladeSize??config.arrowSize??1);
    const launch=time>=.65&&time<.88?Math.exp(-(time-.65)*21)*THREE.MathUtils.smoothstep(time,.65,.666):0;
    this.content.scale.set(1+launch*.22,1-launch*.045,1);
    this.content.rotation.x=TILT;
  }
  /** Writes tip positions; world=false returns coordinates in the blade group. */
  getTipPositions(outUpper,outLower,world=true){
    this.group.updateMatrixWorld(true);
    const matrix=world?this.content.matrixWorld:this.content.matrix;
    outUpper.copy(this.upperTip).applyMatrix4(matrix);outLower.copy(this.lowerTip).applyMatrix4(matrix);
    return this;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.textureRequest++;
    for(const mesh of this.meshes){mesh.geometry.dispose();mesh.material.dispose();}
    this.flowTexture.dispose();this.group.removeFromParent();
  }
}
