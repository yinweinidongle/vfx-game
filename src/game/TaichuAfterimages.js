import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const LIFETIME=.39;
const vertexShader=`
 #include <common>
 #include <skinning_pars_vertex>
 varying vec3 vEye,vNormal,vWorld;
 void main(){
   vec3 objectNormal=normal, transformed=position;
   #include <skinbase_vertex>
   #include <skinnormal_vertex>
   #include <skinning_vertex>
   vec4 viewPos=modelViewMatrix*vec4(transformed,1.);
   vNormal=normalize(normalMatrix*objectNormal);
   vEye=-viewPos.xyz;
   vWorld=(modelMatrix*vec4(transformed,1.)).xyz;
   gl_Position=projectionMatrix*viewPos;
 }
`;
const fragmentShader=`
 uniform float uAge;
 varying vec3 vEye,vNormal,vWorld;
 void main(){
   float edge=clamp(1.-abs(dot(normalize(vNormal),normalize(vEye))),0.,1.);
   float rim=pow(edge,2.6);
   float band=vWorld.y*6.+uAge*1.75;
   float stripes=pow(.5+.5*cos(band*6.283185),6.);
   stripes=mix(stripes,.226, smoothstep(.18,.46,fwidth(band)));
   float hold=1.-smoothstep(.04,1.,uAge);
   float alpha=(.105+rim*(.79+.24*stripes))*hold;
   if(alpha<.005)discard;
   vec3 amberJade=mix(vec3(.028,.39,.31),vec3(.42,2.25,1.34),rim);
   vec3 fadedJade=mix(vec3(.026,.20,.24),vec3(.24,1.43,1.47),rim);
   gl_FragColor=vec4(mix(amberJade,fadedJade,uAge)*mix(.88,1.35,stripes),alpha);
 }
`;

/** Pose snapshots leave the live model and its skeleton under the actor's control. */
export class TaichuAfterimages {
  constructor(parent,model) {
    this.group=new T.Group();this.group.name='Taichu Fresnel echoes';parent.add(this.group);
    this.model=model;this.lastX=NaN;this.lastZ=NaN;this.cooldown=0;this.next=0;
    this.bones=[];model.traverse(o=>{if(o.isBone)this.bones.push(o);});
    this.slots=Array.from({length:4},()=>{
      const root=clone(model),bones=[],skeletons=new Set();
      const age={value:0};
      const material=new T.ShaderMaterial({uniforms:{uAge:age},vertexShader,fragmentShader,transparent:true,
        depthTest:true,depthWrite:false});
      root.traverse(o=>{
        if(o.isBone)bones.push(o);
        if(!o.isMesh)return;
        if(o.isSkinnedMesh)skeletons.add(o.skeleton);
        o.material=material;o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;o.renderOrder=3;
      });
      root.visible=false;this.group.add(root);
      return {root,bones,skeletons,material,age};
    });
  }

  update(dt, enabled, x, z) {
    const travel=Math.hypot(x-this.lastX,z-this.lastZ);
    this.lastX=x;this.lastZ=z;
    if(!enabled||travel>Math.max(1.4,dt*38)){
      for(const slot of this.slots)slot.root.visible=false;
      this.cooldown=0;
      return;
    }
    if(dt<=0)return;
    for(const slot of this.slots)if(slot.root.visible){
      slot.age.value=Math.min(1,slot.age.value+dt/LIFETIME);
      slot.root.visible=slot.age.value<1;
    }
    this.cooldown-=dt;
    if(!(travel>Math.max(.008,dt*.75))||this.cooldown>0)return;
    this.cooldown=.083;
    const slot=this.slots[this.next++%this.slots.length];
    this.model.updateWorldMatrix(true,false);
    this.model.matrixWorld.decompose(slot.root.position,slot.root.quaternion,slot.root.scale);
    for(let i=0;i<this.bones.length;i++){
      const bone=this.bones[i],dest=slot.bones[i];
      dest.position.copy(bone.position);dest.quaternion.copy(bone.quaternion);dest.scale.copy(bone.scale);
    }
    slot.age.value=.085;
    slot.root.visible=true;
  }

  dispose() {
    for(const slot of this.slots){
      slot.material.dispose();
      for(const skeleton of slot.skeletons)skeleton.dispose();
    }
    this.group.removeFromParent();
  }
}
