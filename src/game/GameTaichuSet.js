import { heightAt } from './GameData.js';

export const TAICHU_METEOR_CHANCE = .05;
const METEOR_CAP = 8;
const BLAST_RADIUS = 4.2;
const canHit = enemy => enemy?.hp > 0 && enemy.state !== 'return' && !(enemy.spawnGrace > 0);

/** Each successful attack can call this once. Renderers read the same world positions used for damage. */
export class GameTaichuSet {
  constructor(state) {
    this.state = state;
    this.events = Array.from({length:METEOR_CAP}, (_, i) => ({i,hero:true,active:false,
      start:{x:0,y:0,z:0},end:{x:0,y:0,z:0},groundY:0,blast:BLAST_RADIUS}));
  }

  request(target, delay = 0) {
    const s = this.state;
    if (!s.stats.taichu || s.dead || !canHit(target) || s.random() >= TAICHU_METEOR_CHANCE) return false;
    const e = this.events.find(e => !e.active);
    if (!e) return false;
    const groundY=heightAt(target.x,target.z);
    const dx=target.x-s.player.x,dz=target.z-s.player.z;
    const inverse=1/(Math.hypot(dx,dz)||1);
    const side=(e.i%2===0?1:-1)*4.65;
    e.active=true;
    e.applied=false;
    e.warned=false;
    e.born=s.time+delay;
    e.launch=e.born+.10;
    e.fall=.58;
    e.hit=e.launch+e.fall;
    e.groundY=groundY;
    e.radius=.58;
    e.curve=.55*(e.i%2===0?1:-1);
    e.damage=s.stats.damage*1.75;
    e.start.x=target.x+(dx*2.15-dz*side)*inverse;
    e.start.y=groundY+11.7;
    e.start.z=target.z+(dz*2.15+dx*side)*inverse;
    e.end.x=target.x;e.end.y=groundY+.38;e.end.z=target.z;
    this.warn(e);
    return true;
  }

  warn(e) {
    if(!e.warned&&this.state.time>=e.born){e.warned=true;this.state.emit('taichuMeteorWarn',{x:e.end.x,z:e.end.z});}
  }

  update() {
    const s=this.state;
    if(s.dead)return;
    for(const e of this.events) {
      if(!e.active)continue;
      this.warn(e);
      const age=s.time-e.hit;
      if(age<0)continue;
      if(!e.applied){
        e.applied=true;
        s.emit('taichuMeteorImpact',{x:e.end.x,z:e.end.z});
        for(const enemy of s.enemies){
          if(!canHit(enemy))continue;
          const range=Math.hypot(enemy.x-e.end.x,enemy.z-e.end.z);
          if(range<e.blast)s.hit(enemy,e.damage*(1-.36*range/e.blast),'taichu');
        }
      }
      if(age>=1.36)e.active=false;
    }
  }

  reset(){for(const e of this.events)e.active=false;}
}
