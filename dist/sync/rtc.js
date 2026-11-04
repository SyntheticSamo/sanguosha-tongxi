import {MAX_PACKET} from './protocol.js';
import {encodeSignal,connectionPath} from './signals.js';
export {encodeSignal,decodeSignal} from './signals.js';

const MAX_CANDIDATE=1024;
const kinds=sdp=>new Set([...String(sdp||'').matchAll(/^a=candidate:\S+ \d+ \S+ \d+ \S+ \d+ typ (\w+)/gm)].map(m=>m[1]));
const wants=servers=>servers.some(s=>[s.urls].flat().some(u=>/^turns?:/i.test(u)))?'relay':servers.length?'srflx':'host';

// Manual codes embed every candidate, so we must decide when "enough" have arrived.
// Browsers can keep gathering for ~40 s, or never report "complete", when a VPN /
// virtual adapter, broken IPv6 route or blocked STUN port swallows requests. Waiting
// for "complete" with a hard failure made the whole invitation fail in those cases.
// Instead: stop shortly after the most useful candidate type arrives, and otherwise
// continue with whatever was gathered by the cap.
export function gathered(pc,{iceServers=[],grace=350,soft=3500,hard=8000}={}){
  if(pc.iceGatheringState==='complete')return Promise.resolve();
  const want=wants(iceServers);
  return new Promise((resolve,reject)=>{
    let graceTimer=null;
    const have=()=>kinds(pc.localDescription?.sdp),done=()=>{cleanup();resolve();};
    const check=e=>{
      if(pc.iceGatheringState==='complete'||e?.type==='icecandidate'&&!e.candidate)return done();
      const seen=have();if(!graceTimer&&(seen.has(want)||want==='srflx'&&seen.has('relay')))graceTimer=setTimeout(done,grace);
    };
    const softTimer=setTimeout(()=>{const seen=have();if(seen.has('srflx')||seen.has('relay')||want==='host'&&seen.size)done();},soft);
    const hardTimer=setTimeout(()=>{if(have().size)done();else{cleanup();reject(new Error('没有收集到可用的网络地址，请检查网络后重试'));}},hard);
    const closed=()=>{if(pc.connectionState==='closed'||pc.signalingState==='closed'){cleanup();reject(new Error('连接准备已取消'));}};
    const cleanup=()=>{clearTimeout(softTimer);clearTimeout(hardTimer);clearTimeout(graceTimer);pc.removeEventListener('icegatheringstatechange',check);pc.removeEventListener('icecandidate',check);pc.removeEventListener('connectionstatechange',closed);};
    pc.addEventListener('icegatheringstatechange',check);pc.addEventListener('icecandidate',check);pc.addEventListener('connectionstatechange',closed);check();closed();
  });
}

// Candidate lines from a remote description, with a fresh foundation so the browser
// treats them as new and starts another round of connectivity checks.
export function rearmCandidates(sdp,round){
  const mid=/^a=mid:(\S+)/m.exec(sdp||'')?.[1]??'0';
  return String(sdp||'').split(/\r?\n/).filter(l=>/^a=candidate:[A-Za-z0-9+/]{1,24} /.test(l)&&l.length<MAX_CANDIDATE)
    .map(l=>({candidate:l.slice(2).replace(/^candidate:([A-Za-z0-9+/]+)/,(_,f)=>`candidate:${f.slice(0,24)}r${round}`),sdpMid:mid,sdpMLineIndex:0}));
}

