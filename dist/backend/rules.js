import {experience,prepareBlindChoice,takeBlindChoice} from './interaction.js';
import {phaseToken} from './flow.js';
import {validateActiveIntent} from './skill-intent.js';
import {storedCards,isUsableHand,settleWood} from './wood.js';
import {tactile} from './flow.js';
import {slashTargetLimit,beforeWeaponSlash,weaponDamage,weaponDodged,equipmentTask,resolveEquipment,storeWood} from './equipment.js';
import {check,seat,alive,note,event,topCard,drawCards,hasSkill,equipKind,distance,attackRange,cardAttackRange,isSlash,natureOf,removeOwned,effectiveKind,CARD_BY_ID,CARD_MAP,cardLabel,red,randomIndex,unlimitedDistance,cardRedFor,cardSuitFor,skillGeneral,cardDistance} from './primitives.js';
import {startSkills,phaseSkills,leavePhaseSkills,resetTurnSkills,handLimit,drawPhaseCount,afterDamageSkills,afterDeathSkills,prepareUseSkills,processSkillTask,resolveSkill,resolveSkillJudge,activateSkill,stateOf,processSkillPick,prepareSkillSlash,afterSkillPindian,afterSkillUse,isJie as isJieSkill} from './skills.js';

import {recordPlay,cardMotion,endHiddenMaterials,settleHiddenMaterials,recordEffect} from './presentation.js';
import {complete,cs,special,specialCards,observeCompleteMoves,processComplete,beforeCompleteDamage,completeDying,completeBeforeEffect,completeResponse,activateComplete,completePhase,beginBluff,completeFlip,nextCompleteTurn,completeHandUse,completeFinishedCards} from './complete-skills.js';
export const freshRules=()=>({pending:null,queue:[],resolving:[],market:[],commits:{},slash:0,slashPlayed:0,wineUsed:false,drank:0,skipDraw:false,skipPlay:false,lastResult:null});
const active=s=>s.mode==='auto';
const idle=s=>{check(!s.flow?.opening,'开局发牌展示尚未结束');check(!s.rules.pending&&!s.rules.queue.length,'请先完成当前响应');};
function playPhase(s,p){check(s.turn===p.id&&s.phase===3,'请在自己的出牌阶段使用');check(!p.dead&&p.hp>0,'当前不能出牌');}
const handCount=p=>p.hand?.length??p.handCount??0;
const attackAllowed=(s,a,b,ids=[])=>{check(b&&a.id!==b.id&&!b.dead,'请选择其他存活角色');check(unlimitedDistance(s,a,b,ids,'sha')||cardDistance(s,a,b,ids)<=cardAttackRange(s,a,ids),'目标超出攻击范围');check(!(hasSkill(b,'空城')&&!handCount(b)),'空城：不能指定该目标');};
function useCards(s,p,ids,kind,targets=[]){completeHandUse(s,p,ids,kind);recordPlay(s,p,ids,kind,targets.map(t=>t.id));if(ids.length)removeOwned(s,p,ids,{reason:'use'});s.pool.push(...ids);s.rules.resolving.push(...ids);prepareUseSkills(s,p,kind,ids,targets,false);note(s,ids.some(id=>s.hiddenMaterials?.[id])?`${p.name} 使用扣置的「${CARD_MAP[kind].name}」。`:ids.length?`${p.name} 使用 ${ids.map(cardLabel).join('、')}${kind!==CARD_BY_ID[ids[0]].kind?`（${CARD_MAP[kind].name}）`:''}。`:`${p.name} 视为使用「${CARD_MAP[kind].name}」，不生成实体牌。`);}
function discardResponse(s,p,ids,kind=null){completeResponse(s,p,ids,kind||CARD_BY_ID[ids[0]].kind,s.rules.pending||{});recordPlay(s,p,ids,kind||CARD_BY_ID[ids[0]].kind,[],true);cardMotion(s,ids,{zone:'play',owner:p.id},{zone:'discard'},{actor:p.id,publicFace:true});removeOwned(s,p,ids,{reason:'use'});s.discard.push(...ids);note(s,`${p.name} 打出 ${ids.map(cardLabel).join('、')}。`);}
function finishSelectedCards(s,ids){
  const finished=[];for(const id of ids){const i=s.pool.indexOf(id);if(i>=0){s.pool.splice(i,1);s.discard.push(id);finished.push(id);cardMotion(s,[id],{zone:'pool'},{zone:'discard'},{publicFace:true,actor:Object.entries(s.lastPublicPlay||{}).find(([,p])=>p.cards.includes(id))?.[0]||null});}}
  s.rules.resolving=s.rules.resolving.filter(id=>!ids.includes(id));s.rules.market=s.rules.market.filter(id=>!ids.includes(id));return finished;
}
function finishCards(s){const ids=[...s.rules.resolving,...s.rules.market],finished=finishSelectedCards(s,ids);completeFinishedCards(s,finished);settleHiddenMaterials(s);endHiddenMaterials(s,Object.keys(s.hiddenMaterials||{}));}

function pending(s,value){if(experience(s)&&['chooseCard','market'].includes(value.kind))value.windowId=`${s.rev}:pick:${crypto.randomUUID()}`;s.rules.pending=value;prepareBlindChoice(s,value);}
function order(s,start=s.turn){const list=alive(s).map(p=>p.id),i=Math.max(0,list.indexOf(start));return [...list.slice(i),...list.slice(0,i)];}
function endGame(s){
  const live=alive(s),lord=s.players.find(p=>p.role==='lord');let winner=null;
  if(lord.dead)winner=live.length===1&&live[0].role==='spy'?'内奸':'反贼';
  else if(!live.some(p=>p.role==='rebel'||p.role==='spy'))winner='主忠';
  if(winner){s.status='finished';s.winner=winner;s.rules.pending=null;s.rules.queue=[];finishCards(s);note(s,`${winner} 获胜。`);}
}
function death(s,p,source){
  p.dead=true;p.roleOpen=true;const privateCards=s.peek[p.id]||[],grave=[...p.hand,...p.equip,...p.judge,...privateCards,...(p.skillState?.shelter||[]),...specialCards(p),...(p.skillState?.concealed||[])];s.peek[p.id]=[];s.discard.push(...grave);p.hand=[];p.equip=[];p.judge=[];settleWood(s);if(p.skillState){p.skillState.shelter=[];p.skillState.zones={};p.skillState.concealed=[];}
  note(s,`${p.name} 阵亡（${{lord:'主公',loyal:'忠臣',rebel:'反贼',spy:'内奸'}[p.role]}）。`);
  const killer=s.players.find(x=>x.id===source&&!x.dead);
  afterDeathSkills(s,p,killer,grave);
  if(killer&&p.role==='rebel'){drawCards(s,killer,3);note(s,`${killer.name} 击杀反贼，摸3张牌。`);}
  if(killer?.role==='lord'&&p.role==='loyal'){s.discard.push(...killer.hand,...killer.equip);killer.hand=[];killer.equip=[];note(s,'主公误杀忠臣，弃置全部手牌和装备。');}
  endGame(s);
}
function wounded(s,p,source){
  if(p.hp>0||p.dead)return;
  if(completeDying(s,p,source))return;
  const saviors=order(s).filter(id=>!s.skillAutomation||!hasSkill(seat(s,s.turn),'完杀')||id===s.turn||id===p.id);pending(s,{kind:'save',target:p.id,source,saviors,index:0,player:saviors[0]});note(s,`${p.name} 濒死，等待求桃。`);
}
function armorDamage(s,p,n,nature,ignoreArmor){
  if(ignoreArmor)return n;const armor=equipKind(p,'armor');
  if(armor==='tengjia'&&nature==='fire')n++;
  if(armor==='baiyin')n=Math.min(n,1);return n;
}
function damage(s,e){
  let {source,target,amount=1,nature='normal',ignoreArmor=false,chain=false,slash=false,card=null,color=null,duel=false,cards=null,useKey=null,wine=false}=e;
  const p=seat(s,target);if(p.dead)return;
  if(s.skillAutomation&&stateOf(p).marks.orange>0&&alive(s).some(t=>hasSkill(t,'怀橘'))){stateOf(p).marks.orange--;note(s,`${p.name} 移去一橘，防止本次伤害。`);return;}
  if(!e.completeDamage&&!e.weaponModifiersDone&&s.skillAutomation&&source){const a=seat(s,source);if((slash||duel)&&stateOf(a).marks.bare&&(isJieSkill(a)||s.turn===a.id))amount++;if(complete(s)&&slash&&stateOf(a).turn.yijueTarget===p.id&&cards?.some(id=>cardSuitFor(a,CARD_BY_ID[id])==='H'))amount++;}
  if(!e.completeDamage&&!e.weaponModifiersDone&&slash&&source&&equipKind(seat(s,source),'weapon')==='guding'&&!p.hand.length)amount++;
  if(s.skillAutomation&&slash&&wine&&source&&hasSkill(seat(s,source),'酒池'))stateOf(seat(s,source)).turn.benghuaiDisabled=true;
  if(weaponDamage(s,{...e,type:'damage',amount,weaponModifiersDone:true},'prevent'))return;const n=e.completeDamage?amount:armorDamage(s,p,amount,nature,ignoreArmor);if(beforeCompleteDamage(s,{...e,type:'damage',amount:n}))return;if(weaponDamage(s,{...e,type:'damage',amount:n,completeDamage:true},'cause'))return;p.hp-=n;event(s,'damage',{player:p.id,source,amount:n,nature});note(s,`${p.name} 受到${nature==='fire'?'火焰':nature==='thunder'?'雷电':''}伤害 ${n}（${p.hp}/${p.maxHp}）。`);
  if(nature!=='normal'&&p.chained&&!chain){const others=alive(s).filter(x=>x.id!==p.id&&x.chained);for(const x of [p,...others])x.chained=false;
    s.rules.queue.unshift(...others.map(x=>({type:'damage',source,target:x.id,amount:n,nature,chain:true})));}
  wounded(s,p,source);
  if(s.skillAutomation&&useKey){s.skillUseDamage??={};s.skillUseDamage[useKey]=(s.skillUseDamage[useKey]||0)+n;}afterDamageSkills(s,{source,target,amount:n,card,cards,kind:slash?'sha':duel?'juedou':null,color,useKey});
}
function counter(s,effect){
 const play=(s.centerPlays||[]).findLast(p=>effect.useKey?p.useKey===effect.useKey:p.actor===effect.source&&p.kind===effect.cardKind),basePlayId=play?.id||`${s.rev}:effect:${s.rules.queue.length}`;
 pending(s,{kind:'counter',chainId:`${s.rev}:chain:${s.rules.queue.length}`,basePlayId,lastPlayId:basePlayId,windowId:`${s.rev}:counter:${s.rules.queue.length}`,player:null,effect,passed:[],negated:false,players:order(s)});
}

