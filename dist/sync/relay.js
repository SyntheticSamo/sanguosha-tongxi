// Optional automatic signaling through a self-deployed Cloudflare Worker (see cloudflare/).
// It replaces copy-pasting invitation codes; the WebRTC data channel and every game
// message still go directly between browsers. Nothing here carries seat tokens.
import {MAX_SIGNAL} from './signals.js';
import {SIGNAL_URL} from './relay-config.js';

const ROOM=/^[A-Za-z0-9_-]{22}$/,PEER=/^[A-Za-z0-9_-]{8,64}$/,ID=/^[A-Za-z0-9_.:-]{1,100}$/;
import {b64url,roomFromKey} from './room-key.js';
export {roomFromKey};
export const randomKey=(n=32)=>b64url(crypto.getRandomValues(new Uint8Array(n)));

// A relay base URL is an https origin (optionally with a path). Plain http is only
// accepted for local development hosts.
export function normalizeRelay(value){
  const raw=String(value||'').trim();if(!raw)return '';
  let url;try{url=new URL(raw);}catch{throw new Error('自动连接服务地址无效');}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)||/^10\.|^192\.168\./.test(url.hostname);
  if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&local))throw new Error('自动连接服务需使用 https 地址');
  return url.origin+url.pathname.replace(/\/+$/,'');
}
export function relayBase(storage=globalThis.localStorage){let custom='';try{custom=storage?.getItem('tongxi:relay-url')||'';}catch{}try{return normalizeRelay(custom||SIGNAL_URL);}catch{return '';}}
export function saveRelayBase(value,storage=globalThis.localStorage){const v=normalizeRelay(value);try{if(v&&v!==normalizeRelay(SIGNAL_URL))storage.setItem('tongxi:relay-url',v);else storage.removeItem('tongxi:relay-url');}catch{}return v;}

// Room links: #room=<id> and, when the host uses a non-default service, &relay=<base>.
export function roomLink(room,base,page){
  if(!ROOM.test(room))throw new Error('房间链接无效');const url=new URL(page);url.search='';const p=new URLSearchParams({room});
  if(base&&base!==normalizeRelay(SIGNAL_URL))p.set('relay',base);url.hash=p.toString();return url.href;
}
export function parseRoomLink(href){
  let url;try{url=new URL(href);}catch{return null;}const p=new URLSearchParams(url.hash.slice(1));if(!p.has('room'))return null;
  const room=p.get('room');if(!ROOM.test(room)||p.getAll('room').length!==1)throw new Error('房间链接不完整，请重新复制');
  const relay=p.get('relay')?normalizeRelay(p.get('relay')):normalizeRelay(SIGNAL_URL);if(!relay)throw new Error('此页面未配置自动连接服务，请让房主发送手动邀请');
  return {room,relay,custom:p.has('relay')};
}

// Only these shapes are accepted from the other side of the relay.
export function checkSignal(d){
  if(!d||typeof d!=='object'||!['connect','offer','answer','candidate','restart'].includes(d.kind))throw new Error('自动连接消息无效');
  const out={kind:d.kind};
  if(d.kind!=='connect'){if(!ID.test(d.linkId||''))throw new Error('自动连接消息无效');out.linkId=d.linkId;}
  if(d.kind==='offer'){if(!ID.test(d.roomId||''))throw new Error('自动连接消息无效');out.roomId=d.roomId;}
  if(['offer','answer'].includes(d.kind)){if(typeof d.sdp!=='string'||!d.sdp.startsWith('v=0')||d.sdp.length>MAX_SIGNAL)throw new Error('连接描述无效');out.sdp=d.sdp;}
  if(d.kind==='candidate'){const c=d.candidate;if(!c||typeof c.candidate!=='string'||c.candidate.length>1024||!/^candidate:/.test(c.candidate))throw new Error('连接候选无效');out.candidate={candidate:c.candidate,sdpMid:typeof c.sdpMid==='string'?c.sdpMid.slice(0,16):null,sdpMLineIndex:Number.isInteger(c.sdpMLineIndex)?c.sdpMLineIndex:0};}
  return out;
}

