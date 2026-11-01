import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,reduce,project,validateState,migrateState} from '../dist/backend/engine.js';
import {freshRules,pump,canCounter} from '../dist/backend/rules.js';
import {stateOf,processSkillTask} from '../dist/backend/skills.js';
import {completePhase,processComplete,observeCompleteMoves} from '../dist/backend/complete-skills.js';
import {boardMoveAdvice} from '../dist/backend/board-moves.js';
import {canAutoAdvance} from '../dist/backend/flow.js';
import {deckFor,CARD_BY_ID} from '../dist/data/cards.js';
import {GENERALS,GENERAL_MAP} from '../dist/data/generals.js';
const act=(s,type,x={},id='host')=>reduce(s,id,{type,rev:s.rev,...x});
function game(g='zhanghe'){
 let s=newRoom({hostId:'host',token:'h'.repeat(32),size:2,practice:true,selectionMode:'choose',skillAutomation:true,completeSkills:true,tableExperience:true,equipmentAutomation:true,interactionMode:'tactile',deckSet:'wood'});
 s=act(s,'localSeat');s=act(s,'general',{general:g});s=act(s,'general',{general:GENERAL_MAP[g].baseName===GENERAL_MAP.sunquan.baseName?'guanyu':'sunquan'},s.players[1].id);s=act(s,'start');s=act(s,'finishOpening',{windowId:s.flow.opening.id});
 s.turn='host';s.phase=0;s.flow={paused:false};s.rules=freshRules();for(const p of s.players){stateOf(p);p.skillState.lost=p.id==='host'?[]:['*'];}
 delete s.skillMoveBaseline;observeCompleteMoves(s);s.rules.queue=[];return s;
}
function card(s,i,kind,zone='hand'){
 const id=deckFor(s.deckSet,s.ex).find(c=>c.kind===kind&&!s.players[i][zone].includes(c.id)).id;
 for(const z of [s.deck,s.discard,s.pool,...s.players.flatMap(p=>[p.hand,p.equip,p.judge])]){const n=z.indexOf(id);if(n>=0)z.splice(n,1);}s.players[i][zone].push(id);return id;
}
function enter(s,phase){s.phase=phase;s.rules=freshRules();s.flow={paused:false};delete s.skillMoveBaseline;observeCompleteMoves(s);s.rules.queue=[];completePhase(s,s.players[0],phase);s.rules.queue.push({type:'completePhaseBody',owner:'host'});pump(s);validateState(s);return s;}
const activate=(s,skill)=>act(s,'activateSkill',{skill,windowId:s.flow.skillWindow.id});
const choose=(s,choice,cards=[],targets=[])=>act(s,'skillResolve',{choice,cards,targets});