export function canCounter(s,p,q=s.rules.pending){
 if(!q||q.kind!=='counter'||p.dead||!q.players.includes(p.id))return false;
 if(s.skillAutomation&&p.skillState?.turn?.noMoreUse)return false;
 for(const id of [...(p.hand||[]),...storedCards(p),...p.equip])for(const as of [null,'wuxie'])try{validateResponse(s,p,{cards:[id],as});return true;}catch{}
 return !!(s.completeSkills&&s.skillAutomation&&hasSkill(p,'蛊惑')&&!p.skillState?.used['蛊惑']&&p.hand?.length&&!p.skillState?.turn?.handBlocked);
}
function settleCounter(s){
 const q=s.rules.pending;if(!experience(s)||q?.kind!=='counter')return false;
 if(q.players.some(id=>!q.passed.includes(id)&&canCounter(s,seat(s,id),q)))return false;
 recordEffect(s,q.effect,q.negated?'canceled':'resolved');
 s.rules.pending=null;if(!q.negated)s.rules.queue.unshift(q.effect);else if(q.effect.type==='judge'&&q.effect.delayed)clearDelayed(s,seat(s,q.effect.target),q.effect.delayed,q.effect.purpose,q.effect.purpose==='shandian');return true;
}
function openJudge(s,e){
 const p=seat(s,e.target),card=topCard(s);if(!card){note(s,'牌堆暂无可判定牌，本次判定无法执行。');return;}
 s.pool.push(card);pending(s,{kind:'judge',player:p.id,card,purpose:e.purpose||'generic',delayed:e.delayed||null,skillInfo:e.skillInfo||null});note(s,`${p.name} 判定：${cardLabel(card)}。`);
}

