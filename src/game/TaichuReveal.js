import * as T from 'three';
import { equipmentProfile, TAICHU_MODELS } from './EquipmentCatalog.js';
import { gearName, GEAR_SLOTS } from './GearData.js';
import { heightAt } from './GameData.js';

export const TAICHU_REVEAL_TIME = 1.52;
const jade = new T.Color('#63dfc5');

const sealVertex = `
  uniform float uGround;
  varying vec2 vUV;
  void main(){
    vUV=uv*2.-1.;
    vec4 world=modelMatrix*vec4(position,1.);
    if(uGround>.5)world.y=.203+sin(world.x*.11)*.18+cos(world.z*.13)*.16;
    gl_Position=projectionMatrix*viewMatrix*world;
  }
`;
const sealFragment = `
  uniform float uTime, uAlpha, uGround;
  varying vec2 vUV;
  float line(float x,float w){return 1.-smoothstep(w,w*2.2,abs(x));}
  void main(){
    float r=length(vUV),a=atan(vUV.y,vUV.x);
    float wave=1.-pow(1.-clamp(uTime*1.65,0.,1.),3.);
    float rim=.10+wave*.77;
    float triple=line(r-rim,.0027)*.78+line(r-rim+.027,.0031)*.60+line(r-rim+.084,.0017)*.48;
    float teeth=step(.72,cos(28.*a))*line(r-rim+.047,.012);
    float sectors=step(-.13,cos(6.*a))*line(r-rim+.128,.007);
    float seal=line(r-(.29+wave*.17),.0024)*step(.18,cos(12.*a));
    float spokes=line(sin(8.*a),.023)*smoothstep(rim-.16,rim-.08,r)*(1.-smoothstep(rim,rim+.012,r));
    float rush=exp(-pow(abs(r-rim)*27.,2.))*.28*(1.-smoothstep(.04,.85,uTime));
    float ticks=step(.86,cos(48.*a))*line(r-rim-.028,.007);
    float alpha=(triple+teeth*.52+sectors*.74+seal*.47+spokes*.84+rush+ticks*.52)*uAlpha;
    alpha*=uGround>.5?.82:1.;
    if(alpha<.012)discard;
    vec3 ink=vec3(.06,.83,.59),silver=vec3(1.21,1.72,1.26);
    float pulse=.31+(.25+.16*cos(a*9.))*pow(.5+.5*cos((uTime-.14)*9.),4.)+teeth*.24;
    gl_FragColor=vec4(mix(ink,silver,clamp(pulse,0.,.95)),alpha);
  }
`;
const beamFragment = `
  uniform float uTime,uAlpha;
  varying vec2 vUV;
  void main(){
    float y=(vUV.y+1.)*.5;
    float width=mix(.80,.15,clamp(y+.06*sin(uTime*6.),0.,1.));
    float x=vUV.x/max(.05,width);
    float core=exp(-x*x*48.);
    float sheath=exp(-x*x*4.);
    float strand=exp(-pow(abs(x-.31*sin(y*17.-uTime*14.))*19.,2.));
    float strand2=exp(-pow(abs(x+.32*sin(y*18.-uTime*15.))*22.,2.));
    float glint=.72+.26*pow(.5+.5*cos((uTime-.07)*11.),4.);
    float gain=(core*.44+sheath*.11+(strand+strand2)*.17)*pow(max(0.,1.-y),1.12)*glint;
    gain*=smoothstep(0.,.10,y)*uAlpha;
    if(gain<.006)discard;
    gl_FragColor=vec4(mix(vec3(.012,1.08,.77),vec3(.57,2.15,1.53),core),gain);
  }
`;
function effectPlane(width, height, fragmentShader, order, ground = false) {
  const mesh = new T.Mesh(new T.PlaneGeometry(width,height,ground?12:1,ground?12:1), new T.ShaderMaterial({
    uniforms: {uTime:{value:0}, uAlpha:{value:0}, uGround:{value:Number(ground)}},
    vertexShader: sealVertex, fragmentShader, transparent:true, depthTest:true, depthWrite:false,
    side:T.DoubleSide, forceSinglePass:true, blending:T.AdditiveBlending,
  }));
  mesh.renderOrder = order;
  return mesh;
}

