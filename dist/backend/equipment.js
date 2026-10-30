import {observeCompleteMoves} from './complete-skills.js';
import {check,seat,alive,equipKind,hasSkill,drawCards,removeOwned,effectiveKind,CARD_BY_ID,CARD_MAP,note,randomIndex} from './primitives.js';
import {GENERAL_MAP} from '../data/generals.js';
import {usableHand,settleWood} from './wood.js';

const names={cixiong:'雌雄双股剑',qinglong:'青龙偃月刀',guanshi:'贯石斧',hanbing:'寒冰剑',qilin:'麒麟弓',muniu:'木牛流马'};
const gender=p=>GENERAL_MAP[p.skillState?.avatar?.general||p.general]?.gender;
export function slashTargetLimit(s,p,ids){return 1+(s.skillAutomation&&p.skillState?.turn?.tianyi===true?1:0)+(s.equipmentAutomation&&equipKind(p,'weapon')==='fangtian'&&p.hand.length>0&&p.hand.every(id=>ids.includes(id))&&!ids.some(id=>p.equip.includes(id)&&CARD_BY_ID[id].kind==='fangtian')?2:0);}
function offer(s,p,weapon,stage,info={},spec={}){
  if(p.dead)return;s.equipmentPromptSeq=(s.equipmentPromptSeq||0)+1;
  s.rules.pending={kind:'skill',windowId:`${s.rev}:eq:${s.equipmentPromptSeq}`,player:p.id,skill:names[weapon],stage:`equipment:${stage}`,choices:[{id:'yes',label:'发动'}],optional:true,targetIds:[],minTargets:0,maxTargets:0,minCards:0,maxCards:0,zone:'both',internal:{weapon,...info},hint:'选择是否发动；系统完成效果。',...spec};
}
export function beforeWeaponSlash(s,e){
  if(!s.equipmentAutomation||e.weaponTargetChecked)return false;e.weaponTargetChecked=true;
  const a=seat(s,e.source),t=seat(s,e.target);
  if(equipKind(a,'weapon')==='cixiong'&&gender(a)&&gender(t)&&gender(a)!==gender(t)){
    s.rules.queue.unshift(e);offer(s,a,'cixiong','cixiong',{target:t.id});return true;
  }return false;
}
export function weaponDamage(s,e,stage){
  if(!s.equipmentAutomation||!e.slash||!e.source||e.chain||e.amount<=0)return false;
  const a=seat(s,e.source),t=seat(s,e.target),kind=equipKind(a,'weapon');if(a.dead)return false;
  if(stage==='prevent'&&kind==='hanbing'&&!e.hanbingChecked&&t.hand.length+t.equip.length){e.hanbingChecked=true;offer(s,a,kind,'hanbing',{effect:e,target:t.id});return true;}
  if(stage==='cause'&&kind==='qilin'&&!e.qilinChecked&&t.equip.some(id=>['plus','minus'].includes(CARD_MAP[CARD_BY_ID[id].kind].slot))){e.qilinChecked=true;offer(s,a,kind,'qilin',{effect:e,target:t.id},{minCards:1,maxCards:1,zone:'public',cardChoices:t.equip.filter(id=>['plus','minus'].includes(CARD_MAP[CARD_BY_ID[id].kind].slot)),hint:'选择目标的一匹坐骑，或不发动。'});return true;}
  return false;
}
export function weaponDodged(s,e){if(s.equipmentAutomation)s.rules.queue.push({type:'equipmentTask',owner:e.source,stage:'dodged',effect:{...e}});}
function discardable(p,id,source){if(!p.equip.includes(id))return true;if(!hasSkill(p,'奇才')||p.id===source)return true;const slot=CARD_MAP[CARD_BY_ID[id].kind].slot;return GENERAL_MAP[p.general]?.pack==='jie'?!['armor','treasure'].includes(slot):['plus','minus'].includes(slot);}
export function equipmentTask(s,e){
  const a=seat(s,e.owner);if(a.dead)return;const t=e.target?seat(s,e.target):null;
  if(e.stage==='woodTransfer'){if(a.equip.includes(e.treasure))offer(s,a,'muniu','muniuTransfer',{treasure:e.treasure},{maxTargets:1,minTargets:1,targetIds:alive(s).filter(t=>t.id!==a.id&&!t.equip.some(id=>CARD_MAP[CARD_BY_ID[id].kind].slot==='treasure')&&!t.skillState?.abolished.includes('treasure')).map(t=>t.id),hint:'可将木牛流马连同储牌移给宝物栏空置的角色，或不转移。'});return;}
  if(e.stage==='dodged'){
    const victim=seat(s,e.effect.target);if(victim.dead)return;const weapon=equipKind(a,'weapon');
    if(weapon==='qinglong'&&!a.skillState?.turn?.noMoreUse&&(usableHand(a).length||s.skillAutomation&&a.role==='lord'&&hasSkill(a,'激将')))offer(s,a,weapon,'qinglong',{target:victim.id},{minCards:1,maxCards:2,choices:[{id:'yes',label:'使用所选杀'},...(s.completeSkills&&hasSkill(a,'蛊惑')&&!a.skillState.used['蛊惑']||s.skillAutomation&&a.role==='lord'&&hasSkill(a,'激将')?[{id:'other',label:'通过技能使用杀',minCards:0,maxCards:0}]:[])],hint:'选择杀或合法材料，或进入技能用杀窗口；只对同一目标追加，无距离限制。'});
    if(weapon==='guanshi'&&[...a.hand,...a.equip].filter(id=>CARD_BY_ID[id].kind!=='guanshi').length>=2)offer(s,a,weapon,'guanshi',{effect:e.effect},{minCards:2,maxCards:2,hint:'同时弃置两张手牌或其他装备，使原杀继续生效。'});
  }
  if(e.stage==='hanbingPick'&&t&&!t.dead&&(t.hand.length||t.equip.some(id=>discardable(t,id,a.id))))offer(s,a,'hanbing','hanbingPick',{target:t.id,remaining:e.remaining},{optional:false,minCards:1,maxCards:1,zone:'public',cardChoices:t.equip.filter(id=>discardable(t,id,a.id)),choices:[...(t.hand.length?[{id:'hand',label:'随机弃一张手牌',minCards:0,maxCards:0}]:[]),...(t.equip.some(id=>discardable(t,id,a.id))?[{id:'equip',label:'弃置所选装备'}]:[])],hint:`寒冰剑：依次弃牌，还可弃 ${e.remaining} 张。`});
}
export function resolveEquipment(s,p,a){
  const q=s.rules.pending;if(!q?.stage?.startsWith('equipment:'))return false;
  check(q.player===p.id,'请等待装备效果的决策者');const info=q.internal,stage=q.stage.slice(10),ids=a.cards||[],ts=a.targets||[],decline=a.choice==='decline';
  check(new Set(ids).size===ids.length&&new Set(ts).size===ts.length,'材料或目标重复');check(!decline||q.optional,'此步骤必须选择');
  check(decline||q.choices.some(c=>c.id===a.choice),'装备选项无效');
  const option=q.choices.find(c=>c.id===a.choice),min=option?.minCards??q.minCards,max=option?.maxCards??q.maxCards;
  if(!decline)check(ids.length>=min&&ids.length<=max&&ts.length>=q.minTargets&&ts.length<=q.maxTargets,'装备材料或目标数量不符');
  s.rules.pending=null;
  if(decline){if(['hanbing','qilin'].includes(stage))s.rules.queue.unshift(info.effect);return true;}
  if(stage==='cixiong'){const t=seat(s,info.target);if(t.hand.length)offer(s,t,'cixiong','cixiongPay',{source:p.id},{optional:false,maxCards:1,zone:'hand',choices:[{id:'discard',label:'弃一张手牌',minCards:1,maxCards:1},{id:'draw',label:'令使用者摸一张',minCards:0,maxCards:0}]});else drawCards(s,p,1);}
  else if(stage==='cixiongPay'){if(a.choice==='discard'){check(ids.length===1&&p.hand.includes(ids[0]),'选择一张手牌');removeOwned(s,p,ids,{handOnly:true});s.discard.push(...ids);}else drawCards(s,seat(s,info.source),1);}
  else if(stage==='guanshi'){check(ids.length===2&&ids.every(id=>CARD_BY_ID[id]?.kind!=='guanshi'),'贯石斧不能作为自身费用');removeOwned(s,p,ids);s.discard.push(...ids);s.rules.queue.push({...info.effect,type:'damage',slash:true});}
  else if(stage==='qinglong'){if(a.choice==='other'){s.rules.pending={kind:'borrow',skill:'青龙偃月刀',player:p.id,source:p.id,target:info.target,required:'sha',remaining:1};return true;}check(!p.skillState?.turn?.noMoreUse,'本回合不能再使用牌');check(ids.length>0&&ids.every(id=>usableHand(p).includes(id)||p.equip.includes(id)),'请选择可用的杀材料');const kind=effectiveKind(p,ids,a.as||null);check(['sha','fire_sha','thunder_sha'].includes(kind),'需要杀或合法转化');check(!p.skillState?.turn?.handBlocked||ids.every(id=>!p.hand.includes(id)),'本回合不能使用手牌');const t=seat(s,info.target);check(!t.dead&&!(hasSkill(t,'空城')&&!t.hand.length),'目标已不能成为杀的目标');s.rules.queue.unshift({type:'equipmentSlash',owner:p.id,target:t.id,cards:ids,kind});}
  else if(stage==='hanbing')s.rules.queue.unshift({type:'equipmentTask',owner:p.id,target:info.target,stage:'hanbingPick',remaining:2});
  else if(stage==='hanbingPick'){const t=seat(s,info.target);let id;if(a.choice==='hand'){check(t.hand.length,'目标已无手牌');id=t.hand[randomIndex(t.hand.length)];}else {id=ids[0];check(t.equip.includes(id)&&discardable(t,id,p.id),'此装备不能弃置');}removeOwned(s,t,[id]);s.discard.push(id);note(s,`${p.name} 以寒冰剑弃置 ${t.name} 的 ${CARD_MAP[CARD_BY_ID[id].kind].name}。`);if(info.remaining>1)s.rules.queue.push({type:'equipmentTask',owner:p.id,target:t.id,stage:'hanbingPick',remaining:info.remaining-1});}
  else if(stage==='qilin'){const t=seat(s,info.target);check(ids.length===1&&t.equip.includes(ids[0])&&['plus','minus'].includes(CARD_MAP[CARD_BY_ID[ids[0]].kind].slot)&&discardable(t,ids[0],p.id),'请选择可弃置的目标坐骑');removeOwned(s,t,ids);s.discard.push(...ids);s.rules.queue.push(info.effect);}
  else if(stage==='muniuTransfer'){const t=seat(s,ts[0]),id=info.treasure;check(t.id!==p.id&&!t.dead&&!t.equip.some(id=>CARD_MAP[CARD_BY_ID[id].kind].slot==='treasure')&&!t.skillState?.abolished.includes('treasure'),'目标宝物栏不可用');check(p.equip.includes(id),'木牛已移动');removeOwned(s,p,[id],{reason:'move'});t.equip.push(id);settleWood(s);}
  else throw new Error('未知装备步骤');
  note(s,`${p.name} 完成「${q.skill}」选择。`);return true;
}
export function storeWood(s,p,a){
  check(s.equipmentAutomation&&s.turn===p.id&&s.phase===3&&!s.rules.pending&&!s.rules.queue.length&&!p.dead&&p.hp>0,'请在自己的出牌阶段使用木牛');const treasure=p.equip.find(id=>CARD_BY_ID[id].kind==='muniu');check(treasure,'没有装备木牛流马');const key=`${s.skillTurnNo||0}:${s.phase}`;check(p.woodUsed!==key,'本阶段已经存过牌');check(a.cards?.length===1&&p.hand.includes(a.cards[0]),'请选择一张真实手牌');p.woodUsed=key;removeOwned(s,p,a.cards,{handOnly:true,reason:'move'});p.wood??={treasure,cards:[]};p.wood.cards.push(a.cards[0]);
  observeCompleteMoves(s);s.rules.queue.push({type:'equipmentTask',owner:p.id,stage:'woodTransfer',treasure});
}
