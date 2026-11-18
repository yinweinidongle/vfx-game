import * as T from 'three';
import { Sculpture, realmMaterials } from './RealmSculpture.js';

const teal='#187c83', jade='#5bd6b9', pearl='#d2fff1', ink='#18394d';
const iron='#393342', copper='#ae603d', brass='#dcab6e', ember='#ff8d37';
const lapis='#48446e', violet='#9c8ed5', gold='#e8c488', starlight='#e1d6ff';
const flat=[Math.PI/2,0,0];

function buildRay(root,materials,royal) {
  const body=new Sculpture();
  body.facet([0,.08,-.06],[.47,.24,1.02],teal);
  body.orb([0,.13,.38],[.4,.18,.54],jade);
  body.plate([[-.37,.10,.67],[0,.03,1.28],[.37,.10,.67],[0,.09,.24]],[0,.26,.64],pearl);
  for(const side of [-1,1]){
    body.rod([side*.22,.12,.84],[side*.41,.24,1.22],.09,.017,brass);
    body.orb([side*.286,.232,.67],[.073,.057,.10],pearl,2.4);
  }
  body.rod([0,.02,-.64],[0,-.02,-1.67],.14,.065,teal);
  body.rod([0,-.02,-1.67],[.18,.29,-2.6],.066,.006,jade,1.12);
  body.ring([0,.26,-.12],.22,.023,brass,flat);
  if(royal){
    body.ring([0,.53,-.14],.51,.044,brass,[.85,0,0]);
    body.orb([0,.56,-.09],[.14,.14,.14],pearl,2.1);
    for(const side of [-1,1])body.rod([side*.18,.20,.12],[side*.40,.65,-.30],.09,.012,brass);
  }
  body.build(root,materials);
  for(const side of [-1,1]){
    const wing=new Sculpture(), tip=royal?2.23:1.8;
    wing.plate([[side*.11,.02,.68],[side*.72,.14,.73],[side*tip,.20,-.50],
      [side*1.35,.035,-.63],[side*.57,-.10,-1.02],[side*.15,-.04,-.59]],
      [side*.59,.19,.17],teal,.24);
    wing.plate([[side*.32,.13,.47],[side*.78,.205,.52],[side*(tip-.13),.225,-.44],
      [side*.83,.15,-.21]],[side*.78,.235,.25],jade);
    wing.rod([side*.39,.25,.39],[side*(tip-.14),.23,-.43],.039,.009,pearl,1.55);
    for(let vein=0;vein<3;vein++){
      const offset=vein*.17;
      wing.rod([side*(.65+offset),.21,.18-offset],[side*(.76+offset),.035,-.70+offset],.018,.004,brass);
    }
    wing.build(root,materials,side<0?'left':'right');
  }
}

function buildScorpion(root,materials,royal) {
  const shell=new Sculpture();
  shell.facet([0,.04,-.02],[.53,.34,.84],iron);
  for(let band=0;band<4;band++)shell.facet([0,.19,-.51+band*.25],[.50-band*.034,.24,.32],band%2?copper:brass);
  shell.facet([0,.16,.64],[.36,.22,.38],iron);
  for(const side of [-1,1]){
    shell.orb([side*.19,.285,.87],[.064,.059,.077],ember,2.5);
    const elbow=[side*.72,.18,.78];
    shell.rod([side*.28,.06,.34],elbow,.13,.17,iron);
    shell.facet([side*.91,.22,1.07],[.26,.22,.42],copper,[0,side*.32,0]);
    shell.rod([side*1.04,.22,1.22],[side*.94,.31,1.67],.14,.025,brass);
    shell.rod([side*.83,.20,1.27],[side*.84,.25,1.53],.10,.025,iron);
    if(royal)shell.rod([side*.33,.25,-.42],[side*.54,.74,-.80],.14,.01,brass);
  }
  shell.build(root,materials);
  for(const side of [-1,1])for(let gait=0;gait<2;gait++){
    const legs=new Sculpture();
    for(let leg=gait;leg<4;leg+=2){
      const z=leg*.28-.49, splay=z*.75;
      legs.rod([side*.33,-.02,z],[side*.77,.09,z+splay],.10,.075,copper);
      legs.rod([side*.77,.09,z+splay],[side*.98,-.42,z+splay+.08],.075,.018,iron);
    }
    legs.build(root,materials,(side<0?'left':'right')+gait);
  }
  const tail=new Sculpture(), points=[[0,.07,-.62],[0,.29,-1.04],[0,.66,-1.23],[0,1.12,-1.06],[0,1.37,-.71],[0,1.27,-.41]];
  for(let index=1;index<points.length;index++){
    tail.rod(points[index-1],points[index],.18-index*.014,.13-index*.012,index%2?copper:iron);
    tail.facet(points[index],[.15,.16,.14],brass);
  }
  tail.rod(points.at(-1),[0,.92,-.27],.115,.012,ember,2.1);
  tail.build(root,materials,'tail');
}

