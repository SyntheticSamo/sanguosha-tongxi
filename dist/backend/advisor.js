import {validateActiveIntent} from './skill-intent.js';
import {slashTargetLimit} from './equipment.js';
// Read-only affordances. Uses the same pure validators as authoritative actions;
// accepts a projected view and never needs another player's hidden hand.
import { validateUse,validateResponse } from './rules.js';
import { effectiveKind,distance,attackRange,cardAttackRange,equipKind,hasSkill } from './primitives.js';
import { CARD_BY_ID,CARD_MAP } from '../data/cards.js';
import {handLimit,skillInput} from './skills.js';

export function ruleState(v){
  if(v.rules)return v;
  return {...v,peek:{[v.you]:v.peek},rules:{pending:v.pending,queue:[],commits:{},...v.counters,...v.phaseState}};
}
export const mine=v=>v.players.find(p=>p.id===v.you);
const attempt=fn=>{try{fn();return {ok:true,reason:''};}catch(e){return {ok:false,reason:e.message};}};
export function targetMode(kind){
  if(CARD_MAP[kind]?.slot||['tao','jiu','shandian','wuzhong'].includes(kind))return 'self';
  if(['nanman','wanjian','taoyuan','wugu'].includes(kind))return 'all';
  return kind==='jiedao'?'ordered':kind==='tiesuo'?'multiple':'single';
}
export function conversionKinds(v){
  const p=mine(v),k=[];
  if(hasSkill(p,'武圣'))k.push('sha');if(hasSkill(p,'龙胆'))k.push('sha','shan');
  if(hasSkill(p,'倾国'))k.push('shan');if(hasSkill(p,'急救'))k.push('tao');
  if(hasSkill(p,'奇袭'))k.push('chai');if(hasSkill(p,'国色'))k.push('le');
  if(equipKind(p,'weapon')==='zhangba')k.push('sha');if(equipKind(p,'weapon')==='zhuque')k.push('fire_sha');
  if(hasSkill(p,'火计'))k.push('huogong');if(hasSkill(p,'看破')||hasSkill(p,'解围'))k.push('wuxie');if(hasSkill(p,'酒池'))k.push('jiu');if(hasSkill(p,'断粮'))k.push('bingliang');if(hasSkill(p,'连环'))k.push('tiesuo');if(hasSkill(p,'乱击'))k.push('wanjian');if(hasSkill(p,'双雄')&&p.skillState?.turn.shuangColor)k.push('juedou');
  return [...new Set(k)];
}
export function inspectUse(v,ids,as=null,chosen=[]){
  const s=ruleState(v),p=mine(v);let kind;
  try{kind=effectiveKind(p,ids,as);}catch(e){return {ok:false,reason:e.message,targets:[],mode:'single',kind:null};}
  const mode=['sha','fire_sha','thunder_sha'].includes(kind)&&slashTargetLimit(s,p,ids)>1?'multiple':targetMode(kind),targets=['self','all'].includes(mode)?[p.id]:chosen;
  const check=t=>attempt(()=>validateUse(s,p,{cards:ids,as,targets:t}));
  const options=v.players.map(t=>{
    const targetList=mode==='ordered'?(chosen.length?[chosen[0],t.id]:[t.id]):mode==='multiple'?[...chosen.filter(id=>id!==t.id),t.id]:[t.id];
    let status;
    if(mode==='ordered'&&!chosen.length){
      const trials=v.players.filter(x=>x.id!==t.id).map(x=>check([t.id,x.id]));
      status=trials.find(x=>x.ok)||trials[0]||{ok:false,reason:'没有合法的第二目标'};
    }else status=check(targetList);
    return {id:t.id,...status,distance:distance(v,mode==='ordered'&&chosen.length?chosen[0]:p.id,t.id),range:mode==='ordered'&&chosen.length?attackRange(v.players.find(x=>x.id===chosen[0])):cardAttackRange(v,p,ids)};
  });
  const status=targets.length?check(targets):{ok:false,reason:mode==='ordered'?'先选持武器者，再选其杀的目标':mode==='multiple'?'选择一至两名角色，或重铸':'请选择一个目标'};
  return {...status,kind,mode,targets:options,action:{cards:[...ids],as:as||undefined,targets,target:targets[0]}};
}
export function responseOptions(v,ids){
  const s=ruleState(v),p=mine(v),variants=[null,...conversionKinds(v)];
  return variants.map(as=>({as, ...attempt(()=>validateResponse(s,p,{cards:ids,as}))}));
}
export function cardAdvice(v,id,as=null){
  if(v.status!=='playing')return {ok:false,reason:'开局后可用'};
  if(v.mode==='manual')return {ok:!mine(v).dead,reason:'自由手动：请同桌裁定'};
  if(v.pending?.kind==='skill')return {ok:v.pending.player===v.you&&['hand','both'].includes(v.pending.zone),reason:'按照技能窗口选择材料与目标'};
  if(v.pending){const checks=responseOptions(v,[id]);return checks.find(x=>x.ok)||checks[0];}
  if(as==='sha'&&equipKind(mine(v),'weapon')==='zhangba'){
    const pairs=mine(v).hand.filter(x=>x!==id).map(x=>inspectUse(v,[id,x],as));
    if(pairs.some(a=>a.ok||a.targets.some(t=>t.ok)))return {ok:true,reason:'可作为丈八材料，选择两张手牌'};
  }
  const advice=inspectUse(v,[id],as);
  return ['self','all'].includes(advice.mode)?advice:advice.targets.find(x=>x.ok)||{ok:false,reason:advice.targets.find(x=>x.id!==v.you)?.reason||advice.reason};
}
export function discardAdvice(v,ids=[]){
  const p=mine(v),limit=handLimit(ruleState(v),p),exempt=hasSkill(p,'克己')&&v.counters.slash===0&&(v.phaseState?.slashPlayed||0)===0;
  const needed=exempt?0:Math.max(0,p.hand.length-limit),selected=ids.filter(id=>p.hand.includes(id)).length;
  return {limit,needed,selected,remaining:Math.max(0,needed-selected),exempt,ok:needed>0&&selected===needed};
}
export function distanceExplanation(v,from,to){
  const a=v.players.find(p=>p.id===from),b=v.players.find(p=>p.id===to),live=v.players.filter(p=>!p.dead);
  if(!a||!b||a.dead||b.dead)return '阵亡角色不计入距离';
  const d=Math.abs(live.indexOf(a)-live.indexOf(b)),base=Math.min(d,live.length-d);
  return `存活座次 ${base}${equipKind(a,'minus')?' · 进攻马 −1':''}${hasSkill(a,'马术')?' · 马术 −1':''}${equipKind(b,'plus')?' · 防御马 +1':''}；最终距离 ${distance(v,from,to)}（反向 ${distance(v,to,from)}），攻击范围 ${attackRange(a)}`;
}

export function inspectSkill(v,skill,ids=[],chosen=[],option='',value=1){
 const s=ruleState(v),p=mine(v),spec=skillInput(s,p,skill),validate=targets=>attempt(()=>validateActiveIntent(s,p,{skill,cards:ids,targets,option,value}));
 return {mode:spec.maxTargets>1?'multiple':spec.maxTargets?'single':'self',...validate(chosen),targets:v.players.map(t=>{
  const selected=[...chosen.filter(id=>id!==t.id),t.id];
  if(spec.maxTargets===2&&selected.length===1){const trials=v.players.filter(x=>x.id!==t.id).map(x=>validate([t.id,x.id]));return {id:t.id,...(trials.find(x=>x.ok)||trials[0])};}
  return {id:t.id,...validate(selected)};
 })};
}
