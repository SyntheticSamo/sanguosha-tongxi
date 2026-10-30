import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,reduce,validateState,project,migrateState} from '../dist/backend/engine.js';
import {freshRules,pump,validateUse} from '../dist/backend/rules.js';
import {stateOf,handLimit,skillInput,prepareUseSkills} from '../dist/backend/skills.js';
import {startComplete,observeCompleteMoves,processComplete,completePhase,completeLeave,special,specialCards,completeAfterUse,completeAfterDamage,completeAfterDeath} from '../dist/backend/complete-skills.js';
import {GENERAL_MAP,GENERALS} from '../dist/data/generals.js';
import {CARD_BY_ID,CARD_MAP,deckFor} from '../dist/data/cards.js';
import {hasSkill,distance} from '../dist/backend/primitives.js';
const act=(s,id,type,extra={})=>reduce(s,id,{type,rev:s.rev,...extra});
const choose=(s,choice='yes',cards=[],targets=[])=>act(s,s.rules.pending.player,'skillResolve',{choice,cards,targets});
function game(g='sunquan'){
 let s=newRoom({hostId:'host',token:'h'.repeat(32),size:4,practice:true,selectionMode:'choose',skillAutomation:true});while(s.players.length<4)s=act(s,'host','localSeat');
 const others=['caocao','guanyu','zhaoyun','lvbu','sunquan'].filter(id=>GENERAL_MAP[id].baseName!==GENERAL_MAP[g].baseName),ids=[g,...others.slice(0,3)];
 for(let i=0;i<4;i++)s=act(s,s.players[i].id,'general',{general:ids[i]});s=act(s,'host','start');s.rules=freshRules();s.completeSkills=true;s.phase=3;s.turn='host';
 for(const [i,p]of s.players.entries()){p.hp=p.maxHp=4;stateOf(p);if(i)p.skillState.lost=['*'];}observeCompleteMoves(s);s.rules.queue=[];return s;
}
function card(s,p,predicate,zone='hand'){
 const c=deckFor(s.deckSet,s.ex).find(typeof predicate==='string'?c=>c.kind===predicate:predicate);assert(c);
 for(const z of [s.deck,s.pool,s.discard,...Object.values(s.peek),...s.players.flatMap(p=>[p.hand,p.equip,p.judge,...Object.values(p.skillState?.zones||{}),p.skillState?.shelter||[]])]){const i=z.indexOf(c.id);if(i>=0)z.splice(i,1);}p[zone].push(c.id);return c.id;
}
function baseline(s){delete s.skillMoveBaseline;observeCompleteMoves(s);s.rules.queue=[];}
function run(s,skill,step='offer',data={}){processComplete(s,{owner:'host',skill,step,data});return s;}
function skip(s){for(let i=0;i<100&&s.rules.pending;i++){const q=s.rules.pending;if(q.kind==='counter')s=act(s,q.players.find(id=>!q.passed.includes(id)),'pass');else if(q.kind==='skill'&&q.optional)s=choose(s,'decline');else break;}return s;}
const active=(s,skill,cards=[],targets=[],extra={})=>act(s,'host','activateSkill',{skill,cards,targets,...extra});

