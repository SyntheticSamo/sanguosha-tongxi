import {check,shuffle} from './primitives.js';

export const experience=s=>!!s.tableExperience;
export function prepareBlindChoice(s,q){
  if(!experience(s))return;if(q?.kind!=='chooseCard'){s.rules.privateChoices={};return;}
  const target=s.players.find(p=>p.id===q.target),old=s.rules.privateChoices?.[q.windowId];
  if(old&&old.cards.length===target.hand.length&&old.cards.every(id=>target.hand.includes(id)))return;
  q.windowId=`${s.rev}:pick:${crypto.randomUUID()}`;
  s.rules.privateChoices={[q.windowId]:{actor:q.player,target:q.target,cards:[...target.hand],entries:shuffle(target.hand).map(card=>({choiceId:crypto.randomUUID(),card}))}};
}
export function takeBlindChoice(s,p,q,choiceId){
  const map=s.rules.privateChoices?.[q.windowId],target=s.players.find(p=>p.id===q.target);
  check(map&&map.actor===p.id&&map.target===target.id&&map.cards.length===target.hand.length&&map.cards.every(id=>target.hand.includes(id)),'目标手牌已变化，请同步后重新选择');
  const item=map.entries.find(e=>e.choiceId===choiceId);check(item&&target.hand.includes(item.card),'请选择本次展示的一张牌背');
  target.hand.splice(target.hand.indexOf(item.card),1);delete s.rules.privateChoices[q.windowId];return item.card;
}
export function projectBlindChoice(s,q,viewer){
  if(q?.kind!=='chooseCard'||!experience(s))return;
  const map=s.rules.privateChoices?.[q.windowId];if(map?.actor===viewer)q.handChoices=map.entries.map(e=>e.choiceId);
}
export function validateInteraction(s,check){
  check(s.tableExperience===undefined||typeof s.tableExperience==='boolean','桌面交互设置无效');
  const q=s.rules?.pending;if(experience(s)&&q?.kind==='judgeAwait')check(typeof q.windowId==='string'&&q.windowId.length<=100&&q.internal?.type==='judge'&&q.internal.target===q.player,'翻判等待窗口无效');
  for(const [key,m]of Object.entries(s.rules?.privateChoices||{})){
    check(Object.keys(s.rules.privateChoices).length<=8&&typeof key==='string'&&key.length<=100&&s.players.some(p=>p.id===m.actor)&&s.players.some(p=>p.id===m.target),'匿名选牌窗口无效');
    check(q?.kind==='chooseCard'&&q.windowId===key&&q.player===m.actor&&q.target===m.target,'匿名选牌窗口已失效');
    const p=s.players.find(p=>p.id===m.target);check(Array.isArray(m.cards)&&Array.isArray(m.entries)&&m.cards.length===p.hand.length&&m.cards.length<=161&&m.entries.length===m.cards.length&&new Set(m.cards).size===m.cards.length&&m.cards.every(id=>p.hand.includes(id)),'匿名选牌来源无效');
    check(new Set(m.entries.map(e=>e.choiceId)).size===m.entries.length&&new Set(m.entries.map(e=>e.card)).size===m.entries.length&&m.entries.every(e=>typeof e.choiceId==='string'&&e.choiceId.length<=64&&m.cards.includes(e.card)),'匿名选牌编号无效');
  }
}
