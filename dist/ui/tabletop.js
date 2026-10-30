import {aimPath} from './aim.js';
import {slashTargetLimit} from '../backend/equipment.js';
import { CARD_BY_ID,CARD_MAP,SUITS,rankText,red,cardLabel } from '../data/cards.js';
import { GENERAL_MAP,ROLES,PHASES } from '../data/generals.js';
import { abilityInfo,equipmentInfo } from '../data/abilities.js';
import { inspectUse,inspectSkill,cardAdvice,responseOptions,discardAdvice,distanceExplanation,targetMode,conversionKinds } from '../backend/advisor.js';
import { attackRange,distance,equipKind,hasSkill } from '../backend/primitives.js';
import {DERIVED_SKILLS,REFERENCE_SKILLS} from '../data/skill-traits.js';
import {skillInput} from '../backend/skills.js';

import {Scene} from './scene.js';
const $=id=>document.getElementById(id);
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const positions={2:[[50,84],[50,17]],3:[[50,84],[17,24],[83,24]],4:[[50,84],[17,50],[50,16],[83,50]],5:[[50,84],[17,68],[17,22],[83,22],[83,68]],6:[[50,85],[17,70],[17,27],[50,15],[83,27],[83,70]],7:[[50,86],[16,84],[16,50],[16,16],[84,16],[84,50],[84,84]],8:[[50,86],[16,84],[16,50],[16,18],[50,14],[84,18],[84,50],[84,84]]};
const lesson=[
  ['认识你的牌桌','你固定在下方。座次沿桌面顺行，回合框标出当前玩家。下方本桌面板可切换演练席位，所有操作由你控制。','#seats'],
  ['完成摸牌阶段','点击阶段按钮，依次进入判定与摸牌。摸牌时点击右侧抽牌堆，每次获得一张；开局和技能摸牌自动进行。需要判定时由对应玩家点牌堆翻判，确认后手动继续阶段。','.table-center'],
  ['拖牌，或点击出牌','手牌带内拖动理牌，移出后用箭头瞄准。触屏短滑滚动、长按拖牌；Alt＋左右也可理牌。也可以点牌、点目标，再用手牌上方按钮确认。','#hand'],
  ['轮到你响应','遇到杀、决斗或濒死时，响应区会给出要求。切换到对应演练席位，选择高亮的响应牌或明确放弃。','#response-panel'],
  ['技能与弃牌','点击技能查看说明。按提示选择材料与目标后，系统执行效果。结束出牌后，弃牌助手告诉你还需弃几张。','#my-skills'],
  ['已经准备好','教学可以随时退出或重新打开。继续本地演练，或创建牌桌邀请好友。','#hand-panel']
];

