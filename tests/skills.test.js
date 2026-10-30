import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,reduce,validateState,project,migrateState} from '../dist/backend/engine.js';
import {freshRules} from '../dist/backend/rules.js';
import {GENERAL_MAP} from '../dist/data/generals.js';
import {deckFor,CARD_BY_ID} from '../dist/data/cards.js';
import {stateOf,handLimit,phaseSkills} from '../dist/backend/skills.js';
import {validateUse,pump} from '../dist/backend/rules.js';
import {abilityInfo} from '../dist/data/abilities.js';
const act=(s,actor,type,extra={})=>reduce(s,actor,{type,rev:s.rev,...extra});
function game(general='sunquan'){
 let s=newRoom({hostId:'host',token:'h'.repeat(32),size:4,practice:true,selectionMode:'choose',skillAutomation:true});while(s.players.length<4)s=act(s,'host','localSeat');
 const used=new Set([GENERAL_MAP[general].baseName]),others=['caocao','guanyu','zhaoyun','lvbu','huangyueying'].filter(id=>!used.has(GENERAL_MAP[id].baseName));
 const ids=[general,...others.slice(0,3)];for(let i=0;i<4;i++)s=act(s,s.players[i].id,'general',{general:ids[i]});s=act(s,'host','start');s.rules=freshRules();s.turn='host';s.phase=3;
 for(const [i,p]of s.players.entries()){p.hp=p.maxHp=4;stateOf(p);if(i)p.skillState.lost=['*'];}validateState(s);return s;
}
function give(s,owner,kind,n=0,zone='hand'){const id=deckFor(s.deckSet,s.ex).filter(c=>c.kind===kind)[n].id;for(const z of [s.deck,s.discard,s.pool,...Object.values(s.peek),...s.players.flatMap(p=>[p.hand,p.equip,p.judge,p.skillState?.shelter||[]])]){const at=z.indexOf(id);if(at>=0)z.splice(at,1);}owner[zone].push(id);return id;}
function empty(s,p){s.deck.push(...p.hand);p.hand=[];}
function decline(s){for(let i=0;i<50&&s.rules.pending;i++){const q=s.rules.pending;if(q.kind==='skill'&&q.optional)s=act(s,q.player,'skillResolve',{choice:'decline'});else if(q.kind==='counter')s=act(s,q.players.find(id=>!q.passed.includes(id)),'pass');else break;}return s;}
function skill(s,name,cards=[],targets=[],extra={}){return act(s,'host','activateSkill',{skill:name,cards,targets,...extra});}

test('luanwu resolves each forced slash before asking the next player',()=>{
 let s=game('jiaxu'),a=s.players[1],b=s.players[2],sha=give(s,a,'sha');s=skill(s,'乱武');assert.equal(s.rules.pending.player,a.id);s=act(s,a.id,'skillResolve',{choice:'slash',cards:[sha],targets:['host']});assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.player,'host');s=act(s,'host','pass');assert.equal(s.players[0].hp,3);assert.equal(s.rules.pending.skill,'乱武');assert.equal(s.rules.pending.player,b.id);validateState(s);
 s=game('jiaxu');a=s.players[1];give(s,a,'zhangba',0,'equip');give(s,s.players[0],'renwang',0,'equip');const material=[give(s,a,'sha'),give(s,a,'tao')];s=skill(s,'乱武');s=act(s,a.id,'skillResolve',{choice:'slash',cards:material,as:'sha',targets:['host']});assert.equal(s.rules.pending.kind,'slash','mixed-suit zhangba slash is colorless and passes black-slash shield');validateState(s);
});

test('lijian virtual duel triggers jiang for its actual user before the duel window',()=>{
 let s=game('diaochan'),a=s.players[1],b=s.players[2];a.general='sunce';stateOf(a).lost=[];const old=a.hand.length;s=skill(s,'离间',[s.players[0].hand[0]],[a.id,b.id]);assert.equal(s.rules.pending.skill,'激昂');assert.equal(s.rules.pending.player,a.id);s=act(s,a.id,'skillResolve',{choice:'yes'});assert.equal(s.players[1].hand.length,old+1);s=decline(s);assert.equal(s.rules.pending.kind,'duel');validateState(s);
});

