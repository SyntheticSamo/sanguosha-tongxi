import { DECK, CARD_BY_ID, CARD_MAP, cardLabel, deckFor } from '../data/cards.js';
import { GENERAL_MAP, ROLES, PHASES } from '../data/generals.js';
import { freshRules, ruleAction, advancePhase, cancelResolution } from './rules.js';
import { randomIndex, shuffle, note as log, drawCards as draw } from './primitives.js';
export { randomIndex, shuffle } from './primitives.js';

export const SCHEMA = 2;
const assert = (ok,message) => { if(!ok) throw new Error(message); };
const text = (v,max=40) => String(v??'').trim().slice(0,max);
const int = (v,min,max) => { assert(Number.isInteger(v)&&v>=min&&v<=max,'数值超出允许范围'); return v; };
export function newRoom({hostId,token,name='房主',size=4,ex=true,practice=false,roomId=crypto.randomUUID(),mode='auto',deckSet='army',selectionMode='random',generalPacks=['standard','jie','wind','fire','forest','mountain','yin','thunder']}) {
  int(size,2,8); assert(token&&hostId,'缺少会话身份');
  assert(['auto','manual'].includes(mode)&&['standard','army','wood'].includes(deckSet)&&['random','choose','five'].includes(selectionMode),'房间设置无效');
  const knownPacks=new Set(Object.values(GENERAL_MAP).map(g=>g.pack));assert(Array.isArray(generalPacks)&&generalPacks.length>0&&generalPacks.every(pack=>knownPacks.has(pack)),'请至少启用一个有效武将包');
  if(selectionMode==='five')assert(new Set(Object.values(GENERAL_MAP).filter(g=>generalPacks.includes(g.pack)).map(g=>g.baseName)).size>=size*5,'五选一需要每席5名独立人物，请启用更多武将包或减少席位');
  const s={schema:SCHEMA,roomId,hostId,rev:0,status:'lobby',size,ex:!!ex,practice:!!practice,mode,deckSet,selectionMode,generalPacks,
    players:[player(hostId,token,name)],deck:[],discard:[],pool:[],peek:{},turn:hostId,phase:0,round:1,
    logs:[{rev:0,text:'等待入席。'}],winner:null,rules:freshRules(),delayKinds:{},choices:{}};
  if(selectionMode==='five')dealChoices(s,s.players[0]);return s;
}
function player(id,token,name){return {id,token,name:text(name)||'无名侠客',general:null,role:null,hp:4,maxHp:4,hand:[],equip:[],judge:[],dead:false,roleOpen:false,chained:false};}
const poolOf=s=>Object.values(GENERAL_MAP).filter(g=>s.generalPacks.includes(g.pack||'standard'));
const personKey=id=>GENERAL_MAP[id]?.baseName||GENERAL_MAP[id]?.name;
function dealChoices(s,p){
  const taken=new Set(Object.values(s.choices).flat().map(personKey));
  const pool=shuffle(poolOf(s).filter(g=>!taken.has(g.baseName||g.name)).map(g=>g.id)).filter(id=>{const key=personKey(id);if(taken.has(key))return false;taken.add(key);return true;});
  assert(pool.length>=5,'武将池不足以分配五选一；请启用更多扩展');s.choices[p.id]=pool.slice(0,5);
}
const layouts = {
  2:['lord','spy'],3:['lord','rebel','spy'],4:['lord','loyal','rebel','spy'],
  5:['lord','loyal','rebel','rebel','spy'],6:['lord','loyal','rebel','rebel','rebel','spy'],
  7:['lord','loyal','loyal','rebel','rebel','rebel','spy'],8:['lord','loyal','loyal','rebel','rebel','rebel','rebel','spy']
};
export function joinRoom(original,{token,name}) {
  assert(typeof token==='string'&&token.length>=20&&token.length<=128,'会话凭据无效');
  const existing=original.players.find(p=>p.token===token);
  if(existing)return {state:original,seat:existing.id};
  assert(original.status==='lobby','对局已经开始，仅允许原席位重连');
  assert(original.players.length<original.size,'牌桌已满');
  const s=structuredClone(original);s.rev++;const p=player(crypto.randomUUID(),token,name);s.players.push(p);if(s.selectionMode==='five')dealChoices(s,p);
  log(s,`${p.name} 入席。`);return {state:s,seat:p.id};
}
export function reduce(original,actorId,action) {
  assert(action&&typeof action.type==='string','操作无效');
  assert(action.rev===original.rev,'牌桌状态已更新，请确认最新状态后重试');
  const s=structuredClone(original);s.rev++;
  const me=s.players.find(p=>p.id===actorId); assert(me,'未找到你的席位');
  const host=actorId===s.hostId;
  const target=id=>{const p=s.players.find(p=>p.id===(id||me.id));assert(p,'目标席位不存在');return p;};
  const live=()=>assert(s.status==='playing','请先开始对局');
  const cards=()=>{assert(Array.isArray(action.cards)&&action.cards.length>0&&action.cards.length<=108,'请选择卡牌');assert(new Set(action.cards).size===action.cards.length,'重复卡牌');for(const id of action.cards)assert(CARD_BY_ID[id],'卡牌不存在');return action.cards;};
  const take=(zone,ids)=>{for(const id of ids)assert(zone.includes(id),'卡牌已移动，请刷新状态');for(const id of ids)zone.splice(zone.indexOf(id),1);};
  const own=(ids)=>{for(const id of ids){const zone=[me.hand,me.equip,me.judge].find(z=>z.includes(id));assert(zone,'你不能操作他人的私有卡牌');if(zone===me.judge)delete s.delayKinds[id];take(zone,[id]);}};
  if(s.status==='playing'&&ruleAction(s,me,action)){validateState(s);return s;}
  if(s.mode==='auto'&&s.rules.pending&&!['chat','correct','role','skill','finish'].includes(action.type))throw new Error('请先响应；需要中止时由房主使用纠正');
  switch(action.type){
    case 'rename': assert(s.status==='lobby','开局后不能改名');me.name=text(action.name)||me.name;log(s,`${me.name} 更新了昵称。`);break;
    case 'general':
      assert(s.status==='lobby','开局后不能换将');assert(GENERAL_MAP[action.general],'武将不存在');
      assert(s.selectionMode!=='random','纯随机模式在开局时分配武将');assert(poolOf(s).some(g=>g.id===action.general),'该武将不在本桌将池');
      if(s.selectionMode==='five')assert(s.choices[me.id]?.includes(action.general),'请从自己的五名候选中选择');
      assert(!s.players.some(p=>p.id!==me.id&&p.general&&personKey(p.general)===personKey(action.general)),'同人物的其他版本已被选择');me.general=action.general;log(s,`${me.name} 选择 ${GENERAL_MAP[me.general].name}。`);break;
    case 'localSeat':
      assert(host&&s.practice&&s.status==='lobby','只有演练房主可添加本地席位');assert(s.players.length<s.size,'牌桌已满');
      {const p=player(crypto.randomUUID(),crypto.randomUUID(),`演练席 ${s.players.length+1}`);s.players.push(p);if(s.selectionMode==='five')dealChoices(s,p);}log(s,'增加演练席。');break;
    case 'removeSeat':
      assert(host&&s.status==='lobby','仅房主可在大厅移除席位');assert(action.target!==s.hostId,'不能移除房主');
      assert(s.players.some(p=>p.id===action.target),'席位不存在');s.players=s.players.filter(p=>p.id!==action.target);delete s.choices[action.target];log(s,'房主移除了一位玩家。');break;
    case 'start': {
      assert(host&&s.status==='lobby','仅房主可开局');assert(s.players.length>=2,'至少需要两位玩家');
      if(s.selectionMode!=='random')assert(s.players.every(p=>p.general),'请等待所有玩家选将');
      const used=new Set(s.players.map(p=>p.general).filter(Boolean).map(personKey));
      const free=shuffle(poolOf(s).filter(g=>!used.has(g.baseName||g.name)).map(g=>g.id)).filter(id=>{const key=personKey(id);if(used.has(key))return false;used.add(key);return true;});assert(free.length>=s.players.filter(p=>!p.general).length,'武将池不足');
      const roles=shuffle(layouts[s.players.length]);s.deck=shuffle(deckFor(s.deckSet,s.ex).map(c=>c.id));
      s.players.forEach((p,i)=>{p.general??=free.pop();const g=GENERAL_MAP[p.general];p.role=roles[i];p.maxHp=g.hp+(p.role==='lord'&&s.players.length>=5?1:0);p.hp=p.maxHp;p.roleOpen=p.role==='lord';draw(s,p,4);});
      s.turn=s.players.find(p=>p.role==='lord').id;s.phase=0;s.status='playing';
      log(s,`${s.players.length} 人开局 · ${deckFor(s.deckSet,s.ex).length} 张牌，主公先行。`);break;
    }
    case 'draw': {live();assert(!me.dead,'阵亡角色不能摸牌');const n=int(action.n,1,20);const before=me.hand.length;draw(s,me,n);log(s,`${me.name} 摸了 ${me.hand.length-before} 张牌。`);break;}
    case 'play': {live();assert(!me.dead,'阵亡角色不能出牌');const ids=cards();const p=action.target?target(action.target):null;
      for(const id of ids)assert(me.hand.includes(id),'只能打出手牌');take(me.hand,ids);s.pool.push(...ids);
      log(s,`${me.name} ${action.as?`以「${text(action.as,20)}」`:'使用 / 打出'} ${ids.map(cardLabel).join('、')}${p?` → ${p.name}`:''}。请手动完成效果。`);break;}
    case 'discard':{live();const ids=cards();own(ids);s.discard.push(...ids);log(s,`${me.name} 弃置 ${ids.map(cardLabel).join('、')}。`);break;}
    case 'give':{live();const p=target(action.target);assert(p.id!==me.id&&!p.dead,'请选择其他存活角色');const ids=cards();for(const id of ids)assert(me.hand.includes(id),'只能交出手牌');take(me.hand,ids);p.hand.push(...ids);log(s,`${me.name} 交给 ${p.name} ${ids.length} 张手牌。`);break;}
    case 'equip':{live();const ids=cards();assert(ids.length===1,'一次装备一张');const id=ids[0];const def=CARD_MAP[CARD_BY_ID[id].kind];assert(def.slot,'这不是装备牌');assert(me.hand.includes(id),'装备须在手牌中');
      const old=me.equip.find(c=>CARD_MAP[CARD_BY_ID[c].kind].slot===def.slot);if(old){take(me.equip,[old]);s.discard.push(old);}take(me.hand,ids);me.equip.push(id);log(s,`${me.name} 装备 ${cardLabel(id)}${old?`，替换 ${cardLabel(old)}`:''}。`);break;}
    case 'delay':{live();const p=target(action.target),ids=cards();assert(ids.length===1,'一次放置一张');const id=ids[0],def=CARD_MAP[CARD_BY_ID[id].kind];assert(def.type==='延时'||action.as==='乐不思蜀','请选择延时锦囊，或以国色转化');
      assert(me.hand.includes(id),'卡牌须在手牌中');const kind=action.as==='乐不思蜀'?'le':CARD_BY_ID[id].kind;assert(!p.judge.some(c=>(s.delayKinds[c]||CARD_BY_ID[c].kind)===kind),'判定区已有同名牌');take(me.hand,ids);p.judge.push(id);s.delayKinds[id]=kind;log(s,`${me.name} 将 ${cardLabel(id)}${action.as?'（乐不思蜀）':''} 放入 ${p.name} 判定区。`);break;}
    case 'reveal':{live();const n=int(action.n,1,8);let got=[];for(let i=0;i<n;i++){if(!s.deck.length&&s.discard.length){s.deck=shuffle(s.discard);s.discard=[];}if(s.deck.length)got.push(s.deck.shift());}s.pool.push(...got);log(s,`${me.name} 翻开 ${got.map(cardLabel).join('、')||'空牌堆'}。`);break;}
    case 'takePool':{live();const ids=cards();take(s.pool,ids);me.hand.push(...ids);log(s,`${me.name} 获得桌面上的 ${ids.map(cardLabel).join('、')}。`);break;}
    case 'clearPool':live();log(s,`${me.name} 将结算区 ${s.pool.length} 张牌移入弃牌堆。`);s.discard.push(...s.pool);s.pool=[];break;
    case 'randomTake':{live();const p=target(action.target);assert(p.id!==me.id&&p.hand.length,'目标没有可获得的手牌');const id=p.hand.splice(randomIndex(p.hand.length),1)[0];if(action.discard){s.discard.push(id);log(s,`${me.name} 随机弃置 ${p.name} 的 ${cardLabel(id)}。`);}else{me.hand.push(id);log(s,`${me.name} 随机获得 ${p.name} 一张手牌。`);}break;}
    case 'publicMove':{live();const p=target(action.target),ids=cards();assert(['equip','judge'].includes(action.zone),'来源牌区无效');take(p[action.zone],ids);
      if(action.to==='hand')me.hand.push(...ids);else if(action.to==='pool')s.pool.push(...ids);else if(action.to==='judge')target(action.destination).judge.push(...ids);else s.discard.push(...ids);
      log(s,`${me.name} 移动 ${p.name} ${action.zone==='equip'?'装备':'判定'}区 ${ids.map(cardLabel).join('、')} → ${action.to==='hand'?'自己的手牌':action.to==='pool'?'结算区':action.to==='judge'?target(action.destination).name+'判定区':'弃牌堆'}。`);break;}
    case 'hp':{live();const p=target(action.target);const delta=int(action.delta,-5,5);assert(delta!==0,'体力变更为空');p.hp=Math.max(-20,Math.min(p.maxHp,p.hp+delta));log(s,`${me.name} 调整 ${p.name} 体力 ${delta>0?'+':''}${delta} → ${p.hp}/${p.maxHp}${p.hp<=0?'（濒死，先进行求桃）':''}。`);break;}
    case 'skill':{live();const g=GENERAL_MAP[me.general];const skill=g.skills.find(k=>k.name===action.skill);assert(skill,'技能不存在');log(s,`${me.name} 发动「${skill.name}」${action.note?`：${text(action.note,140)}`:''}。请各玩家执行相应牌区 / 体力操作。`);break;}
    case 'peek':{live();assert(!s.peek[me.id]?.length,'请先放回已观看的牌');const n=int(action.n,1,5);s.peek[me.id]=s.deck.splice(0,n);log(s,`${me.name} 私下观看牌堆顶 ${s.peek[me.id].length} 张牌（观星等技能）。`);break;}
    case 'returnPeek':{live();const ids=cards(),zone=s.peek[me.id]||[];assert(['top','bottom','hand','pool','discard'].includes(action.to),'目标牌区无效');take(zone,ids);
      if(action.to==='top')s.deck.unshift(...ids);else if(action.to==='bottom')s.deck.push(...ids);else if(action.to==='hand')me.hand.push(...ids);else s[action.to].push(...ids);
      log(s,`${me.name} 将观看的 ${ids.length} 张牌移至${{top:'牌堆顶',bottom:'牌堆底',hand:'手牌',pool:'结算区',discard:'弃牌堆'}[action.to]}。`);break;}
    case 'phase':{live();assert(host||s.turn===me.id,'只有当前回合玩家或房主可推进回合');assert(!Object.values(s.peek).some(v=>v.length),'请先放回私下观看的牌');
      if(s.mode==='auto'){advancePhase(s,me,!!action.nextTurn);break;}
      if(action.nextTurn||s.phase===PHASES.length-1){const alive=s.players.filter(p=>!p.dead);assert(alive.length,'无存活角色');let index=s.players.findIndex(p=>p.id===s.turn);do{index=(index+1)%s.players.length;}while(s.players[index].dead);if(index<=s.players.findIndex(p=>p.id===s.turn))s.round++;s.turn=s.players[index].id;s.phase=0;}else s.phase++;
      log(s,`${target(s.turn).name} · ${PHASES[s.phase]}阶段。${s.phase===2?'请自行点击摸牌。':''}`);break;}
    case 'role':live();me.roleOpen=true;log(s,`${me.name} 亮明身份：${ROLES[me.role]}。`);break;
    case 'correct':{
      live();assert(host,'仅房主可纠正');const reason=text(action.reason,120);assert(reason,'请填写纠正原因');const p=target(action.target);
      if(action.op==='cancel')cancelResolution(s);
      else if(action.op==='hp')p.hp=int(action.value,-20,p.maxHp);
      else if(action.op==='maxHp'){p.maxHp=int(action.value,1,20);p.hp=Math.min(p.hp,p.maxHp);}
      else if(action.op==='phase'){assert(!s.rules.pending,'请先中止当前响应');s.phase=int(action.value,0,5);s.turn=p.id;}
      else if(action.op==='chain')p.chained=!p.chained;
      else if(action.op==='counter'){s.rules.slash=0;s.rules.slashPlayed=0;s.rules.wineUsed=false;s.rules.drank=0;}
      else if(action.op==='draw')draw(s,p,int(action.value,1,20));
      else throw new Error('纠正类型无效');
      log(s,`房主纠正 ${p.name}：${reason}。`);break;
    }
    case 'death':{live();assert(host,'仅房主可确认阵亡');const p=target(action.target);assert(p.hp<=0&&!p.dead,'先完成濒死求桃，体力仍不大于0才可确认阵亡');assert(!s.peek[p.id]?.length,'请先处理其观看区');p.dead=true;p.roleOpen=true;s.discard.push(...p.hand,...p.equip,...p.judge);p.hand=[];p.equip=[];p.judge=[];log(s,`${p.name} 阵亡，身份为 ${ROLES[p.role]}。击杀奖惩与胜利由房主裁定。`);break;}
    case 'finish':live();assert(host,'仅房主可结束对局');assert(['主忠','反贼','内奸','平局'].includes(action.winner),'请选择胜方');s.status='finished';s.winner=action.winner;log(s,`房主裁定：${s.winner}。对局结束。`);break;
    case 'chat':{const message=text(action.message,280);assert(message,'消息不能为空');log(s,`${me.name}：${message}`);break;}
    default:throw new Error('不支持的操作');
  }
  validateState(s);return s;
}
export function validateState(s){
  assert(s?.schema===SCHEMA&&typeof s.roomId==='string','存档版本不支持');
  assert(Number.isSafeInteger(s.rev)&&s.rev>=0,'版本号无效');
  assert(Array.isArray(s.players)&&s.players.length>=1&&s.players.length<=8,'席位数量无效');
  assert(s.players.some(p=>p.id===s.hostId),'房主席位缺失');
  assert(new Set(s.players.map(p=>p.id)).size===s.players.length&&new Set(s.players.map(p=>p.token)).size===s.players.length,'席位身份重复');
  assert(['auto','manual'].includes(s.mode)&&['standard','army','wood'].includes(s.deckSet),'房间规则设置无效');
  assert(s.rules&&Array.isArray(s.rules.queue)&&s.rules.commits,'结算状态损坏');
  const pending=s.rules.pending;
  if(pending){assert(['counter','slash','duel','aoe','save','judge','pindian','chooseCard','market','fireShow','firePay','borrow'].includes(pending.kind),'响应类型无效');if(pending.player)assert(s.players.some(p=>p.id===pending.player),'响应席位无效');}
  for(const [id,cards]of Object.entries(s.rules.commits))assert(pending?.kind==='pindian'&&pending.players.includes(id)&&Array.isArray(cards)&&cards.length===1,'拼点提交区无效');
  assert(s.rules.market.every(id=>s.pool.includes(id)),'五谷牌区损坏');
  for(const p of s.players){assert(typeof p.token==='string'&&p.token.length>=20,'凭据损坏');assert(p.general===null||GENERAL_MAP[p.general],'武将无效');assert(Number.isInteger(p.hp)&&p.hp>=-20&&p.hp<=p.maxHp&&p.maxHp>=1&&p.maxHp<=20,'体力无效');}
  assert(['lobby','playing','finished'].includes(s.status),'对局状态无效');assert(Number.isInteger(s.phase)&&s.phase>=0&&s.phase<6,'阶段无效');
  const all=[...s.deck,...s.discard,...s.pool,...Object.values(s.peek).flat(),...Object.values(s.rules.commits).flat(),...s.players.flatMap(p=>[...p.hand,...p.equip,...p.judge])];
  const allowed=new Set(deckFor(s.deckSet,s.ex).map(c=>c.id));
  assert(all.every(id=>allowed.has(id)),'存档含无效卡牌');
  assert(new Set(all).size===all.length,'牌区卡牌重复');
  if(s.status!=='lobby'){assert(all.length===allowed.size,'卡牌总数不守恒');assert(s.players.some(p=>p.id===s.turn),'回合席位无效');assert(s.players.every(p=>ROLES[p.role]&&GENERAL_MAP[p.general]),'身份 / 武将缺失');}
  return true;
}
export function project(s,seat){
  assert(s.players.some(p=>p.id===seat),'席位不存在');
  const q=structuredClone(s.rules.pending);if(q?.kind==='pindian')q.selected=Object.keys(s.rules.commits); // Never publish concealed card IDs.
  return {schema:SCHEMA,roomId:s.roomId,hostId:s.hostId,rev:s.rev,status:s.status,size:s.size,ex:s.ex,practice:s.practice,
    mode:s.mode,deckSet:s.deckSet,selectionMode:s.selectionMode,generalPacks:[...s.generalPacks],choices:[...(s.choices[seat]||[])],delayKinds:{...s.delayKinds},
    pending:q,counters:{slash:s.rules.slash,wineUsed:s.rules.wineUsed,drank:s.rules.drank},lastResult:structuredClone(s.rules.lastResult),
    turn:s.turn,phase:s.phase,round:s.round,winner:s.winner,deckCount:s.deck.length,discard:[...s.discard],pool:[...s.pool],
    peek:[...(s.peek[seat]||[])],logs:structuredClone(s.logs),you:seat,
    players:s.players.map(p=>({id:p.id,name:p.name,general:p.general,hp:p.hp,maxHp:p.maxHp,dead:p.dead,chained:!!p.chained,
      role:p.id===seat||p.roleOpen||s.status==='finished'?p.role:null,roleOpen:p.roleOpen,
      handCount:p.hand.length,hand:p.id===seat?[...p.hand]:null,equip:[...p.equip],judge:[...p.judge]}))};
}
export function migrateState(input){
  const s=structuredClone(input);
  if(s?.schema===1){s.schema=2;s.mode='manual';s.deckSet='standard';s.selectionMode='choose';s.generalPacks=['standard'];s.rules=freshRules();s.delayKinds={};s.choices={};for(const p of s.players)p.chained=false;}
  validateState(s);return s;
}
