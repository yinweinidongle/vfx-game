import * as T from 'three';
import { heightAt } from './GameData.js';

/** A real damage reservoir rendered as a thin Fresnel shell. The centre remains
 * transparent; hit ripples originate on the side the damage actually arrived from. */
export class GameShieldVFX{
  constructor(parent,state){
    this.state=state;this.age=10;this.broken=false;this.upgradeAge=10;
    this.uniforms={uTime:{value:0},uPresence:{value:0},uCharge:{value:1},uLevel:{value:0},uHitAge:{value:10},uUpgrade:{value:0},uHit:{value:new T.Vector3(0,.05,1)},uTint:{value:new T.Color('#79e2dd')}};
    this.material=new T.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,depthTest:true,side:T.FrontSide,
      vertexShader:`varying vec3 vN,vEye,vLocal;void main(){vLocal=normalize(position);vec4 eye=modelViewMatrix*vec4(position,1.);vEye=-eye.xyz;vN=normalMatrix*normal;gl_Position=projectionMatrix*eye;}`,
      fragmentShader:`uniform float uTime,uPresence,uCharge,uLevel,uHitAge,uUpgrade;uniform vec3 uTint,uHit;varying vec3 vN,vEye,vLocal;
      void main(){float rim=pow(1.-abs(dot(normalize(vN),normalize(vEye))),3.2-uLevel*.65);
      float angle=acos(clamp(dot(normalize(vLocal),normalize(uHit)),-1.,1.));
      float hit=exp(-pow((angle-uHitAge*4.)*15.,2.))*max(0.,1.-uHitAge/.65);
      float rune=pow(max(0.,cos(vLocal.y*62.+sin(atan(vLocal.z,vLocal.x)*12.)*.7-uTime*.7)),35.)*rim*uLevel;
      float nearFade=smoothstep(.2,.9,length(vEye));
      float opacity=(.009+rim*(.76+uLevel*.20+.06*sin(uTime*1.2))+rune*.15)*uPresence*(.35+.65*uCharge)+hit*(.45+uLevel*.2)+uUpgrade*rim*.15;
      vec3 highlight=mix(vec3(.8,1.,1.1),vec3(1.8,.18,.13),smoothstep(.2,.8,uLevel));
      float filament=pow(1.-abs(dot(normalize(vN),normalize(vEye))),24.);
      vec3 color=uTint*(.38+rim*(1.2+uLevel*.3)+filament*(.4+uLevel*2.)+rune*.55)+highlight*(hit*1.3+uUpgrade*rim*.5);
      if(opacity*nearFade<.002)discard;gl_FragColor=vec4(color,opacity*nearFade);}`});
    this.mesh=new T.Mesh(new T.SphereGeometry(1,48,32),this.material);this.mesh.name='长生护罩';this.mesh.renderOrder=5;this.mesh.visible=false;parent.add(this.mesh);
  }
  handle(event){
    if(event.type==='shieldHit'){this.age=0;this.broken=event.broken;this.uniforms.uHit.value.set(event.nx,.05,event.nz).normalize();}
    if(event.type==='vitalityUpgrade')this.upgradeAge=0;
    if(event.type==='revive'){this.age=10;this.broken=false;}
  }
  update(dt){
    this.age+=dt;this.upgradeAge+=dt;const s=this.state,p=s.player,v=s.vitality,u=this.uniforms;
    const breaking=this.broken?Math.max(0,1-this.age/.5):0;
    this.mesh.visible=!s.dead&&v.level>0&&(p.shield>.01||breaking>0);if(!this.mesh.visible)return;
    this.mesh.position.set(p.x,heightAt(p.x,p.z)+1.12,p.z);this.mesh.scale.set(v.radius,1.43,v.radius);
    u.uTime.value=s.time;u.uPresence.value=v.presence*(p.shield>0?1:breaking);u.uCharge.value=Math.max(breaking,p.shield/v.capacity);
    u.uLevel.value=v.level/50;u.uTint.value.set(v.color);u.uHitAge.value=this.age;u.uUpgrade.value=Math.max(0,1-this.upgradeAge/1.5);
  }
  dispose(){this.mesh.geometry.dispose();this.material.dispose();this.mesh.removeFromParent();}
}
