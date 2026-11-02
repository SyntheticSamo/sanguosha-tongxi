const inside=(p,r)=>p.x>r.left+.1&&p.x<r.right-.1&&p.y>r.top+.1&&p.y<r.bottom-.1;
export function crossesRect(a,b,r){
 if(inside(a,r)||inside(b,r))return true;
 let lo=0,hi=1;for(const [v,d,min,max]of [[a.x,b.x-a.x,r.left+.1,r.right-.1],[a.y,b.y-a.y,r.top+.1,r.bottom-.1]]){
  if(Math.abs(d)<1e-8){if(v<min||v>max)return false;continue;}
  const x=(min-v)/d,y=(max-v)/d;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));if(lo>hi)return false;
 }return hi>=0&&lo<=1;
}
export function routeChain(a,b,obstacles=[]){
 const clear=(x,y)=>!obstacles.some(r=>crossesRect(x,y,r));if(clear(a,b))return [a,b];
 const nodes=[a,b,...obstacles.flatMap(r=>[{x:r.left,y:r.top},{x:r.right,y:r.top},{x:r.right,y:r.bottom},{x:r.left,y:r.bottom}])].filter((p,i)=>i<2||!obstacles.some(r=>inside(p,r))).slice(0,130),dist=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),seen=new Set();dist[0]=0;
 for(let n=0;n<nodes.length;n++){let u=-1;for(let i=0;i<nodes.length;i++)if(!seen.has(i)&&(u<0||dist[i]<dist[u]))u=i;if(u<0||!Number.isFinite(dist[u])||u===1)break;seen.add(u);for(let v=0;v<nodes.length;v++){if(seen.has(v)||v===u||!clear(nodes[u],nodes[v]))continue;const d=dist[u]+Math.hypot(nodes[u].x-nodes[v].x,nodes[u].y-nodes[v].y);if(d<dist[v]){dist[v]=d;prev[v]=u;}}}
 if(!Number.isFinite(dist[1]))return [];
 const path=[];for(let i=1;i>=0;i=prev[i])path.unshift(nodes[i]);return path;
}
export function sampleChain(path,step=7){
 const lengths=path.slice(1).map((p,i)=>Math.hypot(p.x-path[i].x,p.y-path[i].y)),total=lengths.reduce((a,b)=>a+b,0);if(!total)return [];
 const n=Math.min(120,Math.max(2,Math.ceil(total/step))),out=[];for(let i=0;i<=n;i++){let d=i*total/n,k=0;while(k<lengths.length-1&&d>lengths[k])d-=lengths[k++];const a=path[k],b=path[k+1],t=d/(lengths[k]||1);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,t:i/n});}return out;
}
export function routeBetweenSeats(a,b,obstacles=[]){
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,edge=p=>Math.min(p.w/2/(Math.abs(dx)/len||1e-6),p.h/2/(Math.abs(dy)/len||1e-6))+8;
 const ports=(p,preferred)=>[preferred,...[-.38,0,.38].flatMap(t=>[{x:p.x-p.w/2-8,y:p.y+p.h*t},{x:p.x+p.w/2+8,y:p.y+p.h*t},{x:p.x+p.w*t,y:p.y-p.h/2-8},{x:p.x+p.w*t,y:p.y+p.h/2+8}])].filter(q=>!obstacles.some(r=>inside(q,r)));
 const starts=ports(a,{x:a.x+dx/len*edge(a),y:a.y+dy/len*edge(a)}),ends=ports(b,{x:b.x-dx/len*edge(b),y:b.y-dy/len*edge(b)}),pairs=starts.flatMap(x=>ends.map(y=>({x,y,lower:Math.hypot(y.x-x.x,y.y-x.y)}))).sort((x,y)=>x.lower-y.lower);
 let best=[],length=Infinity;for(const p of pairs){if(p.lower>=length)continue;const route=routeChain(p.x,p.y,obstacles);if(!route.length)continue;const n=route.slice(1).reduce((sum,q,i)=>sum+Math.hypot(q.x-route[i].x,q.y-route[i].y),0);if(n<length){best=route;length=n;}}
 return best;
}
export function softenChain(path,obstacles=[],sag=10){
 if(path.length<2)return path;
 let curve;
 if(path.length===2){const [a,b]=path;curve=Array.from({length:17},(_,i)=>{const t=i/16;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t+Math.sin(Math.PI*t)*sag};});}
 else{curve=[path[0]];for(let i=1;i<path.length-1;i++){const a=path[i-1],b=path[i],c=path[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(9,ab/3,bc/3),from={x:b.x+(a.x-b.x)*r/ab,y:b.y+(a.y-b.y)*r/ab},to={x:b.x+(c.x-b.x)*r/bc,y:b.y+(c.y-b.y)*r/bc};curve.push(from);for(let j=1;j<=4;j++){const t=j/4;curve.push({x:(1-t)**2*from.x+2*t*(1-t)*b.x+t*t*to.x,y:(1-t)**2*from.y+2*t*(1-t)*b.y+t*t*to.y});}}curve.push(path.at(-1));}
 return curve.slice(1).some((p,i)=>obstacles.some(r=>crossesRect(curve[i],p,r)))?path:curve;
}
