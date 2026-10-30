import { DECK,CARD_TYPES,CARD_MAP,CARD_BY_ID,SUITS,rankText,red,cardLabel,cardName,DECK_SETS } from '../data/cards.js';
import { GENERALS,GENERAL_MAP,ROLES,PHASES,GENERAL_PACKS } from '../data/generals.js';
import { distance,attackRange,equipKind } from '../backend/primitives.js';
import { PeerLink,decodeSignal } from '../sync/rtc.js';
import { envelope,parseMessage,acceptSnapshot } from '../sync/protocol.js';
import {skillSupport} from '../data/skill-support.js';
import { Tabletop } from './tabletop.js';
import { inspectUse,responseOptions,conversionKinds,discardAdvice } from '../backend/advisor.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let view=null,isHost=false,worker=null,links=new Map(),guestLink=null,pending=null,pendingTimer=null,selection={ids:[],zone:'hand',owner:null},libraryMode='generals',actionCallback=null,toastTimer;
let selectedTargets=[],targetContext=null,lessonRequested=false;
const ui=new Tabletop({state:()=>({view,isHost,pending,selection,selectedTargets}),toast,dispatch,act:name=>actions[name]?.(),selectTarget,practiceLesson:()=>{create(true,{quickStart:true,size:2});lessonRequested=true;}});
const me=()=>view?.players.find(p=>p.id===view.you);
const target=()=>selectedTargets[0]||view?.you;
const allowsTwoTargets=()=>ui.twoTargets();
function selectTarget(id){
  if(!view?.players.some(p=>p.id===id))return;
  if(ui.targetLimit()===0)return;const index=selectedTargets.indexOf(id);
  if(index>=0)selectedTargets.splice(index,1);
  else if(ui.targetLimit()>1)selectedTargets=selectedTargets.length<ui.targetLimit()?[...selectedTargets,id]:[...selectedTargets.slice(0,ui.targetLimit()-1),id];
  else selectedTargets=[id];
  renderTargets();
}
function renderTargets(){ui.refresh();}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function open(id){const d=$(id);if(!d.open)d.showModal();}
function closeAll(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function status(message){$('connection-status').textContent=message;}
function setBadge(text,ok=false){$('scene-network').title=text;$('scene-network').style.color=ok?'#a7c98e':'#d2b478';$('network-badge').innerHTML=`<i style="background:${ok?'#7d9b78':'#b19360'}"></i>${esc(text)}`;}
function reset(){ui.reset();lessonRequested=false;for(const link of links.values())link.close();links.clear();guestLink?.close();guestLink=null;worker?.terminate();worker=null;clearTimeout(pendingTimer);pending=null;view=null;selection={ids:[],zone:'hand',owner:null};selectedTargets=[];targetContext=null;}
function startWorker(){
  worker=new Worker(new URL('../backend/worker.js',import.meta.url),{type:'module'});
  worker.onerror=e=>toast(`本地后端异常：${e.message}`);
  worker.onmessage=e=>{
    const m=e.data;
    if(m.kind==='created'){ui.scene.openingRequested=true;}else if(m.kind==='view'){
      if(m.route==='host'){view=m.view;if(lessonRequested&&view.practice){ui.coach=0;lessonRequested=false;}render();}
      else sendRemote(m.route,envelope('snapshot',{view:m.view}));
    }else if(m.kind==='ack'){
      if(m.route==='host')ack(m.id);else sendRemote(m.route,envelope('ack',{id:m.id,rev:m.rev}));
    }else if(m.kind==='error'){
      if(m.route==='host'){ack(m.requestId);toast(m.message);}
      else {sendRemote(m.route,envelope('error',{message:m.message,id:m.requestId}));worker.postMessage({kind:'sync',route:m.route});}
    }else if(m.kind==='export'){
      const blob=new Blob([JSON.stringify(m.snapshot,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`同席-房主私密恢复-${m.snapshot.roomId.slice(0,8)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('恢复文件已导出；其中含隐藏信息与席位凭据，请私下保管。');
    }else if(m.kind==='restored'){toast('牌桌已恢复。请逐个重新邀请，好友在原标签页回应即可回到原席位。');}
    else if(m.kind==='warning')toast(m.message);
    else if(m.kind==='superseded'){links.get(m.route)?.close();links.delete(m.route);renderPeers();}
  };
}
function sendRemote(id,data){const link=links.get(id);if(link?.channel?.readyState==='open'){try{link.send(data);}catch(e){toast(e.message);}}}
function ack(id){if(pending&&(!id||id===pending.id)){pending=null;clearTimeout(pendingTimer);ui.refresh();}}
function dispatch(type,data={}){
  if(!view)throw new Error('请先创建或加入牌桌');
  if(pending)throw new Error('上一操作正在等待确认，请稍候');
  const action={type,...data,id:crypto.randomUUID(),rev:view.rev};pending=action;ui.refresh();
  pendingTimer=setTimeout(()=>{if(pending?.id===action.id){pending=null;toast('操作未收到确认，请重新同步后核对结果。不会自动重复执行。');sync();}},10000);
  if(isHost)worker.postMessage({kind:'action',action});
  else {try{guestLink.send(envelope('action',{action}));}catch(error){ack(action.id);throw error;}}
}
function sync(){if(isHost)worker?.postMessage({kind:'sync'});else if(guestLink?.channel?.readyState==='open')guestLink.send(envelope('sync'));else toast('连接未建立，请重新交换连接信息。');}
function hostOnly(kind,extra={}){if(!isHost||!worker)throw new Error('此操作需要房主设备');worker.postMessage({kind,...extra});}
function create(practice=false,config={}){
  reset();isHost=true;startWorker();closeAll();worker.postMessage({kind:'create',config:{hostId:crypto.randomUUID(),token:crypto.randomUUID(),name:config.name||'演练玩家',size:Number(config.size||4),ex:config.ex??true,practice,mode:config.mode||'auto',deckSet:config.deckSet||'army',selectionMode:config.selectionMode||'random',quickStart:!!config.quickStart,skillAutomation:config.skillAutomation??true,completeSkills:true,interactionMode:'tactile',equipmentAutomation:true,tableExperience:true,generalPacks:config.generalPacks||Object.keys(GENERAL_PACKS)}});setBadge(practice?'本地演练':'房主 · 等待连接',true);
}
function iceServers(){
  let servers=[];if($('use-stun').checked)servers.push({urls:'stun:stun.l.google.com:19302'});
  if($('ice-config').value.trim()){
    const custom=JSON.parse($('ice-config').value);if(!Array.isArray(custom)||custom.length>8)throw new Error('ICE 配置应为不超过 8 项的数组');
    for(const c of custom)if(!c||!c.urls||![c.urls].flat().every(u=>typeof u==='string'&&/^(stun|stuns|turn|turns):/.test(u)))throw new Error('ICE 服务器地址格式不正确');servers.push(...custom);
  }return servers;
}
function rtcStatus(state,link,error){
  if(!isHost&&guestLink&&link!==guestLink)return;
  link.status=state;renderPeers();
  if(state==='open'){
    status('直连已建立，牌桌状态正在同步。');ui.connectionStep(3);ui.baseline();
    if(isHost)setBadge(`房主 · ${[...links.values()].filter(l=>l.channel?.readyState==='open').length} 个连接`,true);
    else {
      let token=sessionStorage.getItem('tongxi-seat:'+link.roomId);if(!token){token=crypto.randomUUID();sessionStorage.setItem('tongxi-seat:'+link.roomId,token);}
      link.send(envelope('hello',{credentials:{name:$('guest-name').value||'无名侠客',token}}));setBadge('P2P 已连接',true);
    }
  }
  if(['disconnected','failed','closed','protocol-error'].includes(state)){
    ui.baseline();status(error||'有连接断开。受限网络可尝试 TURN；重连需重新交换邀请与回应。');
    if(!isHost){setBadge('连接中断');ack();}else setBadge('房主 · 请查看连接状态');
  }
}
const rates=new Map();
function incoming(raw,link){
  try{
    const m=parseMessage(raw);
    if(isHost){
      const now=Date.now();const rate=rates.get(link.id)||{at:now,n:0};if(now-rate.at>1000){rate.at=now;rate.n=0;}if(++rate.n>20)throw new Error('操作过快');rates.set(link.id,rate);
      if(m.kind==='hello')worker.postMessage({kind:'join',route:link.id,credentials:m.credentials});
      else if(m.kind==='action')worker.postMessage({kind:'action',route:link.id,action:m.action});
      else if(m.kind==='sync')worker.postMessage({kind:'sync',route:link.id});
      else throw new Error('房主不接受此类消息');
    }else{
      if(link!==guestLink)return;
      if(m.kind==='snapshot'){
        if(m.view?.roomId!==link.roomId)throw new Error('同步房间不一致');if(acceptSnapshot(view,m.view)){view=m.view;render();}
      }else if(m.kind==='ack')ack(m.id);
      else if(m.kind==='error'){ack(m.id);toast(m.message);}
      else throw new Error('客户端不接受此类消息');
    }
  }catch(error){toast(`联机消息：${error.message}`);}
}
function renderPeers(){
  const all=isHost?[...links.values()]:guestLink?[guestLink]:[];
  $('peer-status-list').textContent=all.map(l=>`${l.id.slice(0,6)} · ${{new:'待交换',connecting:'连接中',connected:'通道建立中',open:'已连接',disconnected:'断开',failed:'失败',closed:'已关闭'}[l.status]||l.status||'待交换'}`).join(' / ');
}
async function offer(){
  if(!isHost||!view)throw new Error('先创建牌桌，再生成邀请');if(view.practice)throw new Error('演练仅限本地；请创建普通牌桌');
  $('offer-output').value='';status('正在收集网络候选，请稍候…');
  // Dispose unsuccessful invitations without disturbing established peers.
  for(const [id,l]of links)if(['failed','closed'].includes(l.pc.connectionState)){l.close();links.delete(id);}
  if(links.size>=16)throw new Error('待连接邀请过多，请刷新并恢复牌桌后重试');
  const link=new PeerLink({roomId:view.roomId,iceServers:iceServers(),onMessage:incoming,onStatus:rtcStatus});links.set(link.id,link);
  try{$('offer-output').value=await link.offer();ui.connectionStep(1);status('邀请已生成。发给一位好友，再粘贴其回应。下一位好友请生成新的邀请。');}catch(e){link.close();links.delete(link.id);throw e;}
}
async function answer(){
  $('answer-output').value='';
  const signal=await decodeSignal($('offer-input').value);if(signal.type!=='offer')throw new Error('这里需要房主的邀请');
  if(isHost&&view)throw new Error('当前设备正在主持牌桌，请用另一个标签页或浏览器加入');
  guestLink?.close();view=null;isHost=false;$('answer-output').value='';status('正在生成回应，请稍候…');
  guestLink=new PeerLink({roomId:signal.roomId,linkId:signal.linkId,iceServers:iceServers(),onMessage:incoming,onStatus:rtcStatus});
  try{$('answer-output').value=await guestLink.answer(signal);ui.connectionStep(2);status('回应已生成。将回应发回房主，等待房主接收。');}catch(error){guestLink.close();throw error;}
}
async function accept(){const signal=await decodeSignal($('answer-input').value);const link=links.get(signal.linkId);if(!isHost||!link)throw new Error('没有对应的邀请，请确认此回应来自本次受邀好友');await link.accept(signal);status('已接收回应，正在建立直连…');}
function selectCard(id,zone,owner){
  if(ui.multi&&selection.owner===owner&&['hand','wood','material'].includes(selection.zone)&&['hand','wood'].includes(zone)){selection.zone='material';}else if(selection.zone!==zone||selection.owner!==owner)selection={ids:[],zone,owner};
  const i=selection.ids.indexOf(id),multi=ui.multi||zone==='peek'||view?.mode==='auto'&&view.phase===4&&view.turn===view.you;
  if(i>=0)selection.ids.splice(i,1);else if(multi)selection.ids.push(id);else selection.ids=[id];renderCards();
}
function picked(zone){if(selection.zone!==zone||!selection.ids.length)throw new Error('请先在对应牌区选择卡牌');return [...selection.ids];}
function cardHTML(id,zone,owner=null,staticOnly=false){return ui.card(id,zone,owner,staticOnly);}
function render(){
 if(!view)return;const context=view.roomId+':'+view.you;if(targetContext!==context){selectedTargets=[];selection={ids:[],zone:'hand',owner:view.you};targetContext=context;}
 ui.render();if($('library-dialog').open)renderLibrary();
}
function renderCards(){ui.refresh();}
function renderLibrary(){
  const q=$('library-search').value.trim().toLowerCase(),pack=$('library-pack').value;
  document.querySelectorAll('[data-library]').forEach(b=>b.classList.toggle('active',b.dataset.library===libraryMode));
  $('library-pack').hidden=libraryMode!=='generals';
  $('library-content').classList.remove('hero-deal','deal-playing');if($('skip-deal'))$('skip-deal').hidden=true;
  if(libraryMode==='generals'){
    const list=GENERALS.filter(g=>(!pack||g.pack===pack)&&`${g.name}${g.faction}${g.skills.map(s=>s.name+s.text).join('')}`.includes(q));
    $('library-content').innerHTML=list.map(g=>{
      const chosen=view?.players.find(p=>p.general===g.id);
      const can=view?.status==='lobby'&&view.selectionMode!=='random'&&view.generalPacks.includes(g.pack)&&(!chosen||chosen.id===view.you)&&(view.selectionMode!=='five'||view.choices.includes(g.id));
      return `<article class="library-entry ${view?.choices.includes(g.id)?'candidate':''}"><span class="entry-faction">${GENERAL_PACKS[g.pack]} · ${g.faction} · ${g.hp} 体力</span><h3>${esc(g.name)}</h3><details><summary>技能 / 版本</summary>${g.skills.map(s=>`<p><b>${esc(s.name)}</b> <small>${skillSupport(g,s,view?.completeSkills??true).status}</small> · ${esc(s.text)}</p>`).join('')}<p class="muted">${esc(g.edition||'标准身份版')}${g.sourceNote?' · '+esc(g.sourceNote):''}</p><a class="text-link" href="${esc(g.source)}" target="_blank" rel="noreferrer">来源 ↗</a></details>${can?`<button class="secondary small full" data-general="${esc(g.id)}">${chosen?'已选':'选此武将'}</button>`:chosen?`<p class="muted">${esc(chosen.name)} 已选</p>`:''}</article>`;
    }).join('');
    if(view?.status==='lobby'&&view.selectionMode==='five'){
      const candidates=view.choices.map(id=>GENERAL_MAP[id]);
      const candidateIds=new Set(candidates.map(g=>g.id));
      $('library-content').innerHTML=candidates.map(g=>`<article class="library-entry candidate"><span class="entry-faction">${GENERAL_PACKS[g.pack]} · ${g.hp} 体力</span><h3>${esc(g.name)}</h3>${g.skills.map(k=>`<p><b>${esc(k.name)}</b> <small>${skillSupport(g,k,view?.completeSkills??true).status}</small> · ${esc(k.text)}</p>`).join('')}<button class="primary small full" data-general="${esc(g.id)}">选择</button></article>`).join('');
      ui.scene.deal(candidates);
    }
  }else $('library-content').innerHTML=CARD_TYPES.filter(c=>`${c.name}${c.type}${c.rule}`.includes(q)).map(c=>{
    const copies=DECK.filter(d=>d.kind===c.id);
    return `<article class="library-entry"><span class="entry-faction">${c.type} · ${copies.length} 张${c.manual?' · 手动':''}</span><h3>${c.name}</h3><p>${c.rule}</p><details><summary>牌面分布</summary><div class="distribution">${copies.map(d=>`${SUITS[d.suit]}${rankText(d.rank)}${d.ex?' EX':d.pack==='army'?' 军争':''}`).join(' · ')}</div></details></article>`;
  }).join('');
  if(!$('library-content').children.length)$('library-content').innerHTML='<p class="muted">无匹配内容</p>';
}
function actionDialog(title,description,callback,{label='结算说明（可选）',required=false}={}){
  $('action-title').textContent=title;$('action-description').textContent=description;$('action-label').firstChild.textContent=label;$('action-text').value='';$('action-text').required=required;actionCallback=callback;open('action-dialog');
}
const actions={
  'clear-targets':()=>{selectedTargets=[];renderTargets();},
  judge:()=>dispatch('judge'),pindian:()=>dispatch('pindian',{target:target()}),
  recast:()=>dispatch('recast',{cards:picked('hand'),as:ui.conversion||undefined}),
  'phase-discard':()=>dispatch('discard',{cards:picked('hand')}),
  respond:()=>{const cards=selectedOwned(),options=responseOptions(view,cards),choice=options.find(o=>o.ok&&o.as===ui.conversion)||options.find(o=>o.ok);if(!choice)throw new Error(options[0]?.reason||'请选择合法响应牌');dispatch('respond',{cards,as:choice.as||undefined});},
  pass:()=>dispatch('pass'),bagua:()=>dispatch('bagua'),rejudge:()=>dispatch('rejudge',{cards:selectedOwned()}),
  'effect-hand':()=>dispatch('pickEffect',{windowId:view.pending?.windowId,zone:'hand'}),
  'effect-card':()=>dispatch('pickEffect',{windowId:view.pending?.windowId,zone:selection.zone,card:selection.ids[0]}),
  'effect-market':()=>dispatch('pickEffect',{windowId:view.pending?.windowId,card:picked('pool')[0]}),
  correct:()=>{hostOnlyCheck();dispatch('correct',{op:$('correction-op').value,target:target(),value:Number($('correction-value').value),reason:$('correction-reason').value});},
  create:()=>open('create-dialog'),
  join:()=>{ui.connectRole('guest');open('connect-dialog');$('offer-input').focus();},
  connect:()=>{ui.connectRole(isHost?'host':'guest');open('connect-dialog');},
  practice:()=>create(true,{quickStart:true}),tutorial:()=>{closeAll();document.querySelector('#tutorial-dialog [data-ui=tutorial-start]').textContent=view?'在当前牌桌显示提示':'进入教学演练';open('tutorial-dialog');},
  library:()=>{if(view?.status==='lobby'&&view.selectionMode!=='random')libraryMode='generals';renderLibrary();open('library-dialog');},rules:()=>open('rules-dialog'),tools:()=>open('tools-dialog'),
  offer,answer,accept,sync,
  'copy-offer':()=>copy($('offer-output')),'copy-answer':()=>copy($('answer-output')),
  start:()=>dispatch('start'),'local-seat':()=>dispatch('localSeat'),
  draw:()=>dispatch('draw',{n:Number($('draw-count').value)}),reveal:()=>dispatch('reveal',{n:Number($('draw-count').value)}),
  peek:()=>actionDialog('私看牌顶','输入观看数量（1–5）。这是私密区域，其余玩家只看到观看张数。',n=>dispatch('peek',{n:Number(n)}),{label:'观看张数',required:true}),
  phase:()=>dispatch('phase'),'next-turn':()=>dispatch('phase',{nextTurn:true}),
  'hp-minus':()=>dispatch('hp',{target:target(),delta:-1}),'hp-plus':()=>dispatch('hp',{target:target(),delta:1}),
  play:()=>{if(ui.armedSkill){const skill=ui.armedSkill;ui.armedSkill=null;ui.multi=false;dispatch('activateSkill',{skill,cards:selection.owner===view.you?[...selection.ids]:[],targets:[...selectedTargets],value:ui.skillValue,option:ui.skillOption});return;}const cards=selectedOwned();if(view.mode==='manual'){dispatch('play',{cards,target:target(),as:ui.conversion?CARD_MAP[ui.conversion].name:undefined});return;}const advice=inspectUse(view,cards,ui.conversion,selectedTargets);if(!advice.ok)throw new Error(advice.reason);dispatch('use',advice.action);},
  'manual-play':()=>dispatch('play',{cards:picked('hand'),target:target()}),
  'play-as':()=>{$('skill-title').textContent='选择基础转化';$('skill-edition').textContent='技能与武器提供的基础转化';$('skill-text').textContent='选择结果，再选择材料牌。仅列出当前武将或装备具备的转化；自动与人工分支以技能面板标记为准。';$('skill-scope').textContent='系统校验材料与时机，不需要输入牌名。';$('skill-options').innerHTML=conversionKinds(view).map(kind=>'<button class="primary small" data-ui="convert" data-kind="'+kind+'">转化为'+CARD_MAP[kind].name+'</button>').join(' ')||'<p>当前没有已支持的基础转化；复杂效果请使用手动打出。</p>';$('skill-guide').hidden=true;open('skill-dialog');},
  discard:()=>{if(selection.owner!==view?.you||!['hand','equip','judge'].includes(selection.zone)||!selection.ids.length)throw new Error('请选择自己的手牌、装备或判定牌');dispatch('discard',{cards:[...selection.ids]});},
  give:()=>dispatch('give',{cards:picked('hand'),target:target()}),equip:()=>dispatch('equip',{cards:picked('hand')}),
  delay:()=>{const cards=picked('hand'),seat=target();if(cards.length===1&&CARD_MAP[CARD_BY_ID[cards[0]].kind].type!=='延时')actionDialog('国色：置为乐不思蜀','由同桌确认方块转化合法性；实体牌不改变牌面，转化含义记录在日志中。',()=>dispatch('delay',{cards,target:seat,as:'乐不思蜀'}));else dispatch('delay',{cards,target:seat});},
  'take-pool':()=>dispatch('takePool',{cards:picked('pool')}),'clear-pool':()=>dispatch('clearPool'),
  'random-take':()=>dispatch('randomTake',{target:target()}),'random-discard':()=>dispatch('randomTake',{target:target(),discard:true}),
  'public-take':()=>publicMove('hand'),'public-discard':()=>publicMove('discard'),'public-pool':()=>publicMove('pool'),'public-pass':()=>publicMove('judge'),
  'peek-top':()=>view.pending?.kind==='skill'?dispatch('skillResolve',{choice:'top',cards:picked('peek'),targets:[]}):dispatch('returnPeek',{cards:picked('peek'),to:'top'}),'peek-bottom':()=>view.pending?.kind==='skill'?dispatch('skillResolve',{choice:'bottom',cards:picked('peek'),targets:[]}):dispatch('returnPeek',{cards:picked('peek'),to:'bottom'}),
  'peek-hand':()=>view.pending?.kind==='skill'?dispatch('skillResolve',{choice:'keep',cards:[],targets:[]}):dispatch('returnPeek',{cards:picked('peek'),to:'hand'}),'peek-pool':()=>dispatch('returnPeek',{cards:picked('peek'),to:'pool'}),
  'discard-pile':()=>{$('pile-content').innerHTML=view?.discard.map(id=>cardHTML(id,'discard',null,true)).join('')||'<p class="muted">弃牌堆为空。</p>';open('pile-dialog');},
  undo:()=>hostOnly('undo'),export:()=>hostOnly('export'),'reveal-role':()=>dispatch('role'),
  death:()=>{if(!isHost)throw new Error('仅房主可确认阵亡');dispatch('death',{target:target()});},
  finish:()=>{if(!isHost)throw new Error('仅房主可结束对局');dispatch('finish',{winner:$('winner').value});closeAll();},
  restore:()=>{reset();isHost=true;startWorker();closeAll();worker.postMessage({kind:'restore'});setBadge('房主 · 本地恢复',true);}
};
function hostOnlyCheck(){if(!isHost)throw new Error('仅房主可纠正');if(view?.you!==view?.hostId)throw new Error('请先切换到房主席位，再执行房主纠正');}
function selectedOwned(){if(selection.owner!==view.you||!['hand','equip','wood','material'].includes(selection.zone)||!selection.ids.length)throw new Error('请选择自己的牌');return [...selection.ids];}
function publicMove(to){if(!['equip','judge'].includes(selection.zone)||!selection.ids.length)throw new Error('请选择一位玩家的公开区域卡牌');dispatch('publicMove',{cards:[...selection.ids],zone:selection.zone,target:selection.owner,to,destination:target()});}
async function copy(input){if(!input.value)throw new Error('请先生成连接信息');try{await navigator.clipboard.writeText(input.value);toast('已复制连接信息。');}catch{input.focus();input.select();toast('请按 Ctrl+C 复制选中的连接信息。');}}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(ui.ignoreClick(e)){e.preventDefault();return;}
  if(b.hasAttribute('data-close')){b.closest('dialog').close();return;}
  const d=b.dataset;
  if('targetSeat'in d){e.preventDefault();selectTarget(d.targetSeat);return;}
  if(!('do'in d||'card'in d||'library'in d||'general'in d||'skill'in d||'remove'in d))return;
  e.preventDefault();
  try{
    if(d.card)selectCard(d.card,d.zone,d.owner||null);
    else if(d.library){libraryMode=d.library;renderLibrary();}
    else if(d.general){dispatch('general',{general:d.general});$('library-dialog').close();}
    else if(d.remove)dispatch('removeSeat',{target:d.remove});
    else if(d.skill){$('skill-guide').hidden=false;ui.openSkill(d.skill);}
    else if(d.do){b.disabled=true;try{await actions[d.do]?.();}finally{b.disabled=false;ui.refresh();}}
  }catch(error){toast(error.message);status(error.message);}
});
$('create-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),n=Number(f.get('size'));if(!String(f.get('size')||'').trim()||!Number.isFinite(n)||!Number.isInteger(n)||n<2||n>8){$('size-hint').textContent='请输入2–8之间的整数';return;}create(false,{name:f.get('name'),size:f.get('size'),ex:f.has('ex'),selectionMode:f.get('selectionMode'),deckSet:f.get('deckSet'),mode:f.get('mode'),skillAutomation:f.has('skillAutomation'),generalPacks:f.getAll('generalPacks')});});
$('create-form').elements.size.addEventListener('input',e=>{const n=Number(e.target.value);$('size-hint').textContent=e.target.value&&Number.isInteger(n)&&n>=2&&n<=8?n<4?'⚠ 2–3人为非标准身份游戏，自定义对抗。':'标准身份局 · '+n+'人':'请输入2–8之间的整数';});
$('action-form').addEventListener('submit',e=>{e.preventDefault();try{actionCallback?.($('action-text').value.trim());$('action-dialog').close();}catch(error){toast(error.message);}});
$('chat-form').addEventListener('submit',e=>{e.preventDefault();try{dispatch('chat',{message:$('chat-input').value});$('chat-input').value='';}catch(error){toast(error.message);}});
$('library-search').addEventListener('input',renderLibrary);
$('library-pack').addEventListener('change',renderLibrary);
$('general-pack-options').innerHTML=Object.entries(GENERAL_PACKS).map(([id,name])=>`<label class="check-label"><input type="checkbox" name="generalPacks" value="${id}" checked>${name}</label>`).join('');
$('library-pack').innerHTML='<option value="">全部</option>'+Object.entries(GENERAL_PACKS).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
document.addEventListener('change',e=>{if(e.target.id==='control-seat')hostOnly('control',{seat:e.target.value});});
$('import-file').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2_000_000)throw new Error('恢复文件过大');const snapshot=JSON.parse(await file.text());reset();isHost=true;startWorker();closeAll();worker.postMessage({kind:'restore',snapshot});setBadge('房主 · 导入恢复',true);}catch(error){toast(error.message);}finally{e.target.value='';}});
$('home-link').addEventListener('click',e=>{e.preventDefault();if(view){$('game').scrollIntoView({behavior:'smooth'});}else window.scrollTo({top:0,behavior:'smooth'});});
const initialOffer=new URLSearchParams(location.hash.slice(1)).get('offer');if(initialOffer){$('offer-input').value=initialOffer;history.replaceState(null,'',location.pathname+location.search);open('connect-dialog');}
window.addEventListener('beforeunload',e=>{if(view?.status==='playing'){e.preventDefault();e.returnValue='';}});
