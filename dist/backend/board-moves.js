import {CARD_BY_ID,CARD_MAP,hasSkill,skillGeneral,cardRedFor} from './primitives.js';

export function boardMoveAdvice(s,id,t){
  const owner=s.players.find(p=>p.equip.includes(id)||p.judge.includes(id));
  const no=reason=>({ok:false,reason});
  if(!owner||!t||t.dead)return no('角色或场上牌已变化');
  if(owner.id===t.id)return no('请选择新的归属角色');
  const kind=s.delayKinds[id]||CARD_BY_ID[id].kind,slot=CARD_MAP[kind].slot,abolished=t.skillState?.abolished||[];
  if(owner.equip.includes(id)){
    if(abolished.includes(slot))return no('对应装备栏已废除');
    if(t.equip.some(c=>CARD_MAP[CARD_BY_ID[c].kind].slot===slot))return no(`${{weapon:'武器',armor:'防具',minus:'进攻坐骑',plus:'防御坐骑',treasure:'宝物'}[slot]}槽已占用`);
  }else{
    if(abolished.includes('judge'))return no('判定区已废除');
    if(t.judge.some(c=>(s.delayKinds[c]||CARD_BY_ID[c].kind)===kind))return no('判定区已有同名锦囊');
    if(hasSkill(t,'谦节'))return no('谦节：不能置入延时锦囊');
    if(kind==='le'&&hasSkill(t,'谦逊')&&skillGeneral(t,'谦逊')!=='jie_luxun')return no('谦逊：不能成为乐不思蜀的目标');
    if(hasSkill(t,'帷幕')&&!cardRedFor(t,CARD_BY_ID[id]))return no('帷幕：不能成为黑色锦囊的目标');
  }
  return {ok:true,reason:''};
}
export function boardMovePairs(s){
  return Object.fromEntries(s.players.flatMap(p=>[...p.equip,...p.judge]).map(id=>[id,s.players.filter(t=>boardMoveAdvice(s,id,t).ok).map(t=>t.id)]));
}
