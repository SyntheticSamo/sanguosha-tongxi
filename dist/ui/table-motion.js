import {PresentationTimeline} from './presentation-timeline.js';
import {CARD_BY_ID} from '../data/cards.js';
const $=id=>document.getElementById(id),sel=s=>CSS.escape(s||'');
const center=el=>{if(!el)return null;const r=el.getBoundingClientRect();const transform=getComputedStyle(el).transform,m=transform==='none'?null:new DOMMatrixReadOnly(transform);return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2,w:el.offsetWidth||r.width,h:el.offsetHeight||r.height,rotation:m?Math.atan2(m.b,m.a)*180/Math.PI:0}:null;};

// This ledger delays presentation only. The snapshot and response legality stay authoritative.
export class TableMotion{
 constructor(scene){this.scene=scene;this.pending=new Set();this.pendingPlays=new Set();this.pendingDisplays=new Set();this.pendingZones=new Set();this.seen=new Set();this.queue=[];this.active=new Set();this.cache=new Map();this.next=0;this.timeline=new PresentationTimeline(detail=>document.dispatchEvent(new CustomEvent('tongxi:presentation',{detail:{...detail,time:performance.now()}})));this.timers=new Set();this.groups=new Map();}
 get v(){return this.scene.v;}
 waitingFor(owner){return [...this.queue,...this.active].filter(j=>j.e.to.owner===owner&&j.e.to.zone==='hand').length;}
 capture(){
  this.cache.clear();const draft=document.querySelector('.draft-card'),dp=center(draft);if(dp){dp.x+=scrollX;dp.y+=scrollY;for(const id of draft.dataset.draftMaterial.split(','))this.cache.set(id,dp);}const oldCenter=center($('center-plays'));if(oldCenter)this.cache.set('$center',{x:oldCenter.x+scrollX,y:oldCenter.y+scrollY});for(const el of document.querySelectorAll('[data-card-anchor],[data-card],[data-effect-card],[data-play],[data-choice-id]')){const p=el.checkVisibility()?center(el):null;if(p){p.x+=scrollX;p.y+=scrollY;if(el.dataset.effectCard)this.cache.set('$effect:'+el.dataset.effectCard,p);for(const key of [el.dataset.cardAnchor,el.dataset.card,el.dataset.effectCard,el.dataset.play,el.dataset.choiceId])if(key)this.cache.set(key,p);}}const actors=new Set([...document.querySelectorAll('#center-plays [data-actor]')].map(el=>el.dataset.actor));for(const actor of actors){const els=[...document.querySelectorAll(`#center-plays [data-actor="${sel(actor)}"]`)].filter(el=>el.checkVisibility()).slice(-3);els.forEach((el,i)=>{const p=center(el);if(p){p.x+=scrollX;p.y+=scrollY;this.cache.set(`$archive:${actor}:${i}`,p);}});}if(dp)for(const id of draft.dataset.draftMaterial.split(','))this.cache.set(id,dp);
 }
 clear(){for(const t of this.timers)clearTimeout(t);this.timers.clear();this.clockTasks=[];this.timeline.clear();this.lastNode=null;this.groups.clear();this.seen.clear();cancelAnimationFrame(this.frame);this.frame=null;for(const j of this.active)j.el.remove();this.active.clear();this.queue=[];this.pending.clear();this.pendingPlays.clear();this.pendingDisplays.clear();this.pendingZones.clear();document.querySelectorAll('.pending-play,.zone-arrival').forEach(e=>e.classList.remove('pending-play','zone-arrival'));this.next=0;}
 prepare(old,animate){
  this.capture();const v=this.v,opening=this.scene.openingRequested&&v.flow?.opening;
  if(this.scene.reduceMotion&&animate)for(const e of v.cardEvents||[])if(!this.seen.has(e.id)&&e.rev>(old?.rev??v.rev)&&e.type==='effect')this.scene.effects.animate(e);
  if(!animate&&!opening||this.scene.reduceMotion){this.clear();this.seen=new Set((v.cardEvents||[]).map(e=>e.id));return;}
  if(old?.flow?.opening&&!v.flow?.opening){for(const j of [...this.active,...this.queue])if(j.e.cause==='setup'){j.el?.remove();if(j.displayArrival)this.pendingDisplays.delete(j.id);this.active.delete(j);if(j.arrival)this.pending.delete(j.id);}this.queue=this.queue.filter(j=>j.e.cause!=='setup');}
  const hand=v.players.find(p=>p.id===v.you)?.hand||[];
  for(const id of this.pending)if(!hand.includes(id))this.pending.delete(id);
  const currentZone=j=>!j.zoneArrival||v.players.find(p=>p.id===j.e.to.owner)?.[j.e.to.zone]?.includes(j.id);
  for(const id of this.pendingZones)if(!v.players.some(p=>p.equip.includes(id)||p.judge.includes(id)))this.pendingZones.delete(id);
  for(const j of this.queue)if(!currentZone(j))this.pendingZones.delete(j.id);
  this.queue=this.queue.filter(j=>(!j.arrival||hand.includes(j.id))&&currentZone(j));
  for(const j of [...this.active])if(!currentZone(j)){j.el.remove();this.active.delete(j);this.pendingZones.delete(j.id);}

  for(const j of [...this.active])if(j.arrival&&!hand.includes(j.id)){j.el.remove();this.active.delete(j);}
  for(const e of v.cardEvents||[]){if(this.seen.has(e.id))continue;this.seen.add(e.id);if(!opening&&e.rev<=(old?.rev??v.rev))continue;
   if(e.type==='play')this.pendingPlays.add(e.id);
   if(e.type==='effect')continue;
   const count=e.type==='archive'?Math.min(3,e.count):e.type==='play'?Math.max(1,Math.min(3,e.cards.length)):['deck','discard'].includes(e.to.zone)?Math.min(3,e.count):e.count;if(!count)continue;
   for(let i=0;i<count;i++){
    const archiveRecord=e.type==='archive'?(old?.centerPlays||[]).filter(p=>p.actor===e.actor).slice(-count)[i]:null,id=archiveRecord?(archiveRecord.cards.length===1?archiveRecord.cards[0]:null):e.cards[i]||null,displayArrival=id&&(e.to.zone==='pool'&&v.pool.includes(id)&&v.pending?.available?.includes(id)||e.to.zone==='judgeReveal'&&e.type==='show');if(displayArrival)this.pendingDisplays.add(id);const arrival=e.type!=='show'&&e.to.zone==='hand'&&e.to.owner===v.you&&id&&hand.includes(id);
    if(e.to.zone==='hand'&&e.to.owner===v.you&&id&&!hand.includes(id))continue;
    if(arrival){for(const j of [...this.active,...this.queue])if(j.arrival&&j.id===id){j.el?.remove();if(j.displayArrival)this.pendingDisplays.delete(j.id);this.active.delete(j);this.queue=this.queue.filter(t=>t!==j);}this.pending.add(id);}
    const zoneArrival=['equip','judge'].includes(e.to.zone)&&id&&v.players.find(p=>p.id===e.to.owner)?.[e.to.zone].includes(id);if(zoneArrival)this.pendingZones.add(id);
    const cached=e.type==='archive'?this.cache.get(`$archive:${e.actor}:${i}`)||this.cache.get(e.recordId)||this.cache.get('$center'):e.from.zone==='pool'?this.cache.get('$effect:'+id)||this.cache.get(e.recordId):['deck','center','play'].includes(e.from.zone)?null:this.cache.get(e.choiceId)||this.cache.get(e.recordId)||this.cache.get(id)||(e.type==='archive'?this.cache.get('$center'):null),j={e,id,i,archiveRecord,material:e.type==='play'&&e.count>1&&!!id,source:e.origins?.find(o=>o.card===id)?{zone:e.origins.find(o=>o.card===id).zone,owner:e.actor}:null,arrival,displayArrival,zoneArrival,total:e.count>count?e.count:0,showTotal:i===count-1,cached:cached?{...cached}:null};
    this.queue.push(j);
   }
  }
  if(old?.turnHistory?.turnId!==v.turnHistory?.turnId){const visible=new Set((v.centerPlays||[]).map(p=>p.id));for(const j of [...this.active,...this.queue])if(j.e.type==='play'&&!visible.has(j.e.id)){j.el?.remove();if(j.displayArrival)this.pendingDisplays.delete(j.id);this.active.delete(j);this.queue=this.queue.filter(t=>t!==j);this.pendingPlays.delete(j.e.id);}}
  for(const p of v.players)if(p.id!==v.you){let excess=this.waitingFor(p.id)-p.handCount;for(const j of [...this.active,...this.queue])if(excess>0&&j.e.to.zone==='hand'&&j.e.to.owner===p.id){j.el?.remove();if(j.displayArrival)this.pendingDisplays.delete(j.id);this.active.delete(j);this.queue=this.queue.filter(t=>t!==j);excess--;}}
  const archiveCounts=new Map();for(const j of this.queue)if(j.e.type==='archive')archiveCounts.set(j.e.actor,j.e.displayCount||((archiveCounts.get(j.e.actor)||0)+1));const archiveKept=new Map();this.queue=this.queue.filter(j=>{if(j.e.type!=='archive')return true;const n=(archiveKept.get(j.e.actor)||0)+1;archiveKept.set(j.e.actor,n);j.total=archiveCounts.get(j.e.actor);j.showTotal=n===3;return n<=3;});
  const oldCards=new Set((old?.cardEvents||[]).map(e=>e.id)),oldHealth=new Set((old?.events||[]).map(e=>e.id));
  const incoming=[...(v.cardEvents||[]).filter(e=>(opening||!oldCards.has(e.id))&&(opening||e.rev>(old?.rev??v.rev))).map(e=>({e,health:false})),...(v.events||[]).filter(e=>!oldHealth.has(e.id)&&e.rev>(old?.rev??v.rev)).map(e=>({e,health:['damage','heal','hp','correction','maxHp'].includes(e.type),generic:!['damage','heal','hp','correction','maxHp'].includes(e.type)}))].sort((a,b)=>(a.e.presentation?.order??a.e.rev*10000)-(b.e.presentation?.order??b.e.rev*10000));
  for(const {e,health,generic}of incoming){const key=e.presentation?.id||`${health||generic?'health':'card'}:${e.id}`,items=this.queue.filter(j=>j.e===e);for(const j of items)j.timelineKey=key;
   this.groups.set(key,{left:items.length,e});
   this.timeline.add(key,{after:e.cause==='setup'||e.type==='archive'?[]:[...(e.presentation?.after||[]),...(this.lastNode?[this.lastNode]:[])],order:e.presentation?.order??e.rev*10000,finish:()=>{if(e.type==='play')this.pendingPlays.delete(e.id);if(e.chainAfter)this.scene.relations.transition(e,true);for(const j of [...this.active,...this.queue])if(j.timelineKey===key)this.finishFlight(j,false);},run:done=>{
    if(items.length){this.groups.get(key).done=done;if(e.type==='judge'&&e.stage==='result'&&v.lastResult?.kind==='judge'&&v.lastResult.card===e.cards[0]){this.scene.effects.judgeOutcome(v.lastResult);for(const j of items)j.notBefore=(this.scene.clock?.now()??performance.now())+180;}return;}
    let duration=0;if(health){this.scene.feedback.health(e);duration=this.scene.reduceMotion?0:450;}else if(e.type==='effect')duration=this.scene.effects.animate(e)||0;
    this.later(()=>{this.groups.delete(key);done();},duration);
   }});this.lastNode=key;
  }
  for(const [key,group]of this.groups)if(group.left>0){group.left=[...this.active,...this.queue].filter(j=>j.timelineKey===key).length;if(!group.left){group.done?.();this.timeline.complete(key);this.groups.delete(key);}}
  if(v.pending&&!['market','chooseCard','judge','judgeAwait','skill'].includes(v.pending.kind)&&v.pending.player===v.you&&v.pending.windowId!==old?.pending?.windowId)this.timeline.flush();
  if(this.seen.size>512)this.seen=new Set((v.cardEvents||[]).map(e=>e.id));
  // An overloaded display falls back to current state; it never delays rule resolution.
  while(this.queue.length>96){const j=this.queue.shift();this.finishFlight(j,false);}
 }
 point(p,j,destination=false){
  let el;const id=j.id,own=p.owner===this.v.you;
  if(p.zone==='deck'||p.zone==='discard')el=document.querySelector(`[data-pile="${p.zone}"]`);
  else if(p.zone==='hand'&&own&&destination)el=document.querySelector(`#hand [data-card-anchor="${sel(id)}"]`);
  else if(p.zone==='hand')el=document.querySelector(`[data-hand-anchor="${sel(p.owner)}"]`);
  else if(p.zone==='history')el=document.querySelector(`[data-play-anchor="${sel(p.owner)}"]`);
  else if(p.zone==='equip')el=document.querySelector(`[data-seat="${sel(p.owner)}"] [data-card="${sel(id)}"]`)||document.querySelector(`[data-seat="${sel(p.owner)}"] [data-slot="${this.scene.slotOf(id)}"]`)||document.querySelector(`[data-seat="${sel(p.owner)}"] .gear-slots`);
  else if(p.zone==='judge')el=document.querySelector(`[data-seat="${sel(p.owner)}"] .judge-zone [data-card="${sel(id)}"]`)||document.querySelector(`[data-seat="${sel(p.owner)}"] .judge-zone`);
  else if(p.zone==='judgeReveal')el=document.querySelector(`.revealed-suit [data-effect-card="${sel(id)}"]`)||document.querySelector(`[data-judge-anchor="${sel(p.owner)}"]`);
  else if(p.zone==='wood'){const holder=this.v.players.find(t=>t.id===p.owner),treasure=holder?.wood?.treasure||holder?.equip.find(id=>CARD_BY_ID[id].kind==='muniu');el=document.querySelector(`[data-seat="${sel(p.owner)}"] [data-card="${sel(treasure)}"]`);}
  else if(p.zone==='pool')el=document.querySelector(`[data-effect-card="${sel(id)}"]`)||document.querySelector(`[data-play="${sel(j.e.recordId)}"]`)||$('center-plays');
  else if(p.zone==='play'||p.zone==='center')el=document.querySelector(`[data-play="${sel(j.e.type==='play'?j.e.id:j.e.recordId)}"]`)||$('center-plays');
  else el=own?$('hand'):document.querySelector(`[data-hand-anchor="${sel(p.owner)}"]`);
  return center(el)||center($('center-plays'));
 }
 start(){if(this.frame||!this.queue.length&&!this.active.size&&!this.timeline.jobs.size)return;this.frame=requestAnimationFrame(t=>this.tick(t));}
 tick(now){
  now=this.scene.clock?.now()??now;for(const item of [...(this.clockTasks||[])])if(now>=item.at){this.clockTasks=this.clockTasks.filter(t=>t!==item);item.fn();}
  this.frame=null;if(this.scene.reduceMotion){this.clear();this.scene.ui.refresh();return;}
  for(const job of this.timeline.ready())this.timeline.start(job.id);
  const ready=this.queue.findIndex(j=>(!j.notBefore||now>=j.notBefore)&&this.timeline.jobs.get(j.timelineKey)?.state==='running'&&(!j.id||![...this.active].some(a=>a.id===j.id))&&!(j.e.to.zone==='equip'&&[...this.active,...this.queue].some(a=>a!==j&&a.e.from.zone==='equip'&&a.e.from.owner===j.e.to.owner&&CARD_BY_ID[a.id]?.kind&&CARD_BY_ID[j.id]?.kind&&this.scene.slotOf(a.id)===this.scene.slotOf(j.id))));
  if(ready>=0&&this.active.size<3&&now>=this.next){
   this.scene.hidePreview();const [j]=this.queue.splice(ready,1),e=j.e,el=document.createElement('div');j.el=el;j.start=now;j.duration=this.scene.motionChoice==='fast'?260:e.to.zone==='hand'?600:e.type==='play'?400:350;

   j.from=j.cached?{...j.cached,x:j.cached.x-scrollX,y:j.cached.y-scrollY}:this.point(j.source||e.from,j);if(!j.from)j.from={x:innerWidth/2,y:innerHeight/2};j.docFrom={x:j.from.x+scrollX,y:j.from.y+scrollY};
   el.className='flying-card '+(j.id?'face-up':'card-back');el.dataset.motionEvent=e.id;
   const c=CARD_BY_ID[j.id],kind=j.archiveRecord?.kind||(j.material?c?.kind:e.kind||c?.kind);
   el.innerHTML=kind?this.scene.cardFace(kind,j.id):'<span class="flight-back">同席</span>';if(j.total>3&&j.showTotal){const total=document.createElement('b');total.className='flight-total';total.textContent='×'+j.total;el.append(total);}
   $('motion-layer').append(el);this.active.add(j);this.next=(this.next&&this.next>=now-250?this.next:now)+(this.scene.motionChoice==='fast'?90:200);
  }
  let landed=false;const finished=[];
  for(const j of [...this.active]){
   const raw=Math.min(1,(now-j.start)/j.duration),t=1-Math.pow(1-raw,3),to=this.point(j.e.to,j,true)||j.from,from={x:j.docFrom.x-scrollX,y:j.docFrom.y-scrollY};
   const width=Math.max(14,Math.min(100,(j.from.w||51)+((to.w||51)-(j.from.w||51))*t)),height=Math.max(20,Math.min(140,(j.from.h||70)+((to.h||70)-(j.from.h||70))*t));j.el.style.width=width+'px';j.el.style.height=height+'px';
   j.el.style.left=from.x+(to.x-from.x)*t+'px';j.el.style.top=from.y+(to.y-from.y)*t-25*Math.sin(Math.PI*raw)+'px';j.el.style.transform=`translate(-50%,-50%) rotate(${(1-t)*(j.from.rotation||-8)+t*(to.rotation||0)}deg) scale(${1+.025*Math.sin(Math.PI*Math.max(0,(raw-.84)/.16))})`;
   if(raw===1){finished.push(j);if(j.arrival||j.displayArrival)landed=true;this.finishFlight(j,true);}
  }
  if(landed)this.scene.ui.refresh();this.scene.feedback.tryHandoff();
  this.updateBadges();if(this.queue.length||this.active.size||this.timeline.jobs.size)this.start();
 }
 later(fn,delay){if(delay&&this.scene.clock){this.clockTasks??=[];this.clockTasks.push({at:this.scene.clock.now()+delay,fn});return;}if(!delay){fn();return;}const t=setTimeout(()=>{this.timers.delete(t);fn();this.start();},this.scene.motionChoice==='fast'?delay*.5:delay);this.timers.add(t);}
 finishFlight(j,animate){
  j.el?.remove();if(j.displayArrival)this.pendingDisplays.delete(j.id);this.active.delete(j);this.queue=this.queue.filter(k=>k!==j);if(j.arrival)this.pending.delete(j.id);if(j.zoneArrival){this.pendingZones.delete(j.id);document.querySelectorAll(`.zone-arrival[data-card="${sel(j.id)}"]`).forEach(el=>el.classList.remove('zone-arrival'));}
  if(animate&&j.e.type!=='play'){this.scene.feedback.landed(j);if(j.e.type==='play')this.scene.effects.playLanded(j.e);}
  this.scene.relations.start();const group=this.groups.get(j.timelineKey);if(group&&--group.left<=0){if(j.e.type==='play'&&!j.e.chainId){this.pendingPlays.delete(j.e.id);if(animate){this.scene.feedback.landed(j);this.scene.effects.playLanded(j.e);}}const duration=animate&&j.e.type==='play'?(j.e.chainId?this.scene.counterEffect(j.e)||1000:100):0;this.later(()=>{if(j.e.type==='play'&&j.e.chainId){this.pendingPlays.delete(j.e.id);this.scene.feedback.landed(j);}group.done?.();this.groups.delete(j.timelineKey);this.scene.relations.start();},duration);}
 }
 updateBadges(){for(const p of this.v.players){const count=this.waitingFor(p.id),el=document.querySelector(`[data-hand-anchor="${sel(p.id)}"]`);const backs=el?.querySelector('.card-backs');if(backs)backs.innerHTML=Array.from({length:Math.min(3,Math.max(0,p.handCount-count))},()=>'<i></i>').join('');el?.querySelector('.in-transit')?.remove();if(count&&el){const b=document.createElement('small');b.className='in-transit';b.textContent=`↘${count}`;b.title='正在到位';el.append(b);}}}
}