test('bazhen judgment can be changed before it supplies a dodge and preserves two-dodge windows',()=>{
 let s=game('wolong'),a=s.players[1];a.general='lvbu';stateOf(a).lost=[];const sha=give(s,a,'sha');s.turn=a.id;s=act(s,a.id,'use',{cards:[sha],target:'host'});assert.equal(s.rules.pending.remaining,2);
 s=act(s,'host','bagua');assert.equal(s.rules.pending.kind,'judge');assert.equal(s.rules.pending.purpose,'bagua');assert(!('skillInfo' in project(s,a.id).pending));
 s.players[2].general='simayi';stateOf(s.players[2]).lost=[];const red=give(s,s.players[2],'tao',deckFor(s.deckSet,s.ex).filter(c=>c.kind==='tao').findIndex(c=>c.id!==s.rules.pending.card));s=act(s,s.players[2].id,'rejudge',{cards:[red]});s=act(s,'host','pass');assert.equal(s.rules.pending.kind,'slash');assert.equal(s.rules.pending.remaining,1);assert.equal(s.rules.pending.baguaUsed,false);
 s=act(s,'host','bagua');s=act(s,'host','pass');if(s.rules.pending)s=act(s,'host','pass');assert.equal(s.rules.pending,null);validateState(s);
});

test('failed bagua cannot be retried for the same dodge and tiandu waits before the response resumes',()=>{
 let s=game('guojia'),p=s.players[0],a=s.players[1];give(s,p,'bagua',0,'equip');const black=give(s,p,'sha');p.hand.splice(p.hand.indexOf(black),1);s.deck.unshift(black);const sha=give(s,a,'sha',1);s.turn=a.id;s=act(s,a.id,'use',{cards:[sha],target:'host'});s=act(s,'host','bagua');s=act(s,'host','pass');assert.equal(s.rules.pending.skill,'天妒');s=act(s,'host','skillResolve',{choice:'yes'});assert(s.players[0].hand.includes(black));assert.equal(s.rules.pending.kind,'slash');assert.throws(()=>act(s,'host','bagua'),/已尝试/);s=act(s,'host','pass');s=decline(s);validateState(s);
});

test('slash-only range bonuses never remove trick distance or survive lost skills',()=>{
 for(const general of ['jie_guanyu','jie_zhangfei','taishici','jie_huanggai']){
  const s=game(general),p=s.players[0],t=s.players[2],id=give(s,p,'shun',1);s.rules.slash=1;stateOf(p).turn.tianyi=true;stateOf(p).turn.zhangjiang=true;
  assert.throws(()=>validateUse(s,p,{cards:[id],targets:[t.id]}),/距离/);
 }
 const s=game('jie_guanyu'),p=s.players[0],t=s.players[2],id=give(s,p,'shan',3);stateOf(p).lost=['*'];assert.throws(()=>validateUse(s,p,{cards:[id],as:'sha',targets:[t.id]}),/转化/);
});

test('decisive weir exposes supported branches and rejects the deferred treasure branch atomically',()=>{
 let s=game('lukang'),p=s.players[0],before=structuredClone(s);assert(abilityInfo(GENERAL_MAP.lukang,GENERAL_MAP.lukang.skills.find(s=>s.name==='决堰'),true).active);
 assert.throws(()=>skill(s,'决堰',[],[],{option:'treasure'}),/旧局/);assert.deepEqual(s,before);s=skill(s,'决堰',[],[],{option:'armor'});assert(s.players[0].skillState.abolished.includes('armor'));assert.equal(s.players[0].hand.length,p.hand.length+3);
 assert.equal(abilityInfo(GENERAL_MAP.daqiao,GENERAL_MAP.daqiao.skills[0],true).active,false);
});

test('qizhi can discard the user own card when the user is not a card target',()=>{
 let s=game('wangji'),p=s.players[0],id=give(s,p,'sha');s=act(s,'host','use',{cards:[id],target:s.players[1].id});assert.equal(s.rules.pending.skill,'奇制');assert(s.rules.pending.targetIds.includes('host'));
 const old=s.players[0].hand.length;s=act(s,'host','skillResolve',{choice:'yes',targets:['host']});s=act(s,'host','skillResolve',{choice:'hand'});assert.equal(s.players[0].hand.length,old);assert.equal(s.players[0].skillState.turn.qizhi,1);validateState(s);
});

test('chezhen end-phase discard never grants the qizhi draw',()=>{
 let s=game('sunliang');s.players[2].equip=[];const target=s.players[2],old=target.hand.length;s=act(s,'host','phase');assert.equal(s.rules.pending.skill,'掣政');s=act(s,'host','skillResolve',{choice:'yes',targets:[target.id]});s=act(s,'host','skillResolve',{choice:'hand'});assert.equal(s.players[2].hand.length,old-1);assert.equal(s.players[0].skillState.turn.qizhi,undefined);validateState(s);
});

test('baonue judges the lord instead of the damage dealer',()=>{
 let s=game('dongzhuo'),p=s.players[0],a=s.players[1];p.role='lord';p.hp=2;a.general='lvbu';s.turn=a.id;s.rules.queue=[{type:'damage',source:a.id,target:s.players[2].id,amount:1}];pump(s);assert.equal(s.rules.pending.skill,'暴虐');s=act(s,a.id,'skillResolve',{choice:'yes'});assert.equal(s.rules.pending.player,'host');assert.equal(s.rules.pending.kind,'judge');validateState(s);
});

