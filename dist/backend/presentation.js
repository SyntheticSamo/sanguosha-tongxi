import {storedCards} from './wood.js';
import {CARD_BY_ID,CARD_MAP,deckFor} from '../data/cards.js';

// Optional presentation metadata. Never a card zone or an authorization source.
const publicZones=new Set(['pool','discard','equip','judge','field','honor','duty','wound']);
const zones=new Set(['deck','discard','pool','hand','equip','judge','peek','commit','shelter','play','judgeReveal','field','honor','duty','wound','song','wood','center','history']);
const endpoint=(zone,owner)=>owner?{zone,owner}:{zone};
export const materialVisible=(s,id,viewer)=>!s.hiddenMaterials?.[id]||s.hiddenMaterials[id].owner===viewer||s.hiddenMaterials[id].viewers?.includes(viewer);
function revealMaterial(s,id){if(!s.hiddenMaterials?.[id])return;delete s.hiddenMaterials[id];for(const p of [...Object.values(s.lastPublicPlay||{}),...(s.centerPlays||[]),...(s.turnLedger||[]),...(s.playHistory||[])])if(p.concealed)p.concealed=p.concealed.filter(c=>c!==id);}
export function settleHiddenMaterials(s){
  for(const [id,info]of Object.entries(s.hiddenMaterials||{})){if(s.pool.includes(id))continue;let point=null;for(const p of s.players)for(const z of ['hand','equip','judge'])if(p[z].includes(id))point={zone:z,owner:p.id};if(s.discard.includes(id))point={zone:'discard'};if(s.deck.includes(id))point={zone:'deck'};
    if(point&&JSON.stringify(info.location)!==JSON.stringify(point)){cardMotion(s,[id],info.location||{zone:'pool',owner:info.owner},point,{actor:info.owner});if(s.hiddenMaterials[id])s.hiddenMaterials[id].location=point;}
  }
}
export function endHiddenMaterials(s,ids){for(const id of ids||[])if(s.hiddenMaterials?.[id]&&!s.pool.includes(id))delete s.hiddenMaterials[id];}
function locations(s){
  const map=new Map(),put=(ids,zone,owner)=>{for(const id of ids||[])map.set(id,endpoint(zone,owner));};
  put(s.deck,'deck');put(s.discard,'discard');put(s.pool,'pool');
  for(const p of s.players){for(const z of ['hand','equip','judge'])put(p[z],z,p.id);put(s.peek[p.id],'peek',p.id);put(storedCards(p),'wood',p.id);put(s.rules.commits[p.id],'commit',p.id);put(p.skillState?.concealed,'commit',p.id);put(p.skillState?.shelter,'shelter',p.id);for(const [z,ids]of Object.entries(p.skillState?.zones||{}))put(ids,z,p.id);}return map;
}
function trim(s){
  s.cardEvents=s.cardEvents.slice(-64);
  while(s.cardEvents.length&&JSON.stringify(s.cardEvents).length>32000)s.cardEvents.shift();
}
export function presentationStep(s,{recordId,cue}={}){
 if(!s.tableExperience)return undefined;
 const order=s.presentationOrder=(s.presentationOrder||0)+1,id=`${s.rev}:p:${order}`;
 const result={id,sequenceId:`${s.skillTurnNo||0}:${s.turn}`,order,after:s.presentationTail?[s.presentationTail]:[],...(recordId?{effectId:recordId}:{}),...(cue?{cue}:{})};s.presentationTail=id;return result;
}
export function validPresentationStep(p){return p===undefined||p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['id','sequenceId','order','after','effectId','cue'].includes(k))&&typeof p.id==='string'&&p.id.length<=100&&/^\d+:p:\d+$/.test(p.id)&&typeof p.sequenceId==='string'&&/^\d+:[\w-]+$/.test(p.sequenceId)&&p.sequenceId.length<=100&&Number.isSafeInteger(p.order)&&p.order>=0&&Number(p.id.split(':').at(-1))===p.order&&Array.isArray(p.after)&&p.after.length<=8&&p.after.every(v=>typeof v==='string'&&v.length<=100&&/^\d+:p:\d+$/.test(v)&&Number(v.split(':').at(-1))<p.order)&&(p.effectId===undefined||typeof p.effectId==='string'&&p.effectId.length<=100&&/^\d+:\d+$/.test(p.effectId))&&(p.cue===undefined||['weapon','armor','chain','wine','recast'].includes(p.cue));}
export function projectPresentationStep(p){return validPresentationStep(p)&&p?{id:p.id,sequenceId:p.sequenceId,order:p.order,after:[...p.after],...(p.effectId?{effectId:p.effectId}:{}),...(p.cue?{cue:p.cue}:{})}:undefined;}
function emit(s,data){s.presentationSeq=(s.presentationSeq||0)+1;const e={id:`${s.rev}:${s.presentationSeq}`,rev:s.rev,presentation:data.presentation||presentationStep(s,{recordId:data.recordId}),...data};s.cardEvents??=[];s.cardEvents.push(e);trim(s);return e;}
export function recordEquipmentCue(s,p,kind,target=null){if(!s.tableExperience)return;emit(s,{type:'effect',actor:p.id,from:{zone:'equip',owner:p.id},to:{zone:'equip',owner:target||p.id},kind,stage:'active',effectTarget:target||p.id,count:0,publicCards:[],privateCards:{},presentation:presentationStep(s,{cue:CARD_MAP[kind]?.slot==='armor'?'armor':'weapon'})});}
export function cardMotion(s,ids,from,to,{actor=null,publicFace=false,type='move',kind=null,stage=null,choiceId=null,recordId=null}={}){
  if(!ids.length)return;if(['discard','equip','judge','field','honor','duty','wound','judgeReveal'].includes(to.zone))for(const id of ids)revealMaterial(s,id);
  const open=to.zone!=='deck'&&(publicFace||publicZones.has(from.zone)||publicZones.has(to.zone)),publicCards=open?ids.filter(id=>!s.hiddenMaterials?.[id]):[],audience=[...new Set([from.owner,to.owner,...ids.flatMap(id=>s.hiddenMaterials?.[id]?[s.hiddenMaterials[id].owner,...(s.hiddenMaterials[id].viewers||[])]:[])].filter(Boolean))];
  const privateCards=Object.fromEntries(audience.map(viewer=>[viewer,ids.filter(id=>!publicCards.includes(id)&&(viewer===from.owner||viewer===to.owner||s.hiddenMaterials?.[id]&&materialVisible(s,id,viewer)))]).filter(([,cards])=>cards.length));
  for(const id of ids)if(s.hiddenMaterials?.[id]){s.hiddenMaterials[id].location={...to};s.hiddenMaterials[id].viewers=[...new Set([...(s.hiddenMaterials[id].viewers||[]),...audience.filter(viewer=>privateCards[viewer]?.includes(id))])];}
  const departure=s.presentationDepartures?.find(d=>d.ids.some(id=>ids.includes(id))&&d.from.zone===from.zone&&d.from.owner===from.owner);
  if(departure)s.presentationDepartures=s.presentationDepartures.filter(d=>d!==departure);
  return emit(s,{...(departure?{presentation:departure.presentation}:{}),type,actor,from,to,cause:s.motionCause||null,count:ids.length,movedCards:[...ids],publicCards,privateCards,...(kind?{kind}:{}),...(stage?{stage}:{}),...(choiceId?{choiceId}:{}),...(recordId?{recordId}:{})});
}
export function recordPlay(s,p,ids,kind,targets=[],response=false){
  archiveTurn(s);const counter=s.rules.pending?.kind==='counter'?s.rules.pending:null,q=s.rules.pending,parent=response&&!counter?(s.centerPlays||[]).findLast(r=>q?.useKey?r.useKey===q.useKey:r.cards.includes(q?.card)):null;
  if(response&&q?.kind==='save')targets=[q.target];
  const concealed=ids.filter(id=>s.hiddenMaterials?.[id]),e=emit(s,{type:'play',origins:ids.map(card=>({card,zone:storedCards(p).includes(card)?'wood':p.equip.includes(card)?'equip':'hand'})),actor:p.id,from:endpoint(ids.length&&ids.every(id=>storedCards(p).includes(id))?'wood':'hand',p.id),to:endpoint('play',p.id),count:ids.length,kind,targets:[...targets],publicCards:ids.filter(id=>!concealed.includes(id)),privateCards:concealed.length?{[p.id]:concealed}:{},response,turnId:displayTurn(s),chainId:counter?.chainId,parentId:counter?.lastPlayId||parent?.id,effectTarget:counter?.effect.target});
  if(counter)counter.lastPlayId=e.id;
  s.lastPublicPlay??={};s.lastPublicPlay[p.id]={id:e.id,rev:s.rev,round:s.round,kind,cards:[...ids],targets:[...targets],response,responseTo:response?q?.kind:undefined,duelSource:response&&q?.kind==='duel'?q.source:undefined,...(concealed.length?{concealed}:{} )};
  s.turnLedger??=[...(s.centerPlays||[])];s.centerPlays??=[];s.centerPlays.push({...s.lastPublicPlay[p.id],actor:p.id,turnId:displayTurn(s),useKey:`${s.rev}:${ids.join('.')}`,chainId:e.chainId,parentId:e.parentId,effectTarget:e.effectTarget});s.turnLedger.push(s.centerPlays.at(-1));boundHistory(s);
}
export function completePresentation(before,s,actor,action){
  archiveTurn(s);
  if(s.chainOrigins)for(const p of s.players)if(!p.chained)delete s.chainOrigins[p.id];
  const a=locations(before),b=locations(s),covered=new Set((s.cardEvents||[]).filter(e=>e.rev===s.rev).flatMap(e=>[...(e.movedCards||[]),...e.publicCards,...Object.values(e.privateCards).flat()]));
  const old=before.rules.pending,q=s.rules.pending;
  if(q?.kind==='judge'&&(old?.kind!=='judge'||old.card!==q.card)){
    cardMotion(s,[q.card],a.get(q.card)||endpoint('deck'),endpoint('judgeReveal',q.player),{actor:q.player,publicFace:true,type:'judge',stage:old?.kind==='judge'?'replace':'reveal'});covered.add(q.card);
  }
  if(old?.kind==='judge'&&(q?.kind!=='judge'||old.card!==q.card)){
    const to=b.get(old.card);if(to){cardMotion(s,[old.card],endpoint('judgeReveal',old.player),to,{actor:old.player,publicFace:true,type:'judge',stage:q?.kind==='judge'?'replaced':'result'});covered.add(old.card);}
  }
  if(action.type==='play'&&action.cards?.length)recordPlay(s,s.players.find(p=>p.id===actor),action.cards,CARD_BY_ID[action.cards[0]].kind,action.target?[action.target]:[]);
  const groups=new Map();for(const [id,to]of b){const from=a.get(id);if(!from||covered.has(id)||JSON.stringify(from)===JSON.stringify(to))continue;const key=JSON.stringify([from,to]);if(!groups.has(key))groups.set(key,{from,to,ids:[]});groups.get(key).ids.push(id);}
  for(const {from,to,ids}of groups.values())cardMotion(s,ids,from,to,{actor});
  delete s.presentationDepartures;
}
export function projectPresentation(s,viewer){
  const q=s.rules.pending,represented=new Set([...(s.rules.resolving||[]),...(s.rules.market||[]),...(q?.kind==='judge'?[q.card]:[]),...(s.rules.lastResult?.kind==='pindian'?s.rules.lastResult.cards:[])]);
  return {turnHistory:{turnId:displayTurn(s),total:(s.turnLedger||s.centerPlays||[]).length,before:Math.max(0,(s.turnLedger||s.centerPlays||[]).length-32)},publicTableCards:s.pool.filter(id=>!s.hiddenMaterials?.[id]&&!represented.has(id)),chainOrigins:Object.fromEntries(Object.entries(s.chainOrigins||{}).filter(([id])=>s.players.some(p=>p.id===id&&p.chained)).map(([id,o])=>[id,{kind:o.kind,actor:o.actor,source:o.source,recordId:o.recordId}])),centerPlays:(s.centerPlays||[]).map(p=>projectPlay(p,viewer)),playHistory:(s.playHistory||[]).map(p=>projectPlay(p,viewer)),presentationResetRev:s.presentationResetRev||0,cardEvents:(s.cardEvents||[]).map(e=>({id:e.id,rev:e.rev,presentation:projectPresentationStep(e.presentation),origins:e.origins?.filter(o=>e.publicCards.includes(o.card)||e.privateCards[viewer]?.includes(o.card)).map(o=>({card:o.card,zone:o.zone})),type:e.type,actor:e.actor,from:endpoint(e.from.zone,e.from.owner),to:endpoint(e.to.zone,e.to.owner),count:e.count,displayCount:e.displayCount,kind:e.kind,stage:e.stage,targets:e.targets?[...e.targets]:undefined,response:e.response,cause:e.cause,choiceId:e.actor===viewer?e.choiceId:undefined,recordId:e.recordId,turnId:e.turnId,chainId:e.chainId,parentId:e.parentId,chainBefore:e.chainBefore,chainAfter:e.chainAfter,effectTarget:e.effectTarget,prevention:e.prevention,preventionName:e.preventionName,cards:[...(e.to.zone==='deck'?e.privateCards[viewer]||[]:[...new Set([...e.publicCards,...(e.privateCards[viewer]||[])])])]})),lastPublicPlay:Object.fromEntries(Object.entries(s.lastPublicPlay||{}).map(([id,p])=>[id,{id:p.id,rev:p.rev,round:p.round,kind:p.kind,cards:p.cards.filter(card=>id===viewer||!p.concealed?.includes(card)),hiddenMaterials:id===viewer?0:p.concealed?.length||0,materialCount:p.cards.length,targets:[...p.targets],response:!!p.response}]))};
}
export function validatePresentation(s,check){
  if(!s||!s.players)return;
  if(s.chainOrigins!==undefined)check(Object.keys(s.chainOrigins).length<=8&&Object.entries(s.chainOrigins).every(([id,o])=>s.players.some(p=>p.id===id)&&o&&(Object.hasOwn(CARD_MAP,o.kind)||o.kind===null&&typeof o.source==='string'&&o.source.length>0&&o.source.length<=80)&&(o.source===undefined||typeof o.source==='string'&&o.source.length<=80)&&(o.actor===null||s.players.some(p=>p.id===o.actor))&&(o.recordId===undefined||typeof o.recordId==='string'&&o.recordId.length<=100)),'铁索来源无效');
  const member=id=>s.players.some(p=>p.id===id),cards=ids=>Array.isArray(ids)&&ids.length<=deckFor(s.deckSet,s.ex).length&&new Set(ids).size===ids.length&&ids.every(id=>Object.hasOwn(CARD_BY_ID,id));
  const point=p=>p&&zones.has(p.zone)&&(p.owner===undefined||member(p.owner));
  const displayFields=p=>(p.prevention===undefined||['armor','skill'].includes(p.prevention))&&(p.preventionName===undefined||typeof p.preventionName==='string'&&p.preventionName.length<=40)&&(p.responseTo===undefined||['counter','slash','duel','aoe','save','borrow'].includes(p.responseTo))&&(p.duelSource===undefined||member(p.duelSource))&&(p.outcomes===undefined||Array.isArray(p.outcomes)&&p.outcomes.length<=8&&p.outcomes.every(r=>member(r.target)&&(r.source===null||member(r.source))&&Number.isInteger(r.amount)&&r.amount>0&&r.amount<=1000&&['normal','fire','thunder'].includes(r.nature)))&&[p.turnId,p.chainId,p.parentId,p.recordId,p.choiceId].every(v=>v===undefined||typeof v==='string'&&v.length<=100)&&(p.effectTarget===undefined||member(p.effectTarget))&&[p.actualTargets,p.canceledTargets,p.chainBefore,p.chainAfter].every(ids=>ids===undefined||Array.isArray(ids)&&ids.length<=8&&ids.every(member));
  if(s.cardEvents!==undefined){check(Array.isArray(s.cardEvents)&&s.cardEvents.length<=64&&JSON.stringify(s.cardEvents).length<=32000,'牌移动展示记录过大');check(s.cardEvents.every(e=>validPresentationStep(e.presentation)),'展示顺序无效');
    for(const e of s.cardEvents){check(e.origins===undefined||Array.isArray(e.origins)&&e.origins.length<=161&&e.origins.every(o=>o&&Object.keys(o).every(k=>['card','zone'].includes(k))&&Object.hasOwn(CARD_BY_ID,o.card)&&['hand','equip','wood'].includes(o.zone)),'材料来源无效');check(displayFields(e)&&(e.cause===undefined||e.cause===null||e.cause==='setup'),'展示关联无效');check(e&&typeof e.id==='string'&&e.id.length<=100&&/^\d+:\d+$/.test(e.id)&&Number.isSafeInteger(e.rev)&&e.rev>=0&&e.rev<=s.rev&&['move','play','judge','archive','effect','show'].includes(e.type)&&point(e.from)&&point(e.to),'牌移动展示记录无效');check(e.actor===null||member(e.actor),'牌移动展示席位无效');check(Number.isInteger(e.count)&&e.count>=0&&e.count<=deckFor(s.deckSet,s.ex).length&&cards(e.publicCards)&&e.privateCards&&Object.keys(e.privateCards).every(member)&&Object.values(e.privateCards).every(cards),'牌移动展示牌面无效');check(e.type==='play'?member(e.actor)&&Object.hasOwn(CARD_MAP,e.kind):!e.kind||Object.hasOwn(CARD_MAP,e.kind),'展示牌名无效');check(e.displayCount===undefined||e.type==='archive'&&Number.isSafeInteger(e.displayCount)&&e.displayCount>=e.count,'归档展示数量无效');check(e.movedCards===undefined||cards(e.movedCards)&&e.movedCards.length===e.count,'展示移动材料无效');check(e.publicCards.length<=e.count&&Object.values(e.privateCards).every(ids=>ids.length<=e.count),'展示数量无效');check(e.stage===undefined||['reveal','replace','replaced','result','active','canceled','resolved'].includes(e.stage),'判定展示阶段无效');check(e.response===undefined||typeof e.response==='boolean','打出展示标记无效');check(e.targets===undefined||Array.isArray(e.targets)&&e.targets.length<=8&&e.targets.every(member),'展示目标无效');}
    check(new Set(s.cardEvents.map(e=>e.id)).size===s.cardEvents.length,'牌移动展示编号重复');}
  if(s.lastPublicPlay!==undefined){check(s.lastPublicPlay&&typeof s.lastPublicPlay==='object'&&!Array.isArray(s.lastPublicPlay)&&Object.keys(s.lastPublicPlay).length<=8,'最近出牌记录无效');for(const [id,p]of Object.entries(s.lastPublicPlay))check(member(id)&&p&&Object.hasOwn(CARD_MAP,p.kind)&&cards(p.cards)&&(p.concealed===undefined||cards(p.concealed)&&p.concealed.every(id=>p.cards.includes(id)))&&Number.isSafeInteger(p.rev)&&p.rev>=0&&p.rev<=s.rev&&Number.isSafeInteger(p.round)&&p.round>=1&&typeof p.id==='string'&&p.id.length<=100&&/^\d+:\d+$/.test(p.id)&&Array.isArray(p.targets)&&p.targets.length<=8&&p.targets.every(member),'最近出牌记录损坏');}
  for(const history of [s.centerPlays,s.playHistory,s.turnLedger])if(history!==undefined){check(Array.isArray(history)&&(history===s.turnLedger||history.length<=160&&JSON.stringify(history).length<=65536),'出牌历史过大');for(const p of history)check(p&&displayFields(p)&&member(p.actor)&&Number.isSafeInteger(p.rev)&&p.rev>=0&&p.rev<=s.rev&&Number.isInteger(p.round)&&p.round>=1&&Object.hasOwn(CARD_MAP,p.kind)&&cards(p.cards)&&Array.isArray(p.targets)&&p.targets.every(member)&&typeof p.id==='string'&&p.id.length<=100&&(p.concealed===undefined||cards(p.concealed)&&p.concealed.every(id=>p.cards.includes(id))),'出牌历史无效');check(new Set(history.map(p=>p.id)).size===history.length,'出牌历史编号重复');}
  check(s.presentationResetRev===undefined||Number.isSafeInteger(s.presentationResetRev)&&s.presentationResetRev>=0&&s.presentationResetRev<=s.rev,'展示基线无效');
  check(s.presentationSeq===undefined||Number.isSafeInteger(s.presentationSeq)&&s.presentationSeq>=0,'展示序号无效');
}

