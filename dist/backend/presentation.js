import {storedCards} from './wood.js';
import {CARD_BY_ID,CARD_MAP,deckFor} from '../data/cards.js';

// Optional presentation metadata. Never a card zone or an authorization source.
const publicZones=new Set(['pool','discard','equip','judge','field','honor','duty','wound']);
const zones=new Set(['deck','discard','pool','hand','equip','judge','peek','commit','shelter','play','judgeReveal','field','honor','duty','wound','song','wood','center','history']);
const endpoint=(zone,owner)=>owner?{zone,owner}:{zone};
export const materialVisible=(s,id,viewer)=>!s.hiddenMaterials?.[id]||s.hiddenMaterials[id].owner===viewer||s.hiddenMaterials[id].viewers?.includes(viewer);
function revealMaterial(s,id){if(!s.hiddenMaterials?.[id])return;delete s.hiddenMaterials[id];for(const p of [...Object.values(s.lastPublicPlay||{}),...(s.centerPlays||[]),...(s.playHistory||[])])if(p.concealed)p.concealed=p.concealed.filter(c=>c!==id);}
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
function emit(s,data){s.presentationSeq=(s.presentationSeq||0)+1;const e={id:`${s.rev}:${s.presentationSeq}`,rev:s.rev,...data};s.cardEvents??=[];s.cardEvents.push(e);trim(s);return e;}
export function cardMotion(s,ids,from,to,{actor=null,publicFace=false,type='move',kind=null,stage=null,choiceId=null}={}){
  if(!ids.length)return;if(['discard','equip','judge','field','honor','duty','wound','judgeReveal'].includes(to.zone))for(const id of ids)revealMaterial(s,id);
  const open=to.zone!=='deck'&&(publicFace||publicZones.has(from.zone)||publicZones.has(to.zone)),publicCards=open?ids.filter(id=>!s.hiddenMaterials?.[id]):[],audience=[...new Set([from.owner,to.owner,...ids.flatMap(id=>s.hiddenMaterials?.[id]?[s.hiddenMaterials[id].owner,...(s.hiddenMaterials[id].viewers||[])]:[])].filter(Boolean))];
  const privateCards=Object.fromEntries(audience.map(viewer=>[viewer,ids.filter(id=>!publicCards.includes(id)&&(viewer===from.owner||viewer===to.owner||s.hiddenMaterials?.[id]&&materialVisible(s,id,viewer)))]).filter(([,cards])=>cards.length));
  for(const id of ids)if(s.hiddenMaterials?.[id]){s.hiddenMaterials[id].location={...to};s.hiddenMaterials[id].viewers=[...new Set([...(s.hiddenMaterials[id].viewers||[]),...audience.filter(viewer=>privateCards[viewer]?.includes(id))])];}
  return emit(s,{type,actor,from,to,cause:s.motionCause||null,count:ids.length,movedCards:[...ids],publicCards,privateCards,...(kind?{kind}:{}),...(stage?{stage}:{}),...(choiceId?{choiceId}:{})});
}
export function recordPlay(s,p,ids,kind,targets=[],response=false){
  archiveTurn(s);const counter=s.rules.pending?.kind==='counter'?s.rules.pending:null,q=s.rules.pending,parent=response&&!counter?(s.centerPlays||[]).findLast(r=>q?.useKey?r.useKey===q.useKey:r.cards.includes(q?.card)):null;
  const concealed=ids.filter(id=>s.hiddenMaterials?.[id]),e=emit(s,{type:'play',actor:p.id,from:endpoint(ids.length&&ids.every(id=>storedCards(p).includes(id))?'wood':'hand',p.id),to:endpoint('play',p.id),count:ids.length,kind,targets:[...targets],publicCards:ids.filter(id=>!concealed.includes(id)),privateCards:concealed.length?{[p.id]:concealed}:{},response,turnId:displayTurn(s),chainId:counter?.chainId,parentId:counter?.lastPlayId||parent?.id,effectTarget:counter?.effect.target});
  if(counter)counter.lastPlayId=e.id;
  s.lastPublicPlay??={};s.lastPublicPlay[p.id]={id:e.id,rev:s.rev,round:s.round,kind,cards:[...ids],targets:[...targets],response,...(concealed.length?{concealed}:{} )};
  s.centerPlays??=[];s.centerPlays.push({...s.lastPublicPlay[p.id],actor:p.id,turnId:displayTurn(s),useKey:`${s.rev}:${ids.join('.')}`,chainId:e.chainId,parentId:e.parentId,effectTarget:e.effectTarget});boundHistory(s);
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
}
export function projectPresentation(s,viewer){
  const q=s.rules.pending,represented=new Set([...(s.rules.resolving||[]),...(s.rules.market||[]),...(q?.kind==='judge'?[q.card]:[]),...(s.rules.lastResult?.kind==='pindian'?s.rules.lastResult.cards:[])]);
  return {publicTableCards:s.pool.filter(id=>!s.hiddenMaterials?.[id]&&!represented.has(id)),chainOrigins:Object.fromEntries(Object.entries(s.chainOrigins||{}).filter(([id])=>s.players.some(p=>p.id===id&&p.chained)).map(([id,o])=>[id,{kind:o.kind,actor:o.actor,source:o.source,recordId:o.recordId}])),centerPlays:(s.centerPlays||[]).map(p=>projectPlay(p,viewer)),playHistory:(s.playHistory||[]).map(p=>projectPlay(p,viewer)),presentationResetRev:s.presentationResetRev||0,cardEvents:(s.cardEvents||[]).map(e=>({id:e.id,rev:e.rev,type:e.type,actor:e.actor,from:endpoint(e.from.zone,e.from.owner),to:endpoint(e.to.zone,e.to.owner),count:e.count,kind:e.kind,stage:e.stage,targets:e.targets?[...e.targets]:undefined,response:e.response,cause:e.cause,choiceId:e.actor===viewer?e.choiceId:undefined,recordId:e.recordId,turnId:e.turnId,chainId:e.chainId,parentId:e.parentId,effectTarget:e.effectTarget,cards:[...(e.to.zone==='deck'?e.privateCards[viewer]||[]:[...new Set([...e.publicCards,...(e.privateCards[viewer]||[])])])]})),lastPublicPlay:Object.fromEntries(Object.entries(s.lastPublicPlay||{}).map(([id,p])=>[id,{id:p.id,rev:p.rev,round:p.round,kind:p.kind,cards:p.cards.filter(card=>id===viewer||!p.concealed?.includes(card)),hiddenMaterials:id===viewer?0:p.concealed?.length||0,materialCount:p.cards.length,targets:[...p.targets],response:!!p.response}]))};
}
export function validatePresentation(s,check){
  if(!s||!s.players)return;
  if(s.chainOrigins!==undefined)check(Object.keys(s.chainOrigins).length<=8&&Object.entries(s.chainOrigins).every(([id,o])=>s.players.some(p=>p.id===id)&&o&&(Object.hasOwn(CARD_MAP,o.kind)||o.kind===null&&typeof o.source==='string'&&o.source.length>0&&o.source.length<=80)&&(o.source===undefined||typeof o.source==='string'&&o.source.length<=80)&&(o.actor===null||s.players.some(p=>p.id===o.actor))&&(o.recordId===undefined||typeof o.recordId==='string'&&o.recordId.length<=100)),'铁索来源无效');
  const member=id=>s.players.some(p=>p.id===id),cards=ids=>Array.isArray(ids)&&ids.length<=deckFor(s.deckSet,s.ex).length&&new Set(ids).size===ids.length&&ids.every(id=>Object.hasOwn(CARD_BY_ID,id));
  const point=p=>p&&zones.has(p.zone)&&(p.owner===undefined||member(p.owner));
  const displayFields=p=>[p.turnId,p.chainId,p.parentId,p.recordId,p.choiceId].every(v=>v===undefined||typeof v==='string'&&v.length<=100)&&(p.effectTarget===undefined||member(p.effectTarget))&&[p.actualTargets,p.canceledTargets].every(ids=>ids===undefined||Array.isArray(ids)&&ids.length<=8&&ids.every(member));
  if(s.cardEvents!==undefined){check(Array.isArray(s.cardEvents)&&s.cardEvents.length<=64&&JSON.stringify(s.cardEvents).length<=32000,'牌移动展示记录过大');
    for(const e of s.cardEvents){check(displayFields(e)&&(e.cause===undefined||e.cause===null||e.cause==='setup'),'展示关联无效');check(e&&typeof e.id==='string'&&e.id.length<=100&&/^\d+:\d+$/.test(e.id)&&Number.isSafeInteger(e.rev)&&e.rev>=0&&e.rev<=s.rev&&['move','play','judge','archive','effect','show'].includes(e.type)&&point(e.from)&&point(e.to),'牌移动展示记录无效');check(e.actor===null||member(e.actor),'牌移动展示席位无效');check(Number.isInteger(e.count)&&e.count>=0&&e.count<=deckFor(s.deckSet,s.ex).length&&cards(e.publicCards)&&e.privateCards&&Object.keys(e.privateCards).every(member)&&Object.values(e.privateCards).every(cards),'牌移动展示牌面无效');check(e.type==='play'?member(e.actor)&&Object.hasOwn(CARD_MAP,e.kind):!e.kind||Object.hasOwn(CARD_MAP,e.kind),'展示牌名无效');check(e.movedCards===undefined||cards(e.movedCards)&&e.movedCards.length===e.count,'展示移动材料无效');check(e.publicCards.length<=e.count&&Object.values(e.privateCards).every(ids=>ids.length<=e.count),'展示数量无效');check(e.stage===undefined||['reveal','replace','replaced','result','active','canceled','resolved'].includes(e.stage),'判定展示阶段无效');check(e.response===undefined||typeof e.response==='boolean','打出展示标记无效');check(e.targets===undefined||Array.isArray(e.targets)&&e.targets.length<=8&&e.targets.every(member),'展示目标无效');}
    check(new Set(s.cardEvents.map(e=>e.id)).size===s.cardEvents.length,'牌移动展示编号重复');}
  if(s.lastPublicPlay!==undefined){check(s.lastPublicPlay&&typeof s.lastPublicPlay==='object'&&!Array.isArray(s.lastPublicPlay)&&Object.keys(s.lastPublicPlay).length<=8,'最近出牌记录无效');for(const [id,p]of Object.entries(s.lastPublicPlay))check(member(id)&&p&&Object.hasOwn(CARD_MAP,p.kind)&&cards(p.cards)&&(p.concealed===undefined||cards(p.concealed)&&p.concealed.every(id=>p.cards.includes(id)))&&Number.isSafeInteger(p.rev)&&p.rev>=0&&p.rev<=s.rev&&Number.isSafeInteger(p.round)&&p.round>=1&&typeof p.id==='string'&&p.id.length<=100&&/^\d+:\d+$/.test(p.id)&&Array.isArray(p.targets)&&p.targets.length<=8&&p.targets.every(member),'最近出牌记录损坏');}
  for(const history of [s.centerPlays,s.playHistory])if(history!==undefined){check(Array.isArray(history)&&history.length<=160&&JSON.stringify(history).length<=65536,'出牌历史过大');for(const p of history)check(p&&displayFields(p)&&member(p.actor)&&Number.isSafeInteger(p.rev)&&p.rev>=0&&p.rev<=s.rev&&Number.isInteger(p.round)&&p.round>=1&&Object.hasOwn(CARD_MAP,p.kind)&&cards(p.cards)&&Array.isArray(p.targets)&&p.targets.every(member)&&typeof p.id==='string'&&p.id.length<=100&&(p.concealed===undefined||cards(p.concealed)&&p.concealed.every(id=>p.cards.includes(id))),'出牌历史无效');}
  check(s.presentationResetRev===undefined||Number.isSafeInteger(s.presentationResetRev)&&s.presentationResetRev>=0&&s.presentationResetRev<=s.rev,'展示基线无效');
  check(s.presentationSeq===undefined||Number.isSafeInteger(s.presentationSeq)&&s.presentationSeq>=0,'展示序号无效');
}

