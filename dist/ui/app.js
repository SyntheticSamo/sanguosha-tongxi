import {ConnectionUX} from './connection.js';
import {skillInput} from '../backend/skills.js';
import { DECK,CARD_TYPES,CARD_MAP,CARD_BY_ID,SUITS,rankText,red,cardLabel,cardName,DECK_SETS } from '../data/cards.js';
import { GENERALS,GENERAL_MAP,ROLES,PHASES,GENERAL_PACKS } from '../data/generals.js';
import { distance,attackRange,equipKind } from '../backend/primitives.js';
import { PeerLink,decodeSignal } from '../sync/rtc.js';
import { parseRoomLink,saveRelayBase,relayBase } from '../sync/relay.js';
import { AutoConnect } from './auto-connect.js';
import { envelope,parseMessage,acceptSnapshot } from '../sync/protocol.js';
import {skillSupport} from '../data/skill-support.js';
import { Tabletop } from './tabletop.js';
import { inspectUse,responseOptions,conversionKinds,discardAdvice } from '../backend/advisor.js';
const FACTION_CLASS={'魏':'wei','蜀':'shu','吴':'wu','群':'qun'};

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let view=null,isHost=false,worker=null,links=new Map(),guestLink=null,pending=null,pendingTimer=null,selection={ids:[],zone:'hand',owner:null},libraryMode='generals',libraryGain=false,actionCallback=null,toastTimer;
let lastTap=null,historyCache=null,rememberCreatedName=false;
let selectedTargets=[],targetContext=null,lessonRequested=false;
const ui=new Tabletop({state:()=>({view,isHost,pending,selection,selectedTargets}),toast,dispatch,act:name=>actions[name]?.(),selectTarget,history:requestHistory,arrange:sendArrange,practiceLesson:()=>{create(true,{quickStart:true,size:2});lessonRequested=true;}});
const connections=new ConnectionUX({state:()=>({view,isHost}),role:role=>ui.connectRole(role),open:()=>open('connect-dialog'),status,toast,copy,accept,offer,peers:renderPeers});
const auto=new AutoConnect({state:()=>({view,isHost}),status,peers:renderPeers,guestLink:()=>guestLink,
  newLink:({roomId,onCandidate})=>{const link=new PeerLink({roomId,iceServers:iceServers(),onMessage:incoming,onStatus:rtcStatus,onCandidate});link.createdAt=Date.now();links.set(link.id,link);renderPeers();return link;},
  dropLink:link=>{link.close();links.delete(link.id);renderPeers();},
  newGuestLink:({roomId,linkId,onCandidate})=>{const link=new PeerLink({roomId,linkId,iceServers:iceServers(),onMessage:incoming,onStatus:rtcStatus,onCandidate}),previous=guestLink;guestLink=link;previous?.close();if(view&&view.roomId!==roomId)view=null;isHost=false;renderPeers();ui.connectionStep(2);return link;}});
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
function toast(message,duration=5500){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,duration);}
function open(id){const d=$(id);if(!d.open)d.showModal();}
function closeAll(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function status(message){$('connection-status').textContent=message;}
function setBadge(text,ok=false){$('scene-network').title=text;$('scene-network').style.color=ok?'#a7c98e':'#d2b478';$('network-badge').innerHTML=`<i style="background:${ok?'#7d9b78':'#b19360'}"></i>${esc(text)}`;}
function reset(){connections.reset();auto.stop();ui.reset();rememberCreatedName=false;lessonRequested=false;for(const link of links.values())link.close();links.clear();guestLink?.close();guestLink=null;worker?.terminate();worker=null;clearTimeout(pendingTimer);pending=null;view=null;selection={ids:[],zone:'hand',owner:null};selectedTargets=[];targetContext=null;}
function exitPractice(){
  if(!view)return;const online=!view.practice,host=isHost;
  closeAll();reset();isHost=false;actionCallback=null;clearTimeout(toastTimer);$('toast').hidden=true;
  $('game').hidden=true;$('welcome').hidden=false;$('practice-exit').hidden=true;setBadge('本地就绪',true);
  window.scrollTo({top:0,behavior:'instant'});document.querySelector('#welcome [data-do=practice]').focus({preventScroll:true});
  if(online)toast(host?'已返回主页并断开联机；可恢复最近的本地主持牌桌。':'已返回主页；保留本标签页，可用新邀请回到原席位。');
}
function startWorker(){
  worker=new Worker(new URL('../backend/worker.js',import.meta.url),{type:'module'});
  worker.onerror=e=>toast(`本地后端异常：${e.message}`);
  worker.onmessage=e=>{
    const m=e.data;
    if(m.kind==='created'){ui.scene.openingRequested=true;rememberCreatedName=true;}else if(m.kind==='view'){
      if(m.route==='host'){view=mergeHistory(m.view);if(rememberCreatedName){rememberCreatedName=false;if(!view.practice)connections.rememberName(view.players.find(p=>p.id===view.you)?.name);}if(lessonRequested&&view.practice){ui.coach=0;lessonRequested=false;}render();if(!view.practice&&auto.enabled)auto.host(view.roomId);}
      else {const link=links.get(m.route);if(link){link.seatId=m.view.you;link.displayName=m.view.players.find(p=>p.id===m.view.you)?.name;connections.synced(link);renderPeers();}sendRemote(m.route,envelope('snapshot',{view:m.view}));}
    }else if(m.kind==='history'){if(m.route==='host')acceptHistory(m.page);else sendRemote(m.route,envelope('snapshot',{historyPage:m.page}));
    }else if(m.kind==='ack'){
      if(m.route==='host')ack(m.id);else sendRemote(m.route,envelope('ack',{id:m.id,rev:m.rev}));
    }else if(m.kind==='error'){
      if(m.route==='host'){ack(m.requestId);toast(m.message);}
      else {sendRemote(m.route,envelope('error',{message:m.message,id:m.requestId}));worker.postMessage({kind:'sync',route:m.route});}
    }else if(m.kind==='export'){
      const blob=new Blob([JSON.stringify(m.snapshot,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`同席-房主私密恢复-${m.snapshot.roomId.slice(0,8)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('恢复文件已导出；其中含隐藏信息与席位凭据，请私下保管。');
    }else if(m.kind==='restored'){toast(view?.practice?'演练已恢复。':'牌桌已恢复。请逐个重新邀请，好友在原标签页回应即可回到原席位。',view?.practice?1600:5500);}
    else if(m.kind==='warning')toast(m.message);
    else if(m.kind==='superseded'){links.get(m.route)?.close();links.delete(m.route);renderPeers();}
  };
}
function sendRemote(id,data){const link=links.get(id);if(link?.channel?.readyState==='open'){try{link.send(data);}catch(e){toast(e.message);}}}
function ack(id){if(pending&&(!id||id===pending.id)){if(['use','respond','recast'].includes(pending.type))selectedTargets=[];pending=null;clearTimeout(pendingTimer);ui.refresh();if($('library-dialog').open)renderLibrary();}}
function dispatch(type,data={}){
  if(!view)throw new Error('请先创建或加入牌桌');
  if(pending)throw new Error('上一操作正在等待确认，请稍候');
  const action={type,phaseWindowId:view.flow?.skillWindow?.id,...data,id:crypto.randomUUID(),rev:view.rev};pending=action;ui.refresh();
  pendingTimer=setTimeout(()=>{if(pending?.id===action.id){pending=null;toast('操作未收到确认，请重新同步后核对结果。不会自动重复执行。');sync();}},10000);
  if(isHost)worker.postMessage({kind:'action',action});
  else {try{guestLink.send(envelope('action',{action}));}catch(error){ack(action.id);throw error;}}
}
function sync(){if(isHost)worker?.postMessage({kind:'sync'});else if(guestLink?.channel?.readyState==='open')guestLink.send(envelope('sync'));else toast('连接未建立，请重新交换连接信息。');}
function mergeHistory(next){
  if(next.pending?.handReadyIn!==undefined)next.pending.handReadyAt=Date.now()+next.pending.handReadyIn;
  const meta=next.turnHistory,key=`${next.roomId}:${next.you}:${meta?.turnId}:${next.presentationResetRev}`;
  if(historyCache?.key!==key)historyCache={key,records:new Map(),before:meta?.before||0};
  for(const p of next.centerPlays||[])historyCache.records.set(p.id,p);
  if(meta){historyCache.before=Math.min(historyCache.before,meta.before);next.turnHistory={...meta,before:historyCache.before};}
  next.centerPlays=[...historyCache.records.values()].sort((a,b)=>a.rev-b.rev||Number(a.id.split(':')[1])-Number(b.id.split(':')[1]));return next;
}
function requestHistory(){if(!view?.turnHistory?.before||historyCache?.loading)return;const key=historyCache.key;historyCache.loading=true;document.querySelector('[data-ui=history-page]')?.setAttribute('disabled','');setTimeout(()=>{if(historyCache?.key===key&&historyCache.loading){historyCache.loading=false;document.querySelector('[data-ui=history-page]')?.removeAttribute('disabled');}},5000);const history={turnId:view.turnHistory.turnId,before:view.turnHistory.before};if(isHost)worker.postMessage({kind:'sync',history});else guestLink?.send(envelope('sync',{history}));}
function acceptHistory(page){if(!view||page.turnId!==view.turnHistory?.turnId||!historyCache)return;historyCache.loading=false;for(const p of page.records)if(!historyCache.records.has(p.id))historyCache.records.set(p.id,p);historyCache.before=Math.min(historyCache.before,page.before);if(view.pending)delete view.pending.handReadyIn;view=mergeHistory(view);ui.refresh();ui.scene.centerPlays();}
function sendArrange(){const q=view?.pending;if(q?.kind!=='chooseCard'||q.target!==view.you||pending||Date.now()>=(q.handReadyAt||0))return;const action={type:'arrangeHand',id:crypto.randomUUID(),rev:view.rev,windowId:q.windowId};if(isHost)worker.postMessage({kind:'action',action});else guestLink?.send(envelope('action',{action}));}
function hostOnly(kind,extra={}){if(!isHost||!worker)throw new Error('此操作需要房主设备');worker.postMessage({kind,...extra});}
function create(practice=false,config={}){
  reset();isHost=true;startWorker();closeAll();worker.postMessage({kind:'create',config:{hostId:crypto.randomUUID(),token:crypto.randomUUID(),name:config.name||'演练玩家',size:Number(config.size||4),ex:config.ex??true,practice,mode:config.mode||'auto',deckSet:config.deckSet||'army',selectionMode:config.selectionMode||'random',quickStart:!!config.quickStart,skillAutomation:config.skillAutomation??true,completeSkills:true,interactionMode:'tactile',equipmentAutomation:true,tableExperience:true,generalPacks:config.generalPacks||Object.keys(GENERAL_PACKS)}});setBadge(practice?'本地演练':'房主 · 等待连接',true);
}
// Two independent public STUN providers on their standard ports; relay TURN only when
// the optional signaling Worker supplied short-lived credentials.
const DEFAULT_STUN=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']}];
function iceServers(){
  let servers=[];if($('use-stun').checked)servers.push(...DEFAULT_STUN,...auto.ice);
  if($('ice-config').value.trim()){
    const custom=JSON.parse($('ice-config').value);if(!Array.isArray(custom)||custom.length>8)throw new Error('ICE 配置应为不超过 8 项的数组');
    for(const c of custom)if(!c||!c.urls||![c.urls].flat().every(u=>typeof u==='string'&&/^(stun|stuns|turn|turns):/.test(u)))throw new Error('ICE 服务器地址格式不正确');servers.push(...custom);
  }return servers;
}
function rtcStatus(state,link,error){
  if(link.disposed||!isHost&&guestLink&&link!==guestLink)return;
  const recovered=state==='connected'&&link.interrupted&&link.channel?.readyState==='open';link.status=recovered?'open':state;connections.track(state,link,error);renderPeers();
  if(state==='open'||recovered){
    status(recovered?'连接已恢复，正在重新同步。':'连接已建立，正在同步牌桌。');ui.connectionStep(3);ui.baseline();link.interrupted=false;link.awaitingSync=true;
    if(isHost)setBadge(`房主 · ${[...links.values()].filter(l=>l.channel?.readyState==='open').length} 个连接`,true);
    else {
      if(recovered){link.send(envelope('sync'));setBadge('P2P 已连接',true);return;}
      let token=sessionStorage.getItem('tongxi-seat:'+link.roomId);if(!token){token=crypto.randomUUID();sessionStorage.setItem('tongxi-seat:'+link.roomId,token);}
      const hello=()=>link.send(envelope('hello',{credentials:{name:$('guest-name').value||'无名侠客',token}}));hello();setBadge('P2P 已连接',true);
      // On a fast LAN path the guest's channel can open before the host has even applied
      // the reply, and that first hello is lost. Joining with the same seat token is
      // idempotent, so repeat it until the first snapshot arrives.
      let tries=0;const again=()=>{if(link.disposed||link.synced||link!==guestLink||link.channel?.readyState!=='open'||++tries>8)return;try{hello();}catch{}link.helloTimer=setTimeout(again,1200);};clearTimeout(link.helloTimer);link.helloTimer=setTimeout(again,1200);
    }
  }
  if(state==='disconnected'){ui.baseline();setBadge(isHost?'房主 · 网络波动':'网络波动 · 等待恢复');}
  if(state==='failed'&&link.waiting){setBadge(isHost?'房主 · 等待好友连通':'等待房主接收回应');return;}
  if(['failed','closed','protocol-error'].includes(state)){ui.baseline();if(!isHost){setBadge('连接中断');ack();}else setBadge('房主 · 有玩家掉线');}
  if(auto.track(state,link))setBadge(isHost?'房主 · 自动修复连接':'正在自动修复连接');
}
const rates=new Map();
function incoming(raw,link){
  try{
    const m=parseMessage(raw);
    if(isHost){
      const now=Date.now();const rate=rates.get(link.id)||{at:now,n:0};if(now-rate.at>1000){rate.at=now;rate.n=0;}if(++rate.n>20)throw new Error('操作过快');rates.set(link.id,rate);
      if(m.kind==='hello')worker.postMessage({kind:'join',route:link.id,credentials:m.credentials});
      else if(m.kind==='action')worker.postMessage({kind:'action',route:link.id,action:m.action});
      else if(m.kind==='sync')worker.postMessage({kind:'sync',route:link.id,history:m.history});
      else throw new Error('房主不接受此类消息');
    }else{
      if(link!==guestLink)return;
      if(m.kind==='snapshot'){
        if(m.historyPage){acceptHistory(m.historyPage);return;}
        if(m.view?.roomId!==link.roomId)throw new Error('同步房间不一致');if(acceptSnapshot(view,m.view)){view=mergeHistory(m.view);render();connections.synced(link);}
      }else if(m.kind==='ack')ack(m.id);
      else if(m.kind==='error'){ack(m.id);toast(m.message);}
      else throw new Error('客户端不接受此类消息');
    }
  }catch(error){toast(`联机消息：${error.message}`);}
}
function renderPeers(){
  const all=isHost?[...links.values()]:guestLink?[guestLink]:[],names={new:'等待交换',connecting:'正在连接',connected:'正在建立通道',open:'已连接',disconnected:'网络波动',failed:'连接失败',closed:'已关闭','protocol-error':'连接异常',retrying:'仍在尝试连通'},paths={direct:'直连',relay:'中继'};
  $('peer-status-list').textContent=all.filter(l=>!l.disposed).map(l=>`${l.displayName||(isHost?(l.relayPeer?'房间链接':'邀请 '+(l.inviteNo||'')):'房主')} · ${names[l.waiting&&['failed','disconnected'].includes(l.status||l.pc.connectionState)?'retrying':l.status||l.pc.connectionState]||'等待交换'}${l.pathType&&paths[l.pathType]?' · '+paths[l.pathType]:''}`).join('\n');
}
function offer(){return connections.run('offer',async()=>{
  if(!isHost||!view)throw new Error('先创建牌桌，再生成邀请');if(view.practice)throw new Error('演练仅限本地；请创建普通牌桌');
  status('正在准备邀请，请稍候…');
  for(const [id,l]of links)if(!l.relayPeer&&(['failed','closed'].includes(l.pc.connectionState)||!l.acceptedSDP&&l.createdAt&&Date.now()-l.createdAt>900000)){l.close();links.delete(id);}
  if(links.size>=16)throw new Error('未完成邀请过多，请先让好友完成连接');
  const link=new PeerLink({roomId:view.roomId,iceServers:iceServers(),onMessage:incoming,onStatus:rtcStatus});link.createdAt=Date.now();links.set(link.id,link);
  try{const code=await link.offer();if(links.get(link.id)!==link||view?.roomId!==link.roomId)return;connections.offerReady(code,link);renderPeers();ui.connectionStep(1);status('邀请已准备好。分享链接给一位好友，收到回应后粘贴即可连接。');}
  catch(e){link.close();links.delete(link.id);if(links.has(link.id)||view?.roomId===link.roomId)throw e;}
});}
function answer(){return connections.run('answer',async()=>{
  const epoch=connections.epoch,text=$('offer-input').value,signal=await decodeSignal(text);if(epoch!==connections.epoch)return;if(text!==$('offer-input').value)throw new Error('邀请已更改，请重新点击加入');if(signal.type!=='offer')throw new Error('这里需要房主的邀请，不是回应');
  if(isHost&&view)throw new Error('当前设备正在主持牌桌，请用另一个标签页加入');
  if(guestLink?.offeredSDP===signal.sdp&&guestLink.roomId===signal.roomId&&guestLink.id===signal.linkId&&!guestLink.disposed){if(['failed','closed'].includes(guestLink.pc.connectionState))throw new Error('这份邀请已用过，请向房主索取新邀请');connections.answerReady(guestLink.answerCode);return;}
  if(guestLink?.channel?.readyState==='open'&&view?.status==='playing'&&view.roomId!==signal.roomId)throw new Error('请保留当前牌桌，在新标签页加入另一桌');
  const candidate=new PeerLink({roomId:signal.roomId,linkId:signal.linkId,iceServers:iceServers(),onMessage:incoming,onStatus:rtcStatus}),previous=guestLink;
  connections.pendingPeer=candidate;status('正在准备回应，请稍候…');
  try{const code=await candidate.answer(signal);if(guestLink!==previous||epoch!==connections.epoch){candidate.close();return;}if(text!==$('offer-input').value)throw new Error('邀请已更改，请重新点击加入');candidate.offeredSDP=signal.sdp;candidate.answerCode=code;guestLink=candidate;previous?.close();candidate.persist();view=null;isHost=false;connections.answerReady(code);renderPeers();ui.connectionStep(2);status('回应已准备好。复制或分享给房主，然后保留本页等待入席。');}
  catch(e){candidate.close();if(epoch===connections.epoch)throw e;}
  finally{if(connections.pendingPeer===candidate)connections.pendingPeer=null;}
});}
function accept(text=$('answer-input').value){return connections.run('accept',async()=>{
  const epoch=connections.epoch,signal=await decodeSignal(text);if(epoch!==connections.epoch||text!==$('answer-input').value)return;if(signal.type!=='answer')throw new Error('这是一份邀请，请粘贴好友生成的回应');
  const link=links.get(signal.linkId);if(!isHost||!link||view?.roomId!==signal.roomId)throw new Error('没有匹配的邀请，请确认这是本桌好友的回应');
  const changed=await link.accept(signal);if(changed)link.persist();if(epoch!==connections.epoch)return;connections.acceptedText=text;$('answer-feedback').textContent='✓ 回应已接收';
  status(link.channel?.readyState==='open'?'已连接，好友已入席。':changed?'回应已接收，正在建立连接…':'回应已接收，请等待连接。');
});}
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
  const focusedKind=document.activeElement?.dataset?.gainKind;
  $('library-dialog').querySelector('h2').textContent=libraryGain?'获得 · 当前控制角色':'牌与武将';
  const q=$('library-search').value.trim().toLowerCase(),pack=$('library-pack').value;
  document.querySelectorAll('[data-library]').forEach(b=>b.classList.toggle('active',b.dataset.library===libraryMode));
  $('library-pack').hidden=libraryMode!=='generals';
  $('library-content').classList.remove('hero-deal','deal-playing');if($('skip-deal'))$('skip-deal').hidden=true;
  if(libraryMode==='generals'){
    const list=GENERALS.filter(g=>(!pack||g.pack===pack)&&`${g.name}${g.faction}${g.skills.map(s=>s.name+s.text).join('')}`.includes(q));
    $('library-content').innerHTML=list.map(g=>{
      const chosen=view?.players.find(p=>p.general===g.id);
      const can=view?.status==='lobby'&&view.selectionMode!=='random'&&view.generalPacks.includes(g.pack)&&(!chosen||chosen.id===view.you)&&(view.selectionMode!=='five'||view.choices.includes(g.id));
      return `<article class="library-entry faction-${FACTION_CLASS[g.faction]||'none'} ${view?.choices.includes(g.id)?'candidate':''}" data-seal="${esc(g.faction)}"><span class="entry-faction">${GENERAL_PACKS[g.pack]} · ${g.faction} · ${g.hp} 体力</span><h3>${esc(g.name)}</h3><span class="entry-hp" aria-hidden="true">${'<i></i>'.repeat(Math.max(0,Math.min(8,g.hp)))}</span><details><summary>技能 / 版本</summary>${g.skills.map(s=>`<p><b>${esc(s.name)}</b> <small>${skillSupport(g,s,view?.completeSkills??true).full?'':'本局范围见详情'}</small> · ${esc(s.text)}</p>`).join('')}<p class="muted">${esc(g.edition||'标准身份版')}${g.sourceNote?' · '+esc(g.sourceNote):''}</p><a class="text-link" href="${esc(g.source)}" target="_blank" rel="noreferrer">来源 ↗</a></details>${can?`<button class="secondary small full" data-general="${esc(g.id)}">${chosen?'已选':'选此武将'}</button>`:chosen?`<p class="muted">${esc(chosen.name)} 已选</p>`:''}</article>`;
    }).join('');
    if(view?.status==='lobby'&&view.selectionMode==='five'){
      const candidates=view.choices.map(id=>GENERAL_MAP[id]);
      const candidateIds=new Set(candidates.map(g=>g.id));
      $('library-content').innerHTML=candidates.map(g=>`<article class="library-entry candidate faction-${FACTION_CLASS[g.faction]||'none'}" data-seal="${esc(g.faction)}"><span class="entry-faction">${GENERAL_PACKS[g.pack]} · ${g.hp} 体力</span><h3>${esc(g.name)}</h3><span class="entry-hp" aria-hidden="true">${'<i></i>'.repeat(Math.max(0,Math.min(8,g.hp)))}</span>${g.skills.map(k=>`<p><b>${esc(k.name)}</b> <small>${skillSupport(g,k,view?.completeSkills??true).full?'':'本局范围见详情'}</small> · ${esc(k.text)}</p>`).join('')}<button class="primary small full" data-general="${esc(g.id)}">选择</button></article>`).join('');
      ui.scene.deal(candidates);
    }
  }else $('library-content').innerHTML=CARD_TYPES.filter(c=>`${c.name}${c.type}${c.rule}`.includes(q)).map(c=>{
    const copies=DECK.filter(d=>d.kind===c.id),remaining=view?.practiceCards?.[c.id]||0,blocked=!!pending||view?.status!=='playing'||!!view?.pending||!!view?.flow?.opening||view?.peek.length>0;
    return `<article class="library-entry"><span class="entry-faction">${c.type} · ${copies.length} 张</span><h3>${c.name}</h3>${libraryGain?`<button class="primary small full" data-gain-kind="${c.id}" ${!remaining||blocked?'disabled':''}>${remaining?'获得 · 可取 '+remaining+' 张':'无可取牌'}</button>`:''}<p>${c.rule}</p><details><summary>牌面分布</summary><div class="distribution">${copies.map(d=>`${SUITS[d.suit]}${rankText(d.rank)}${d.ex?' EX':d.pack==='army'?' 军争':''}`).join(' · ')}</div></details></article>`;
  }).join('');
  if(!$('library-content').children.length)$('library-content').innerHTML='<p class="muted">无匹配内容</p>';
  if(focusedKind&&$('library-dialog').open){const next=$('library-content').querySelector(`[data-gain-kind="${CSS.escape(focusedKind)}"]`);(next&&!next.disabled?next:$('library-search')).focus({preventScroll:true});}
}
function actionDialog(title,description,callback,{label='结算说明（可选）',required=false}={}){
  $('action-title').textContent=title;$('action-description').textContent=description;$('action-label').firstChild.textContent=label;$('action-text').value='';$('action-text').required=required;actionCallback=callback;open('action-dialog');
}
const actions={
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
  connect:()=>{ui.connectRole(isHost?'host':'guest');auto.render();open('connect-dialog');},
  'join-room':()=>{if(isHost&&view&&!view.practice)throw new Error('当前设备正在主持牌桌，请用另一个标签页加入');if(isHost&&view?.practice){reset();isHost=false;setBadge('本地就绪',true);}connections.rememberName($('guest-name').value);auto.join();},'copy-room':()=>copy($('room-link')),
  'share-room':async()=>{const url=$('room-link').value;if(!url)throw new Error('房间链接尚未就绪');if(typeof navigator.share==='function'){try{await navigator.share({title:'同席 · 一起玩三国杀',text:'打开链接、确认昵称即可入席。',url});return;}catch(e){if(e.name==='AbortError')return;}}await copy($('room-link'));},
  practice:()=>create(true,{quickStart:true}),'exit-practice':exitPractice,tutorial:()=>{closeAll();document.querySelector('#tutorial-dialog [data-ui=tutorial-start]').textContent=view?'在当前牌桌显示提示':'进入教学演练';open('tutorial-dialog');},
  'practice-gain':()=>{libraryGain=true;libraryMode='cards';$('library-search').value='';renderLibrary();open('library-dialog');},
  library:()=>{libraryGain=false;if(view?.status==='lobby'&&view.selectionMode!=='random')libraryMode='generals';renderLibrary();open('library-dialog');},rules:()=>open('rules-dialog'),tools:()=>open('tools-dialog'),
  offer,answer,accept,sync,'share-offer':()=>connections.share('offer'),'share-answer':()=>connections.share('answer'),'copy-offer-code':()=>copy($('offer-output')),'connection-retry':()=>connections.retry(),
  'copy-offer':()=>copy($('offer-link')),'copy-answer':()=>copy($('answer-output')),
  start:()=>dispatch('start'),'local-seat':()=>dispatch('localSeat'),
  draw:()=>dispatch('draw',{n:Number($('draw-count').value)}),reveal:()=>dispatch('reveal',{n:Number($('draw-count').value)}),
  peek:()=>actionDialog('私看牌顶','输入观看数量（1–5）。这是私密区域，其余玩家只看到观看张数。',n=>dispatch('peek',{n:Number(n)}),{label:'观看张数',required:true}),
  phase:()=>view.flow?.skillWindow?dispatch('continuePhase',{windowId:view.flow.skillWindow.id}):dispatch('phase'),'next-turn':()=>dispatch('phase',{nextTurn:true}),
  'hp-minus':()=>dispatch('hp',{target:target(),delta:-1}),'hp-plus':()=>dispatch('hp',{target:target(),delta:1}),
  play:()=>{if(ui.chainDraft?.choice){ui.control('skill-choice',{dataset:{choice:ui.chainDraft.choice}});return;}if(ui.beginChain())return;if(ui.armedSkill){const skill=ui.armedSkill;ui.armedSkill=null;ui.multi=false;dispatch('activateSkill',{skill,cards:selection.owner===view.you?[...selection.ids]:[],targets:[...selectedTargets],value:ui.skillValue,option:ui.skillOption});return;}const cards=selectedOwned();if(view.mode==='manual'){dispatch('play',{cards,target:target(),as:ui.conversion?CARD_MAP[ui.conversion].name:undefined});return;}const advice=inspectUse(view,cards,ui.conversion,selectedTargets);if(!advice.ok)throw new Error(advice.reason);dispatch('use',advice.action);},
  'manual-play':()=>dispatch('play',{cards:picked('hand'),target:target()}),
  'play-as':()=>{$('skill-title').textContent='选择基础转化';$('skill-edition').textContent='技能与武器提供的基础转化';$('skill-text').textContent='选择结果，再选择材料牌。仅列出当前武将或装备具备的转化；具体时机见技能详情。';$('skill-scope').textContent='选择材料，不需要输入牌名。';$('skill-options').innerHTML=conversionKinds(view).map(kind=>'<button class="primary small" data-ui="convert" data-kind="'+kind+'">转化为'+CARD_MAP[kind].name+'</button>').join(' ')||'<p>当前没有已支持的基础转化；复杂效果请使用手动打出。</p>';$('skill-guide').hidden=true;open('skill-dialog');},
  discard:()=>{if(selection.owner!==view?.you||!['hand','equip','judge'].includes(selection.zone)||!selection.ids.length)throw new Error('请选择自己的手牌、装备或判定牌');dispatch('discard',{cards:[...selection.ids]});},
  give:()=>dispatch('give',{cards:picked('hand'),target:target()}),equip:()=>dispatch('equip',{cards:picked('hand')}),
  delay:()=>{const cards=picked('hand'),seat=target();if(cards.length===1&&CARD_MAP[CARD_BY_ID[cards[0]].kind].type!=='延时')actionDialog('国色：置为乐不思蜀','由同桌确认方块转化合法性；实体牌不改变牌面，转化含义记录在日志中。',()=>dispatch('delay',{cards,target:seat,as:'乐不思蜀'}));else dispatch('delay',{cards,target:seat});},
  'take-pool':()=>dispatch('takePool',{cards:picked('pool')}),'clear-pool':()=>dispatch('clearPool'),
  'random-take':()=>dispatch('randomTake',{target:target()}),'random-discard':()=>dispatch('randomTake',{target:target(),discard:true}),
  'public-take':()=>publicMove('hand'),'public-discard':()=>publicMove('discard'),'public-pool':()=>publicMove('pool'),'public-pass':()=>publicMove('judge'),
  'peek-top':()=>view.pending?.kind==='skill'?dispatch('skillResolve',{choice:'top',cards:picked('peek'),targets:[]}):dispatch('returnPeek',{cards:picked('peek'),to:'top'}),'peek-bottom':()=>view.pending?.kind==='skill'?dispatch('skillResolve',{choice:'bottom',cards:picked('peek'),targets:[]}):dispatch('returnPeek',{cards:picked('peek'),to:'bottom'}),
  'peek-hand':()=>view.pending?.kind==='skill'?dispatch('skillResolve',{choice:'keep',cards:[],targets:[]}):dispatch('returnPeek',{cards:picked('peek'),to:'hand'}),'peek-pool':()=>dispatch('returnPeek',{cards:picked('peek'),to:'pool'}),
  'discard-pile':()=>{$('pile-content').innerHTML=view?.discard.map(id=>cardHTML(id,'discard',null,true)).join('')||'<p class="muted">弃牌堆为空。</p>';open('pile-dialog');},
  undo:()=>hostOnly('undo'),'rewind-phase':()=>{document.querySelector('.hand-manual').open=false;hostOnly('rewindPhase',{id:crypto.randomUUID(),rev:view.rev});},export:()=>hostOnly('export'),'reveal-role':()=>dispatch('role'),
  death:()=>{if(!isHost)throw new Error('仅房主可确认阵亡');dispatch('death',{target:target()});},
  finish:()=>{if(!isHost)throw new Error('仅房主可结束对局');dispatch('finish',{winner:$('winner').value});closeAll();},
  restore:()=>{reset();isHost=true;startWorker();closeAll();worker.postMessage({kind:'restore'});setBadge('房主 · 本地恢复',true);}
};
function hostOnlyCheck(){if(!isHost)throw new Error('仅房主可纠正');if(view?.you!==view?.hostId)throw new Error('请先切换到房主席位，再执行房主纠正');}
function selectedOwned(){if(selection.owner!==view.you||!['hand','equip','wood','material'].includes(selection.zone)||!selection.ids.length)throw new Error('请选择自己的牌');return [...selection.ids];}
function publicMove(to){if(!['equip','judge'].includes(selection.zone)||!selection.ids.length)throw new Error('请选择一位玩家的公开区域卡牌');dispatch('publicMove',{cards:[...selection.ids],zone:selection.zone,target:selection.owner,to,destination:target()});}
async function copy(input){if(!input.value)throw new Error('请先生成连接信息');try{await navigator.clipboard.writeText(input.value);toast('已复制连接信息。');return true;}catch{input.focus();input.select();toast('请按 Ctrl+C 复制选中的连接信息。');return false;}}
document.addEventListener('pointermove',()=>{if(ui.gesture?.active)lastTap=null;});
for(const type of ['pointercancel','blur'])window.addEventListener(type,()=>{lastTap=null;});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(ui.ignoreClick(e)){e.preventDefault();return;}
  if(b.hasAttribute('data-close')){b.closest('dialog').close();return;}
  const d=b.dataset;
  if('targetSeat'in d){e.preventDefault();if(performance.now()<(ui.ignoreTargetUntil||0))return;if(ui.isChainSelection()&&!ui.chainDraft)return;selectTarget(d.targetSeat);return;}
  if(!('do'in d||'card'in d||'gainKind'in d||'library'in d||'general'in d||'skill'in d||'remove'in d))return;
  e.preventDefault();
  try{
    if(d.card){
      const promptCost=view.pending?.kind==='skill'&&view.pending.player===view.you&&(view.pending.cardChoices||[]).includes(d.card),activeCost=!view.pending&&view.turn===view.you&&view.phase===3&&ui.armedSkill&&skillInput(view,me(),ui.armedSkill).maxCards>0,conversionCost=ui.conversion&&(view.pending?responseOptions(view,[d.card]).some(o=>o.ok):inspectUse(view,[d.card],ui.conversion,selectedTargets).targets.some(t=>t.ok));
      const responseCost=view.pending?.player===view.you&&responseOptions(view,[d.card]).some(o=>o.ok);const cost=promptCost||d.owner===view.you&&(activeCost||conversionCost||responseCost);
      if((d.zone==='equip'||d.zone==='judge'&&view.tableExperience&&view.mode==='auto')&&!cost){ui.scene.openCard(view.delayKinds[d.card]||CARD_BY_ID[d.card].kind,d.card,d.owner,b);return;}
      const quick=!pending&&e.detail!==0&&d.zone==='hand'&&d.owner===view.you&&!view.pending&&!ui.armedSkill&&!ui.conversion&&!ui.multi;
      const repeat=quick&&lastTap?.id===d.card&&lastTap.rev===view.rev&&performance.now()-lastTap.at<360;
      lastTap=quick?{id:d.card,rev:view.rev,at:performance.now()}:null;
      if(repeat&&CARD_BY_ID[d.card].kind==='tiesuo'){lastTap=null;if(!selection.ids.includes(d.card))selectCard(d.card,d.zone,d.owner||null);ui.beginChain();return;}
      if(repeat){lastTap=null;const advice=inspectUse(view,[d.card],null,[]),kind=CARD_BY_ID[d.card].kind;if(advice.ok&&['self','all'].includes(advice.mode)&&(CARD_MAP[kind].slot||['tao','jiu','wuzhong','shandian','wugu','taoyuan','nanman','wanjian'].includes(kind))){dispatch('use',advice.action);return;}}
      selectCard(d.card,d.zone,d.owner||null);
    }
    else if(d.library){libraryMode=d.library;renderLibrary();}
    else if(d.gainKind){dispatch('practiceGain',{kind:d.gainKind});}
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
$('library-dialog').addEventListener('close',()=>{if(libraryGain){libraryGain=false;$('practice-gain').focus({preventScroll:true});}});
$('home-link').addEventListener('click',e=>{e.preventDefault();if(view){$('game').scrollIntoView({behavior:'smooth'});}else window.scrollTo({top:0,behavior:'smooth'});});
(()=>{
  $('relay-url').value=relayBase();$('share-room').hidden=typeof navigator.share!=='function';
  $('relay-url').addEventListener('change',()=>{try{const v=saveRelayBase($('relay-url').value);$('relay-url').value=relayBase();toast(v?'已保存自动配对服务地址。':'已关闭自动配对，使用手动交换。');if(isHost&&view&&!view.practice){auto.stop();if(auto.enabled)auto.host(view.roomId);}auto.render();}catch(e){toast(e.message);}});
  let target=null;try{target=parseRoomLink(location.href);}catch(e){history.replaceState(null,'',location.pathname+location.search);toast(e.message);}
  if(target){history.replaceState(null,'',location.pathname+location.search);auto.openJoin(target);ui.connectRole('guest');open('connect-dialog');status('房间链接已打开。确认昵称后点击「加入牌桌」。');$('guest-name').focus();$('guest-name').select();}
  else {connections.initial();auto.render();}
})();
window.addEventListener('beforeunload',e=>{if(view?.status==='playing'){e.preventDefault();e.returnValue='';}});
