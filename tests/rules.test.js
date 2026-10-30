import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,joinRoom,reduce,project,validateState,migrateState} from '../dist/backend/engine.js';
import {DECK,CARD_BY_ID,deckFor} from '../dist/data/cards.js';
import {distance,attackRange} from '../dist/backend/primitives.js';
const command=(s,id,type,extra={})=>reduce(s,id,{type,rev:s.rev,...extra});
function lobby({n=4,...opts}={}){let s=newRoom({hostId:'host',token:'h'.repeat(32),size:n,...opts});for(let i=1;i<n;i++)s=joinRoom(s,{token:String(i).repeat(32),name:'玩家'+i}).state;return s;}
function game(n=4){let s=command(lobby({n}),'host','start');s.players.forEach((p,i)=>p.general=['caocao','guanyu','huangyueying','zhangfei'][i%4]);s.turn='host';s.phase=3;return s;}
function give(s,p,kind,ordinal=0){const id=deckFor(s.deckSet,s.ex).filter(c=>c.kind===kind)[ordinal].id;for(const zone of [s.deck,s.discard,s.pool,...Object.values(s.peek),...Object.values(s.rules.commits),...s.players.flatMap(p=>[p.hand,p.equip,p.judge])]){const i=zone.indexOf(id);if(i>=0)zone.splice(i,1);}p.hand.push(id);return id;}
function counterPass(s){while(s.rules.pending?.kind==='counter'){const q=s.rules.pending;const id=q.players.find(id=>!q.passed.includes(id));s=command(s,id,'pass');}return s;}
test('army deck adds exactly 52 instances with correct basic counts',()=>{const army=DECK.filter(c=>c.pack==='army');assert.equal(army.length,52);assert.equal(army.filter(c=>c.kind==='jiu').length,5);assert.equal(army.filter(c=>c.kind==='fire_sha').length,5);assert.equal(army.filter(c=>c.kind==='thunder_sha').length,9);});
test('slash waits, dodge prevents damage, a second ordinary slash is refused',()=>{
 let s=game(),a=s.players[0],b=s.players[1],sha=give(s,a,'sha'),shan=give(s,b,'shan'),hp=b.hp;
 s=command(s,a.id,'use',{cards:[sha],target:b.id});assert.equal(s.rules.pending.kind,'slash');assert.equal(s.players[1].hp,hp);
 s=command(s,b.id,'respond',{cards:[shan]});assert.equal(s.rules.pending,null);assert.equal(s.players[1].hp,hp);assert(s.discard.includes(sha));assert(s.discard.includes(shan));
 const another=give(s,s.players[0],'sha',1);assert.throws(()=>command(s,a.id,'use',{cards:[another],target:b.id}),/已经使用过杀/);validateState(s);
});
test('wine boosts next slash only, pass applies automatic damage',()=>{let s=game(),a=s.players[0],b=s.players[1];const jiu=give(s,a,'jiu'),sha=give(s,a,'sha');s=command(s,a.id,'use',{cards:[jiu],target:a.id});assert.equal(s.rules.drank,1);s=command(s,a.id,'use',{cards:[sha],target:b.id});assert.equal(s.rules.drank,0);const before=s.players[1].hp;s=command(s,b.id,'pass');assert.equal(s.players[1].hp,before-2);});
test('peach heals self, full health rejects, and off-turn use rejects',()=>{let s=game(),a=s.players[0],tao=give(s,a,'tao');assert.throws(()=>command(s,a.id,'use',{cards:[tao],target:a.id}),/体力已满/);s.players[0].hp--;s=command(s,a.id,'use',{cards:[tao],target:a.id});assert.equal(s.players[0].hp,s.players[0].maxHp);const card=give(s,s.players[1],'sha');assert.throws(()=>command(s,s.players[1].id,'use',{cards:[card],target:a.id}),/自己的出牌阶段/);});
test('distance uses living seats, mounts, weapon range and horsemanship',()=>{
 let s=game(4);assert.equal(distance(s,s.players[0].id,s.players[2].id),2);const plus=give(s,s.players[2],'jueying');s.players[2].hand.splice(s.players[2].hand.indexOf(plus),1);s.players[2].equip.push(plus);assert.equal(distance(s,'host',s.players[2].id),3);
 s.players[0].general='machao';assert.equal(distance(s,'host',s.players[2].id),2);const weapon=give(s,s.players[0],'qilin');s.players[0].hand.splice(s.players[0].hand.indexOf(weapon),1);s.players[0].equip.push(weapon);assert.equal(attackRange(s.players[0]),5);s.players[1].dead=true;assert.equal(distance(s,'host',s.players[2].id),1);validateState(s);
});
test('out of range slash and snatch are rejected atomically',()=>{const s=game(),sha=give(s,s.players[0],'sha'),before=structuredClone(s);assert.throws(()=>command(s,'host','use',{cards:[sha],target:s.players[2].id}),/攻击范围/);assert.deepEqual(s,before);const shun=give(s,s.players[0],'shun');assert.throws(()=>command(s,'host','use',{cards:[shun],target:s.players[2].id}),/距离/);});
test('elemental chain damage propagates once and resets links',()=>{let s=game(),a=s.players[0],b=s.players[1],c=s.players[2];b.chained=true;c.chained=true;const fire=give(s,a,'fire_sha');const hpB=b.hp,hpC=c.hp;s=command(s,'host','use',{cards:[fire],target:b.id});s=command(s,b.id,'pass');assert.equal(s.players[1].hp,hpB-1);assert.equal(s.players[2].hp,hpC-1);assert(!s.players[1].chained&&!s.players[2].chained);});
test('duel alternates actual slash responses and damages first passer',()=>{let s=game(),a=s.players[0],b=s.players[1],duel=give(s,a,'juedou'),sha=give(s,b,'sha');s=counterPass(command(s,'host','use',{cards:[duel],target:b.id}));assert.equal(s.rules.pending.kind,'duel');s=command(s,b.id,'respond',{cards:[sha]});assert.equal(s.rules.pending.player,'host');const before=s.players[0].hp;s=command(s,'host','pass');assert.equal(s.players[0].hp,before-1);});
test('nullification counter-counter restores a trick',()=>{let s=game(),a=s.players[0],b=s.players[1],card=give(s,a,'wuzhong'),w1=give(s,b,'wuxie'),w2=give(s,a,'wuxie',1);s=command(s,'host','use',{cards:[card]});s=command(s,b.id,'respond',{cards:[w1]});assert(s.rules.pending.negated);s=command(s,'host','respond',{cards:[w2]});assert(!s.rules.pending.negated);const count=s.players[0].hand.length;s=counterPass(s);assert.equal(s.players[0].hand.length,count+2);});
test('pindian selections remain hidden until both commit and equal ranks do not win',()=>{
 let s=game(),a=s.players[0],b=s.players[1];const slashes=s.deck.filter(id=>CARD_BY_ID[id].kind==='sha'),first=slashes.find(id=>slashes.some(other=>id!==other&&CARD_BY_ID[id].rank===CARD_BY_ID[other].rank)),second=slashes.find(id=>id!==first&&CARD_BY_ID[id].rank===CARD_BY_ID[first].rank),catalog=deckFor(s.deckSet,s.ex).filter(c=>c.kind==='sha');const ca=give(s,a,'sha',catalog.findIndex(c=>c.id===first)),cb=give(s,b,'sha',catalog.findIndex(c=>c.id===second));assert.equal(CARD_BY_ID[ca].rank,CARD_BY_ID[cb].rank);
 s=command(s,'host','pindian',{target:b.id});s=command(s,'host','respond',{cards:[ca]});const publicView=project(s,s.players[2].id);assert(!JSON.stringify(publicView).includes(ca));assert(!publicView.pending.cards);validateState(s);
 s=command(s,b.id,'respond',{cards:[cb]});assert.equal(s.rules.lastResult.winner,null);assert(s.pool.includes(ca)&&s.pool.includes(cb));validateState(s);
});
test('delayed judgment waits for nullification then confirmation and skips draw',()=>{let s=game(),p=s.players[0],id=give(s,p,'bingliang');p.hand.splice(p.hand.indexOf(id),1);p.judge.push(id);const top=give(s,p,'tao');p.hand.splice(p.hand.indexOf(top),1);s.deck.unshift(top);s.phase=0;s=counterPass(command(s,'host','phase'));assert.equal(s.rules.pending.kind,'judge');s=command(s,'host','pass');assert(s.rules.skipDraw);const count=s.players[0].hand.length;s=command(s,'host','phase');assert.equal(s.players[0].hand.length,count);assert(s.discard.includes(id));});
test('dying rescue uses peach and restores pending queue safely',()=>{let s=game(),a=s.players[0],b=s.players[1],sha=give(s,a,'sha'),tao=give(s,a,'tao');s.players[1].hp=1;s=command(s,'host','use',{cards:[sha],target:b.id});s=command(s,b.id,'pass');assert.equal(s.rules.pending.kind,'save');assert.equal(s.rules.pending.player,'host');s=command(s,'host','respond',{cards:[tao]});assert.equal(s.players[1].hp,1);assert(!s.players[1].dead);assert.equal(s.rules.pending,null);validateState(s);});
test('host correction cancels a concealed pindian without losing cards and is logged',()=>{let s=game(),b=s.players[1],card=s.players[0].hand[0];s=command(s,'host','pindian',{target:b.id});s=command(s,'host','respond',{cards:[card]});assert.throws(()=>command(s,b.id,'correct',{op:'cancel',reason:'测试'}),/仅房主/);s=command(s,'host','correct',{op:'cancel',reason:'技能时机错误'});assert(s.players[0].hand.includes(card));assert.equal(s.rules.pending,null);assert(s.logs.at(-1).text.includes('技能时机错误'));validateState(s);});
test('random / chosen / five-choice selection are enforced and private',()=>{
 let s=lobby({selectionMode:'random'});assert.throws(()=>command(s,'host','general',{general:'caocao'}),/纯随机/);
 s=lobby({selectionMode:'choose'});assert.throws(()=>command(s,'host','start'),/等待所有/);for(let i=0;i<s.players.length;i++)s=command(s,s.players[i].id,'general',{general:['caocao','liubei','sunquan','lvbu'][i]});s=command(s,'host','start');assert.equal(s.players[0].general,'caocao');
 s=lobby({n:2,selectionMode:'five'});assert.equal(s.choices.host.length,5);assert.equal(new Set(Object.values(s.choices).flat()).size,10);assert.deepEqual(project(s,'host').choices,s.choices.host);assert.equal(project(s,'host').players[1].choices,undefined);
 const outside=Object.keys((awaitGeneralMap())).find(id=>!s.choices.host.includes(id));assert.throws(()=>command(s,'host','general',{general:outside}),/五名候选/);for(const p of s.players)s=command(s,p.id,'general',{general:s.choices[p.id][0]});s=command(s,'host','start');validateState(s);
});
import {GENERAL_MAP} from '../dist/data/generals.js';
const awaitGeneralMap=()=>GENERAL_MAP;
test('v1 saves migrate to free mode, standard deck and current schema without enabling new skills',()=>{const legacy=game();legacy.schema=1;delete legacy.mode;delete legacy.deckSet;delete legacy.rules;legacy.deck=legacy.deck.filter(id=>CARD_BY_ID[id].pack==='standard');for(const p of legacy.players)p.hand=p.hand.filter(id=>CARD_BY_ID[id].pack==='standard'); // Build a complete legacy fixture.
const ids=new Set([...legacy.deck,...legacy.players.flatMap(p=>p.hand)]);for(const c of deckFor('standard'))if(!ids.has(c.id))legacy.deck.push(c.id);
const migrated=migrateState(legacy);assert.equal(migrated.schema,6);assert.equal(migrated.skillAutomation,false);assert.equal(migrated.mode,'manual');assert.equal(migrated.deckSet,'standard');validateState(migrated);});
test('delay placement has no premature counter window, nullification is before judgment',()=>{
 let s=game(),a=s.players[0],b=s.players[1],le=give(s,a,'le'),wuxie=give(s,a,'wuxie');s=command(s,'host','use',{cards:[le],target:b.id});assert.equal(s.rules.pending,null);assert(s.players[1].judge.includes(le));
 s.turn=b.id;s.phase=0;const before=s.deck.length;s=command(s,b.id,'phase');assert.equal(s.rules.pending.kind,'counter');assert.equal(s.deck.length,before);
 s=command(s,'host','respond',{cards:[wuxie]});s=counterPass(s);assert.equal(s.rules.pending,null);assert(s.discard.includes(le));assert(!s.rules.skipPlay);assert.equal(s.deck.length,before);validateState(s);
});
test('phase progression draws once and unused wine clears on next turn',()=>{
 let s=game();const wine=give(s,s.players[0],'jiu');s=command(s,'host','use',{cards:[wine],target:'host'});s.phase=5;s=command(s,'host','phase');assert.equal(s.rules.drank,0);assert.equal(s.rules.wineUsed,false);
 const current=s.turn,count=seatCount(s,current);s=command(s,current,'phase');s=command(s,current,'phase');assert.equal(seatCount(s,current),count+2);
});
function seatCount(s,id){return s.players.find(p=>p.id===id).hand.length;}
test('black slash is blocked by shield and white lion caps wine damage',()=>{
 let s=game(),b=s.players[1],armor=give(s,b,'renwang');b.hand.splice(b.hand.indexOf(armor),1);b.equip.push(armor);const sha=give(s,s.players[0],'sha'),before=b.hp;s=command(s,'host','use',{cards:[sha],target:b.id});assert.equal(s.rules.pending,null);assert.equal(s.players[1].hp,before);
 s=game();b=s.players[1];armor=give(s,b,'baiyin');b.hand.splice(b.hand.indexOf(armor),1);b.equip.push(armor);const wine=give(s,s.players[0],'jiu'),next=give(s,s.players[0],'sha');s=command(s,'host','use',{cards:[wine]});s=command(s,'host','use',{cards:[next],target:b.id});s=command(s,b.id,'pass');assert.equal(s.players[1].hp,b.hp-1);
});
test('five-grains choice cannot take unrelated public cards',()=>{
 let s=game(),wugu=give(s,s.players[0],'wugu');s=counterPass(command(s,'host','use',{cards:[wugu]}));assert.equal(s.rules.pending.kind,'market');assert.throws(()=>command(s,'host','pickEffect',{card:wugu}),/五谷/);
 while(s.rules.pending){if(s.rules.pending.kind==='counter')s=counterPass(s);else {const q=s.rules.pending;s=command(s,q.player,'pickEffect',{card:q.available[0]});}}
 assert.equal(s.rules.market.length,0);validateState(s);
});
test('failed rescue confirms death and applies rebel reward',()=>{
 let s=game(),b=s.players[1];s.players[0].role='lord';s.players[1].role='rebel';s.players[2].role='loyal';s.players[3].role='spy';b.hp=1;const sha=give(s,s.players[0],'sha');s=command(s,'host','use',{cards:[sha],target:b.id});s=command(s,b.id,'pass');const hand=s.players[0].hand.length;
 while(s.rules.pending?.kind==='save')s=command(s,s.rules.pending.player,'pass');assert(s.players[1].dead);assert.equal(s.players[0].hand.length,hand+3);assert.equal(s.status,'playing');validateState(s);
});
