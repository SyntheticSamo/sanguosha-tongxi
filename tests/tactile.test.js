import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,reduce,project,validateState,migrateState} from '../dist/backend/engine.js';
import {freshRules,validateUse,pump} from '../dist/backend/rules.js';
import {canAutoAdvance} from '../dist/backend/flow.js';
import {settleWood} from '../dist/backend/wood.js';
import {slashTargetLimit} from '../dist/backend/equipment.js';
import {stateOf} from '../dist/backend/skills.js';
import {observeCompleteMoves} from '../dist/backend/complete-skills.js';
import {inspectSkill,inspectUse} from '../dist/backend/advisor.js';
import {CARD_BY_ID,deckFor} from '../dist/data/cards.js';
import {aimPath} from '../dist/ui/aim.js';
const act=(s,id,type,data={})=>reduce(s,id,{type,rev:s.rev,...data});
const choice=(s,value='yes',cards=[],targets=[],extra={})=>act(s,s.rules.pending.player,'skillResolve',{choice:value,cards,targets,...extra});
function lobby(opts={}){let s=newRoom({hostId:'host',token:'h'.repeat(32),size:4,practice:true,selectionMode:'choose',deckSet:'wood',equipmentAutomation:true,...opts});while(s.players.length<4)s=act(s,'host','localSeat');for(const [i,g]of ['sunquan','huangyueying','guanyu','zhaoyun'].entries())s=act(s,s.players[i].id,'general',{general:g});return s;}
function game(opts={}){let s=act(lobby(opts),'host','start');s.turn='host';s.phase=3;s.rules=freshRules();for(const p of s.players){stateOf(p);p.hp=p.maxHp=4;}return s;}
function card(s,p,kind,zone='hand',ordinal=0){const id=deckFor(s.deckSet,s.ex).filter(c=>c.kind===kind)[ordinal].id;for(const z of [s.deck,s.pool,s.discard,...s.players.flatMap(t=>[t.hand,t.equip,t.judge,t.wood?.cards||[]])]){const i=z.indexOf(id);if(i>=0)z.splice(i,1);}p[zone].push(id);return id;}
function slash(s,weapon){const a=s.players[0],b=s.players[1];card(s,a,weapon,'equip');const sha=card(s,a,'sha'),shan=card(s,b,'shan');return {s,a:a.id,b:b.id,sha,shan};}
test('aim terminal tangent points at the destination in all eight directions',()=>{
 for(const [x,y]of [[0,-100],[100,0],[0,100],[-100,0],[100,100],[-100,-100],[100,-100],[-100,100]]){const numbers=aimPath(0,0,x,y).match(/-?\d+(?:\.\d+)?/g).map(Number),dx=x-numbers[4],dy=y-numbers[5];assert(dx*x+dy*y>0);assert(Math.abs(dx*y-dy*x)<.0001);}assert.equal(aimPath(0,0,0,5),'');
});
test('opening is round-robin, secret, conserved, gated and finishes once',()=>{
 let s=lobby({interactionMode:'tactile',skillAutomation:true});s=act(s,'host','start');assert(s.flow.opening);const events=s.cardEvents.filter(e=>e.cause==='setup'),start=s.players.findIndex(p=>p.id===s.turn);assert.equal(events.length,16);assert.deepEqual(events.map(e=>e.to.owner),Array.from({length:16},(_,i)=>s.players[(start+i)%4].id));
 for(const p of s.players){const v=project(s,p.id);assert.equal(v.cardEvents.filter(e=>e.cause==='setup'&&e.to.owner!==p.id).flatMap(e=>e.cards).length,0);}assert.throws(()=>act(s,s.turn,'phase'),/发牌/);const opening=s.flow.opening.id;assert.throws(()=>act(s,s.players[1].id,'finishOpening',{windowId:opening}),/权限/);s=act(s,'host','finishOpening',{windowId:opening});assert(!s.flow.opening);assert.throws(()=>act(s,'host','finishOpening',{windowId:opening}));validateState(s);
});
test('draw is one per authorized click, quota cannot be bypassed, and old rooms stay classic',()=>{
 let s=game({skillAutomation:true});s.interactionMode='tactile';s.phase=1;s=act(s,'host','phase');assert.equal(s.flow.draw.remaining,2);const id=s.flow.draw.id,n=s.players[0].hand.length,before=structuredClone(s);assert.throws(()=>act(s,s.players[1].id,'drawPhaseCard',{windowId:id}));assert.deepEqual(s,before);assert.throws(()=>act(s,'host','phase'),/摸牌/);assert.throws(()=>act(s,'host','drawPhaseCard',{windowId:'stale'}));
 s=act(s,'host','drawPhaseCard',{windowId:id,n:20});assert.equal(s.players[0].hand.length,n+1);assert.equal(s.flow.draw.remaining,1);s=act(s,'host','drawPhaseCard',{windowId:id});assert.equal(s.players[0].hand.length,n+2);assert(canAutoAdvance(s));assert.throws(()=>act(s,'host','drawPhaseCard',{windowId:id}));s=act(s,'host','phase');assert.equal(s.phase,3);assert(!canAutoAdvance(s));
 const old=structuredClone(s);old.schema=4;const migrated=migrateState(old);assert.equal(migrated.schema,6);assert.equal(migrated.interactionMode,'classic');assert.equal(migrated.equipmentAutomation,false);
});
test('draw quota honors yingzi, cunmu bottom draw and haoshi after the final click only',()=>{
 for(const general of ['jie_zhouyu','xuyou','lusu']){let s=game({skillAutomation:true});s.players[0].general=general;s.interactionMode='tactile';s.phase=1;s=act(s,'host','phase');if(general==='lusu'){assert.equal(s.rules.pending.skill,'好施');s=choice(s);}const id=s.flow.draw.id,total=s.flow.draw.remaining,bottom=s.deck.at(-1);assert.equal(total,general==='jie_zhouyu'?3:general==='lusu'?4:2);for(let i=0;i<total;i++){s=act(s,'host','drawPhaseCard',{windowId:id});if(!i&&general==='xuyou')assert(s.players[0].hand.includes(bottom));if(i<total-1)assert.equal(s.rules.pending,null);}if(general==='lusu')assert.equal(s.rules.pending.stage,'haoshiGive');validateState(s);}
});
test('phase readiness stops for decisions, private zones, discard, pause and never ends play',()=>{
 const s=game({skillAutomation:true});s.interactionMode='tactile';s.phase=0;assert(canAutoAdvance(s));s.flow.paused=true;assert(!canAutoAdvance(s));s.flow.paused=false;s.rules.pending={kind:'judge'};assert(!canAutoAdvance(s));s.rules.pending=null;s.phase=3;assert(!canAutoAdvance(s));s.phase=4;s.players[0].hand.push(...s.deck.splice(0,5));assert(!canAutoAdvance(s));s.phase=5;assert(canAutoAdvance(s));s.peek.host=[s.deck.pop()];assert(!canAutoAdvance(s));
});
test('cixiong offers the target a real discard or draws for the attacker',()=>{
 let {s,a,b,sha}=slash(game(),'cixiong');const n=s.players[0].hand.length;s=act(s,a,'use',{cards:[sha],target:b});assert.equal(s.rules.pending.skill,'雌雄双股剑');s=choice(s);assert.equal(s.rules.pending.player,b);s=choice(s,'draw');assert.equal(s.players[0].hand.length,n);assert.equal(s.rules.pending.kind,'slash');s=act(s,b,'pass');validateState(s);
});
test('axe forces the original slash after dodge, rejects paying itself atomically',()=>{
 let {s,a,b,sha,shan}=slash(game(),'guanshi');const axe=s.players[0].equip[0],other=s.players[0].hand.find(id=>id!==sha);s=act(s,a,'use',{cards:[sha],target:b});s=act(s,b,'respond',{cards:[shan]});assert.equal(s.rules.pending.skill,'贯石斧');const before=structuredClone(s);assert.throws(()=>choice(s,'yes',[axe,other]),/自身/);assert.deepEqual(s,before);s=choice(s,'yes',s.players[0].hand.slice(0,2));assert.equal(s.players[1].hp,3);assert.equal(s.rules.pending,null);validateState(s);
});
test('green dragon follows up only on the same target and resumes a multi-target slash',()=>{
 let {s,a,b,sha,shan}=slash(game({skillAutomation:true}),'qinglong');s.players[0].skillState.turn.tianyi=true;const extra=card(s,s.players[0],'sha','hand',1),c=s.players[2].id;s=act(s,a,'use',{cards:[sha],targets:[b,c]});s=act(s,b,'respond',{cards:[shan]});assert.equal(s.rules.pending.skill,'青龙偃月刀');s=choice(s,'yes',[extra]);assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.player,b);s=act(s,b,'pass');assert.equal(s.rules.pending.player,c);s=act(s,c,'pass');assert.equal(s.players[1].hp,3);assert.equal(s.players[2].hp,3);validateState(s);
});
test('fangtian stacks with tianyi and stored cards do not count as real last hand',()=>{
 let s=game({skillAutomation:true});const a=s.players[0];card(s,a,'fangtian','equip');const sha=card(s,a,'sha');s.discard.push(...a.hand.filter(id=>id!==sha));a.hand=[sha];a.skillState.turn.tianyi=true;assert.equal(slashTargetLimit(s,a,[sha]),4);const advice=inspectUse(project(s,a.id),[sha],null,s.players.slice(1).map(p=>p.id));assert(advice.ok);validateUse(s,a,{cards:[sha],targets:s.players.slice(1).map(p=>p.id)});card(s,a,'tao');assert.equal(slashTargetLimit(s,a,[sha]),2);
});
test('ice sword prevents damage and discards exactly two sequential cards',()=>{
 let {s,a,b,sha}=slash(game(),'hanbing');const n=s.players[1].hand.length;s=act(s,a,'use',{cards:[sha],target:b});s=act(s,b,'pass');assert.equal(s.rules.pending.skill,'寒冰剑');s=choice(s);assert.equal(s.rules.pending.stage,'equipment:hanbingPick');s=choice(s,'hand');assert.equal(s.players[1].hand.length,n-1);assert.equal(s.rules.pending.stage,'equipment:hanbingPick');s=choice(s,'hand');assert.equal(s.players[1].hand.length,n-2);assert.equal(s.players[1].hp,4);validateState(s);
});
test('qilin removes one chosen horse then causes the actual damage once',()=>{
 let {s,a,b,sha}=slash(game(),'qilin');const horse=card(s,s.players[1],'dilu','equip');s=act(s,a,'use',{cards:[sha],target:b});s=act(s,b,'pass');assert.equal(s.rules.pending.skill,'麒麟弓');s=choice(s,'yes',[horse]);assert(s.discard.includes(horse));assert.equal(s.players[1].hp,3);validateState(s);
});
test('wood stores privately, transfers ownership, supports response and cannot pay ordinary costs',()=>{
 let s=game();const a=s.players[0],b=s.players[1],treasure=card(s,a,'muniu','equip'),shan=card(s,a,'shan');s=act(s,a.id,'storeWood',{cards:[shan]});assert.equal(s.players[0].wood.cards[0],shan);assert.equal(project(s,b.id).players[0].wood.cards,undefined);s=choice(s,'yes',[],[b.id]);assert.equal(s.players[0].wood,undefined);assert.deepEqual(s.players[1].wood.cards,[shan]);assert.equal(project(s,a.id).players[1].wood.cards,undefined);assert.throws(()=>act(s,b.id,'discard',{cards:[shan]}));
 s.turn=a.id;const sha=card(s,s.players[0],'sha');s=act(s,a.id,'use',{cards:[sha],target:b.id});s=act(s,b.id,'respond',{cards:[shan]});assert.equal(s.players[1].hp,4);assert(s.discard.includes(shan));assert(s.players[1].equip.includes(treasure));validateState(s);
});
test('wood clears on loss or abolished slot, but equipment-to-equipment movement retains it',()=>{
 for(const destination of ['hand','discard','abolished','transfer']){let s=game();const a=s.players[0],b=s.players[1],treasure=card(s,a,'muniu','equip'),id=card(s,a,'tao');s=act(s,a.id,'storeWood',{cards:[id]});s=choice(s,'decline');const owner=s.players[0];if(destination==='abolished')owner.skillState.abolished.push('treasure');else{owner.equip.splice(owner.equip.indexOf(treasure),1);if(destination==='transfer')s.players[1].equip.push(treasure);else if(destination==='hand')owner.hand.push(treasure);else s.discard.push(treasure);}settleWood(s);if(destination==='transfer')assert.deepEqual(s.players[1].wood.cards,[id]);else assert(s.discard.includes(id));validateState(s);}
});
test('mixed wood/hand conversions use real materials and never trigger last-hand on storage',()=>{
 let s=game(),a=s.players[0],treasure=card(s,a,'muniu','equip'),id=card(s,a,'tao');s=act(s,a.id,'storeWood',{cards:[id]});s=choice(s,'decline');a=s.players[0];card(s,a,'zhangba','equip');const hand=card(s,a,'shan');s=act(s,a.id,'use',{cards:[id,hand],as:'sha',target:s.players[1].id});assert.equal(s.rules.pending.kind,'slash');assert(!s.players[0].wood.cards.length);s=act(s,s.players[1].id,'pass');assert(s.discard.includes(id)&&s.discard.includes(hand));assert(s.players[0].equip.includes(treasure));validateState(s);
});
test('public center records archive on turn change, counter chains link to preceding plays',()=>{
 let s=game(),a=s.players[0],b=s.players[1],trick=card(s,a,'wuzhong'),w1=card(s,b,'wuxie'),w2=card(s,a,'wuxie','hand',1);s=act(s,a.id,'use',{cards:[trick]});const base=s.centerPlays.at(-1).id;s=act(s,b.id,'respond',{cards:[w1]});assert.equal(s.centerPlays.at(-1).parentId,base);const first=s.centerPlays.at(-1).id;s=act(s,a.id,'respond',{cards:[w2]});assert.equal(s.centerPlays.at(-1).parentId,first);assert.equal(s.centerPlays.at(-1).chainId,s.centerPlays.at(-2).chainId);while(s.rules.pending?.kind==='counter')s=act(s,s.rules.pending.players.find(id=>!s.rules.pending.passed.includes(id)),'pass');assert.equal(s.centerPlays.length,3);s.phase=5;s=act(s,a.id,'phase');assert.equal(s.centerPlays.length,0);assert.equal(s.playHistory.length,3);assert(s.cardEvents.some(e=>e.type==='archive'));validateState(s);
});
test('active skill advisor shares target and material validation with authority',()=>{
 const s=game({skillAutomation:true});s.players[0].general='dianwei';const projected=project(s,'host'),advice=inspectSkill(projected,'强袭',[],[],''),far=s.players[2];assert.equal(advice.targets.find(t=>t.id===far.id).ok,false);assert.throws(()=>act(s,'host','activateSkill',{skill:'强袭',cards:[],targets:[far.id]}),/攻击范围/);assert.equal(inspectSkill(projected,'强袭',[],[]).targets.find(t=>t.id===s.players[1].id).ok,true);
});
test('axe resolves last-hand lianying before damage and before finishing the original slash',()=>{
 let {s,a,b,sha,shan}=slash(game({skillAutomation:true}),'guanshi');s.completeSkills=true;s.players[0].general='luxun';const p=s.players[0],costs=p.hand.filter(id=>id!==sha).slice(0,2);s.discard.push(...p.hand.filter(id=>id!==sha&&!costs.includes(id)));p.hand=[sha,...costs];observeCompleteMoves(s);s.rules.queue=[];
 s=act(s,a,'use',{cards:[sha],target:b});s=act(s,b,'respond',{cards:[shan]});s=choice(s,'yes',costs);assert.equal(s.rules.pending.skill,'连营');assert.equal(s.players[1].hp,4);assert(s.pool.includes(sha));s=choice(s);assert.equal(s.players[1].hp,3);assert(s.discard.includes(sha));validateState(s);
});
test('ice sword completes the first loss trigger before selecting its second discard',()=>{
 let {s,a,b,sha}=slash(game({skillAutomation:true}),'hanbing');s.completeSkills=true;s.players[1].general='luxun';const target=s.players[1],one=target.hand[0];s.discard.push(...target.hand.slice(1));target.hand=[one];observeCompleteMoves(s);s.rules.queue=[];
 s=act(s,a,'use',{cards:[sha],target:b});s=act(s,b,'pass');s=choice(s);s=choice(s,'hand');assert.equal(s.rules.pending.skill,'连营');assert.equal(s.players[1].hand.length,0);s=choice(s);assert.equal(s.rules.pending.stage,'equipment:hanbingPick');s=choice(s,'hand');assert.equal(s.rules.pending.skill,'连营');s=choice(s,'decline');assert.equal(s.players[1].hp,4);assert.equal(s.rules.pending,null);validateState(s);
});
test('wood last-hand loss resolves before its optional equipment transfer',()=>{
 let s=game({skillAutomation:true});s.completeSkills=true;s.players[0].general='luxun';const a=s.players[0];card(s,a,'muniu','equip');const id=card(s,a,'tao');s.discard.push(...a.hand.filter(c=>c!==id));a.hand=[id];observeCompleteMoves(s);s.rules.queue=[];s=act(s,a.id,'storeWood',{cards:[id]});assert.equal(s.rules.pending.skill,'连营');s=choice(s);assert.equal(s.rules.pending.stage,'equipment:muniuTransfer');assert.equal(s.players[0].hand.length,1);validateState(s);
});
test('weapon optional declines preserve damage, and double dodge waits for the final response',()=>{
 for(const weapon of ['hanbing','qilin']){let {s,a,b,sha}=slash(game(),weapon);if(weapon==='qilin')card(s,s.players[1],'dilu','equip');s=act(s,a,'use',{cards:[sha],target:b});s=act(s,b,'pass');s=choice(s,'decline');assert.equal(s.players[1].hp,3);validateState(s);}
 let {s,a,b,sha,shan}=slash(game(),'guanshi');s.players[0].general='lvbu';const second=card(s,s.players[1],'shan','hand',1);s=act(s,a,'use',{cards:[sha],target:b});s=act(s,b,'respond',{cards:[shan]});assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.remaining,1);s=act(s,b,'respond',{cards:[second]});assert.equal(s.rules.pending.skill,'贯石斧');s=choice(s,'decline');assert.equal(s.players[1].hp,4);validateState(s);
});
test('new display links cannot smuggle nested private data into projections',()=>{
 const s=game();s.cardEvents=[{id:`${s.rev}:1`,rev:s.rev,type:'move',actor:null,from:{zone:'deck'},to:{zone:'hand',owner:'host'},count:0,publicCards:[],privateCards:{},chainId:{secret:'bad'}}];assert.throws(()=>validateState(s),/展示关联/);
});
test('virtual slash has exactly one public display and no new physical card',()=>{
 const s=game({skillAutomation:true}),n=deckFor(s.deckSet,s.ex).length;s.rules.queue.push({type:'completeVirtualSlash',owner:'host',target:s.players[1].id});pump(s);assert.equal(s.centerPlays.filter(p=>p.kind==='sha').length,1);assert.equal(s.cardEvents.filter(e=>e.type==='play'&&e.kind==='sha').length,1);assert.equal(s.centerPlays[0].cards.length,0);assert.equal(s.deck.length+s.discard.length+s.pool.length+s.players.reduce((sum,p)=>sum+p.hand.length+p.equip.length+p.judge.length,0),n);validateState(s);
});
test('delayed counter links to an effect preview instead of recording another use',()=>{
 let s=game();card(s,s.players[0],'le','judge');const wuxie=card(s,s.players[1],'wuxie');s.phase=0;s=act(s,'host','phase');assert.equal(s.rules.pending.kind,'counter');assert(s.rules.pending.basePlayId);const base=s.rules.pending.basePlayId;s=act(s,s.players[1].id,'respond',{cards:[wuxie]});assert.equal(s.centerPlays.length,1);assert.equal(s.centerPlays[0].parentId,base);assert.equal(s.centerPlays[0].kind,'wuxie');validateState(s);
});
test('green dragon follow-up accepts a concealed guhuo declaration and resumes the original use',()=>{
 let {s,a,b,sha,shan}=slash(game({skillAutomation:true}),'qinglong');s.completeSkills=true;s.players[0].general='yuji';const material=card(s,s.players[0],'sha','hand',1);s=act(s,a,'use',{cards:[sha],target:b});s=act(s,b,'respond',{cards:[shan]});s=choice(s,'other');assert.equal(s.rules.pending.skill,'青龙偃月刀');s=act(s,a,'activateSkill',{skill:'蛊惑',cards:[],targets:[]});s=choice(s,'sha',[material]);for(let i=0;i<4&&s.rules.pending?.skill==='蛊惑质疑';i++)s=choice(s,'trust');assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.player,b);s=act(s,b,'pass');assert.equal(s.players[1].hp,3);validateState(s);
});
test('green dragon allows empty-handed lord jijiang without inventing a hand gain',()=>{
 let {s,a,b,sha,shan}=slash(game({skillAutomation:true}),'qinglong');s.completeSkills=true;const p=s.players[0],lord=s.players.find(t=>t.role==='lord');lord.role=p.role;p.role='lord';p.general='liubei';s.players[1].general='sunquan';s.discard.push(...p.hand.filter(id=>id!==sha));p.hand=[sha];const ally=s.players[2],offered=card(s,ally,'sha','hand',1);s=act(s,a,'use',{cards:[sha],target:b});s=act(s,b,'respond',{cards:[shan]});assert.equal(s.rules.pending.skill,'青龙偃月刀');s=choice(s,'other');s=act(s,a,'activateSkill',{skill:'激将',cards:[],targets:[]});assert.equal(s.rules.pending.player,ally.id);s=choice(s,'yes',[offered]);assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.source,a);assert.equal(s.players[0].hand.length,0);assert(s.pool.includes(offered));s=act(s,b,'pass');assert.equal(s.players[1].hp,3);assert(s.discard.includes(offered));assert(s.centerPlays.some(p=>p.actor===a&&p.cards.includes(offered)&&!p.response));validateState(s);
});
test('green dragon ally hand-response skills finish before the follow-up slash',()=>{
 let {s,a,b,sha,shan}=slash(game({skillAutomation:true}),'qinglong');s.completeSkills=true;const p=s.players[0],lord=s.players.find(t=>t.role==='lord');lord.role=p.role;p.role='lord';p.general='liubei';s.players[1].general='sunquan';s.players[2].general='jie_zhaoyun';const ally=s.players[2],offered=card(s,ally,'sha','hand',1);s=act(s,a,'use',{cards:[sha],target:b});s=act(s,b,'respond',{cards:[shan]});s=choice(s,'other');s=act(s,a,'activateSkill',{skill:'激将',cards:[],targets:[]});s=choice(s,'yes',[offered]);assert.equal(s.rules.pending.skill,'涯角');assert.equal(s.players[1].hp,4);s=choice(s,'decline');assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.player,b);validateState(s);
});
