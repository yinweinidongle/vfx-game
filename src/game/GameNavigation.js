import { isLand, segmentDistance } from './GameData.js';

/** A* with reusable search arrays; routes respect land, obstacles and unlocked seals. */
export class GameNavigation {
  constructor(state) {
    this.state=state;this.cell=1.25;this.x0=-60;this.z0=-38;this.width=112;this.height=72;
    const n=this.width*this.height;this.open=new Uint8Array(n);this.visited=new Uint32Array(n);this.closed=new Uint32Array(n);this.cost=new Float32Array(n);this.parent=new Int32Array(n);this.stamp=0;this.heap=[];
    for(let i=0;i<n;i++){const x=this.x0+(i%this.width)*this.cell,z=this.z0+Math.floor(i/this.width)*this.cell;this.open[i]=Number(isLand(x,z,.58)&&!state.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+.6));}
  }
  allowed(i) { if(i<0||i>=this.open.length||!this.open[i])return false;const x=this.x0+i%this.width*this.cell,z=this.z0+Math.floor(i/this.width)*this.cell;return !(!this.state.save.seals[0]&&x>-2||!this.state.save.seals[1]&&x>37&&z>4); }
  nearest(x,z) {
    const gx=Math.round((x-this.x0)/this.cell),gz=Math.round((z-this.z0)/this.cell);let best=-1,score=Infinity;
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){const col=gx+dx,row=gz+dz;if(col<0||col>=this.width||row<0||row>=this.height)continue;const i=row*this.width+col,d=(this.x0+col*this.cell-x)**2+(this.z0+row*this.cell-z)**2;if(d<score&&this.allowed(i)){score=d;best=i;}}
    return best;
  }
  push(index,score) { const heap=this.heap;let at=heap.length;heap.push({index,score});while(at>0){const p=(at-1)>>1;if(heap[p].score<=score)break;[heap[at],heap[p]]=[heap[p],heap[at]];at=p;} }
  pop() { const heap=this.heap,first=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let at=0;while(true){let child=at*2+1;if(child>=heap.length)break;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[at].score<=heap[child].score)break;[heap[at],heap[child]]=[heap[child],heap[at]];at=child;}}return first.index; }
  clearLine(x,z,tx,tz) {
    if(this.state.obstacles.some(o=>segmentDistance(o.x,o.z,x,z,tx,tz)<o.r+.6))return false;
    const steps=Math.max(1,Math.ceil(Math.hypot(tx-x,tz-z)/.35));
    for(let i=0;i<=steps;i++){
      const t=i/steps,px=x+(tx-x)*t,pz=z+(tz-z)*t;
      if(!isLand(px,pz,.58)||!this.state.save.seals[0]&&px>-2||!this.state.save.seals[1]&&px>37&&pz>4)return false;
    }
    return true;
  }
  smooth(path,x,z,tx,tz) {
    if(this.clearLine(x,z,tx,tz))return [{x:tx,z:tz}];
    const result=[];let next=0;
    while(next<path.length){
      let furthest=next;
      for(let i=next;i<path.length;i++)if(this.clearLine(x,z,path[i].x,path[i].z))furthest=i;
      const point=path[furthest];result.push(point);x=point.x;z=point.z;next=furthest+1;
    }
    if(result.length&&this.clearLine(x,z,tx,tz))result.push({x:tx,z:tz});
    return result;
  }
  find(x,z,tx,tz) {
    const start=this.nearest(x,z),end=this.nearest(tx,tz);if(start<0||end<0)return null;
    const stamp=++this.stamp,w=this.width,ex=end%w,ez=Math.floor(end/w),heuristic=i=>Math.hypot(i%w-ex,Math.floor(i/w)-ez);
    this.heap.length=0;this.cost[start]=0;this.parent[start]=-1;this.visited[start]=stamp;this.push(start,heuristic(start));
    while(this.heap.length){const i=this.pop();if(this.closed[i]===stamp)continue;this.closed[i]=stamp;
      if(i===end){const path=[];let cursor=end;while(cursor!==start&&cursor>=0){path.push({x:this.x0+cursor%w*this.cell,z:this.z0+Math.floor(cursor/w)*this.cell});cursor=this.parent[cursor];}path.reverse();return this.smooth(path,x,z,tx,tz);}
      const cx=i%w,cz=Math.floor(i/w);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz||cx+dx<0||cx+dx>=w||cz+dz<0||cz+dz>=this.height)continue;const next=i+dx+dz*w;if(!this.allowed(next)||this.closed[next]===stamp)continue;if(dx&&dz&&(!this.allowed(i+dx)||!this.allowed(i+dz*w)))continue;const cost=this.cost[i]+(dx&&dz?Math.SQRT2:1);if(this.visited[next]!==stamp||cost<this.cost[next]){this.cost[next]=cost;this.parent[next]=i;this.visited[next]=stamp;this.push(next,cost+heuristic(next));}}
    }
    return null;
  }
}
