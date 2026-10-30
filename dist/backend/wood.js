import {CARD_BY_ID} from '../data/cards.js';

export const storedCards=p=>p.wood?.cards||[];
export const usableHand=p=>[...(p.hand||[]),...storedCards(p)];
export const isUsableHand=(p,id)=>usableHand(p).includes(id);
// Run after a complete movement step: direct equipment transfers retain contents.
export function settleWood(s){
  if(!s.equipmentAutomation)return;
  for(const p of s.players){
    if(!p.wood)continue;
    const owner=s.players.find(t=>!t.dead&&t.equip.includes(p.wood.treasure)&&!t.skillState?.abolished?.includes('treasure'));
    if(owner===p)continue;
    const store=p.wood;delete p.wood;
    if(owner)owner.wood=store;else s.discard.push(...store.cards);
  }
}
export function validateWood(s,check){
  check(s.equipmentAutomation===undefined||typeof s.equipmentAutomation==='boolean','装备自动设置无效');
  check(!s.equipmentAutomation||s.mode==='auto','装备自动需要自动牌桌');
  for(const p of s.players||[])if(p.wood){const w=p.wood;check(s.equipmentAutomation&&p.equip.includes(w.treasure)&&CARD_BY_ID[w.treasure]?.kind==='muniu'&&Array.isArray(w.cards)&&w.cards.every(id=>CARD_BY_ID[id])&&new Set(w.cards).size===w.cards.length,'木牛储牌区无效');}
}