export const displayTurn=s=>`${s.round}:${s.skillTurnNo||0}:${s.turn}`;
function projectPlay(p,viewer){return {responseTo:p.responseTo,duelSource:p.duelSource,outcomes:p.outcomes?.map(r=>({...r})),actualTargets:p.actualTargets?[...p.actualTargets]:undefined,canceledTargets:p.canceledTargets?[...p.canceledTargets]:undefined,id:p.id,actor:p.actor,rev:p.rev,round:p.round,kind:p.kind,turnId:p.turnId,cards:p.cards.filter(id=>p.actor===viewer||!p.concealed?.includes(id)),hiddenMaterials:p.actor===viewer?0:p.concealed?.length||0,targets:[...p.targets],response:!!p.response,chainId:p.chainId,parentId:p.parentId,effectTarget:p.effectTarget};}
function boundHistory(s){
  s.centerPlays=(s.turnLedger||s.centerPlays||[]).slice(-32);const counts={};s.playHistory=(s.playHistory||[]).slice().reverse().filter(p=>(counts[p.actor]=(counts[p.actor]||0)+1)<=20).reverse().slice(-160);
  for(const list of [s.centerPlays,s.playHistory])while(list.length&&JSON.stringify(list).length>65536)list.shift();
}
function archiveTurn(s){
  const turn=displayTurn(s);if(s.displayTurnId&&s.displayTurnId!==turn||s.status==='finished'){
    s.playHistory??=[];const groups=new Map();for(const p of s.turnLedger||s.centerPlays||[]){s.playHistory.push(p);if(!groups.has(p.actor))groups.set(p.actor,[]);groups.get(p.actor).push(p);}
    for(const [actor,list]of groups){const p=list.at(-1);emit(s,{type:'archive',actor,from:{zone:'center'},to:{zone:'history',owner:actor},kind:p.kind,recordId:p.id,count:Math.min(3,list.length),displayCount:list.length,publicCards:p.cards.filter(id=>!p.concealed?.includes(id)).slice(0,1),privateCards:{}});}s.centerPlays=[];s.turnLedger=[];
  }s.displayTurnId=turn;boundHistory(s);
}

