import {CARD_BY_ID} from '../data/cards.js';
const $=id=>document.getElementById(id),sel=s=>CSS.escape(s||'');
const center=el=>{if(!el)return null;const r=el.getBoundingClientRect();const transform=getComputedStyle(el).transform,m=transform==='none'?null:new DOMMatrixReadOnly(transform);return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2,w:el.offsetWidth||r.width,h:el.offsetHeight||r.height,rotation:m?Math.atan2(m.b,m.a)*180/Math.PI:0}:null;};

// This ledger delays presentation only. The snapshot and response legality stay authoritative.
export class TableMotion{
 constructor(scene){this.scene=scene;this.pending=new Set();this.seen=new Set();this.queue=[];this.active=new Set();this.cache=new Map();this.next=0;}
 get v(){return this.scene.v;}
 waitingFor(owner){return [...this.queue,...this.active].filter(j=>j.e.to.owner===owner&&j.e.to.zone==='hand').length;}
 capture(){
  this.cache.clear();const oldCenter=center($('center-plays'));if(oldCenter)this.cache.set('$center',{x:oldCenter.x+scrollX,y:oldCenter.y+scrollY});for(const el of document.querySelectorAll('[data-card-anchor],[data-card],[data-effect-card],[data-play],[data-choice-id]')){const p=el.checkVisibility()?center(el):null;if(p){p.x+=scrollX;p.y+=scrollY;for(const key of [el.dataset.cardAnchor,el.dataset.card,el.dataset.effectCard,el.dataset.play,el.dataset.choiceId])if(key)this.cache.set(key,p);}}
 }
 clear(){this.seen.clear();cancelAnimationFrame(this.frame);this.frame=null;for(const j of this.active)j.el.remove();this.active.clear();this.queue=[];this.pending.clear();this.next=0;}
 prepare(old,animate){
  this.capture();const v=this.v,opening=this.scene.openingRequested&&v.flow?.opening;
  if(this.scene.reduceMotion&&animate)for(const e of v.cardEvents||[])if(!this.seen.has(e.id)&&e.rev>(old?.rev??v.rev)&&e.type==='effect')this.scene.effects.animate(e);
  if(!animate&&!opening||this.scene.reduceMotion){this.clear();this.seen=new Set((v.cardEvents||[]).map(e=>e.id));return;}
  if(old?.flow?.opening&&!v.flow?.opening){for(const j of [...this.active,...this.queue])if(j.e.cause==='setup'){j.el?.remove();this.active.delete(j);if(j.arrival)this.pending.delete(j.id);}this.queue=this.queue.filter(j=>j.e.cause!=='setup');}
  const hand=v.players.find(p=>p.id===v.you)?.hand||[];
  for(const id of this.pending)if(!hand.includes(id))this.pending.delete(id);
  this.queue=this.queue.filter(j=>!j.arrival||hand.includes(j.id));

  for(const j of [...this.active])if(j.arrival&&!hand.includes(j.id)){j.el.remove();this.active.delete(j);}
  for(const e of v.cardEvents||[]){if(this.seen.has(e.id))continue;this.seen.add(e.id);if(!opening&&e.rev<=(old?.rev??v.rev))continue;
   if(e.type==='play'&&['shan','jiu'].includes(e.kind))this.scene.effects.animate({...e,effectTarget:e.actor});
   if(e.type==='effect'){this.scene.effects?.animate(e);continue;}
   const count=e.type==='archive'?1:e.type==='play'?1:['deck','discard'].includes(e.to.zone)?Math.min(3,e.count):e.count;if(!count)continue;
   for(let i=0;i<count;i++){
    const id=e.cards[i]||null,arrival=e.type!=='show'&&e.to.zone==='hand'&&e.to.owner===v.you&&id&&hand.includes(id);
    if(e.to.zone==='hand'&&e.to.owner===v.you&&id&&!hand.includes(id))continue;
    if(arrival){for(const j of [...this.active,...this.queue])if(j.arrival&&j.id===id){j.el?.remove();this.active.delete(j);this.queue=this.queue.filter(t=>t!==j);}this.pending.add(id);}
    const cached=e.from.zone==='deck'?null:this.cache.get(e.choiceId)||this.cache.get(e.recordId)||this.cache.get(id)||(e.type==='archive'?this.cache.get('$center'):null),j={e,id,i,arrival,total:e.count>count?e.count:0,showTotal:i===count-1,cached:cached?{...cached}:null};
    this.queue.push(j);
   }
  }
  for(const p of v.players)if(p.id!==v.you){let excess=this.waitingFor(p.id)-p.handCount;for(const j of [...this.active,...this.queue])if(excess>0&&j.e.to.zone==='hand'&&j.e.to.owner===p.id){j.el?.remove();this.active.delete(j);this.queue=this.queue.filter(t=>t!==j);excess--;}}
  const archiveCounts=new Map();for(const j of this.queue)if(j.e.type==='archive')archiveCounts.set(j.e.actor,(archiveCounts.get(j.e.actor)||0)+1);const archiveKept=new Map();this.queue=this.queue.filter(j=>{if(j.e.type!=='archive')return true;const n=(archiveKept.get(j.e.actor)||0)+1;archiveKept.set(j.e.actor,n);j.total=archiveCounts.get(j.e.actor);j.showTotal=n===3;return n<=3;});
  if(this.seen.size>512)this.seen=new Set((v.cardEvents||[]).map(e=>e.id));
  // An overloaded display falls back to current state; it never delays rule resolution.
  while(this.queue.length>96){const j=this.queue.shift();if(j.arrival)this.pending.delete(j.id);}
 }
 point(p,j,destination=false){
  let el;const id=j.id,own=p.owner===this.v.you;
  if(p.zone==='deck'||p.zone==='discard')el=document.querySelector(`[data-pile="${p.zone}"]`);
  else if(p.zone==='hand'&&own&&destination)el=document.querySelector(`#hand [data-card-anchor="${sel(id)}"]`);
  else if(p.zone==='hand')el=document.querySelector(`[data-hand-anchor="${sel(p.owner)}"]`);
  else if(p.zone==='history')el=document.querySelector(`[data-play-anchor="${sel(p.owner)}"]`);
  else if(p.zone==='equip')el=document.querySelector(`[data-seat="${sel(p.owner)}"] [data-card="${sel(id)}"]`)||document.querySelector(`[data-seat="${sel(p.owner)}"] .gear-slots`);
  else if(p.zone==='judge')el=document.querySelector(`[data-seat="${sel(p.owner)}"] .judge-zone [data-card="${sel(id)}"]`)||document.querySelector(`[data-seat="${sel(p.owner)}"] .judge-zone`);
  else if(p.zone==='judgeReveal')el=document.querySelector(`[data-judge-anchor="${sel(p.owner)}"]`);
  else if(p.zone==='wood'){const holder=this.v.players.find(t=>t.id===p.owner),treasure=holder?.wood?.treasure||holder?.equip.find(id=>CARD_BY_ID[id].kind==='muniu');el=document.querySelector(`[data-seat="${sel(p.owner)}"] [data-card="${sel(treasure)}"]`);}
  else if(p.zone==='pool')el=document.querySelector(`[data-effect-card="${sel(id)}"]`)||document.querySelector(`[data-play="${sel(j.e.recordId)}"]`)||$('center-plays');
  else if(p.zone==='play'||p.zone==='center')el=document.querySelector(`[data-play="${sel(j.e.type==='play'?j.e.id:j.e.recordId)}"]`)||$('center-plays');
  else el=own?$('hand'):document.querySelector(`[data-hand-anchor="${sel(p.owner)}"]`);
  return center(el)||center($('center-plays'));
 }
 start(){if(this.frame||!this.queue.length&&!this.active.size)return;this.frame=requestAnimationFrame(t=>this.tick(t));}
 tick(now){
  this.frame=null;if(this.scene.reduceMotion){this.clear();this.scene.ui.refresh();return;}
  for(const j of [...this.active])if(now-j.start>=j.duration){j.el.remove();this.active.delete(j);if(j.arrival){this.pending.delete(j.id);this.scene.ui.refresh();}}
  const ready=this.queue.findIndex(j=>!j.id||![...this.active].some(a=>a.id===j.id));
  if(ready>=0&&this.active.size<3&&now>=this.next){
   const [j]=this.queue.splice(ready,1),e=j.e,el=document.createElement('div');j.el=el;j.start=now;j.duration=this.scene.motionChoice==='fast'?260:e.cause==='setup'?600:620;
   if(e.type==='play'&&e.chainId)this.scene.counterEffect(e);
   j.from=j.cached?{...j.cached,x:j.cached.x-scrollX,y:j.cached.y-scrollY}:this.point(e.from,j);if(!j.from)j.from={x:innerWidth/2,y:innerHeight/2};j.docFrom={x:j.from.x+scrollX,y:j.from.y+scrollY};
   el.className='flying-card '+(j.id?'face-up':'card-back');el.dataset.motionEvent=e.id;
   const c=CARD_BY_ID[j.id],kind=e.type==='play'||e.type==='archive'?e.kind:c?.kind;
   el.innerHTML=kind?this.scene.cardFace(kind,j.id):'<span class="flight-back">同席</span>';if(j.total>3&&j.showTotal){const total=document.createElement('b');total.className='flight-total';total.textContent='×'+j.total;el.append(total);}
   $('motion-layer').append(el);this.active.add(j);this.next=(this.next&&this.next>=now-250?this.next:now)+(this.scene.motionChoice==='fast'?90:200);
  }
  let landed=false;
  for(const j of [...this.active]){
   const raw=Math.min(1,(now-j.start)/j.duration),t=1-Math.pow(1-raw,3),to=this.point(j.e.to,j,true)||j.from,from={x:j.docFrom.x-scrollX,y:j.docFrom.y-scrollY};
   const width=Math.max(14,Math.min(100,(j.from.w||51)+((to.w||51)-(j.from.w||51))*t)),height=Math.max(20,Math.min(140,(j.from.h||70)+((to.h||70)-(j.from.h||70))*t));j.el.style.width=width+'px';j.el.style.height=height+'px';
   j.el.style.left=from.x+(to.x-from.x)*t+'px';j.el.style.top=from.y+(to.y-from.y)*t-25*Math.sin(Math.PI*raw)+'px';j.el.style.transform=`translate(-50%,-50%) rotate(${(1-t)*(j.from.rotation||-8)+t*(to.rotation||0)}deg)`;
   if(raw===1){j.el.remove();this.active.delete(j);if(j.arrival){this.pending.delete(j.id);landed=true;}}
  }
  if(landed)this.scene.ui.refresh();
  this.updateBadges();if(this.queue.length||this.active.size)this.start();
 }
 updateBadges(){for(const p of this.v.players){const count=this.waitingFor(p.id),el=document.querySelector(`[data-hand-anchor="${sel(p.id)}"]`);const backs=el?.querySelector('.card-backs');if(backs)backs.innerHTML=Array.from({length:Math.min(3,Math.max(0,p.handCount-count))},()=>'<i></i>').join('');el?.querySelector('.in-transit')?.remove();if(count&&el){const b=document.createElement('small');b.className='in-transit';b.textContent=`↘${count}`;b.title='正在到位';el.append(b);}}}
}