export class Tabletop {
  constructor(hooks){
    this.hooks=hooks;this.scene=new Scene(this);this.conversion=null;this.multi=false;this.order=[];this.newCards=new Map();this.animatedCards=new Set();this.context='';this.lastView=null;this.suppressEffects=true;this.gesture=null;this.ignoreClickUntil=0;this.coach=-1;
    this.skillProgress=new Map();
    this.armedSkill=null;this.skillValue=1;this.skillOption='';this.skillWindow=null;
    document.addEventListener('input',e=>{if(e.target.id==='skill-value')this.skillValue=Number(e.target.value);});
    document.addEventListener('change',e=>{if(e.target.id==='skill-option')this.skillOption=e.target.value;if(e.target.id==='decision-option')this.decisionChoice=e.target.value;});
    document.addEventListener('click',e=>{const b=e.target.closest('[data-ui]');if(b){e.preventDefault();try{this.control(b.dataset.ui,b);}catch(error){hooks.toast(error.message);}}});
    $('hand-sort').addEventListener('change',()=>this.refresh());
    $('log-filter').addEventListener('change',()=>this.renderLogs());
    $('multi-select').addEventListener('change',e=>{this.multi=e.target.checked;});
    $('room-preset').addEventListener('change',e=>this.preset(e.target.value));
    document.addEventListener('pointerdown',e=>this.pointerDown(e));
    document.addEventListener('pointermove',e=>this.pointerMove(e),{passive:false});
    document.addEventListener('pointerup',e=>this.pointerUp(e));
    document.addEventListener('pointercancel',()=>this.cancelDrag());
    document.addEventListener('keydown',e=>{if(this.view&&e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)&&e.target.closest('#hand')){e.preventDefault();this.reorderCard(e.target.closest('[data-card-anchor]')?.dataset.cardAnchor||e.target.closest('[data-card]')?.dataset.card,e.key==='ArrowLeft'?-1:1);return;}if((e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey)&&e.target.closest('#hand')){e.preventDefault();this.contextCard=e.target.closest('[data-card-anchor]')?.dataset.cardAnchor||e.target.closest('[data-card]')?.dataset.card||null;this.show('hand-context');return;}if(e.key==='Escape'){this.cancelDrag();if(!document.querySelector('dialog[open]'))this.clear();}});
    $('hand').addEventListener('contextmenu',e=>{e.preventDefault();this.contextCard=e.target.closest('[data-card-anchor]')?.dataset.cardAnchor||e.target.closest('[data-card]')?.dataset.card||null;this.cancelDrag();this.show('hand-context');});
    $('hand-context').addEventListener('close',()=>{this.contextCard=null;});
    window.addEventListener('scroll',()=>this.updateAim(),true);
    window.addEventListener('blur',()=>this.cancelDrag());
    window.addEventListener('resize',()=>{if(this.current().view)this.placeSeats();});
    new ResizeObserver(()=>document.documentElement.style.setProperty('--hand-height',`${$('hand-panel').getBoundingClientRect().height}px`)).observe($('hand-panel'));
  }
  current(){return this.hooks.state();}
  get view(){return this.current().view;}
  get me(){return this.view?.players.find(p=>p.id===this.view.you);}
  get busy(){return !!this.current().pending;}
  ignoreClick(e){return performance.now()<this.ignoreClickUntil&&e?.target.closest('[data-card]')?.dataset.card===this.ignoredCard;}
  show(id){const d=$(id);if(!d.open)d.showModal();}
  detail(title,text){$('detail-title').textContent=title;$('detail-copy').textContent=text;this.show('detail-dialog');}
  reset(){this.scene.effects.resultUntil=0;this.scene.effects.node.innerHTML='';this.scene.relations.selected=null;this.scene.clearMotion();this.scene.openingRequested=false;document.body.classList.remove('game-open');this.cancelDrag();clearTimeout(this.newCardCleanup);this.conversion=null;this.multi=false;this.order=[];this.newCards.clear();this.context='';this.lastView=null;this.suppressEffects=true;this.coach=-1;$('tutorial-coach').hidden=true;}
  baseline(){this.scene.effects.resultUntil=0;this.scene.baseline();this.newCards.clear();this.animatedCards.clear();this.suppressEffects=true;this.cancelDrag();}
  render(){
    const {view:v,isHost}=this.current();if(!v)return;
    const context=`${v.roomId}:${v.you}`,old=this.context===context?this.lastView:null;
    if(old&&v.presentationResetRev>old.rev)this.baseline();
    if(this.gesture&&old?.rev!==v.rev){const active=this.gesture.active;this.cancelDrag();if(active)this.hooks.toast('牌桌已更新，已取消拖动；请核对后重新出牌。');}
    if(context!==this.context){this.context=context;this.order=[];this.conversion=null;this.armedSkill=null;this.newCards.clear();this.animatedCards.clear();}
    const skillKey=v.pending?.kind==='skill'&&v.pending.player===v.you?v.pending.windowId:null;if(skillKey!==this.skillWindow){if(skillKey){this.decisionChoice=null;this.current().selection.ids=[];this.current().selectedTargets.splice(0);this.multi=v.pending.maxCards>1;this.armedSkill=null;this.conversion=null;}else if(this.skillWindow)this.multi=false;}this.skillWindow=skillKey;
    const events=!this.suppressEffects&&old?(v.events||[]).filter(e=>e.rev>old.rev):[];
    if(old&&!this.suppressEffects){for(const id of this.me.hand||[])if(!old.players.find(p=>p.id===v.you)?.hand?.includes(id)){this.newCards.set(id,Date.now()+3500);this.animatedCards.delete(id);}}
    const animateScene=!this.suppressEffects&&!!old;this.suppressEffects=false;if(v.tableExperience)this.scene.motion.prepare(old,animateScene);this.lastView=v;
    const focus=document.activeElement,focusCard=focus?.dataset?.card,focusTarget=focus?.dataset?.targetSeat;
    $('welcome').hidden=true;$('game').hidden=false;$('game').dataset.size=v.size;$('game').dataset.phase=v.phase;
    const lobby=v.status==='lobby',turn=v.players.find(p=>p.id===v.turn);
    $('room-title').textContent=v.status==='finished'?`${v.winner} · 对局结束`:lobby?'好友入席，静候开局':`${turn?.name} · ${PHASES[v.phase]}阶段`;
    $('revision').textContent=`SYNC / ${v.rev}`;$('room-size').textContent=`${v.players.length} / ${v.size}`;
    $('room-info').innerHTML=`<div class="room-code">${esc(v.roomId.slice(0,8).toUpperCase())}</div><div class="room-tags"><span>${v.mode==='auto'?v.completeSkills?'完整自动':'旧局自动':'自由手动'}</span><span>${{random:'随机',choose:'点将',five:'五选一'}[v.selectionMode]}</span></div>${v.practice?`<label>本地控制席位<select id="control-seat">${v.players.map(p=>`<option value="${esc(p.id)}" ${p.id===v.you?'selected':''}>${esc(p.name)}${p.id===v.turn?' · 回合中':''}</option>`).join('')}</select></label>`:''}`;
    $('lobby-actions').innerHTML=lobby?`${isHost?'<button class="primary small full" data-do="start">开局</button>':''}${v.selectionMode!=='random'?'<button class="secondary small full" data-do="library">选将</button>':'<p class="muted">开局时随机分配武将</p>'}${v.practice&&isHost?'<button class="text-link" data-do="local-seat">增加席位</button>':''}`:'';
    $('turn-info').innerHTML=lobby?'':`<div class="turn-box"><small>第 ${v.round} 轮 · ${v.turn===v.you?'你的回合':'等待 '+esc(turn?.name)}</small><div class="phase-dots">${PHASES.map((p,i)=>`<span class="${i===v.phase?'active':i<v.phase?'past':''}">${p}</span>`).join('')}</div></div>`;
    $('table-actions').hidden=v.status!=='playing';
    $('range-info').textContent=`攻击范围 ${attackRange(this.me)} · 出杀 ${v.counters.slash}${v.counters.drank?' · 酒 +1':''}`;
    $('round-label').textContent=lobby?'等待开局':`第 ${v.round} 轮 · ${PHASES[v.phase]}`;
    $('pile-count').textContent=`牌堆 ${v.deckCount} / 弃牌 ${v.discard.length}`;
    $('seats').innerHTML=v.players.map((p,i)=>this.seatHTML(p,i,lobby)).join('')+Array.from({length:Math.max(0,v.size-v.players.length)},(_,i)=>`<div class="seat empty-seat" data-empty="${v.players.length+i}">${v.players.length+i+1} · 等待入席</div>`).join('');
    this.placeSeats();
    const g=GENERAL_MAP[this.me.general];$('my-title').textContent=g?`${g.name} · ${this.me.name}`:'我的手牌';$('my-role').textContent=this.me.role?`${ROLES[this.me.role]} · ${this.me.roleOpen?'公开':'仅自己可见'}`:'';
    $('my-skills').innerHTML=g?this.playerSkills().map(s=>{const a=abilityInfo(g,s,v.skillAutomation,v.completeSkills),used=this.me.skillState?.used[s.name]||this.me.skillState?.marks[s.name],conversion={审时:'shenshi',贞良:'zhenliang',征荣:'zhengrong',拒战:'juzhan',成略:'chenglue'}[s.name],mark={奋威:'fenwei',鸿举:'hongju',凿险:'zaoxian',勤学:'qinxue',魂姿:'hunzi',志继:'zhiji',若愚:'ruoyu',破势:'poshi'}[s.name],label=conversion?(this.me.skillState?.marks[conversion]?'阴':'阳'):mark&&this.me.skillState?.marks[mark]?'已发动':used?'已发动':v.mode==='manual'?'本桌手动':a.status;return `<button class="skill-button" data-state="${!this.canAccessSkill(s.name)?'lost':used?'used':'ready'}" data-skill="${esc(s.name)}" title="${!this.canAccessSkill(s.name)?'已失去 · ':used?'已发动 · ':a.status+' · '}${esc(s.text)}">${esc(s.name)}<small>${!this.canAccessSkill(s.name)?'已失去':label}</small></button>`;}).join(''):'';
    const use=(v.events||[]).filter(e=>e.type==='use').at(-1),name=id=>v.players.find(p=>p.id===id)?.name||'玩家',health=use?(v.events||[]).filter(e=>e.rev>=use.rev&&['damage','heal'].includes(e.type)).at(-1):null;
    $('event-summary').textContent=use?`${name(use.source)} → ${CARD_MAP[use.cardKind]?.name||'出牌'} → ${(use.targets||[use.player]).map(name).join('、')}${v.pending?' · 等待响应':health?` · ${name(health.player)} ${health.type==='damage'?'受到':'回复'} ${health.amount} 点${health.type==='damage'?'伤害':'体力'}`:' · 结算完成'}`:v.logs.filter(l=>l.category&&l.category!=='table').at(-1)?.text||'与友同席 · 从容出招';
    $('last-result').textContent=v.lastResult?.kind==='pindian'?`拼点：${v.players.find(p=>p.id===v.lastResult.source)?.name}${v.lastResult.winner?'胜':'未赢'}`:v.lastResult?.kind==='judge'?`判定：${cardLabel(v.lastResult.card)}`:'';
    this.renderPhaseTrack();this.renderLogs();this.refresh();this.renderCoach();this.expireNewCards();
    this.scene.sync(old,animateScene);
    for(const e of events)this.animate(e);
    if(focusCard)document.querySelector(`#hand [data-card="${CSS.escape(focusCard)}"]`)?.focus({preventScroll:true});
    else if(focusTarget)document.querySelector(`[data-target-seat="${CSS.escape(focusTarget)}"]`)?.focus({preventScroll:true});
  }
  seatHTML(p,i,lobby){return this.scene.seat(p,i,lobby);}
  placeSeats(){this.scene.placeSeats();}
  mini(id,zone,owner){const c=CARD_BY_ID[id],kind=zone==='judge'?this.view.delayKinds[id]||c.kind:c.kind,def=CARD_MAP[kind],names={weapon:'武器',armor:'防具',minus:'−马',plus:'+马',treasure:'宝物'},sel=this.current().selection;return `<button class="mini-card ${sel.zone===zone&&sel.owner===owner&&sel.ids.includes(id)?'selected':''}" data-card="${id}" data-zone="${zone}" data-owner="${esc(owner)}" title="${esc(def.rule)}${kind!==c.kind?'；原牌：'+esc(cardLabel(id)):''}${zone==='equip'?'；'+equipmentInfo(c.kind,!!this.view.equipmentAutomation):''}">${def.name}<span class="zone-tag"> · ${zone==='judge'?'判定':names[def.slot]||'装备'}</span></button>`;}
  card(id,zone,owner=null,staticOnly=false){return this.scene.card(id,zone,owner,staticOnly);}
  sortedHand(){
    const hand=this.me.hand||[];this.order=this.order.filter(id=>hand.includes(id));for(const id of hand)if(!this.order.includes(id))this.order.push(id);
    const sort=$('hand-sort').value;if(sort==='custom')return this.order;
    return [...this.order].sort((a,b)=>{const x=CARD_BY_ID[a],y=CARD_BY_ID[b];return sort==='rank'?x.rank-y.rank:sort==='suit'?'SHCD'.indexOf(x.suit)-'SHCD'.indexOf(y.suit)||x.rank-y.rank:CARD_MAP[x.kind].type.localeCompare(CARD_MAP[y.kind].type,'zh')||x.kind.localeCompare(y.kind)||x.rank-y.rank;});
  }
  expireNewCards(){
    clearTimeout(this.newCardCleanup);const now=Date.now();for(const [id,until]of this.newCards)if(until<=now)this.newCards.delete(id);
    for(const badge of document.querySelectorAll('#hand .new-label'))if(!this.newCards.has(badge.closest('[data-card]').dataset.card))badge.remove();
    const next=Math.min(...this.newCards.values());if(Number.isFinite(next))this.newCardCleanup=setTimeout(()=>this.expireNewCards(),Math.max(1,next-now+10));
  }
  refresh(){
    const {view:v,selection:s}=this.current();if(!v)return;const woodOpen=$('wood-storage')?.open||false;
    const focus=document.activeElement,focusCard=focus?.dataset?.card,focusZone=focus?.dataset?.zone;
    const src=s.zone==='material'?[...this.me.hand,...(this.me.wood?.cards||[])]:s.zone==='wood'?this.me.wood?.cards:s.zone==='decision'?v.pending?.cardChoices:s.zone==='special'?Object.values(this.me.skillState?.zones||{}).flatMap(z=>z.cards||[]):s.zone==='hand'?this.me.hand:s.zone==='pool'?v.pool:s.zone==='peek'?v.peek:v.players.find(p=>p.id===s.owner)?.[s.zone];s.ids=s.ids.filter(id=>src?.includes(id));
    $('multi-select').checked=this.multi;
    const privateSkill=v.pending?.kind==='skill'&&v.pending.player===v.you&&v.pending.zone==='peek';
    const decision=v.pending?.kind==='skill'&&v.pending.player===v.you&&v.pending.cardChoices?.length;
    $('hand').innerHTML=decision&&!v.tableExperience?v.pending.cardChoices.map(id=>this.card(id,'decision',v.you)).join(''):this.me.hand?.length?this.sortedHand().map(id=>this.card(id,decision&&v.pending.cardChoices.includes(id)?'decision':'hand',v.you,v.tableExperience&&(privateSkill||decision&&!v.pending.cardChoices.includes(id)))).join(''):`<span class="muted">${v.status==='lobby'?'开局后获得四张起始手牌':'暂无手牌'}</span>`;
    const hiddenProcess=Math.max(0,(v.poolCount??v.pool.length)-v.pool.length);$('pool').innerHTML=(v.pool.map(id=>this.card(id,'pool')).join('')+(hiddenProcess?`<span class="concealed-process" aria-label="${hiddenProcess}张扣置牌">▤ 扣置 × ${hiddenProcess}</span>`:''))||'<span class="empty-message">待出牌 · 将牌拖向玩家</span>';
    const specialButtons=Object.entries(this.me.skillState?.zones||{}).filter(([,z])=>z.count).map(([zone,z])=>`<button class="text-link" data-ui="special-zone" data-player="${esc(v.you)}" data-zone="${zone}">${{field:'田',honor:'荣',duty:'任',wound:'创',song:'箜声'}[zone]} ${z.count}</button>`).join('');
    $('own-equip').innerHTML=[...this.me.equip,...this.me.judge].length?`<span class="muted">我的公开区</span>${this.me.equip.map(id=>this.mini(id,'equip',v.you)).join('')}${this.me.judge.map(id=>this.mini(id,'judge',v.you)).join('')}${equipKind(this.me,'weapon')==='zhangba'?'<button class="text-link" data-ui="convert" data-kind="sha">丈八 · 两手牌转杀</button>':equipKind(this.me,'weapon')==='zhuque'?'<button class="text-link" data-ui="convert" data-kind="fire_sha">朱雀 · 普通杀转火杀</button>':''}`:'';
    $('own-equip').innerHTML+=specialButtons+(v.equipmentAutomation&&equipKind(this.me,'treasure')==='muniu'?'<button class="text-link" data-ui="wood-store">木牛 · 存入所选手牌</button>':'');if(this.me.wood?.cards?.length)$('own-equip').innerHTML+='<details id="wood-storage" class="wood-storage" '+(woodOpen||v.pending&&(!v.pending.player||v.pending.player===v.you)?'open':'')+'><summary>◇ 储牌 '+this.me.wood.cards.length+'</summary><div class="wood-hand" aria-label="木牛储牌（不计手牌）">'+this.me.wood.cards.map(id=>this.card(id,'wood',v.you)).join('')+'</div></details>';
    if(!v.tableExperience&&this.armedSkill&&['急袭','清侧'].includes(this.armedSkill)){const zone=this.armedSkill==='急袭'?'field':'honor';$('hand').innerHTML=(this.me.skillState?.zones?.[zone]?.cards||[]).map(id=>this.card(id,'special',v.you)).join('')||'<span>此专属牌区暂无牌</span>';}
    $('peek-panel').hidden=!v.peek.length;$('peek-cards').innerHTML=v.peek.map(id=>this.card(id,'peek',v.you)).join('');
    $('hand').hidden=privateSkill&&!v.tableExperience;$('own-equip').hidden=privateSkill;document.querySelector('.hand-options').hidden=privateSkill;document.querySelector('#peek-panel .compact-row').hidden=privateSkill;
    $('hand-panel').classList.toggle('private-skill',!!privateSkill);
    document.querySelector('#peek-panel p').textContent=privateSkill?v.pending.stage==='gift'?'仅你可见。选择交给目标的牌，或保留其余牌。':v.pending.stage==='zuilunTake'?'选择收入手牌的牌，其余牌由你安排置顶。':'按点击顺序安排牌堆顶或底；分批归还完毕后自动继续。':'按点击顺序放回；后一次置顶会在最上方。';
    const publicZone=(!v.tableExperience||v.mode==='manual')&&s.ids.length&&(s.zone==='pool'||(['equip','judge'].includes(s.zone)&&s.owner!==v.you));$('public-actions').hidden=!publicZone;$('public-label').textContent=`已选 ${s.ids.length} 张公开牌`;
    document.querySelector('[data-do="take-pool"]').hidden=s.zone!=='pool';for(const k of ['public-take','public-discard','public-pool','public-pass'])document.querySelector(`[data-do="${k}"]`).hidden=s.zone==='pool';
    document.querySelectorAll('.seat [data-card]').forEach(b=>b.classList.toggle('selected',s.zone===b.dataset.zone&&s.owner===b.dataset.owner&&s.ids.includes(b.dataset.card)));
    $('conversion-bar').hidden=!this.conversion&&!this.armedSkill;
    const input=this.armedSkill?skillInput(v,this.me,this.armedSkill):null;
    $('conversion-bar').innerHTML=this.armedSkill?`<span>自动「${esc(this.armedSkill)}」· ${input.maxCards?input.maxCards>20?'可多选材料':`至多${input.maxCards}张材料`:'无需选材料'} · ${input.maxTargets?`选${input.maxTargets}名目标`:'无需选目标'}</span>${input.value?`<input id="skill-value" aria-label="技能体力数值" type="number" min="1" max="20" value="${this.skillValue}">`:''}${input.options.length?`<select id="skill-option" aria-label="技能分支">${input.options.map(([value,label])=>`<option value="${value}" ${this.skillOption===value?'selected':''}>${label}</option>`).join('')}</select>`:''}<button class="text-link" data-ui="clear">取消发动</button>`:this.conversion?`<span>基础转化 → ${CARD_MAP[this.conversion].name} · 选择合法材料</span><button class="text-link" data-ui="conversion-clear">退出转化</button>`:'';
    this.renderTargets();this.renderToolbar();this.renderPending();this.renderPhase();if(v.tableExperience){this.scene.effects.render();this.scene.placeSeats();this.scene.positionResponse();}
    if(focusCard)document.querySelector(`[data-zone="${CSS.escape(focusZone)}"][data-card="${CSS.escape(focusCard)}"]`)?.focus({preventScroll:true});
  }
  selectedAdvice(){const {view,selection,selectedTargets}=this.current();return inspectUse(view,selection.owner===view.you&&['hand','equip','wood','material'].includes(selection.zone)?selection.ids:[],this.conversion,selectedTargets);}
  skillTargetAdvice(){const v=this.view,q=v.pending?.kind==='skill'&&v.pending.player===v.you?v.pending:null;if(!q&&!this.armedSkill)return null;if(!q)return inspectSkill(v,this.armedSkill,this.current().selection.ids,this.current().selectedTargets,this.skillOption,this.skillValue);const limit=this.targetLimit(),allowed=q?q.cardTargets&&this.current().selection.ids.length===1?q.cardTargets[this.current().selection.ids[0]]||[]:q.targetIds:v.players.filter(p=>!p.dead).map(p=>p.id);return {mode:limit>1?'multiple':limit===1?'single':'self',reason:q?.hint||'选择技能材料与目标',targets:v.players.map(p=>({id:p.id,ok:limit>0&&allowed.includes(p.id),reason:'不符合本次技能目标条件'}))};}
  renderTargets(){
    const {view:v,selectedTargets:t,selection:s}=this.current();t.splice(0,t.length,...t.filter(id=>v.players.some(p=>p.id===id)).slice(0,this.targetLimit()));
    const hasIntent=!this.armedSkill&&s.ids.length>0&&s.owner===v.you&&(['hand','wood','material'].includes(s.zone)||s.zone==='equip'&&this.conversion)&&v.mode==='auto'&&!v.pending;
    let advice=hasIntent?this.selectedAdvice():null;
    advice=this.skillTargetAdvice()||advice;
    if(advice&&['self','all'].includes(advice.mode)&&!this.armedSkill)t.splice(0);
    $('target-picker').hidden=v.status!=='playing'||!advice&&!t.length;
    for(const b of document.querySelectorAll('[data-target-seat]')){
      const i=t.indexOf(b.dataset.targetSeat),article=b.closest('.seat'),option=advice&&!['self','all'].includes(advice.mode)?advice.targets.find(x=>x.id===b.dataset.targetSeat):null,targeted=i>=0;
      b.disabled=v.status!=='playing';b.setAttribute('aria-pressed',String(targeted));article.classList.toggle('targeted',targeted);article.classList.toggle('legal-target',!!option?.ok&&advice.mode!=='self'&&advice.mode!=='all');article.classList.toggle('invalid-target',!!option&&!option.ok&&!targeted);
      const badge=b.querySelector('.target-index');badge.hidden=!targeted;badge.textContent=this.twoTargets()?String(i+1):'目标';
      article.querySelector('.target-reason').textContent=option?option.ok?advice.mode==='ordered'?(t.length?'② 被杀者':'① 持武器者'):'可指定':option.reason:'';
      const from=advice?.mode==='ordered'&&t.length?t[0]:v.you;b.title=distanceExplanation(v,from,b.dataset.targetSeat)+(option?`；${option.ok?'可指定':option.reason}`:'');
    }
    const names=t.map(id=>v.players.find(p=>p.id===id).name);
    $('target-summary').textContent=advice?.mode==='self'?'自动对自己使用':advice?.mode==='all'?'全体效果 · 无需逐个指定目标':names.length?`${this.twoTargets()?'目标顺序':'目标'}：${names.join(' → ')}${advice?.mode==='ordered'&&t.length===1?' · 再选被杀者':''}`:advice?.reason||'点玩家框选择目标 · 再点取消';
    document.querySelector('[data-do="clear-targets"]').hidden=!t.length;
    $('use-zone').classList.toggle('active',!!advice&&['self','all'].includes(advice.mode));
    if(v.tableExperience){$('target-lines').innerHTML='';return;}
    const svg=$('target-lines'),rect=svg.getBoundingClientRect(),seq=advice?.mode==='ordered'?[v.you,...t]:t.length?[v.you,...t]:[];
    const point=id=>{const r=document.querySelector(`[data-seat="${CSS.escape(id)}"]`)?.getBoundingClientRect();return r?{x:r.x+r.width/2-rect.x,y:r.y+r.height/2-rect.y}:null;};
    svg.innerHTML='<defs><marker id="target-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#e3b66d"/></marker></defs>'+seq.slice(1).map((id,i)=>{const a=point(advice?.mode==='ordered'?seq[i]:v.you),b=point(id);return a&&b?`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#e3b66d" stroke-width="2" stroke-dasharray="5 5" marker-end="url(#target-arrow)"/>`:'';}).join('');
  }
  targetLimit(){const v=this.view;if(!v)return 1;if(v.pending?.kind==='skill'&&v.pending.player===v.you)return v.pending.maxTargets;if(this.armedSkill)return skillInput(v,this.me,this.armedSkill).maxTargets;const {selection:s}=this.current(),kind=this.conversion||CARD_BY_ID[s.ids[0]]?.kind;if(kind==='tiesuo')return v.skillAutomation&&hasSkill(this.me,'连环')?3:2;if(kind==='jiedao')return 2;if(['sha','fire_sha','thunder_sha'].includes(kind))return slashTargetLimit(v,this.me,s.ids);return 1;}
  twoTargets(){return this.targetLimit()>1;}
  renderToolbar(){
    const {view:v,selection:s,selectedTargets:t}=this.current(),discard=v.mode==='auto'&&v.turn===v.you&&v.phase===4&&!v.pending,advice=this.selectedAdvice(),owned=s.owner===v.you&&['hand','equip','wood','material'].includes(s.zone),play=document.querySelector('[data-do=play]'),drop=document.querySelector('[data-do=phase-discard]'),recast=document.querySelector('[data-do=recast]');
    play.hidden=discard||!!v.pending;drop.hidden=!discard;drop.disabled=this.busy||!discardAdvice(v,s.zone==='hand'?s.ids:[]).ok;
    play.disabled=this.busy||!s.ids.length||!owned||(v.mode==='auto'&&!advice.ok)||v.status!=='playing';
    play.textContent=v.mode==='manual'?'手动出牌':advice.ok?CARD_MAP[advice.kind]?.slot?'装备':advice.mode==='single'?`对${v.players.find(p=>p.id===t[0])?.name||'目标'}使用${CARD_MAP[advice.kind].name}`:`使用${CARD_MAP[advice.kind]?.name||'所选牌'}`:'出牌';
    if(this.armedSkill){play.hidden=false;play.disabled=this.busy||!!v.pending||!inspectSkill(v,this.armedSkill,s.ids,t,this.skillOption,this.skillValue).ok;play.textContent=`发动 ${this.armedSkill}`;}
    if(v.tableExperience){play.textContent=this.armedSkill?'发动':advice.ok&&CARD_MAP[advice.kind]?.slot?'装备':'出牌';drop.textContent='弃牌';}
    recast.hidden=!(s.ids.length===1&&CARD_BY_ID[s.ids[0]]?.kind==='tiesuo')||!!v.pending;recast.disabled=this.busy||v.turn!==v.you||v.phase!==3||s.zone!=='hand';
    const counts=discardAdvice(v,s.zone==='hand'?s.ids:[]);
    $('discard-help').textContent=discard?`手牌 ${this.me.hand.length} / 上限 ${counts.limit} · ${counts.exempt?'克己生效，无需弃牌':`需弃 ${counts.needed} 张 · 已选 ${counts.selected} 张${counts.selected>counts.needed?'（选多了）':` · 还需 ${counts.remaining} 张`}`}`:'';
    $('selection-label').textContent=this.busy?'正在等待牌桌确认…':v.pending?(v.tableExperience?'':'按响应区提示选择牌'):!s.ids.length?'':v.mode==='manual'?`已选 ${s.ids.length} 张 · 手动裁定`:advice.ok?v.tableExperience?'':`已选 ${s.ids.map(id=>CARD_MAP[CARD_BY_ID[id].kind].name).join('、')} · 可以使用`:advice.reason;
    if(this.armedSkill)$('selection-label').textContent=`${this.armedSkill} · 已选 ${s.ids.length} 张材料 / ${t.length} 名目标`;
    $('selection-label').parentElement.hidden=!$('selection-label').textContent&&!$('discard-help').textContent;
    document.body.classList.toggle('response-active',!!v.pending);
  }
  renderPhase(){
    const v=this.view,b=document.querySelector('[data-do=phase]'),actor=v.players.find(p=>p.id===v.turn),d=discardAdvice(v),labels=['进入判定',v.skillAutomation?'进入摸牌':'摸 2 张','进入出牌','结束出牌','完成弃牌','交接下一回合'];
    $('compact-turn').textContent=v.status==='playing'?(v.turn===v.you?'你的回合':actor?.name+' 的回合'):'';$('compact-turn').title=$('compact-turn').textContent;
    b.textContent=labels[v.phase];b.disabled=this.busy||!!v.pending||!!v.flow?.opening||!!v.flow?.draw?.remaining||!(v.turn===v.you||v.you===v.hostId)||v.peek.length>0||(v.turn===v.you&&v.phase===4&&d.needed>0);
    b.hidden=v.turn!==v.you||v.status!=='playing';if(v.status==='playing')$('room-title').textContent=(v.turn===v.you?'你的回合':'当前为 '+actor?.name+' 的回合')+(v.phaseState?.extraTurn?' · 额外回合':'');$('turn-center').textContent=v.status==='lobby'?'准备选将':v.pending?'等待'+(v.players.find(p=>p.id===v.pending.player)?.name||'玩家')+'响应':'';
    const auto=$('auto-advance');auto.hidden=!v.tableExperience;auto.disabled=this.busy||v.turn!==v.you||v.status!=='playing';auto.setAttribute('aria-checked',String(this.me.autoAdvanceEnabled!==false));auto.classList.toggle('enabled',this.me.autoAdvanceEnabled!==false);
    $('quick-phase').textContent=labels[v.phase];$('quick-phase').disabled=b.disabled;$('quick-phase').hidden=v.status!=='playing';
    $('phase-help').textContent=v.pending?'先完成当前响应':v.phase===2?(v.phaseState?.skipDraw?'兵粮效果 · 本阶段已跳过摸牌':v.flow?.draw?.remaining?`点击右侧抽牌堆 · 还需 ${v.flow.draw.remaining} 张`:v.mode==='auto'?'本阶段摸牌已完成':'手动模式 · 请自行摸牌'):v.phase===4?`${actor?.name} 完成弃牌后交接回合`:v.phase===0?v.skillAutomation?'准备阶段技能选择完成后继续':'准备阶段技能请先按版本裁定，再继续':v.phase===5?'结束阶段技能完成后，再交接回合':v.skillAutomation?v.completeSkills?'技能效果由系统结算；按提示选择即可':'旧局技能范围 · 详见技能面板':'技能时机由同桌核对，随时可手动裁定';
  }
  renderPhaseTrack(){
    const v=this.view,key=`${v.skillTurnNo||v.round}:${v.turn}:${v.phase}`,fresh=this.phasePulse!==key;this.phasePulse=key;
    $('phase-track').innerHTML=PHASES.map((name,i)=>`<button type="button" class="phase-cell ${i===v.phase?'current'+(fresh?' phase-pop':''):i<v.phase?'past':''}" ${i===v.phase?'aria-current="step"':''} title="${i===v.phase?'当前：':i<v.phase?'已完成：':'随后：'}${name} · ${i<5?'下一阶段：'+PHASES[i+1]:'下一位玩家'}" aria-label="${name}${i===v.phase?'，当前阶段':''}；${i<5?'下一阶段'+PHASES[i+1]:'随后交接回合'}"><span>${i+1}</span><small>${name}</small></button>`).join('');
    const opening=v.flow?.opening,can=v.turn===v.you||v.you===v.hostId;
    $('flow-tools').innerHTML=opening?`<span>轮流发起手牌…</span>${v.you===v.hostId?'<button class="text-link" data-ui="opening-skip">跳过展示</button>':''}`:!v.tableExperience&&v.interactionMode==='tactile'&&can&&v.status==='playing'&&v.phase!==3?`<button class="text-link" data-ui="flow-pause">${v.flow?.paused?'恢复自动推进':'暂停自动推进'}</button>${!v.pending&&!v.flow?.draw?.remaining?'<small>可继续时停留 1.5 秒</small>':''}`:'';
  }
  renderLogs(){
    const v=this.view;if(!v)return;const logs=$('logs'),stick=logs.scrollTop+logs.clientHeight>=logs.scrollHeight-40,filter=$('log-filter').value;
    logs.innerHTML=v.logs.filter(l=>!filter||l.category===filter).map(l=>`<div class="log-line" data-category="${esc(l.category||'table')}"><span>#${l.rev} · ${{play:'出牌',response:'响应',health:'体力',draw:'摸牌',correction:'纠正',table:'牌桌'}[l.category]||'牌桌'}</span>${esc(l.text)}</div>`).join('');if(stick)logs.scrollTop=logs.scrollHeight;
  }
  renderPending(){
    const v=this.view,q=v.pending,panel=$('response-panel');for(const el of document.querySelectorAll('[data-seat]'))el.classList.toggle('awaiting-response',v.tableExperience&&q?.player===el.dataset.seat);panel.hidden=!q;if(!q){panel.replaceChildren();return;}
    if(v.tableExperience&&q.kind==='counter'&&!q.canRespond&&!q.showNotice){panel.hidden=true;panel.replaceChildren();return;}
    const name=id=>v.players.find(p=>p.id===id)?.name||'玩家',mine=q.player===v.you,s=this.current().selection,options=responseOptions(v,s.owner===v.you?s.ids:[]),valid=options.some(x=>x.ok),locked=this.busy?'disabled':'';
    if(q.kind==='skill'){
      const cards=s.ids.length,targets=this.current().selectedTargets.length;const readiness=c=>{if(c.id==='decline')return '';const min=c.minCards??q.minCards,max=c.maxCards??q.maxCards,minT=c.minTargets??q.minTargets,maxT=c.maxTargets??q.maxTargets;return cards<min?`还需${min-cards}张材料`:cards>max?'材料选多了':targets<minT?`还需${minT-targets}名目标`:targets>maxT?'目标选多了':'';};
      panel.innerHTML=`<strong>${esc(name(q.player))} · ${esc(q.skill)}</strong><p class="response-sub">${esc(q.hint||'选择材料、目标和发动方式；效果由系统执行。')} · 目标 ${targets}/${q.minTargets}–${q.maxTargets} · 材料 ${cards}/${q.minCards}–${q.maxCards}</p><div class="response-buttons">${mine?(q.choices.length>6?`<select id="decision-option" aria-label="技能选项">${q.choices.map(c=>`<option value="${esc(c.id)}" ${this.decisionChoice===c.id?'selected':''}>${esc(c.label)}</option>`).join('')}</select><button class="primary small" data-ui="decision-submit" ${locked||readiness(q.choices.find(c=>c.id===this.decisionChoice)||q.choices[0])?'disabled':''}>确认选项</button>`:q.choices.map(c=>`<button class="primary small" data-ui="skill-choice" data-choice="${esc(c.id)}" ${locked||(q.stage?.startsWith('complete:')||q.stage?.startsWith('equipment:'))&&readiness(c)?'disabled':''} title="${esc(readiness(c))}">${esc(c.label)}${readiness(c)?` · ${esc(readiness(c))}`:''}</button>`).join(''))+(q.optional?`<button class="secondary small" data-ui="skill-choice" data-choice="decline" ${locked}>不发动</button>`:''):'<span>等待对应玩家作技能选择</span>'}${mine&&q.privateView?'<button class="text-link" data-ui="private-view">查看全部私看牌</button>':''}</div>`;return;
    }
    if(v.tableExperience&&['chooseCard','market'].includes(q.kind)){panel.hidden=!mine;panel.innerHTML=`<strong>${q.kind==='market'?'五谷丰登 · 点击桌面牌拾取':'点击目标前方的牌'}</strong>`;return;}
    if(q.kind==='judgeAwait'){panel.innerHTML=`<strong>${esc(name(q.player))} · ${esc(q.purpose==='generic'?'判定':CARD_MAP[q.purpose]?.name||q.purpose?.split(':').at(-1)||'判定')} · 待翻判</strong><p class="response-sub">${mine?'点击抽牌堆翻开判定牌':'等待对应玩家点击牌堆翻判'}</p>`;return;}
    const titles={slash:`${name(q.source)} 对${mine?'你':name(q.player)}使用杀`,duel:'决斗 · 请打出杀',aoe:q.required==='sha'?'南蛮入侵 · 请打出杀':'万箭齐发 · 请打出闪',save:`${name(q.target)} 濒死 · 需要救援`,counter:'锦囊生效前 · 无懈窗口',judge:'判定 · 可改判后确认',pindian:'拼点 · 双方秘密选牌',chooseCard:'选择目标牌区',market:'五谷丰登 · 选一张',fireShow:'火攻 · 展示一张手牌',firePay:'火攻 · 弃置同花色手牌',borrow:q.skill==='青龙偃月刀'?'青龙偃月刀 · 对同一目标追加杀':'借刀 · 对指定目标出杀'};
    let buttons='',sub=q.remaining?`还需 ${q.remaining} 张${q.required==='sha'?'杀':'闪'}`:'';
    const response=`<button class="primary small" data-do="respond" ${!valid||this.busy?'disabled':''}>${q.kind==='counter'?'出':q.kind==='pindian'?'确认拼点牌':q.kind==='fireShow'?'展示所选牌':'使用所选牌响应'}</button>`;
    if(q.kind==='counter'){
      const can=v.tableExperience?q.canRespond:q.players.includes(v.you),passed=v.tableExperience?q.hasPassed:q.passed.includes(v.you);sub=`${CARD_MAP[q.effect.cardKind]?.name||'锦囊'} → ${name(q.effect.target)} · 当前${q.negated?'被抵消':'将生效'}`;
      if(v.tableExperience&&!can){panel.innerHTML=`<strong>${esc(CARD_MAP[q.effect.cardKind]?.name||'锦囊')}将对你生效</strong><p class="response-sub">等待反制结算</p>`;return;}
      if(v.tableExperience)sub=(q.effect.target===v.you?'此效果指向你':'为 '+name(q.effect.target)+' 反制')+' · '+sub;
      if(can)buttons=response+(passed?'<span>你已放弃，仍可用无懈反制</span>':`<button class="secondary small" data-do="pass" ${locked}>不出</button>`);

    }else if(q.kind==='pindian')buttons=q.players.includes(v.you)&&!q.selected.includes(v.you)?response:'<span>等待另一方提交；提交前不公开牌面</span>';
    else if(q.kind==='judge'){
      sub=`${name(q.player)} · ${q.purpose==='generic'?'判定':CARD_MAP[q.purpose]?.name||q.purpose?.split(':').at(-1)||'判定'} · ${cardLabel(q.card)}`;if(mine||v.you===v.hostId)buttons=`<button class="primary small" data-do="pass" ${locked}>判定生效</button>`;
      if(v.you===v.hostId||GENERAL_MAP[this.me.general]?.skills.some(k=>['鬼才','鬼道'].includes(k.name)))buttons+=`<button class="secondary small" data-do="rejudge" ${s.ids.length!==1||this.busy?'disabled':''}>以所选牌改判</button>`;
    }else if(mine){
      if(q.kind==='chooseCard'){const other=v.players.find(p=>p.id===q.target);buttons=`<button class="primary small" data-do="effect-hand" ${!other.handCount||this.busy?'disabled':''}>随机手牌</button><button class="secondary small" data-do="effect-card" ${s.owner!==q.target||!['equip','judge'].includes(s.zone)||s.ids.length!==1||this.busy?'disabled':''}>所选公开牌</button>`;sub=`点选 ${other.name} 的装备、判定牌，或随机手牌`;}
      else if(q.kind==='market'){buttons=`<button class="primary small" data-do="effect-market" ${s.zone!=='pool'||!q.available.includes(s.ids[0])||this.busy?'disabled':''}>获得所选</button>`;sub='从结算区选择本次五谷牌';}
      else{buttons=response;if(q.kind!=='fireShow')buttons+=`<button class="secondary small" data-do="pass" ${locked}>${q.kind==='firePay'?'不造成伤害':q.kind==='save'?'不救援':q.kind==='borrow'?q.skill==='青龙偃月刀'?'不追杀':'交出武器':'放弃并承受效果'}</button>`;if(q.required==='shan'&&!q.ignoreArmor&&(equipKind(this.me,'armor')==='bagua'||v.skillAutomation&&hasSkill(this.me,'八阵')&&!equipKind(this.me,'armor')))buttons+=`<button class="secondary small" data-do="bagua" ${q.baguaUsed||this.busy?'disabled':''}>八卦阵判定</button>`;}
      if(q.kind==='firePay')sub=`弃 ${SUITS[q.suit]} 花色手牌，或放弃造成伤害`;
    }
    if(q.player&&!mine&&q.kind!=='judge')sub=`等待 ${name(q.player)} 响应${sub?' · '+sub:''}`;
    if(v.completeSkills&&hasSkill(this.me,'蛊惑')&&!this.me.skillState?.used['蛊惑']&&(mine||q.kind==='counter'&&(v.tableExperience?q.canRespond:q.players.includes(v.you))))buttons+='<button class="secondary small" data-ui="lord-help" data-name="蛊惑">蛊惑声明</button>';
    if(v.skillAutomation&&this.me.role==='lord'&&mine&&q.required==='shan'&&hasSkill(this.me,'护驾'))buttons+='<button class="secondary small" data-ui="lord-help" data-name="护驾">请求魏将出闪</button>';
    if(v.skillAutomation&&this.me.role==='lord'&&mine&&q.required==='sha'&&hasSkill(this.me,'激将'))buttons+='<button class="secondary small" data-ui="lord-help" data-name="激将">请求蜀将出杀</button>';
    if(v.skillAutomation&&q.kind==='save'&&q.target===v.you&&hasSkill(this.me,'涅槃')&&!this.me.skillState?.marks['涅槃'])buttons+='<button class="secondary small" data-ui="lord-help" data-name="涅槃">涅槃自救</button>';
    panel.innerHTML=`<strong>${esc(titles[q.kind]||'等待结算')}</strong><p class="response-sub">${esc(sub)}</p><div class="response-buttons">${buttons||'<span>等待对应玩家响应</span>'}</div>`;
  }

  animate(e){
    if(this.view.tableExperience&&['damage','heal'].includes(e.type))this.scene.effects.animate({kind:e.type==='heal'?'tao':e.nature==='fire'?'fire_sha':e.nature==='thunder'?'thunder_sha':'sha',actor:e.source||null,effectTarget:e.player,stage:'active'});
    if(e.type==='draw')return;
    if(!['damage','heal','hp','correction','maxHp'].includes(e.type))return;
    const seat=document.querySelector(`[data-seat="${CSS.escape(e.player)}"]`);if(!seat)return;const text=document.createElement('span');text.className=`hp-float ${e.type}`;text.textContent=`${e.type==='maxHp'?'上限 ':e.type==='correction'?'纠正 ':e.type==='hp'?'体力 ':''}${e.amount>0?'+':''}${e.amount}`;seat.append(text);if(e.type==='damage')seat.classList.add('hp-impact');setTimeout(()=>text.remove(),1250);
  }
  playerSkills(){const g=GENERAL_MAP[this.me.general];if(!g)return [];const skills=[...g.skills];if(this.me.skillState?.turn?.bonusJizhi)skills.push({...REFERENCE_SKILLS.jueyanJizhi,sourceGeneral:'lukang'});const avatar=this.me.skillState?.avatar;if(avatar){const sk=GENERAL_MAP[avatar.general]?.skills.find(s=>s.name===avatar.skill);if(sk)skills.push({...sk,sourceGeneral:avatar.general});}for(const name of this.me.skillState?.gained||[]){if(skills.some(s=>s.name===name))continue;const preferred=name==='英姿'?GENERAL_MAP.jie_zhouyu:Object.values(GENERAL_MAP).find(g=>g.pack==='standard'&&g.skills.some(s=>s.name===name))||Object.values(GENERAL_MAP).find(g=>g.skills.some(s=>s.name===name));const skill=DERIVED_SKILLS[name]||preferred?.skills.find(s=>s.name===name)||g.skills.find(s=>s.text.includes(name));if(skill)skills.push({...skill,name});}if(this.view.skillAutomation)for(const name of ['黄天','制霸'])if(this.canAccessSkill(name)&&!skills.some(s=>s.name===name)){const lord=this.view.players.find(p=>p.role==='lord'&&!p.dead&&hasSkill(p,name)),skill=GENERAL_MAP[lord?.general]?.skills.find(s=>s.name===name);if(skill)skills.push(skill);}return skills;}
  canAccessSkill(name){if(hasSkill(this.me,name))return true;const group={黄天:'群',制霸:'吴'}[name];return !!group&&GENERAL_MAP[this.me.general]?.faction===group&&this.view.players.some(p=>p.id!==this.view.you&&p.role==='lord'&&!p.dead&&hasSkill(p,name));}
  openSkill(name){
    const skill=this.playerSkills().find(s=>s.name===name),g=GENERAL_MAP[skill.sourceGeneral||DERIVED_SKILLS[name]?.parent||this.me.general],a=abilityInfo(g,skill,this.view.skillAutomation,this.view.completeSkills);this.skillName=name;
    $('skill-title').textContent=`${name} · ${this.view.mode==='manual'?'本桌手动':a.status}`;$('skill-edition').textContent=`${g.name} · ${skill.edition||g.edition||'实体身份版'}${(skill.sourceNote||g.sourceNote)?' · '+(skill.sourceNote||g.sourceNote):''}`;$('skill-text').textContent=skill.text;$('skill-scope').textContent=(this.view.mode==='manual'?'本桌为自由手动，所有效果由同桌裁定。':'')+a.scope;
    $('skill-options').innerHTML=(a.active&&this.canAccessSkill(name)?`<button class="primary small" data-ui="arm-skill" data-name="${esc(name)}">进入自动发动</button>`:'')+a.kinds.map(kind=>`<button class="primary small" data-ui="convert" data-kind="${kind}">选择材料 → ${CARD_MAP[kind].name}</button>`).join(' ')+(a.rejudge?'<p class="muted">进入判定窗口后，在手牌或装备区选中材料，再点“以所选牌改判”。</p>':'');
    $('skill-guide').hidden=!!a.full;
    const key=this.context+':'+name,progress=this.skillProgress.get(key)||[];
    $('skill-guide').open=a.status==='手动结算';$('skill-guide').querySelectorAll('input').forEach((input,i)=>{input.checked=!!progress[i];input.onchange=()=>{const saved=this.skillProgress.get(key)||[];saved[i]=input.checked;this.skillProgress.set(key,saved);};});this.show('skill-dialog');
  }
  clear(){const s=this.current();s.selection.ids=[];s.selectedTargets.splice(0);this.conversion=null;this.armedSkill=null;this.refresh();}
  preset(value){if(value==='custom')return;const form=$('create-form');form.elements.mode.value='auto';form.elements.deckSet.value=value==='beginner'?'standard':'army';form.elements.selectionMode.value='random';form.querySelectorAll('[name=generalPacks]').forEach(e=>e.checked=value!=='beginner'||e.value==='standard');}
  connectRole(role){$('connect-dialog').dataset.role=role;document.querySelectorAll('.connect-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.ui===`connect-${role}`));$('connection-steps').innerHTML=(role==='host'?['生成邀请','发给好友','粘贴回应','连接入席']:['粘贴邀请','生成回应','发回房主','等待入席']).map((s,i)=>`<li class="${i===0?'active':''}">${s}</li>`).join('');$('host-connect').hidden=role!=='host';$('guest-connect').hidden=role!=='guest';}
  connectionStep(n){document.querySelectorAll('#connection-steps li').forEach((e,i)=>e.classList.toggle('active',i<=n));}
  renderCoach(){const panel=$('tutorial-coach');panel.hidden=this.coach<0;document.querySelectorAll('.tutorial-highlight').forEach(e=>e.classList.remove('tutorial-highlight'));if(this.coach<0)return;let [title,copy,selector]=lesson[this.coach];if(!this.view.practice&&this.coach===0)copy='这是当前好友牌桌。你固定在下方，回合框标出当前玩家。教学只提供提示，不替你出牌，也不会另开或覆盖这一局。';if(!this.view.practice&&this.coach===3)copy='受到杀、决斗或濒死求援时，响应区会给出要求。轮到你时选择高亮的响应牌或明确放弃。';$('tutorial-title').textContent=`${this.coach+1} / ${lesson.length} · ${title}`;$('tutorial-copy').textContent=copy;const el=document.querySelector(selector);if(el&&!el.hidden)el.classList.add('tutorial-highlight');}
  control(name,b){
    if(this.scene.control(name,b))return;
    if(name==='logs'){$('record-panel').classList.toggle('drawer');return;}
    if(name==='manual-tools'){document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('manual-controls').open=true;return;}
    if(name==='connect-host'||name==='connect-guest'){this.connectRole(name.endsWith('host')?'host':'guest');return;}
    if(name==='tutorial-start'){$('tutorial-dialog').close();if(this.view){this.coach=0;this.renderCoach();}else this.hooks.practiceLesson();return;}
    if(name==='tutorial-next'){this.coach=this.coach>=lesson.length-1?-1:this.coach+1;this.renderCoach();return;}
    if(name==='tutorial-prev'){this.coach=Math.max(0,this.coach-1);this.renderCoach();return;}
    if(name==='tutorial-close'){this.coach=-1;this.renderCoach();return;}
    if(!this.view)return;
    if(name==='decision-submit'){this.control('skill-choice',{dataset:{choice:$('decision-option').value}});return;}
    if(name==='special-summary'){const p=this.view.players.find(p=>p.id===b.dataset.player);this.detail(`${p.name} · 技能状态`,Object.entries(p.skillState.zones||{}).filter(([,z])=>z.count).map(([key,z])=>`${{field:'田',honor:'荣',duty:'任',wound:'创',song:'箜声'}[key]} ${z.count}：${z.cards?z.cards.map(cardLabel).join('、'):'仅持有者可见'}`).join('\n')+(p.skillState.avatar?`\n化身：${GENERAL_MAP[p.skillState.avatar.general].name} · ${p.skillState.avatar.skill}`:''));return;}
    if(name==='private-view'){this.detail('仅你可见',this.view.pending.privateView.map(id=>cardLabel(id)).join('\n'));return;}
    if(name==='special-zone'){const p=this.view.players.find(p=>p.id===b.dataset.player),z=p.skillState.zones[b.dataset.zone];this.detail(`${p.name} · 专属牌区`,z.cards?z.cards.map(cardLabel).join('\n'):'此牌区牌面不公开');return;}
    if(name==='skill-choice'){const q=this.view.pending;if(q?.kind!=='skill')return;this.hooks.dispatch('skillResolve',{choice:b.dataset.choice,cards:b.dataset.choice==='decline'?[]:[...this.current().selection.ids],targets:b.dataset.choice==='decline'?[]:[...this.current().selectedTargets],as:this.conversion||undefined});return;}
    if(name==='lord-help'){this.hooks.dispatch('activateSkill',{skill:b.dataset.name,cards:[],targets:[]});return;}
    if(name==='arm-skill'){this.armedSkill=b.dataset.name;this.conversion=null;this.skillValue=1;const input=skillInput(this.view,this.me,this.armedSkill);this.skillOption=input.options[0]?.[0]||'';this.multi=input.maxCards>1;this.current().selection.ids=[];this.current().selectedTargets.splice(0);$('skill-dialog').close();this.refresh();return;}
    if(name==='wood-store'){this.hooks.dispatch('storeWood',{cards:[...this.current().selection.ids]});return;}
    if(name==='auto-advance'){this.hooks.dispatch('setAutoAdvance',{enabled:this.me.autoAdvanceEnabled===false});return;}
    if(name==='flow-pause'){this.hooks.dispatch('flowPause',{paused:!this.view.flow?.paused});return;}
    if(name==='opening-skip'){this.hooks.dispatch('finishOpening',{windowId:this.view.flow.opening.id});return;}
    if(name==='phase'){this.hooks.act('phase');return;}
    const s=this.current().selection;
    if(name==='clear'){this.clear();return;}
    if(name==='conversion-clear'){this.conversion=null;this.multi=false;this.refresh();return;}
    if(name==='convert'){this.conversion=b.dataset.kind;this.armedSkill=null;this.multi=this.conversion==='sha'&&equipKind(this.me,'weapon')==='zhangba'||this.conversion==='wanjian'&&hasSkill(this.me,'乱击');s.ids=[];this.current().selectedTargets.splice(0);$('skill-dialog').close();this.refresh();return;}
    if(name==='card-detail'){if(!this.contextCard&&!s.ids.length)throw new Error('先选择一张牌，也可以长按查看');const id=this.contextCard||s.ids[0];$('hand-context').close();this.scene.openCard(CARD_BY_ID[id].kind,id,null,document.querySelector('#hand [data-card="'+CSS.escape(id)+'"]'));return;}
    if(name==='seat-detail'){const p=this.view.players.find(p=>p.id===b.dataset.player),g=GENERAL_MAP[p.general];this.detail(`${p.name} · ${g?.name||'待选将'}`,`${distanceExplanation(this.view,this.view.you,p.id)}\n${g?`${g.edition||'实体身份版'}\n${g.skills.map(s=>`${s.name}［${abilityInfo(g,s,this.view.skillAutomation,this.view.completeSkills).status}］\n${s.text}`).join('\n\n')}`:'开局后显示武将'}\n\n${p.equip.map(id=>cardLabel(id)+'：'+CARD_MAP[CARD_BY_ID[id].kind].rule).join('\n')}`);return;}
    if(name==='skill-tools'){$('skill-dialog').close();$('manual-controls').open=true;document.querySelector('.hand-manual').open=true;this.hooks.toast('先选择材料和目标，再使用手动工具；不会自动执行技能。');return;}
    if(name==='skill-record'){if(![...$('skill-guide').querySelectorAll('input')].every(i=>i.checked))throw new Error('请先确认各步骤，并由同桌核对效果已经执行');this.hooks.dispatch('skill',{skill:this.skillName,completed:true,note:'玩家确认已按步骤完成人工结算，请勿重复执行'});$('skill-dialog').close();return;}
    if(name==='move-left'||name==='move-right'){const id=s.ids[0],i=this.order.indexOf(id),j=i+(name==='move-left'?-1:1);if(i<0||j<0||j>=this.order.length)return;[this.order[i],this.order[j]]=[this.order[j],this.order[i]];$('hand-sort').value='custom';this.refresh();}
  }
  pointerDown(e){
    if(this.view?.tableExperience&&e.target.closest('#hand [data-card-anchor]')&&!e.target.closest('.card-info')){const shell=e.target.closest('[data-card-anchor]'),card=shell.querySelector('.playing-card');if(!card||!this.me.hand.includes(shell.dataset.cardAnchor))return;if(e.button!==0||this.gesture)return;this.gesture={id:shell.dataset.cardAnchor,zone:card.dataset.zone||'hand',pointer:e.pointerId,x:e.clientX,y:e.clientY,rev:this.view.rev,active:false,type:e.pointerType,localSort:true,ready:e.pointerType!=='touch'};this.longPress=setTimeout(()=>{if(this.gesture)this.gesture.ready=true;},250);return;}
    const card=e.target.closest('#hand [data-card],.wood-hand [data-card]');const skill=e.target.closest('[data-skill]');if(skill&&this.armedSkill===skill.dataset.skill&&this.targetLimit()>0){this.gesture={id:null,skill:true,pointer:e.pointerId,x:e.clientX,y:e.clientY,rev:this.view.rev,active:false,type:e.pointerType};return;}if(!card||e.button!==0||this.busy||this.gesture||this.view.pending||this.armedSkill&&['急袭','清侧'].includes(this.armedSkill))return;
    this.gesture={id:card.dataset.card,zone:card.dataset.zone,pointer:e.pointerId,x:e.clientX,y:e.clientY,rev:this.view.rev,active:false,long:false,type:e.pointerType};
    this.longPress=setTimeout(()=>{if(this.gesture&&!this.gesture.active){this.gesture.long=true;this.ignoreClickUntil=performance.now()+650;this.ignoredCard=card.dataset.card;this.scene.openCard(CARD_BY_ID[card.dataset.card].kind,card.dataset.card,null,card);}},650);
  }
  pointerMove(e){
    if(this.gesture?.localSort){this.moveHand(e);return;}
    const g=this.gesture;if(!g||g.pointer!==e.pointerId||g.long)return;
    const dx=e.clientX-g.x,dy=e.clientY-g.y;if(!g.active){if(Math.hypot(dx,dy)<10)return;clearTimeout(this.longPress);if(g.type==='touch'&&Math.abs(dx)>Math.abs(dy)*1.4){this.cancelDrag();return;}
      g.active=true;const s=this.current().selection;if(!g.skill){if(!this.multi||!s.ids.includes(g.id))s.ids=[g.id];s.zone=g.zone||'hand';s.owner=this.view.you;}this.scene.hidePreview();this.refresh();const origin=(g.skill?document.querySelector('[data-skill="'+CSS.escape(this.armedSkill)+'"]'):document.querySelector('[data-card="'+CSS.escape(g.id)+'"]'))?.getBoundingClientRect();g.anchorX=origin?origin.x+origin.width/2:g.x;g.anchorY=origin?origin.y:g.y;$('drag-layer').hidden=false;document.body.classList.add('dragging');}
    g.lastX=e.clientX;g.lastY=e.clientY;this.updateAim();e.preventDefault();const line=$('drag-line'),x=g.anchorX,y=g.anchorY;line.setAttribute('d',aimPath(x,y,e.clientX,e.clientY));
    document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));const hit=document.elementFromPoint(e.clientX,e.clientY),seat=hit?.closest('[data-seat]');const advice=this.skillTargetAdvice()||this.selectedAdvice(),candidate=seat&&advice.targets.find(t=>t.id===seat.dataset.seat);if(candidate&&(['self','all'].includes(advice.mode)&&seat.dataset.seat!==this.view.you||hit.closest('.gear-slot,.gear-info,.mini-card,.seat-details,.played-card,.skill-zone-chip')))candidate.ok=false;$('drag-layer').dataset.aim=seat?(candidate?.ok?'valid':'invalid'):'none';if(candidate?.ok)seat.classList.add('drag-over');
  }
  pointerUp(e){
    const g=this.gesture;if(!g||g.pointer!==e.pointerId)return;clearTimeout(this.longPress);if(g.localSort&&(g.scrolled||g.active&&!g.aim)){this.ignoreClickUntil=performance.now()+450;this.ignoredCard=g.id;this.cancelDrag();return;}if(!g.active){this.gesture=null;return;}
    const hit=document.elementFromPoint(e.clientX,e.clientY),seat=hit?.closest('[data-seat]'),use=hit?.closest('#use-zone'),response=hit?.closest('#response-panel'),advice=this.selectedAdvice();
    this.ignoreClickUntil=performance.now()+450;this.ignoredCard=g.id;this.cancelDrag();if(this.view.rev!==g.rev||this.busy)return;
    try{
      if(hit?.closest('.gear-slot,.gear-info,.mini-card,.seat-details,.played-card,.skill-zone-chip'))return;
      if(this.armedSkill){if(this.targetLimit()===0){if(use||seat?.dataset.seat===this.view.you)this.hooks.act('play');}else if(seat&&this.skillTargetAdvice().targets.some(t=>t.id===seat.dataset.seat&&t.ok)){if(this.targetLimit()===1){this.current().selectedTargets.splice(0,2,seat.dataset.seat);this.refresh();this.hooks.act('play');}else this.hooks.selectTarget(seat.dataset.seat);}return;}
      if(this.view.pending){if(response&&responseOptions(this.view,this.current().selection.ids).some(x=>x.ok))this.hooks.act('respond');return;}
      if(this.view.mode==='manual'){if(seat){this.current().selectedTargets.splice(0,2,seat.dataset.seat);this.refresh();this.hooks.act('play');}return;}
      if(['self','all'].includes(advice.mode)){if(use||seat?.dataset.seat===this.view.you){if(!advice.ok)throw new Error(advice.reason);this.hooks.act('play');}return;}
      if(seat){const option=advice.targets.find(t=>t.id===seat.dataset.seat);if(!option?.ok)throw new Error(option?.reason||'请选择合法目标');if(advice.mode==='single'){this.current().selectedTargets.splice(0,2,seat.dataset.seat);this.refresh();this.hooks.act('play');}else this.hooks.selectTarget(seat.dataset.seat);}
    }catch(error){this.hooks.toast(error.message);}
  }
  reorderCard(id,delta){const list=[...this.sortedHand()],i=list.indexOf(id),j=i+delta;if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];this.order=list;$('hand-sort').value='custom';this.refresh();document.querySelector(`#hand [data-card-anchor="${CSS.escape(id)}"] .playing-card`)?.focus({preventScroll:true});}
  moveHand(e){
    const g=this.gesture;if(g.pointer!==e.pointerId)return;const dx=e.clientX-g.x,dy=e.clientY-g.y,hand=$('hand'),band=hand.getBoundingClientRect();
    if(!g.ready){if(Math.abs(dx)>8){hand.scrollLeft-=e.clientX-(g.lastX??g.x);g.lastX=e.clientX;g.scrolled=true;this.ignoreClickUntil=performance.now()+500;this.ignoredCard=g.id;}return;}
    if(!g.active&&Math.hypot(dx,dy)<8)return;g.active=true;clearTimeout(this.longPress);e.preventDefault();this.scene.hidePreview();
    const inside=e.clientX>=band.left-12&&e.clientX<=band.right+12&&e.clientY>=band.top-26&&e.clientY<=band.bottom+26;
    if(inside){g.aim=false;$('drag-layer').hidden=true;document.body.classList.remove('dragging');document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));let ghost=document.querySelector('.sorting-ghost');if(!ghost){const source=document.querySelector(`#hand [data-card-anchor="${CSS.escape(g.id)}"] .playing-card`);if(!source)return;ghost=source.cloneNode(true);ghost.removeAttribute('data-card');ghost.classList.add('sorting-ghost');ghost.setAttribute('aria-hidden','true');$('motion-layer').append(ghost);}ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';
      const list=[...this.sortedHand()],nodes=[...hand.querySelectorAll('[data-card-anchor]')],nearest=nodes.filter(n=>n.dataset.cardAnchor!==g.id).sort((a,b)=>Math.abs(a.getBoundingClientRect().x+a.offsetWidth/2-e.clientX)-Math.abs(b.getBoundingClientRect().x+b.offsetWidth/2-e.clientX))[0];if(nearest){const from=list.indexOf(g.id),to=list.indexOf(nearest.dataset.cardAnchor);if(from!==to&&Math.abs(nearest.getBoundingClientRect().x+nearest.offsetWidth/2-e.clientX)<nearest.offsetWidth*.52){list.splice(from,1);list.splice(to,0,g.id);this.order=list;$('hand-sort').value='custom';this.refresh();}}document.querySelector(`#hand [data-card-anchor="${CSS.escape(g.id)}"] .playing-card`)?.classList.add('sorting-source');return;
    }
    document.querySelector('.sorting-ghost')?.remove();document.querySelectorAll('.sorting-source').forEach(x=>x.classList.remove('sorting-source'));
    if(this.busy||this.view.pending||this.view.status!=='playing'){g.aim=false;return;}
    if(!g.aim){g.aim=true;const s=this.current().selection;if(!this.multi||!s.ids.includes(g.id))s.ids=[g.id];s.zone=g.zone;s.owner=this.view.you;this.refresh();}
    document.body.classList.add('dragging');$('drag-layer').hidden=false;g.lastX=e.clientX;g.lastY=e.clientY;this.updateAim();
  }
  updateAim(){
    const g=this.gesture;if(!g?.active||g.localSort&&!g.aim)return;const source=g.skill?document.querySelector('[data-skill="'+CSS.escape(this.armedSkill)+'"]'):document.querySelector('#hand [data-card="'+CSS.escape(g.id)+'"]')||document.querySelector('[data-card="'+CSS.escape(g.id)+'"]'),r=source?.getBoundingClientRect();if(!r)return;
    const x=g.lastX??g.x,y=g.lastY??g.y;$('drag-line').setAttribute('d',aimPath(r.x+r.width/2,r.y,x,y));const hit=document.elementFromPoint(x,y),seat=hit?.closest('[data-seat]'),advice=this.skillTargetAdvice()||this.selectedAdvice(),candidate=seat&&advice.targets.find(t=>t.id===seat.dataset.seat),valid=!!candidate?.ok&&!hit?.closest('.gear-slot,.gear-info,.mini-card,.seat-details,.played-card,.skill-zone-chip,.chain-inspect')&&!(['self','all'].includes(advice.mode)&&seat.dataset.seat!==this.view.you);
    $('drag-layer').dataset.aim=seat?(valid?'valid':'invalid'):'none';document.querySelectorAll('.drag-over').forEach(e=>e.classList.remove('drag-over'));if(valid)seat.classList.add('drag-over');
    if(!this.view.tableExperience){cancelAnimationFrame(this.aimFrame);this.aimFrame=requestAnimationFrame(()=>this.updateAim());}
  }
  cancelDrag(){cancelAnimationFrame(this.aimFrame);document.querySelector('.sorting-ghost')?.remove();document.querySelectorAll('.sorting-source').forEach(e=>e.classList.remove('sorting-source'));this.scene?.hidePreview();clearTimeout(this.longPress);this.gesture=null;$('drag-layer').hidden=true;document.body.classList.remove('dragging');document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));}
}