const displayTurn=s=>`${s.skillTurnNo||0}:${s.turn}`;
function projectPlay(p,viewer){return {actualTargets:p.actualTargets?[...p.actualTargets]:undefined,canceledTargets:p.canceledTargets?[...p.canceledTargets]:undefined,id:p.id,actor:p.actor,rev:p.rev,round:p.round,kind:p.kind,turnId:p.turnId,cards:p.cards.filter(id=>p.actor===viewer||!p.concealed?.includes(id)),hiddenMaterials:p.actor===viewer?0:p.concealed?.length||0,targets:[...p.targets],response:!!p.response,chainId:p.chainId,parentId:p.parentId,effectTarget:p.effectTarget};}
function boundHistory(s){
  const currentCounts={};s.centerPlays=(s.centerPlays||[]).slice().reverse().filter(p=>(currentCounts[p.actor]=(currentCounts[p.actor]||0)+1)<=20).reverse().slice(-160);const counts={};s.playHistory=(s.playHistory||[]).slice().reverse().filter(p=>(counts[p.actor]=(counts[p.actor]||0)+1)<=20).reverse().slice(-160);
  for(const list of [s.centerPlays,s.playHistory])while(list.length&&JSON.stringify(list).length>65536)list.shift();
}
function archiveTurn(s){
  const turn=displayTurn(s);if(s.displayTurnId&&s.displayTurnId!==turn||s.status==='finished'){
    s.playHistory??=[];for(const p of s.centerPlays||[]){s.playHistory.push(p);emit(s,{type:'archive',actor:p.actor,from:{zone:'center'},to:{zone:'history',owner:p.actor},kind:p.kind,recordId:p.id,count:1,publicCards:p.cards.filter(id=>!p.concealed?.includes(id)).slice(0,1),privateCards:{}});}s.centerPlays=[];
  }s.displayTurnId=turn;boundHistory(s);
}

