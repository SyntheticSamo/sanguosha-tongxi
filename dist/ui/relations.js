import {CARD_MAP} from '../data/cards.js';
const ns='http://www.w3.org/2000/svg',esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class Relations{
 constructor(scene){this.scene=scene;this.arena=document.querySelector('.table-arena');this.svg=document.createElementNS(ns,'svg');this.svg.id='relation-lines';this.svg.setAttribute('aria-hidden','true');this.arena.append(this.svg);this.buttons=document.createElement('div');this.buttons.className='chain-access';this.arena.append(this.buttons);
  for(const type of ['pointerover','focusin'])document.addEventListener(type,e=>{const el=e.target.closest('[data-play],[data-seat]');this.highlight=el?.dataset.play||el?.dataset.seat;});
  for(const type of ['pointerout','focusout'])document.addEventListener(type,e=>{if(!e.relatedTarget?.closest?.('[data-play],[data-seat]'))this.highlight=null;});
 }
 point(el){if(!el)return null;const r=el.getBoundingClientRect(),a=this.arena.getBoundingClientRect();if(!r.width||!r.height)return null;return {x:r.x+r.width/2-a.x,y:r.y+r.height/2-a.y,w:r.width,h:r.height};}
 seat(id){return this.point(document.querySelector(`[data-seat="${CSS.escape(id||'')}"]`));}
 card(id){const el=document.querySelector(`#table-effects [data-play="${CSS.escape(id||'')}"]`)||document.querySelector(`#center-plays [data-play="${CSS.escape(id||'')}"]`);return el?.checkVisibility()?this.point(el):null;}
 line(a,b,cls){if(!a||!b)return '';const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<8)return '';const edge=p=>Math.min(p.w/2/(Math.abs(dx)/len||1e-6),p.h/2/(Math.abs(dy)/len||1e-6)),s=Math.min(len*.4,edge(a)+2),t=Math.min(len*.4,edge(b)+5),x=a.x+dx/len*s,y=a.y+dy/len*s,ex=b.x-dx/len*t,ey=b.y-dy/len*t;return `<path class="${cls}" d="M ${x} ${y} L ${ex} ${ey}" marker-end="url(#relation-head)"/>`;}
 start(){cancelAnimationFrame(this.frame);if(!this.scene.v.tableExperience){this.svg.innerHTML='';this.buttons.innerHTML='';return;}this.draw();}
 draw(){
  const v=this.scene.v;if(!v?.tableExperience||document.getElementById('game').hidden)return;
  const plays=v.centerPlays||[],struck=new Set(),canceledEffects=new Map(),chains=new Map();for(const p of plays)if(p.chainId){if(!chains.has(p.chainId))chains.set(p.chainId,[]);chains.get(p.chainId).push(p);}
  for(const list of chains.values()){list.slice(0,-1).forEach(p=>struck.add(p.id));if(list.length%2){const base=list[0].parentId;if(!canceledEffects.has(base))canceledEffects.set(base,new Set());canceledEffects.get(base).add(list[0].effectTarget);}}
  let html='<defs><marker id="relation-head" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L6 3Z" fill="context-stroke"/></marker></defs>';
  for(const p of plays){const card=this.card(p.id);if(!card)continue;const hot=this.highlight===p.id||this.highlight===p.actor||this.selected===p.id||this.scene.ui.current().selectedTargets.includes(p.actor),canceled=struck.has(p.id);
   html+=this.line(this.seat(p.actor),card,'relation source'+(hot?' highlighted':''));
   if(p.parentId){html+=this.line(card,this.card(p.parentId),'relation effect'+(canceled?' canceled':''));continue;}
   const targets=[...new Set([...(p.targets||[]),...(p.actualTargets||[])])];for(const target of targets){const active=(v.pending?.effect?.target||v.pending?.player)===target;html+=this.line(card,this.seat(target),'relation effect'+(active?' resolving':'')+(canceled||canceledEffects.get(p.id)?.has(target)||p.canceledTargets?.includes(target)?' canceled':''));}
  }
  const selection=this.scene.ui.current().selection,targets=this.scene.ui.current().selectedTargets;if(selection.ids.length&&!this.scene.ui.gesture?.active){const card=this.point(document.querySelector(`#hand [data-card="${CSS.escape(selection.ids[0])}"]`));html+=this.line(this.seat(v.you),card,'relation source highlighted');for(const id of targets)html+=this.line(card,this.seat(id),'relation effect draft');}
  const chained=v.players.filter(p=>p.chained&&!p.dead);if(chained.length>1)for(let i=0;i<(chained.length===2?1:chained.length);i++){const a=this.seat(chained[i].id),b=this.seat(chained[(i+1)%chained.length].id);html+=this.line(a,b,'chain-link');}
  if(html!==this.html){this.svg.innerHTML=html;this.html=html;}
  const key=chained.map(p=>p.id).join(',');if(key!==this.chainKey){this.chainKey=key;this.buttons.innerHTML=chained.map(p=>`<button class="chain-inspect" data-ui="chain-info" data-player="${esc(p.id)}" aria-label="查看${esc(p.name)}的横置来源及铁索效果">⛓</button>`).join('');}
  for(const b of this.buttons.children){const p=this.seat(b.dataset.player);if(p){b.style.left=p.x+'px';b.style.top=p.y-p.h/2-12+'px';}}
  this.scene.effects.position();this.scene.positionResponse();this.scene.ui.updateAim?.();this.frame=requestAnimationFrame(()=>this.draw());
 }
 control(name,b){if(name!=='chain-info')return false;const v=this.scene.v,p=v.players.find(p=>p.id===b.dataset.player),origin=v.chainOrigins?.[p.id],record=[...(v.centerPlays||[]),...(v.playHistory||[])].find(r=>r.id===origin?.recordId);this.scene.ui.detail(`${p.name} · 横置`,`${origin?`${v.players.find(p=>p.id===origin.actor)?.name||'玩家'}${origin.source?' · '+origin.source:' 使用'+CARD_MAP[origin.kind].name}${record?' · 第'+record.round+'轮':''}`:'横置状态（旧档或外部纠正未记录来源）'}\n${CARD_MAP.tiesuo.rule}\n横置角色共同构成铁索网络；属性伤害按规则传导。`);return true;}
}