// Public effect metadata contains only semantic relationships, never zone ownership.
export function recordEffect(s,e,stage='active',prevention=null,preventionName=null){
 if(!s.tableExperience)return;
 const p=(s.turnLedger||s.centerPlays||[]).findLast(p=>e.useKey?p.useKey===e.useKey:e.source===p.actor&&(e.cardKind===p.kind||e.card&&p.cards.includes(e.card)||e.type==='chain'&&p.kind==='tiesuo'));
 const kind=e.cardKind||p?.kind;if(!CARD_MAP[kind]&&!prevention)return;
 if(p&&e.redirected?.length)p.canceledTargets=[...new Set([...(p.canceledTargets||[]),...e.redirected])];
 if(p&&e.target){if(stage==='canceled'){p.canceledTargets=[...new Set([...(p.canceledTargets||[]),e.target])];}else{p.actualTargets=[...new Set([...(p.actualTargets||[]),e.target])];p.canceledTargets=(p.canceledTargets||[]).filter(id=>id!==e.target);}}
 if(p){const recent=s.centerPlays?.find(r=>r.id===p.id);if(recent&&recent!==p)Object.assign(recent,p);}
 emit(s,{type:'effect',actor:e.source||null,from:{zone:'center'},to:e.target?{zone:'judgeReveal',owner:e.target}:{zone:'center'},kind,recordId:p?.id,stage,...(e.chainBefore?{chainBefore:e.chainBefore,chainAfter:e.chainAfter}:{}),...(prevention?{prevention,...(preventionName?{preventionName}:{})}:{}),count:0,publicCards:[],privateCards:{},effectTarget:e.target,targets:e.victim?[e.victim]:undefined});
 if(e.type==='chain'&&e.target){s.chainOrigins??={};s.chainOrigins[e.target]={kind,actor:e.source||null,recordId:p?.id};}
}