export class SignalRelay{
  constructor({base,room,role,peer,key=null,onSignal,onPresence,onState,onIce}){
    if(!ROOM.test(room)||!PEER.test(peer)||!['host','guest'].includes(role))throw new Error('自动连接参数无效');
    Object.assign(this,{base:normalizeRelay(base),room,role,peer,key,onSignal,onPresence,onState,onIce});this.closed=false;this.tries=0;this.state='idle';this.hostOnline=false;this.ice=[];
  }
  get url(){const u=new URL(this.base+`/v1/room/${this.room}/ws`);u.protocol=u.protocol==='https:'?'wss:':'ws:';u.searchParams.set('role',this.role);u.searchParams.set('peer',this.peer);return u.href;}
  set(state,detail){this.state=state;this.onState?.(state,detail,this);}
  connect(){
    if(this.closed||this.ws&&this.ws.readyState<2)return;
    this.set(this.tries?'reconnecting':'connecting');
    let ws;try{ws=new WebSocket(this.url);}catch(e){this.set('error',e.message);return this.retry();}
    this.ws=ws;
    ws.onopen=()=>{this.tries=0;if(this.role==='host')ws.send(JSON.stringify({t:'auth',key:this.key}));clearInterval(this.pinger);this.pinger=setInterval(()=>{if(ws.readyState===1)ws.send('{"t":"ping"}');},25000);};
    ws.onmessage=e=>{let m;try{if(typeof e.data!=='string'||e.data.length>MAX_SIGNAL+4096)return;m=JSON.parse(e.data);}catch{return;}this.receive(m);};
    ws.onclose=e=>{clearInterval(this.pinger);if(this.ws!==ws)return;this.ws=null;this.hostOnline=false;if(this.closed)return;
      if([4003,4008].includes(e.code)){this.set('error',e.code===4003?'自动连接服务拒绝了房主身份':'自动连接消息过于频繁');if(e.code===4003)return;}
      if(e.code===4000)return this.set('replaced');
      this.retry();};
  }
  retry(){if(this.closed)return;clearTimeout(this.timer);const delay=Math.min(15000,1000*2**Math.min(this.tries++,4))*(0.75+Math.random()*.5);this.set('waiting',Math.round(delay/1000));this.timer=setTimeout(()=>this.connect(),delay);}
  receive(m){
    if(m.t==='welcome'){
      this.ice=Array.isArray(m.ice)?m.ice.slice(0,4).filter(s=>s&&[s.urls].flat().every(u=>typeof u==='string'&&/^(stun|turns?):/.test(u))):[];this.onIce?.(this.ice);
      if(this.role==='guest')this.hostOnline=!!m.host;this.set('ready');
      if(this.role==='host'){for(const p of Array.isArray(m.peers)?m.peers:[])if(PEER.test(p))this.onPresence?.('join',p);}
      else this.onPresence?.(m.host?'host-online':'host-offline');
    }else if(m.t==='join'||m.t==='leave'){if(this.role==='host'&&PEER.test(m.peer||''))this.onPresence?.(m.t,m.peer);}
    else if(m.t==='host'){this.hostOnline=!!m.online;this.onPresence?.(m.online?'host-online':'host-offline');}
    else if(m.t==='signal'){
      const from=this.role==='host'?m.from:'host';if(this.role==='host'&&!PEER.test(from||''))return;
      let data;try{data=checkSignal(m.data);}catch{return;}this.onSignal?.(data,from);
    }
  }
  send(data,to=null){
    if(this.ws?.readyState!==1)return false;const m={t:'signal',data};if(this.role==='host')m.to=to;
    const raw=JSON.stringify(m);if(raw.length>MAX_SIGNAL+4096)return false;this.ws.send(raw);return true;
  }
  close(){this.closed=true;clearTimeout(this.timer);clearInterval(this.pinger);const ws=this.ws;this.ws=null;try{ws?.close(1000,'bye');}catch{}this.set('closed');}
}