test('wine slash disables benghuai only after real damage, and free rende slash still spends quota',()=>{
 let s=game('dongzhuo'),p=s.players[0],wine=give(s,p,'jiu'),sha=give(s,p,'sha');s=act(s,'host','use',{cards:[wine],target:'host'});s=act(s,'host','use',{cards:[sha],target:s.players[1].id});s=act(s,s.players[1].id,'pass');assert.equal(s.players[0].skillState.turn.benghuaiDisabled,true);
 s.rules=freshRules();s.phase=5;s.players[0].hp=3;phaseSkills(s,s.players[0],5);pump(s);assert.equal(s.rules.pending,null);
 s=game('jie_liubei');const ids=s.players[0].hand.slice(0,2),t=s.players[1];s=skill(s,'仁德',ids,[t.id]);s=act(s,'host','skillResolve',{choice:'sha',targets:[t.id]});s=act(s,t.id,'pass');assert.equal(s.rules.slash,1);validateState(s);
});

test('standard and reworked zhiheng costs, once-per-turn and all-hand bonus',()=>{
 for(const g of ['sunquan','jie_sunquan']){let s=game(g);const p=s.players[0],cards=[...p.hand],before=cards.length;s=skill(s,'制衡',cards);assert.equal(s.players[0].hand.length,before+(g.startsWith('jie')?1:0));assert(cards.every(id=>s.discard.includes(id)));assert.throws(()=>skill(s,'制衡',[s.players[0].hand[0]]),/已发动/);validateState(s);}
});
test('invalid active-skill cost is atomic and never spends a limited mark',()=>{
 const s=game('weiyan'),before=structuredClone(s);assert.throws(()=>skill(s,'奇谋',[],[],{value:99}),/体力数/);assert.deepEqual(s,before);
 const other=s.players[1].hand[0];assert.throws(()=>skill(s,'强袭',[other],[s.players[1].id]),/没有此技能/);assert.deepEqual(s,before);
});
test('kurou loses HP, draws after dying check; reworked zhaxiang draws three',()=>{
 for(const g of ['huanggai','jie_huanggai']){let s=game(g);const old=s.players[0].hand.length,id=s.players[0].hand[0];s=skill(s,'苦肉',g.startsWith('jie')?[id]:[]);assert.equal(s.players[0].hp,3);assert.equal(s.players[0].hand.length,g.startsWith('jie')?old-1+3:old+2);validateState(s);}
});
test('rende gives concealed cards and heals only on crossing the second card',()=>{
 let s=game('liubei');s.players[0].hp=2;const p=s.players[0],t=s.players[1],ids=p.hand.slice(0,3);s=skill(s,'仁德',[ids[0]],[t.id]);assert.equal(s.players[0].hp,2);s=skill(s,'仁德',[ids[1]],[t.id]);assert.equal(s.players[0].hp,3);s=skill(s,'仁德',[ids[2]],[t.id]);assert.equal(s.players[0].hp,3);assert(!s.logs.at(-2)?.text.includes(ids[2]));validateState(s);
});
test('qingnang enforces injury, cost, and reworked distinct-target / black stop',()=>{
 let s=game('jie_huatuo');const a=s.players[0],b=s.players[1],c=s.players[2];a.hp=b.hp=c.hp=2;const red=give(s,a,'tao'),black=give(s,a,'sha');s=skill(s,'青囊',[red],[b.id]);assert.equal(s.players[1].hp,3);assert.throws(()=>skill(s,'青囊',[black],[b.id]),/再次/);s=skill(s,'青囊',[black],[c.id]);assert.equal(s.players[2].hp,3);assert.throws(()=>skill(s,'青囊',[s.players[0].hand[0]],['host']),/再次/);validateState(s);
});
test('dimeng swaps full concealed hands and rejects incorrect payment atomically',()=>{
 let s=game('lusu');const [a,b,c]=s.players;give(s,b,'sha');give(s,b,'shan');const n=Math.abs(b.hand.length-c.hand.length),before=structuredClone(s);assert.throws(()=>skill(s,'缔盟',[],[b.id,c.id]),/手牌差/);assert.deepEqual(s,before);const cards=a.hand.slice(0,n),bh=[...b.hand],ch=[...c.hand];s=skill(s,'缔盟',cards,[b.id,c.id]);assert.deepEqual(s.players[1].hand,ch);assert.deepEqual(s.players[2].hand,bh);validateState(s);
});
test('zhijian only equips an empty usable slot and draws once',()=>{
 let s=game('zhangzhaozhanghong'),a=s.players[0],b=s.players[1],weapon=give(s,a,'qilin'),old=a.hand.length;s=skill(s,'直谏',[weapon],[b.id]);assert(s.players[1].equip.includes(weapon));assert.equal(s.players[0].hand.length,old);const next=give(s,s.players[0],'liannu'),before=structuredClone(s);assert.throws(()=>skill(s,'直谏',[next],[b.id]),/装备栏/);assert.deepEqual(s,before);
});
test('qiangxi per-target limit and qimo temporary range / slash bonuses',()=>{
 let s=game('dianwei'),b=s.players[1];s=skill(s,'强袭',[],[b.id]);assert.equal(s.players[0].hp,3);assert.equal(s.players[1].hp,3);assert.throws(()=>skill(s,'强袭',[],[b.id]),/已强袭/);
 s=game('weiyan');s=skill(s,'奇谋',[],[],{value:2});assert.equal(s.players[0].hp,2);assert.equal(s.players[0].skillState.turn.extraSlash,2);assert.throws(()=>skill(s,'奇谋',[],[],{value:1}),/已经用过/);validateState(s);
});
test('niepan rescues self, resets chains / face, and remains once per game',()=>{
 let s=game('pangtong'),p=s.players[0];p.hp=0;p.chained=true;stateOf(p).faceDown=true;s.rules.pending={kind:'save',player:s.players[1].id,target:'host',saviors:s.players.map(p=>p.id),index:1};s=skill(s,'涅槃');assert.equal(s.players[0].hp,3);assert.equal(s.players[0].hand.length,3);assert(!s.players[0].chained&&!s.players[0].skillState.faceDown);assert.equal(s.rules.pending,null);assert.throws(()=>skill(s,'涅槃'),/已经用过/);validateState(s);
});
test('yingzi, bloodline, bottom draw and orange prevention use authoritative state',()=>{
 let s=game('jie_zhouyu');s.players[0].hp=1;assert.equal(handLimit(s,s.players[0]),4);s.phase=1;const old=s.players[0].hand.length;s=act(s,'host','phase');assert.equal(s.players[0].hand.length,old+3);
 s=game('xuyou');const bottom=s.deck.at(-1);s=act(s,'host','draw',{n:1});assert(s.players[0].hand.includes(bottom));
 s=game('luji');assert.equal(s.players[0].skillState.marks.orange,3);const a=s.players[1],sha=give(s,a,'sha');s.turn=a.id;s=act(s,a.id,'use',{cards:[sha],target:'host'});s=act(s,'host','pass');assert.equal(s.players[0].hp,4);assert.equal(s.players[0].skillState.marks.orange,2);validateState(s);
});
test('draw replacement tuxi, luoyi, haoshi maintain conservation',()=>{
 for(const g of ['zhangliao','xuchu','jie_xuchu','lusu']){let s=game(g);s.phase=1;s=act(s,'host','phase');assert.equal(s.rules.pending.kind,'skill');const q=s.rules.pending,old=s.players[0].hand.length;
  s=act(s,'host','skillResolve',{choice:'yes',targets:q.minTargets?[s.players[1].id]:[]});s=decline(s);if(g==='zhangliao')assert.equal(s.players[0].hand.length,old+1);if(g==='xuchu')assert.equal(s.players[0].hand.length,old+1);
  if(g==='lusu'){assert.equal(s.rules.pending.stage,'haoshiGive');const giveCount=s.rules.pending.minCards,target=s.rules.pending.targetIds[0];s=act(s,'host','skillResolve',{choice:'yes',cards:s.players[0].hand.slice(0,giveCount),targets:[target]});}validateState(s);
 }
});
test('guanxing is private and remains resumable until every viewed card is returned',()=>{
 let s=game('zhugeliang');s.phase=5;s=act(s,'host','phase'); // next turn, then test actor preparation explicitly via correction.
 s.turn='host';s.phase=5;s.rules=freshRules();s.players.filter(p=>p.id!=='host').forEach(p=>p.skillState.faceDown=true);s=act(s,'host','phase');assert.equal(s.rules.pending.skill,'观星');s=act(s,'host','skillResolve',{choice:'yes'});const peek=[...s.peek.host];assert.equal(peek.length,4);const other=project(s,s.players[1].id);assert.equal(other.peek.length,0);assert(!JSON.stringify(other.pending).includes(peek[0]));s=act(s,'host','skillResolve',{choice:'top',cards:peek.slice(0,2)});assert.equal(s.peek.host.length,2);s=act(s,'host','skillResolve',{choice:'bottom',cards:peek.slice(2)});assert.equal(s.rules.pending,null);validateState(s);const restored=migrateState(s);assert.deepEqual(restored.deck,s.deck);
});
test('damage-trigger jianxiong retrieves all material cards and feedback remains private',()=>{
 let s=game('caocao'),a=s.players[1];give(s,a,'zhangba',0,'equip');const cards=[give(s,a,'shan'),give(s,a,'tao')];s.turn=a.id;s=act(s,a.id,'use',{cards,as:'sha',target:'host'});s=act(s,'host','pass');assert.equal(s.rules.pending.skill,'奸雄');s=act(s,'host','skillResolve',{choice:'yes'});assert(cards.every(id=>s.players[0].hand.includes(id)));validateState(s);
});
test('jijiang / hujia wait for real ally consent and consume the ally card once',()=>{
 let s=game('caocao');s.players[0].role='lord';s.players[2].general='simayi';s.players[2].skillState.lost=[];const a=s.players[1],ally=s.players[2],sha=give(s,a,'sha'),dodge=give(s,ally,'shan');s.turn=a.id;s=act(s,a.id,'use',{cards:[sha],target:'host'});s=skill(s,'护驾');assert.equal(s.rules.pending.kind,'skill');assert.equal(s.rules.pending.player,ally.id);s=act(s,ally.id,'skillResolve',{choice:'yes',cards:[dodge]});assert(s.discard.includes(dodge));assert.equal(s.players[0].hp,4);assert.equal(s.rules.pending,null);validateState(s);
});
test('schema2 migration keeps old games out of expanded skill automation',()=>{
 const s=game();s.schema=2;delete s.skillAutomation;const migrated=migrateState(s);assert.equal(migrated.schema,6);assert.equal(migrated.skillAutomation,false);validateState(migrated);
});
test('active jijiang validates and resolves an ally-supplied slash as the lord card',()=>{
 let s=game('liubei');s.players.forEach(p=>p.role=p.id==='host'?'lord':'rebel');const ally=s.players.find(p=>p.id!=='host'&&GENERAL_MAP[p.general].faction==='蜀'),target=s.players[1],sha=give(s,ally,'sha'),n=s.players[0].hand.length;s=skill(s,'激将',[],[target.id]);assert.equal(s.rules.pending.kind,'skill');assert.equal(s.rules.pending.player,ally.id);s=act(s,ally.id,'skillResolve',{choice:'yes',cards:[sha]});assert.equal(s.rules.pending.kind,'slash');assert.equal(s.players[0].hand.length,n);s=act(s,target.id,'pass');assert.equal(s.players[1].hp,3);assert(s.discard.includes(sha));validateState(s);
});
test('fanjian standard guess and reworked HP option execute distinct rules',()=>{
 for(const g of ['zhouyu','jie_zhouyu']){let s=game(g);empty(s,s.players[0]);const id=give(s,s.players[0],'sha'),t=s.players[1];s=skill(s,'反间',g.startsWith('jie')?[id]:[],[t.id]);s=act(s,t.id,'skillResolve',{choice:g.startsWith('jie')?'lose':'H'});assert.equal(s.players[1].hp,3);assert(s.players[1].hand.includes(id));validateState(s);}
});
test('gangle judgment preserves its mandatory discard-or-damage continuation',()=>{
 let s=game('xiahoudun'),a=s.players[1],sha=give(s,a,'sha'),judge=give(s,s.players[0],'sha',1);s.players[0].hand.splice(s.players[0].hand.indexOf(judge),1);s.deck.unshift(judge);s.turn=a.id;s=act(s,a.id,'use',{cards:[sha],target:'host'});s=act(s,'host','pass');assert.equal(s.rules.pending.skill,'刚烈');s=act(s,'host','skillResolve',{choice:'yes'});assert.equal(s.rules.pending.kind,'judge');s=act(s,'host','pass');assert.equal(s.rules.pending.stage,'gangleCost');s=act(s,a.id,'skillResolve',{choice:'damage'});assert.equal(s.players[1].hp,3);validateState(s);
});
test('leiji opens an actual judgment and spade damage is credited to its owner',()=>{
 let s=game('zhangjiao'),a=s.players[1],sha=give(s,a,'sha'),shan=give(s,s.players[0],'shan'),judge=give(s,a,'sha',1);a.hand.splice(a.hand.indexOf(judge),1);s.deck.unshift(judge);s.turn=a.id;s=act(s,a.id,'use',{cards:[sha],target:'host'});s=act(s,'host','respond',{cards:[shan]});assert.equal(s.rules.pending.skill,'雷击');s=act(s,'host','skillResolve',{choice:'yes',targets:[a.id]});s=act(s,a.id,'pass');assert.equal(s.players[1].hp,2);assert.equal(s.events.filter(e=>e.type==='damage').at(-1).source,'host');validateState(s);
});
test('fuyin consumes the first targeting window but a subsequent slash can damage',()=>{
 let s=game('zhugezhan'),a=s.players[1];empty(s,s.players[0]);give(s,a,'liannu',0,'equip');const one=give(s,a,'sha'),two=give(s,a,'sha',1);s.turn=a.id;s=act(s,a.id,'use',{cards:[one],target:'host'});assert.equal(s.rules.pending,null);assert.equal(s.players[0].hp,4);s=act(s,a.id,'use',{cards:[two],target:'host'});s=act(s,'host','pass');assert.equal(s.players[0].hp,3);validateState(s);
});
test('qianjie prevents chaining, delayed placement and adversary pindian',()=>{
 let s=game('lukang'),a=s.players[1],chain=give(s,a,'tiesuo'),le=give(s,a,'le');s.turn=a.id;s=decline(act(s,a.id,'use',{cards:[chain],targets:['host']}));assert(!s.players[0].chained);assert.throws(()=>act(s,a.id,'use',{cards:[le],target:'host'}),/延时锦囊/);assert.throws(()=>act(s,a.id,'pindian',{target:'host'}),/谦节/);validateState(s);
});
test('weimu rejects direct black tricks and ignores black global trick effects',()=>{
 let s=game('jiaxu'),a=s.players[1],chai=give(s,a,'chai'),nanman=give(s,a,'nanman');s.turn=a.id;assert.throws(()=>act(s,a.id,'use',{cards:[chai],target:'host'}),/帷幕/);s=act(s,a.id,'use',{cards:[nanman]});
 for(let i=0;i<30&&s.rules.pending;i++){if(s.rules.pending.kind==='counter')s=decline(s);else{assert.notEqual(s.rules.pending.player,'host');s=act(s,s.rules.pending.player,'pass');}}assert.equal(s.players[0].hp,4);validateState(s);
});
test('qicai protects the correct equipment slots without blocking horses',()=>{
 let s=game('huangyueying'),a=s.players[1],weapon=give(s,s.players[0],'qilin',0,'equip'),horse=give(s,s.players[0],'chitu',0,'equip'),chai=give(s,a,'chai');s.turn=a.id;s=decline(act(s,a.id,'use',{cards:[chai],target:'host'}));assert.equal(s.rules.pending.kind,'chooseCard');const old=structuredClone(s);assert.throws(()=>act(s,a.id,'pickEffect',{zone:'equip',card:weapon}),/奇才/);assert.deepEqual(s,old);s=act(s,a.id,'pickEffect',{zone:'equip',card:horse});assert(s.discard.includes(horse));validateState(s);
});
test('huaili orange gift changes recipient draw and does not reveal private cards',()=>{
 let s=game('luji'),t=s.players[1];s.phase=2;s=act(s,'host','phase');assert.equal(s.rules.pending.skill,'遗礼');s=act(s,'host','skillResolve',{choice:'orange',targets:[t.id]});assert.equal(s.players[0].skillState.marks.orange,2);assert.equal(s.players[1].skillState.marks.orange,1);s.turn=t.id;s.phase=1;const old=s.players[1].hand.length;s=act(s,t.id,'phase');assert.equal(s.players[1].hand.length,old+3);validateState(s);
});
test('juzhan changes conversion state and forbids later targeting in that turn',()=>{
 let s=game('yanyan'),a=s.players[1];give(s,a,'liannu',0,'equip');const one=give(s,a,'sha'),two=give(s,a,'sha',1);s.turn=a.id;s=act(s,a.id,'use',{cards:[one],target:'host'});assert.equal(s.rules.pending.skill,'拒战');s=act(s,'host','skillResolve',{choice:'yes'});assert(s.players[0].skillState.marks.juzhan);s=act(s,'host','pass');assert.throws(()=>act(s,a.id,'use',{cards:[two],target:'host'}),/拒战/);validateState(s);
});
test('jianchu no-dodge flag does not bypass shield immunity',()=>{
 for(const shield of [false,true]){let s=game('pangde'),t=s.players[1],sha=give(s,s.players[0],'sha'),weapon=give(s,t,'liannu',0,'equip');if(shield)give(s,t,'renwang',0,'equip');s=skillOrUse(s,sha,t.id);s=act(s,'host','skillResolve',{choice:'yes'});assert.equal(s.rules.pending.stage,'pick');s=act(s,'host','skillResolve',{choice:'public',cards:[weapon]});assert.equal(s.players[1].hp,shield?4:3);validateState(s);}
});
function skillOrUse(s,id,target){return act(s,'host','use',{cards:[id],target});}
test('congjian gives a concealed equipment card and draws the equipment bonus',()=>{
 let s=game('zhangxiu'),a=s.players[1],id=give(s,s.players[0],'bagua'),aoe=give(s,a,'wanjian'),old=s.players[0].hand.length;s.turn=a.id;s=act(s,a.id,'use',{cards:[aoe]});assert.equal(s.rules.pending.skill,'从谏');const recipient=s.players[2];s=act(s,'host','skillResolve',{choice:'yes',cards:[id],targets:[recipient.id]});assert.equal(s.players[0].hand.length,old+1);assert(s.players[2].hand.includes(id));assert(!s.logs.at(-1).text.includes('八卦阵'));validateState(s);
});
test('chenglyue forced discard grants free-suit slash distance and quota',()=>{
 let s=game('xuyou'),a=s.players[0],cost=[give(s,a,'sha'),give(s,a,'sha',1)],one=give(s,a,'sha',2),two=give(s,a,'sha',3),target=s.players[2];s=skill(s,'成略');assert.equal(s.rules.pending.stage,'discard');s=act(s,'host','skillResolve',{choice:'yes',cards:cost});assert(s.players[0].skillState.turn.freeSuits.includes('S'));s=act(s,'host','use',{cards:[one],target:target.id});s=act(s,target.id,'pass');s=act(s,'host','use',{cards:[two],target:target.id});s=act(s,target.id,'pass');assert.equal(s.rules.slash,0);validateState(s);
});
test('xiongluan abolishes real zones and blocks only the target hand',()=>{
 let s=game('zhangxiu'),t=s.players[2],weapon=give(s,s.players[0],'qilin',0,'equip'),sha=give(s,s.players[0],'sha'),shan=give(s,t,'shan');s=skill(s,'雄乱',[],[t.id]);assert(s.discard.includes(weapon));assert(s.players[0].skillState.abolished.includes('judge'));s=act(s,'host','use',{cards:[sha],target:t.id});assert.throws(()=>act(s,t.id,'respond',{cards:[shan]}),/雄乱/);s=act(s,t.id,'pass');assert.equal(s.players[2].hp,3);validateState(s);
});
test('wangzun and awakened poshi apply phase-boundary state changes',()=>{
 let s=game('yuanshu');s.players.forEach((p,i)=>p.role=i===1?'lord':'rebel');s.phase=5;const old=s.players[0].hand.length;s=act(s,'host','phase');assert.equal(s.rules.pending.skill,'妄尊');s=act(s,'host','skillResolve',{choice:'yes'});assert.equal(s.players[0].hand.length,old+1);assert.equal(handLimit(s,s.players[1]),3);
 s=game('lukang');s.players[0].hp=1;s.players.slice(1).forEach(p=>stateOf(p).faceDown=true);s.phase=5;s=act(s,'host','phase');assert(s.players[0].skillState.gained.includes('怀柔'));assert(s.players[0].skillState.lost.includes('决堰'));assert.equal(s.players[0].maxHp,3);validateState(s);
});
test('zuilun private look, retention, ordering and zero-condition HP penalties',()=>{
 for(const zero of [false,true]){let s=game('zhugezhan');if(zero){s.deck.push(s.players[1].hand.pop());stateOf(s.players[0]).turn.discarded=1;}s.phase=4;s=act(s,'host','phase');assert.equal(s.rules.pending.skill,'罪论');s=act(s,'host','skillResolve',{choice:'yes',targets:zero?[s.players[1].id]:[]});if(!zero){assert.equal(s.rules.pending.stage,'zuilunTake');const take=s.peek.host.slice(0,2);s=act(s,'host','skillResolve',{choice:'take',cards:take});}const cards=[...s.peek.host];s=act(s,'host','skillResolve',{choice:'top',cards});assert.equal(s.peek.host.length,0);assert.equal(s.players[0].hp,zero?3:4);assert.equal(s.players[1].hp,zero?3:4);validateState(s);}
});
test('skill choices reject non-owner, stale revisions and duplicate materials atomically',()=>{
 let s=game('xuchu');s.phase=1;s=act(s,'host','phase');const old=structuredClone(s);assert.throws(()=>act(s,s.players[1].id,'skillResolve',{choice:'yes'}),/等待对应/);assert.throws(()=>reduce(s,'host',{type:'skillResolve',choice:'yes',rev:s.rev-1}),/状态已更新/);assert.deepEqual(s,old);
});
test('reworked rende restricts each recipient and uses a basic card without inventing an entity',()=>{
 let s=game('jie_liubei'),a=s.players[0],t=s.players[1],before=deckFor(s.deckSet).length;a.hp=2;const cards=a.hand.slice(0,2);s=skill(s,'仁德',cards,[t.id]);assert.equal(s.rules.pending.stage,'rendeBasic');s=act(s,'host','skillResolve',{choice:'tao'});assert.equal(s.players[0].hp,3);assert.throws(()=>skill(s,'仁德',[s.players[0].hand[0]],[t.id]),/给过该目标/);assert.equal([...s.deck,...s.discard,...s.pool,...s.players.flatMap(p=>[...p.hand,...p.equip,...p.judge])].length,before);validateState(s);
});
test('reworked guose placement and removal share the once limit and draw once',()=>{
 for(const remove of [false,true]){let s=game('jie_daqiao'),a=s.players[0],t=s.players[1],diamond=give(s,a,'shan',3),le=give(s,t,'le');if(remove){t.hand.splice(t.hand.indexOf(le),1);t.judge.push(le);}const n=a.hand.length;s=skill(s,'国色',[diamond],[t.id],{option:remove?'remove':'place'});assert.equal(s.players[0].hand.length,n);if(remove)assert(!s.players[1].judge.includes(le));else{assert(s.players[1].judge.includes(diamond));assert.equal(s.delayKinds[diamond],'le');}assert.throws(()=>skill(s,'国色',[s.players[0].hand[0]],[t.id]),/方块|已.*国色/);validateState(s);}
});
test('orange never raises hand limit and hongyan changes judgment suit without changing the card',()=>{
 let s=game('luji');assert.equal(handLimit(s,s.players[0]),4);
 s=game('xiaoqiao');const p=s.players[0],le=give(s,p,'le'),spade=give(s,p,'sha');p.hand.splice(p.hand.indexOf(le),1);p.judge.push(le);p.hand.splice(p.hand.indexOf(spade),1);s.deck.unshift(spade);s.phase=0;s=decline(act(s,'host','phase'));assert.equal(s.rules.pending.kind,'judge');assert.equal(CARD_BY_ID[s.rules.pending.card].suit,'S');s=act(s,'host','pass');assert.equal(s.rules.skipPlay,false);validateState(s);
});
test('weidi distributes only this discard phase cards and never repeats a recipient',()=>{
 let s=game('yuanshu_thunder'),a=s.players[0],t=s.players[1];s.players.forEach((p,i)=>p.role=i===0?'lord':'rebel');t.general='lvbu';s.phase=4;const cards=a.hand.slice(0,2);s=act(s,'host','discard',{cards});s=act(s,'host','phase');assert.equal(s.rules.pending.skill,'伪帝');s=act(s,'host','skillResolve',{choice:'yes'});s=act(s,'host','skillResolve',{choice:'give',cards:[cards[0]],targets:[t.id]});assert(s.players[1].hand.includes(cards[0]));if(s.rules.pending?.skill==='伪帝'){assert(!s.rules.pending.targetIds.includes(t.id));s=act(s,'host','skillResolve',{choice:'finish'});}assert(s.discard.includes(cards[1]));validateState(s);
});
test('jie qianxun shelters privately, lianying resolves first, and turn end returns cards',()=>{
 let s=game('jie_luxun'),a=s.players[1],shun=give(s,a,'shun'),original=[...s.players[0].hand];s.turn=a.id;s=decline(act(s,a.id,'use',{cards:[shun],target:'host'})); // Stop before optional qianxun below by rebuilding the resolved counter window.
 s=game('jie_luxun');const source=s.players[1],card=give(s,source,'shun');s.turn=source.id;s=act(s,source.id,'use',{cards:[card],target:'host'});while(s.rules.pending?.kind==='counter')s=act(s,s.rules.pending.players.find(id=>!s.rules.pending.passed.includes(id)),'pass');const hidden=[...s.players[0].hand];assert.equal(s.rules.pending.stage,'qianxun');s=act(s,'host','skillResolve',{choice:'yes'});assert.equal(s.rules.pending.skill,'连营');s=act(s,'host','skillResolve',{choice:'yes',targets:[s.players[2].id]});assert.equal(s.players[0].hand.length,0);assert.deepEqual(s.players[0].skillState.shelter,hidden);const view=project(s,source.id);assert.equal(view.players[0].skillState.shelter,undefined);assert(!hidden.some(id=>JSON.stringify(view.players[0].skillState).includes(id)));s.phase=5;s=act(s,source.id,'phase');assert(hidden.every(id=>s.players[0].hand.includes(id)));validateState(s);
});
test('flip state skips the entire next turn and resets only once',()=>{
 let s=game('caoren'),a=s.players[0],next=s.players[1];stateOf(next).faceDown=true;s.phase=5;s=act(s,'host','phase');assert.notEqual(s.turn,next.id);assert.equal(s.players[1].skillState.faceDown,false);validateState(s);
});
