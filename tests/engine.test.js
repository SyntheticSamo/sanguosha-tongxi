import test from 'node:test';
import assert from 'node:assert/strict';
import {DECK,CARD_TYPES,CARD_BY_ID,deckFor} from '../dist/data/cards.js';
import {GENERALS} from '../dist/data/generals.js';
import {newRoom,joinRoom,reduce,project,validateState,shuffle} from '../dist/backend/engine.js';
import {envelope,parseMessage,acceptSnapshot} from '../dist/sync/protocol.js';
const host='host',token='h'.repeat(32);
function lobby(n=4,ex=true){let s=newRoom({hostId:host,token,size:n,ex,name:'主持人',mode:'manual',deckSet:'standard',selectionMode:'random'});for(let i=1;i<n;i++)s=joinRoom(s,{token:String(i).repeat(32),name:'玩家'+i}).state;return s;}
const act=(s,actor,type,extra={})=>reduce(s,actor,{type,rev:s.rev,...extra});
const start=(n=4,ex=true)=>act(lobby(n,ex),host,'start');
function locate(s,kind,player=s.players[0]){
 const id=deckFor(s.deckSet,s.ex).find(c=>c.kind===kind).id;
  for(const zone of [s.deck,s.discard,s.pool,...Object.values(s.peek),...s.players.flatMap(p=>[p.hand,p.equip,p.judge])]){const i=zone.indexOf(id);if(i>=0)zone.splice(i,1);}player.hand.push(id);return id;
}
test('catalog preserves classic standard / EX counts and adds military deck',()=>{
 assert.equal(deckFor('standard').length,108);assert.equal(deckFor('standard',false).length,104);assert.equal(new Set(DECK.map(c=>c.id)).size,DECK.length);assert.equal(deckFor('army').length,160);assert.equal(deckFor('wood').length,161);
 for(const [kind,count]of Object.entries({sha:30,shan:15,tao:8,chai:6,shun:5,wuxie:3,bagua:2}))assert.equal(deckFor('standard',false).filter(c=>c.kind===kind).length,count);
 assert.deepEqual(DECK.filter(c=>c.ex).map(c=>c.kind),['hanbing','renwang','shandian','wuxie']);
});
test('every 2–8 seat layout starts with conserved cards and one public lord',()=>{
 for(let n=2;n<=8;n++)for(const ex of [false,true]){const s=start(n,ex);validateState(s);assert.equal(s.deck.length,(ex?108:104)-n*4);assert.equal(s.players.filter(p=>p.role==='lord').length,1);assert.equal(s.players.filter(p=>p.roleOpen).length,1);assert.equal(s.turn,s.players.find(p=>p.role==='lord').id);}
});
test('projections contain no deck order, tokens, other hands or hidden identities',()=>{
 const s=start(),seat=s.players.find(p=>p.role!=='lord');const v=project(s,seat.id);
 assert.equal(v.deck,undefined);assert.equal(v.players.find(p=>p.id===seat.id).hand.length,4);
 for(const p of v.players){assert.equal(p.token,undefined);if(p.id!==seat.id)assert.equal(p.hand,null);if(p.id!==seat.id&&p.role!=='lord')assert.equal(p.role,null);}
 assert(!JSON.stringify(v).includes(token));
});
test('invalid action is atomic and stale revision rejected',()=>{
 const s=start(),before=structuredClone(s);assert.throws(()=>act(s,host,'give',{cards:[s.deck[0]],target:s.players[1].id}),/只能交出/);assert.deepEqual(s,before);
 assert.throws(()=>reduce(s,host,{type:'draw',n:2,rev:s.rev-1}),/状态已更新/);
});
test('hidden transfers disclose count but not identities to third parties',()=>{
 const s=start(),id=s.players[0].hand[0],to=s.players[1].id;const next=act(s,host,'give',{cards:[id],target:to});
 assert(next.players[1].hand.includes(id));assert(!next.logs.at(-1).text.includes(CARD_BY_ID[id].kind));assert.equal(project(next,s.players[2].id).players[1].hand,null);validateState(next);
});
test('equip replaces same slot and preserves all cards',()=>{
 let s=start();const a=locate(s,'liannu'),b=locate(s,'qinggang');s=act(s,host,'equip',{cards:[a]});s=act(s,host,'equip',{cards:[b]});assert.deepEqual(s.players[0].equip,[b]);assert(s.discard.includes(a));validateState(s);
});
test('play / reveal / take / clear and delayed-card passing preserve zones',()=>{
 let s=start();const id=locate(s,'sha');s=act(s,host,'play',{cards:[id],target:s.players[1].id});assert(s.pool.includes(id));s=act(s,s.players[1].id,'takePool',{cards:[id]});assert(s.players[1].hand.includes(id));
 s=act(s,host,'reveal',{n:4});s=act(s,host,'clearPool');const delay=locate(s,'shandian');s=act(s,host,'delay',{cards:[delay],target:host});s=act(s,host,'publicMove',{cards:[delay],zone:'judge',target:host,to:'judge',destination:s.players[1].id});assert(s.players[1].judge.includes(delay));validateState(s);
});
test('private top-deck view and ordered return hide card identities',()=>{
 let s=start();const top=s.deck.slice(0,3),other=s.players[1].id;s=act(s,host,'peek',{n:3});assert.deepEqual(project(s,host).peek,top);assert.deepEqual(project(s,other).peek,[]);assert.equal(project(s,other).deck,undefined);
 s=act(s,host,'returnPeek',{cards:[top[2],top[0]],to:'top'});s=act(s,host,'returnPeek',{cards:[top[1]],to:'bottom'});assert.deepEqual(s.deck.slice(0,2),[top[2],top[0]]);assert.equal(s.deck.at(-1),top[1]);validateState(s);
});
test('phase control is restricted and blocked by unreturned private cards',()=>{
 let s=start();const active=s.turn,other=s.players.find(p=>p.id!==active&&p.id!==host)?.id;
 if(other)assert.throws(()=>act(s,other,'phase'),/当前回合/);
 s=act(s,host,'peek',{n:1});assert.throws(()=>act(s,host,'phase'),/放回/);
 s=act(s,host,'returnPeek',{cards:s.peek[host],to:'top'});s=act(s,host,'phase');assert.equal(s.phase,1);
});
test('new peers blocked after start but original seat can reconnect with token',()=>{
 const s=start(),p=s.players[1];assert.throws(()=>joinRoom(s,{name:'late',token:'z'.repeat(32)}),/仅允许原席位/);const re=joinRoom(s,{name:'rename',token:p.token});assert.equal(re.seat,p.id);assert.equal(re.state.rev,s.rev);
});
test('dead seats require host, dying status, and discard all personal cards',()=>{
 let s=start(),p=s.players[1];assert.throws(()=>act(s,p.id,'death',{target:p.id}),/仅房主/);assert.throws(()=>act(s,host,'death',{target:p.id}),/求桃/);
 while(s.players[1].hp>0)s=act(s,host,'hp',{target:p.id,delta:-5});s=act(s,host,'death',{target:p.id});assert(s.players[1].dead);assert.equal(s.players[1].hand.length,0);assert.equal(project(s,host).players[1].role,s.players[1].role);validateState(s);
});
test('only host starts / removes seats / finishes',()=>{
 let s=lobby();const guest=s.players[1].id;assert.throws(()=>act(s,guest,'start'),/仅房主/);assert.throws(()=>act(s,guest,'removeSeat',{target:host}),/仅房主/);s=act(s,host,'start');assert.throws(()=>act(s,guest,'finish',{winner:'反贼'}),/仅房主/);
 s=act(s,host,'finish',{winner:'主忠'});assert.equal(s.status,'finished');assert(project(s,guest).players.every(p=>p.role));
});
test('tampered backups with duplicate or missing cards fail validation',()=>{const s=start();s.deck[0]=s.deck[1];assert.throws(()=>validateState(s),/重复/);const t=start();t.deck.pop();assert.throws(()=>validateState(t),/守恒/);});
test('protocol rejects malformed envelopes, stale snapshots, and cross-room state',()=>{
 assert.equal(parseMessage(JSON.stringify(envelope('sync'))).kind,'sync');assert.throws(()=>parseMessage('{"v":3,"kind":"sync"}'),/不兼容/);
 const v=project(start(),host);assert.equal(acceptSnapshot(v,{...v,rev:v.rev-1}),false);assert.throws(()=>acceptSnapshot(v,{...v,roomId:'different'}),/房间不匹配/);
});
test('shuffle does not mutate input and is a permutation',()=>{const xs=[1,2,3,4];const ys=shuffle(xs,()=>0);assert.deepEqual(xs,[1,2,3,4]);assert.deepEqual([...ys].sort(),xs);});
test('draw reshuffles discarded cards and never creates cards',()=>{
 let s=start();s.discard.push(...s.deck.splice(0));const before=s.players[0].hand.length;s=act(s,host,'draw',{n:2});assert.equal(s.players[0].hand.length,before+2);assert.equal(s.discard.length,0);validateState(s);
});