test('schema3 migrates with legacy effects retained; new state validates special zones and rejects duplicates atomically',()=>{
 const s=game('dengai'),id=card(s,s.players[0],'sha');s.players[0].hand.splice(s.players[0].hand.indexOf(id),1);special(s.players[0],'field').push(id);validateState(s);
 const bad=structuredClone(s);bad.deck.push(id);assert.throws(()=>validateState(bad),/重复/);const old=structuredClone(s);old.schema=3;delete old.completeSkills;assert.equal(migrateState(old).completeSkills,false);assert.equal(migrateState(old).schema,6);
});
test('mingren exchanges exactly one duty card, rejects another player material without changing state',()=>{
 let s=game('luzhi'),id=s.players[0].hand[0];run(s,'明任','initial');const before=structuredClone(s);assert.throws(()=>choose(s,'yes',[s.players[1].hand[0]]),/材料/);assert.deepEqual(s,before);s=choose(s,'yes',[id]);assert.deepEqual(special(s.players[0],'duty'),[id]);const next=s.players[0].hand[0];run(s,'明任','replace');s=choose(s,'yes',[next]);assert(s.players[0].hand.includes(id));assert.deepEqual(special(s.players[0],'duty'),[next]);validateState(s);
});
test('tuntian judgment and rejudge honor the final suit; fields alter distance and zaoxian grants jixi',()=>{
 let s=game('dengai');run(s,'屯田');s=choose(s);assert.equal(s.rules.pending.purpose,'complete:屯田');const id=s.rules.pending.card;s=act(s,'host','pass');assert(s.players[0].hand.includes(id)||special(s.players[0],'field').includes(id));
 while(special(s.players[0],'field').length<3){const id=s.deck.shift();special(s.players[0],'field').push(id);}assert.equal(distance(s,'host',s.players[2].id),1);completePhase(s,s.players[0],0);assert(hasSkill(s.players[0],'急袭'));assert.equal(s.players[0].maxHp,3);validateState(s);
});
test('jixi consumes a field through normal snatch and qingce only permits equipment or judgment',()=>{
 let s=game('dengai'),p=s.players[0],t=s.players[1],id=s.deck.shift();special(p,'field').push(id);p.skillState.gained.push('急袭');baseline(s);s=active(s,'急袭',[id],[t.id]);s=skip(s);assert.equal(s.rules.pending.kind,'chooseCard');s=act(s,'host','pickEffect',{zone:'hand'});assert(s.discard.includes(id));validateState(s);
 s=game('guanqiujian');p=s.players[0];t=s.players[1];p.skillState.gained.push('清侧');const h=s.deck.shift();special(p,'honor').push(h);card(s,t,'bagua','equip');baseline(s);s=active(s,'清侧',[h],[t.id]);assert.deepEqual(s.rules.pending.choices.map(c=>c.id),['public']);validateState(s);
});
test('zhengrong switches between equal exchange and taking a card; hongju awakens once',()=>{
 let s=game('guanqiujian'),p=s.players[0],r=s.deck.shift();special(p,'honor').push(r);const h=p.hand[0];run(s,'征荣');assert.throws(()=>choose(s,'yes',[h]),/等量/);s=choose(s,'yes',[h,r]);assert(s.players[0].hand.includes(r));assert(s.players[0].skillState.marks.zhengrong);run(s,'征荣');s=choose(s,'yes',[],[s.players[1].id]);s=choose(s,'hand');assert.equal(special(s.players[0],'honor').length,2);special(s.players[0],'honor').push(s.deck.shift());completePhase(s,s.players[0],0);assert(hasSkill(s.players[0],'清侧'));const max=s.players[0].maxHp;completePhase(s,s.players[0],0);assert.equal(s.players[0].maxHp,max);validateState(s);
});
test('kongsheng keeps private song faces out of guest snapshots, uses equipment then returns the rest',()=>{
 let s=game('zhoufei'),p=s.players[0],a=card(s,p,'bagua'),b=card(s,p,'sha');run(s,'箜声');s=choose(s,'yes',[a,b]);assert.equal(project(s,s.players[1].id).players[0].skillState.zones.song.cards,null);run(s,'箜声','return');s=choose(s,'yes',[a]);assert(s.players[0].equip.includes(a));assert(s.players[0].hand.includes(b));assert.equal(special(s.players[0],'song').length,0);validateState(s);
});
test('liangyin uses actual outside transitions and rechecks hand comparison',()=>{
 let s=game('zhoufei');run(s,'良姻','outside');if(s.rules.pending){const target=s.rules.pending.targetIds[0],before=s.players.find(p=>p.id===target).hand.length;s=choose(s,'yes',[],[target]);assert.equal(s.players.find(p=>p.id===target).hand.length,before+1);}validateState(s);
});
test('tianxiang prevents all original damage and offers both damage/draw and HP/card branches',()=>{
 for(const branch of ['damage','loss']){let s=game('xiaoqiao'),p=s.players[0],t=s.players[1],id=card(s,p,c=>c.suit==='H');baseline(s);s.rules.queue=[{type:'damage',source:t.id,target:p.id,amount:2}];pump(s);assert.equal(s.rules.pending.skill,'天香');s=choose(s,branch,[id],[s.players[2].id]);assert.equal(s.players[0].hp,4);assert.equal(s.players[2].hp,3);if(branch==='loss')assert(s.players[2].hand.includes(id));validateState(s);}
});
test('liuli redirects a slash and rechecks attack range after paying the weapon',()=>{
 let s=game('daqiao'),p=s.players[0],a=s.players[1],t=s.players[3],sha=card(s,a,'sha'),cost=p.hand[0];s.turn=a.id;baseline(s);s=act(s,a.id,'use',{cards:[sha],target:p.id});assert.equal(s.rules.pending.skill,'流离');s=choose(s,'yes',[cost],[t.id]);assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.player,t.id);s=act(s,t.id,'pass');assert.equal(s.players[0].hp,4);assert.equal(s.players[3].hp,3);validateState(s);
});
test('buqu creates wounds, rejects duplicate ranks and enters the real rescue window without looping',()=>{
 let s=game('zhoutai'),p=s.players[0];p.hp=1;const first=s.deck.find(id=>!special(p,'wound').includes(id));s.deck.splice(s.deck.indexOf(first),1);s.deck.unshift(first);s.rules.queue=[{type:'damage',target:p.id,source:s.players[1].id,amount:1}];pump(s);assert.equal(p.hp,1);assert.equal(special(p,'wound').length,1);assert.equal(handLimit(s,p),2);s.rules.pending=null;s.rules.queue=[];const same=s.deck.find(id=>CARD_BY_ID[id].rank===CARD_BY_ID[first].rank);s.deck.splice(s.deck.indexOf(same),1);s.deck.unshift(same);s.rules.queue=[{type:'damage',target:p.id,source:s.players[1].id,amount:1}];pump(s);assert.equal(s.rules.pending.kind,'save');assert.equal(p.hp,0);assert(s.discard.includes(same));validateState(s);
});
test('fenji observes non-use losses, enforces per-recipient turn limit and pays actual HP',()=>{
 let s=game('zhoutai'),t=s.players[1],id=t.hand[0];baseline(s);s=act(s,t.id,'discard',{cards:[id]});assert.equal(s.rules.pending.skill,'奋激');const old=s.players[1].hand.length;s=choose(s);assert.equal(s.players[0].hp,3);assert.equal(s.players[1].hand.length,old+2);s=skip(s);assert(s.players[0].skillState.turn.fenji.includes(t.id));validateState(s);
});
test('qingjian distributes in one activation, uses category count for current hand limit',()=>{
 let s=game('jie_xiahoudun'),p=s.players[0],a=card(s,p,'sha'),b=card(s,p,'bagua');run(s,'清俭');s=choose(s,'yes',[a,b],[s.players[1].id]);assert.equal(s.players[0].skillState.used['清俭'],true);assert.equal(s.players[0].skillState.turn.handLimit,2);s=choose(s,'decline');validateState(s);
});
test('yijue black disables nonlocked skills and hand responses until reset; red gives card and optional heal',()=>{
 for(const black of [true,false]){let s=game('jie_guanyu'),p=s.players[0],t=s.players[1];t.general='zhaoyun';t.skillState.lost=[];const id=card(s,t,c=>redSuit(c)!==black),cost=p.hand[0];baseline(s);s=active(s,'义绝',[cost],[t.id]);s=choose(s,'yes',[id]);if(black){assert(!hasSkill(s.players[1],'龙胆'));assert(s.players[1].skillState.turn.handBlocked);}else{s=choose(s,'yes');assert(s.players[0].hand.includes(id));}validateState(s);}
});
const redSuit=c=>['H','D'].includes(c.suit);
test('jie tieqi suppresses nonlocked skills, uses final judgment suit and permits matching discard',()=>{
 let s=game('jie_machao'),p=s.players[0],t=s.players[1],sha=card(s,p,'sha');s=act(s,'host','use',{cards:[sha],target:t.id});assert.equal(s.rules.pending.skill,'铁骑');s=choose(s);assert.equal(s.rules.pending.purpose,'complete:铁骑');const suit=CARD_BY_ID[s.rules.pending.card].suit;const cost=card(s,s.players[1],c=>c.suit===suit&&c.id!==s.rules.pending.card);s=act(s,t.id,'pass');assert.equal(s.rules.pending.skill,'铁骑弃牌');s=choose(s,'discard',[cost]);assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.noDodge,false);validateState(s);
});
test('fenwei selects a subset of trick targets and cannot be spent twice',()=>{
 let s=game('jie_ganning'),id=card(s,s.players[0],'wanjian'),victim=s.players[1].id;s=act(s,'host','use',{cards:[id],target:'host'});assert.equal(s.rules.pending.skill,'奋威');s=choose(s,'yes',[],[victim]);s=skip(s);assert.notEqual(s.rules.pending.player,victim);assert(s.players[0].skillState.marks.fenwei);validateState(s);
});
test('wanglie makes the current slash unrespondable and prohibits subsequent card use',()=>{
 let s=game('chendao'),id=card(s,s.players[0],'sha'),other=card(s,s.players[0],'tao');s.players[0].hp=3;s=act(s,'host','use',{cards:[id],target:s.players[1].id});assert.equal(s.rules.pending.skill,'往烈');s=choose(s);assert.equal(s.players[1].hp,3);assert.equal(s.rules.pending,null);assert.throws(()=>act(s,'host','use',{cards:[other],target:'host'}),/往烈/);validateState(s);
});
test('shensu skips judgment/draw before either runs, and qiaobian moves a board card',()=>{
 let s=game('xiahouyuan');s.phase=0;const count=s.players[0].hand.length;s=act(s,'host','phase');assert.equal(s.rules.pending.skill,'神速');s=choose(s,'yes',[],[s.players[1].id]);assert.equal(s.rules.pending.kind,'slash');s=act(s,s.players[1].id,'pass');assert.equal(s.phase,3);assert.equal(s.players[0].hand.length,count);s=choose(s,'decline');validateState(s);
 s=game('zhanghe');s.phase=2;const equip=card(s,s.players[1],'bagua','equip');s=act(s,'host','phase');assert.equal(s.rules.pending.skill,'巧变');s=choose(s,'yes',[s.players[0].hand[0]]);assert.equal(s.rules.pending.skill,'移牌');s=choose(s,'yes',[equip],[s.players[2].id]);assert(s.players[2].equip.includes(equip));assert.equal(s.phase,4);validateState(s);
});
test('fangquan grants a real extra turn followed by the normal successor',()=>{
 let s=game('liushan'),next=s.players[1].id,extra=s.players[3].id;s.phase=2;s=act(s,'host','phase');assert.equal(s.rules.pending.skill,'放权');s=choose(s);assert.equal(s.phase,4);assert.equal(handLimit(s,s.players[0]),s.players[0].maxHp);s=act(s,'host','phase');s=act(s,'host','phase');assert.equal(s.rules.pending.skill,'放权');s=choose(s,'yes',[s.players[0].hand[0]],[extra]);assert.equal(s.turn,extra);assert.equal(project(s,extra).phaseState.extraTurn,true);s.rules.pending=null;s.rules.queue=[];s.phase=5;s=act(s,extra,'phase');assert.equal(s.turn,next);assert.equal(project(s,next).phaseState.extraTurn,false);validateState(s);
});
test('guzheng returns one remaining phase discard then obtains the rest',()=>{
 let s=game('zhangzhaozhanghong'),t=s.players[1],a=t.hand.shift(),b=t.hand.shift();s.discard.push(a,b);run(s,'固政','offer',{target:t.id,cards:[a,b]});s=choose(s,'yes',[a]);assert(s.players[1].hand.includes(a));assert(s.players[0].hand.includes(b));validateState(s);
});
test('zaiqi choices heal Meng Huo or draw, kuizhu validates HP sums atomically',()=>{
 let s=game('menghuo');s.players[0].hp=2;run(s,'再起','offer',{n:2});s=choose(s,'yes',[],[s.players[1].id,s.players[2].id]);s=choose(s,'heal');s=choose(s,'draw');assert.equal(s.players[0].hp,3);validateState(s);
 s=game('sunliang');run(s,'溃诛','offer',{n:8});const before=structuredClone(s);assert.throws(()=>choose(s,'damage',[],[s.players[1].id]),/体力之和/);assert.deepEqual(s,before);s=choose(s,'damage',[],[s.players[1].id,s.players[2].id]);assert.equal(s.players[0].hp,3);assert.equal(s.players[1].hp,3);assert.equal(s.players[2].hp,3);validateState(s);
});
test('beige supports all four final judgment suits',()=>{
 for(const suit of ['H','D','C','S']){let s=game('caiwenji'),t=s.players[1],a=s.players[2],cost=s.players[0].hand[0];t.hp=2;const id=s.deck.find(id=>CARD_BY_ID[id].suit===suit);s.deck.splice(s.deck.indexOf(id),1);s.deck.unshift(id);run(s,'悲歌','offer',{target:t.id,source:a.id,amount:2});s=choose(s,'yes',[cost]);assert.equal(s.rules.pending.kind,'judge');s=act(s,t.id,'pass');if(suit==='H')assert.equal(s.players[1].hp,4);if(suit==='D')assert.equal(s.players[1].hand.length,t.hand.length+3);if(suit==='C')s=choose(s,'yes',s.players[2].hand.slice(0,2));if(suit==='S')assert(s.players[2].skillState.faceDown);validateState(s);}
});
test('polu increments for successive death triggers and allows its deceased owner to choose',()=>{
 let s=game('sunjian');s.players[0].dead=true;run(s,'破虏','offer',{allowDead:true});const old=s.players[1].hand.length;s=choose(s,'yes',[],[s.players[1].id]);assert.equal(s.players[1].hand.length,old+1);run(s,'破虏','offer',{allowDead:true});s=choose(s,'yes',[],[s.players[1].id]);assert.equal(s.players[1].hand.length,old+3);validateState(s);
});
test('lie ren uses secret simultaneous pindian, loss exchanges the two actual cards',()=>{
 let s=game('zhurong'),p=s.players[0],t=s.players[1],a=card(s,p,c=>c.rank===1),b=card(s,t,c=>c.rank===13),sha=card(s,p,'sha');s=act(s,'host','use',{cards:[sha],target:t.id});assert.equal(s.rules.pending.skill,'烈刃');s=choose(s);s=act(s,'host','respond',{cards:[a]});assert(!JSON.stringify(project(s,t.id).pending).includes(a));s=act(s,t.id,'respond',{cards:[b]});assert(s.players[0].hand.includes(b));assert(s.players[1].hand.includes(a));assert.equal(s.rules.pending.kind,'slash');validateState(s);
});
test('tishen gains only a slash that caused it no damage and expires at own preparation',()=>{
 let s=game('jie_zhangfei'),p=s.players[0],t=s.players[1],sha=card(s,t,'sha'),shan=card(s,p,'shan');run(s,'替身');s=choose(s);s.turn=t.id;s.rules.slash=0;s=act(s,t.id,'use',{cards:[sha],target:p.id});s=act(s,p.id,'respond',{cards:[shan]});assert(s.players[0].hand.includes(sha));completePhase(s,s.players[0],0);assert(!s.players[0].skillState.marks.substitute);validateState(s);
});
test('yajiao gifts its revealed top card and requires discard when categories differ',()=>{
 let s=game('jie_zhaoyun'),id=s.deck.find(id=>CARD_MAP[CARD_BY_ID[id].kind].type==='装备');s.deck.splice(s.deck.indexOf(id),1);s.deck.unshift(id);run(s,'涯角','offer',{type:'基本'});s=choose(s);s=choose(s,'yes',[],[s.players[1].id]);assert(s.players[1].hand.includes(id));assert.equal(s.rules.pending.stage,'complete:discard');s=choose(s,'yes',[s.players[0].hand[0]]);validateState(s);
});
test('qianxun handles delayed effect after nullification and returns shelter at turn end',()=>{
 let s=game('jie_luxun'),p=s.players[0],id=card(s,p,'le','judge');s.delayKinds[id]='le';s.rules.queue=[{type:'judge',target:p.id,delayed:id,purpose:'le',source:s.players[1].id}];pump(s);assert.equal(s.rules.pending.skill,'谦逊');s=choose(s);assert.equal(s.players[0].hand.length,0);assert(s.players[0].skillState.shelter.length>0);s=skip(s);if(s.rules.pending?.kind==='judge')s=act(s,'host','pass');validateState(s);
});
test('jie rescue replaces self peach healing only when chosen',()=>{
 for(const yes of [true,false]){let s=game('jie_sunquan'),p=s.players[0],t=s.players[1];p.role='lord';p.hp=1;t.hp=2;t.general='ganning';s.turn=t.id;const id=card(s,t,'tao');s=act(s,t.id,'use',{cards:[id],target:t.id});assert.equal(s.rules.pending.skill,'救援');s=choose(s,yes?'yes':'decline');assert.equal(s.players[0].hp,yes?2:1);assert.equal(s.players[1].hp,yes?2:3);validateState(s);}
});
test('qinxue grants gongxin with private hand view and controlled top-deck manipulation',()=>{
 let s=game('jie_lvmeng'),p=s.players[0],t=s.players[1];p.hp=1;while(p.hand.length<5)p.hand.push(s.deck.shift());completePhase(s,p,0);assert(hasSkill(p,'攻心'));const id=card(s,t,c=>c.suit==='H');s.rules.queue=[];s=active(s,'攻心',[],[t.id]);const other=project(s,s.players[2].id),own=project(s,'host');assert(own.pending.privateView.includes(id));assert(!JSON.stringify(other.pending).includes(id));s=choose(s,'top',[id]);assert.equal(s.deck[0],id);assert(!s.players[1].hand.includes(id));validateState(s);
});
test('jiewei requires a real hand cost and moves one board card after turning face up',()=>{
 let s=game('caoren'),id=card(s,s.players[1],'bagua','equip');run(s,'解围');s=choose(s,'yes',[s.players[0].hand[0]]);s=choose(s,'yes',[id],[s.players[2].id]);assert(s.players[2].equip.includes(id));validateState(s);
});
test('shicai returns the first category card to the top, then cunmu draws from the bottom',()=>{
 let s=game('xuyou'),id=card(s,s.players[0],'sha'),bottom=s.deck.at(-1);s=act(s,'host','use',{cards:[id],target:s.players[1].id});s=act(s,s.players[1].id,'pass');assert.equal(s.rules.pending.skill,'恃才');s=choose(s);assert.equal(s.deck[0],id);assert(s.players[0].hand.includes(bottom));validateState(s);
});
test('zhenliang pays matching color and HP difference; zhengu adjusts at both ends',()=>{
 let s=game('luzhi'),p=s.players[0],id=card(s,p,c=>c.suit==='H'),duty=s.deck.find(id=>redSuit(CARD_BY_ID[id]));s.deck.splice(s.deck.indexOf(duty),1);special(p,'duty').push(duty);s=active(s,'贞良',[id],[s.players[1].id]);assert.equal(s.players[1].hp,3);assert(s.players[0].skillState.marks.zhenliang);validateState(s);
 s=game('haozhao');run(s,'镇骨');const target=s.players[1].id;s=choose(s,'yes',[],[target]);s.players[1].hand.push(...s.deck.splice(0,2));const jobs=completeLeave(s,s.players[0],5);s.rules.queue.push(...jobs);pump(s);assert.equal(s.rules.pending.skill,'镇骨');s=choose(s,'yes',s.players[1].hand.slice(0,2));assert.equal(s.players[1].hand.length,s.players[0].hand.length);validateState(s);
});
test('shenshi yin hand view and watch IDs never appear in another seat projection',()=>{
 let s=game('kuaiyuekuailiang'),p=s.players[0],t=s.players[1];p.skillState.marks.shenshi=true;run(s,'审时','yin',{source:t.id});const own=project(s,p.id),other=project(s,s.players[2].id);assert.deepEqual(own.pending.privateView,t.hand);for(const id of t.hand)assert(!JSON.stringify(other.pending).includes(id));const id=p.hand[0];s=choose(s,'yes',[id]);assert(!JSON.stringify(project(s,s.players[2].id).players[0].skillState).includes(id));s.players[0].hand.splice(0).forEach(id=>s.deck.push(id));completeLeave(s,s.players[1],5);assert.equal(s.players[0].hand.length,4);validateState(s);
});
test('old jizhi exchange puts its replacement face down on top and obtains the revealed basic card',()=>{
 let s=game('huangyueying'),p=s.players[0],revealed=card(s,p,'sha'),cost=p.hand.find(id=>id!==revealed);p.hand.splice(p.hand.indexOf(revealed),1);s.pool.push(revealed);run(s,'集智交换','offer',{card:revealed});s=choose(s,'exchange',[cost]);assert.equal(s.deck[0],cost);assert(s.players[0].hand.includes(revealed));assert(!s.discard.includes(cost));validateState(s);
});
test('jueyan treasure grants temporary jizhi and loses it on the next turn',()=>{
 let s=game('lukang');assert(skillInput(s,s.players[0],'决堰').options.some(([id])=>id==='treasure'));s=active(s,'决堰',[],[],{option:'treasure'});assert(s.players[0].skillState.turn.bonusJizhi);const id=card(s,s.players[0],'wuzhong');s=act(s,'host','use',{cards:[id],target:'host'});assert.equal(s.rules.pending.skill,'集智');const old=s.players[0].hand.length;s=choose(s);assert.equal(s.players[0].hand.length,old+1);s=skip(s);validateState(s);
});
test('guhuo conceals committed material, challenges truthful claims and resumes the card use',()=>{
 let s=game('yuji'),id=card(s,s.players[0],'sha'),target=s.players[1].id;s.players[1].skillState.lost=[];s=active(s,'蛊惑');s=choose(s,'sha',[id],[target]);assert.equal(s.rules.pending.skill,'蛊惑质疑');const v=project(s,target);assert(!JSON.stringify(v.pending).includes(id));assert.equal(v.players[0].skillState.concealedCount,1);s=choose(s,'challenge');assert(hasSkill(s.players[1],'缠怨'));assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.player,target);s=act(s,target,'pass');assert.equal(s.players[1].hp,3);validateState(s);
});
test('false guhuo wastes the material and does not execute effects; cancel returns concealed commits',()=>{
 let s=game('yuji'),id=card(s,s.players[0],'shan');s=active(s,'蛊惑');s=choose(s,'sha',[id],[s.players[1].id]);const original=structuredClone(s);s=choose(s,'challenge');assert(s.discard.includes(id));assert.equal(s.players[1].hp,4);validateState(s);
 const before=original.players[0].hand.length;const corrected=act(original,'host','correct',{op:'cancel',reason:'测试中止'});assert(corrected.players[0].hand.includes(id));assert.equal(corrected.players[0].hand.length,before+1);validateState(corrected);
});
test('guhuo can supply a dodge response and cannot bypass declaration legality',()=>{
 let s=game('yuji'),sha=card(s,s.players[1],'sha'),material=card(s,s.players[0],'tao');s.turn=s.players[1].id;s=act(s,s.players[1].id,'use',{cards:[sha],target:'host'});s=active(s,'蛊惑');s=choose(s,'shan',[material]);while(s.rules.pending?.skill==='蛊惑质疑')s=choose(s,'trust');assert.equal(s.players[0].hp,4);assert.equal(s.rules.pending,null);validateState(s);
 s=game('yuji');const id=s.players[0].hand[0];s=active(s,'蛊惑');const before=structuredClone(s);assert.throws(()=>choose(s,'tao',[id]),/体力已满/);assert.deepEqual(s,before);
});
test('huashen private candidates, valid inherited skills, faction/gender change and xinsheng',()=>{
 let s=game('zuoci');startComplete(s);pump(s);assert.equal(s.rules.pending.skill,'化身');const own=project(s,'host'),other=project(s,s.players[1].id);assert.equal(own.players[0].skillState.avatars.length,3);assert.equal(other.players[0].skillState.avatars,undefined);assert.deepEqual(other.pending.choices,[]);const choice=s.rules.pending.choices[0].id;s=choose(s,choice);const [id,name]=choice.split(':');assert(hasSkill(s.players[0],name));assert.equal(s.players[0].skillState.avatar.general,id);const old=s.players[0].skillState.avatars.length;run(s,'新生');s=choose(s);assert.equal(s.players[0].skillState.avatars.length,old+1);validateState(s);
});
test('all 101 selected editions start in complete mode with a resumable valid first decision',()=>{
 for(const general of GENERALS){let s=newRoom({hostId:'host',token:'h'.repeat(32),size:2,practice:true,selectionMode:'choose',skillAutomation:true,completeSkills:true});s=act(s,'host','localSeat');const other=general.baseName===GENERAL_MAP.caocao.baseName?'guanyu':'caocao';s=act(s,'host','general',{general:general.id});s=act(s,s.players[1].id,'general',{general:other});s=act(s,'host','start');validateState(s);for(const p of s.players){const v=project(s,p.id);assert.equal(v.completeSkills,true);assert.equal(v.schema,6);assert.equal(v.players.find(t=>t.id!==p.id).hand,null);}for(let i=0;i<30&&s.rules.pending?.kind==='skill';i++){const q=s.rules.pending;if(q.optional)s=choose(s,'decline');else if(q.stage==='complete:initial'&&q.skill==='化身')s=choose(s,q.choices[0].id);else if(q.skill==='明任')s=choose(s,'yes',[q.internal.allowedCards[0]]);else break;}validateState(s);}
});
test('inherited edition-specific skills retain the borrowed version and lose only the old borrowed ability',()=>{
 let s=game('zuoci'),p=s.players[0];p.skillState.avatars=['jie_machao','jie_guanyu'];p.skillState.avatar={general:'jie_machao',skill:'铁骑'};assert(hasSkill(p,'铁骑'));const id=card(s,p,'sha');s=act(s,'host','use',{cards:[id],target:s.players[1].id});assert.equal(s.rules.pending.skill,'铁骑');s=choose(s);assert.equal(s.rules.pending.purpose,'complete:铁骑');validateState(s);
});
test('failed complete choices roll back paid costs, queue, presentation and all hidden state',()=>{
 let s=game('zhanghe');s.phase=2;s=act(s,'host','phase');const before=structuredClone(s);assert.throws(()=>choose(s,'yes',[s.players[1].hand[0]]),/材料/);assert.deepEqual(s,before);const other=s.players[1].id;assert.throws(()=>act(s,other,'skillResolve',{choice:'yes',cards:[s.players[0].hand[0]]}),/等待/);assert.deepEqual(s,before);
});
test('shuangxiong recovers opponent slash responses only after damage from its converted duel',()=>{
 let s=game('yanliangwenchou'),p=s.players[0],t=s.players[1],material=card(s,p,c=>!redSuit(c)&&c.kind!=='juedou'),reply=card(s,t,c=>c.kind==='sha'&&c.id!==material);p.skillState.turn.shuangColor='red';baseline(s);s=act(s,'host','use',{cards:[material],as:'juedou',targets:[t.id]});s=skip(s);assert.equal(s.rules.pending.kind,'duel');s=act(s,t.id,'respond',{cards:[reply]});s=act(s,'host','pass');assert.equal(s.rules.pending.skill,'双雄');assert.equal(s.players[0].hp,3);s=choose(s);assert(s.players[0].hand.includes(reply));validateState(s);
});
test('newly chosen preparation ability runs after the turn-start huashen choice',()=>{
 const s=game('zuoci'),p=s.players[0];p.skillState.avatars=['zhoufei','guanyu'];p.skillState.avatar={general:'guanyu',skill:'武圣'};s.phase=0;completePhase(s,p,0);pump(s);let next=choose(s,'zhoufei:箜声');assert.equal(next.rules.pending.skill,'箜声');validateState(next);
});
test('jie tieqi suppression resolves before the target can offer liuli',()=>{
 let s=game('jie_machao'),t=s.players[1];t.general='daqiao';t.skillState.lost=[];const sha=card(s,s.players[0],'sha');s=act(s,'host','use',{cards:[sha],target:t.id});assert.equal(s.rules.pending.skill,'铁骑');s=choose(s);s=act(s,t.id,'pass');assert.equal(s.rules.pending.skill,'铁骑弃牌');s=choose(s,'no');assert.equal(s.rules.pending,null);assert.equal(s.players[1].hp,3);assert(!hasSkill(s.players[1],'流离'));validateState(s);
});
test('complete network tables reject guest manual effect manipulation and excess phase discard atomically',()=>{
 const s=game();s.practice=false;const id=s.players[1].id,before=structuredClone(s);for(const [type,extra]of [['hp',{target:'host',delta:1}],['peek',{n:2}],['draw',{n:2}],['give',{cards:[s.players[1].hand[0]],target:'host'}]])assert.throws(()=>act(s,id,type,extra),/系统执行/);assert.throws(()=>act(s,id,'discard',{cards:[s.players[1].hand[0]]}),/弃牌阶段/);assert.deepEqual(s,before);
});
test('moving a field card offers only legal destinations and ends cleanly if all slots are occupied',()=>{
 const s=game('zhanghe');for(const p of s.players){card(s,p,p.id==='host'?'liannu':p===s.players[1]?'qinggang':p===s.players[2]?'guding':'cixiong','equip');}run(s,'移牌');assert.equal(s.rules.pending,null);validateState(s);
});
test('huashen cleans the old dedicated zone and cannot exchange a newly drawn avatar again',()=>{
 let s=game('zuoci'),p=s.players[0],id=s.deck.shift();special(p,'field').push(id);p.skillState.avatars=['dengai','guanyu','caocao'];p.skillState.avatar={general:'dengai',skill:'屯田'};run(s,'化身');s=choose(s,'guanyu:武圣');assert(s.discard.includes(id));assert.equal(special(s.players[0],'field').length,0);run(s,'化身');s=choose(s,'exchange');s=choose(s,'dengai');assert.deepEqual(s.rules.pending.choices.map(c=>c.id),['caocao']);s=choose(s,'decline');validateState(s);
});
test('standard jizhi includes delayed tricks, and nullification pauses the chain for jizhi first',()=>{
 let s=game('huangyueying'),id=card(s,s.players[0],'le');s=act(s,'host','use',{cards:[id],target:s.players[1].id});assert.equal(s.rules.pending.skill,'集智');s=choose(s,'decline');s=skip(s);validateState(s);
 s=game('jie_huangyueying');const trick=card(s,s.players[1],'wuzhong'),wx=card(s,s.players[0],'wuxie');s.turn=s.players[1].id;s=act(s,s.players[1].id,'use',{cards:[trick],target:s.players[1].id});s=act(s,'host','respond',{cards:[wx]});assert.equal(s.rules.pending.skill,'集智');s=choose(s,'decline');assert.equal(s.rules.pending.kind,'counter');assert.equal(s.rules.pending.negated,true);validateState(s);
});
test('private skill branch metadata never discloses a target hand suit to other seats',()=>{
 const s=game('jie_lvmeng');s.players[0].skillState.gained.push('攻心');for(const t of s.players.slice(1)){s.deck.push(...t.hand);t.hand=[];}card(s,s.players[1],c=>c.suit==='S');const next=active(s,'攻心',[],[s.players[1].id]),v=project(next,s.players[2].id);assert.equal(v.pending.stage,'complete:waiting');assert(!v.pending.hint.includes('红桃'));assert.deepEqual(v.pending.cardChoices,[]);assert.deepEqual(v.pending.choices,[]);assert.equal(v.pending.minCards,0);
});
test('yajiao resolves between two required dodges and can supply the second real dodge',()=>{
 let s=game('jie_zhaoyun'),p=s.players[0],t=s.players[1];t.general='lvbu';t.skillState.lost=[];const first=card(s,p,'shan'),sha=card(s,t,'sha'),second=s.deck.find(id=>CARD_BY_ID[id].kind==='shan'&&id!==first);s.deck.splice(s.deck.indexOf(second),1);s.deck.unshift(second);s.turn=t.id;s=act(s,t.id,'use',{cards:[sha],target:'host'});assert.equal(s.rules.pending.remaining,2);s=act(s,'host','respond',{cards:[first]});assert.equal(s.rules.pending.skill,'涯角');s=choose(s);s=choose(s,'yes',[],['host']);assert(s.players[0].hand.includes(second));assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.remaining,1);s=act(s,'host','respond',{cards:[second]});s=choose(s,'decline');assert.equal(s.players[0].hp,4);assert.equal(s.rules.pending,null);validateState(s);
});
test('unquestioned guhuo remains concealed and colorless until its material reaches discard',()=>{
 let s=game('yuji'),p=s.players[0],t=s.players[1],id=card(s,p,c=>c.kind==='sha'&&c.suit==='S');card(s,t,'renwang','equip');s=active(s,'蛊惑');s=choose(s,'sha',[id],[t.id]);while(s.rules.pending?.skill==='蛊惑质疑')s=choose(s,'trust');assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.color,'none');const v=project(s,t.id);assert(!JSON.stringify(v.pending).includes(id));assert(!v.pool.includes(id));assert.equal(v.poolCount,1);assert(!v.lastPublicPlay.host.cards.includes(id));assert.equal(v.lastPublicPlay.host.hiddenMaterials,1);assert(!v.logs.some(l=>l.text.includes('使用 '+CARD_BY_ID[id].suit)));for(const e of v.cardEvents.filter(e=>e.rev>=s.rev-1))assert(!e.cards.includes(id));s=act(s,t.id,'pass');assert.equal(s.players[1].hp,3);assert(s.discard.includes(id));assert(project(s,t.id).lastPublicPlay.host.cards.includes(id));validateState(s);
});
test('private acquisition of an unchallenged material never exposes its face to a third seat',()=>{
 let s=game('yuji'),p=s.players[0],t=s.players[1];t.general='caocao';t.skillState.lost=[];const id=card(s,p,'shan');s=active(s,'蛊惑');s=choose(s,'sha',[id],[t.id]);while(s.rules.pending?.skill==='蛊惑质疑')s=choose(s,'trust');s=act(s,t.id,'pass');assert.equal(s.rules.pending.skill,'奸雄');s=choose(s);assert(s.players[1].hand.includes(id));const v=project(s,s.players[2].id);assert(!v.lastPublicPlay.host.cards.includes(id));for(const e of v.cardEvents.filter(e=>e.rev===s.rev))assert(!e.cards.includes(id));validateState(s);
});
test('wusheng cannot borrow the range or distance of equipment consumed as its material',()=>{
 const s=game('guanyu'),p=s.players[0],t=s.players[2],weapon=card(s,p,'fangtian','equip');assert.throws(()=>validateUse(s,p,{cards:[weapon],as:'sha',targets:[t.id]}),/攻击范围/);const horse=card(s,p,'chitu','equip');p.equip=p.equip.filter(id=>id!==weapon);s.deck.push(weapon);assert.throws(()=>validateUse(s,p,{cards:[horse],as:'sha',targets:[t.id]}),/攻击范围/);validateState(s);
});
test('huoji and kanpo accept only hand materials, while equipment jiewei remains a separate conversion',()=>{
 const s=game('wolong'),p=s.players[0],redEquip=card(s,p,'chitu','equip'),blackEquip=card(s,p,'bagua','equip');assert.throws(()=>validateUse(s,p,{cards:[redEquip],as:'huogong',targets:[s.players[1].id]}),/转化/);s.rules.pending={kind:'counter',players:s.players.map(p=>p.id),passed:[],effect:{},negated:false};assert.throws(()=>act(s,'host','respond',{cards:[blackEquip],as:'wuxie'}),/转化/);validateState(s);
});
test('initial huashen can initialize its newly inherited game-start skill',()=>{
 let s=game('zuoci');s.players[0].skillState.avatars=['luzhi','luji','guanyu'];run(s,'化身','initial');const before=s.players[0].hand.length;s=choose(s,'luzhi:明任');assert.equal(s.players[0].hand.length,before+1);assert.equal(s.rules.pending.skill,'明任');s=choose(s,'yes',[s.players[0].hand[0]]);assert.equal(special(s.players[0],'duty').length,1);validateState(s);
});