export function pump(s){
  let limit=0;
  observeCompleteMoves(s);prepareBlindChoice(s,s.rules.pending);settleCounter(s);
  while(!s.rules.pending&&s.rules.queue.length&&s.status==='playing'){
    check(++limit<100,'结算队列异常');const e=s.rules.queue.shift();
    if(e.target&&seat(s,e.target).dead&&e.type!=='completeShenshiDeath')continue;
    if(s.skillAutomation&&e.target){const t=seat(s,e.target);if(e.cardKind&&hasSkill(t,'帷幕')&&e.cards?.length&&!e.cards.some(id=>s.hiddenMaterials?.[id])&&e.cards.every(id=>!cardRedFor(seat(s,e.source),CARD_BY_ID[id]))){note(s,`${t.name} 的帷幕使黑色锦囊对其无效。`);continue;}
      if(['slash','duel'].includes(e.type)&&(!complete(s)||e.type!=='slash'||e.skillPrepared)&&hasSkill(t,'父荫')&&!e.fuyinChecked){e.fuyinChecked=true;const st=stateOf(t);if(!st.turn.fuyinSeen){st.turn.fuyinSeen=true;if((e.targetHand??t.hand.length)<=(e.sourceHand??handCount(seat(s,e.source)))){note(s,`${t.name} 的父荫使本回合首次杀或决斗对其无效。`);continue;}}}
    }
    if(completeBeforeEffect(s,e)){if(s.completeUses?.[e.useKey]?.nullTargets?.includes(e.target))recordEffect(s,e,'canceled');continue;}
    if(e.counter){const effect={...e};delete effect.counter;counter(s,effect);if(settleCounter(s))continue;break;}
    const p=e.target?seat(s,e.target):null;
    if(e.type!=='heal'&&(e.cardKind||['slash','chain','borrow','fire','aoe'].includes(e.type)))recordEffect(s,e,'active');
    if(s.skillAutomation&&p?.general==='jie_luxun'&&hasSkill(p,'谦逊')&&p.hand.length&&e.source&&e.source!==p.id&&['steal','dismantle','duel','fire'].includes(e.type)&&!e.qianxunOffered){e.qianxunOffered=true;s.rules.queue.unshift(e);processSkillTask(s,{type:'skillTask',owner:p.id,skill:'谦逊',stage:'decision',info:{stage:'qianxun'}});continue;}
    switch(e.type){
      case 'slash':{
        if(prepareSkillSlash(s,e))break;
        const flags=s.skillFlags?.[e.skillKey];if(flags?.cancel)break;if(flags){e.noDodge=flags.noDodge;e.amount=(e.amount||1)+(flags.extraDamage||0);delete s.skillFlags[e.skillKey];}
        if(s.skillAutomation){const src=seat(s,e.source);if(stateOf(src).turn.zhangjiang&&e.color==='red')e.noDodge=true;}

        if(beforeWeaponSlash(s,e))break;
        if(!e.ignoreArmor&&(equipKind(p,'armor')==='renwang'&&(e.color||(!red(CARD_BY_ID[e.card])?'black':'red'))==='black'||equipKind(p,'armor')==='tengjia'&&e.nature==='normal')){note(s,`${p.name} 的防具抵消杀。`);break;}
        if(e.noDodge){s.rules.queue.unshift({...e,type:'damage',slash:true});break;}
        const a=seat(s,e.source),double=hasSkill(a,'无双')||s.skillAutomation&&(hasSkill(a,'肉林')&&GENERAL_MAP[p.skillState?.avatar?.general||p.general]?.gender==='女'||hasSkill(p,'肉林')&&GENERAL_MAP[a.skillState?.avatar?.general||a.general]?.gender==='女');pending(s,{kind:'slash',player:p.id,required:'shan',remaining:double?2:1,...e});break;
      }
      case 'duel':pending(s,{kind:'duel',player:p.id,opponent:e.source,source:e.source,required:'sha',remaining:hasSkill(seat(s,e.source),'无双')?2:1,card:e.card,cards:e.cards,useKey:e.useKey});break;
      case 'aoe':if(equipKind(p,'armor')==='tengjia'||s.skillAutomation&&e.kind==='nanman'&&(hasSkill(p,'祸首')||hasSkill(p,'巨象'))){note(s,`${p.name} 的防具或技能抵消${e.kind==='nanman'?'南蛮入侵':'万箭齐发'}。`);break;}if(s.skillAutomation&&e.kind==='nanman'){const owner=alive(s).find(t=>hasSkill(t,'祸首'));if(owner)e.source=owner.id;}if(e.unrespondable){s.rules.queue.unshift({...e,type:'damage',amount:1});break;}pending(s,{kind:'aoe',player:p.id,required:e.kind==='nanman'?'sha':'shan',source:e.source,remaining:1,card:e.card,cards:e.cards,useKey:e.useKey,cardKind:e.kind,luanji:!!e.luanji});break;
      case 'draw':note(s,`${p.name} 摸 ${drawCards(s,p,e.n)} 张牌。`);break;
      case 'heal':{const before=p.hp;p.hp=Math.min(p.maxHp,p.hp+1);if(p.hp>before)event(s,'heal',{player:p.id,amount:p.hp-before});note(s,`${p.name} 回复体力至 ${p.hp}。`);break;}
      case 'damage':damage(s,e);break;
      case 'chain':if(s.skillAutomation&&hasSkill(p,'谦节')){note(s,`${p.name} 的谦节防止横置。`);break;}p.chained=!p.chained;note(s,`${p.name} ${p.chained?'横置':'重置'}武将牌。`);break;
      case 'steal':case 'dismantle':if(p.hand.length+p.equip.length+p.judge.length)pending(s,{kind:'chooseCard',player:e.source,target:e.target,operation:e.type});break;
      case 'fire':if(p.hand.length)pending(s,{kind:'fireShow',player:p.id,source:e.source,target:p.id,useKey:e.useKey});break;
      case 'borrow':pending(s,{kind:'borrow',player:p.id,source:e.source,target:e.victim,required:'sha',remaining:1});break;
      case 'market':if(s.rules.market.length)pending(s,{kind:'market',player:p.id,available:[...s.rules.market]});break;
      case 'delay':{const owner=seat(s,e.owner),i=s.pool.indexOf(e.card);if(i>=0)s.pool.splice(i,1);owner.judge.push(e.card);s.delayKinds[e.card]=e.kind;(s.delaySources??={})[e.card]=e.source;note(s,`${owner.name} 判定区加入${CARD_MAP[e.kind].name}。`);break;}
      case 'judge':{
        if(experience(s)){s.flow.needsContinue=phaseToken(s);pending(s,{kind:'judgeAwait',windowId:`${s.rev}:judge:${crypto.randomUUID()}`,player:e.target,purpose:e.purpose||'generic',delayed:e.delayed||null,internal:e});}
        else openJudge(s,e);break;
      }
      case 'baguaResult':{
        const response=e.resume,before=[...s.rules.queue];
        if(e.success){response.remaining--;response.baguaUsed=false;if(hasSkill(p,'雷击')&&s.skillAutomation)s.rules.queue.unshift({type:'skillTask',owner:p.id,skill:'雷击'});}
        if(response.remaining<=0&&response.kind==='slash')weaponDodged(s,response);
        if(response.remaining>0)s.rules.queue.splice(e.success&&hasSkill(p,'雷击')&&s.skillAutomation?1:0,0,{type:'resumeResponse',target:p.id,response});
        settleResponseSkills(s,before);break;
      }
      case 'resumeResponse':pending(s,e.response);break;
      case 'equipmentTask':equipmentTask(s,e);break;
      case 'equipmentSlash':{const actor=seat(s,e.owner),victim=seat(s,e.target),rest=s.rules.queue,key=`${s.rev}:${e.cards.join('.')}`;s.rules.queue=[];if(e.provided){check(e.cards.every(id=>s.pool.includes(id)),'盟友提供的杀已移动');recordPlay(s,actor,e.cards,e.kind,[victim.id]);prepareUseSkills(s,actor,e.kind,e.cards,[victim],false);}else useCards(s,actor,e.cards,e.kind,[victim]);const color=e.cards.every(id=>cardRedFor(actor,CARD_BY_ID[id]))?'red':e.cards.every(id=>!cardRedFor(actor,CARD_BY_ID[id]))?'black':'none';s.rules.queue.push({type:'slash',source:actor.id,target:victim.id,card:e.cards[0],cards:e.cards,amount:1,nature:natureOf(e.kind),color,useKey:key,sourceHand:actor.hand.length,targetHand:victim.hand.length,ignoreArmor:equipKind(actor,'weapon')==='qinggang'},{type:'skillAfterUse',owner:actor.id,kind:e.kind,cards:e.cards,targets:[victim.id],useKey:key},{type:'completeFinishUse',cards:e.cards},...rest);break;}
      case 'skillTask':processSkillTask(s,e);break;
      case 'completeSkill':processComplete(s,e);break;
      case 'completeRescueOffer':processComplete(s,{owner:e.owner,skill:'救援',data:{lord:e.lord}});break;
      case 'completeClearDying':delete cs(seat(s,e.owner)).marks.buquDying;break;
      case 'completeTianxiangDraw':{const t=seat(s,e.owner);if(!t.dead)drawCards(s,t,Math.min(5,t.maxHp-t.hp));break;}
      case 'completeShenshiDeath':if(seat(s,e.target).dead)s.rules.queue.unshift({type:'completeSkill',owner:e.owner,skill:'审时补牌'});break;
      case 'completeEquip':{const actor=seat(s,e.owner),id=e.card,slot=CARD_MAP[CARD_BY_ID[id].kind].slot;if(!actor.hand.includes(id)||cs(actor).abolished.includes(slot))break;const old=actor.equip.filter(c=>CARD_MAP[CARD_BY_ID[c].kind].slot===slot);if(old.length){removeOwned(s,actor,old);s.discard.push(...old);}removeOwned(s,actor,[id],{reason:'use'});actor.equip.push(id);recordPlay(s,actor,[id],CARD_BY_ID[id].kind,[actor.id]);break;}
      case 'completeVirtualSlash':{const actor=seat(s,e.owner),victim=seat(s,e.target);check(!(hasSkill(victim,'空城')&&!victim.hand.length),'空城：不能指定该目标');prepareUseSkills(s,actor,'sha',[],[victim]);s.rules.queue.push({type:'slash',source:actor.id,target:victim.id,cards:[],amount:1,nature:'normal'},{type:'skillAfterUse',owner:actor.id,kind:'sha',cards:[],targets:[victim.id]});break;}
      case 'completeUseField':useCard(s,seat(s,e.owner),{cards:[e.card],as:'shun',targets:[e.target]},'shun');break;
      case 'completeBluffValidate':{const actor=seat(s,e.owner);if(e.resume){s.rules.pending=e.resume;validateResponse(s,actor,{cards:e.cards,as:e.kind},e.kind);s.rules.pending=null;}else validateUse(s,actor,{cards:e.cards,as:e.kind,targets:e.targets},e.kind,{bluff:true});beginBluff(s,e);break;}
      case 'completeBluffUse':{const actor=seat(s,e.owner);if(e.resume){s.rules.pending=e.resume;ruleAction(s,actor,{type:'respond',cards:e.cards,as:e.kind},e.kind);}else useCard(s,actor,{cards:e.cards,as:e.kind,targets:e.targets},e.kind,{bluff:true});break;}
      case 'completeFinishUse':completeFinishedCards(s,finishSelectedCards(s,e.cards),e.cards);settleHiddenMaterials(s);endHiddenMaterials(s,e.cards);break;
      case 'completePhaseBody':enterPhaseBody(s,seat(s,e.owner));break;
      case 'completePhaseSkills':completePhase(s,seat(s,e.owner),e.phase,true);break;
      case 'skillAfterUse':afterSkillUse(s,e);break;
      case 'skillVirtualUse':{const actor=seat(s,e.source);for(const id of e.cards){const at=s.pool.indexOf(id);check(at>=0,'盟友提供的牌已移动');s.pool.splice(at,1);actor.hand.push(id);}useCard(s,actor,{cards:e.cards,as:e.kind,targets:[e.target]},e.kind);break;}
      case 'skillFreeUse':useCard(s,seat(s,e.source),{cards:[],as:e.kind,targets:e.targets},e.kind);break;
      case 'skillGuose':useCard(s,seat(s,e.source),{cards:e.cards,as:'le',targets:[e.target]});break;
      case 'skillPick':processSkillPick(s,e);break;
      case 'checkDying':wounded(s,p,e.source);break;
      case 'phaseAdvance':advancePhase(s,seat(s,e.actor),e.nextTurn,true);break;
      case 'drawPhase':{const count=drawPhaseCount(s,p);if(tactile(s)&&count>0){s.flow.draw={id:`${s.rev}:draw`,player:p.id,remaining:count};break;}note(s,`${p.name} 摸 ${drawCards(s,p,count)} 张牌。`);if(stateOf(p).turn.haoshi&&p.hand.length>5){const min=Math.min(...alive(s).filter(t=>t.id!==p.id).map(t=>t.hand.length));s.rules.queue.unshift({type:'skillTask',owner:p.id,skill:'好施',stage:'haoshiGive',info:{targets:alive(s).filter(t=>t.id!==p.id&&t.hand.length===min).map(t=>t.id),n:Math.floor(p.hand.length/2)}});}break;}
    }
    observeCompleteMoves(s);prepareBlindChoice(s,s.rules.pending);settleCounter(s);
  }
  if(!s.rules.pending&&!s.rules.queue.length){finishCards(s);observeCompleteMoves(s);if(s.rules.queue.length&&s.status==='playing')pump(s);}
}
function commitPindian(s,p,id){
  const q=s.rules.pending;check(q.kind==='pindian'&&q.players.includes(p.id),'你不参与此次拼点');check(!s.rules.commits[p.id],'你已经选牌');removeOwned(s,p,[id],{handOnly:true,reason:'use'});s.rules.commits[p.id]=[id];note(s,`${p.name} 已选择拼点牌。`);
  if(q.players.every(id=>s.rules.commits[id])){
    const [a,b]=q.players.map(id=>seat(s,id)),[ca,cb]=q.players.map(id=>s.rules.commits[id][0]);s.pool.push(ca,cb);s.rules.commits={};
    s.rules.lastResult={id:`${s.rev}:pindian`,kind:'pindian',source:a.id,target:b.id,cards:[ca,cb],winner:CARD_BY_ID[ca].rank>CARD_BY_ID[cb].rank?a.id:null};
    note(s,`拼点：${a.name} ${cardLabel(ca)} / ${b.name} ${cardLabel(cb)}；${CARD_BY_ID[ca].rank>CARD_BY_ID[cb].rank?a.name+' 胜':a.name+' 未赢'}。`);s.rules.pending=null;afterSkillPindian(s,q,a,b,ca,cb,CARD_BY_ID[ca].rank>CARD_BY_ID[cb].rank?a.id:null);
  }
}
export function cancelResolution(s){
  if(s.flow){delete s.flow.draw;s.flow.paused=true;}
  for(const [id,cards]of Object.entries(s.rules.commits))seat(s,id).hand.push(...cards);
  for(const p of s.players)if(p.skillState?.concealed?.length){p.hand.push(...p.skillState.concealed);p.skillState.concealed=[];}
  s.rules.privateChoices={};s.rules.commits={};s.rules.pending=null;s.rules.queue=[];s.rules.resolving=[];s.rules.market=[];
}
function clearDelayed(s,p,id,purpose,passLightning=false){
  const i=p.judge.indexOf(id);check(i>=0,'延时牌已被移动');p.judge.splice(i,1);delete s.delayKinds[id];
  if(purpose==='shandian'&&passLightning){const seq=order(s,p.id);const next=seq.slice(1).concat(p.id).map(id=>seat(s,id)).find(x=>!x.judge.some(id=>(s.delayKinds[id]||CARD_BY_ID[id].kind)==='shandian'));
    if(next){next.judge.push(id);s.delayKinds[id]='shandian';note(s,`闪电传给 ${next.name}。`);}else s.discard.push(id);
  }else s.discard.push(id);
  if(s.discard.includes(id)&&s.delaySources)delete s.delaySources[id];
}
function confirmJudge(s,q){
  const p=seat(s,q.player),raw=CARD_BY_ID[q.card],c=s.skillAutomation&&hasSkill(p,'红颜')&&raw.suit==='S'?{...raw,suit:'H'}:raw,success=q.purpose==='le'?c.suit==='H':q.purpose==='bingliang'?c.suit==='C':q.purpose==='shandian'?c.suit==='S'&&c.rank>=2&&c.rank<=9:q.purpose==='bagua'?red(c):null;
  s.rules.lastResult={id:`${s.rev}:judge`,kind:'judge',player:q.player,card:q.card,purpose:q.purpose,success};
  if(q.delayed){clearDelayed(s,p,q.delayed,q.purpose,q.purpose==='shandian'&&!success);
    if(q.purpose==='le'&&!success)s.rules.skipPlay=true;if(q.purpose==='bingliang'&&!success)s.rules.skipDraw=true;if(q.purpose==='shandian'&&success)s.rules.queue.unshift({type:'damage',target:p.id,source:null,amount:3,nature:'thunder'});
  }
  resolveSkillJudge(s,q,CARD_BY_ID[q.card]);
  const at=s.pool.indexOf(q.card);if(at>=0){s.pool.splice(at,1);s.discard.push(q.card);}note(s,`${p.name} 的${q.purpose==='generic'?'判定':CARD_MAP[q.purpose]?.name||'技能判定'}生效${success===null?'':success?'（命中条件）':'（未命中条件）'}。`);s.rules.pending=null;
  const reactions=[];
  if(s.skillAutomation&&hasSkill(p,'天妒')&&s.discard.includes(q.card))reactions.push({type:'skillTask',owner:p.id,skill:'天妒',info:{card:q.card}});
  if(s.skillAutomation&&!red(c)&&GENERAL_MAP[p.skillState?.avatar?.general||p.general]?.faction==='魏')for(const lord of alive(s).filter(t=>t.id!==p.id&&t.role==='lord'&&hasSkill(t,'颂威')))reactions.push({type:'skillTask',owner:p.id,skill:'颂威',info:{lord:lord.id}});
  if(q.purpose==='bagua')reactions.push({type:'baguaResult',target:p.id,resume:q.skillInfo.resume,success});
  s.rules.queue.unshift(...reactions);
}
// Pure validation shared by authoritative actions and the visible-state UI advisor.
export function validateUse(s,p,a,virtualKind=null,{bluff=false}={}){
  check(s.status==='playing','请先开始对局');if(virtualKind)check(!s.rules.pending,'请先完成当前响应');else idle(s);playPhase(s,p);const ids=a.cards;check(Array.isArray(ids)&&(ids.length>0||virtualKind)&&new Set(ids).size===ids.length,'请选择有效卡牌');
  check(ids.every(id=>isUsableHand(p,id)||p.equip.includes(id)),'卡牌不属于你的可用牌区');
  const kind=virtualKind||effectiveKind(p,ids,a.as||null),def=CARD_MAP[kind];
  if(s.skillAutomation){const st=stateOf(p);check(!st.turn.noMoreUse,'往烈：本回合不能再使用牌');check(!st.turn.handBlocked||ids.every(id=>!p.hand.includes(id)),'本回合不能使用或打出手牌');check(!def.slot||!st.abolished.includes(def.slot),'此装备栏已经废除');}
  check(!['shan','wuxie'].includes(kind),'该牌用于响应');check(!def.manual||s.equipmentAutomation&&kind==='muniu','该牌请手动结算');
  if(!virtualKind&&a.as==='tao'&&ids.length&&CARD_BY_ID[ids[0]].kind!=='tao')check(s.turn!==p.id,'急救只能在回合外使用');
  if(s.skillAutomation&&skillGeneral(p,'国色')==='jie_daqiao'&&a.as==='le')check(!stateOf(p).used.guose,'本阶段已发动国色');
  if(!a.as)check(ids.every(id=>isUsableHand(p,id)),'请从手牌使用，装备区牌仅可用于合法转化');
  const raw=a.targets||[a.target||p.id];check(Array.isArray(raw)&&new Set(raw).size===raw.length,'目标重复');
  const targets=raw.map(id=>seat(s,id)),max=isSlash(kind)?slashTargetLimit(s,p,ids):s.skillAutomation&&kind==='tiesuo'&&hasSkill(p,'连环')?3:s.skillAutomation&&isSlash(kind)&&stateOf(p).turn.tianyi===true?2:2;check(targets.length>=1&&targets.length<=max,max===1?'此牌只需一个目标':'目标数量不符');check(targets.every(t=>!t.dead),'目标已经阵亡');const t=targets[0];
  check(['tiesuo','jiedao'].includes(kind)||isSlash(kind)&&slashTargetLimit(s,p,ids)>1||targets.length===1,'此牌只需一个目标');
  if(s.skillAutomation){
    for(const victim of targets){
      if(!bluff&&!['nanman','wanjian','taoyuan','wugu'].includes(kind)&&CARD_MAP[kind].type!=='基本'&&!CARD_MAP[kind].slot&&hasSkill(victim,'帷幕')&&!ids.some(id=>s.hiddenMaterials?.[id])&&ids.every(id=>!cardRedFor(p,CARD_BY_ID[id])))throw new Error('帷幕：不能成为黑色锦囊目标');
      if(['le','bingliang','shandian'].includes(kind))check(!hasSkill(victim,'谦节')&&!stateOf(victim).abolished.includes('judge'),'目标不能放置延时锦囊');
      if(hasSkill(p,'掣政')&&victim.id!==p.id)check(distance(s,victim.id,p.id)<=attackRange(victim),'掣政：目标攻击范围不含你');
      check(!stateOf(p).turn.noTargets?.includes(victim.id),'拒战：本回合不能再对该角色用牌');
    }
    if(isSlash(kind))for(const owner of alive(s).filter(t=>hasSkill(t,'同疾')&&t.hand.length>t.hp&&t.id!==p.id&&distance(s,p.id,t.id)<=attackRange(p)))check(targets.every(t=>t.id===owner.id),'同疾：必须选择该角色');
  }
  if(isSlash(kind)){
    for(const victim of targets)attackAllowed(s,p,victim,ids);const st=s.skillAutomation?stateOf(p).turn:{};check(st.tianyi!==false,'天义未赢：本回合不能使用杀');check(s.rules.slash<1+(st.extraSlash||0)+(st.tianyi===true?1:0)||equipKind({...p,equip:p.equip.filter(id=>!ids.includes(id))},'weapon')==='liannu'||hasSkill(p,'咆哮')||st.xiongluan===t.id||ids.length>0&&ids.every(id=>st.freeSuits?.includes(CARD_BY_ID[id].suit)),'本回合已经使用过杀');
  }else if(kind==='tao'){check(p.hp<p.maxHp,'你的体力已满');check(t.id===p.id,'出牌阶段的桃只能对自己使用');}
  else if(kind==='jiu'){check(t.id===p.id,'酒只能对自己使用');check(!s.rules.wineUsed,'本回合已使用酒');}
  else if(def.slot)check(ids.length===1,'一次装备一张');
  else {
    if(['chai','shun','juedou','le','bingliang','jiedao'].includes(kind))check(t.id!==p.id,'请选择其他角色');
    if(['chai','shun'].includes(kind))check(handCount(t)+t.equip.length+t.judge.length>0,'目标区域没有牌');
    if(['shun','le'].includes(kind))check(!(hasSkill(t,'谦逊')&&skillGeneral(t,'谦逊')!=='jie_luxun'),'谦逊：不能指定此目标');
    if(['shun','bingliang'].includes(kind)&&!hasSkill(p,'奇才'))check(unlimitedDistance(s,p,t,ids,kind)||s.skillAutomation&&kind==='bingliang'&&hasSkill(p,'断粮')&&handCount(t)>=handCount(p)||distance(s,p.id,t.id)<=1,'目标距离大于1');
    if(kind==='juedou')check(!(hasSkill(t,'空城')&&!handCount(t)),'空城：不能指定此目标');
    if(kind==='huogong')check(handCount(t)>0,'目标没有手牌');
    if(['le','bingliang','shandian'].includes(kind)){const owner=kind==='shandian'?p:t;check(!owner.judge.some(id=>(s.delayKinds[id]||CARD_BY_ID[id].kind)===kind),'判定区已有同名牌');}
    if(kind==='jiedao'){check(targets.length===2&&equipKind(t,'weapon'),'请选择持武器者和杀的目标');attackAllowed(s,t,targets[1]);}
  }
  return {kind,def,ids,targets,t};
}
export function useCard(s,p,a,virtualKind=null,flags={}){
  const {kind,def,ids,targets,t}=validateUse(s,p,a,virtualKind,flags),useKey=s.rev+':'+ids.join('.');
  if(s.skillAutomation&&skillGeneral(p,'国色')==='jie_daqiao'&&a.as==='le')stateOf(p).used.guose=1;
  let affected=['nanman','wanjian'].includes(kind)?order(s,p.id).slice(1):['taoyuan','wugu'].includes(kind)?order(s,p.id):def.slot?[p.id]:targets.map(x=>x.id);
  if(s.skillAutomation&&['nanman','wanjian','taoyuan','wugu'].includes(kind))affected=affected.filter(id=>{const victim=seat(s,id);return !(hasSkill(victim,'帷幕')&&!ids.some(id=>s.hiddenMaterials?.[id])&&ids.every(id=>!cardRedFor(p,CARD_BY_ID[id])))&&(!hasSkill(p,'掣政')||victim.id===p.id||distance(s,victim.id,p.id)<=attackRange(victim))&&!stateOf(p).turn.noTargets?.includes(victim.id);});
  check(affected.length>0,'没有合法的受影响目标');const skillTargets=affected.map(id=>seat(s,id));
  event(s,'use',{source:p.id,player:affected[0],targets:affected,cardKind:kind});
  if(isSlash(kind)){
    useCards(s,p,ids,kind,skillTargets);const free=s.skillAutomation&&ids.length>0&&ids.every(id=>stateOf(p).turn.freeSuits?.includes(CARD_BY_ID[id].suit));if(!free)s.rules.slash++;const wine=s.rules.drank>0,damage=1+s.rules.drank;s.rules.drank=0;
    const color=ids.some(id=>s.hiddenMaterials?.[id])?'none':ids.length?ids.every(id=>cardRedFor(p,CARD_BY_ID[id]))?'red':ids.every(id=>!cardRedFor(p,CARD_BY_ID[id]))?'black':'none':'none';
    for(const victim of targets)s.rules.queue.push({type:'slash',source:p.id,target:victim.id,card:ids[0],cards:[...ids],useKey,sourceHand:p.hand.length,targetHand:handCount(victim),color,wine,amount:damage,nature:natureOf(kind),ignoreArmor:equipKind(p,'weapon')==='qinggang'});
  }else if(kind==='tao'){useCards(s,p,ids,kind,skillTargets);const lord=complete(s)&&GENERAL_MAP_SAFE(p,null)==='吴'?alive(s).find(x=>x.id!==p.id&&x.role==='lord'&&skillGeneral(x,'救援')==='jie_sunquan'&&hasSkill(x,'救援')&&p.hp>x.hp):null;if(lord)s.rules.queue.push({type:'completeRescueOffer',owner:p.id,lord:lord.id});else {p.hp++;event(s,'heal',{player:p.id,amount:1});}}
  else if(kind==='jiu'){check(t?.id===p.id,'酒只能对自己使用');check(!s.rules.wineUsed,'本回合已使用酒');useCards(s,p,ids,kind,skillTargets);s.rules.wineUsed=true;s.rules.drank=1;note(s,'本回合下一张杀伤害基数 +1。');}
  else if(def.slot){check(ids.length===1,'一次装备一张');useCards(s,p,ids,kind,skillTargets);const old=p.equip.find(id=>CARD_MAP[CARD_BY_ID[id].kind].slot===def.slot);if(old){removeOwned(s,p,[old]);s.discard.push(old);}s.pool.splice(s.pool.indexOf(ids[0]),1);p.equip.push(ids[0]);}
  else {
    useCards(s,p,ids,kind,skillTargets);const e=(type,target=t?.id,extra={})=>({type,source:p.id,target,counter:true,cardKind:kind,card:ids[0],cards:[...ids],sourceHand:p.hand.length,targetHand:target?handCount(seat(s,target)):0,useKey:useKey,...extra});
    if(kind==='wuzhong')s.rules.queue.push(e('draw',p.id,{n:2}));
    else if(kind==='juedou')s.rules.queue.push(e('duel'));
    else if(kind==='chai'||kind==='shun')s.rules.queue.push(e(kind==='chai'?'dismantle':'steal'));
    else if(kind==='huogong')s.rules.queue.push(e('fire'));
    else if(kind==='jiedao')s.rules.queue.push(e('borrow',t.id,{victim:targets[1].id}));
    else if(['nanman','wanjian'].includes(kind))s.rules.queue.push(...affected.map(id=>e('aoe',id,{kind,luanji:a.as==='wanjian'})));
    else if(kind==='taoyuan')s.rules.queue.push(...affected.map(id=>e('heal',id)));
    else if(kind==='tiesuo')s.rules.queue.push(...targets.map(x=>e('chain',x.id)));
    else if(kind==='wugu'){
      for(let i=0;i<alive(s).length;i++){const id=topCard(s);if(id){s.pool.push(id);s.rules.market.push(id);}}
      s.rules.queue.push(...affected.map(id=>e('market',id)));
    }else if(['le','bingliang','shandian'].includes(kind)){const owner=kind==='shandian'?p:t;s.rules.queue.push(e('delay',owner.id,{owner:owner.id,card:ids[0],kind,counter:false}));}
    else throw new Error('该牌请改用手动结算');
  }
  if(s.skillAutomation){if(a.as==='wanjian'){stateOf(p).turn.luanjiSuits??=[];stateOf(p).turn.luanjiSuits.push(...ids.map(id=>CARD_BY_ID[id].suit));}s.rules.queue.push({type:'skillAfterUse',owner:p.id,kind,cards:[...ids],useKey,targets:affected,luanji:a.as==='wanjian',guoseDraw:skillGeneral(p,'国色')==='jie_daqiao'&&a.as==='le'});if(complete(s))s.rules.queue.push({type:'completeFinishUse',cards:[...ids]});}
  pump(s);
}
export function validateResponse(s,p,a,authorizedKind=null){
  const q=s.rules.pending,ids=a.cards||[];check(s.status==='playing'&&q,'当前没有待响应事件');check(!p.dead,'阵亡角色不能响应');check(!s.skillAutomation||!p.skillState?.turn?.noMoreUse||!['counter','save','borrow'].includes(q.kind),'本回合不能再使用牌');
  check(ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>isUsableHand(p,id)||p.equip.includes(id)),'请选择自己的响应牌');
  if(s.skillAutomation)check(!stateOf(p).turn.handBlocked||ids.every(id=>!p.hand.includes(id)),'雄乱：不能使用或打出手牌');
  if(q.kind==='pindian'){check(q.players.includes(p.id)&&!(q.selected||Object.keys(s.rules.commits||{})).includes(p.id),'你已提交或不参与拼点');check(ids.length===1&&p.hand.includes(ids[0]),'拼点选择一张手牌');return;}
  if(q.kind==='counter'){check(q.players?.includes(p.id)||q.canRespond===true,'你不能响应');check(ids.length===1&&(authorizedKind||effectiveKind(p,ids,a.as||null))==='wuxie'&&(a.as||isUsableHand(p,ids[0])),'需要无懈可击或合法转化');return;}
  check(q.player===p.id,'请等待对应玩家响应');
  if(q.kind==='fireShow'){check(ids.length===1&&p.hand.includes(ids[0]),'展示一张手牌');return;}
  if(q.kind==='firePay'){check(ids.length===1&&p.hand.includes(ids[0])&&CARD_BY_ID[ids[0]].suit===q.suit,'须弃置同花色手牌');return;}
  const kind=authorizedKind||effectiveKind(p,ids,a.as||null);
  if(q.kind==='borrow'&&q.skill==='青龙偃月刀'){const victim=seat(s,q.target);check(!victim.dead&&!(hasSkill(victim,'空城')&&!handCount(victim))&&!p.skillState?.turn?.noMoreUse,'当前不能对该目标追加杀');}
  if(q.kind==='borrow'&&q.skill==='挑衅')attackAllowed(s,p,seat(s,q.target),ids);
  if(!a.as)check(ids.every(id=>isUsableHand(p,id)),'请从手牌响应，装备仅可用于合法转化');
  if(q.kind==='save'){check(ids.length===1&&(kind==='tao'||kind==='jiu'&&q.target===p.id),'仅桃或濒死者自己的酒可救援');if(a.as==='tao'&&!authorizedKind)check(s.turn!==p.id,'急救只能在回合外使用');return;}
  check(['slash','duel','aoe','borrow'].includes(q.kind),'当前事件不接受此响应');check(ids.length===1||ids.length===2&&a.as==='sha'&&equipKind(p,'weapon')==='zhangba','一次响应一张或合法转化');check(q.required==='sha'?isSlash(kind):kind===q.required,`需要${q.required==='sha'?'杀':'闪'}`);
}
function settleResponseSkills(s,before){
  if(!complete(s)&&!s.equipmentAutomation)return;const old=new Set(before),trigger=s.rules.queue.filter(e=>!old.has(e)&&['skillTask','completeSkill','equipmentTask'].includes(e.type));if(!trigger.length)return;trigger.sort((a,b)=>(a.type==='equipmentTask')-(b.type==='equipmentTask'));
  const picked=new Set(trigger),rest=s.rules.queue.filter(e=>!picked.has(e)),resume=s.rules.pending;s.rules.pending=null;s.rules.queue=[...trigger,...(resume?[{type:'resumeResponse',response:resume}]:[]),...rest];
}
export function ruleAction(s,p,a,authorizedKind=null){
  if(!active(s))return false;
  switch(a.type){
    case 'storeWood':storeWood(s,p,a);break;
    case 'drawPhaseCard':{idle(s);const d=s.flow?.draw;check(tactile(s)&&s.phase===2&&s.turn===p.id&&d?.player===p.id&&d.id===a.windowId&&d.remaining>0,'当前没有你的逐张摸牌额度');const n=drawCards(s,p,1);d.remaining=n?d.remaining-1:0;note(s,`${p.name} 摸 ${n} 张牌。`);if(!d.remaining){if(stateOf(p).turn.haoshi&&p.hand.length>5){const min=Math.min(...alive(s).filter(t=>t.id!==p.id).map(t=>t.hand.length));s.rules.queue.push({type:'skillTask',owner:p.id,skill:'好施',stage:'haoshiGive',info:{targets:alive(s).filter(t=>t.id!==p.id&&t.hand.length===min).map(t=>t.id),n:Math.floor(p.hand.length/2)}});}}break;}
    case 'flowPause':check(tactile(s)&&(p.id===s.turn||p.id===s.hostId),'只有当前玩家或房主可暂停推进');check(typeof a.paused==='boolean','暂停值无效');s.flow.paused=a.paused;break;
    case 'revealJudge':{const q=s.rules.pending;check(experience(s)&&q?.kind==='judgeAwait'&&q.player===p.id&&q.windowId===a.windowId,'当前没有由你翻开的判定');s.rules.pending=null;openJudge(s,q.internal);break;}
    case 'setAutoAdvance':check(experience(s)&&s.status==='playing'&&s.turn===p.id&&typeof a.enabled==='boolean','只能设置本人当前回合的自动推进');p.autoAdvanceEnabled=a.enabled;s.flow.paused=false;break;
    case 'activateSkill':if(!['护驾','激将','涅槃','蛊惑','黄天','制霸'].includes(a.skill)&&s.equipmentAutomation)validateActiveIntent(s,p,a);if(!activateComplete(s,p,a))activateSkill(s,p,a);break;
    case 'skillResolve':if(s.rules.pending?.stage?.startsWith('equipment:')){const rest=s.rules.queue;s.rules.queue=[];resolveEquipment(s,p,a);observeCompleteMoves(s);const triggers=s.rules.queue.filter(e=>['skillTask','completeSkill'].includes(e.type)),continuations=s.rules.queue.filter(e=>!triggers.includes(e));s.rules.queue=[...triggers,...continuations,...rest];}else resolveSkill(s,p,a);break;
    case 'use':useCard(s,p,a);return true;
    case 'respond':{
      validateResponse(s,p,a,authorizedKind);
      const responseQueue=[...s.rules.queue],q=s.rules.pending;check(q,'当前没有待响应事件');const ids=a.cards||[];check(ids.length,'请选择响应牌');
      if(q.kind==='pindian'){check(ids.length===1,'拼点选择一张');commitPindian(s,p,ids[0]);break;}
      event(s,'response',{source:p.id,player:q.target||q.source||q.player,cardKind:a.as||CARD_BY_ID[ids[0]].kind});
      if(q.kind==='counter'){
        check(q.players.includes(p.id),'你不能响应');check(ids.length===1&&(authorizedKind||effectiveKind(p,ids,a.as||null))==='wuxie','需要无懈可击');discardResponse(s,p,ids,'wuxie');q.negated=!q.negated;q.passed=experience(s)?[]:[p.id];q.windowId=`${s.rev}:counter`;note(s,`无懈链：当前${q.negated?'抵消':'恢复'}原效果。`);if(complete(s)&&hasSkill(p,'集智'))s.rules.queue.push({type:'skillTask',owner:p.id,skill:'集智'});settleResponseSkills(s,responseQueue);break;
      }
      check(q.player===p.id,'请等待对应玩家响应');
      if(q.kind==='save'){
        check(ids.length===1,'一次使用一张');const kind=authorizedKind||effectiveKind(p,ids,a.as||null);check(kind==='tao'||kind==='jiu'&&q.target===p.id,'仅桃或濒死者自己的酒可救援');
        if(a.as==='tao'&&!authorizedKind)check(s.turn!==p.id,'急救只能在回合外使用');discardResponse(s,p,ids,kind);const dying=seat(s,q.target),beforeHp=dying.hp;dying.hp++;
        if(p.id!==dying.id&&dying.role==='lord'&&skillGeneral(dying,'救援')==='sunquan'&&hasSkill(dying,'救援')&&GENERAL_MAP_SAFE(p,null)==='吴')dying.hp++;
        event(s,'heal',{player:dying.id,source:p.id,amount:dying.hp-beforeHp});note(s,`${dying.name} 回复体力至 ${dying.hp}。`);if(dying.hp>0){delete stateOf(dying).marks.buquDying;s.rules.pending=null;}settleResponseSkills(s,responseQueue);break;
      }
      if(q.kind==='fireShow'){check(ids.length===1&&p.hand.includes(ids[0]),'展示一张手牌');cardMotion(s,ids,{zone:'hand',owner:p.id},{zone:'judgeReveal',owner:p.id},{actor:p.id,publicFace:true,type:'show'});note(s,`${p.name} 展示 ${cardLabel(ids[0])}。`);pending(s,{kind:'firePay',player:q.source,source:q.source,target:p.id,suit:CARD_BY_ID[ids[0]].suit,shown:ids[0],useKey:q.useKey});break;}
      if(q.kind==='firePay'){check(ids.length===1&&p.hand.includes(ids[0])&&CARD_BY_ID[ids[0]].suit===q.suit,'须弃置同花色手牌');removeOwned(s,p,ids,{handOnly:true,reason:'discard'});s.discard.push(...ids);note(s,`${p.name} 为火攻弃置${ids.map(cardLabel).join('、')}。`);s.rules.pending=null;s.rules.queue.unshift({type:'damage',source:p.id,target:q.target,nature:'fire',amount:1,cardKind:'huogong',useKey:q.useKey});settleResponseSkills(s,responseQueue);break;}
      check(['slash','duel','aoe','borrow'].includes(q.kind),'当前事件不接受此响应');
      const kind=authorizedKind||effectiveKind(p,ids,a.as||null);check(q.required==='sha'?isSlash(kind):kind===q.required,`需要${q.required==='sha'?'杀':'闪'}`);if((complete(s)||s.equipmentAutomation)&&q.kind==='borrow'){const victim=seat(s,q.target),rest=s.rules.queue,key=s.rev+':'+ids.join('.'),color=ids.some(id=>s.hiddenMaterials?.[id])?'none':ids.every(id=>cardRedFor(p,CARD_BY_ID[id]))?'red':ids.every(id=>!cardRedFor(p,CARD_BY_ID[id]))?'black':'none';s.rules.pending=null;s.rules.queue=[];useCards(s,p,ids,kind,[victim]);s.rules.queue.push({type:'slash',source:p.id,target:victim.id,card:ids[0],cards:[...ids],amount:1,nature:natureOf(kind),ignoreArmor:equipKind(p,'weapon')==='qinggang',color,useKey:key},{type:'skillAfterUse',owner:p.id,kind,cards:[...ids],targets:[victim.id],useKey:key},{type:'completeFinishUse',cards:[...ids]},...rest);settleResponseSkills(s,responseQueue);break;}discardResponse(s,p,ids,kind);if(s.skillAutomation&&kind==='shan'&&hasSkill(p,'雷击'))s.rules.queue.push({type:'skillTask',owner:p.id,skill:'雷击'});if(s.skillAutomation&&q.luanji&&kind==='shan')drawCards(s,p,1);if(isSlash(kind)&&s.turn===p.id&&s.phase===3)s.rules.slashPlayed++;q.remaining--;q.baguaUsed=false;
      if(q.remaining<=0){
        if(q.kind==='duel'){const opponent=q.opponent;q.opponent=p.id;q.player=opponent;q.remaining=hasSkill(p,'无双')?2:1;}
        else if(q.kind==='borrow'){s.rules.pending=null;s.rules.queue.unshift({type:'slash',source:p.id,target:q.target,card:ids[0],amount:1,nature:natureOf(kind),ignoreArmor:equipKind(p,'weapon')==='qinggang'});}
        else {s.rules.pending=null;if(q.kind==='slash')weaponDodged(s,q);}
      }settleResponseSkills(s,responseQueue);break;
    }
    case 'pass':{
      const q=s.rules.pending;check(q,'当前没有响应');
      if(q.kind==='counter'){check(!experience(s)||canCounter(s,p),'你没有合法无懈来源');check(q.players.includes(p.id)&&!q.passed.includes(p.id),'你已放弃本轮无懈');q.passed.push(p.id);if(q.players.every(id=>q.passed.includes(id))){s.rules.pending=null;if(!q.negated)s.rules.queue.unshift(q.effect);else if(q.effect.type==='judge'&&q.effect.delayed)clearDelayed(s,seat(s,q.effect.target),q.effect.delayed,q.effect.purpose,q.effect.purpose==='shandian');}break;}
      if(q.kind==='judge'&&p.id===s.hostId){confirmJudge(s,q);break;}
      check(q.player===p.id,'等待对应玩家响应');
      if(q.kind==='save'){q.index++;if(q.index>=q.saviors.length){s.rules.pending=null;death(s,seat(s,q.target),q.source);}else q.player=q.saviors[q.index];break;}
      if(q.kind==='judge'){confirmJudge(s,q);break;}
      check(['slash','duel','aoe','borrow','firePay'].includes(q.kind),'此事件必须选择卡牌');s.rules.pending=null;
      if(q.kind==='borrow'){if(q.skill==='青龙偃月刀')break;if(q.skill==='挑衅')s.rules.queue.unshift({type:'skillPick',owner:q.source,target:p.id,operation:'discard'});else{const weapon=seat(s,q.player).equip.find(id=>CARD_MAP[CARD_BY_ID[id].kind].slot==='weapon');if(weapon){removeOwned(s,p,[weapon]);seat(s,q.source).hand.push(weapon);note(s,`${p.name} 交出武器。`);}}}
      else if(q.kind!=='firePay')damage(s,{source:q.kind==='duel'?q.opponent:q.source,target:p.id,amount:q.amount||1,nature:q.nature||'normal',ignoreArmor:q.ignoreArmor,slash:q.kind==='slash',duel:q.kind==='duel',card:q.card,cards:q.cards,color:q.color,useKey:q.useKey,wine:q.wine});break;
    }
    case 'bagua':{
      const q=s.rules.pending;check(q&&q.player===p.id&&q.required==='shan'&&!q.ignoreArmor&&(equipKind(p,'armor')==='bagua'||s.skillAutomation&&hasSkill(p,'八阵')&&!equipKind(p,'armor')),'当前不可使用八卦阵');
      check(!q.baguaUsed,'本次闪已尝试八卦阵');check(s.deck.length||s.discard.length,'牌堆为空');q.baguaUsed=true;s.rules.pending=null;
      s.rules.queue.unshift({type:'judge',target:p.id,purpose:'bagua',skillInfo:{resume:q}});break;
    }
    case 'pickEffect':{
      const q=s.rules.pending;check(q&&q.player===p.id,'等待对应玩家选择');if(experience(s))check(q.windowId===a.windowId,'选牌窗口已更新');
      if(q.kind==='market'){check(s.rules.market.includes(a.card),'请选择五谷牌');s.rules.market.splice(s.rules.market.indexOf(a.card),1);s.pool.splice(s.pool.indexOf(a.card),1);p.hand.push(a.card);note(s,`${p.name} 获得 ${cardLabel(a.card)}。`);}
      else if(q.kind==='chooseCard'){const other=seat(s,q.target);let id;
        if(a.zone==='hand'){check(other.hand.length,'目标没有手牌');id=experience(s)?takeBlindChoice(s,p,q,a.choiceId):other.hand.splice(randomIndex(other.hand.length),1)[0];}
        else{check(['equip','judge'].includes(a.zone)&&other[a.zone].includes(a.card),'请选择目标公开牌');id=a.card;if(s.skillAutomation&&q.operation==='dismantle'&&a.zone==='equip'&&hasSkill(other,'奇才'))check(isJieSkill(other)?!['armor','treasure'].includes(CARD_MAP[CARD_BY_ID[id].kind].slot):['minus','plus'].includes(CARD_MAP[CARD_BY_ID[id].kind].slot),'奇才：此装备不能被其他角色弃置');if(a.zone==='equip')removeOwned(s,other,[id]);else other.judge.splice(other.judge.indexOf(id),1);}
        if(experience(s)&&a.zone==='hand')cardMotion(s,[id],{zone:'hand',owner:other.id},{zone:q.operation==='steal'?'hand':'discard',...(q.operation==='steal'?{owner:p.id}:{})},{actor:p.id,choiceId:a.choiceId});
        if(q.operation==='steal'){p.hand.push(id);note(s,`${p.name} 获得 ${other.name} 的${a.zone==='hand'?'一张手牌':cardLabel(id)}。`);}else{s.discard.push(id);note(s,`${p.name} 弃置 ${other.name} 的 ${cardLabel(id)}。`);}
      }else throw new Error('当前事件不接受选牌');s.rules.privateChoices={};s.rules.pending=null;break;
    }
    case 'recast':idle(s);playPhase(s,p);check(a.cards?.length===1&&effectiveKind(p,a.cards,a.as||null)==='tiesuo','请选择铁索连环或合法连环转化');removeOwned(s,p,a.cards,{handOnly:true});s.discard.push(...a.cards);drawCards(s,p,1);note(s,`${p.name} 重铸铁索连环。`);break;
    case 'judge':check(!experience(s)||p.id===s.hostId,'普通玩家只能在规则要求时翻判');idle(s);s.rules.queue.push({type:'judge',target:p.id});break;
    case 'rejudge':{
      const q=s.rules.pending;check(q?.kind==='judge','当前没有判定');check(a.cards?.length===1,'请选择一张改判牌');if(skillGeneral(p,'鬼才')==='simayi')check(p.hand.includes(a.cards[0]),'标准鬼才须使用手牌');
      check(hasSkill(p,'鬼才')||hasSkill(p,'鬼道')||p.id===s.hostId,'需要鬼才、鬼道或房主纠正');const id=a.cards[0];if(hasSkill(p,'鬼道')&&!hasSkill(p,'鬼才'))check(!red(CARD_BY_ID[id]),'鬼道需要黑色牌');
      removeOwned(s,p,[id]);s.pool.splice(s.pool.indexOf(q.card),1);if(hasSkill(p,'鬼道')&&!hasSkill(p,'鬼才'))p.hand.push(q.card);else s.discard.push(q.card);q.card=id;s.pool.push(id);note(s,`${p.name} 改判为 ${cardLabel(id)}。`);break;
    }
    case 'pindian':idle(s);{const t=seat(s,a.target);check(!(s.skillAutomation&&hasSkill(t,'谦节')),'谦节：不能被拼点');check(t.id!==p.id&&!p.dead&&!t.dead&&p.hand.length&&t.hand.length,'双方需存活且有手牌');pending(s,{kind:'pindian',players:[p.id,t.id],player:null});note(s,`${p.name} 与 ${t.name} 拼点，请各自选一张手牌。`);}break;
    default:return false;
  }
  pump(s);return true;
}
// Only classic rescue's faction check is shared with the catalog.
import {GENERAL_MAP} from '../data/generals.js';
function GENERAL_MAP_SAFE(p,skill){return skill?hasSkill(p,skill):GENERAL_MAP[p.skillState?.avatar?.general||p.general]?.faction;}
export function advancePhase(s,p,nextTurn=false,prepared=false){
  idle(s);check(!s.flow?.draw?.remaining,'请先点击抽牌堆完成摸牌');check(p.id===s.turn||p.id===s.hostId,'只有当前玩家或房主可推进');check(!Object.values(s.peek).some(z=>z.length),'请先放回观看牌');
  if(s.phase===4&&!stateOf(seat(s,s.turn)).turn.skipPhases?.includes(4))check(seat(s,s.turn).hand.length<=handLimit(s,seat(s,s.turn))||hasSkill(seat(s,s.turn),'克己')&&s.rules.slash===0&&s.rules.slashPlayed===0,'请先弃牌至体力上限');
  if(nextTurn){check(s.phase===5,'请依次完成回合阶段；特殊跳过可由房主纠正');}
  if(s.skillAutomation&&!prepared){s.skillPhaseDone??={};const key=`${s.skillTurnNo||0}:${s.phase}`;if(!s.skillPhaseDone[key]){s.skillPhaseDone[key]=true;const jobs=leavePhaseSkills(s,seat(s,s.turn),s.phase);if(jobs.length){s.rules.queue.push(...jobs,{type:'phaseAdvance',actor:p.id,nextTurn});pump(s);return;}}}
  if(s.phase===5){
    let next;
    if(complete(s))next=nextCompleteTurn(s);
    else {let i=s.players.findIndex(x=>x.id===s.turn),skips=0;do{i=(i+1)%s.players.length;if(i===0)s.round++;if(!s.players[i].dead&&s.skillAutomation&&stateOf(s.players[i]).faceDown){stateOf(s.players[i]).faceDown=false;note(s,`${s.players[i].name} 翻回正面并跳过此回合。`);continue;}if(!s.players[i].dead)break;}while(++skips<s.players.length*2);next=s.players[i].id;}
    const carry=s.rules.queue;s.turn=next;s.phase=0;s.rules={...freshRules(),lastResult:s.rules.lastResult,queue:carry};s.skillTurnNo=(s.skillTurnNo||0)+1;resetTurnSkills(s);
  }
  else s.phase++;
  if(s.flow){delete s.flow.draw;delete s.flow.needsContinue;if(s.phase===0)s.flow.paused=false;}
  const current=seat(s,s.turn);
  if(complete(s)){completePhase(s,current,s.phase);s.rules.queue.push({type:'completePhaseBody',owner:current.id});pump(s);return;}
  enterPhaseBody(s,current);
}
function enterPhaseBody(s,current){
  if(complete(s)&&cs(current).turn.skipPhases?.includes(s.phase)){note(s,`${current.name} 跳过${['准备','判定','摸牌','出牌','弃牌','结束'][s.phase]}阶段。`);if(s.phase===2)for(const owner of alive(s).filter(t=>t.id!==current.id&&hasSkill(t,'截辎')))drawCards(s,owner,1);s.rules.queue.push({type:'phaseAdvance',actor:current.id,nextTurn:false});return;}
  if(s.phase===1){s.rules.queue.push(...[...current.judge].reverse().map(id=>({type:'judge',target:current.id,delayed:id,purpose:s.delayKinds[id]||CARD_BY_ID[id].kind,cardKind:s.delayKinds[id]||CARD_BY_ID[id].kind,counter:true})));pump(s);}
  if(s.phase===2){if(s.rules.skipDraw){note(s,'跳过摸牌阶段。');if(s.skillAutomation)for(const owner of alive(s).filter(t=>t.id!==current.id&&hasSkill(t,'截辎')))drawCards(s,owner,1);}else if(s.skillAutomation){phaseSkills(s,current,2);s.rules.queue.push({type:'drawPhase',target:current.id});}else if(tactile(s))s.flow.draw={id:`${s.rev}:draw`,player:current.id,remaining:2};else note(s,`${current.name} 摸 ${drawCards(s,current,2)} 张牌。`);}
  if(s.phase===3&&s.rules.skipPlay){s.phase=4;note(s,'跳过出牌阶段。');}
  note(s,`${current.name} · ${['准备','判定','摸牌','出牌','弃牌','结束'][s.phase]}。`);
  if(s.skillAutomation){if(s.phase!==2)phaseSkills(s,current,s.phase);pump(s);}
}
