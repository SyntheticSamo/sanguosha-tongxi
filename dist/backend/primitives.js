import { CARD_BY_ID, CARD_MAP, cardLabel, red } from '../data/cards.js';
import {storedCards,isUsableHand} from './wood.js';
import {cardMotion} from './presentation.js';
import { GENERAL_MAP } from '../data/generals.js';
import {skillGeneral,lockedSkill} from '../data/skill-traits.js';
export {skillGeneral};

export function check(ok, message) { if (!ok) throw new Error(message); }
export const seat = (s, id) => { const p=s.players.find(p=>p.id===id); check(p,'席位不存在'); return p; };
export const alive = s => s.players.filter(p=>!p.dead);
export function note(s, text) {
  const category=/纠正|撤销|调整/.test(text)?'correction':/伤害|回复|濒死|阵亡/.test(text)?'health':/打出|无懈|响应|判定|拼点/.test(text)?'response':/使用|装备|弃置|重铸/.test(text)?'play':/摸|观看/.test(text)?'draw':'table';
  s.logs.push({rev:s.rev,text,category});s.logs=s.logs.slice(-250);
}
export function event(s,type,data={}) {
  s.eventSeq=(s.eventSeq||0)+1;s.events??=[];
  s.events.push({id:`${s.rev}:${s.eventSeq}`,rev:s.rev,type,...data});s.events=s.events.slice(-120);
}
export function randomIndex(n) {
  check(n>0,'随机范围为空'); const limit=Math.floor(0x100000000/n)*n, buf=new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while(buf[0]>=limit); return buf[0]%n;
}
export function shuffle(items,rng=randomIndex) {
  const a=[...items]; for(let i=a.length-1;i>0;i--){const j=rng(i+1);[a[i],a[j]]=[a[j],a[i]];} return a;
}
export function topCard(s) {
  if(!s.deck.length&&s.discard.length)topCardRecycle(s);
  return s.deck.shift();
}
export function drawCards(s,p,n) { let count=0;const drawn=[];for(let i=0;i<n;i++){if(!s.deck.length&&s.discard.length)topCardRecycle(s);const id=s.skillAutomation&&hasSkill(p,'寸目')?s.deck.pop():topCard(s);if(!id)break;p.hand.push(id);drawn.push(id);count++;}if(count)cardMotion(s,drawn,{zone:'deck'},{zone:'hand',owner:p.id},{actor:p.id});if(count)event(s,'draw',{player:p.id,count});return count; }
function topCardRecycle(s){const recycled=[...s.discard];s.deck=shuffle(s.discard);s.discard=[];cardMotion(s,recycled,{zone:'discard'},{zone:'deck'});note(s,'弃牌堆已重洗。');}
export const hasSkill = (p,name) => !!p&&!p.skillState?.lost?.includes('*')&&!p.skillState?.lost?.includes(name)&&!(p.skillState?.gained?.includes('缠怨')&&p.hp===1&&name!=='缠怨')&&!(p.skillState?.turn?.silenced&&!lockedSkill(p,name))&&(name==='集智'&&p.skillState?.turn?.bonusJizhi||p.skillState?.avatar?.skill===name||p.skillState?.gained?.includes(name)||GENERAL_MAP[p.general]?.skills.some(k=>k.name===name));
export const cardSuitFor=(p,c)=>hasSkill(p,'红颜')&&c.suit==='S'?'H':c.suit;
export const cardRedFor=(p,c)=>['H','D'].includes(cardSuitFor(p,c));
export const equipKind = (p,slot) => p.equip.map(id=>CARD_BY_ID[id].kind).find(k=>CARD_MAP[k].slot===slot);
export function distance(s,fromId,toId) {
  if(fromId===toId)return 0; const people=alive(s),a=people.findIndex(p=>p.id===fromId),b=people.findIndex(p=>p.id===toId);
  if(a<0||b<0)return Infinity; const from=people[a],to=people[b],d=Math.abs(a-b);
  return Math.max(1,Math.min(d,people.length-d)-(equipKind(from,'minus')?1:0)-(hasSkill(from,'马术')?1:0)+(equipKind(to,'plus')?1:0)-(from.skillState?.turn?.distanceReduction||0)-(s.completeSkills&&hasSkill(from,'屯田')?(from.skillState?.zones?.field?.length??from.skillState?.zones?.field?.count??0):0));
}
export function unlimitedDistance(s,p,t,ids=[],kind=null){
  if(!s.skillAutomation)return false;const st=p.skillState?.turn||{};
  return st.unlimitedDistance||s.completeSkills&&hasSkill(p,'往烈')&&!st.cards||st.xiongluan===t.id||ids.some(id=>st.freeSuits?.includes(cardSuitFor(p,CARD_BY_ID[id])))||isSlash(kind)&&(st.tianyi===true||skillGeneral(p,'武圣')==='jie_guanyu'&&hasSkill(p,'武圣')&&ids.some(id=>cardSuitFor(p,CARD_BY_ID[id])==='D')||skillGeneral(p,'咆哮')==='jie_zhangfei'&&hasSkill(p,'咆哮')&&s.rules.slash>0||st.zhangjiang&&ids.length>0&&ids.every(id=>cardRedFor(p,CARD_BY_ID[id])));
}
export const attackRange = p => CARD_MAP[equipKind(p,'weapon')]?.range||1;
export const cardAttackRange=(s,p,ids=[])=>s.skillAutomation&&hasSkill(p,'烈弓')&&ids.length===1?CARD_BY_ID[ids[0]].rank:attackRange({...p,equip:p.equip.filter(id=>!ids.includes(id))});
export function cardDistance(s,p,t,ids=[]){if(!ids.some(id=>p.equip.includes(id)))return distance(s,p.id,t.id);return distance({...s,players:s.players.map(x=>x.id===p.id?{...x,equip:x.equip.filter(id=>!ids.includes(id))}:x)},p.id,t.id);}
export const isSlash = kind => ['sha','fire_sha','thunder_sha'].includes(kind);
export const natureOf = kind => kind==='fire_sha'?'fire':kind==='thunder_sha'?'thunder':'normal';
export function removeOwned(s,p,ids,{handOnly=false,reason='discard'}={}) {
  check(Array.isArray(ids)&&ids.length>0&&ids.length<=161&&new Set(ids).size===ids.length,'请选择有效卡牌');
  for(const id of ids)check((handOnly?[p.hand]:[p.hand,p.equip,...(reason==='use'||reason==='respond'?[storedCards(p)]:[])]).some(z=>z.includes(id)),'卡牌不属于你的可用牌区');
  const beforeHand=p.hand.length,equipment=ids.filter(id=>p.equip.includes(id)).length;
  if(s.completeSkills){s.skillMoveCauses??={};for(const id of ids)s.skillMoveCauses[id]=reason;}
  for(const id of ids){const zone=[p.hand,p.equip,storedCards(p)].find(z=>z.includes(id));zone.splice(zone.indexOf(id),1);
    if(zone===p.equip&&CARD_BY_ID[id].kind==='baiyin'&&p.hp<p.maxHp){p.hp++;event(s,'heal',{player:p.id,amount:1});note(s,`${p.name} 失去白银狮子，回复1点体力。`);}}
  if(s.skillAutomation){
    const st=p.skillState??={used:{},marks:{},turn:{},gained:[],lost:[],faceDown:false,abolished:[]};
    if(equipment&&hasSkill(p,'枭姬')){st.turn.equipLossN=(st.turn.equipLossRev===s.rev?st.turn.equipLossN||0:0)+equipment;st.turn.equipLossRev=s.rev;for(let i=0;i<equipment;i++)s.rules.queue.push({type:'skillTask',owner:p.id,skill:'枭姬',info:{n:1}});}
    if(beforeHand>0&&!p.hand.length&&hasSkill(p,'连营')){st.turn.lastLossRev=s.rev;s.rules.queue.push({type:'skillTask',owner:p.id,skill:'连营',info:{n:beforeHand,reason}});}
  }
}
export function effectiveKind(p,ids,requested=null) {
  check(ids.length>=1,'请选择卡牌');const cards=ids.map(id=>{const c=CARD_BY_ID[id];return c?{...c,suit:cardSuitFor(p,c)}:null;});check(cards.every(Boolean),'无效卡牌');
  if(requested==='fire_sha'&&equipKind(p,'weapon')==='zhuque'&&!(ids.length===1&&cards[0].kind==='fire_sha')){check(effectiveKind(p,ids,'sha')==='sha','朱雀需要普通杀或合法普通杀转化');return 'fire_sha';}
  if(ids.length===1){const c=cards[0];if(!requested||requested===c.kind)return c.kind;
    if(requested==='sha'&&hasSkill(p,'武圣')&&red(c))return 'sha';
    if(hasSkill(p,'龙胆')&&(requested==='sha'&&c.kind==='shan'||requested==='shan'&&isSlash(c.kind)))return requested;
    if(requested==='shan'&&hasSkill(p,'倾国')&&!red(c)&&isUsableHand(p,ids[0]))return 'shan';
    if(requested==='tao'&&hasSkill(p,'急救')&&red(c))return 'tao';
    if(requested==='chai'&&hasSkill(p,'奇袭')&&!red(c))return 'chai';
    if(requested==='le'&&hasSkill(p,'国色')&&c.suit==='D')return 'le';
    if(requested==='fire_sha'&&c.kind==='sha'&&equipKind(p,'weapon')==='zhuque')return 'fire_sha';
    if(requested==='huogong'&&hasSkill(p,'火计')&&red(c)&&isUsableHand(p,ids[0]))return requested;
    if(requested==='wuxie'&&hasSkill(p,'看破')&&!red(c)&&isUsableHand(p,ids[0]))return requested;
    if(requested==='wuxie'&&hasSkill(p,'解围')&&p.equip.includes(ids[0]))return requested;
    if(requested==='jiu'&&hasSkill(p,'酒池')&&c.suit==='S'&&isUsableHand(p,ids[0]))return requested;
    if(requested==='bingliang'&&hasSkill(p,'断粮')&&!red(c)&&['基本','装备'].includes(CARD_MAP[c.kind].type))return requested;
    if(requested==='tiesuo'&&hasSkill(p,'连环')&&c.suit==='C'&&isUsableHand(p,ids[0]))return requested;
    if(requested==='juedou'&&hasSkill(p,'双雄')&&p.skillState?.turn?.shuangColor&&(red(c)?'red':'black')!==p.skillState.turn.shuangColor&&isUsableHand(p,ids[0]))return requested;
  }
  if(ids.length===2&&requested==='sha'&&equipKind(p,'weapon')==='zhangba'&&ids.every(id=>isUsableHand(p,id)))return 'sha';
  if(ids.length===2&&requested==='wanjian'&&hasSkill(p,'乱击')&&ids.every(id=>isUsableHand(p,id))&&cards.every(c=>!p.skillState?.turn?.luanjiSuits?.includes(c.suit)))return requested;
  throw new Error('这些材料不能用于此转化');
}
export { CARD_BY_ID, CARD_MAP, cardLabel, red };
