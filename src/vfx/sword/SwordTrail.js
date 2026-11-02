import * as THREE from 'three';
import { createCrescentGeometry } from './CrescentBlade.js';

const CAPACITY = 384, SAMPLES = 256, CROSS = 25, DRAIN_TIME = .34;
const TILT = THREE.MathUtils.degToRad(25);
const PER_FACE = SAMPLES * CROSS;
const INDICES_PER_SEGMENT = (CROSS - 1) * 12 + 12;

const vertexShader = /* glsl */`
  attribute float aLife;
  varying vec2 vUv; varying float vLife;
  void main(){
    vUv=uv;vLife=aLife;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }
`;
const fragmentShader = /* glsl */`
  uniform float uTime,uDrain,uGameStyle,uFervor;
  uniform vec3 uColor,uPurple;
  varying vec2 vUv;varying float vLife;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){return noise(p)*.57+noise(p*2.1+2.7)*.28+noise(p*4.3-3.1)*.15;}
  void main(){
    float along=clamp(vUv.x,0.0,1.0),across=clamp(vUv.y,0.0,1.0);
    float n=fbm(vec2(along*7.0-uTime*2.2+uDrain*9.0,across*6.0+along*1.2));
    float flow=pow(max(0.0,.5+.5*sin(across*24.0-along*17.0+uTime*12.0+n*4.0)),12.0);
    float border=min(across,1.0-across);
    float cutWidth=.018+along*(.035+(n-.5)*.04);
    float edge=smoothstep(0.0,max(.006,cutWidth),border);
    float edgeNoise=noise(vec2(along*13.0-uTime*2.6,across*29.0+along*6.0));
    float torn=smoothstep(.67,.88,edgeNoise)*(1.0-smoothstep(.025,.18,border))
      *smoothstep(.06,.25,along);
    float tail=pow(max(0.0,1.0-along),1.25);
    vec3 cobalt=mix(vec3(.012,.055,.35),uColor*.40,.30);
    vec3 color=mix(cobalt,uColor*.65,smoothstep(.28,.75,n)*.70);
    float violet=smoothstep(.12,.92,along)*.40+smoothstep(.58,1.0,across)*.20;
    color=mix(color,uPurple*.48,clamp(violet,0.0,.65));
    color+=uColor*flow*.15;
    float seam=.52+.48*smoothstep(0.0,.12,along);
    float alpha=(.24+n*.10)*edge*tail*vLife*seam*(1.0-torn);
    if(uGameStyle>.5){
      // Fine energy channels live inside this one welded volume. No detached ribbons.
      float stream=pow(max(0.,.5+.5*sin(across*(25.+uFervor*12.)-along*8.-uTime*(8.+uFervor*9.)+n*2.4)),24.);
      float spine=exp(-pow((across-(.5+sin(along*7.-uTime*2.)*.055))*(32.-uFervor*5.),2.));
      float fire=smoothstep(.32,.68,noise(vec2(along*13.-uTime*3.,across*21.)));
      color=mix(uColor*.28,uPurple*.48,across*.55+along*.35);
      color+=uColor*stream*(.45+uFervor*1.8)*fire+mix(uColor,uPurple,.5)*spine*(.25+uFervor*.7);
      alpha=(.09+n*.10+stream*(.10+uFervor*.22)*fire+spine*.13)*edge*pow(1.-along,1.65)*vLife*seam*(1.-torn);
    }
    if(alpha<.003)discard;
    gl_FragColor=vec4(color,alpha);
  }
`;

