import { CARD_BY_ID, CARD_MAP, cardLabel, red } from '../data/cards.js';
import { GENERAL_MAP } from '../data/generals.js';

export function check(ok, message) { if (!ok) throw new Error(message); }
export const seat = (s, id) => { const p=s.players.find(p=>p.id===id); check(p,'席位不存在'); return p; };
export const alive = s => s.players.filter(p=>!p.dead);
export function note(s, text) { s.logs.push({rev:s.rev,text}); s.logs=s.logs.slice(-250); }
export function randomIndex(n) {
  check(n>0,'随机范围为空'); const limit=Math.floor(0x100000000/n)*n, buf=new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while(buf[0]>=limit); return buf[0]%n;
}
export function shuffle(items,rng=randomIndex) {
  const a=[...items]; for(let i=a.length-1;i>0;i--){const j=rng(i+1);[a[i],a[j]]=[a[j],a[i]];} return a;
}
export function topCard(s) {
  if(!s.deck.length&&s.discard.length){s.deck=shuffle(s.discard);s.discard=[];note(s,'弃牌堆已重洗。');}
  return s.deck.shift();
}
export function drawCards(s,p,n) { let count=0;for(let i=0;i<n;i++){const id=topCard(s);if(!id)break;p.hand.push(id);count++;}return count; }
export const hasSkill = (p,name) => GENERAL_MAP[p.general]?.skills.some(k=>k.name===name);
export const equipKind = (p,slot) => p.equip.map(id=>CARD_BY_ID[id].kind).find(k=>CARD_MAP[k].slot===slot);
export function distance(s,fromId,toId) {
  if(fromId===toId)return 0; const people=alive(s),a=people.findIndex(p=>p.id===fromId),b=people.findIndex(p=>p.id===toId);
  if(a<0||b<0)return Infinity; const from=people[a],to=people[b],d=Math.abs(a-b);
  return Math.max(1,Math.min(d,people.length-d)-(equipKind(from,'minus')?1:0)-(hasSkill(from,'马术')?1:0)+(equipKind(to,'plus')?1:0));
}
export const attackRange = p => CARD_MAP[equipKind(p,'weapon')]?.range||1;
export const isSlash = kind => ['sha','fire_sha','thunder_sha'].includes(kind);
export const natureOf = kind => kind==='fire_sha'?'fire':kind==='thunder_sha'?'thunder':'normal';
export function removeOwned(s,p,ids,{handOnly=false}={}) {
  check(Array.isArray(ids)&&ids.length>0&&ids.length<=10&&new Set(ids).size===ids.length,'请选择有效卡牌');
  for(const id of ids)check((handOnly?[p.hand]:[p.hand,p.equip]).some(z=>z.includes(id)),'卡牌不属于你的可用牌区');
  for(const id of ids){const zone=[p.hand,p.equip].find(z=>z.includes(id));zone.splice(zone.indexOf(id),1);
    if(zone===p.equip&&CARD_BY_ID[id].kind==='baiyin'&&p.hp<p.maxHp){p.hp++;note(s,`${p.name} 失去白银狮子，回复1点体力。`);}}
}
export function effectiveKind(p,ids,requested=null) {
  check(ids.length>=1,'请选择卡牌');const cards=ids.map(id=>CARD_BY_ID[id]);check(cards.every(Boolean),'无效卡牌');
  if(ids.length===1){const c=cards[0];if(!requested||requested===c.kind)return c.kind;
    if(requested==='sha'&&hasSkill(p,'武圣')&&red(c))return 'sha';
    if(hasSkill(p,'龙胆')&&(requested==='sha'&&c.kind==='shan'||requested==='shan'&&isSlash(c.kind)))return requested;
    if(requested==='shan'&&hasSkill(p,'倾国')&&!red(c)&&p.hand.includes(ids[0]))return 'shan';
    if(requested==='tao'&&hasSkill(p,'急救')&&red(c))return 'tao';
    if(requested==='chai'&&hasSkill(p,'奇袭')&&!red(c))return 'chai';
    if(requested==='le'&&hasSkill(p,'国色')&&c.suit==='D')return 'le';
    if(requested==='fire_sha'&&c.kind==='sha'&&equipKind(p,'weapon')==='zhuque')return 'fire_sha';
  }
  if(ids.length===2&&requested==='sha'&&equipKind(p,'weapon')==='zhangba'&&ids.every(id=>p.hand.includes(id)))return 'sha';
  throw new Error('此转化需改用手动结算');
}
export { CARD_BY_ID, CARD_MAP, cardLabel, red };
