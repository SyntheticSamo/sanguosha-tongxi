import { DECK,CARD_TYPES,CARD_MAP,CARD_BY_ID,SUITS,rankText,red,cardLabel,cardName } from '../data/cards.js';
import { GENERALS,GENERAL_MAP,ROLES,PHASES } from '../data/generals.js';
import { PeerLink,decodeSignal } from '../sync/rtc.js';
import { envelope,parseMessage,acceptSnapshot } from '../sync/protocol.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let view=null,isHost=false,worker=null,links=new Map(),guestLink=null,pending=null,pendingTimer=null,selection={ids:[],zone:'hand',owner:null},libraryMode='generals',actionCallback=null,toastTimer;
const me=()=>view?.players.find(p=>p.id===view.you);
const target=()=>$('target').value||view?.you;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function open(id){const d=$(id);if(!d.open)d.showModal();}
function closeAll(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function status(message){$('connection-status').textContent=message;}
function setBadge(text,ok=false){$('network-badge').innerHTML=`<i style="background:${ok?'#7d9b78':'#b19360'}"></i>${esc(text)}`;}
function reset(){for(const link of links.values())link.close();links.clear();guestLink?.close();guestLink=null;worker?.terminate();worker=null;clearTimeout(pendingTimer);pending=null;view=null;selection={ids:[],zone:'hand',owner:null};}
function startWorker(){
  worker=new Worker(new URL('../backend/worker.js',import.meta.url),{type:'module'});
  worker.onerror=e=>toast(`本地后端异常：${e.message}`);
  worker.onmessage=e=>{
    const m=e.data;
    if(m.kind==='view'){
      if(m.route==='host'){view=m.view;render();}
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
function ack(id){if(pending&&(!id||id===pending.id)){pending=null;clearTimeout(pendingTimer);}}
function dispatch(type,data={}){
  if(!view)throw new Error('请先创建或加入牌桌');
  if(pending)throw new Error('上一操作正在等待确认，请稍候');
  const action={type,...data,id:crypto.randomUUID(),rev:view.rev};pending=action;
  pendingTimer=setTimeout(()=>{if(pending?.id===action.id){pending=null;toast('操作未收到确认，请重新同步后核对结果。不会自动重复执行。');sync();}},10000);
  if(isHost)worker.postMessage({kind:'action',action});
  else {try{guestLink.send(envelope('action',{action}));}catch(error){ack(action.id);throw error;}}
}
function sync(){if(isHost)worker?.postMessage({kind:'sync'});else if(guestLink?.channel?.readyState==='open')guestLink.send(envelope('sync'));else toast('连接未建立，请重新交换连接信息。');}
function hostOnly(kind,extra={}){if(!isHost||!worker)throw new Error('此操作需要房主设备');worker.postMessage({kind,...extra});}
function create(practice=false,config={}){
  reset();isHost=true;startWorker();closeAll();worker.postMessage({kind:'create',config:{hostId:crypto.randomUUID(),token:crypto.randomUUID(),name:config.name||'演练玩家',size:Number(config.size||4),ex:config.ex??true,practice}});setBadge(practice?'本地演练':'房主 · 等待连接',true);
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
    status('直连已建立，牌桌状态正在同步。');
    if(isHost)setBadge(`房主 · ${[...links.values()].filter(l=>l.channel?.readyState==='open').length} 个连接`,true);
    else {
      let token=sessionStorage.getItem('tongxi-seat:'+link.roomId);if(!token){token=crypto.randomUUID();sessionStorage.setItem('tongxi-seat:'+link.roomId,token);}
      link.send(envelope('hello',{credentials:{name:$('guest-name').value||'无名侠客',token}}));setBadge('P2P 已连接',true);
    }
  }
  if(['disconnected','failed','closed','protocol-error'].includes(state)){
    status(error||'有连接断开。受限网络可尝试 TURN；重连需重新交换邀请与回应。');
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
  try{$('offer-output').value=await link.offer();status('邀请已生成。发给一位好友，再粘贴其回应。下一位好友请生成新的邀请。');}catch(e){link.close();links.delete(link.id);throw e;}
}
async function answer(){
  $('answer-output').value='';
  const signal=await decodeSignal($('offer-input').value);if(signal.type!=='offer')throw new Error('这里需要房主的邀请');
  if(isHost&&view)throw new Error('当前设备正在主持牌桌，请用另一个标签页或浏览器加入');
  guestLink?.close();view=null;isHost=false;$('answer-output').value='';status('正在生成回应，请稍候…');
  guestLink=new PeerLink({roomId:signal.roomId,linkId:signal.linkId,iceServers:iceServers(),onMessage:incoming,onStatus:rtcStatus});
  try{$('answer-output').value=await guestLink.answer(signal);status('回应已生成。将回应发回房主，等待房主接收。');}catch(error){guestLink.close();throw error;}
}
async function accept(){const signal=await decodeSignal($('answer-input').value);const link=links.get(signal.linkId);if(!isHost||!link)throw new Error('没有对应的邀请，请确认此回应来自本次受邀好友');await link.accept(signal);status('已接收回应，正在建立直连…');}
function selectCard(id,zone,owner){
  if(selection.zone!==zone||selection.owner!==owner)selection={ids:[],zone,owner};
  const i=selection.ids.indexOf(id);if(i>=0)selection.ids.splice(i,1);else selection.ids.push(id);renderCards();
}
function picked(zone){if(selection.zone!==zone||!selection.ids.length)throw new Error('请先在对应牌区选择卡牌');return [...selection.ids];}
function cardHTML(id,zone,owner=null,staticOnly=false){
  const c=CARD_BY_ID[id];if(!c)return '';const def=CARD_MAP[c.kind];const index=selection.zone===zone&&selection.owner===owner?selection.ids.indexOf(id):-1;
  return `<button type="button" class="playing-card ${red(c)?'red-card':''} ${index>=0?'selected':''}" ${staticOnly?'':`data-card="${id}" data-zone="${zone}" data-owner="${esc(owner||'')}"`} aria-label="${esc(cardLabel(id))}：${esc(def.rule)}" aria-pressed="${index>=0}" title="${esc(def.rule)}"><span class="card-meta">${SUITS[c.suit]} ${rankText(c.rank)}</span><span class="card-name ${def.name.length>=5?'name-xlong':def.name.length>=4?'name-long':''}">${def.name}</span><span class="card-category">${def.type}${c.ex?' · EX':''}</span>${index>=0?`<span class="order-label">${index+1}</span>`:''}</button>`;
}
function miniHTML(id,zone,owner){const selected=selection.zone===zone&&selection.owner===owner&&selection.ids.includes(id);return `<button class="mini-card ${selected?'selected':''}" data-card="${id}" data-zone="${zone}" data-owner="${esc(owner)}" title="${esc(CARD_MAP[CARD_BY_ID[id].kind].rule)}">${esc(cardLabel(id))} <span class="zone-tag">${zone==='equip'?'装备':'判定'}</span></button>`;}
function render(){
  if(!view)return;$('welcome').hidden=true;$('game').hidden=false;
  const lobby=view.status==='lobby',mine=me(),g=GENERAL_MAP[mine?.general];
  $('room-title').textContent=view.status==='finished'?`${view.winner} · 对局结束`:lobby?'好戏，静候开场':`${view.players.find(p=>p.id===view.turn)?.name||'当前玩家'} 的回合`;
  $('revision').textContent=`SYNC / ${view.rev}`;$('room-size').textContent=`${view.players.length} / ${view.size}`;
  $('room-info').innerHTML=`<div class="room-code">${esc(view.roomId.slice(0,8).toUpperCase())}</div><div class="room-caption">牌桌标识 · 邀请需交换连接码</div><div class="room-tags"><span>${view.ex?'标准 + EX':'纯标准'}</span><span>${view.players.length<4?'自定义人数':'身份局'}</span><span>${view.practice?'本地演练':'P2P 直连'}</span></div>${view.practice?`<label>演练控制席位<select id="control-seat">${view.players.map(p=>`<option value="${esc(p.id)}" ${p.id===view.you?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`:''}`;
  $('lobby-actions').innerHTML=lobby?`${isHost?'<button class="primary small full" data-do="start">开始对局 →</button>':''}<button class="secondary small full" data-do="library">选择武将</button>${view.practice&&isHost?'<button class="text-link" data-do="local-seat">增加本地席位</button>':''}<p class="muted">未选择的武将将在开局时随机分配。</p>`:'';
  $('turn-info').innerHTML=lobby?'':`<div class="turn-box"><small>第 ${view.round} 轮 · ${esc(view.players.find(p=>p.id===view.turn)?.name)}</small><b>${PHASES[view.phase]}阶段</b><div class="phase-dots">${PHASES.map((p,i)=>`<span class="${i===view.phase?'active':''}">${p}</span>`).join('')}</div></div>`;
  $('table-actions').hidden=view.status!=='playing';
  const oldTarget=$('target').value;$('target').innerHTML=view.players.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.id===view.you?'（自己）':''}${p.dead?' · 阵亡':''}</option>`).join('');$('target').value=view.players.some(p=>p.id===oldTarget)?oldTarget:view.you;
  $('round-label').textContent=lobby?'请选择武将，等待好友入席':`第 ${view.round} 轮 · ${PHASES[view.phase]}`;
  $('pile-count').textContent=`牌堆 ${view.deckCount} / 弃牌 ${view.discard.length}`;
  $('seats').innerHTML=view.players.map((p,i)=>{const general=GENERAL_MAP[p.general];return `<article class="seat ${p.id===view.turn&&!lobby?'current':''} ${p.id===view.you?'mine':''} ${p.dead?'dead':''}" data-seat="${esc(p.id)}"><div class="seat-head"><span>${String(i+1).padStart(2,'0')} / ${general?.faction||'待选'}</span><span>${p.role?(p.roleOpen||view.status==='finished'?ROLES[p.role]:ROLES[p.role]+' · 私密'):'身份未公开'}</span></div><div class="seat-general">${general?.name||'虚位以待'}</div><div class="seat-name">${esc(p.name)}${p.id===view.you?' · 你':''}</div><div class="seat-hp">${'●'.repeat(Math.max(0,p.hp))}${'○'.repeat(Math.max(0,p.maxHp-Math.max(0,p.hp)))} ${p.hp}/${p.maxHp}${p.hp<=0&&!p.dead?' 濒死':''}</div><div class="seat-info"><span>手牌 ${p.handCount}</span><span>${p.dead?'已阵亡':p.id===view.turn&&!lobby?'当前回合':''}</span></div><div class="mini-zones">${[...p.equip.map(id=>miniHTML(id,'equip',p.id)),...p.judge.map(id=>miniHTML(id,'judge',p.id))].join('')}</div>${lobby&&p.id===view.you?'<button class="text-link" data-do="library">选择武将 →</button>':''}${lobby&&isHost&&p.id!==view.hostId?`<button class="text-link" data-remove="${esc(p.id)}">移除</button>`:''}</article>`;}).join('')+Array.from({length:Math.max(0,view.size-view.players.length)},(_,i)=>`<div class="seat empty-seat">${String(view.players.length+i+1).padStart(2,'0')} · 等待入席</div>`).join('');
  $('my-title').textContent=g?`${g.name} · ${mine.name}`:'我的手牌';$('my-role').textContent=mine.role?`你的身份：${ROLES[mine.role]}${mine.roleOpen?'（已公开）':'（仅你可见）'}`:'开局后分配身份';
  $('my-skills').innerHTML=g?g.skills.map(s=>`<button class="skill-button" data-skill="${s.name}" title="${esc(s.text)}">${s.name}</button>`).join(''):'';
  const logs=$('logs'),stick=logs.scrollTop+logs.clientHeight>=logs.scrollHeight-50;logs.innerHTML=view.logs.map(l=>`<div class="log-line"><span>#${String(l.rev).padStart(3,'0')}</span>${esc(l.text)}</div>`).join('');if(stick)logs.scrollTop=logs.scrollHeight;
  renderCards();if($('library-dialog').open)renderLibrary();
}
function renderCards(){
  if(!view)return;const mine=me();const own=selection.owner===view.you;const source=selection.zone==='hand'?mine.hand:selection.zone==='pool'?view.pool:selection.zone==='peek'?view.peek:view.players.find(p=>p.id===selection.owner)?.[selection.zone];
  selection.ids=selection.ids.filter(id=>source?.includes(id));
  $('hand').innerHTML=mine.hand?.length?mine.hand.map(id=>cardHTML(id,'hand',view.you)).join(''):'<span class="muted">'+(view.status==='lobby'?'开局后获得四张起始手牌':'暂无手牌')+'</span>';
  $('pool').innerHTML=view.pool.length?view.pool.map(id=>cardHTML(id,'pool')).join(''):'<span class="empty-message">待一声出牌，天下起风云</span>';
  $('own-equip').innerHTML=mine.equip.length||mine.judge.length?`<span class="muted">我的公开牌区：</span>${mine.equip.map(id=>miniHTML(id,'equip',view.you)).join('')}${mine.judge.map(id=>miniHTML(id,'judge',view.you)).join('')}`:'';
  $('peek-panel').hidden=!view.peek.length;$('peek-cards').innerHTML=view.peek.map(id=>cardHTML(id,'peek',view.you)).join('');
  $('selection-label').textContent=selection.ids.length?`已选 ${selection.ids.length} 张 · ${selection.ids.map(cardName).join('、')}`:'点击手牌，再选择操作';
  const publicZone=selection.ids.length&&(selection.zone==='pool'||(['equip','judge'].includes(selection.zone)&&!own));
  $('public-actions').hidden=!publicZone;$('public-label').textContent=`已选 ${selection.ids.length} 张公开牌`;
  document.querySelector('[data-do="take-pool"]').hidden=selection.zone!=='pool';
  for(const key of ['public-take','public-discard','public-pool','public-pass'])document.querySelector(`[data-do="${key}"]`).hidden=selection.zone==='pool';
  document.querySelectorAll('.seat [data-card]').forEach(b=>b.classList.toggle('selected',selection.zone===b.dataset.zone&&selection.owner===b.dataset.owner&&selection.ids.includes(b.dataset.card)));
}
function renderLibrary(){
  const q=$('library-search').value.trim().toLowerCase();
  document.querySelectorAll('[data-library]').forEach(b=>b.classList.toggle('active',b.dataset.library===libraryMode));
  if(libraryMode==='generals'){
    $('library-content').innerHTML=GENERALS.filter(g=>`${g.name}${g.faction}${g.title}${g.skills.map(s=>s.name+s.text).join('')}`.includes(q)).map(g=>{
      const chosen=view?.players.find(p=>p.general===g.id);const can=view?.status==='lobby'&&(!chosen||chosen.id===view.you);
      return `<article class="library-entry"><span class="entry-faction">${g.faction} / ${g.gender} / ${g.hp} 体力</span><h3>${g.name}</h3><span class="muted">${g.title}</span>${g.skills.map(s=>`<p><b>${s.name}</b> · ${s.text}</p>`).join('')}<a class="text-link" href="${g.source}" target="_blank" rel="noreferrer">Wiki 条目 ↗</a>${can?`<button class="secondary small full" data-general="${g.id}">${chosen?'已选择此武将':'选择此武将'}</button>`:chosen?`<p class="muted">${esc(chosen.name)} 已选</p>`:''}</article>`;
    }).join('');
  }else $('library-content').innerHTML=CARD_TYPES.filter(c=>`${c.name}${c.type}${c.rule}`.includes(q)).map(c=>{
    const copies=DECK.filter(d=>d.kind===c.id);return `<article class="library-entry"><span class="entry-faction">${c.type} / 标准 ${copies.filter(d=>!d.ex).length} 张${copies.some(d=>d.ex)?' + EX '+copies.filter(d=>d.ex).length+' 张':''}</span><h3>${c.name}</h3><p>${c.rule}</p><div class="distribution">${copies.map(d=>`${SUITS[d.suit]}${rankText(d.rank)}${d.ex?'[EX]':''}`).join(' · ')}</div></article>`;
  }).join('');
  if(!$('library-content').children.length)$('library-content').innerHTML='<p class="muted">没有匹配内容。</p>';
}
function actionDialog(title,description,callback,{label='结算说明（可选）',required=false}={}){
  $('action-title').textContent=title;$('action-description').textContent=description;$('action-label').firstChild.textContent=label;$('action-text').value='';$('action-text').required=required;actionCallback=callback;open('action-dialog');
}
const actions={
  create:()=>open('create-dialog'),
  join:()=>{open('connect-dialog');$('offer-input').focus();},
  connect:()=>open('connect-dialog'),
  practice:()=>create(true),
  library:()=>{renderLibrary();open('library-dialog');},rules:()=>open('rules-dialog'),tools:()=>open('tools-dialog'),
  offer,answer,accept,sync,
  'copy-offer':()=>copy($('offer-output')),'copy-answer':()=>copy($('answer-output')),
  start:()=>dispatch('start'),'local-seat':()=>dispatch('localSeat'),
  draw:()=>dispatch('draw',{n:Number($('draw-count').value)}),reveal:()=>dispatch('reveal',{n:Number($('draw-count').value)}),
  peek:()=>actionDialog('私看牌顶','输入观看数量（1–5）。这是私密区域，其余玩家只看到观看张数。',n=>dispatch('peek',{n:Number(n)}),{label:'观看张数',required:true}),
  phase:()=>dispatch('phase'),'next-turn':()=>dispatch('phase',{nextTurn:true}),
  'hp-minus':()=>dispatch('hp',{target:target(),delta:-1}),'hp-plus':()=>dispatch('hp',{target:target(),delta:1}),
  play:()=>dispatch('play',{cards:picked('hand'),target:target()}),
  'play-as':()=>{const cards=picked('hand'),seat=target();actionDialog('转化使用','仅记录转化并打出实体牌；合法性与效果由同桌裁定。例如：武圣杀、倾国闪、丈八杀。',as=>dispatch('play',{cards,target:seat,as}),{label:'转化名称',required:true});},
  discard:()=>{if(selection.owner!==view?.you||!['hand','equip','judge'].includes(selection.zone)||!selection.ids.length)throw new Error('请选择自己的手牌、装备或判定牌');dispatch('discard',{cards:[...selection.ids]});},
  give:()=>dispatch('give',{cards:picked('hand'),target:target()}),equip:()=>dispatch('equip',{cards:picked('hand')}),
  delay:()=>{const cards=picked('hand'),seat=target();if(cards.length===1&&CARD_MAP[CARD_BY_ID[cards[0]].kind].type!=='延时')actionDialog('国色：置为乐不思蜀','由同桌确认方块转化合法性；实体牌不改变牌面，转化含义记录在日志中。',()=>dispatch('delay',{cards,target:seat,as:'乐不思蜀'}));else dispatch('delay',{cards,target:seat});},
  'take-pool':()=>dispatch('takePool',{cards:picked('pool')}),'clear-pool':()=>dispatch('clearPool'),
  'random-take':()=>dispatch('randomTake',{target:target()}),'random-discard':()=>dispatch('randomTake',{target:target(),discard:true}),
  'public-take':()=>publicMove('hand'),'public-discard':()=>publicMove('discard'),'public-pool':()=>publicMove('pool'),'public-pass':()=>publicMove('judge'),
  'peek-top':()=>dispatch('returnPeek',{cards:picked('peek'),to:'top'}),'peek-bottom':()=>dispatch('returnPeek',{cards:picked('peek'),to:'bottom'}),
  'peek-hand':()=>dispatch('returnPeek',{cards:picked('peek'),to:'hand'}),'peek-pool':()=>dispatch('returnPeek',{cards:picked('peek'),to:'pool'}),
  'discard-pile':()=>{$('pile-content').innerHTML=view?.discard.map(id=>cardHTML(id,'discard',null,true)).join('')||'<p class="muted">弃牌堆为空。</p>';open('pile-dialog');},
  undo:()=>hostOnly('undo'),export:()=>hostOnly('export'),'reveal-role':()=>dispatch('role'),
  death:()=>{if(!isHost)throw new Error('仅房主可确认阵亡');dispatch('death',{target:target()});},
  finish:()=>{if(!isHost)throw new Error('仅房主可结束对局');dispatch('finish',{winner:$('winner').value});closeAll();},
  restore:()=>{reset();isHost=true;startWorker();closeAll();worker.postMessage({kind:'restore'});setBadge('房主 · 本地恢复',true);}
};
function publicMove(to){if(!['equip','judge'].includes(selection.zone)||!selection.ids.length)throw new Error('请选择一位玩家的公开区域卡牌');dispatch('publicMove',{cards:[...selection.ids],zone:selection.zone,target:selection.owner,to,destination:target()});}
async function copy(input){if(!input.value)throw new Error('请先生成连接信息');try{await navigator.clipboard.writeText(input.value);toast('已复制连接信息。');}catch{input.focus();input.select();toast('请按 Ctrl+C 复制选中的连接信息。');}}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-close')){b.closest('dialog').close();return;}
  const d=b.dataset;
  if(!('do'in d||'card'in d||'library'in d||'general'in d||'skill'in d||'remove'in d))return;
  e.preventDefault();
  try{
    if(d.card)selectCard(d.card,d.zone,d.owner||null);
    else if(d.library){libraryMode=d.library;renderLibrary();}
    else if(d.general){dispatch('general',{general:d.general});$('library-dialog').close();}
    else if(d.remove)dispatch('removeSeat',{target:d.remove});
    else if(d.skill){const skill=GENERAL_MAP[me().general].skills.find(s=>s.name===d.skill);actionDialog(`发动「${skill.name}」`,skill.text+' 仅公告技能；请自行完成牌区 / 体力操作。',note=>dispatch('skill',{skill:skill.name,note}));}
    else if(d.do){b.disabled=true;try{await actions[d.do]?.();}finally{b.disabled=false;}}
  }catch(error){toast(error.message);status(error.message);}
});
$('create-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);create(false,{name:f.get('name'),size:f.get('size'),ex:f.has('ex')});});
$('action-form').addEventListener('submit',e=>{e.preventDefault();try{actionCallback?.($('action-text').value.trim());$('action-dialog').close();}catch(error){toast(error.message);}});
$('chat-form').addEventListener('submit',e=>{e.preventDefault();try{dispatch('chat',{message:$('chat-input').value});$('chat-input').value='';}catch(error){toast(error.message);}});
$('library-search').addEventListener('input',renderLibrary);
document.addEventListener('change',e=>{if(e.target.id==='control-seat')hostOnly('control',{seat:e.target.value});});
$('import-file').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2_000_000)throw new Error('恢复文件过大');const snapshot=JSON.parse(await file.text());reset();isHost=true;startWorker();closeAll();worker.postMessage({kind:'restore',snapshot});setBadge('房主 · 导入恢复',true);}catch(error){toast(error.message);}finally{e.target.value='';}});
$('home-link').addEventListener('click',e=>{e.preventDefault();if(view){$('game').scrollIntoView({behavior:'smooth'});}else window.scrollTo({top:0,behavior:'smooth'});});
const initialOffer=new URLSearchParams(location.hash.slice(1)).get('offer');if(initialOffer){$('offer-input').value=initialOffer;history.replaceState(null,'',location.pathname+location.search);open('connect-dialog');}
window.addEventListener('beforeunload',e=>{if(view?.status==='playing'){e.preventDefault();e.returnValue='';}});
