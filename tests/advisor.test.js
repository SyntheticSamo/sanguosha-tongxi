import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,joinRoom,reduce,project,validateState,migrateState} from '../dist/backend/engine.js';
import {inspectUse,responseOptions,discardAdvice,cardAdvice,distanceExplanation} from '../dist/backend/advisor.js';
import {deckFor} from '../dist/data/cards.js';
const act=(s,id,type,data={})=>reduce(s,id,{type,rev:s.rev,...data});
function game(n=4){let s=newRoom({hostId:'host',token:'h'.repeat(32),size:n});for(let i=1;i<n;i++)s=joinRoom(s,{name:'玩家'+i,token:String(i).repeat(32)}).state;s=act(s,'host','start');s.players.forEach((p,i)=>p.general=['caocao','guanyu','zhaoyun','zhangfei'][i]);s.turn='host';s.phase=3;return s;}
function give(s,p,kind,n=0,zone='hand'){const id=deckFor(s.deckSet,s.ex).filter(c=>c.kind===kind)[n].id;for(const z of [s.deck,s.discard,s.pool,...s.players.flatMap(p=>[p.hand,p.equip,p.judge])]){const i=z.indexOf(id);if(i>=0)z.splice(i,1);}p[zone].push(id);return id;}

test('projected target advice agrees with authoritative validation without hidden hands',()=>{
  const s=game(),sha=give(s,s.players[0],'sha'),v=project(s,'host'),before=structuredClone(s);
  assert.equal(v.players[1].hand,null);
  for(const p of s.players){const a=inspectUse(v,[sha],null,[p.id]);let allowed=true;try{act(s,'host','use',{cards:[sha],target:p.id});}catch{allowed=false;}assert.equal(a.ok,allowed);}
  assert.deepEqual(s,before);assert(inspectUse(v,[sha]).targets.some(p=>p.ok));
});
test('self cards discard stale enemy targets, global cards have no target selection',()=>{
  const s=game(),p=s.players[0],tao=give(s,p,'tao'),nanman=give(s,p,'nanman');p.hp--;
  const v=project(s,'host'),heal=inspectUse(v,[tao],null,[s.players[1].id]);assert(heal.ok);assert.deepEqual(heal.action.targets,['host']);assert.equal(inspectUse(v,[nanman]).mode,'all');
});
test('borrowed sword previews second target from weapon holder, not actor',()=>{
  const s=game(),a=s.players[0],b=s.players[1],card=give(s,a,'jiedao');give(s,b,'liannu',0,'equip');
  const v=project(s,'host'),first=inspectUse(v,[card]);assert(first.targets.find(p=>p.id===b.id).ok);
  const next=inspectUse(v,[card],null,[b.id]);assert(next.targets.find(p=>p.id===s.players[2].id).ok);assert(!next.targets.find(p=>p.id===s.players[3].id).ok);
  assert.match(distanceExplanation(v,b.id,s.players[2].id),/最终距离 1/);
});
test('single-target cards reject duplicate and extra targets atomically',()=>{
  const s=game(),sha=give(s,s.players[0],'sha'),ids=s.players.slice(1,3).map(p=>p.id),before=structuredClone(s);
  assert.throws(()=>act(s,'host','use',{cards:[sha],targets:ids}),/只需一个/);
  assert.throws(()=>act(s,'host','use',{cards:[sha],targets:[ids[0],ids[0]]}),/重复/);assert.deepEqual(s,before);
});
test('response hints include longdan and retain concealed pindian',()=>{
  let s=game(),sha=give(s,s.players[0],'sha'),p=s.players[1];p.general='zhaoyun';const reply=give(s,p,'sha',1);
  s=act(s,'host','use',{cards:[sha],target:p.id});const v=project(s,p.id),opts=responseOptions(v,[reply]);assert(opts.some(o=>o.ok&&o.as==='shan'));assert(cardAdvice(v,reply).ok);
  s=act(s,p.id,'respond',{cards:[reply],as:'shan'});assert.equal(s.rules.pending,null);validateState(s);
});
test('zhangba pays two hand cards for one response, and never consumes weapon',()=>{
  let s=game(),a=s.players[0],p=s.players[1],duel=give(s,a,'juedou');give(s,p,'zhangba',0,'equip');const ids=[give(s,p,'shan'),give(s,p,'shan',1)];
  s=act(s,'host','use',{cards:[duel],target:p.id});while(s.rules.pending.kind==='counter')s=act(s,s.rules.pending.players.find(id=>!s.rules.pending.passed.includes(id)),'pass');
  assert(responseOptions(project(s,p.id),ids).some(o=>o.ok&&o.as==='sha'));s=act(s,p.id,'respond',{cards:ids,as:'sha'});assert(ids.every(id=>s.discard.includes(id)));assert.equal(s.players[1].equip.length,1);validateState(s);
});
test('discard advisor handles exact count and keji exception',()=>{
  const s=game(),p=s.players[0];p.hp=1;const v=project(s,'host'),need=p.hand.length-1;assert.equal(discardAdvice(v).needed,need);assert(discardAdvice(v,p.hand.slice(0,need)).ok);assert(!discardAdvice(v,p.hand).ok);
  p.general='lvmeng';assert.equal(discardAdvice(project(s,'host')).needed,0);s.rules.slashPlayed=1;assert.equal(discardAdvice(project(s,'host')).needed,need);
});
test('draw and correction events are bounded, distinguishable, and explicitly projected',()=>{
  let s=game();s=act(s,'host','draw',{n:2});const draw=s.events.at(-1);assert.equal(draw.type,'draw');assert.equal(draw.count,2);assert.equal(draw.player,'host');
  draw.secret={token:'do-not-project',cards:s.deck};const v=project(s,s.players[1].id);assert.equal(v.events.at(-1).secret,undefined);assert.equal(v.events.at(-1).cards,undefined);
  s=act(s,'host','correct',{op:'hp',target:'host',value:2,reason:'验证纠正'});assert.equal(s.events.at(-1).type,'correction');assert.equal(s.events.at(-1).amount,2-s.players[0].maxHp);
});
test('elemental chain emits individual damage events with unique identities',()=>{
  let s=game(),a=s.players[0],b=s.players[1],c=s.players[2],fire=give(s,a,'fire_sha');b.chained=c.chained=true;
  s=act(s,'host','use',{cards:[fire],target:b.id});s=act(s,b.id,'pass');const events=s.events.filter(e=>e.rev===s.rev&&e.type==='damage');assert.equal(events.length,2);assert.equal(new Set(events.map(e=>e.id)).size,2);assert.deepEqual(new Set(events.map(e=>e.player)),new Set([b.id,c.id]));
});
test('existing v2 saves without events or phase hint fields remain loadable',()=>{
  const s=game();delete s.events;delete s.eventSeq;const migrated=migrateState(s),v=project(migrated,'host');assert.deepEqual(v.events,[]);assert.equal(v.phaseState.skipDraw,false);assert(inspectUse(v,[give(migrated,migrated.players[0],'sha')]).targets.length>0);
});
test('malformed optional feedback fields cannot carry nested private state',()=>{
  const s=game();s.events[0].count={hidden:s.deck};assert.throws(()=>migrateState(s),/张数/);
  delete s.events[0].count;s.events[0].id='not-an-event';assert.throws(()=>migrateState(s),/编号/);
});
test('jijiu transformation is rejected on own turn, usable for an off-turn rescue',()=>{
  let s=game(),a=s.players[0],b=s.players[1];a.general='huatuo';a.hp=3;const red=give(s,a,'wuzhong');
  assert(!inspectUse(project(s,'host'),[red],'tao').ok);assert.throws(()=>act(s,'host','use',{cards:[red],as:'tao',target:'host'}),/回合外/);
  s.turn=b.id;b.hp=0;s.rules.pending={kind:'save',target:b.id,player:'host',source:b.id,saviors:['host',b.id],index:0};
  assert(responseOptions(project(s,'host'),[red]).some(x=>x.ok&&x.as==='tao'));s=act(s,'host','respond',{cards:[red],as:'tao'});assert.equal(s.players[1].hp,1);validateState(s);
});
