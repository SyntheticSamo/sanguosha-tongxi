import { newRoom, joinRoom, reduce, project, validateState, migrateState } from './engine.js';
import { saveSnapshot,loadSnapshot } from './storage.js';
let state=null, routes=new Map(), seen=new Map(), controlled=null, undo=[];
const emit=(kind,extra={})=>postMessage({kind,...extra});
const bind=(route,seat)=>{for(const [key,value]of routes)if(value===seat&&key!==route){routes.delete(key);emit('superseded',{route:key});}routes.set(route,seat);};
function broadcast(){
  emit('view',{route:'host',view:project(state,controlled||state.hostId)});
  for(const [route,seat]of routes)if(state.players.some(p=>p.id===seat))emit('view',{route,view:project(state,seat)});
}
async function persist(){try{await saveSnapshot(state);}catch{emit('warning',{message:'浏览器未能保存本地恢复存档，请导出备份。'});}}
let serial=Promise.resolve();
self.onmessage=e=>{serial=serial.then(()=>handle(e.data)).catch(error=>emit('error',{route:e.data.route||'host',requestId:e.data.action?.id,message:error.message}));};
async function handle(m){
  const route=m.route||'host';
  if(m.kind==='create'){state=newRoom(m.config);controlled=null;seen.clear();routes.clear();undo=[];await persist();broadcast();return;}
  if(m.kind==='restore'){
    const loaded=m.snapshot||await loadSnapshot();if(!loaded)throw new Error('没有可恢复的本地存档');const candidate=migrateState(loaded);
    state=structuredClone(candidate);controlled=null;routes.clear();seen.clear();undo=[];state.rev++;emit('restored',{roomId:state.roomId});await persist();broadcast();return;
  }
  if(!state)throw new Error('请先创建牌桌');
  if(m.kind==='join'){if(state.practice)throw new Error('演练房间不接受网络玩家');const result=joinRoom(state,m.credentials);state=result.state;bind(route,result.seat);await persist();broadcast();return;}
  if(m.kind==='sync'){if(route!=='host'&&!routes.has(route))throw new Error('尚未绑定席位');emit('view',{route,view:project(state,route==='host'?(controlled||state.hostId):routes.get(route))});return;}
  if(m.kind==='export'){emit('export',{snapshot:state});return;}
  if(m.kind==='control'){if(!state.practice)throw new Error('只有本地演练可切换席位');if(!state.players.some(p=>p.id===m.seat))throw new Error('席位不存在');controlled=m.seat;broadcast();return;}
  if(m.kind==='undo'){
    if(!undo.length)throw new Error('没有可撤销的操作');const rev=state.rev;state=undo.pop();state.rev=rev+1;
    // A monotonic revision prevents stale in-flight requests from reapplying after undo.
    state.logs.push({rev:state.rev,text:'房主撤销了上一步。已看到的信息无法被收回。'});await persist();broadcast();return;
  }
  if(m.kind==='action'){
    const actor=route==='host'?(controlled||state.hostId):routes.get(route);if(!actor)throw new Error('未绑定席位，请重连');
    const a=m.action;if(!a||typeof a.id!=='string'||a.id.length>128)throw new Error('操作编号无效');
    const key=actor+':'+a.id;
    if(seen.has(key)){emit('ack',{route,id:a.id,rev:seen.get(key)});return;}
    const next=reduce(state,actor,a);undo.push(state);undo=undo.slice(-30);state=next;seen.set(key,state.rev);if(seen.size>2000)seen.delete(seen.keys().next().value);
    await persist();broadcast();emit('ack',{route,id:a.id,rev:state.rev});return;
  }
  throw new Error('未知后端消息');
}
