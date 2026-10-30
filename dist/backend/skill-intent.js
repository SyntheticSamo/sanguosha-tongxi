import {check,seat,alive,hasSkill,distance,attackRange,cardDistance,cardAttackRange,cardSuitFor,cardRedFor,skillGeneral,CARD_BY_ID,CARD_MAP} from './primitives.js';
import {skillInput,gender,isJie} from './skills.js';
const count=p=>p.hand?.length??p.handCount??0;
const zone=(p,name)=>p.skillState?.zones?.[name]?.cards||p.skillState?.zones?.[name]||[];
// Only visible state and the actor's own materials. No opponent hand oracle.
export function validateActiveIntent(s,p,a){
  const name=a.skill,ids=a.cards||[],targets=(a.targets||[]).map(id=>seat(s,id)),st=p.skillState||{used:{},marks:{},turn:{},abolished:[]},spec=skillInput(s,p,name);
  check(s.status==='playing'&&s.skillAutomation&&!p.dead&&p.hp>0,'当前不能发动技能');check(hasSkill(p,name)||['黄天','制霸'].includes(name),'你没有此技能');check(!s.flow?.opening&&!s.rules.pending&&!s.rules.queue.length&&s.turn===p.id&&s.phase===3,'请在自己的出牌阶段发动');
  check(new Set(ids).size===ids.length&&new Set(a.targets||[]).size===targets.length&&targets.every(t=>!t.dead),'技能材料或目标重复');check(ids.length<=spec.maxCards&&targets.length===spec.maxTargets,'技能材料或目标数量不符');
  const own=ids.every(id=>p.hand.includes(id)||p.equip.includes(id));check(['急袭','清侧'].includes(name)||own,'请选择自己的材料');
  const repeated=new Set(['制衡','反间','苦肉','结姻','离间','缔盟','挑衅','驱虎','天义','制霸','黄天','成略','飞军','决堰','义绝','审时','贞良','攻心']);if(repeated.has(name)&&!(name==='苦肉'&&!isJie(p)))check(!st.used[name],'本阶段已发动此技能');
  const other=()=>{check(targets.length===1&&targets[0].id!==p.id,'选择一名其他角色');return targets[0];};const t=targets[0];
  if(['仁德','反间','结姻','直谏','挑衅','强袭','驱虎','天义','飞军','雄乱','义绝','审时','贞良','攻心','急袭','清侧','激将'].includes(name))other();
  if(name==='仁德'){check(ids.length>0&&ids.every(id=>p.hand.includes(id)),'选择交出的手牌');check(!isJie(p)||!st.turn.rendeTargets?.includes(t.id),'本阶段已仁德给过该目标');}
  if(name==='反间')check(count(p)>0&&(!isJie(p)||ids.length===1&&p.hand.includes(ids[0])),'需要反间手牌');
  if(name==='国色'){check(ids.length===1&&cardSuitFor(p,CARD_BY_ID[ids[0]])==='D'&&!st.used.guose,'选择一张方块牌且本阶段未国色');if(a.option==='remove')check(t.judge.some(id=>(s.delayKinds[id]||CARD_BY_ID[id].kind)==='le'),'目标没有乐不思蜀');else check(t.id!==p.id&&!t.judge.some(id=>(s.delayKinds[id]||CARD_BY_ID[id].kind)==='le')&&!hasSkill(t,'谦节')&&!t.skillState?.abolished?.includes('judge'),'不能放置乐不思蜀');}
  if(name==='青囊'){check(isJie(p)||!st.used[name],'本阶段已发动青囊');check(ids.length===1&&p.hand.includes(ids[0])&&t.hp<t.maxHp,'选择一张手牌及受伤角色');check(!st.turn.qingnangStopped&&!st.turn.qingnangTargets?.includes(t.id),'不能再次选择此目标');}
  if(name==='结姻'){check(gender(t)==='男'&&ids.length===(isJie(p)?1:2)&&ids.every(id=>p.hand.includes(id)),'结姻需要手牌和男性目标');if(!isJie(p))check(t.hp<t.maxHp,'目标须受伤');if(a.option==='equip'){const slot=CARD_MAP[CARD_BY_ID[ids[0]].kind].slot;check(slot&&!t.skillState?.abolished?.includes(slot)&&!t.equip.some(id=>CARD_MAP[CARD_BY_ID[id].kind].slot===slot),'目标装备栏不可用');}}
  if(name==='离间')check(ids.length===1&&targets.every(t=>t.id!==p.id&&gender(t)==='男')&&!(hasSkill(targets[1],'空城')&&!count(targets[1])),'选择材料及两名其他男性');
  if(name==='强袭'){check(!st.turn.qiangxi?.includes(t.id),'已强袭该目标');check(!ids.length||ids.length===1&&CARD_MAP[CARD_BY_ID[ids[0]].kind].slot==='weapon','材料须为武器');check(cardDistance(s,p,t,ids)<=cardAttackRange(s,p,ids),'超出支付材料后的攻击范围');}
  if(['驱虎','天义'].includes(name)){check(count(p)&&count(t)&&!hasSkill(t,'谦节'),'双方须有手牌且目标可拼点');if(name==='驱虎')check(t.hp>p.hp,'驱虎目标体力须比你多');}
  if(name==='缔盟')check(targets.every(t=>t.id!==p.id)&&ids.length===Math.abs(count(targets[0])-count(targets[1])),'材料数须等于两人手牌差');
  if(name==='直谏'){const slot=ids.length===1&&CARD_MAP[CARD_BY_ID[ids[0]].kind].slot;check(slot&&p.hand.includes(ids[0])&&!t.skillState?.abolished?.includes(slot)&&!t.equip.some(id=>CARD_MAP[CARD_BY_ID[id].kind].slot===slot),'选择手中装备及对应栏空置的目标');}
  if(name==='飞军'){check(ids.length===1,'先选择弃牌');check(a.option==='equip'?t.equip.length>p.equip.length:count(t)>count(p),'目标所选牌区须比你多');}
  if(['雄乱','奇谋','乱武','涅槃'].includes(name))check(!st.marks[name],'限定技已使用');
  if(name==='义绝')check(ids.length===1&&count(t)>0,'弃一张牌且目标须有手牌');
  if(name==='审时')check(!st.marks.shenshi&&ids.length===1&&p.hand.includes(ids[0])&&alive(s).filter(x=>x.id!==p.id).every(x=>count(t)>=count(x)),'阳态：交牌给其他手牌最多者');
  if(name==='贞良'){const duty=zone(p,'duty');check(!st.marks.zhenliang&&duty.length>0&&ids.length===Math.max(1,Math.abs(p.hp-t.hp))&&ids.every(id=>cardRedFor(p,CARD_BY_ID[id])===cardRedFor(p,CARD_BY_ID[duty[0]])),'材料须与任同色且等于体力差，至少一张');check(distance(s,p.id,t.id)<=attackRange(p),'目标不在攻击范围内');}
  if(name==='急袭'){check(ids.length===1&&zone(p,'field').includes(ids[0]),'选择一张田');check(count(t)+t.equip.length+t.judge.length>0&&!(hasSkill(t,'谦逊')&&skillGeneral(t,'谦逊')!=='jie_luxun'),'不能顺手牵羊此目标');check(hasSkill(p,'奇才')||distance(s,p.id,t.id)<=1,'目标距离大于1');}
  if(name==='清侧')check(ids.length===1&&zone(p,'honor').includes(ids[0])&&t.equip.length+t.judge.length>0,'选择一张荣及有场上牌的目标');
  return true;
}