export function projectHistoryPage(s,viewer,request){
 if(!s.players.some(p=>p.id===viewer))throw new Error('席位不存在');
 const ledger=s.turnLedger||s.centerPlays||[];
 if(!request||request.turnId!==displayTurn(s)||!Number.isSafeInteger(request.before)||request.before<0||request.before>ledger.length)throw new Error('回合记录页已失效');
 const end=request.before,start=Math.max(0,end-32),records=ledger.slice(start,end).map(p=>projectPlay(p,viewer));
 // Page at most 32 records and 64 KiB; never send internal material permissions.
 while(records.length&&new TextEncoder().encode(JSON.stringify(records)).length>65536)records.shift();
 return {turnId:displayTurn(s),before:end-records.length,total:ledger.length,records};
}

export function recordOutcome(s,e,amount){
 if(!s.tableExperience||!e.useKey||amount<=0)return;
 const p=(s.turnLedger||s.centerPlays||[]).findLast(p=>p.useKey===e.useKey);if(!p)return;
 p.outcomes=[...(p.outcomes||[]).filter(r=>r.target!==e.target),{target:e.target,source:e.source||null,amount,nature:e.nature||'normal'}].slice(-8);
 const recent=s.centerPlays?.find(r=>r.id===p.id);if(recent&&recent!==p)recent.outcomes=p.outcomes;return p.id;
}
