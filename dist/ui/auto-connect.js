import {SignalRelay,relayBase,roomFromKey,randomKey,roomLink,parseRoomLink} from '../sync/relay.js';
const $=id=>document.getElementById(id);
const read=(store,key)=>{try{return store.getItem(key);}catch{return null;}};
const write=(store,key,value)=>{try{store.setItem(key,value);}catch{}};

// Automatic signaling: one shareable room link, descriptions relayed through the
// optional Worker, candidates trickled, ICE restarted on failure. Seat claiming,
// snapshots and actions still go through the existing data-channel protocol.
export class AutoConnect{
 constructor(h){this.h=h;this.ice=[];this.relay=null;this.peers=new Map();this.chain=Promise.resolve();this.requests=new Map();this.timers=new Map();document.addEventListener('tongxi:connect-role',()=>this.render());}
 get base(){return relayBase();}
 get enabled(){return !!this.base;}
 get active(){return !!this.relay&&!this.relay.closed;}
 stop(){this.relay?.close();this.relay=null;this.peers.clear();this.ice=[];this.room=null;this.gameRoom=null;for(const t of this.timers.values())clearTimeout(t);this.timers.clear();this.render();}
 serial(fn){this.chain=this.chain.then(fn).catch(e=>this.h.status(e.message));return this.chain;}
 // ---------- host ----------
 async host(gameRoom){
  if(!this.enabled||this.relay?.role==='host'&&this.gameRoom===gameRoom)return;
  this.stop();this.gameRoom=gameRoom;
  let saved=null;try{saved=JSON.parse(read(localStorage,'tongxi:relay-host')||'null');}catch{}
  const key=saved?.roomId===gameRoom&&typeof saved.key==='string'?saved.key:randomKey();write(localStorage,'tongxi:relay-host',JSON.stringify({roomId:gameRoom,key}));
  this.room=await roomFromKey(key);if(this.gameRoom!==gameRoom)return;
  this.link=roomLink(this.room,this.base,location.href);
  this.relay=new SignalRelay({base:this.base,room:this.room,role:'host',peer:'h'+randomKey(12),key,onSignal:(d,from)=>this.serial(()=>this.hostSignal(d,from)),onPresence:()=>this.h.peers(),onState:(s,d)=>this.state(s,d),onIce:ice=>{this.ice=ice;}});
  this.relay.connect();this.render();
 }
 async hostSignal(d,from){
  const {view,isHost}=this.h.state();if(!isHost||!view||view.roomId!==this.gameRoom)return;
  let link=this.peers.get(from);
  if(d.kind==='connect'){
   const now=Date.now(),recent=(this.requests.get(from)||[]).filter(t=>now-t<60000);recent.push(now);this.requests.set(from,recent);if(recent.length>6)return;
   if(link&&!link.disposed){this.h.dropLink(link);}
   link=this.h.newLink({roomId:this.gameRoom,onCandidate:(candidate,l)=>this.relay?.send({kind:'candidate',linkId:l.id,candidate},from)});
   link.relayPeer=from;link.restarts=[];this.peers.set(from,link);
   const offer=await link.liveOffer();if(!link.disposed)this.relay?.send({kind:'offer',linkId:link.id,roomId:this.gameRoom,sdp:offer.sdp},from);
   this.h.status('好友已打开房间链接，正在建立连接…');return;
  }
  // A restart for a link this host no longer has (e.g. after the host reloaded) is a
  // request for a fresh connection.
  if(!link||link.disposed||link.id!==d.linkId)return d.kind==='restart'?this.hostSignal({kind:'connect'},from):undefined;
  if(d.kind==='answer')await link.liveAccept(d.sdp);
  else if(d.kind==='candidate')await link.addCandidate(d.candidate);
  else if(d.kind==='restart')await this.restart(link);
 }
 async restart(link){
  const now=Date.now();link.restarts=(link.restarts||[]).filter(t=>now-t<60000);if(link.restarts.length>=3||link.disposed||!this.relay)return;link.restarts.push(now);
  const offer=await link.liveOffer({restart:true});if(!link.disposed)this.relay.send({kind:'offer',linkId:link.id,roomId:this.gameRoom,sdp:offer.sdp},link.relayPeer);
 }
 // ---------- guest ----------
 openJoin(target){this.pendingJoin=target;write(sessionStorage,'tongxi:relay-room',JSON.stringify(target));this.render();}
 resumeTarget(){if(this.pendingJoin)return this.pendingJoin;try{const t=JSON.parse(read(sessionStorage,'tongxi:relay-room')||'null');if(t&&parseRoomLink(roomLink(t.room,t.relay,location.href)))return t;}catch{}return null;}
 join(target=this.resumeTarget()){
  if(!target)throw new Error('请先打开房主发来的房间链接');
  const {view,isHost}=this.h.state();if(isHost&&view&&!view.practice)throw new Error('当前设备正在主持牌桌，请用另一个标签页加入');
  this.stop();this.pendingJoin=target;
  let peer=read(sessionStorage,'tongxi-relay-peer:'+target.room);if(!peer){peer='g'+randomKey(12);write(sessionStorage,'tongxi-relay-peer:'+target.room,peer);}
  this.room=target.room;
  this.relay=new SignalRelay({base:target.relay,room:target.room,role:'guest',peer,onSignal:d=>this.serial(()=>this.guestSignal(d)),onPresence:k=>this.guestPresence(k),onState:(s,d)=>this.state(s,d),onIce:ice=>{this.ice=ice;}});
  this.relay.connect();this.render();this.h.status('正在寻找房间…');
 }
 guestPresence(kind){
  if(kind==='host-online')this.request();
  else if(kind==='host-offline'&&this.h.guestLink()?.channel?.readyState!=='open')this.h.status('房主暂时不在线。保持本页打开，房主回来后会自动连接。');
 }
 request(){const link=this.h.guestLink();if(link?.channel?.readyState==='open'&&!link.disposed)return;if(this.relay?.send({kind:'connect'}))this.h.status('已找到房间，正在与房主建立连接…');}
 async guestSignal(d){
  let link=this.h.guestLink();
  if(d.kind==='offer'){
   if(!link||link.disposed||link.id!==d.linkId){
    const {view}=this.h.state();if(link?.channel?.readyState==='open'&&view?.status==='playing'&&view.roomId!==d.roomId)return;
    link=this.h.newGuestLink({roomId:d.roomId,linkId:d.linkId,onCandidate:(candidate,l)=>this.relay?.send({kind:'candidate',linkId:l.id,candidate})});link.viaRelay=true;
   }
   const answer=await link.liveAnswer(d.sdp);if(!link.disposed)this.relay?.send({kind:'answer',linkId:link.id,sdp:answer.sdp});return;
  }
  if(!link||link.disposed||link.id!==d.linkId)return;
  if(d.kind==='candidate')await link.addCandidate(d.candidate);
 }
 // ---------- shared ----------
 // Called from the RTC status hook. A relay link that drops is repaired with an ICE
 // restart over the relay instead of asking players to exchange new codes.
 track(state,link){
  if(!this.active||!(link.relayPeer||link.viaRelay))return false;
  clearTimeout(this.timers.get(link.id));this.timers.delete(link.id);
  const repair=()=>{if(link.disposed)return;if(this.relay.role==='host')this.serial(()=>this.restart(link));else this.relay.send({kind:'restart',linkId:link.id});};
  if(state==='failed'){repair();this.h.status('连接中断，正在自动修复…');return true;}
  if(state==='closed'&&this.relay.role==='guest'){this.timers.set(link.id,setTimeout(()=>this.request(),600));return false;}
  if(state==='disconnected')this.timers.set(link.id,setTimeout(()=>{if(link.pc.iceConnectionState==='disconnected')repair();},4000));
  return false;
 }
 state(s,detail){
  const host=this.relay?.role==='host',text={connecting:'正在连接自动配对服务…',reconnecting:'正在重新连接自动配对服务…',ready:host?'自动连接已就绪：好友打开链接、确认昵称即可入席。':'已连接自动配对服务。',waiting:`自动配对服务暂不可用，${detail}秒后重试；仍可使用手动邀请。`,replaced:'此房间已在另一个标签页打开，本页停止自动连接。',error:detail||'自动配对服务出错。'}[s];
  if(text){$('relay-status').textContent=text;if(!host)this.h.status(text);}
  if(s==='ready'&&!host&&this.relay?.hostOnline)this.request();
  this.render();
 }
 render(){
  const host=this.relay?.role==='host'&&this.link,join=!this.h.state().isHost&&(this.pendingJoin||this.resumeTarget());
  $('room-invite').hidden=!host;if(host)$('room-link').value=this.link;
  $('room-join').hidden=!join;if(join)$('room-join-note').textContent=join.custom?`配对服务：${new URL(join.relay).host}（由邀请链接指定）`:'通过本站配置的自动配对服务连接。';
  $('manual-host-title').textContent=host?'或者：手动发一份邀请':'发一份邀请';
  if(!this.relay)$('relay-status').textContent=this.enabled?'':'未配置自动配对服务，可在「网络设置」填写，或继续手动交换。';
  const role=$('connect-dialog').dataset.role,steps=role==='host'&&host?['复制房间链接','好友打开并确认昵称','自动连接入席']:role==='guest'&&join?['打开房间链接','确认昵称并加入','自动连接入席']:null;
  if(steps){$('connection-steps').innerHTML=steps.map((s,i)=>`<li class="${i===0?'active':''}">${s}</li>`).join('');document.querySelector('#connect-dialog .connect-intro').textContent=role==='host'?'房间链接可发给全桌；也可以在下方为单个好友手动邀请。':'通过房间链接自动连接；也可以粘贴房主发来的手动邀请。';}
  else document.querySelector('#connect-dialog .connect-intro').textContent='每份邀请供一位好友使用；下一位请生成新邀请。';
 }
}
