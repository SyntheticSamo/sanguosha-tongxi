import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {newRoom,reduce,project,validateState} from '../dist/backend/engine.js';
import {PhaseHistory} from '../dist/backend/phase-history.js';
import {routeBetweenSeats,softenChain,crossesRect,sampleChain} from '../dist/ui/chain-geometry.js';
import {readNickname,saveNickname} from '../dist/ui/nickname.js';
const act=(s,type,data={})=>reduce(s,s.hostId,{type,rev:s.rev,...data});
function table(){let s=newRoom({hostId:'host',token:'h'.repeat(32),practice:true,size:2,mode:'manual',selectionMode:'random'});s=act(s,'localSeat');s=act(s,'start');s.phase=2;return s;}

test('phase rewind restores the start of the preceding phase, not its last action',()=>{
 const h=new PhaseHistory(),s=table();h.reset(s);const drawn=act(s,'draw',{n:2});h.observe(s,drawn);const played=act(drawn,'phase');h.observe(drawn,played);
 const before=JSON.stringify(played),next=h.rewind(played);validateState(next);assert.equal(next.phase,2);assert.deepEqual(next.players.map(p=>p.hand),s.players.map(p=>p.hand));assert.deepEqual(next.deck,s.deck);assert.equal(next.rev,played.rev+1);assert.equal(next.presentationResetRev,next.rev);assert.equal(JSON.stringify(played),before);assert.equal(h.entries.length,2);
 h.commitRewind(next);assert.equal(h.summary(next).available,false);assert.throws(()=>act(next,'chat',{rev:played.rev,message:'old operation'}));assert.equal(project(next,next.players[1].id).phaseUndo,undefined);
});
test('phase checkpoint snapshots do not change with chat, selections or later mutations',()=>{
 const h=new PhaseHistory(),s=table();h.reset(s);const changed=act(s,'chat',{message:'later'});h.observe(s,changed);assert.equal(h.entries.length,1);assert.equal(h.entries[0].snapshot.logs.length,s.logs.length);changed.players[0].hand.pop();assert.equal(h.entries[0].snapshot.players[0].hand.length,s.players[0].hand.length);
});
test('phase rewind history is bounded, cleared at restore and handles turn boundaries',()=>{
 const h=new PhaseHistory({limit:2}),s=table();h.reset(s);for(let i=3;i<=5;i++){const next=structuredClone(s);next.phase=i;h.capture(next);}assert.equal(h.entries.length,2);const turn=structuredClone(s);turn.round++;turn.turn=turn.players[1].id;turn.phase=0;h.capture(turn);assert.equal(h.summary(turn).phase,5);h.reset(turn);assert.equal(h.summary(turn).available,false);assert.throws(()=>h.rewind(turn));
 const tiny=new PhaseHistory({maxBytes:1});tiny.reset(s);assert.equal(tiny.entries.length,0);
});
test('rewinding a tactile table pauses only the restored current player preference',()=>{
 const h=new PhaseHistory(),s=table();s.tableExperience=true;s.flow={paused:false};s.players.forEach(p=>p.autoAdvanceEnabled=true);h.reset(s);const next=structuredClone(s);next.phase=3;next.rev++;h.capture(next);const back=h.rewind(next);assert.equal(back.players.find(p=>p.id===back.turn).autoAdvanceEnabled,false);assert.equal(back.players.find(p=>p.id!==back.turn).autoAdvanceEnabled,true);assert.equal(back.flow.paused,false);assert(!('entries' in back));
});
test('chain attachments stay outside both endpoint bodies in all directions',()=>{
 const a={x:300,y:300,w:90,h:60};for(const [dx,dy]of [[220,0],[-220,0],[0,220],[0,-220],[220,180],[-220,180],[220,-180],[-220,-180]]){
  const b={...a,x:a.x+dx,y:a.y+dy},rect=p=>({left:p.x-p.w/2-5,right:p.x+p.w/2+5,top:p.y-p.h/2-5,bottom:p.y+p.h/2+5}),obstacles=[rect(a),rect(b),{left:380,right:420,top:200,bottom:450}],path=routeBetweenSeats(a,b,obstacles);assert(path.length>1);const curve=softenChain(path,obstacles);assert(curve.slice(1).every((p,i)=>obstacles.every(r=>!crossesRect(curve[i],p,r))));const samples=sampleChain(curve);assert(samples.length<=121);assert(samples.every(p=>Number.isFinite(p.angle)));
 }
});
test('chain softening cannot introduce a collision after routing',()=>{
 const path=[{x:0,y:0},{x:100,y:0}],obstacles=[{left:40,right:60,top:4,bottom:20}];assert.deepEqual(softenChain(path,obstacles,10),path);assert(softenChain(path,[],10).length>2);
});
test('only the last actually used nickname is retained and unchanged names are not rewritten',()=>{
 const values=new Map([['tongxi:guest-name','旧昵称']]),writes=[],storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes.push([k,v]);values.set(k,v);},removeItem:k=>values.delete(k)};assert.equal(readNickname(storage),'旧昵称');saveNickname(storage,'  新昵称  ');assert.deepEqual([...values],[['tongxi:last-name','新昵称']]);saveNickname(storage,'新昵称');assert.equal(writes.length,1);saveNickname(storage,'下一个名字');assert.equal(values.size,1);assert.equal(readNickname(storage),'下一个名字');saveNickname(storage,'');assert.equal(writes.length,2);
});
test('host Worker alone can rewind phases and remote snapshots contain no checkpoint metadata',async()=>{
 const url=new URL('../dist/backend/worker.js',import.meta.url).href,w=new Worker(`const {parentPort}=require('node:worker_threads');global.self=global;global.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage?.({data:m}));import(${JSON.stringify(url)}).then(()=>postMessage({kind:'ready'}));`,{eval:true}),messages=[],waiters=[];
 w.on('message',m=>{messages.push(m);for(const x of [...waiters])if(x.test(m)){waiters.splice(waiters.indexOf(x),1);clearTimeout(x.timer);x.resolve(m);}});
 const wait=fn=>{const old=messages.find(fn);if(old)return Promise.resolve(old);return new Promise((resolve,reject)=>{const item={test:fn,resolve,timer:setTimeout(()=>reject(new Error('Worker response timed out')),5000)};waiters.push(item);});};
 const send=async(m,fn)=>{messages.length=0;w.postMessage(m);return wait(fn);};
 try{
  await wait(m=>m.kind==='ready');let v=(await send({kind:'create',config:{hostId:'host',token:'h'.repeat(32),name:'房主',size:2,mode:'manual'}},m=>m.kind==='view'&&m.route==='host')).view;
  await send({kind:'join',route:'peer',credentials:{token:'g'.repeat(32),name:'好友'}},m=>m.kind==='view'&&m.route==='peer');v=(await send({kind:'sync'},m=>m.kind==='view')).view;
  for(const type of ['start','phase'])v=(await send({kind:'action',action:{type,id:crypto.randomUUID(),rev:v.rev}},m=>m.kind==='view'&&m.route==='host')).view;
  assert.equal(v.phaseUndo.available,true);const current=v.rev,room=v.roomId;
  for(const kind of ['rewindPhase','undo','export','restore','create','control']){const m=await send({kind,route:'peer'},m=>m.kind==='error');assert.match(m.message,/房主设备/);}
  const remote=(await send({kind:'sync',route:'peer'},m=>m.kind==='view'&&m.route==='peer')).view;assert.equal(remote.rev,current);assert.equal(remote.roomId,room);assert.equal(remote.phaseUndo,undefined);
  const id=crypto.randomUUID(),back=(await send({kind:'rewindPhase',id,rev:current},m=>m.kind==='view'&&m.route==='host')).view;assert.equal(back.phase,0);assert.equal(back.rev,current+1);assert.equal(back.phaseUndo.available,false);assert.equal(back.presentationResetRev,back.rev);
  const duplicate=await send({kind:'rewindPhase',id,rev:current},m=>m.kind==='ack');assert.equal(duplicate.rev,back.rev);
  const stale=await send({kind:'rewindPhase',id:crypto.randomUUID(),rev:current},m=>m.kind==='error');assert.match(stale.message,/已更新/);
 }finally{await w.terminate();}
});
