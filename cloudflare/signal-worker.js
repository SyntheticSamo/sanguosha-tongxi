// Optional rendezvous for 同席. It only relays WebRTC connection descriptions between
// browsers in the same room; game state, seat tokens and chat never pass through it.
// One Durable Object per room, WebSocket Hibernation so idle tables are not billed.
import {DurableObject} from 'cloudflare:workers';
// The room id is derived from a secret only the host keeps, so a guest who has the
// invite link can join but cannot claim the host role. Same code as the browser.
import {roomFromKey} from '../dist/sync/room-key.js';

const ROOM=/^[A-Za-z0-9_-]{22}$/,PEER=/^[A-Za-z0-9_-]{8,64}$/;
const MAX_MESSAGE=65536,MAX_GUESTS=12,WINDOW_MS=10000,WINDOW_LIMIT=240,TURN_TTL=12*3600;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});

function allowedOrigin(request,env){
  const list=String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean),origin=request.headers.get('Origin');
  if(!list.length)return origin||'*';
  return origin&&list.includes(origin)?origin:null;
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=allowedOrigin(request,env);
    if(url.pathname==='/v1/health')return json({ok:true,service:'tongxi-signal',v:1},200,origin?{'access-control-allow-origin':origin}:{});
    const m=/^\/v1\/room\/([^/]+)\/ws$/.exec(url.pathname);
    if(!m)return json({error:'not found'},404);
    if(request.headers.get('Upgrade')!=='websocket')return json({error:'expected websocket'},426);
    if(!origin)return json({error:'origin not allowed'},403);
    const room=m[1],role=url.searchParams.get('role'),peer=url.searchParams.get('peer');
    if(!ROOM.test(room)||!['host','guest'].includes(role)||!PEER.test(peer||''))return json({error:'bad request'},400);
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  }
};

export class SignalRoom extends DurableObject{
  constructor(ctx,env){
    super(ctx,env);this.env=env;this.rates=new Map();
    // Answered at the edge without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}','{"t":"pong"}'));
  }
  sockets(filter=()=>true){return this.ctx.getWebSockets().map(ws=>({ws,a:ws.deserializeAttachment()||{}})).filter(({a})=>a.peer&&filter(a));}
  host(){return this.sockets(a=>a.role==='host'&&a.authed)[0]?.ws||null;}
  guests(){return this.sockets(a=>a.role==='guest');}
  post(ws,data){try{ws.send(JSON.stringify(data));}catch{}}
  async fetch(request){
    const url=new URL(request.url),room=url.pathname.split('/')[3],role=url.searchParams.get('role'),peer=url.searchParams.get('peer');
    if(role==='guest'&&this.guests().filter(g=>g.a.peer!==peer).length>=MAX_GUESTS)return json({error:'room full'},429);
    const [client,server]=Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server,[role]);
    server.serializeAttachment({room,role,peer,authed:role==='guest',at:Date.now()});
    if(role==='guest'){
      for(const {ws,a} of this.guests())if(a.peer===peer&&ws!==server)ws.close(4000,'replaced');
      this.post(server,{t:'welcome',role,peer,host:!!this.host(),ice:await this.ice()});
      const host=this.host();if(host)this.post(host,{t:'join',peer});
    }
    return new Response(null,{status:101,webSocket:client});
  }
  limited(ws,a){
    const now=Date.now(),r=this.rates.get(a.peer)||{at:now,n:0};if(now-r.at>WINDOW_MS){r.at=now;r.n=0;}r.n++;this.rates.set(a.peer,r);
    if(r.n>WINDOW_LIMIT){ws.close(4008,'rate limited');return true;}return false;
  }
  async webSocketMessage(ws,raw){
    const a=ws.deserializeAttachment()||{};
    if(typeof raw!=='string'||raw.length>MAX_MESSAGE){ws.close(1009,'message too large');return;}
    if(this.limited(ws,a))return;
    let m;try{m=JSON.parse(raw);}catch{ws.close(1007,'bad json');return;}
    if(!m||typeof m.t!=='string')return;
    if(a.role==='host'&&!a.authed){
      if(m.t!=='auth'||typeof m.key!=='string'||m.key.length<32||m.key.length>128||await roomFromKey(m.key)!==a.room){ws.close(4003,'not the host of this room');return;}
      for(const {ws:old} of this.sockets(x=>x.role==='host'&&x.authed))if(old!==ws)old.close(4000,'replaced');
      a.authed=true;ws.serializeAttachment(a);
      this.post(ws,{t:'welcome',role:'host',peer:a.peer,peers:this.guests().map(g=>g.a.peer),ice:await this.ice()});
      for(const {ws:g} of this.guests())this.post(g,{t:'host',online:true});
      return;
    }
    if(m.t!=='signal'||!m.data||typeof m.data!=='object')return;
    if(a.role==='host'){
      if(typeof m.to!=='string')return;
      const target=this.guests().find(g=>g.a.peer===m.to);if(target)this.post(target.ws,{t:'signal',data:m.data});
      else this.post(ws,{t:'leave',peer:m.to});
    }else{
      const host=this.host();if(host)this.post(host,{t:'signal',from:a.peer,data:m.data});
      else this.post(ws,{t:'host',online:false});
    }
  }
  async webSocketClose(ws,code){this.gone(ws);try{ws.close(code===1005?1000:code,'bye');}catch{}}
  async webSocketError(ws){this.gone(ws);}
  gone(ws){
    const a=ws.deserializeAttachment()||{};this.rates.delete(a.peer);
    if(a.role==='guest'){const host=this.host();if(host&&host!==ws&&!this.guests().some(g=>g.ws!==ws&&g.a.peer===a.peer))this.post(host,{t:'leave',peer:a.peer});}
    else if(a.authed&&!this.sockets(x=>x.role==='host'&&x.authed).some(x=>x.ws!==ws))for(const {ws:g} of this.guests())this.post(g,{t:'host',online:false});
  }
  // Short-lived Cloudflare Realtime TURN credentials, only for connected room members.
  async ice(){
    const {TURN_KEY_ID:id,TURN_KEY_API_TOKEN:token}=this.env;if(!id||!token)return [];
    if(this.iceCache&&Date.now()-this.iceCache.at<3600000)return this.iceCache.servers;
    try{
      const r=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({ttl:TURN_TTL})});
      if(!r.ok)return [];
      const servers=((await r.json()).iceServers||[]).map(s=>({...s,urls:[s.urls].flat().filter(u=>typeof u==='string'&&!/:53(\?|$)/.test(u))})).filter(s=>s.urls.length);
      this.iceCache={at:Date.now(),servers};return servers;
    }catch{return [];}
  }
}