test('two occupied weapon slots cannot move; Qiaobian finishes without another forced popup',()=>{
 let s=game();card(s,0,'qinggang','equip');const id=card(s,1,'liannu','equip');assert.match(boardMoveAdvice(s,id,s.players[0]).reason,/武器槽/);
 enter(s,3);assert.equal(s.rules.pending,null);s=activate(s,'巧变');const cost=s.players[0].hand[0];s=choose(s,'yes',[cost]);
 assert(s.discard.includes(cost));assert.equal(s.phase,4);assert.equal(s.rules.pending,null);assert(s.flow.skillWindow.offers.some(o=>o.skill==='巧变'));validateState(s);
});
test('different equipment slots receive a card; optional movement can be declined without refund',()=>{
 let s=game();card(s,0,'qinggang','equip');const id=card(s,1,'bagua','equip');enter(s,3);s=activate(s,'巧变');const cost=s.players[0].hand[0];s=choose(s,'yes',[cost]);
 assert.equal(s.rules.pending.skill,'移牌');assert.equal(s.rules.pending.optional,true);const before=structuredClone(s);assert.throws(()=>choose(s,'yes',[id],[s.players[1].id]),/新归属/);assert.deepEqual(s,before);
 s=choose(s,'decline');assert(s.discard.includes(cost));assert.equal(s.phase,4);assert(s.players[1].equip.includes(id));
});
test('legal board move keeps real identity and changes its actual owner',()=>{
 let s=game();const id=card(s,1,'bagua','equip');enter(s,3);s=activate(s,'巧变');s=choose(s,'yes',[s.players[0].hand[0]]);s=choose(s,'yes',[id],['host']);assert(s.players[0].equip.includes(id));assert(!s.players[1].equip.includes(id));validateState(s);
});
test('phase opportunities are private, stable over chat and restoration, and reject stale windows',()=>{
 let s=enter(game(),2),id=s.flow.skillWindow.id;assert(project(s,'host').flow.skillWindow);assert.equal(project(s,s.players[1].id).flow.skillWindow,null);
 s=act(s,'chat',{message:'test'});assert.equal(s.flow.skillWindow.id,id);s=migrateState(s);assert.equal(s.flow.skillWindow.id,id);
 const before=structuredClone(s);assert.throws(()=>act(s,'activateSkill',{skill:'巧变',windowId:'stale'}),/机会已变化/);assert.deepEqual(s,before);assert.equal(canAutoAdvance(s),false);
});
test('cancelling before payment restores the opportunity; normal draw closes it once',()=>{
 let s=enter(game(),2),n=s.players[0].hand.length;s=activate(s,'巧变');s=choose(s,'decline');assert.equal(s.players[0].hand.length,n);assert.equal(s.rules.pending,null);
 const id=s.flow.skillWindow.id;s=act(s,'drawPhaseCard',{windowId:id});assert.equal(s.players[0].hand.length,n+1);assert.equal(s.flow.draw.remaining,1);assert.equal(s.flow.skillWindow,undefined);
 const before=structuredClone(s);assert.throws(()=>act(s,'activateSkill',{skill:'巧变',windowId:id}),/机会已变化/);assert.deepEqual(s,before);
});
test('invalid normal play rolls back declining the skill and all phase hooks',()=>{
 let s=enter(game(),3),id=card(s,0,'shan'),before=structuredClone(s);assert.throws(()=>act(s,'use',{cards:[id],targets:[s.players[1].id]}));assert.deepEqual(s,before);
});
test('empty judgment does not hold auto progression, but Shensu still has an independent choice',()=>{
 let s=enter(game(),1);assert.equal(canAutoAdvance(s),true);s=act(s,'continuePhase',{windowId:s.flow.skillWindow.id});assert.equal(s.phase,2);
 s=enter(game('xiahouyuan'),1);assert.equal(s.rules.pending,null);assert(s.flow.skillWindow.offers.some(o=>o.skill==='神速'));assert.equal(canAutoAdvance(s),false);
});
test('all draw replacement choices remain opt-in and first ordinary draw seals them',()=>{
 for(const g of ['zhangliao','jie_zhangliao','xuchu','jie_xuchu','yanliangwenchou','lusu','zhouyu']){
  let s=enter(game(g),2);assert.equal(s.rules.pending,null,g);const w=s.flow.skillWindow;assert(w?.offers.length,g);const n=s.players[0].hand.length;s=act(s,'drawPhaseCard',{windowId:w.id});assert.equal(s.players[0].hand.length,n+1,g);assert.equal(s.flow.skillWindow,undefined,g);validateState(s);
 }
});
test('practice gain takes real deck then discard cards, never another hand or normal draw quota',()=>{
 let s=enter(game('sunquan'),2),d=s.flow.draw.remaining,id=card(s,1,'muniu');const before=structuredClone(s);assert.throws(()=>act(s,'practiceGain',{kind:'muniu'}),/无可取/);assert.deepEqual(s,before);
 s.players[1].hand.splice(s.players[1].hand.indexOf(id),1);s.discard.push(id);s=act(s,'practiceGain',{kind:'muniu'});assert(s.players[0].hand.includes(id));assert(!s.discard.includes(id));assert.equal(s.flow.draw.remaining,d);validateState(s);
});
test('practice gain rejects ordinary tables, unknown kinds, pending choices and private peeks atomically',()=>{
 for(const change of [s=>s.practice=false,s=>{s.rules.pending={kind:'judgeAwait',player:'host',windowId:'x',internal:{type:'judge',target:'host'}};},s=>{s.peek.host=[s.deck.shift()];}]){
  let s=game('sunquan');change(s);const before=structuredClone(s);assert.throws(()=>act(s,'practiceGain',{kind:'sha'}));assert.deepEqual(s,before);
 }
 let s=game('sunquan'),before=structuredClone(s);assert.throws(()=>act(s,'practiceGain',{kind:'not-a-card'}));assert.deepEqual(s,before);
});
test('restored legacy movement refreshes destinations and can finish with no legal target',()=>{
 let s=game();card(s,0,'qinggang','equip');card(s,1,'liannu','equip');s.schema=6;s.rules.pending={kind:'skill',player:'host',skill:'移牌',stage:'complete:offer',windowId:'old',optional:false,internal:{allowedCards:[]},cardChoices:[],targetIds:[],choices:[{id:'yes',label:'移动'}],minCards:1,maxCards:1,minTargets:1,maxTargets:1};s=migrateState(s);assert.equal(s.schema,8);assert.equal(s.rules.pending,null);validateState(s);
});