/** One connected, shallow volume lofted from the crescent rear into its history. */
export class SwordTrail {
  constructor(scene, config) {
    this.config=config;
    this.group=new THREE.Group();this.group.name='Crescent · unified history wake';scene.add(this.group);
    this.history=new Float32Array(CAPACITY*4);this.orientationHistory=new Float32Array(CAPACITY*4);
    this.head=-1;this.count=0;this.age=0;this.speed=18;this.hasLast=false;
    this.crossCount=CROSS;this.sampleCapacity=SAMPLES;this.sampleCount=0;this.indicesPerSegment=INDICES_PER_SEGMENT;
    this.rows=new Uint16Array(SAMPLES);this.distances=new Float32Array(SAMPLES);this.rowLives=new Float32Array(SAMPLES);
    this.headProfile=new Float32Array(CROSS*3);
    this.profileAxis=new THREE.Vector3(0,Math.cos(TILT),Math.sin(TILT));
    this.profileNormal=new THREE.Vector3(0,-Math.sin(TILT),Math.cos(TILT));
    this.launchStretch=true;this.tailOffset=0;
    // Derive the weld from the actual blade constructor, including its authored
    // rear tears. Subsequent blade silhouette changes need no duplicate formula.
    const profile=createCrescentGeometry({segments:CROSS-1,bands:1,vMin:.03});
    const profilePositions=profile.attributes.position;
    for(let i=0;i<CROSS;i++){
      this.headProfile[i*3]=profilePositions.getX(i*2);
      const y=profilePositions.getY(i*2),z=profilePositions.getZ(i*2);
      this.headProfile[i*3+1]=y*Math.cos(TILT)-z*Math.sin(TILT);
      this.headProfile[i*3+2]=y*Math.sin(TILT)+z*Math.cos(TILT);
    }
    profile.dispose();this.setProfile(this.headProfile,{launchStretch:true});
    this.last=new THREE.Vector3();this.current=new THREE.Vector3();this.previous=new THREE.Vector3();this.p=new THREE.Vector3();this.offset=new THREE.Vector3();
    this.poseForward=new THREE.Vector3(1,0,0);this.forward=new THREE.Vector3(1,0,0);this.up=new THREE.Vector3();this.depthAxis=new THREE.Vector3();
    this.xAxis=new THREE.Vector3(1,0,0);this.orientation=new THREE.Quaternion();
    this.lastOrientation=new THREE.Quaternion();this.sampleOrientation=new THREE.Quaternion();
    this.bladeAxis=new THREE.Vector3();this.bladeNormal=new THREE.Vector3();this.impactTarget=new THREE.Vector3();this.impactAnchor=new THREE.Vector3();
    this.impactActive=false;this.impactClock=0;this.impactTime=0;this.impactLifespan=.4;
    this.color=new THREE.Color(config.energyColor??config.frostColor??'#39dfff');this.purple=new THREE.Color(config.lightningColor??'#9170ff');
    this.positions=new Float32Array(PER_FACE*2*3);this.uvs=new Float32Array(PER_FACE*2*2);this.life=new Float32Array(PER_FACE*2);
    const indices=new Uint16Array((SAMPLES-1)*INDICES_PER_SEGMENT);
    let cursor=0;
    for(let row=0;row<SAMPLES-1;row++){
      for(let face=0;face<2;face++)for(let column=0;column<CROSS-1;column++){
        const a=face*PER_FACE+row*CROSS+column,b=a+CROSS;
        if(face===0)indices.set([a,a+1,b,a+1,b+1,b],cursor);
        else indices.set([a,b,a+1,a+1,b,b+1],cursor);
        cursor+=6;
      }
      for(const column of [0,CROSS-1]){
        const a=row*CROSS+column,b=a+CROSS,c=a+PER_FACE,d=b+PER_FACE;
        indices.set(column===0?[a,b,c,b,d,c]:[a,c,b,b,c,d],cursor);cursor+=6;
      }
    }
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv',new THREE.BufferAttribute(this.uvs,2).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aLife',new THREE.BufferAttribute(this.life,1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(new THREE.BufferAttribute(indices,1));this.geometry.setDrawRange(0,0);
    this.material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uDrain:{value:0},uGameStyle:{value:0},uFervor:{value:0},uColor:{value:this.color},uPurple:{value:this.purple}},vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true,side:THREE.FrontSide,blending:THREE.NormalBlending});
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=3;this.group.add(this.mesh);
    // Compatibility for callers inspecting pooled trail resources: one layer,
    // one draw, one geometry. There are no separate core or endpoint ribbons.
    this.layers=[{role:0,geometry:this.geometry,material:this.material,mesh:this.mesh,positions:this.positions,uvs:this.uvs,life:this.life}];
  }
  /** Apply lower→upper rear-edge points in blade-group local space, with the
   * intrinsic tilt baked in, but without group scale/orientation/world position.
   * The source is copied/resampled; all history and GPU allocations are retained.
   */
  setProfile(profile,{launchStretch=true}={}){
    if(!profile||profile.length<6||profile.length%3!==0)throw new TypeError('Trail profile requires at least two XYZ points.');
    for(let i=0;i<profile.length;i++)if(!Number.isFinite(profile[i]))throw new TypeError('Trail profile coordinates must be finite.');
    const last=profile.length-3,dy=profile[last+1]-profile[1],dz=profile[last+2]-profile[2];
    if(dy*dy+dz*dz<1e-8)throw new RangeError('Trail profile needs a nonzero cross-blade span.');
    const count=profile.length/3;this.tailOffset=Infinity;
    for(let column=0;column<CROSS;column++){
      const source=column/(CROSS-1)*(count-1),a=Math.floor(source),b=Math.min(count-1,a+1),fraction=source-a;
      for(let axis=0;axis<3;axis++)this.headProfile[column*3+axis]=THREE.MathUtils.lerp(profile[a*3+axis],profile[b*3+axis],fraction);
      this.tailOffset=Math.min(this.tailOffset,this.headProfile[column*3]);
    }
    this.profileAxis.set(0,dy,dz).normalize();this.profileNormal.set(0,-this.profileAxis.z,this.profileAxis.y);
    this.launchStretch=launchStretch;return this;
  }
  _setBasis(orientation){
    // Profiles already contain the intrinsic blade tilt. Apply the recorded
    // group quaternion once, retaining the actor's real swing-plane roll.
    this.poseForward.copy(this.xAxis).applyQuaternion(orientation);
    this.up.set(0,1,0).applyQuaternion(orientation);this.depthAxis.set(0,0,1).applyQuaternion(orientation);
    this.bladeAxis.copy(this.up).multiplyScalar(this.profileAxis.y).addScaledVector(this.depthAxis,this.profileAxis.z);
    this.bladeNormal.copy(this.up).multiplyScalar(this.profileNormal.y).addScaledVector(this.depthAxis,this.profileNormal.z);
  }
  reset(){
    this.head=-1;this.count=0;this.age=0;this.speed=18;this.hasLast=false;this.impactActive=false;this.sampleCount=0;
    this.geometry.setDrawRange(0,0);this.material.uniforms.uDrain.value=0;
  }
  addPoint(x,y,z,time,orientation=this.orientation){
    this.head=(this.head+1)%CAPACITY;const k=this.head*4;
    this.history[k]=x;this.history[k+1]=y;this.history[k+2]=z;this.history[k+3]=time;
    orientation.toArray(this.orientationHistory,k);
    this.count=Math.min(this.count+1,CAPACITY);
  }
  impact(target,time,orientation){
    if(this.impactActive)return;
    if(orientation)this.orientation.copy(orientation).normalize();
    this.impactActive=true;this.impactTarget.copy(target);this.impactClock=this.age;this.impactTime=Number.isFinite(time)?time:this.age;
    const size=this.config.bladeSize??this.config.arrowSize??1;
    const middle=Math.floor(CROSS/2)*3;
    this._setBasis(this.orientation);
    this.impactAnchor.copy(target).addScaledVector(this.poseForward,-this.headProfile[middle]*size)
      .addScaledVector(this.up,-this.headProfile[middle+1]*size)
      .addScaledVector(this.depthAxis,-this.headProfile[middle+2]*size);
    this.impactLifespan=Math.min(.85,Math.max(.2,(this.config.trailLength??5.5)/Math.max(7,this.speed))*1.12);
    if(this.count){
      const k=this.head*4;this.current.set(this.history[k],this.history[k+1],this.history[k+2]);
      const steps=Math.min(64,Math.max(1,Math.ceil(this.current.distanceTo(this.impactAnchor)/.065)));
      for(let i=1;i<=steps;i++){
        const f=i/steps;
        this.addPoint(THREE.MathUtils.lerp(this.current.x,this.impactAnchor.x,f),THREE.MathUtils.lerp(this.current.y,this.impactAnchor.y,f),THREE.MathUtils.lerp(this.current.z,this.impactAnchor.z,f),this.age);
      }
    }else this.addPoint(this.impactAnchor.x,this.impactAnchor.y,this.impactAnchor.z,this.age);
  }
  /** orientation is the exact blade.group quaternion, not the untilted slash
   * plane. Omitting it preserves the original +X-to-direction behavior. */
  update(dt,time,position,emitting,camera,config=this.config,direction,orientation){
    this.config=config;this.age+=dt;this.material.uniforms.uGameStyle.value=config.gameStyle?1:0;this.material.uniforms.uFervor.value=config.fervorStrength||0;
    const size=config.bladeSize??config.arrowSize??1,trailLength=Math.max(.1,config.trailLength??5.5);
    this.color.set(config.energyColor??config.frostColor??'#39dfff');this.purple.set(config.lightningColor??'#9170ff');
    if(direction)this.forward.copy(direction).normalize();else this.forward.set(1,0,0);
    if(orientation)this.orientation.copy(orientation).normalize();
    else this.orientation.setFromUnitVectors(this.xAxis,this.forward);
    this.current.copy(position);
    if(emitting&&!this.impactActive){
      if(!this.hasLast){
        this.addPoint(this.current.x,this.current.y,this.current.z,this.age);
        this.last.copy(this.current);this.lastOrientation.copy(this.orientation);this.hasLast=true;
      }
      else{
        const distance=this.last.distanceTo(this.current);
        if(distance>.0001){
          this.speed=THREE.MathUtils.lerp(this.speed,distance/Math.max(dt,.0001),.23);
          const steps=Math.min(64,Math.max(1,Math.ceil(distance/.075)));
          for(let i=1;i<=steps;i++){
            const f=i/steps;
            this.sampleOrientation.slerpQuaternions(this.lastOrientation,this.orientation,f);
            this.addPoint(THREE.MathUtils.lerp(this.last.x,this.current.x,f),THREE.MathUtils.lerp(this.last.y,this.current.y,f),THREE.MathUtils.lerp(this.last.z,this.current.z,f),this.age-dt*(1-f),this.sampleOrientation);
          }
        }else if(this.head>=0)this.orientation.toArray(this.orientationHistory,this.head*4);
        this.last.copy(this.current);this.lastOrientation.copy(this.orientation);
      }
    }
    const progress=this.impactActive?THREE.MathUtils.clamp((time-this.impactTime)/DRAIN_TIME,0,1):0;
    const transport=progress*progress*(3-2*progress),impactFade=1-THREE.MathUtils.smoothstep(progress,.08,1);
    if(this.impactActive&&progress>=1){this.count=0;this.hasLast=false;}
    if(this.count<2){this.sampleCount=0;this.geometry.setDrawRange(0,0);return;}
    const lifespan=this.impactActive?this.impactLifespan:Math.min(.85,Math.max(.2,trailLength/Math.max(7,this.speed))*1.12);
    const maximum=Math.min(this.count,SAMPLES);let distance=0,samples=0;
    for(let row=0;row<maximum;row++){
      const index=(this.head-row+CAPACITY)%CAPACITY,k=index*4;
      this.p.set(this.history[k],this.history[k+1],this.history[k+2]);
      const age=Math.max(0,(this.impactActive?this.impactClock:this.age)-this.history[k+3]);
      if(row)distance+=this.p.distanceTo(this.previous);
      if(distance>trailLength||age>lifespan)break;
      this.rows[row]=index;this.distances[row]=distance;this.rowLives[row]=Math.pow(Math.max(0,1-age/lifespan),.6)*impactFade;
      this.previous.copy(this.p);samples++;
    }
    this.sampleCount=samples;
    if(samples<2){this.geometry.setDrawRange(0,0);if(!samples){this.count=0;this.hasLast=false;}return;}
    const effectiveLength=Math.max(.001,this.distances[samples-1]);
    const development=THREE.MathUtils.smoothstep(effectiveLength,.04,.40);
    const launch=this.launchStretch&&time>=.65&&time<.88?Math.exp(-(time-.65)*21)*THREE.MathUtils.smoothstep(time,.65,.666):0;
    const stretchX=1+launch*.22,stretchY=1-launch*.045;
    for(let row=0;row<samples;row++){
      const k=this.rows[row]*4;this.p.set(this.history[k],this.history[k+1],this.history[k+2]);
      this.sampleOrientation.fromArray(this.orientationHistory,k).normalize();
      this._setBasis(this.sampleOrientation);
      const u=THREE.MathUtils.clamp(this.distances[row]/effectiveLength,0,1);
      const taper=Math.pow(Math.max(0,1-u),1.55)*Math.exp(-u*.8),curve=Math.pow(Math.max(0,1-u),.78);
      const wave=Math.sin(u*Math.PI)*size*taper,phase=this.distances[row]*2.8-time*7.5;
      for(let column=0;column<CROSS;column++){
        const v=column/(CROSS-1),profile=column*3,across=Math.sin(v*Math.PI);
        const span=this.headProfile[profile+1]*this.profileAxis.y+this.headProfile[profile+2]*this.profileAxis.z;
        const depth=this.headProfile[profile+1]*this.profileNormal.y+this.headProfile[profile+2]*this.profileNormal.z;
        const x=THREE.MathUtils.lerp(this.tailOffset,this.headProfile[profile],curve);
        this.offset.copy(this.p).addScaledVector(this.poseForward,x*size*stretchX)
          .addScaledVector(this.bladeAxis,span*size*taper*stretchY+Math.sin(phase)*wave*.07)
          .addScaledVector(this.bladeNormal,depth*size*curve+Math.sin(phase+v*5.0)*wave*.055*across);
        const thickness=.055*wave*across;
        for(let face=0;face<2;face++){
          const vertex=face*PER_FACE+row*CROSS+column,pv=vertex*3,uv=vertex*2,side=face===0?1:-1;
          let x=this.offset.x+this.bladeNormal.x*thickness*side;
          let y=this.offset.y+this.bladeNormal.y*thickness*side;
          let z=this.offset.z+this.bladeNormal.z*thickness*side;
          if(this.impactActive){x=THREE.MathUtils.lerp(x,this.impactTarget.x,transport);y=THREE.MathUtils.lerp(y,this.impactTarget.y,transport);z=THREE.MathUtils.lerp(z,this.impactTarget.z,transport);}
          this.positions[pv]=x;this.positions[pv+1]=y;this.positions[pv+2]=z;
          this.uvs[uv]=u;this.uvs[uv+1]=v;this.life[vertex]=this.rowLives[row]*development;
        }
      }
    }
    this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.uv.needsUpdate=true;this.geometry.attributes.aLife.needsUpdate=true;
    this.geometry.setDrawRange(0,(samples-1)*INDICES_PER_SEGMENT);this.material.uniforms.uTime.value=time;this.material.uniforms.uDrain.value=progress;
  }
  dispose(){this.geometry.dispose();this.material.dispose();this.group.removeFromParent();}
}
