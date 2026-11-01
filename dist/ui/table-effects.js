import {capturePositions,settlePositions} from './visual-utils.js';
import {CARD_BY_ID,CARD_MAP,SUITS} from '../data/cards.js';
import {CARD_PRESENTATION} from '../data/card-presentation.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class TableEffects{
 constructor(scene){this.scene=scene;this.key=null;const node=document.createElement('section');node.id='table-effects';node.setAttribute('aria-label','桌面牌效与选牌');document.querySelector('.table-arena').append(node);this.node=node;}
 get v(){return this.scene.v;}
 render(){
  const v=this.v,q=v.pending,player=id=>v.players.find(p=>p.id===id),record=(v.centerPlays||[]).findLast(p=>q?.kind==='market'?p.kind==='wugu':['shun','chai'].includes(p.kind)),recordLink=record?`<button data-ui="center-card" data-play="${esc(record.id)}" data-actor="${esc(record.actor)}" class="effect-origin">${CARD_MAP[record.kind].name} ⓘ</button>`:'',face=id=>this.scene.cardFace(CARD_BY_ID[id].kind,id);let html='';
  if(q?.kind==='market'){
   html=`<div class="effect-fan market-fan" data-window="${esc(q.windowId)}"><small>${recordLink} ${esc(player(q.player)?.name)} · 拾取一张</small><div class="effect-fan-cards">${q.available.map((id,i)=>`<button class="effect-choice ${this.scene.motion.pendingDisplays.has(id)?'pending-display':''}" style="--deal:${i*160}ms" data-effect-card="${id}" data-face="${CARD_BY_ID[id].kind}" data-ui="effect-pick" data-card-id="${id}" ${q.player!==v.you||this.scene.ui.busy||this.scene.motion.pendingDisplays.has(id)?'disabled':''} aria-label="拾取${CARD_MAP[CARD_BY_ID[id].kind].name}">${face(id)}</button>`).join('')}</div></div>`;
  }else if(q?.kind==='chooseCard'){
   const target=player(q.target);if(q.player===v.you)html=`<div class="effect-fan target-fan" data-ready-at="${q.handReadyAt||0}" data-target-owner="${esc(q.target)}" data-window="${esc(q.windowId)}"><small>${recordLink} ${esc(target.name)} · <span class="blind-status">${Date.now()<(q.handReadyAt||0)?'整理手牌…':q.operation==='steal'?'抽取一张':'弃置一张'}</span></small><div class="effect-fan-cards">${(q.handChoices||[]).map((id,i)=>`<button class="effect-choice card-back" data-ui="effect-pick" data-choice-id="${esc(id)}" data-zone="hand" aria-label="背面手牌 ${i+1}" ${this.scene.ui.busy||Date.now()<(q.handReadyAt||0)?'disabled':''}>同席</button>`).join('')}${['equip','judge'].flatMap(zone=>target[zone].map(id=>`<button class="effect-choice" data-effect-card="${id}" data-ui="effect-pick" data-zone="${zone}" data-card-id="${id}" data-face="${CARD_BY_ID[id].kind}" aria-label="${zone==='equip'?'装备':'判定'} ${CARD_MAP[CARD_BY_ID[id].kind].name}" ${this.scene.ui.busy?'disabled':''}>${face(id)}</button>`)).join('')}</div></div>`;
  }else if(q?.kind==='firePay'&&q.shown){html=`<div class="revealed-suit" data-target-owner="${esc(q.target)}"><span data-effect-card="${q.shown}" class="${this.scene.motion.pendingDisplays.has(q.shown)?'pending-display':''}">${this.scene.cardFace(CARD_BY_ID[q.shown].kind,q.shown).replace(SUITS[CARD_BY_ID[q.shown].suit],SUITS[q.suit]).replace(/card-meta(?: red-card)?/,['H','D'].includes(q.suit)?'card-meta red-card':'card-meta')}</span><b>火攻 · ${SUITS[q.suit]}</b></div>`;}
  else if(q?.kind==='pindian'&&(q.selected||[]).length)html='<div class="pindian-backs" aria-label="已提交的拼点牌，双方提交后同时公开">'+q.selected.map(()=>'<i class="card-back">同席</i>').join('')+'</div>';
  if(!html&&q?.kind==='skill'&&q.player===v.you&&q.zone==='public'&&!q.stage?.startsWith('complete:')&&(v.publicTableCards||v.pool).length)html='<div class="effect-fan"><div class="effect-fan-cards">'+(v.publicTableCards||v.pool).map(id=>`<button class="effect-choice" data-card="${id}" data-zone="pool" data-effect-card="${id}" data-face="${CARD_BY_ID[id].kind}">${face(id)}</button>`).join('')+'</div></div>';
  const extras=q?.kind==='skill'&&q.player===v.you?(q.cardChoices||[]).filter(id=>!player(v.you).hand.includes(id)):this.scene.ui.armedSkill&&['急袭','清侧'].includes(this.scene.ui.armedSkill)?player(v.you).skillState?.zones?.[this.scene.ui.armedSkill==='急袭'?'field':'honor']?.cards||[]:[];
  if(!html&&extras.length)html='<div class="effect-fan material-fan"><small>可选材料</small><div class="effect-fan-cards">'+extras.map(id=>`<span class="material-candidate"><button class="effect-choice ${this.scene.ui.current().selection.ids.includes(id)?'selected':''}" data-card="${id}" data-zone="${q?.kind==='skill'?'decision':'special'}" data-owner="${esc(v.you)}" data-face="${CARD_BY_ID[id].kind}" data-face-id="${id}" data-effect-card="${id}">${face(id)}</button><button class="material-info" data-ui="card-info" data-kind="${CARD_BY_ID[id].kind}" data-id="${id}" aria-label="材料牌详情">ⓘ</button></span>`).join('')+'</div></div>';
  if(!html&&v.publicTableCards?.length)html='<div class="effect-fan public-reveal"><small>'+esc(q?.kind==='skill'?q.skill+' · 公开亮牌':'公开亮牌')+'</small><div class="effect-fan-cards">'+v.publicTableCards.map(id=>`<button class="effect-choice" data-effect-card="${id}" data-ui="card-info" data-kind="${CARD_BY_ID[id].kind}" data-id="${id}" data-face="${CARD_BY_ID[id].kind}">${face(id)}</button>`).join('')+'</div></div>';
  if(!html&&this.resultUntil>Date.now()&&this.resultData?.kind==='pindian'){const r=this.resultData;html=`<div class="effect-fan pindian-result"><small>${esc(player(r.source)?.name)} · ${r.winner?'拼点胜':'拼点未赢'}</small><div class="effect-fan-cards">${r.cards.map(id=>`<button class="effect-choice" data-ui="card-info" data-kind="${CARD_BY_ID[id].kind}" data-id="${id}" data-face="${CARD_BY_ID[id].kind}">${face(id)}</button>`).join('')}</div></div>`;}
  const key=(q?.windowId||`${q?.kind}:${q?.player}:${q?.shown}`)+':'+(this.resultUntil>Date.now()?JSON.stringify(this.resultData?.cards):'');if(key===this.key&&html===this.lastHTML){this.position();return;}this.node.classList.toggle('same-window',key===this.key);this.key=key;this.lastHTML=html;const before=capturePositions(this.node,'[data-effect-card]');this.node.innerHTML=html;settlePositions(this.node,'[data-effect-card]',before,this.scene.reduceMotion);
  $('game-stage').classList.toggle('has-table-choice',!!html);this.position();
 }
 result(old,animate){
  const r=this.v.lastResult;if(!animate||!r||JSON.stringify(r)===JSON.stringify(old?.lastResult))return;
  if(r.kind==='pindian'){this.resultData=r;this.resultUntil=Date.now()+2500;const epoch=this.scene.feedback.epoch;setTimeout(()=>{if(epoch!==this.scene.feedback.epoch||this.resultData!==r)return;this.resultUntil=0;this.render();},2500);}

 }
 judgeOutcome(r){
const anchor=document.querySelector(`[data-judge-anchor="${CSS.escape(r.player||this.v.you)}"]`);if(anchor){const b=document.createElement('span');b.className='judge-confirmed';const result=r.purpose==='le'&&!r.success?'跳过出牌':r.purpose==='bingliang'&&!r.success?'跳过摸牌':r.purpose==='shandian'?(r.success?'闪电命中':'闪电传递'):'判定已确认';b.textContent=result;anchor.append(b);setTimeout(()=>b.remove(),1600);}
  if(!r.success&&['le','bingliang'].includes(r.purpose)){const cell=document.querySelectorAll('.phase-cell')[r.purpose==='le'?3:2];this.scene.feedback.play(cell,[{scale:1},{scale:1.3,offset:.35},{scale:1}],400);this.scene.cinema.run(r.purpose==='le'?'seal':'grain',r.player,{duration:400});}
  if(r.purpose==='bagua'&&r.success&&!(this.v.pending?.required==='shan'&&this.v.pending.remaining>0))this.scene.cinema.run('shield',r.player,{duration:400});
 }
 position(){
  const fan=this.node.querySelector('[data-ready-at]');if(fan&&this.v.pending?.kind==='chooseCard'){const ready=Date.now()>=Number(fan.dataset.readyAt);if(!ready&&this.readyKey!==fan.dataset.window){clearTimeout(this.readyTimer);this.readyKey=fan.dataset.window;this.readyTimer=setTimeout(()=>{this.readyKey=null;this.position();},Math.max(1,Number(fan.dataset.readyAt)-Date.now()+10));}const hint=this.v.pending?.arrangingAt||0;fan.classList.toggle('shuffling',!ready);fan.classList.toggle('arranging',!ready&&Date.now()-hint<500);for(const b of fan.querySelectorAll('[data-choice-id]'))b.disabled=!ready||this.scene.ui.busy;fan.querySelector('.blind-status').textContent=ready?(this.v.pending.operation==='steal'?'抽取一张':'弃置一张'):'整理手牌…';}
  const el=this.node.querySelector('[data-target-owner]');if(!el)return;const seat=document.querySelector(`[data-seat="${CSS.escape(el.dataset.targetOwner)}"]`),arena=this.node.parentElement;if(!seat)return;const a=arena.getBoundingClientRect(),r=seat.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight;
  const x=Math.max(w/2+4,Math.min(a.width-w/2-4,r.x+r.width/2-a.x)),extent=this.scene.envelope(seat),above=r.y+r.height/2-extent.up-a.y-h-10,below=r.y+r.height/2+extent.down-a.y+10;
  el.style.left=x+'px';el.style.top=Math.max(5,Math.min(a.height-h-5,above>=5?above:below))+'px';
 }
 playLanded(e){
  const record=(this.v.centerPlays||[]).find(p=>p.id===e.id);
  if(e.kind==='shan'&&!(this.v.pending?.required==='shan'&&this.v.pending.remaining>0))this.scene.cinema.run('shield',e.actor,{duration:400});
  if(e.kind==='jiu'&&!e.response)this.scene.cinema.run('wine',e.actor,{duration:450});
  if(record?.responseTo==='duel')this.scene.cinema.run('duel',e.actor,{duration:250});
 }
 animate(e){
  if(e.prevention){this.scene.feedback.prevention(e);return 400;}
  if(e.stage==='resolved'&&e.chainAfter){this.scene.relations.transition(e);return 0;}
  if(e.presentation?.cue==='weapon'||e.presentation?.cue==='armor')return this.scene.cinema.equipment(e.kind,e.actor,e.effectTarget);
  if(e.stage!=='active'||!e.kind)return 0;
  const motifs={juedou:'duel',jiedao:'borrow',nanman:'ripple',wanjian:'arrows',le:'seal',bingliang:'grain',shandian:'charge'};
  // Damage/recovery, drawing, stealing and chains have their own actual-result nodes.
  const motif=motifs[e.kind];return motif?this.scene.cinema.run(motif,e.effectTarget||e.actor,{duration:350}):0;
 }
 control(name,b){if(name!=='effect-pick')return false;const q=this.v.pending;if(!q||this.scene.ui.busy)return true;this.scene.ui.hooks.dispatch('pickEffect',{windowId:q.windowId,zone:b.dataset.zone,choiceId:b.dataset.choiceId,card:b.dataset.cardId});return true;}
}