function displayModel(source, id) {
  const root = source.clone(true);
  if (id === 'bow-taichu' || id === 'boots-taichu') root.rotation.y += Math.PI / 2;
  const box = new T.Box3().setFromObject(root), size = box.getSize(new T.Vector3());
  root.position.sub(box.getCenter(new T.Vector3()));
  const mount = new T.Group();
  mount.scale.setScalar((id === 'wings-taichu' ? 2.55 : 1.95) / Math.max(size.x,size.y,size.z));
  mount.add(root);
  const model = new T.Group();
  model.add(mount);
  model.visible = false;
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const coat = sourceMaterial => {
      const material = sourceMaterial.clone();
      material.roughness = Math.max(.30, material.roughness);
      material.metalness = Math.min(.58, material.metalness);
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
          float rim=pow(clamp(1.-abs(dot(normalize(normal),normalize(vViewPosition))),0.,1.),3.1);
          outgoingLight=max(outgoingLight,diffuseColor.rgb*.88)+rim*vec3(.09,.92,.74);
          #include <opaque_fragment>
        `);
      };
      material.customProgramCacheKey=()=> 'taichu-display';
      return material;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(coat) : coat(mesh.material);
  });
  return model;
}

/** The reveal clock advances separately while combat, loot motion and cooldowns hold. */
export class TaichuReveal {
  constructor(game) {
    this.game = game;
    this.age = 0;
    this.active = false;
    this.group = new T.Group();
    this.group.name = 'Taichu drop reveal';
    this.group.visible = false;
    game.scene.add(this.group);
    this.models = new Map();
    for (const id of TAICHU_MODELS) {
      const model = displayModel(game.actors.gearTemplates[id], id);
      this.models.set(id, model);
      this.group.add(model);
    }
    this.ground = effectPlane(13.0,13.0,sealFragment,5,true);
    this.ground.rotation.x = -Math.PI / 2;
    this.insignia = effectPlane(5.7,5.7,sealFragment,7);
    this.pillar = effectPlane(2.5,8.6,beamFragment,6);
    this.counterPillar = effectPlane(2.3,8.6,beamFragment,6);
    this.dummy = new T.Object3D();
    this.detailColor = new T.Color();
    this.shards = new T.InstancedMesh(new T.OctahedronGeometry(1),new T.MeshBasicMaterial({color:0xffffff}),44);
    this.shards.frustumCulled = false;
    this.shards.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.group.add(this.ground,this.insignia,this.pillar,this.counterPillar,this.shards);

    this.overlay = document.createElement('div');
    this.overlay.id = 'taichu-reveal';
    this.overlay.hidden = true;
    this.overlay.innerHTML = '<div class="taichu-letterbox"></div><div class="taichu-title" role="status"><span></span><strong><span class="taichu-name"></span></strong></div><button type="button">跳过 <kbd>Esc</kbd></button>';
    this.screen = document.querySelector('#game-screen');
    this.screen.append(this.overlay);
    this.overlay.querySelector('button').onclick = () => this.skip();
    this.title = this.overlay.querySelector('.taichu-name');
    this.slot = this.overlay.querySelector('span');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Allocate the color VBO during loading, before the one-time rare effect.
    for(let i=0;i<this.shards.count;i++) this.shards.setColorAt(i,jade);
  }

  begin(event) {
    if (this.active || !event.gear || this.game.state.dead) return false;
    this.active = true;
    this.age = 0;
    this.group.visible = true;
    this.group.position.set(event.x, heightAt(event.x,event.z) + .075, event.z);
    const eye = this.game.camera.position;
    this.yaw = Math.atan2(eye.x - event.x, eye.z - event.z);
    this.model = this.models.get(equipmentProfile(event.gear,this.game.state.kind).id);
    this.model.visible = true;
    this.slot.textContent = '太初现世 · ' + GEAR_SLOTS[event.gear.slot].name;
    this.title.textContent = gearName(event.gear);
    this.overlay.hidden = false;
    this.screen.classList.add('showing-taichu');
    this.game.input.clear();
    this.pose();
    return true;
  }

  update(dt) {
    if (!this.active) return;
    this.age += dt;
    if (this.age >= TAICHU_REVEAL_TIME) { this.finish(); return; }
    this.pose();
  }

  pose() {
    const t = this.age, end = 1-T.MathUtils.smoothstep(t,1.13,TAICHU_REVEAL_TIME);
    const fadeIn = T.MathUtils.smoothstep(t,0,.27);
    const alpha = end * fadeIn;
    const lens = this.yaw + t*.23;
    const rotate = this.reduced ? 0 : t*.94 - .43;
    this.model.position.y = 1.46 + (this.reduced ? 0 : Math.sin(t*3.8)*.10);
    this.model.scale.setScalar((.45 + fadeIn*.55)*(1-.86*T.MathUtils.smoothstep(t,1.21,1.39)));
    this.model.rotation.set(.09,lens+rotate,-.13);
    this.model.visible = t <= 1.39;
    const yaw=this.yaw;
    this.insignia.position.set(-Math.sin(yaw)*.58,1.58,-Math.cos(yaw)*.58);
    this.insignia.rotation.set(0,yaw,0);
    this.insignia.scale.setScalar(.53 + fadeIn*.47);
    const backX = -Math.sin(yaw), backZ = -Math.cos(yaw);
    this.pillar.position.set(backX*1.16 + Math.cos(yaw)*.38,4.3,backZ*1.16-Math.sin(yaw)*.38);
    this.pillar.rotation.y = yaw;
    this.counterPillar.position.set(backX*1.65,4.3,backZ*1.65);
    this.counterPillar.rotation.y = yaw + Math.PI/2;
    const column = .94 - .64*T.MathUtils.smoothstep(t,.22,.65);
    for (const plane of [this.insignia,this.ground,this.pillar,this.counterPillar]) {
      plane.material.uniforms.uTime.value = t;
      plane.material.uniforms.uAlpha.value = end*(plane===this.ground?.69:plane===this.insignia?.73:column);
    }
    this.shards.visible = alpha > .035;
    for (let i=0;i<this.shards.count;i++) {
      const phase = t + (i%7)*.052, angle = i*2.399963;
      const radius = (.47+(i%11)*.17)*(1+.61*fadeIn+.15*phase);
      this.dummy.position.set(Math.sin(angle)*radius,.16 + (i%14)*.23 + .77*fadeIn - phase*.24,Math.cos(angle)*radius);
      this.dummy.rotation.set(i,angle,-i);
      const glint=.67+.33*Math.pow(.5+.5*Math.cos(phase*12+i*1.7),4);
      const size = alpha*(.022+(i%5)*.010)*glint;
      this.dummy.scale.set(size,size*(1.85+(i%3)*.55),size*.72);
      this.dummy.updateMatrix();
      this.shards.setMatrixAt(i,this.dummy.matrix);
      this.shards.setColorAt(i,this.detailColor.copy(jade).multiplyScalar(.68+(i%5)*.31));
    }
    this.shards.instanceMatrix.needsUpdate = true;
    this.shards.instanceColor.needsUpdate = true;
    this.overlay.style.setProperty('--taichu-alpha',String(Math.min(1,alpha*1.4)));
  }

  frame(eye, target) {
    if (!this.active || this.reduced || this.game.settings.skillCamera === false) return;
    const t = this.age;
    const blend = T.MathUtils.smoothstep(t,0,.44)*(1-T.MathUtils.smoothstep(t,1.08,TAICHU_REVEAL_TIME));
    const {x,y,z} = this.group.position;
    const angle = this.yaw + t*.23, distance = 6.4 - .46*t;
    eye.x = T.MathUtils.lerp(eye.x,x+Math.sin(angle)*distance,blend);
    eye.z = T.MathUtils.lerp(eye.z,z+Math.cos(angle)*distance,blend);
    eye.y = T.MathUtils.lerp(eye.y,y+3.05,blend);
    target.x = T.MathUtils.lerp(target.x,x,blend);
    target.y = T.MathUtils.lerp(target.y,y+1.55,blend);
    target.z = T.MathUtils.lerp(target.z,z,blend);
  }

  skip() {
    this.finish();
    this.game.cameraSnap = true;
    this.game.needsRender = true;
  }

  finish() {
    this.active = false;
    if (this.model) this.model.visible = false;
    this.group.visible = false;
    this.overlay.hidden = true;
    this.screen.classList.remove('showing-taichu');
    this.game.awakeningView.root.classList.remove('covered-by-loot');
    this.game.ui.lootRevealTime = Math.min(this.game.ui.lootRevealTime || 0, .12);
  }

  dispose() {
    this.overlay.remove();
    this.group.removeFromParent();
    for(const mesh of [this.ground,this.insignia,this.pillar,this.counterPillar,this.shards]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.shards.dispose();
    for (const model of this.models.values()) model.traverse(mesh => {
      if (mesh.isMesh) for (const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]) material.dispose();
    });
  }
}
