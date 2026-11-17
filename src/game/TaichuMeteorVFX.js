import * as T from 'three';
import { MeteorStorm } from '../vfx/cultivator/MeteorStorm.js';

const vertexShader=`
 attribute vec3 aPhase;
 varying vec2 vMark;
 varying vec3 vPhase;
 void main(){
   vMark=uv*2.-1.;vPhase=aPhase;
   vec4 world=modelMatrix*instanceMatrix*vec4(position.x,0.,position.y,1.);
   world.y=.203+sin(world.x*.11)*.18+cos(world.z*.13)*.16;
   gl_Position=projectionMatrix*viewMatrix*world;
 }
`;
const fragmentShader=`
 varying vec2 vMark;
 varying vec3 vPhase;
 float line(float d,float w){return 1.-smoothstep(w,w+max(.0015,fwidth(d)*.9),abs(d));}
 void main(){
   float r=length(vMark),a=atan(vMark.y,vMark.x),t=vPhase.x;
   if(r>1.)discard;
   vec3 ink=vec3(.065,1.20,.73),white=vec3(2.85,3.45,2.18);
   float marker,heat,alpha,crust=0.;
   if(vPhase.z<.5){
     float dash=smoothstep(.18,.58,cos(a*16.+vPhase.y));
     float outer=line(r-.92,.005)*(.40+.60*dash);
     float inner=line(r-.42,.007)*smoothstep(-.34,.2,cos(a*6.));
     float gather=line(r-mix(.91,.025,t*t),.016)*.69;
     float cross=line(sin(a*4.),.060)*smoothstep(.36,.45,r)*(1.-smoothstep(.56,.66,r));
     heat=gather*.6+exp(-r*17.)*(.76+.24*sin(t*10.));
     marker=outer*.67+inner*.5+cross*.51+heat;
     alpha=smoothstep(0.,.18,t)*(.22+.68*t);
   }else{
     float life=1.-smoothstep(.15,1.,t);
     float bend=sin(r*22.+vPhase.y)*.16+sin(r*59.+a*2.)*.047;
     float broken=r+cos(a*11.)*.13+sin(a*21.+vPhase.y)*.027;
     float fissure=cos((a+bend)*8.)+.22;
     float vein=line(fissure,.071)*(1.-smoothstep(.29,.82,broken));
     float branch=line(fissure*.74+sin(r*39.+a*2.)*.28,.052)*smoothstep(.29,.43,r)*(1.-smoothstep(.55,.94,broken));
     float breaks=smoothstep(-.4,.43,sin(a*16.+r*29.));
     float rim=line(r-(.39+.075*sin(a*8.)+.032*sin(a*34.)),.011)*breaks;
     float movingRing=mix(.08,.97,1.-exp(-t*8.));
     float wave=line(broken*.11+r*.89-movingRing,.008)*exp(-t*4.2);
     heat=exp(-r*7.)*exp(-t*7.5)+vein*.34*exp(-t*4.)+wave*.41;
     marker=vein*.76+branch*.38+rim*.36+heat*.6+wave*.89;
     alpha=life*(.48+.46*exp(-t*12.));
     crust=life*.52*(1.-smoothstep(.18,.70,broken));
   }
   float glow=marker*alpha;
   float opacity=clamp(glow+crust,0.,1.);
   if(opacity<.008)discard;
   vec3 color=mix(vec3(.018,.06,.05),mix(ink,white,clamp(heat+.10,0.,1.)),min(1.,glow/opacity));
   gl_FragColor=vec4(color,opacity);
 }
`;

export class TaichuMeteorVFX {
  constructor(parent,camera,set) {
    this.events=set.events;
    this.group=new T.Group();this.group.name='Taichu meteor impacts';parent.add(this.group);
    this.storm=new MeteorStorm(this.group,camera,{jade:true,impactRadius:1.7,particleDensity:2.65},this.events);
    const geometry=new T.PlaneGeometry(2,2,10,10);
    this.phase=new T.InstancedBufferAttribute(new Float32Array(this.events.length*3),3).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('aPhase',this.phase);
    this.marks=new T.InstancedMesh(geometry,new T.ShaderMaterial({vertexShader,fragmentShader,depthWrite:false,
      transparent:true,side:T.DoubleSide,forceSinglePass:true}),this.events.length);
    this.marks.count=0;this.marks.frustumCulled=false;this.marks.renderOrder=2;
    this.marks.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.group.add(this.marks);this.group.visible=false;this.transform=new T.Object3D();
  }

  update(time) {
    let count=0;
    for(const e of this.events)if(e.active&&time>=e.born){
      const hit=time>=e.hit;
      this.transform.position.set(e.end.x,e.groundY,e.end.z);
      this.transform.scale.setScalar(e.blast*(hit?.87:1.06));
      this.transform.updateMatrix();
      this.marks.setMatrixAt(count,this.transform.matrix);
      const phase=hit?Math.min(1,(time-e.hit)/1.35):(time-e.born)/(e.hit-e.born);
      this.phase.setXYZ(count++,phase,e.i*1.372,Number(hit));
    }
    this.group.visible=count>0;this.marks.count=count;
    if(!count)return;
    this.phase.needsUpdate=this.marks.instanceMatrix.needsUpdate=true;
    this.storm.update(time);
  }

  dispose() {
    this.storm.dispose();this.marks.geometry.dispose();this.marks.material.dispose();this.marks.dispose();this.group.removeFromParent();
  }
}
