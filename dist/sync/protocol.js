export const PROTOCOL = 1;
export const MAX_PACKET = 524288;
export const envelope = (kind,data={})=>({v:PROTOCOL,kind,...data});
export function parseMessage(raw){
  if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_PACKET)throw new Error('联机消息过大');
  const m=JSON.parse(raw);if(m.v!==PROTOCOL||!['hello','action','sync','snapshot','ack','error'].includes(m.kind))throw new Error('联机协议不兼容');return m;
}
export function acceptSnapshot(previous,next){
  if(!next||next.schema!==1||!Number.isSafeInteger(next.rev)||!Array.isArray(next.players))throw new Error('同步数据无效');
  if(previous&&previous.roomId!==next.roomId)throw new Error('房间不匹配');
  return !previous||next.rev>=previous.rev;
}
