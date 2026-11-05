import * as T from 'three';
import { removeEmbeddedString } from '../scene/GeneratedBowAsset.js';

/** +Y upright / +Z forward, palm-fitted independently of the FBX hand axes. */
export class GameArcherRig {
  constructor(view,source,state) {
    this.view=view;this.state=state;this.group=new T.Group();this.group.name='Palm-fitted upright frost bow';view.group.add(this.group);
    const model=source.clone(true);model.traverse(o=>{if(o.isMesh)o.geometry=o.geometry.clone();});
    removeEmbeddedString(model,{min:[-.014,-.565,-.192],max:[.014,.59,-.155],axis:'y',maxRemovalFraction:.08});
    this.ownedGeometry=[];model.traverse(o=>{if(o.isMesh){this.ownedGeometry.push(o.geometry);o.castShadow=o.receiveShadow=true;}});
    const size=new T.Box3().setFromObject(model).getSize(new T.Vector3()),scale=1.65/size.y;
    model.scale.setScalar(scale);model.position.set(0,0,-.08*scale);this.group.add(model);this.baseModel=model;this.activeModel=model;
    const bone=n=>view.model.getObjectByName('mixamorig'+n);
    this.hand=bone('LeftHand');this.index=bone('LeftHandIndex1');this.middle=bone('LeftHandMiddle1');
    this.drawHand=bone('RightHand');this.drawIndex=bone('RightHandIndex3');this.drawMiddle=bone('RightHandMiddle2');
    this.arm=bone('RightArm');this.forearm=bone('RightForeArm');
    this.grip=new T.Vector3();this.nock=new T.Vector3();this.temp=new T.Vector3();this.second=new T.Vector3();this.desired=new T.Vector3();this.jointPosition=new T.Vector3();this.from=new T.Vector3();this.to=new T.Vector3();this.socket=new T.Vector3();
    this.q=new T.Quaternion();this.parentQ=new T.Quaternion();this.deltaQ=new T.Quaternion();this.identity=new T.Quaternion();this.baseArm=new T.Quaternion();this.baseForearm=new T.Quaternion();this.corrected=false;
    this.lower=new T.Vector3(0,-.56569*scale,-.33631*scale);this.upper=new T.Vector3(0,.59072*scale,-.33631*scale);
    this.defaultLower=this.lower.clone();this.defaultUpper=this.upper.clone();
    this.stringPositions=new Float32Array(9);const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(this.stringPositions,3).setUsage(T.DynamicDrawUsage));
    this.string=new T.Line(geometry,new T.LineBasicMaterial({color:new T.Color(.8,1.35,1.6),transparent:true,opacity:.85,depthWrite:false}));this.string.frustumCulled=false;this.group.add(this.string);view.weapon=this.group;
  }
  installEquipment(model,tier){
    if(this.activeModel===model)return;this.activeModel?.removeFromParent();
    const fit=model.userData.gearFit;if(!fit)throw new Error('Bow model has no calibrated grip/string data');
    const height=1.65+tier*.18;model.position.set(0,0,0);model.rotation.set(0,0,0);model.scale.setScalar(height);this.group.add(model);this.activeModel=model;
    this.lower.fromArray(fit.lower).multiplyScalar(height);this.upper.fromArray(fit.upper).multiplyScalar(height);
  }
  restoreDefaultBow(){if(this.activeModel!==this.baseModel){this.activeModel?.removeFromParent();this.group.add(this.baseModel);this.activeModel=this.baseModel;}this.lower.copy(this.defaultLower);this.upper.copy(this.defaultUpper);}
  readGrip(out) { this.hand.getWorldPosition(out);if(this.index&&this.middle){this.index.getWorldPosition(this.temp);this.middle.getWorldPosition(this.second);out.lerp(this.temp.add(this.second).multiplyScalar(.5),.5);}return out; }
  readNock(out) { this.drawHand.getWorldPosition(out);if(this.drawIndex&&this.drawMiddle){this.drawIndex.getWorldPosition(out);this.drawMiddle.getWorldPosition(this.second);out.add(this.second).multiplyScalar(.5);}return out; }
  restore() { if(this.corrected){this.arm.quaternion.copy(this.baseArm);this.forearm.quaternion.copy(this.baseForearm);this.corrected=false;} }
  correct(joint,weight) {
    joint.getWorldPosition(this.jointPosition);this.readNock(this.temp);this.from.copy(this.temp).sub(this.jointPosition).normalize();this.to.copy(this.desired).sub(this.jointPosition).normalize();
    this.deltaQ.setFromUnitVectors(this.from,this.to).slerp(this.identity,1-weight);joint.getWorldQuaternion(this.q).premultiply(this.deltaQ);joint.parent.getWorldQuaternion(this.parentQ).invert();joint.quaternion.copy(this.parentQ).multiply(this.q);joint.updateWorldMatrix(true,true);
  }
  update() {
    const p=this.state.player,attacking=p.action==='attack'&&p.actionTime<.32;
    this.view.group.updateWorldMatrix(true,true);this.readGrip(this.grip);this.group.position.copy(this.grip);this.view.group.worldToLocal(this.group.position);
    const yaw=attacking?p.yaw:this.view.group.rotation.y;this.q.setFromAxisAngle(T.Object3D.DEFAULT_UP,yaw);this.view.group.getWorldQuaternion(this.parentQ).invert();this.group.quaternion.copy(this.parentQ).multiply(this.q);this.group.updateWorldMatrix(true,true);
    const weight=attacking?1-T.MathUtils.smoothstep(p.actionTime,.12,.27):0;
    this.baseArm.copy(this.arm.quaternion);this.baseForearm.copy(this.forearm.quaternion);
    if(weight>0){this.readNock(this.nock);this.group.worldToLocal(this.nock);const draw=T.MathUtils.clamp(-this.nock.z,.56,.82);this.desired.set(0,.055,-draw);this.group.localToWorld(this.desired);for(let i=0;i<3;i++){this.correct(this.forearm,weight);this.correct(this.arm,weight);}this.corrected=true;}
    this.nock.set(0,0,this.lower.z);
    if(weight>0){this.readNock(this.temp);this.group.worldToLocal(this.temp);this.nock.lerp(this.temp,weight);}
    this.lower.toArray(this.stringPositions,0);this.nock.toArray(this.stringPositions,3);this.upper.toArray(this.stringPositions,6);this.string.geometry.attributes.position.needsUpdate=true;
    this.socket.set(0,.055,.14);this.group.localToWorld(this.socket);this.state.attackSocket??={x:0,y:0,z:0};Object.assign(this.state.attackSocket,{x:this.socket.x,y:this.socket.y,z:this.socket.z});
  }
  dispose() { this.restore();this.ownedGeometry.forEach(g=>g.dispose());this.string.geometry.dispose();this.string.material.dispose();this.group.removeFromParent(); }
}
