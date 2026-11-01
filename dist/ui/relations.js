import {routeChain,sampleChain} from './chain-geometry.js';
import {CARD_MAP} from '../data/cards.js';
const ns='http://www.w3.org/2000/svg',esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class Relations{
 constructor(scene){this.scene=scene;this.arena=document.querySelector('.table-arena');this.svg=document.createElementNS(ns,'svg');this.svg.id='relation-lines';this.svg.setAttribute('aria-hidden','true');this.arena.append(this.svg);this.buttons=document.createElement('div');this.buttons.className='chain-access';this.arena.append(this.buttons);
  for(const type of ['pointerover','focusin'])document.addEventListener(type,e=>{const el=e.target.closest('[data-play],[data-seat]');this.highlight=el?.dataset.play||el?.dataset.seat;this.start();});
  for(const type of ['scroll','resize'])window.addEventListener(type,()=>this.start(),true);
  for(const type of ['pointerout','focusout'])document.addEventListener(type,e=>{if(!e.relatedTarget?.closest?.('[data-play],[data-seat]')){this.highlight=null;this.start();}});
 }
 reset(){this.shown=null;this.chainAnimations=new Map();this.routes=new Map();cancelAnimationFrame(this.frame);}
 transition(e,instant=false){
  this.shown=new Set(e.chainAfter||this.scene.v.players.filter(p=>p.chained&&!p.dead).map(p=>p.id));if(instant)this.chainAnimations?.clear();
  if(!instant&&!this.scene.reduceMotion){this.chainAnimations??=new Map();for(const id of new Set([...(e.chainBefore||[]),...this.shown]))if((e.chainBefore||[]).includes(id)!==this.shown.has(id))this.chainAnimations.set(id,{start:(this.scene.clock?.now()??performance.now()),added:this.shown.has(id),until:(this.scene.clock?.now()??performance.now())+(this.shown.has(id)?1150:450)*(this.scene.motionChoice==='fast'?.5:1),hit:this.chainAnimations.get(id)?.hit});}
  this.start();
 }
 propagate(id){this.chainAnimations??=new Map();this.chainAnimations.set(id,{start:(this.scene.clock?.now()??performance.now()),until:(this.scene.clock?.now()??performance.now())+1200,added:false,hit:true,hold:true});this.start();}
 point(el){if(!el)return null;const r=el.getBoundingClientRect(),a=this.arena.getBoundingClientRect();if(!r.width||!r.height)return null;return {x:r.x+r.width/2-a.x,y:r.y+r.height/2-a.y,w:r.width,h:r.height};}
 seat(id){return this.point(document.querySelector(`[data-seat="${CSS.escape(id||'')}"]`));}
 card(id){const el=document.querySelector(`#table-effects [data-play="${CSS.escape(id||'')}"]`)||document.querySelector(`#center-plays [data-play="${CSS.escape(id||'')}"]`);if(!el?.checkVisibility())return null;const r=el.getBoundingClientRect(),band=el.closest('#center-plays')?.getBoundingClientRect();if(band&&(r.x+r.width/2<band.left||r.x+r.width/2>band.right||r.y+r.height/2<band.top||r.y+r.height/2>band.bottom))return null;return this.point(el);}
 line(a,b,cls){if(!a||!b)return '';const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<8)return '';const edge=p=>Math.min(p.w/2/(Math.abs(dx)/len||1e-6),p.h/2/(Math.abs(dy)/len||1e-6)),s=Math.min(len*.4,edge(a)+2),t=Math.min(len*.4,edge(b)+5),x=a.x+dx/len*s,y=a.y+dy/len*s,ex=b.x-dx/len*t,ey=b.y-dy/len*t;return `<path class="${cls}" d="M ${x} ${y} L ${ex} ${ey}" marker-end="url(#relation-head)"/>`;}
 start(){cancelAnimationFrame(this.frame);if(!this.scene.v?.tableExperience){this.svg.innerHTML='';this.buttons.innerHTML='';return;}this.draw();}
 draw(){
  const v=this.scene.v;if(!v?.tableExperience||document.getElementById('game').hidden)return;
  const plays=v.centerPlays||[],struck=new Set(),canceledEffects=new Map(),chains=new Map();for(const p of plays)if(p.chainId){if(!chains.has(p.chainId))chains.set(p.chainId,[]);chains.get(p.chainId).push(p);}
  for(const list of chains.values())list.slice(0,-1).forEach(p=>struck.add(p.id));
  for(const p of plays)if(p.canceledTargets?.length)canceledEffects.set(p.id,new Set(p.canceledTargets));
  if(v.pending?.kind==='counter'&&v.pending.negated){const q=v.pending;if(!canceledEffects.has(q.basePlayId))canceledEffects.set(q.basePlayId,new Set());canceledEffects.get(q.basePlayId).add(q.effect.target);}
  let html='<defs><linearGradient id="chain-metal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f0eee2"/><stop offset=".38" stop-color="#9a9e95"/><stop offset=".7" stop-color="#4d554f"/><stop offset="1" stop-color="#c5c4af"/></linearGradient><marker id="relation-head" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L6 3Z" fill="context-stroke"/></marker></defs>';
  for(const p of plays){const card=this.card(p.id);if(!card)continue;const hot=this.highlight===p.id||this.highlight===p.actor||this.selected===p.id||this.scene.ui.current().selectedTargets.includes(p.actor),canceled=struck.has(p.id);
   html+=this.line(this.seat(p.actor),card,'relation source'+(hot?' highlighted':'')+((this.scene.feedback.landedRecords.get(p.id)||0)>(this.scene.clock?.now()??performance.now())?' landed':''));
   const latest=p.id===plays.at(-1)?.id,showEffect=latest||hot;if(!showEffect)continue;const mode=latest?'':' historical';
   if(p.parentId){html+=this.line(card,this.card(p.parentId),'relation effect'+mode+(canceled?' canceled':''));continue;}
   const targets=[...new Set([...(p.targets||[]),...(p.actualTargets||[])])];for(const target of targets){const active=(v.pending?.effect?.target||v.pending?.player)===target;html+=this.line(card,this.seat(target),'relation effect'+mode+(active?' resolving':'')+(canceled||canceledEffects.get(p.id)?.has(target)||p.canceledTargets?.includes(target)?' canceled':''));}
  }
  const now=(this.scene.clock?.now()??performance.now());this.chainAnimations??=new Map();for(const [id,a]of this.chainAnimations)if(now>=a.until)this.chainAnimations.delete(id);
  if(!this.shown||!this.scene.motion.timeline.jobs.size&&!this.chainAnimations.size)this.shown=new Set(v.players.filter(p=>p.chained&&!p.dead).map(p=>p.id));
  const actual=v.players.filter(p=>this.shown.has(p.id)&&!p.dead),ghost=v.players.filter(p=>!this.shown.has(p.id)&&this.chainAnimations.has(p.id)),chained=v.players.filter(p=>actual.includes(p)||ghost.includes(p));
  if(chained.length>1)for(let i=0;i<(chained.length===2?1:chained.length);i++)html+=this.chain(this.seat(chained[i].id),this.seat(chained[(i+1)%chained.length].id),chained[i].id,chained[(i+1)%chained.length].id);
  if(chained.length===1){const p=chained[0],a=this.seat(p.id);if(a){for(const [x,y,horizontal]of [[a.x-a.w/2-10,a.y,false],[a.x+a.w/2+10,a.y,false],[a.x,a.y-a.h/2-10,true],[a.x,a.y+a.h/2+10,true]]){const part=this.chain({x:x-(horizontal?12:0),y:y-(horizontal?0:12),w:0,h:0},{x:x+(horizontal?12:0),y:y+(horizontal?0:12),w:0,h:0},p.id,p.id);if(part){html+=part;break;}}}}
  const draft=this.scene.ui.chainDraft,ts=this.scene.ui.current().selectedTargets;if(draft)for(let i=1;i<ts.length;i++)html+=this.line(this.seat(ts[i-1]),this.seat(ts[i]),'relation effect draft');
  if(draft?.pointer&&ts.length)html+=this.line(this.seat(ts.at(-1)),{...draft.pointer,w:0,h:0},'relation effect draft');
  if(html!==this.html){this.svg.innerHTML=html;this.html=html;}
  const key=actual.map(p=>p.id).join(',');if(key!==this.chainKey){this.chainKey=key;this.buttons.innerHTML='';}
  for(const b of this.buttons.children){const p=this.seat(b.dataset.player);if(p){b.style.left=p.x+'px';b.style.top=p.y+p.h/2-11+'px';b.style.left=p.x-p.w/2+10+'px';}}
  for(const el of this.arena.querySelectorAll('.counter-collision')){const p=this.card(el.dataset.parent);if(p){el.style.left=p.x+'px';el.style.top=p.y+'px';}}
  this.scene.effects.position();this.scene.positionResponse();this.scene.ui.updateAim?.();if(this.scene.ui.gesture?.active||this.scene.motion.active.size||this.scene.motion.queue.length||this.chainAnimations.size||this.arena.getAnimations({subtree:true}).some(a=>a.playState==='running'&&a.effect?.target?.matches?.('.center-card,.seat,.effect-choice'))||[...this.scene.seatAnimations.values()].some(a=>a.playState==='running'))this.frame=requestAnimationFrame(()=>this.draw());
 }
 chain(a,b,aid,bid){
  if(!a||!b)return '';const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,edge=p=>Math.min(p.w/2/(Math.abs(dx)/len||1e-6),p.h/2/(Math.abs(dy)/len||1e-6))+7;
  const start={x:a.x+dx/len*edge(a),y:a.y+dy/len*edge(a)},end={x:b.x-dx/len*edge(b),y:b.y-dy/len*edge(b)},ar=this.arena.getBoundingClientRect();
  const rects=[...document.querySelectorAll('.seat,.gear-slots,.play-slot,.judge-zone,#hand-panel,#response-panel,.effect-fan,.table-center [data-do=phase],#center-plays,.pile-rail')].filter(el=>el.checkVisibility()&&!(el.classList.contains('seat')&&[aid,bid].includes(el.dataset.seat))).map(el=>el.getBoundingClientRect()).map(r=>({left:r.left-ar.left-5,right:r.right-ar.left+5,top:r.top-ar.top-5,bottom:r.bottom-ar.top+5}));
  const key=JSON.stringify([start,end,rects]);this.routes??=new Map();let path=this.routes.get(key);if(!path){path=routeChain(start,end,rects);if(!path.length){const ports=p=>[{x:p.x-p.w/2-7,y:p.y},{x:p.x+p.w/2+7,y:p.y},{x:p.x,y:p.y-p.h/2-7},{x:p.x,y:p.y+p.h/2+7}];const options=[];for(const x of ports(a))for(const y of ports(b)){const route=routeChain(x,y,rects);if(route.length)options.push(route);}options.sort((x,y)=>x.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-x[i].x,p.y-x[i].y),0)-y.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-y[i].x,p.y-y[i].y),0));path=options[0]||[];}if(this.routes.size>24)this.routes.clear();this.routes.set(key,path);}if(!path.length)return '';
  const animation=this.chainAnimations.get(aid)||this.chainAnimations.get(bid),raw=animation?Math.min(1,((this.scene.clock?.now()??performance.now())-animation.start)/(animation.until-animation.start)):1,p=animation?.added?raw:1,fade=animation&&!animation.added&&!animation.hold?1-raw:1;
  const opacity=animation?.hold?.85:animation?raw<.65?.85:.85-(raw-.65)/.35*.65:(this.highlight===aid||this.highlight===bid)?.55:.2;
  const rings=sampleChain(path).filter(r=>!animation?.added||raw>.48||Math.min(r.t,1-r.t)<Math.max(0,(p-.15)/.4)*.5).map((r,i)=>{const sag=path.length===2?Math.sin(Math.PI*r.t)*Math.min(13,len*.025)*(animation?.added&&raw>.62?1+Math.sin((raw-.62)*18)*(1-raw):1):0;return `<ellipse cx="${r.x.toFixed(1)}" cy="${(r.y+sag).toFixed(1)}" rx="4.2" ry="${i%2?1.2:2.8}" fill="none" stroke="url(#chain-metal)" stroke-width="1.2" transform="rotate(${r.angle.toFixed(1)} ${r.x.toFixed(1)} ${(r.y+sag).toFixed(1)})"/>`;}).join('');
  return `<g class="metal-chain${animation?.hit?' transmitting':''}" style="opacity:${(opacity*fade).toFixed(2)}">${rings}</g>`;
 }
 control(name,b){if(name!=='chain-info')return false;const v=this.scene.v,p=v.players.find(p=>p.id===b.dataset.player),origin=v.chainOrigins?.[p.id],record=[...(v.centerPlays||[]),...(v.playHistory||[])].find(r=>r.id===origin?.recordId);this.scene.ui.detail(`${p.name} · 横置`,`${origin?`${v.players.find(p=>p.id===origin.actor)?.name||'玩家'}${origin.source?' · '+origin.source:' 使用'+CARD_MAP[origin.kind].name}${record?' · 第'+record.round+'轮':''}`:'横置状态（旧档或外部纠正未记录来源）'}\n${CARD_MAP.tiesuo.rule}\n横置角色共同构成铁索网络；属性伤害按规则传导。`);return true;}
}
