import {CARD_BY_ID,CARD_MAP,SUITS} from '../data/cards.js';
import {CARD_PRESENTATION} from '../data/card-presentation.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class TableEffects{
 constructor(scene){this.scene=scene;this.key=null;const node=document.createElement('section');node.id='table-effects';node.setAttribute('aria-label','桌面牌效与选牌');document.querySelector('.table-arena').append(node);this.node=node;}
 get v(){return this.scene.v;}
 render(){
  const v=this.v,q=v.pending,player=id=>v.players.find(p=>p.id===id),record=(v.centerPlays||[]).findLast(p=>q?.kind==='market'?p.kind==='wugu':['shun','chai'].includes(p.kind)),recordLink=record?`<button data-ui="center-card" data-play="${esc(record.id)}" data-actor="${esc(record.actor)}" class="effect-origin">${CARD_MAP[record.kind].name} ⓘ</button>`:'',face=id=>this.scene.cardFace(CARD_BY_ID[id].kind,id);let html='';
  if(q?.kind==='market'){
   html=`<div class="effect-fan market-fan" data-window="${esc(q.windowId)}"><small>${recordLink} ${esc(player(q.player)?.name)} · 拾取一张</small><div class="effect-fan-cards">${q.available.map((id,i)=>`<button class="effect-choice" style="--deal:${i*160}ms" data-effect-card="${id}" data-face="${CARD_BY_ID[id].kind}" data-ui="effect-pick" data-card-id="${id}" ${q.player!==v.you||this.scene.ui.busy?'disabled':''} aria-label="拾取${CARD_MAP[CARD_BY_ID[id].kind].name}">${face(id)}</button>`).join('')}</div></div>`;
  }else if(q?.kind==='chooseCard'){
   const target=player(q.target);if(q.player===v.you)html=`<div class="effect-fan target-fan" data-target-owner="${esc(q.target)}" data-window="${esc(q.windowId)}"><small>${recordLink} ${esc(target.name)} · ${q.operation==='steal'?'抽取':'弃置'}一张</small><div class="effect-fan-cards">${(q.handChoices||[]).map((id,i)=>`<button class="effect-choice card-back" data-ui="effect-pick" data-choice-id="${esc(id)}" data-zone="hand" aria-label="背面手牌 ${i+1}" ${this.scene.ui.busy?'disabled':''}>同席</button>`).join('')}${['equip','judge'].flatMap(zone=>target[zone].map(id=>`<button class="effect-choice" data-effect-card="${id}" data-ui="effect-pick" data-zone="${zone}" data-card-id="${id}" data-face="${CARD_BY_ID[id].kind}" aria-label="${zone==='equip'?'装备':'判定'} ${CARD_MAP[CARD_BY_ID[id].kind].name}" ${this.scene.ui.busy?'disabled':''}>${face(id)}</button>`)).join('')}</div></div>`;
  }else if(q?.kind==='firePay'&&q.shown){html=`<div class="revealed-suit" data-target-owner="${esc(q.target)}"><span>${this.scene.cardFace(CARD_BY_ID[q.shown].kind,q.shown)}</span><b>火攻 · ${SUITS[q.suit]}</b></div>`;}
  else if(q?.kind==='pindian'&&(q.selected||[]).length)html='<div class="pindian-backs" aria-label="已提交的拼点牌，双方提交后同时公开">'+q.selected.map(()=>'<i class="card-back">同席</i>').join('')+'</div>';
  if(!html&&q?.kind==='skill'&&q.player===v.you&&q.zone==='public'&&!q.stage?.startsWith('complete:')&&(v.publicTableCards||v.pool).length)html='<div class="effect-fan"><div class="effect-fan-cards">'+(v.publicTableCards||v.pool).map(id=>`<button class="effect-choice" data-card="${id}" data-zone="pool" data-effect-card="${id}" data-face="${CARD_BY_ID[id].kind}">${face(id)}</button>`).join('')+'</div></div>';
  const extras=q?.kind==='skill'&&q.player===v.you?(q.cardChoices||[]).filter(id=>!player(v.you).hand.includes(id)):this.scene.ui.armedSkill&&['急袭','清侧'].includes(this.scene.ui.armedSkill)?player(v.you).skillState?.zones?.[this.scene.ui.armedSkill==='急袭'?'field':'honor']?.cards||[]:[];
  if(!html&&extras.length)html='<div class="effect-fan material-fan"><small>可选材料</small><div class="effect-fan-cards">'+extras.map(id=>`<span class="material-candidate"><button class="effect-choice ${this.scene.ui.current().selection.ids.includes(id)?'selected':''}" data-card="${id}" data-zone="${q?.kind==='skill'?'decision':'special'}" data-owner="${esc(v.you)}" data-face="${CARD_BY_ID[id].kind}" data-face-id="${id}" data-effect-card="${id}">${face(id)}</button><button class="material-info" data-ui="card-info" data-kind="${CARD_BY_ID[id].kind}" data-id="${id}" aria-label="材料牌详情">ⓘ</button></span>`).join('')+'</div></div>';
  if(!html&&v.publicTableCards?.length)html='<div class="effect-fan public-reveal"><small>'+esc(q?.kind==='skill'?q.skill+' · 公开亮牌':'公开亮牌')+'</small><div class="effect-fan-cards">'+v.publicTableCards.map(id=>`<button class="effect-choice" data-effect-card="${id}" data-ui="card-info" data-kind="${CARD_BY_ID[id].kind}" data-id="${id}" data-face="${CARD_BY_ID[id].kind}">${face(id)}</button>`).join('')+'</div></div>';
  if(!html&&this.resultUntil>Date.now()&&this.resultData?.kind==='pindian'){const r=this.resultData;html=`<div class="effect-fan pindian-result"><small>${esc(player(r.source)?.name)} · ${r.winner?'拼点胜':'拼点未赢'}</small><div class="effect-fan-cards">${r.cards.map(id=>`<button class="effect-choice" data-ui="card-info" data-kind="${CARD_BY_ID[id].kind}" data-id="${id}" data-face="${CARD_BY_ID[id].kind}">${face(id)}</button>`).join('')}</div></div>`;}
  const key=q?.windowId||`${q?.kind}:${q?.player}:${q?.shown}`;this.node.classList.toggle('same-window',key===this.key);this.key=key;this.node.innerHTML=html;
  $('game-stage').classList.toggle('has-table-choice',!!html);this.position();
 }
 result(old,animate){
  const r=this.v.lastResult;if(!animate||!r||JSON.stringify(r)===JSON.stringify(old?.lastResult))return;
  if(r.kind==='pindian'){this.resultData=r;this.resultUntil=Date.now()+2500;setTimeout(()=>{this.resultUntil=0;this.render();},2500);}
  if(r.kind==='judge'){const anchor=document.querySelector(`[data-judge-anchor="${CSS.escape(r.player||this.v.you)}"]`);if(anchor){const b=document.createElement('span');b.className='judge-confirmed';const result=r.purpose==='le'&&!r.success?'跳过出牌':r.purpose==='bingliang'&&!r.success?'跳过摸牌':r.purpose==='shandian'?(r.success?'闪电命中':'闪电传递'):'判定已确认';b.textContent=result;anchor.append(b);setTimeout(()=>b.remove(),1600);}}
 }
 position(){
  const el=this.node.querySelector('[data-target-owner]');if(!el)return;const seat=document.querySelector(`[data-seat="${CSS.escape(el.dataset.targetOwner)}"]`),arena=this.node.parentElement;if(!seat)return;const a=arena.getBoundingClientRect(),r=seat.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight;
  const x=Math.max(w/2+4,Math.min(a.width-w/2-4,r.x+r.width/2-a.x)),above=r.y-a.y-h-10,below=r.bottom-a.y+10;
  el.style.left=x+'px';el.style.top=Math.max(5,Math.min(a.height-h-5,above>=5?above:below))+'px';
 }
 animate(e){
  if(!e.kind)return;requestAnimationFrame(()=>{
   if(e.stage==='resolved'&&e.effectTarget===this.v.you){document.querySelectorAll('.effect-notice').forEach(n=>n.remove());const hint=document.createElement('span');hint.className='effect-notice';hint.textContent=`${CARD_MAP[e.kind].name}对你生效`;$('response-panel').before(hint);setTimeout(()=>hint.remove(),1800);}
   if(this.scene.reduceMotion||e.stage==='resolved')return;
   const family=e.kind==='huogong'&&this.v.pending?.kind==='fireShow'?'reveal':CARD_PRESENTATION[e.kind]?.family||'equipment',target=e.effectTarget||e.actor,seat=document.querySelector(`[data-seat="${CSS.escape(target||'')}"]`);if(!seat)return;
   const el=document.createElement('span');el.className=`card-effect effect-${family}${e.stage==='canceled'?' effect-canceled':''}`;el.setAttribute('aria-hidden','true');
   const svg={arrows:'<path d="M10 0L35 35M26 34L36 36L35 25M40 0L65 35M56 34L66 36L65 25M70 0L95 35M86 34L96 36L95 25"/>',ripple:'<circle cx="50" cy="30" r="12"/><circle cx="50" cy="30" r="23"/>',fire:'<path d="M50 1C75 25 80 41 64 53C77 30 51 35 55 17C38 33 34 43 43 53C14 43 34 25 36 13C41 24 45 20 50 1Z"/>',thunder:'<path d="M63 1L31 32L49 31L37 59L70 23L52 24Z"/>',slash:'<path d="M23 53L72 4L52 36Z"/>',shield:'<path d="M50 3L75 14L72 40L50 57L28 40L25 14Z"/>'};
   el.innerHTML=svg[family]?'<svg viewBox="0 0 100 60" class="effect-symbol">'+svg[family]+'</svg>':{slash:'╱',fire:'♨',thunder:'ϟ',shield:'⬡',heal:'✚',wine:'酒',ripple:'◎',arrows:'↘ ↘ ↘',duel:'⚔',borrow:'⚔ →',draw:'▤ ▤',steal:'↗',dismantle:'╳',delay:'◷','thunder-delay':'ϟ',equipment:'◇',wood:'◇ ▤',chain:'⛓',counter:'╱'}[family]||'◇';seat.append(el);setTimeout(()=>el.remove(),this.scene.motionChoice==='fast'?450:1100);

  });
 }
 control(name,b){if(name!=='effect-pick')return false;const q=this.v.pending;if(!q||this.scene.ui.busy)return true;this.scene.ui.hooks.dispatch('pickEffect',{windowId:q.windowId,zone:b.dataset.zone,choiceId:b.dataset.choiceId,card:b.dataset.cardId});return true;}
}
