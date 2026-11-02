import * as T from 'three';
import { heightAt } from './GameData.js';
const CAPACITY=640;
/** Rounded navigable paths, painted silk flow and sparse travelling runes. */
export class GameRouteGuide {
  constructor(scene,state,navigation){
    this.state=state;this.navigation=navigation;this.path=[];this.distance=0;this.lastX=Infinity;this.lastZ=Infinity;this.lastKey='';this.nextUpdate=0;
    this.group=new T.Group();this.group.name='Guiding starlight · painted silk';scene.add(this.group);
    this.positions=new Float32Array(CAPACITY*6);this.uvs=new Float32Array(CAPACITY*4);this.centres=new Float32Array(CAPACITY*3);this.distances=new Float32Array(CAPACITY);this.count=0;
    const indices=[];for(let i=0;i<CAPACITY-1;i++){const v=i*2;indices.push(v,v+1,v+2,v+1,v+3,v+2);}
    this.geometry=new T.BufferGeometry();this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));this.geometry.setAttribute('uv',new T.BufferAttribute(this.uvs,2).setUsage(T.DynamicDrawUsage));this.geometry.setIndex(indices);this.geometry.setDrawRange(0,0);
    const placeholder=new T.DataTexture(new Uint8Array([255,255,255,0]),1,1);placeholder.needsUpdate=true;this.texture=placeholder;
    this.material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.AdditiveBlending,uniforms:{uTime:{value:0},uPlayer:{value:new T.Vector2()},uArt:{value:placeholder}},
      vertexShader:'varying vec2 vUv;varying vec3 vP;void main(){vUv=uv;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform float uTime;uniform vec2 uPlayer;uniform sampler2D uArt;varying vec2 vUv;varying vec3 vP;
      void main(){float d=distance(vP.xz,uPlayer),u=fract(vUv.x*.23-uTime*.19),v=.35+vUv.y*.3;
      vec4 a=texture2D(uArt,vec2(u,v)),b=texture2D(uArt,vec2(fract(u+.5),v));float blend=smoothstep(.08,.22,u)*(1.-smoothstep(.78,.92,u));vec4 art=mix(b,a,blend);
      float side=vUv.y*2.-1.,core=exp(-pow((side+sin(vUv.x*2.-uTime*2.)*.035)*27.,2.));float pulse=pow(.5+.5*sin(vUv.x*1.65-uTime*3.6),16.);
      float fade=smoothstep(.7,2.5,d)*(1.-smoothstep(22.,32.,d));float edge=1.-smoothstep(.6,1.,abs(side));float alpha=(art.a*.3+core*(.12+pulse*.25))*edge*fade;
      if(alpha<.003)discard;vec3 color=mix(vec3(.45,.75,.67),vec3(1.55,1.14,.52),.58+core*.42);color+=art.rgb*.2;gl_FragColor=vec4(color,alpha);}`});
    this.ribbon=new T.Mesh(this.geometry,this.material);this.ribbon.frustumCulled=false;this.ribbon.renderOrder=1;this.group.add(this.ribbon);
    const g=new T.PlaneGeometry(1,1);this.alphas=new Float32Array(18);g.setAttribute('aAlpha',new T.InstancedBufferAttribute(this.alphas,1));
    this.runes=new T.InstancedMesh(g,new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,vertexShader:'attribute float aAlpha;varying float vA;varying vec2 vP;void main(){vA=aAlpha;vP=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying float vA;varying vec2 vP;void main(){float diamond=abs(vP.x)+abs(vP.y);float edge=exp(-pow((diamond-.63)*38.,2.));float core=exp(-dot(vP,vP)*55.);float a=(edge*.45+core*.9)*vA;if(a<.005)discard;gl_FragColor=vec4(1.7,1.3,.65,a);}'}),18);this.runes.count=0;this.runes.frustumCulled=false;this.group.add(this.runes);this.dummy=new T.Object3D();this.point=new T.Vector3();
  }
  async loadTexture(url){const texture=await new T.TextureLoader().loadAsync(url);if(this.disposed){texture.dispose();return;}texture.colorSpace=T.SRGBColorSpace;texture.wrapS=T.RepeatWrapping;texture.anisotropy=4;this.texture.dispose();this.texture=texture;this.material.uniforms.uArt.value=texture;}
  rounded(raw){
    if(raw.length<3)return raw;const result=[raw[0]];
    for(let i=1;i<raw.length-1;i++){
      const a=raw[i-1],b=raw[i],c=raw[i+1],la=Math.hypot(b.x-a.x,b.z-a.z),lc=Math.hypot(c.x-b.x,c.z-b.z);let radius=Math.min(1.3,la*.28,lc*.28),curve=null;
      for(let attempt=0;attempt<4;attempt++){
        const entry={x:b.x+(a.x-b.x)*radius/Math.max(la,.001),z:b.z+(a.z-b.z)*radius/Math.max(la,.001)},exit={x:b.x+(c.x-b.x)*radius/Math.max(lc,.001),z:b.z+(c.z-b.z)*radius/Math.max(lc,.001)},points=[];
        for(let j=0;j<=8;j++){const t=j/8,v=1-t;points.push({x:v*v*entry.x+2*v*t*b.x+t*t*exit.x,z:v*v*entry.z+2*v*t*b.z+t*t*exit.z});}
        if(points.every((p,j)=>j===0||this.navigation.clearLine(points[j-1].x,points[j-1].z,p.x,p.z))){curve=points;break;}radius*=.5;
      }
      result.push(...(curve||[b]));
    }result.push(raw[raw.length-1]);return result;
  }
  rebuild(p,o){
    const route=this.navigation.find(p.x,p.z,o.x,o.z);this.path=route?this.rounded([{x:p.x,z:p.z},...route]):[];this.distance=0;this.count=0;
    for(let i=1;i<this.path.length;i++){
      const a=this.path[i-1],b=this.path[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.001)continue;const steps=Math.max(1,Math.ceil(len/.3));
      for(let j=i===1?0:1;j<=steps&&this.count<CAPACITY;j++){const u=j/steps,x=a.x+dx*u,z=a.z+dz*u,k=this.count*3;this.centres[k]=x;this.centres[k+1]=heightAt(x,z)+.065;this.centres[k+2]=z;this.distances[this.count]=this.distance+len*u;this.count++;}this.distance+=len;
    }
    for(let i=0;i<this.count;i++){
      const k=i*3,a=Math.max(0,i-1)*3,b=Math.min(this.count-1,i+1)*3,dx=this.centres[b]-this.centres[a],dz=this.centres[b+2]-this.centres[a+2],len=Math.max(.001,Math.hypot(dx,dz));
      for(let side=0;side<2;side++){const sign=side?1:-1,v=i*6+side*3;this.positions[v]=this.centres[k]+dz/len*.3*sign;this.positions[v+1]=this.centres[k+1];this.positions[v+2]=this.centres[k+2]-dx/len*.3*sign;this.uvs[i*4+side*2]=this.distances[i]-this.distance;this.uvs[i*4+side*2+1]=side;}
    }
    this.geometry.setDrawRange(0,Math.max(0,this.count-1)*6);this.geometry.attributes.position.needsUpdate=this.geometry.attributes.uv.needsUpdate=true;
  }
  update(time){
    const p=this.state.player,o=this.state.objective(),key=`${o.x}:${o.z}:${this.state.save.seals}`;this.material.uniforms.uTime.value=time;this.material.uniforms.uPlayer.value.set(p.x,p.z);
    if(time>=this.nextUpdate||key!==this.lastKey||Math.hypot(p.x-this.lastX,p.z-this.lastZ)>2){this.nextUpdate=time+.9;this.lastKey=key;this.lastX=p.x;this.lastZ=p.z;this.rebuild(p,o);}
    let count=0;const span=Math.min(28,this.distance);
    if(this.count>1)for(let i=0;i<9;i++){
      const d=(this.distance+time*2.2)%3.4+i*3.4;if(d<1.4||d>span-.5)continue;
      let j=1;while(j<this.count-1&&this.distances[j]<d)j++;const a=(j-1)*3,b=j*3,u=(d-this.distances[j-1])/Math.max(.001,this.distances[j]-this.distances[j-1]);
      this.point.fromArray(this.centres,a);this.dummy.position.set(T.MathUtils.lerp(this.point.x,this.centres[b],u),T.MathUtils.lerp(this.point.y,this.centres[b+1],u)+.02,T.MathUtils.lerp(this.point.z,this.centres[b+2],u));this.dummy.rotation.set(-Math.PI/2,0,Math.atan2(this.centres[b]-this.point.x,this.centres[b+2]-this.point.z));this.dummy.scale.set(.12,.25,1);this.dummy.updateMatrix();this.runes.setMatrixAt(count,this.dummy.matrix);this.alphas[count++]=T.MathUtils.smoothstep(d,1.4,3)*(1-T.MathUtils.smoothstep(d,20,28))*.6;
    }
    this.runes.count=count;this.runes.instanceMatrix.needsUpdate=true;this.runes.geometry.attributes.aAlpha.needsUpdate=true;
  }
  dispose(){this.disposed=true;this.texture.dispose();this.geometry.dispose();this.material.dispose();this.runes.geometry.dispose();this.runes.material.dispose();this.group.removeFromParent();}
}
