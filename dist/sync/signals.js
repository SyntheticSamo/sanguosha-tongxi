// Connection descriptions only. Never fetch invitation URLs or carry seat credentials.
export const MAX_SIGNAL=100000;
const base64=bytes=>{let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);};
export function extractSignal(input){
 if(typeof input!=='string'||input.length>MAX_SIGNAL*3)throw new Error('连接信息过长或格式不正确');
 const raw=input.trim();let code=raw;
 if(/^https?:\/\//i.test(raw)){
  const url=new URL(raw),params=new URLSearchParams(url.hash.slice(1)),keys=['offer','answer'].filter(k=>params.has(k));
  if(url.username||url.password||keys.length!==1||params.getAll(keys[0]).length!==1)throw new Error('链接中应只包含一份邀请或回应');code=params.get(keys[0]);
 }else code=code.replace(/\s+/g,'');
 if(code.length>MAX_SIGNAL)throw new Error('连接信息过长');
 if(!/^TX1[GJ]\.[A-Za-z0-9+/]+={0,2}$/.test(code))throw new Error('请完整粘贴邀请链接或同席连接码');
 return code;
}
export function invitationURL(code,base){
 const raw=extractSignal(code),url=new URL(base);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('邀请网页地址无效');
 url.search='';url.hash=new URLSearchParams({offer:raw}).toString();return url.href;
}
export function localPreview(base){const host=new URL(base).hostname;return ['localhost','127.0.0.1','[::1]','::1'].includes(host);}
export async function encodeSignal(data){
 const bytes=new TextEncoder().encode(JSON.stringify(data));if(bytes.length>MAX_SIGNAL)throw new Error('连接信息过长');
 let code;if(typeof CompressionStream!=='undefined'){const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));code='TX1G.'+base64(new Uint8Array(await new Response(stream).arrayBuffer()));}else code='TX1J.'+base64(bytes);
 if(code.length>MAX_SIGNAL)throw new Error('连接信息过长');return code;
}
export async function decodeSignal(input){
 const code=extractSignal(input),[prefix,body]=code.split('.');let bytes;
 try{
  bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));
  if(prefix==='TX1G'){
   const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_SIGNAL){await reader.cancel();throw new Error('解压后的连接信息过长');}chunks.push(value);}
   bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  }
  if(bytes.length>MAX_SIGNAL)throw new Error('连接信息过长');
  const s=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),validId=v=>typeof v==='string'&&v.length>0&&v.length<=100&&!/[\s\x00-\x1f]/.test(v);
  if(!s||s.v!==1||!validId(s.roomId)||!validId(s.linkId)||!['offer','answer'].includes(s.type)||typeof s.sdp!=='string'||!s.sdp.length||s.sdp.length>MAX_SIGNAL)throw new Error('连接信息格式不兼容');
  return {v:s.v,roomId:s.roomId,linkId:s.linkId,type:s.type,sdp:s.sdp};
 }catch(e){if(/过长|格式不兼容/.test(e.message))throw e;throw new Error('连接信息损坏或不完整，请重新复制');}
}
export function connectionPath(stats){
 const reports=[...stats.values()],transport=reports.find(s=>s.type==='transport'&&s.selectedCandidatePairId),pair=transport?stats.get(transport.selectedCandidatePairId):reports.find(s=>s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated);
 if(!pair)return 'unknown';const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId),types=[local?.candidateType,remote?.candidateType];
 if(types.includes('relay'))return 'relay';return types.every(t=>['host','srflx','prflx'].includes(t))?'direct':'unknown';
}
