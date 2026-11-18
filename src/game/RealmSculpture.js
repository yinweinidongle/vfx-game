import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const origin=[0,0,0], unit=[1,1,1], up=new T.Vector3(0,1,0);
export const realmMaterials = () => ({
  body:new T.MeshStandardMaterial({vertexColors:true,roughness:.65,metalness:.22}),
  light:new T.MeshBasicMaterial({vertexColors:true,toneMapped:false}),
});

// Bake each rigid assembly by material. An articulated wing or tail remains one joint.
export class Sculpture {
  constructor() {this.body=[];this.light=[];}
  add(geometry,color,at=origin,scale=unit,turn=origin,emission=0) {
    const part=geometry.index ? geometry.toNonIndexed() : geometry;
    if(part!==geometry) geometry.dispose();
    if(!part.attributes.normal) part.computeVertexNormals();
    part.deleteAttribute('uv');
    const rotation=turn.isQuaternion?turn:new T.Quaternion().setFromEuler(new T.Euler(...turn));
    part.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...at),rotation,new T.Vector3(...scale)));
    const tint=new T.Color(color).multiplyScalar(emission||1);
    const colors=new Float32Array(part.attributes.position.count*3);
    for(let offset=0;offset<colors.length;offset+=3) tint.toArray(colors,offset);
    part.setAttribute('color',new T.BufferAttribute(colors,3));
    (emission?this.light:this.body).push(part);
  }
  facet(at,scale,color,turn=origin,emit=0) {this.add(new T.IcosahedronGeometry(1,0),color,at,scale,turn,emit);}
  orb(at,scale,color,emit=0) {this.add(new T.SphereGeometry(1,20,12),color,at,scale,origin,emit);}
  column(at,top,bottom,height,sides,color,turn=origin,emit=0) {
    this.add(new T.CylinderGeometry(top,bottom,height,sides),color,at,unit,turn,emit);
  }
  ring(at,radius,tube,color,turn=origin,emit=0,arc=Math.PI*2) {
    this.add(new T.TorusGeometry(radius,tube,7,Math.max(18,Math.ceil(48*arc/(Math.PI*2))),arc),color,at,unit,turn,emit);
  }
  rod(start,end,base,tip,color,emit=0,sides=7) {
    const a=new T.Vector3(...start), b=new T.Vector3(...end), axis=b.clone().sub(a);
    const rotation=new T.Quaternion().setFromUnitVectors(up,axis.clone().normalize());
    this.add(new T.CylinderGeometry(tip,base,axis.length(),sides),color,a.lerp(b,.5).toArray(),unit,rotation,emit);
  }
  plate(outline, ridge, color, underside=.07) {
    const solid=[], low=[ridge[0],ridge[1]-underside,ridge[2]];
    for(let index=0;index<outline.length;index++){
      const first=outline[index], next=outline[(index+1)%outline.length];
      const cross=(first[2]-ridge[2])*(next[0]-ridge[0])-(first[0]-ridge[0])*(next[2]-ridge[2]);
      const left=cross>0?first:next,right=cross>0?next:first;
      solid.push(...ridge,...left,...right,...low,...right,...left);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(solid,3));geo.computeVertexNormals();
    this.add(geo,color);
  }
  build(parent,materials,name='') {
    const joint=new T.Group();joint.name=name;parent.add(joint);
    for(const layer of ['body','light']){
      if(!this[layer].length) continue;
      const mesh=new T.Mesh(mergeGeometries(this[layer]),materials[layer]);
      for(const geometry of this[layer]) geometry.dispose();
      mesh.castShadow=layer==='body';mesh.receiveShadow=layer==='body';joint.add(mesh);
    }
    return joint;
  }
}
