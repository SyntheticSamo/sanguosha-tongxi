import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,reduce,project,validateState,migrateState} from '../dist/backend/engine.js';
import {CARD_BY_ID,deckFor} from '../dist/data/cards.js';
import {freshRules} from '../dist/backend/rules.js';
const act=(s,id,type,data={})=>reduce(s,id,{type,rev:s.rev,...data});
function game(mode='auto'){let s=newRoom({hostId:'host',token:'h'.repeat(32),practice:true,size:4,mode,selectionMode:'choose'});while(s.players.length<4)s=act(s,'host','localSeat');for(const [i,id]of ['guanyu','caocao','zhaoyun','lvbu'].entries())s=act(s,s.players[i].id,'general',{general:id});s=act(s,'host','start');s.rules=freshRules();s.turn='host';s.phase=3;return s;}
function give(s,p,kind,n=0){const id=deckFor(s.deckSet,s.ex).filter(c=>c.kind===kind)[n].id;for(const z of [s.deck,s.discard,s.pool,...s.players.flatMap(p=>[p.hand,p.equip,p.judge])]){const i=z.indexOf(id);if(i>=0)z.splice(i,1);}p.hand.push(id);return id;}
test('private draw and concealed gift events disclose faces only to the permitted seats',()=>{
 let s=game('manual'),a=s.players[1],b=s.players[2];const drawn=s.deck.slice(0,2);s=act(s,'host','draw',{n:2});let mine=project(s,'host').cardEvents.filter(e=>e.rev===s.rev),other=project(s,b.id).cardEvents.filter(e=>e.rev===s.rev);assert.deepEqual(mine.at(-1).cards,drawn);assert.deepEqual(other.at(-1).cards,[]);assert.equal(other.at(-1).count,2);assert(!JSON.stringify(other).includes('privateCards'));
 s=act(s,'host','give',{cards:drawn,target:a.id});assert.deepEqual(project(s,a.id).cardEvents.at(-1).cards,drawn);assert.deepEqual(project(s,b.id).cardEvents.at(-1).cards,[]);validateState(s);
});
test('reshuffle events hide the new deck order and precede the private draw exactly once',()=>{
 let s=game('manual');s.discard.push(...s.deck);s.deck=[];s=act(s,'host','draw',{n:2});const publicView=project(s,s.players[1].id),events=publicView.cardEvents.filter(e=>e.rev===s.rev),recycle=events.filter(e=>e.to.zone==='deck');assert.equal(recycle.length,1);assert.equal(events[0].to.zone,'deck');assert.deepEqual(recycle[0].cards,[]);assert(events.every(e=>!('movedCards' in e)&&!('privateCards' in e)));assert.deepEqual(events.find(e=>e.to.zone==='hand').cards,[]);assert.equal(project(s,'host').cardEvents.find(e=>e.rev===s.rev&&e.to.zone==='hand').cards.length,2);validateState(s);
});
test('latest public use survives resolution and new snapshots without owning another entity',()=>{
 let s=game(),id=give(s,s.players[0],'tao');s.players[0].hp=2;s=act(s,'host','use',{cards:[id],target:'host'});assert(s.discard.includes(id));assert.equal(s.lastPublicPlay.host.kind,'tao');assert.deepEqual(s.lastPublicPlay.host.cards,[id]);const n=s.cardEvents.length;s=act(s,s.players[1].id,'chat',{message:'still visible'});assert.equal(s.cardEvents.length,n);assert.equal(project(s,s.players[1].id).lastPublicPlay.host.kind,'tao');validateState(migrateState(s));
});
test('converted uses record their effect kind and never create a material for virtual cards',()=>{
 let s=game(),p=s.players[0],id=give(s,p,'tao');s=act(s,'host','use',{cards:[id],as:'sha',target:s.players[1].id});assert.equal(s.lastPublicPlay.host.kind,'sha');assert.deepEqual(s.lastPublicPlay.host.cards,[id]);assert.equal(CARD_BY_ID[id].kind,'tao');validateState(s);
});
test('secret pindian event cannot reveal either submitted card before both players commit',()=>{
 let s=game(),b=s.players[1],aCard=s.players[0].hand[0],bCard=b.hand[0];s=act(s,'host','pindian',{target:b.id});s=act(s,'host','respond',{cards:[aCard]});assert.deepEqual(project(s,b.id).cardEvents.filter(e=>e.rev===s.rev).flatMap(e=>e.cards),[]);assert.equal(s.lastPublicPlay,undefined);s=act(s,b.id,'respond',{cards:[bCard]});const events=project(s,s.players[2].id).cardEvents.filter(e=>e.rev===s.rev);assert(events.flatMap(e=>e.cards).includes(aCard));assert(events.flatMap(e=>e.cards).includes(bCard));validateState(s);
});
test('judge reveal, replacement and completion are structured and publicly visible',()=>{
 let s=game();s=act(s,'host','judge');assert.equal(s.cardEvents.at(-1).stage,'reveal');const old=s.rules.pending.card,id=s.players[0].hand[0];s=act(s,'host','rejudge',{cards:[id]});assert(s.cardEvents.some(e=>e.rev===s.rev&&e.stage==='replace'&&e.publicCards.includes(id)));assert(s.cardEvents.some(e=>e.rev===s.rev&&e.stage==='replaced'&&e.publicCards.includes(old)));s=act(s,'host','pass');assert(s.cardEvents.some(e=>e.rev===s.rev&&e.stage==='result'));validateState(s);
});
test('batch discard records correct count; invalid action and stale revision are atomic',()=>{
 let s=game('manual'),before=structuredClone(s),ids=s.players[0].hand.slice(0,3);assert.throws(()=>act(s,'host','discard',{cards:[ids[0],s.players[1].hand[0]]}));assert.deepEqual(s,before);s=act(s,'host','discard',{cards:ids});const e=s.cardEvents.at(-1);assert.equal(e.count,3);assert.equal(e.to.zone,'discard');assert.deepEqual(e.publicCards,ids);assert.throws(()=>reduce(s,'host',{type:'draw',n:1,rev:s.rev-1}));validateState(s);
});
test('legacy schema3 loads without metadata and metadata projections whitelist every field',()=>{
 let s=game('manual');delete s.cardEvents;delete s.presentationSeq;delete s.lastPublicPlay;assert.deepEqual(project(migrateState(s),'host').cardEvents,[]);s=act(s,'host','play',{cards:[s.players[0].hand[0]]});s.cardEvents[0].from.secret=s.deck;s.lastPublicPlay.host.secret=s.deck;const v=project(s,s.players[1].id);assert.equal(v.cardEvents[0].from.secret,undefined);assert.equal(v.lastPublicPlay.host.secret,undefined);s.cardEvents[0].stage={secret:s.deck};assert.throws(()=>migrateState(s),/阶段/);
});
test('visual history remains bounded and player count validation never truncates input',()=>{
 let s=game('manual');for(let i=0;i<70;i++){s=act(s,'host','give',{cards:[s.players[0].hand[0]],target:s.players[1].id});s=act(s,s.players[1].id,'give',{cards:[s.players[1].hand.at(-1)],target:'host'});}assert(s.cardEvents.length<=64);assert(JSON.stringify(s.cardEvents).length<=32000);for(const size of [NaN,Infinity,0,1,2.5,9,'4'])assert.throws(()=>newRoom({hostId:'host',token:'h'.repeat(32),size}));
});