test('all 101 editions expose resumable opt-in phase choices, including empty-hand variants',()=>{
 for(const g of GENERALS)for(const empty of [false,true]){
  const base=game(g.id);if(empty){base.deck.push(...base.players[0].hand);base.players[0].hand=[];}
  for(let phase=0;phase<6;phase++){
   let s=enter(structuredClone(base),phase);assert(!(s.rules.pending?.optional&&s.rules.pending.player==='host'),`${g.id}/${phase}/${empty} still asks a phase question`);
   for(const offer of s.flow.skillWindow?.offers||[]){let chosen=activate(structuredClone(s),offer.skill);assert(chosen.rules.pending,`${g.id}/${offer.skill}`);chosen=choose(chosen,'decline');assert(chosen.flow.skillWindow?.offers.some(o=>o.skill===offer.skill));validateState(chosen);}
  }
 }
});

test('a normal play commits phase-start opportunities once and preserves subsequent play',()=>{
 let s=enter(game(),3),id=card(s,0,'sha');s=act(s,'use',{cards:[id],targets:[s.players[1].id]});assert.equal(s.flow.skillWindow,undefined);assert.equal(s.rules.pending.kind,'slash');s=act(s,'pass',{},s.players[1].id);assert.equal(s.phase,3);assert.equal(s.rules.pending,null);validateState(s);
});

test('manual judgment begins before any draw and a skipped judgment never flips a card',()=>{
 let s=game(),id=card(s,0,'le','judge');enter(s,1);let n=s.deck.length;s=act(s,'revealJudge',{windowId:s.flow.skillWindow.id});
 while(s.rules.pending?.kind==='counter'){assert.equal(s.deck.length,n);const p=s.players.find(p=>!s.rules.pending.passed.includes(p.id)&&canCounter(s,p));s=act(s,'pass',{},p.id);}
 if(s.rules.pending?.kind==='judgeAwait'){assert.equal(s.deck.length,n);s=act(s,'revealJudge',{windowId:s.rules.pending.windowId});}
 assert.equal(s.deck.length,n-1);assert.equal(s.rules.pending.kind,'judge');
 s=game();id=card(s,0,'le','judge');enter(s,1);n=s.deck.length;s=activate(s,'巧变');s=choose(s,'yes',[s.players[0].hand[0]]);assert.equal(s.deck.length,n);assert(s.players[0].judge.includes(id));assert.equal(s.phase,2);
});

test('a phase already skipped by delayed effects does not offer a second skip or run phase-start choices',()=>{
 for(const [phase,flag]of [[2,'skipDraw'],[3,'skipPlay']]){
  const s=game();s.phase=phase;s.rules=freshRules();s.rules[flag]=true;s.flow={paused:true};completePhase(s,s.players[0],phase);s.rules.queue.push({type:'completePhaseBody',owner:'host'});pump(s);assert(s.phase>phase);assert(!s.rules.pending);assert(s.players[0].skillState.turn.skipPhases.includes(phase));validateState(s);
 }
});

