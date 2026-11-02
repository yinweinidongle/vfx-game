import * as THREE from 'three';
import { CrescentBlade, createCrescentGeometry } from './CrescentBlade.js';

const TILT=THREE.MathUtils.degToRad(25),STRIDE=6;
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const DEFAULT_SAMPLE=Object.freeze({world:true,face:1});

/** Extract the largest alpha-connected subject without modifying its artwork. */
export function extractPaintedCrescentProfile(pixels,width,height,options={}){
  if(pixels.length!==width*height*4)throw new Error('Painted crescent requires RGBA pixels.');
  const threshold=clamp(options.alphaThreshold??24,1,254),segments=clamp(Math.round(options.segments??144),32,256);
  const mask=new Uint8Array(width*height),queue=new Int32Array(mask.length);
  for(let i=0;i<mask.length;i++)if(pixels[i*4+3]>=threshold)mask[i]=1;
  let largest=null;
  for(let seed=0;seed<mask.length;seed++){
    if(mask[seed]!==1)continue;
    let head=0,tail=1;queue[0]=seed;mask[seed]=2;
    while(head<tail){
      const at=queue[head++],x=at%width;
      if(x>0&&mask[at-1]===1){mask[at-1]=2;queue[tail++]=at-1;}
      if(x<width-1&&mask[at+1]===1){mask[at+1]=2;queue[tail++]=at+1;}
      if(at>=width&&mask[at-width]===1){mask[at-width]=2;queue[tail++]=at-width;}
      if(at+width<mask.length&&mask[at+width]===1){mask[at+width]=2;queue[tail++]=at+width;}
    }
    if(!largest||tail>largest.length)largest=queue.slice(0,tail);
  }
  if(!largest||largest.length<16)throw new Error('Painted crescent has no usable alpha contour.');
  if(largest.length>mask.length*.85)throw new Error('Painted crescent needs a transparent background.');
  mask.fill(0);for(const at of largest)mask[at]=1;
  const rowMin=new Int32Array(height).fill(width),rowMax=new Int32Array(height).fill(-1);
  let minX=width,minY=height,maxX=-1,maxY=-1;
  for(const at of largest){
    const x=at%width,y=Math.floor(at/width);
    rowMin[y]=Math.min(rowMin[y],x);rowMax[y]=Math.max(rowMax[y],x);
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  const worldHeight=options.height??3.6,front=options.frontMaxX??.75,depth=options.depth??.08;
  const scale=worldHeight/(maxY-minY+1),rows=new Float32Array((segments+1)*STRIDE);
  for(let i=0;i<=segments;i++){
    const u=i/segments,sourceY=lerp(maxY+1,minY,u),sampleY=clamp(sourceY-.5,minY,maxY);
    const lo=Math.floor(sampleY),hi=Math.ceil(sampleY),blend=sampleY-lo;
    const back=lerp(rowMin[lo],rowMin[hi],blend),forward=lerp(rowMax[lo]+1,rowMax[hi]+1,blend),k=i*STRIDE;
    rows[k]=(back-(maxX+1))*scale+front;rows[k+1]=(forward-(maxX+1))*scale+front;
    rows[k+2]=(u-.5)*worldHeight;rows[k+3]=back/width;rows[k+4]=forward/width;rows[k+5]=1-sourceY/height;
  }
  // Painted horns can turn downward/upward before the highest/lowest fleck.
  // Select their actual leftmost attached point in each half of the silhouette.
  const midY=(minY+maxY)*.5;let upperX=width,upperY=minY,lowerX=width,lowerY=maxY;
  for(let y=minY;y<=maxY;y++){
    if(y<=midY&&rowMin[y]<upperX){upperX=rowMin[y];upperY=y;}
    if(y>midY&&rowMin[y]<lowerX){lowerX=rowMin[y];lowerY=y;}
  }
  const toPoint=(x,y)=>new THREE.Vector3((x+.5-(maxX+1))*scale+front,((minY+maxY+1)*.5-y-.5)*scale,0);
  return{segments,rows,width,height,depth,worldHeight,frontMaxX:front,coverage:mask,pixelBounds:{minX,minY,maxX,maxY},componentPixels:largest.length,
    minX:(minX-(maxX+1))*scale+front,maxX:front,upperTip:toPoint(upperX,upperY),lowerTip:toPoint(lowerX,lowerY),alphaThreshold:threshold};
}

// A scanline can contain deliberate painted holes. Surface attachments select
// the nearest surviving pixel on that row rather than floating over empty UVs.
function opaqueLane(profile,u,v){
  const row=clamp(u,0,1)*profile.segments,lo=Math.floor(row),hi=Math.min(profile.segments,lo+1),f=row-lo,a=lo*STRIDE,b=hi*STRIDE;
  const back=lerp(profile.rows[a+3],profile.rows[b+3],f)*profile.width,front=lerp(profile.rows[a+4],profile.rows[b+4],f)*profile.width;
  const y=clamp(Math.round((1-lerp(profile.rows[a+5],profile.rows[b+5],f))*profile.height-.5),0,profile.height-1);
  const x=clamp(Math.round(lerp(back,front,clamp(v,0,1))-.5),0,profile.width-1),offset=y*profile.width;
  if(profile.coverage[offset+x])return v;
  for(let distance=1;distance<profile.width;distance++){
    if(x+distance<profile.width&&profile.coverage[offset+x+distance])return clamp((x+distance+.5-back)/(front-back),0,1);
    if(x-distance>=0&&profile.coverage[offset+x-distance])return clamp((x-distance+.5-back)/(front-back),0,1);
  }
  return v;
}

/** Local profile coordinates: U lower→upper; V concave rear→convex front. */
export function samplePaintedSurface(profile,u,v,out,face=1,lift=0){
  const row=clamp(u,0,1)*profile.segments,lo=Math.floor(row),hi=Math.min(profile.segments,lo+1),f=row-lo,a=lo*STRIDE,b=hi*STRIDE;
  const back=lerp(profile.rows[a],profile.rows[b],f),front=lerp(profile.rows[a+1],profile.rows[b+1],f);
  const y=lerp(profile.rows[a+2],profile.rows[b+2],f),taper=Math.pow(Math.max(0,Math.sin(clamp(u,0,1)*Math.PI)),.28);
  const z=face*(profile.depth*.5*Math.sin(clamp(v,0,1)*Math.PI)*taper+lift*taper);
  return out.set(lerp(back,front,clamp(v,0,1)),y,z);
}

/** Closed shallow lens following the painted silhouette, with original UVs. */
export function createPaintedCrescentGeometry(profile,bands=16){
  bands=clamp(Math.round(bands),4,32);
  const columns=bands+1,rows=profile.segments+1,perSide=columns*rows;
  const positions=new Float32Array(perSide*2*3),uvs=new Float32Array(perSide*2*2),profiles=new Float32Array(perSide*2*2),indices=[];
  const point=new THREE.Vector3();
  for(let side=0;side<2;side++)for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const u=row/profile.segments,v=col/bands,i=side*perSide+row*columns+col,k=row*STRIDE;
    samplePaintedSurface(profile,u,v,point,side===0?1:-1);point.toArray(positions,i*3);
    uvs[i*2]=lerp(profile.rows[k+3],profile.rows[k+4],v);uvs[i*2+1]=profile.rows[k+5];
    profiles[i*2]=u;profiles[i*2+1]=v;
  }
  for(let side=0;side<2;side++)for(let row=0;row<profile.segments;row++)for(let col=0;col<bands;col++){
    const a=side*perSide+row*columns+col,b=a+1,c=a+columns,d=c+1;
    if(side===0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
  }
  const edge=(a,b)=>indices.push(a,a+perSide,b,b,a+perSide,b+perSide);
  for(let row=0;row<profile.segments;row++){edge(row*columns,(row+1)*columns);edge((row+1)*columns+bands,row*columns+bands);}
  for(let col=0;col<bands;col++){edge(col+1,col);edge(profile.segments*columns+col,profile.segments*columns+col+1);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setAttribute('aProfile',new THREE.BufferAttribute(profiles,2));geometry.setIndex(indices);
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

const vertexShader=`
  attribute vec2 aProfile;varying vec2 vUv,vProfile;varying vec3 vNormal,vView;
  void main(){vUv=uv;vProfile=aProfile;vec4 mv=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}
`;
const fragmentShader=`
  uniform sampler2D uPaintMap,uFlowMap;uniform vec3 uColor,uPurple;uniform float uTime,uFormation,uLife,uImpact,uHasTexture,uRank,uSpirit,uGameStyle,uFervor;
  varying vec2 vUv,vProfile;varying vec3 vNormal,vView;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){return noise(p)*.58+noise(p*2.03+4.1)*.28+noise(p*4.09-3.7)*.14;}
  void main(){
    if(uLife<=.001||uFormation<=.001||uImpact>=.9999)discard;
    vec4 art=texture2D(uPaintMap,vUv);if(art.a<.02||vProfile.x>uFormation)discard;
    float flow=fbm(vec2(vUv.x*7.-uTime*.85,vUv.y*9.+uTime*.47));
    float paintedFlow=texture2D(uFlowMap,vec2(fract(vUv.x*1.1-uTime*.12),vUv.y*.75+uTime*.045)).r;
    flow=mix(flow,flow*.82+paintedFlow*.18,uHasTexture);
    float erosion=1.-vProfile.y*.77-flow*.23;if(uImpact>0.&&erosion<uImpact)discard;
    float pale=min(art.r,min(art.g,art.b));float luminance=dot(art.rgb,vec3(.2126,.7152,.0722));
    float core=smoothstep(.44,.83,pale)*smoothstep(.54,.88,luminance);
    float chroma=max(art.r,max(art.g,art.b))-pale;
    vec3 color=art.rgb;
    // Preserve the painted blue/violet structure; tint only its cyan light.
    float cyan=step(art.r,art.g)*smoothstep(.12,.6,chroma)*.18;
    color=mix(color,mix(color,uColor*luminance*1.45,.45),cyan);
    float moving=fract(vUv.y*.85-uTime*.38+vUv.x*.21);
    float sweep=smoothstep(.13,.18,moving)*(1.-smoothstep(.25,.29,moving));
    color*=.98+flow*.035+core*(.32+sweep*.20);
    float rune=pow(max(0.,sin(vProfile.x*54.-uTime*19.+flow*3.)),12.);
    float vein=exp(-pow((vProfile.y-(.4+sin(vProfile.x*18.+uTime*2.)*.045))*34.,2.));
    color=mix(color,mix(color,uPurple*luminance*1.8,.28),min(1.,uRank*.26)*(1.-core));
    color+=uColor*(sweep*core*.12+vein*rune*.55)*min(1.,uRank*.4);
    float channel=vProfile.y-(.25+sin(vProfile.x*39.-floor(uTime*14.)*.63)*.032+flow*.05);
    float lightning=exp(-abs(channel)*220.);float branch=exp(-abs(channel-.1*sin(vProfile.x*67.))*280.)*.45;
    float chant=pow(max(0.,sin(vProfile.x*(42.+uSpirit*46.)-uTime*(12.+uSpirit*12.))),16.);
    color+=mix(uPurple,vec3(.65,.9,1.),.5)*(lightning+branch)*(0.3+chant)*uSpirit*.9;
    color+=uColor*sweep*(1.-core)*uSpirit*.18;
    if(uGameStyle>.5){
      // Keep the authored alpha/brushwork, but separate the narrow white edge
      // from saturated energy. The previous broad white wash hid every tint.
      float level=uFervor*50.;
      float leading=pow(smoothstep(.53,.98,vProfile.y),2.2)*smoothstep(.28,.8,luminance);
      float ink=smoothstep(.05,.82,luminance);
      float inner=1.-smoothstep(.05,.48,vProfile.y);
      vec3 pigment=mix(uPurple*.24,uColor*(.4+ink*.56),ink);
      pigment=mix(pigment,uPurple*(.4+ink*.5),inner*.6);
      float sweep2=pow(.5+.5*sin(vProfile.x*12.-uTime*(10.+uFervor*11.)+flow*1.6),10.);
      float veinPath=vProfile.y-(.28+sin(vProfile.x*27.-floor(uTime*16.)*.37)*.025+flow*.12);
      float crack=exp(-abs(veinPath)*190.)+exp(-abs(veinPath-.10*sin(vProfile.x*57.))*240.)*.55;
      float stripe=pow(max(0.,sin(vProfile.y*37.+vProfile.x*9.-uTime*(8.+uFervor*15.)+flow*2.)),20.);
      float cell=fract(vProfile.x*52.);float rune=step(floor(vProfile.x*52.),level)*exp(-pow((cell-.5)*9.,2.))*exp(-pow((vProfile.y-.57)*45.,2.));
      vec3 pearl=mix(vec3(.66,1.,1.22),vec3(1.2,.88,.44),smoothstep(.4,1.,uFervor)*.9);
      color=pigment*(.8+flow*.2);
      color=mix(color,pearl*(1.35+uFervor*.5+sweep2*.35),clamp(leading*.9+core*.24,0.,.95));
      color+=uPurple*(crack*(.18+uFervor*.88+uSpirit*.3)+stripe*.32*uFervor)*(1.-leading*.7);
      color+=pearl*rune*(.3+uFervor*.7)+uColor*sweep2*.27*uFervor;
    }
    float fresnel=pow(max(0.,1.-abs(dot(normalize(vNormal),normalize(vView)))),3.);
    color+=uColor*fresnel*.045*art.a;
    float frontier=1.-smoothstep(.0,.025,abs(vProfile.x-uFormation));
    color+=mix(uColor,vec3(.75,1.,1.15),.5)*frontier*(1.-step(.999,uFormation))*.32;
    float fracture=exp(-abs(erosion-uImpact)*65.)*step(.001,uImpact);color+=mix(uColor,vec3(.75,1.,1.15),.6)*fracture*.5;
    gl_FragColor=vec4(color,art.a*uLife);
  }
`;

/** Image-authored VFX volume. The old procedural blade exists only while loading. */
export class PaintedCrescentBlade extends CrescentBlade{
  constructor(config){
    super(config);this.available=false;this.profile=null;this.paintTexture=null;this.paintRequest=0;this.time=0;
    this.profilePoint=new THREE.Vector3();this.profileRotation=new THREE.Matrix4().makeRotationX(TILT);
    this.group.name='Painted anime crescent volume';this.textureReady=Promise.resolve(false);
    if(config.crescentTextureUrl)this.textureReady=this.loadTexture(config.crescentTextureUrl);
  }
  /** World transform of the exact frame used by both painted faces. */
  get surfaceFrame(){return this.content.matrixWorld;}
  loadTexture(url,options={}){
    const request=++this.paintRequest;
    this.textureReady=(async()=>{
      const texture=await new THREE.TextureLoader().loadAsync(url);
      if(this.disposed||request!==this.paintRequest){texture.dispose();return false;}
      try{
        const canvas=document.createElement('canvas');canvas.width=texture.image.width;canvas.height=texture.image.height;
        const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Cannot read painted crescent alpha.');
        context.drawImage(texture.image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height);
        const profile=extractPaintedCrescentProfile(pixels.data,canvas.width,canvas.height,options);
        texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.anisotropy=4;texture.needsUpdate=true;
        this.installTexture(texture,profile,options);return this.metadata;
      }catch(error){texture.dispose();throw error;}
    })();
    return this.textureReady;
  }
  installTexture(texture,profile,options={}){
    const geometry=createPaintedCrescentGeometry(profile,options.bands??16);
    const uniforms={...this.uniforms,uPaintMap:{value:texture},uRank:{value:0},uSpirit:{value:0},uGameStyle:{value:0},uFervor:{value:0}};
    const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true,side:THREE.FrontSide,blending:THREE.NormalBlending});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Alpha-contoured painted energy';mesh.frustumCulled=false;mesh.renderOrder=4;
    for(const previous of this.meshes){previous.removeFromParent();previous.geometry.dispose();previous.material.dispose();}
    this.paintTexture?.dispose();this.paintTexture=texture;this.profile=profile;this.geometry=geometry;this.uniforms=uniforms;this.meshes=[mesh];this.content.add(mesh);
    this.upperTip.copy(profile.upperTip);this.lowerTip.copy(profile.lowerTip);this.available=true;
    this.metadata={width:profile.maxX-profile.minX,height:profile.worldHeight,depth:profile.depth,triangles:geometry.index.count/3,alphaThreshold:profile.alphaThreshold,pixelBounds:profile.pixelBounds,componentPixels:profile.componentPixels,launchStretch:true};
    this.content.updateWorldMatrix(true,true);
  }
  update(time,state={}){this.time=time;super.update(time,state);}
  sampleLocalSurface(u,v,out,face=1,lift=0){
    if(!this.profile)return false;samplePaintedSurface(this.profile,u,opaqueLane(this.profile,u,v),out,face,lift);return true;
  }
  sampleSurface(u,v,out,options=DEFAULT_SAMPLE){
    if(!this.profile)return false;
    samplePaintedSurface(this.profile,u,opaqueLane(this.profile,u,v),out,options.face??1,options.lift??.004);
    this.content.updateWorldMatrix(true,false);
    out.applyMatrix4(options.world===false?this.content.matrix:this.content.matrixWorld);return true;
  }
  /** Static group-local rear seam, including 25° tilt but excluding launch stretch. */
  getTrailProfile(out,count=25){
    if(out.length<count*3)throw new Error('Trail profile output is too small.');
    if(this.profile){
      for(let i=0;i<count;i++){samplePaintedSurface(this.profile,i/(count-1),.025,this.profilePoint,0);this.profilePoint.applyMatrix4(this.profileRotation).toArray(out,i*3);}
      return true;
    }
    const fallback=createCrescentGeometry({segments:count-1,bands:1});
    for(let i=0;i<count;i++){this.profilePoint.fromBufferAttribute(fallback.attributes.position,i*2).applyMatrix4(this.profileRotation).toArray(out,i*3);}
    fallback.dispose();return false;
  }
  dispose(){if(this.disposed)return;this.paintRequest++;this.paintTexture?.dispose();this.paintTexture=null;super.dispose();}
}