function buildInstrument(root,materials,royal,core) {
  const body=new Sculpture();
  if(core){
    body.column([0,-.36,0],.69,.88,.32,8,iron);
    body.column([0,-.13,0],.45,.64,.28,8,copper);
    for(let index=0;index<4;index++){
      const angle=index*Math.PI/2;
      body.rod([Math.sin(angle)*.42,-.09,Math.cos(angle)*.42],[Math.sin(angle)*.71,1.19,Math.cos(angle)*.71],.14,.064,brass);
    }
  } else {
    body.facet([0,-.12,0],[.24,.66,.30],lapis);
    body.rod([0,.03,.04],[0,.10,.82],.17,.018,gold);
    for(const side of [-1,1])body.orb([side*.12,.14,.29],[.052,.05,.056],starlight,2);
    for(const side of [-1,1]) {
      const wings=new Sculpture(), rows=royal?5:3;
      for(let feather=0;feather<rows;feather++){
        const span=1.55-.12*feather,back=.35-.24*feather;
        wings.plate([[side*.08,.1,back],[side*.40,.23,back+.14],[side*span,.44+feather*.085,back-.10-feather*.09],
          [side*.54,.17,back-.27]],[side*.44,.29,back-.06],feather%2?gold:violet);
      }
      wings.build(root,materials,side<0?'left':'right');
    }
  }
  body.build(root,materials);
  const orbit=new Sculpture(), bright=core?ember:starlight, trim=core?brass:gold;
  orbit.ring([0,.25,0],royal?.74:.56,.052,trim,[.28,0,0]);
  orbit.ring([0,.25,0],royal?.65:.49,.028,trim,[1.22,.65,.4]);
  orbit.facet([0,.25,0],[.23,.39,.23],bright,[0,.4,0],2.35);
  if(royal)for(let index=0;index<8;index++){
    const angle=index*Math.PI/4;orbit.facet([Math.sin(angle)*.79,.25+Math.cos(angle)*.79,0],[.07,.105,.07],bright,[0,0,-angle],1.7);
  }
  orbit.build(root,materials,'orbit');
}

export class RealmCreatures {
  constructor() {this.templates=new Map();this.materials=realmMaterials();}
  create(enemy) {
    if(!this.templates.has(enemy.type)){
      const template=new T.Group();
      if(enemy.family==='ray') buildRay(template,this.materials,enemy.keeper);
      else if(enemy.family==='scorpion') buildScorpion(template,this.materials,enemy.keeper);
      else buildInstrument(template,this.materials,enemy.keeper,enemy.family==='core');
      this.templates.set(enemy.type,template);
    }
    const group=new T.Group(), model=this.templates.get(enemy.type).clone(true), parts={};
    const body=this.materials.body.clone(), light=this.materials.light.clone();
    for(const material of [body,light]) material.transparent=true;
    model.traverse(piece=>{
      if(piece.name) parts[piece.name]=piece;
      if(piece.isMesh)piece.material=piece.material===this.materials.body?body:light;
    });
    group.add(model);group.scale.setScalar(enemy.scale);
    const eyes=[];
    if(enemy.family!=='core'){
      const pair=enemy.family==='scorpion'?[.19,.285,.87]:enemy.family==='ray'?[.286,.232,.67]:[.12,.14,.29];
      for(const sign of [-1,1]){
        const eye=new T.Object3D();eye.position.set(pair[0]*sign,pair[1],pair[2]);model.add(eye);eyes.push(eye);
      }
    }
    return {group,model,enemy,parts,body,light,eyes,materials:[body,light],sourceScale:.65,realmCreature:true};
  }
  update(view,time,dt,ground) {
    const {enemy,group,model,parts}=view, family=enemy.family;
    group.position.set(enemy.x,ground,enemy.z);
    group.rotation.y+=Math.atan2(Math.sin(enemy.yaw-group.rotation.y),Math.cos(enemy.yaw-group.rotation.y))*(1-Math.exp(-dt*12));
    view.poseTime=(view.poseTime||0)+(enemy.frozen>0?.1:1)*dt;
    const phase=view.poseTime*(family==='scorpion'?8:3)+enemy.id*1.3;
    const wind=enemy.state==='windup'?1-Math.max(0,enemy.timer)/enemy.windup:0;
    const dying=enemy.hp<=0?Math.min(1,enemy.deathAge/1.2):0;
    const hover=family==='scorpion'?.47:family==='core'?.53:1.05+Math.sin(phase)*.12;
    model.position.y=hover*(1-dying);
    model.rotation.z=dying*.57;model.rotation.x=-wind*.14;
    if(parts.left){
      parts.left.rotation.z=Math.sin(phase)*.19-wind*.32;
      parts.right.rotation.z=-parts.left.rotation.z;
    }
    if(parts.tail){
      parts.tail.rotation.x=.12*Math.sin(phase*.52)-wind*.38;
      for(const side of ['left','right'])for(let gait=0;gait<2;gait++){
        parts[side+gait].rotation.x=Math.sin(phase+(gait+(side==='left'?1:0))*Math.PI)*.16;
      }
    }
    if(parts.orbit){parts.orbit.rotation.y=view.poseTime*(enemy.keeper?1.2:.78);parts.orbit.rotation.z=Math.sin(phase*.4)*.23;}
    const fade=Math.min(1,1-(enemy.spawnGrace||0)/.8)*(1-dying);
    view.body.opacity=view.light.opacity=fade;
    view.body.emissive.setRGB(enemy.flash*.9+(enemy.frozen>0?.035:0),enemy.flash*.8,enemy.flash+(enemy.frozen>0?.18:0));
    view.light.color.setScalar(1+wind*.9);
  }
  dispose() {
    for(const template of this.templates.values()) template.traverse(piece=>piece.geometry?.dispose());
    this.materials.body.dispose();this.materials.light.dispose();
  }
}
