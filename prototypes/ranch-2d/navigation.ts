export interface Point {x:number;y:number}
export type Obstacle = {kind:'circle';x:number;y:number;r:number}|{kind:'rect';x:number;y:number;w:number;h:number};
export function blocked(p:Point,objects:Obstacle[],pad=8){
  if(p.x<205||p.x>995||p.y<285||p.y>746)return true;
  return objects.some(o=>o.kind==='circle'?Math.hypot(p.x-o.x,p.y-o.y)<o.r+pad:Math.abs(p.x-o.x)<o.w/2+pad&&Math.abs(p.y-o.y)<o.h/2+pad);
}
/** Four-neighbour A*: routes cannot jump across a rail or cut a blocked corner. */
export function route(start:Point,end:Point,objects:Obstacle[]):Point[]{
  const step=24,cols=50,rows=34,toId=(x:number,y:number)=>y*cols+x;
  const point=(id:number)=>({x:(id%cols)*step+step/2,y:Math.floor(id/cols)*step+step/2});
  function nearest(p:Point){let best=-1,distance=Infinity;for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const id=toId(x,y),q=point(id);if(blocked(q,objects))continue;const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<distance){best=id;distance=d;}}return best;}
  const s=nearest(start),goal=nearest(end);if(s<0||goal<0)return[];
  const open=new Set([s]),came=new Map<number,number>(),g=new Map([[s,0]]);
  const target=point(goal),h=(id:number)=>{const p=point(id);return Math.abs(p.x-target.x)+Math.abs(p.y-target.y);};
  while(open.size){let current=-1,score=Infinity;for(const id of open){const value=g.get(id)!+h(id);if(value<score){current=id;score=value;}}
    if(current===goal){const path=[point(current)];while(came.has(current)){current=came.get(current)!;path.unshift(point(current));}return path;}
    open.delete(current);const x=current%cols,y=Math.floor(current/cols);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;const id=toId(nx,ny);if(blocked(point(id),objects))continue;const next=g.get(current)!+step;if(next<(g.get(id)??Infinity)){came.set(id,current);g.set(id,next);open.add(id);}}
  }
  return[];
}
