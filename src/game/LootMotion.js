import {heightAt,isLand} from './GameData.js';
const hash=n=>{const x=Math.sin(n*127.1+17.7)*43758.5453;return x-Math.floor(x);};
/** True parabola followed by grounded attraction. Drop coordinates and visuals share this state. */
export function createLootMotion(x,z,id,rarity){
 const a=hash(id)*Math.PI*2;let r=.8+hash(id*7)*1.35,landX=x+Math.cos(a)*r,landZ=z+Math.sin(a)*r;
 for(let i=0;i<4&&!isLand(landX,landZ,.15);i++){r*=.45;landX=x+Math.cos(a)*r;landZ=z+Math.sin(a)*r;}
 if(!isLand(landX,landZ,.15)){landX=x;landZ=z;}
 return {birthX:x,birthZ:z,landX,landZ,flight:.66+rarity*.07,arc:1.2+rarity*.18,landed:false,seed:id*31.371,y:heightAt(x,z)+.9};
}
export function advanceLoot(d,dt,p){
 const flight=d.flight||.7,t=Math.min(1,d.age/flight);
 if(t<1){d.x=d.birthX+(d.landX-d.birthX)*t;d.z=d.birthZ+(d.landZ-d.birthZ)*t;d.y=heightAt(d.birthX,d.birthZ)* (1-t)+heightAt(d.landX,d.landZ)*t+.9*(1-t)+.14*t+4*(d.arc||1.2)*t*(1-t);return false;}
 const landed=!d.landed;if(landed){d.x=d.landX;d.z=d.landZ;}d.landed=true;d.y=heightAt(d.x,d.z)+.14;
 if(d.age>flight+.24&&Math.hypot(d.x-p.x,d.z-p.z)<7){const k=1-Math.exp(-dt*(3+(d.age-flight)*3));d.x+=(p.x-d.x)*k;d.z+=(p.z-d.z)*k;d.y=heightAt(d.x,d.z)+.14;}
 return landed;
}
export function cleanLootMotion(raw){
 const valid=k=>Number.isFinite(raw[k])&&Math.abs(raw[k])<150;
 return {birthX:valid('birthX')?raw.birthX:raw.x,birthZ:valid('birthZ')?raw.birthZ:raw.z,landX:valid('landX')?raw.landX:raw.x,landZ:valid('landZ')?raw.landZ:raw.z,flight:Math.max(.5,Math.min(1.2,Number(raw.flight)||.7)),arc:Math.max(.5,Math.min(2,Number(raw.arc)||1.2)),landed:raw.landed===true,seed:Number.isFinite(raw.seed)?raw.seed:raw.lootId*31.371};
}