export class PeerLink {
  constructor({roomId,linkId=crypto.randomUUID(),iceServers=[],onMessage,onStatus,onCandidate=null}){
    this.roomId=roomId;this.id=linkId;this.onMessage=onMessage;this.onStatus=onStatus;this.parts=new Map();this.queue=[];this.iceServers=iceServers;this.onCandidate=onCandidate;
    this.pc=new RTCPeerConnection({iceServers});this.pc.onconnectionstatechange=()=>{if(this.pc.connectionState==='connected')this.everConnected=true;onStatus(this.pc.connectionState,this);};
    this.pc.ondatachannel=e=>this.attach(e.channel);
    // Trickle mode (automatic signaling): forward each candidate as soon as it exists.
    if(onCandidate)this.pc.addEventListener('icecandidate',e=>{if(e.candidate?.candidate&&!this.disposed)onCandidate(e.candidate.toJSON(),this);});
  }
  attach(channel){
    this.channel=channel;channel.bufferedAmountLowThreshold=65536;
    channel.onopen=()=>{this.opened=true;this.stopPersist();this.flush();this.onStatus('open',this);};channel.onclose=()=>this.onStatus('closed',this);
    channel.onerror=()=>this.onStatus('failed',this);channel.onbufferedamountlow=()=>this.flush();
    channel.onmessage=e=>{try{this.receive(e.data);}catch(error){this.onStatus('protocol-error',this,error.message);}};
  }
  async offer(){this.attach(this.pc.createDataChannel('tongxi-v1',{ordered:true}));await this.pc.setLocalDescription(await this.pc.createOffer());await gathered(this.pc,{iceServers:this.iceServers});return this.signal();}
  async answer(signal){if(signal.type!=='offer')throw new Error('请粘贴房主的邀请');await this.pc.setRemoteDescription({type:'offer',sdp:signal.sdp});await this.pc.setLocalDescription(await this.pc.createAnswer());await gathered(this.pc,{iceServers:this.iceServers});return this.signal();}
  async accept(signal){if(signal.type!=='answer'||signal.roomId!==this.roomId||signal.linkId!==this.id)throw new Error('回应不属于本次邀请，请勿混用连接码');if(this.acceptedSDP===signal.sdp)return false;if(this.pc.signalingState!=='have-local-offer')throw new Error('此邀请已使用，请为下一位玩家新建邀请');await this.pc.setRemoteDescription({type:'answer',sdp:signal.sdp});this.acceptedSDP=signal.sdp;return true;}
  signal(){return encodeSignal({v:1,roomId:this.roomId,linkId:this.id,type:this.pc.localDescription.type,sdp:this.pc.localDescription.sdp});}
  // Automatic signaling: descriptions are sent immediately and candidates trickle.
  async liveOffer({restart=false}={}){if(!this.channel)this.attach(this.pc.createDataChannel('tongxi-v1',{ordered:true}));await this.pc.setLocalDescription(await this.pc.createOffer(restart?{iceRestart:true}:{}));return {type:'offer',sdp:this.pc.localDescription.sdp};}
  async liveAnswer(sdp){await this.pc.setRemoteDescription({type:'offer',sdp});await this.pc.setLocalDescription(await this.pc.createAnswer());return {type:'answer',sdp:this.pc.localDescription.sdp};}
  async liveAccept(sdp){if(this.pc.signalingState!=='have-local-offer')return false;await this.pc.setRemoteDescription({type:'answer',sdp});return true;}
  async addCandidate(candidate){if(!candidate||typeof candidate.candidate!=='string'||candidate.candidate.length>MAX_CANDIDATE)return;try{await this.pc.addIceCandidate(candidate);}catch{}}
  // Manual exchange is slow: the side that receives the other's code first starts
  // connectivity checks immediately, and browsers give up after ~15 s. Copying a
  // reply through a chat app usually takes longer, so both NAT bindings expire and
  // the link fails even when a direct path exists. While not yet connected, re-add
  // the remote candidates every few seconds so checks resume and NAT bindings stay
  // fresh until the other side applies our code.
  persist({every=5000,limit=360000}={}){
    if(this.persistTimer||this.disposed||!this.pc.remoteDescription)return;
    const started=Date.now();let round=0;
    const tick=async()=>{
      this.persistTimer=null;
      if(this.disposed||this.opened||Date.now()-started>limit)return;
      if(['failed','disconnected','new'].includes(this.pc.iceConnectionState)){round++;for(const c of rearmCandidates(this.pc.remoteDescription?.sdp,round))await this.addCandidate(c);this.rearmed=round;}
      if(!this.disposed&&!this.opened)this.persistTimer=setTimeout(tick,every);
    };
    this.persistTimer=setTimeout(tick,every);
  }
  stopPersist(){clearTimeout(this.persistTimer);this.persistTimer=null;}
  get waiting(){return !this.opened&&!!this.persistTimer;}
  send(message){
    const raw=JSON.stringify(message);if(new TextEncoder().encode(raw).length>MAX_PACKET)throw new Error('消息超过传输上限');
    if(this.channel?.readyState!=='open')throw new Error('连接尚未建立或已经断开');
    const id=crypto.randomUUID(),total=Math.ceil(raw.length/6000);
    if(this.queue.length+total>256)throw new Error('发送队列繁忙，请稍后重试');
    for(let i=0;i<total;i++)this.queue.push(JSON.stringify({id,i,total,data:raw.slice(i*6000,(i+1)*6000)}));this.flush();
  }
  flush(){while(this.channel?.readyState==='open'&&this.channel.bufferedAmount<131072&&this.queue.length)this.channel.send(this.queue.shift());}
  receive(raw){
    if(typeof raw!=='string'||raw.length>10000)throw new Error('传输分片无效');
    const f=JSON.parse(raw);if(typeof f.id!=='string'||f.id.length>50||!Number.isInteger(f.i)||!Number.isInteger(f.total)||f.total<1||f.total>90||f.i<0||f.i>=f.total||typeof f.data!=='string'||f.data.length>6000)throw new Error('传输分片格式错误');
    const now=Date.now();for(const [id,part]of this.parts)if(now-part.time>30000)this.parts.delete(id);
    if(!this.parts.has(f.id)){if(this.parts.size>=8)throw new Error('过多未完成消息');this.parts.set(f.id,{time:now,total:f.total,items:new Map()});}
    const part=this.parts.get(f.id);if(part.total!==f.total)throw new Error('分片数量不一致');part.items.set(f.i,f.data);
    if(part.items.size===part.total){this.parts.delete(f.id);const data=Array.from({length:part.total},(_,i)=>part.items.get(i)).join('');if(new TextEncoder().encode(data).length>MAX_PACKET)throw new Error('重组消息过大');this.onMessage(data,this);}
  }
  async path(){try{return connectionPath(await this.pc.getStats());}catch{return 'unknown';}}
  close(){this.disposed=true;this.stopPersist();this.channel?.close();this.pc.close();this.parts.clear();this.queue=[];}
}
