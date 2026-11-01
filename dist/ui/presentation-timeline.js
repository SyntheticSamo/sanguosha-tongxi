// Pure dependency planner. It never owns cards, rule state, or network operations.
export class PresentationTimeline {
 constructor(onTransition=()=>{}){this.onTransition=onTransition;this.jobs=new Map();this.done=new Set();this.order=0;this.epoch=0;}
 add(id,{after=[],run=()=>{},finish=()=>{},priority=false,order=++this.order}={}){
  if(this.done.has(id)||this.jobs.has(id))return false;
  this.jobs.set(id,{id,after:[...new Set(after)].slice(0,8),run,finish,priority,order,state:'waiting'});return true;
 }
 ready(){const ready=[...this.jobs.values()].filter(j=>j.state==='waiting'&&j.after.every(id=>this.done.has(id)||!this.jobs.has(id))).sort((a,b)=>Number(b.priority)-Number(a.priority)||a.order-b.order);if(!ready.length&&this.jobs.size&&[...this.jobs.values()].every(j=>j.state==='waiting')){const oldest=[...this.jobs.values()].sort((a,b)=>a.order-b.order)[0];oldest.finish();this.complete(oldest.id);return this.ready();}return ready;}
 start(id){const j=this.jobs.get(id);if(!j||j.state!=='waiting')return;j.state='running';this.onTransition({id,stage:'start',order:j.order});j.run(()=>this.complete(id));}
 complete(id){if(this.jobs.has(id))this.onTransition({id,stage:'end'});this.jobs.delete(id);this.done.add(id);if(this.done.size>512)this.done.delete(this.done.values().next().value);}
 flush(){for(const j of [...this.jobs.values()].sort((a,b)=>a.order-b.order)){j.finish();this.complete(j.id);}}
 clear(){this.epoch++;for(const j of this.jobs.values())j.finish();this.jobs.clear();this.done.clear();}
}

export function packCards(width,cardWidth,count,{padding=20,minAdvance=Math.max(24,cardWidth/2)}={}){
 const space=Math.max(0,width-padding),normal=cardWidth*.88;
 const advance=count<2?normal:Math.max(minAdvance,Math.min(normal,(space-cardWidth)/(count-1)));
 const content=count?cardWidth+(count-1)*advance:0;
 return {advance,overlap:Math.max(0,cardWidth-advance),overflow:content>space+.5,content};
}
