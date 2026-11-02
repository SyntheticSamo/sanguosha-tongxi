import {phaseToken} from './flow.js';

// Host-device debug history. Never persisted, exported or projected to a network seat.
export class PhaseHistory{
 constructor({limit=18,maxBytes=2000000}={}){this.limit=limit;this.maxBytes=maxBytes;this.entries=[];}
 key(s){return s?.status==='playing'&&!s.flow?.opening?`${s.roomId}:${s.round}:${phaseToken(s)}`:null;}
 reset(s){this.entries=[];if(s)this.capture(s);}
 capture(s){
  const key=this.key(s);if(!key||this.entries.at(-1)?.key===key)return;
  const snapshot=structuredClone(s),bytes=new TextEncoder().encode(JSON.stringify(snapshot)).length;
  if(bytes>this.maxBytes){this.entries=[];return;}
  this.entries.push({key,snapshot,bytes});
  while(this.entries.length>this.limit||this.entries.reduce((n,e)=>n+e.bytes,0)>this.maxBytes)this.entries.shift();
 }
 observe(before,after){if(before?.roomId!==after.roomId)this.reset(after);else this.capture(after);}
 target(s){const i=this.entries.findLastIndex(e=>e.key===this.key(s));return i>0?this.entries[i-1]:null;}
 summary(s){const target=this.target(s);return target?{available:true,player:target.snapshot.turn,phase:target.snapshot.phase}:{available:false};}
 commitRewind(s){const i=this.entries.findLastIndex(e=>e.key===this.key(s));if(i>=0)this.entries=this.entries.slice(0,i+1);}
 rewind(s){
  const target=this.target(s);if(!target)throw new Error('没有可撤回的上一阶段；恢复存档后需先经过一个阶段');
  const next=structuredClone(target.snapshot);next.rev=s.rev+1;next.presentationResetRev=next.rev;
  if(next.flow){next.flow.paused=!next.tableExperience;if(next.flow.drawCompleted)next.flow.drawCompleted.readyAt=Date.now()+1500;}
  if(next.tableExperience)next.players.find(p=>p.id===next.turn).autoAdvanceEnabled=false;
  next.logs.push({rev:next.rev,category:'correction',text:'房主调试：撤回到上一阶段开始，已暂停自动推进。已公开的信息无法收回。'});
  return next;
 }
}