// Public effect metadata contains only semantic relationships, never zone ownership.
export function recordEffect(s,e,stage='active'){
 if(!s.tableExperience)return;
 const p=(s.centerPlays||[]).findLast(p=>e.useKey?p.useKey===e.useKey:e.source===p.actor&&(e.cardKind===p.kind||e.card&&p.cards.includes(e.card)||e.type==='chain'&&p.kind==='tiesuo'));
 const kind=e.cardKind||p?.kind;if(!CARD_MAP[kind])return;
 if(p&&e.redirected?.length)p.canceledTargets=[...new Set([...(p.canceledTargets||[]),...e.redirected])];
 if(p&&e.target){if(stage==='canceled'){p.canceledTargets=[...new Set([...(p.canceledTargets||[]),e.target])];}else{p.actualTargets=[...new Set([...(p.actualTargets||[]),e.target])];p.canceledTargets=(p.canceledTargets||[]).filter(id=>id!==e.target);}}
 emit(s,{type:'effect',actor:e.source||null,from:{zone:'center'},to:e.target?{zone:'judgeReveal',owner:e.target}:{zone:'center'},kind,recordId:p?.id,stage,count:0,publicCards:[],privateCards:{},effectTarget:e.target,targets:e.victim?[e.victim]:undefined});
 if(e.type==='chain'&&e.target){s.chainOrigins??={};s.chainOrigins[e.target]={kind,actor:e.source||null,recordId:p?.id};}
}