test('lost skills invalidate parked opportunities; an already paid mandatory step still cannot be cancelled',()=>{
 let s=enter(game(),2),windowId=s.flow.skillWindow.id;s.players[0].skillState.lost=['*'];s=act(s,'chat',{message:'refresh'});assert.equal(s.flow.skillWindow,undefined);const before=structuredClone(s);assert.throws(()=>act(s,'activateSkill',{skill:'巧变',windowId}));assert.deepEqual(s,before);
 s=game('luzhi');processComplete(s,{owner:'host',skill:'明任',step:'initial'});const snapshot=structuredClone(s);assert.throws(()=>choose(s,'decline'),/必须/);assert.deepEqual(s,snapshot);
});

test('unavailable Shensu costs and empty Tuxi targets never create a phase offer',()=>{
 let s=game('xiahouyuan');s.deck.push(...s.players[0].hand,...s.players[0].equip);s.players[0].hand=[];s.players[0].equip=[];enter(s,3);assert(!s.flow.skillWindow);
 s=game('zhangliao');s.deck.push(...s.players[1].hand);s.players[1].hand=[];enter(s,2);assert(!s.flow.skillWindow);assert.equal(s.rules.pending,null);assert.equal(s.flow.draw.remaining,2);
});

test('closing a leave-phase opportunity advances once, including the host phase tool',()=>{
 for(const type of ['continuePhase','phase']){let s=enter(game('jie_zhangfei'),3);s=act(s,'phase');assert(s.flow.skillWindow.offers.some(o=>o.skill==='替身'));s=act(s,type,{windowId:s.flow.skillWindow.id});assert.equal(s.phase,4);assert.equal(s.rules.pending,null);validateState(s);}
});

test('a phase correction invalidates the old window and cannot run its parked draw or body',()=>{
 let s=enter(game(),2),id=s.flow.skillWindow.id,n=s.players[0].hand.length;s=act(s,'correct',{op:'phase',target:s.players[1].id,value:3,reason:'synthetic test'});assert.equal(s.players[0].hand.length,n);assert.equal(s.flow.skillWindow,undefined);assert.equal(s.rules.queue.length,0);const before=structuredClone(s);assert.throws(()=>act(s,'continuePhase',{windowId:id}));assert.deepEqual(s,before);
});

test('old unpaid Qiaobian with no remaining cost does not leave an empty parked queue',()=>{
 let s=game();s.tableExperience=false;s.phase=2;s.rules=freshRules();completePhase(s,s.players[0],2);s.rules.queue.push({type:'completePhaseBody',owner:'host'});pump(s);assert.equal(s.rules.pending.skill,'巧变');s.schema=6;s.tableExperience=true;s.deck.push(...s.players[0].hand);s.players[0].hand=[];delete s.skillMoveBaseline;s=migrateState(s);assert.equal(s.rules.pending,null);assert.equal(s.rules.queue.length,0);assert.equal(s.flow.draw.remaining,2);validateState(s);
});

test('Jushou cannot demand an unusable equipment card or reveal private candidates to another seat',()=>{
 let s=game('caoren'),p=s.players[0];s.deck.push(...p.hand);p.hand=[];p.skillState.abolished=['weapon'];const equip=card(s,0,'qinggang');
 const task={owner:'host',skill:'据守',stage:'decision',info:{stage:'jushouDiscard',optional:false,minCards:1,maxCards:1,zone:'hand',choices:[{id:'discard',label:'弃置或使用'}]}};
 processSkillTask(s,task);assert.equal(s.rules.pending,null);const id=card(s,0,'sha');processSkillTask(s,task);assert.deepEqual(s.rules.pending.cardChoices,[id]);assert.deepEqual(project(s,s.players[1].id).pending.cardChoices,[]);
 const before=structuredClone(s);assert.throws(()=>choose(s,'discard',[equip]),/废除/);assert.deepEqual(s,before);s=choose(s,'discard',[id]);assert(s.discard.includes(id));validateState(s);
});
