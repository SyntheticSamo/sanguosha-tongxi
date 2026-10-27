import { MAX_PACKET } from './protocol.js';
const MAX_SIGNAL=100000;
const toBase64=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
export async function encodeSignal(data){
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  if(typeof CompressionStream!=='undefined'){
    const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return 'TX1G.'+toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return 'TX1J.'+toBase64(bytes);
}
export async function decodeSignal(input){
  const raw=input.trim();let code=raw;
  if(raw.startsWith('http')){const u=new URL(raw);code=new URLSearchParams(u.hash.slice(1)).get('offer')||'';}
  if(code.length>MAX_SIGNAL)throw new Error('连接信息过长');
  const [prefix,body]=code.split('.');if(!['TX1G','TX1J'].includes(prefix)||!body)throw new Error('不是有效的同席连接码');
  let bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));
  if(prefix==='TX1G'){
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let size=0,chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_SIGNAL){await reader.cancel();throw new Error('解压后的连接信息过长');}chunks.push(value);}
    bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  }
  if(bytes.length>MAX_SIGNAL)throw new Error('连接信息过长');const result=JSON.parse(new TextDecoder().decode(bytes));
  if(result.v!==1||typeof result.roomId!=='string'||typeof result.linkId!=='string'||!['offer','answer'].includes(result.type)||typeof result.sdp!=='string')throw new Error('连接信息格式不兼容');
  return result;
}
async function gathered(pc){
  if(pc.iceGatheringState==='complete')return;
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{cleanup();reject(new Error('收集连接候选超时，请检查网络或关闭 STUN 后重试'));},18000);
    const changed=()=>{if(pc.iceGatheringState==='complete'){cleanup();resolve();}};
    const cleanup=()=>{clearTimeout(timeout);pc.removeEventListener('icegatheringstatechange',changed);};
    pc.addEventListener('icegatheringstatechange',changed);changed();
  });
}
export class PeerLink {
  constructor({roomId,linkId=crypto.randomUUID(),iceServers=[],onMessage,onStatus}){
    this.roomId=roomId;this.id=linkId;this.onMessage=onMessage;this.onStatus=onStatus;this.parts=new Map();this.queue=[];
    this.pc=new RTCPeerConnection({iceServers});this.pc.onconnectionstatechange=()=>onStatus(this.pc.connectionState,this);
    this.pc.ondatachannel=e=>this.attach(e.channel);
  }
  attach(channel){
    this.channel=channel;channel.bufferedAmountLowThreshold=65536;
    channel.onopen=()=>{this.flush();this.onStatus('open',this);};channel.onclose=()=>this.onStatus('closed',this);
    channel.onerror=()=>this.onStatus('failed',this);channel.onbufferedamountlow=()=>this.flush();
    channel.onmessage=e=>{try{this.receive(e.data);}catch(error){this.onStatus('protocol-error',this,error.message);}};
  }
  async offer(){this.attach(this.pc.createDataChannel('tongxi-v1',{ordered:true}));await this.pc.setLocalDescription(await this.pc.createOffer());await gathered(this.pc);return this.signal();}
  async answer(signal){if(signal.type!=='offer')throw new Error('请粘贴房主的邀请');await this.pc.setRemoteDescription({type:'offer',sdp:signal.sdp});await this.pc.setLocalDescription(await this.pc.createAnswer());await gathered(this.pc);return this.signal();}
  async accept(signal){if(signal.type!=='answer'||signal.roomId!==this.roomId||signal.linkId!==this.id)throw new Error('回应不属于本次邀请，请勿混用连接码');if(this.pc.signalingState!=='have-local-offer')throw new Error('此邀请已使用，请为下一位玩家新建邀请');await this.pc.setRemoteDescription({type:'answer',sdp:signal.sdp});}
  signal(){return encodeSignal({v:1,roomId:this.roomId,linkId:this.id,type:this.pc.localDescription.type,sdp:this.pc.localDescription.sdp});}
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
  close(){this.channel?.close();this.pc.close();this.parts.clear();this.queue=[];}
}
