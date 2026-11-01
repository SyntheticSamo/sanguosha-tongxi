// Generated, disposable authoring scenarios. No player saves or device data.
import {newRoom,reduce,project,validateState} from '../dist/backend/engine.js';
import {freshRules} from '../dist/backend/rules.js';
import {stateOf} from '../dist/backend/skills.js';
import {CARD_MAP,CARD_BY_ID,deckFor} from '../dist/data/cards.js';
const act=(s,id,type,a={})=>reduce(s,id,{type,rev:s.rev,...a});
export function makePresentationFixture(kind,{includeState=false}={}){
 const def=CARD_MAP[kind];if(!def)throw new Error('未知牌种');
 let s=newRoom({hostId:'host',token:'h'.repeat(32),practice:true,size:2,selectionMode:'choose',skillAutomation:true,completeSkills:true,equipmentAutomation:true,tableExperience:true,deckSet:'wood'});
 s=act(s,'host','localSeat');for(const [i,g]of ['sunquan','caocao'].entries())s=act(s,s.players[i].id,'general',{general:g});s=act(s,'host','start');s.turn='host';s.phase=3;s.flow={paused:true};s.rules=freshRules();for(const p of s.players){s.deck.push(...p.hand);p.hand=[];stateOf(p).lost=['*'];}s.cardEvents=[];s.events=[];
 const a=s.players[0].id,b=s.players[1].id,steps=[];
 const give=(owner,k,zone='hand')=>{const id=s.deck.find(id=>CARD_BY_ID[id].kind===k);if(!id)throw new Error(`场景牌源不足：${k}`);s.deck.splice(s.deck.indexOf(id),1);s.players.find(p=>p.id===owner)[zone].push(id);return id;};
 const save=(intent)=>{validateState(s);steps.push({intent,view:project(s,a),...(includeState?{state:structuredClone(s)}:{})});};
 const run=(owner,type,data={})=>{s=act(s,owner,type,data);save({actor:owner,type});};
 let owner=a,target=b,card;
 if(def.slot==='armor'){owner=b;s.turn=b;}
 card=give(owner,kind);
 if(['shun','chai','huogong'].includes(kind))give(b,'shan');
 if(kind==='jiedao')give(b,'qilin','equip');
 if(kind==='tao')s.players[0].hp=3;
 if(kind==='jiu')give(a,'sha');
 if(kind==='juedou'){give(a,'sha');give(b,'sha');}
 if(['shan','wuxie'].includes(kind)){s.turn=b;const attack=give(b,kind==='shan'?'sha':'juedou');save({type:'baseline'});run(b,'use',{cards:[attack],targets:[a]});run(a,'respond',{cards:[card]});}
 else{
  const targets=def.slot||['tao','jiu','wuzhong','shandian'].includes(kind)?[owner]:['nanman','wanjian','taoyuan','wugu'].includes(kind)?[a]:kind==='tiesuo'?[a,b]:kind==='jiedao'?[b,a]:[target];
  save({type:'baseline'});run(owner,'use',{cards:[card],targets});
 }
 if(def.type==='延时'){s.turn=kind==='shandian'?a:b;s.phase=0;s.rules=freshRules();save({type:'judge-ready'});run(s.turn,'phase');}
 if(kind==='jiu'){const sha=s.players[0].hand.find(id=>CARD_BY_ID[id].kind==='sha');run(a,'use',{cards:[sha],targets:[b]});}
 if(def.slot==='weapon'){
  give(a,'sha');give(a,'sha');give(a,'tao');give(a,'jiu');
  if(['qinglong','guanshi'].includes(kind))give(b,'shan');
  if(kind==='cixiong'){s.players[1].general='daqiao';give(b,'tao');}
  if(kind==='qilin')give(b,'chitu','equip');
  if(kind==='hanbing'){give(b,'shan');give(b,'tao');}
  if(kind==='zhangba'){const cards=s.players[0].hand.filter(id=>['tao','jiu'].includes(CARD_BY_ID[id].kind));save({type:'weapon-ready'});run(a,'use',{cards,as:'sha',targets:[b]});}
  else {const cards=[s.players[0].hand.find(id=>CARD_BY_ID[id].kind==='sha')];if(kind==='fangtian'){s.deck.push(...s.players[0].hand.filter(id=>!cards.includes(id)));s.players[0].hand=[...cards];}save({type:'weapon-ready'});run(a,'use',{cards,as:kind==='zhuque'?'fire_sha':undefined,targets:[b]});}
 }
 if(def.slot==='armor'){s.turn=a;const attack=give(a,kind==='tengjia'?'fire_sha':'sha');save({type:'armor-ready'});run(a,'use',{cards:[attack],targets:[b]});}
 if(kind==='muniu'){const stored=give(a,'tao');save({type:'storage-ready'});run(a,'storeWood',{cards:[stored]});}
 // Resolve only real engine windows. All inputs below pass the normal reducer.
 for(let i=0;s.rules.pending&&i<35;i++){
  const q=s.rules.pending,p=s.players.find(p=>p.id===q.player);if(!p)throw new Error('场景响应者缺失');
  if(q.kind==='counter'){run(p.id,'pass');continue;}
  if(q.kind==='market'){run(p.id,'pickEffect',{windowId:q.windowId,card:q.available[0]});continue;}
  if(q.kind==='chooseCard'){const shown=project(s,p.id).pending,now=Date.now;try{Date.now=()=>Math.max(now(),shown.handReadyAt||0);run(p.id,'pickEffect',{windowId:q.windowId,zone:'hand',choiceId:shown.handChoices[0]});}finally{Date.now=now;}continue;}
  if(q.kind==='fireShow'){run(p.id,'respond',{cards:[p.hand[0]]});continue;}
  if(q.kind==='firePay'){const id=s.deck.find(id=>CARD_BY_ID[id].suit===q.suit);if(id){s.deck.splice(s.deck.indexOf(id),1);p.hand.push(id);save({type:'payment-ready'});run(p.id,'respond',{cards:[id]});}else run(p.id,'pass');continue;}
  if(q.kind==='judgeAwait'){run(p.id,'revealJudge',{windowId:q.windowId});continue;}
  if(q.kind==='judge'){run(p.id,'pass');continue;}
  if(q.kind==='skill'&&q.stage?.startsWith('equipment:')){
   const option=q.choices[0],n=option.minCards??q.minCards,choices=q.cardChoices||[...p.hand,...p.equip].filter(id=>CARD_BY_ID[id].kind!==kind),cards=q.stage==='equipment:qinglong'?p.hand.filter(id=>CARD_BY_ID[id].kind==='sha').slice(0,1):choices.slice(0,n),targets=q.targetIds.slice(0,q.minTargets);
   if(cards.length<n&&q.optional)run(p.id,'skillResolve',{choice:'decline',cards:[],targets:[]});else run(p.id,'skillResolve',{choice:option.id,cards,targets});continue;
  }
  if(kind==='bagua'&&q.required==='shan'&&!q.baguaUsed){run(p.id,'bagua');continue;}
  const response=p.hand.find(id=>q.required==='sha'?['sha','fire_sha','thunder_sha'].includes(CARD_BY_ID[id].kind):CARD_BY_ID[id].kind===q.required);
  if(response&&kind!=='qilin')run(p.id,'respond',{cards:[response]});else run(p.id,'pass');
 }
 if(s.rules.pending)throw new Error(`场景未完成：${kind}/${s.rules.pending.kind}`);
 return {kind,name:def.name,steps};
}
