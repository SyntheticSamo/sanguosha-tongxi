import {isUsableHand} from './wood.js';
import {recordPlay,cardMotion} from './presentation.js';
import {complete,startComplete,completePhase,completeLeave,completeAfterDamage,completeAfterDeath,completePrepareUse,completeSlashJobs,completeAfterUse,completePindian,completeJudge,resolveComplete,completeFlip,cs,completeHandUse} from './complete-skills.js';
import {GENERAL_MAP} from '../data/generals.js';
import {CARD_BY_ID,CARD_MAP,red,cardLabel} from '../data/cards.js';
import {check,seat,alive,hasSkill,equipKind,distance,attackRange,cardAttackRange,unlimitedDistance,skillGeneral,drawCards,removeOwned,note,event,topCard,randomIndex,effectiveKind,cardSuitFor,cardRedFor} from './primitives.js';

// All state changes run inside the engine transaction. Prompts are decisions,
// never announcements pretending that a skill effect has been performed.
import {ACTIVE_SKILLS,AUTOMATED_NAMES} from '../data/skill-support.js';
export {ACTIVE_SKILLS,AUTOMATED_NAMES};
export const stateOf=p=>(p.skillState??={used:{},marks:{},turn:{},gained:[],lost:[],faceDown:false,abolished:[]});
export function skillInput(s,p,name){
  const specs={仁德:[161,1],国色:[1,1],制衡:[161,0],苦肉:[isJie(p)?1:0,0],青囊:[1,1],结姻:[isJie(p)?1:2,1],离间:[1,2],强袭:[1,1],奇谋:[0,0],涅槃:[0,0],直谏:[1,1],缔盟:[161,2],挑衅:[0,1],驱虎:[0,1],天义:[0,1],乱武:[0,0],黄天:[1,0],制霸:[0,0],成略:[0,0],飞军:[1,1],雄乱:[0,1],决堰:[0,0],怀柔:[1,0],护驾:[0,0],激将:[0,s.pending?.required==='sha'||s.rules?.pending?.required==='sha'?0:1],反间:[isJie(p)?1:0,1]},spec=specs[name]||[0,0];
  const extra={义绝:[1,1],审时:[1,1],贞良:[161,1],攻心:[0,1],急袭:[1,1],清侧:[1,1],蛊惑:[0,0]}[name];
  return {maxCards:extra?.[0]??spec[0],maxTargets:extra?.[1]??spec[1],value:name==='奇谋',options:name==='国色'?[['place','方块牌当乐不思蜀'],['remove','弃方块牌移除目标的乐']]:name==='决堰'?[['weapon','废武器栏'],['armor','废防具栏'],['horses','废双坐骑栏'],...(complete(s)?[['treasure','废宝物栏']]:[])]:name==='飞军'?[['hand','令目标交手牌'],['equip','令目标弃装备']]:name==='结姻'&&isJie(p)?[['discard','弃手牌'],['equip','将装备置入目标装备区']]:[]};
}
export const isJie=p=>GENERAL_MAP[p.skillState?.avatar?.general||p.general]?.pack==='jie';
export const gender=p=>GENERAL_MAP[p.skillState?.avatar?.general||p.general]?.gender;
export const faction=p=>GENERAL_MAP[p.skillState?.avatar?.general||p.general]?.faction;
const owns=(p,ids)=>ids.every(id=>p.hand.includes(id)||p.equip.includes(id));
const livingTargets=(s,p,fn=()=>true)=>alive(s).filter(t=>t.id!==p.id&&fn(t)).map(t=>t.id);
const task=(p,skill,stage='offer',info={})=>({type:'skillTask',owner:p.id,skill,stage,info});
export function heal(s,p,n=1){const before=p.hp;p.hp=Math.min(p.maxHp,p.hp+n);if(p.hp!==before){event(s,'heal',{player:p.id,amount:p.hp-before});note(s,`${p.name} 回复${p.hp-before}点体力。`);}}
export function loseHp(s,p,n=1){p.hp-=n;event(s,'hp',{player:p.id,amount:-n});note(s,`${p.name} 失去${n}点体力。`);s.rules.queue.unshift({type:'checkDying',target:p.id});if(hasSkill(p,'诈降'))s.rules.queue.splice(1,0,task(p,'诈降','apply',{n}));}
function discard(s,p,ids,{hand=false}={}){check(ids.length>0&&new Set(ids).size===ids.length&&owns(p,ids),'请选择自己的有效材料');if(hand)check(ids.every(id=>p.hand.includes(id)),'请选择手牌');for(const zone of ['hand','equip'])cardMotion(s,ids.filter(id=>p[zone].includes(id)),{zone,owner:p.id},{zone:'discard'},{actor:p.id,publicFace:true});removeOwned(s,p,ids,{reason:'skill'});s.discard.push(...ids);stateOf(p).turn.discarded=(stateOf(p).turn.discarded||0)+ids.length;note(s,`${p.name} 为技能弃置 ${ids.map(cardLabel).join('、')}。`);}
function moveToHand(s,p,ids){for(const id of ids){const zone=[s.pool,s.discard,s.deck].find(z=>z.includes(id));if(zone){cardMotion(s,[id],{zone:zone===s.pool?'pool':zone===s.discard?'discard':'deck'},{zone:'hand',owner:p.id},{actor:p.id});zone.splice(zone.indexOf(id),1);p.hand.push(id);}}}
function giveCards(s,p,t,ids,zone='hand'){check(t.id!==p.id&&!t.dead,'请选择其他存活角色');const src=zone==='peek'?(s.peek[p.id]||[]):p.hand;check(ids.length&&new Set(ids).size===ids.length&&ids.every(id=>src.includes(id)),'请选择可分配的牌');cardMotion(s,ids,{zone,owner:p.id},{zone:'hand',owner:t.id},{actor:p.id});for(const id of ids)src.splice(src.indexOf(id),1);t.hand.push(...ids);note(s,`${p.name} 以技能交给 ${t.name} ${ids.length} 张牌。`);}
function prompt(s,p,skill,stage,{choices=[{id:'yes',label:'发动'}],optional=true,targets=[],minTargets=0,maxTargets=minTargets,minCards=0,maxCards=minCards,zone='hand',info={},hint=''}={}){
  if(p.dead)return;stateOf(p);s.skillPromptSeq=(s.skillPromptSeq||0)+1;s.rules.pending={kind:'skill',windowId:`${s.rev}:${s.skillPromptSeq}`,player:p.id,skill,stage,choices,optional,targetIds:targets,minTargets,maxTargets,minCards,maxCards,zone,hint,internal:info};
}
function drawEvent(p,n){return {type:'draw',target:p.id,n};}
export function startSkills(s){
  if(!s.skillAutomation)return;for(const p of s.players){const st=stateOf(p);if(hasSkill(p,'怀橘'))st.marks.orange=3;}
  startComplete(s);
  if(complete(s)){completePhase(s,seat(s,s.turn),0);s.rules.queue.push({type:'completePhaseBody',owner:s.turn});}else phaseSkills(s,seat(s,s.turn),0);
}
export function resetTurnSkills(s){if(!s.skillAutomation)return;for(const p of s.players){stateOf(p).used={};stateOf(p).turn={};}s.skillPhaseDone={};if(complete(s))s.completeUses={};const p=seat(s,s.turn);delete stateOf(p).marks.bare;}
export function handLimit(s,p){
  if(!s.skillAutomation)return Math.max(0,p.hp);
  const st=stateOf(p);let n=hasSkill(p,'英姿')&&(isJie(p)||st.gained.includes('英姿'))?p.maxHp:p.hp;
  if(hasSkill(p,'血裔')&&p.role==='lord')n+=alive(s).filter(t=>t.id!==p.id&&faction(t)==='群').length*2;
  n+=st.turn.handLimit||0;
  if(hasSkill(p,'庸肆')&&(st.turn.damage||0)>=2)n=p.maxHp-p.hp;
  if(complete(s)){if(st.turn.fangquan)n=p.maxHp+(st.turn.handLimit||0);if(hasSkill(p,'不屈'))n+=st.zones?.wound?.length??st.zones?.wound?.count??0;}
  return Math.max(0,n);
}
export function drawPhaseCount(s,p){
  if(!s.skillAutomation)return 2;const st=stateOf(p);
  if(st.turn.replaceDraw)return 0;
  let n=hasSkill(p,'庸肆')?new Set(alive(s).map(faction)).size:2;
  if(hasSkill(p,'英姿')&&(isJie(p)||st.gained.includes('英姿')))n++;
  return Math.max(0,n+(st.turn.drawBonus||0)+(st.marks.orange>0&&alive(s).some(t=>hasSkill(t,'怀橘'))?1:0));
}
export function phaseSkills(s,p,phase){
  if(!s.skillAutomation)return;const st=stateOf(p),list=[];
  if(phase===0){
    if(p.role==='lord')for(const owner of alive(s).filter(t=>t.id!==p.id&&hasSkill(t,'妄尊')))list.push(task(owner,'妄尊','decision',{stage:'wangzun',data:{lord:p.id}}));
    for(const name of ['洛神','观星'])if(hasSkill(p,name))list.push(task(p,name));if(hasSkill(p,'英魂')&&p.hp<p.maxHp)list.push(task(p,'英魂'));
    if(hasSkill(p,'志继')&&!st.marks.zhiji&&p.hand.length===0)list.push(task(p,'志继','awaken'));
    if(hasSkill(p,'魂姿')&&!st.marks.hunzi&&p.hp<3)list.push(task(p,'魂姿','awaken'));
    if(hasSkill(p,'若愚')&&p.role==='lord'&&!st.marks.ruoyu&&alive(s).every(t=>p.hp<=t.hp))list.push(task(p,'若愚','awaken'));
    if(hasSkill(p,'破势')&&!st.marks.poshi&&(p.hp===1||['weapon','armor','plus','minus','treasure'].every(slot=>st.abolished.includes(slot))))list.push(task(p,'破势','awaken'));
  }
  if(phase===2){
    if(hasSkill(p,'整论')&&!st.marks.orange)list.push(task(p,'整论'));
    for(const name of ['突袭','裸衣','好施','双雄'])if(hasSkill(p,name))list.push(task(p,name));
    if(hasSkill(p,'英姿')&&!isJie(p)&&!st.gained.includes('英姿'))list.push(task(p,'英姿'));
  }
  if(phase===3&&hasSkill(p,'遗礼'))list.push(task(p,'遗礼'));
  if(phase===5){
    for(const name of ['闭月','据守','进趋','崩坏','罪论'])if(hasSkill(p,name))list.push(task(p,name));
    if(isJie(p)&&hasSkill(p,'观星')&&st.turn.guanxingAgain){st.turn.guanxingAgain=false;list.push(task(p,'观星'));}
  }
  s.rules.queue.push(...list);
}
export function leavePhaseSkills(s,p,phase){
  if(!s.skillAutomation)return [];const st=stateOf(p),jobs=[];
  if(phase===3&&hasSkill(p,'庸肆')&&!(st.turn.damage||0))drawCards(s,p,Math.max(0,p.hp-p.hand.length));
  if(phase===3&&hasSkill(p,'掣政')){const out=alive(s).filter(t=>t.id!==p.id&&distance(s,t.id,p.id)>attackRange(t));if((st.turn.cards||0)<out.length&&out.some(t=>t.hand.length+t.equip.length+t.judge.length))jobs.push(task(p,'掣政','decision',{stage:'qizhi',optional:false,targets:out.filter(t=>t.hand.length+t.equip.length+t.judge.length).map(t=>t.id),minTargets:1}));}
  if(phase===4&&hasSkill(p,'伪帝')&&p.role==='lord'&&st.turn.phaseDiscards?.some(id=>s.discard.includes(id))&&livingTargets(s,p,t=>faction(t)==='群').length)jobs.push(task(p,'伪帝','decision',{stage:'weidiStart',data:{cards:st.turn.phaseDiscards.filter(id=>s.discard.includes(id))}}));
  if(phase===5){for(const t of s.players){const ts=stateOf(t);if(ts.shelter?.length){t.hand.push(...ts.shelter);ts.shelter=[];note(s,`${t.name} 取回谦逊暂存的手牌。`);}}}
  return [...jobs,...completeLeave(s,p,phase)];
}
export function afterDamageSkills(s,{source,target,amount,card,cards,kind,color,useKey}){
  if(!s.skillAutomation)return;const p=seat(s,target),a=source?s.players.find(x=>x.id===source):null,info={source,target,amount,card,cards,kind,color};
  if(a){const st=stateOf(a);st.turn.damage=(st.turn.damage||0)+amount;}
  const list=[];
  if(!p.dead){for(const name of ['奸雄','反馈','刚烈','遗计','节命','放逐'])if(hasSkill(p,name)){
    const n=['遗计','节命'].includes(name)||isJie(p)&&['反馈','刚烈'].includes(name)?amount:1;
    for(let i=0;i<n;i++)list.push(task(p,name,'offer',info));
  }}
  if(a&&!a.dead&&hasSkill(a,'狂骨')&&distance(s,a.id,p.id)<=1)for(let i=0;i<amount;i++)list.push(task(a,'狂骨','offer',info));
  if(a&&!a.dead&&hasSkill(a,'利驭')&&kind==='sha'&&p.hand.length+p.equip.length+p.judge.length)list.push(task(a,'利驭','decision',{stage:'liyu',data:{target:p.id}}));
  if(hasSkill(p,'耀武')&&kind==='sha'){
    if(color==='red'&&a&&!a.dead)list.push(task(a,'耀武','offer',info));else if(isJie(p))list.push(drawEvent(p,1));
  }
  if(a&&!a.dead&&faction(a)==='群')for(const lord of alive(s).filter(t=>t.role==='lord'&&hasSkill(t,'暴虐')))list.push(task(a,'暴虐','offer',{...info,lord:lord.id}));
  const order=alive(s).map(p=>p.id),start=order.indexOf(s.turn);list.sort((x,y)=>((order.indexOf(x.owner||x.target)-start+order.length)%order.length)-((order.indexOf(y.owner||y.target)-start+order.length)%order.length));s.rules.queue.unshift(...list);completeAfterDamage(s,{source,target,amount,card,cards,kind,color,useKey});
}
export function afterDeathSkills(s,p,killer,grave){
  completeAfterDeath(s,p,killer);
  if(!s.skillAutomation)return;if(killer&&hasSkill(p,'断肠')){stateOf(killer).lost=['*'];note(s,`${killer.name} 因断肠失去全部武将技能。`);}
  for(const other of alive(s))if(hasSkill(other,'行殇'))s.rules.queue.unshift(task(other,'行殇','offer',{cards:grave}));
}
export function prepareUseSkills(s,p,kind,ids,targets,present=true){
  if(present)recordPlay(s,p,ids,kind,targets.map(t=>t.id));
  if(present)completeHandUse(s,p,ids,kind);
  if(!s.skillAutomation)return;const st=stateOf(p);st.turn.cards=(st.turn.cards||0)+1;
  const list=[];if(hasSkill(p,'激昂')&&(kind==='juedou'||['sha','fire_sha','thunder_sha'].includes(kind)&&ids.length>0&&!ids.some(id=>s.hiddenMaterials?.[id])&&ids.every(id=>red(CARD_BY_ID[id]))))list.push(task(p,'激昂'));
  if(['juedou','sha','fire_sha','thunder_sha'].includes(kind))for(const t of targets)if(hasSkill(t,'激昂')&&(kind==='juedou'||ids.length>0&&ids.every(id=>red(CARD_BY_ID[id]))))list.push(task(t,'激昂'));
  if(hasSkill(p,'集智')&&(CARD_MAP[kind].type==='锦囊'||complete(s)&&!isJie(p)&&!st.turn.bonusJizhi&&CARD_MAP[kind].type==='延时'))list.push(task(p,'集智'));
  if(s.turn===p.id&&hasSkill(p,'奇制')&&['基本','锦囊'].includes(CARD_MAP[kind].type))list.push(task(p,'奇制','offer',{excluded:targets.map(t=>t.id)}));
  for(const t of targets){if(t.id!==p.id&&hasSkill(t,'荐降'))list.push(task(t,'荐降'));if(CARD_MAP[kind].type==='锦囊'&&targets.length>1&&hasSkill(t,'从谏')&&t.hand.length)list.push(task(t,'从谏','decision',{stage:'congjian',minCards:1,maxCards:1,minTargets:1,targets:targets.filter(x=>x.id!==t.id).map(x=>x.id)}));}
  s.rules.queue.push(...list);
  completePrepareUse(s,p,kind,ids,targets);
}
export function processSkillTask(s,e){
  const p=seat(s,e.owner),st=stateOf(p),name=e.skill,info=e.info||{};if(p.dead)return;
  if(e.stage==='awaken'){
    const key={志继:'zhiji',魂姿:'hunzi',若愚:'ruoyu',破势:'poshi'}[name];if(st.marks[key])return;st.marks[key]=true;
    if(name==='若愚'){p.maxHp++;heal(s,p);st.gained.push('激将');}
    else{p.maxHp=Math.max(1,p.maxHp-1);p.hp=Math.min(p.hp,p.maxHp);if(name==='魂姿')st.gained.push('英姿','英魂');else if(name==='破势'){drawCards(s,p,Math.max(0,p.maxHp-p.hand.length));st.lost.push('决堰');st.gained.push('怀柔');}else{st.gained.push('观星');prompt(s,p,name,'reward',{optional:false,choices:[{id:'heal',label:'回复1点体力'},{id:'draw',label:'摸两张'}]});}}
    note(s,`${p.name} 觉醒「${name}」。`);return;
  }
  if(e.stage==='mandatoryDiscard')return prompt(s,p,name,'discard',{optional:false,minCards:info.n,maxCards:info.n,zone:info.zone||'hand',info});
  if(e.stage==='gift')return prompt(s,p,name,'gift',{info,zone:info.zone||'hand',maxCards:info.budget,minTargets:0,maxTargets:1,targets:livingTargets(s,p),choices:[{id:'give',label:'将所选交给目标'},{id:'keep',label:'完成分配，保留其余'}]});
  if(e.stage==='decision'){if(info.stage==='luanwu'){const others=alive(s).filter(t=>t.id!==p.id),min=Math.min(...others.map(t=>distance(s,p.id,t.id)));info.targets=others.filter(t=>distance(s,p.id,t.id)===min).map(t=>t.id);}return prompt(s,p,name,info.stage,{...info,info:info.data||{}});}
  if(e.stage==='haoshiGive')return prompt(s,p,name,'haoshiGive',{optional:false,targets:info.targets,minTargets:1,minCards:info.n,maxCards:info.n,info});
  if(e.stage==='applyLoss'){loseHp(s,p,1);return;}
  if(name==='诈降'){
    drawCards(s,p,3*info.n);if(s.turn===p.id&&s.phase===3){st.turn.extraSlash=(st.turn.extraSlash||0)+info.n;st.turn.zhangjiang=true;}return;
  }
  if(name==='连营'&&isJie(p))return prompt(s,p,name,'lianying',{targets:alive(s).map(t=>t.id),minTargets:1,maxTargets:Math.min(info.n||1,alive(s).length)});
  if(name==='英姿'||name==='闭月'||name==='激昂'||name==='枭姬'||name==='连营'){
    if(name==='英姿')return prompt(s,p,name,'drawBonus');
    const n=name==='枭姬'?2*(info.n||1):name==='闭月'&&isJie(p)&&!p.hand.length?2:1;
    return prompt(s,p,name,'draw',{info:{n}});
  }
  if(name==='整论')return prompt(s,p,name,'replaceDraw');
  if(name==='遗礼')return prompt(s,p,name,'orange',{targets:livingTargets(s,p),minTargets:1,choices:[{id:'hp',label:'失去1体力，赠一橘'},...(st.marks.orange?[{id:'orange',label:'移去一橘，赠一橘'}]:[])]});
  if(name==='突袭')return prompt(s,p,name,'stealDraw',{targets:livingTargets(s,p,t=>t.hand.length>0),minTargets:1,maxTargets:Math.min(2,livingTargets(s,p,t=>t.hand.length>0).length)});
  if(name==='裸衣')return prompt(s,p,name,isJie(p)?'revealBare':'bare');
  if(name==='洛神')return prompt(s,p,name,'judge');if(name==='雷击')return prompt(s,p,name,'leiji',{targets:livingTargets(s,p),minTargets:1});
  if(name==='观星')return prompt(s,p,name,'peek',{info:{n:isJie(p)?alive(s).length<4?3:5:Math.min(5,alive(s).length)}});
  if(name==='奸雄'){if(!isJie(p)&&!info.card&&!info.cards?.length)return;return prompt(s,p,name,'jianxiong',{info});}
  if(name==='反馈'||name==='刚烈'&&e.stage==='take'){
    const t=s.players.find(t=>t.id===info.source);if(!t||t.dead||!t.hand.length&&!t.equip.length&&!t.judge.length)return;
    return prompt(s,p,name,'take',{info,choices:[...(t.hand.length?[{id:'hand',label:name==='反馈'?'获得随机手牌':'弃随机手牌'}]:[]),...(t.equip.length+t.judge.length?[{id:'public',label:name==='反馈'?'获得所选公开牌':'弃所选公开牌'}]:[])],zone:'public',hint:`选择 ${t.name} 的装备或判定牌，或随机手牌`});
  }
  if(name==='刚烈')return prompt(s,p,name,'judge',{info});
  if(name==='遗计')return prompt(s,p,name,'yiji',{info:{budget:2}});
  if(name==='节命')return prompt(s,p,name,'jieming',{targets:alive(s).map(t=>t.id),minTargets:1});
  if(name==='狂骨')return prompt(s,p,name,'kuanggu',{choices:[{id:'heal',label:'回复1点'},{id:'draw',label:'摸一张'}]});
  if(name==='放逐')return prompt(s,p,name,'fangzhu',{targets:livingTargets(s,p),minTargets:1,info:{n:p.maxHp-p.hp}});
  if(name==='耀武')return prompt(s,p,name,'yaowu',{optional:false,choices:[{id:'heal',label:'回复1点'},{id:'draw',label:'摸一张'}]});
  if(name==='暴虐')return prompt(s,p,name,'judge',{info});
  if(name==='崩坏'){if(alive(s).every(t=>p.hp<=t.hp)||st.turn.benghuaiDisabled)return;return prompt(s,p,name,'benghuai',{optional:false,choices:[{id:'hp',label:'失去1体力'},...(p.maxHp>1?[{id:'max',label:'减少1点上限'}]:[])]});}
  if(name==='行殇')return prompt(s,p,name,'xingshang',{info,choices:[{id:'take',label:'获得死者遗牌'},{id:'heal',label:'回复1点'}]});
  if(name==='天妒')return prompt(s,p,name,'tiandu',{info});
  if(name==='颂威')return prompt(s,p,name,'songwei',{info});
  if(name==='好施')return prompt(s,p,name,'haoshi');
  if(name==='双雄')return prompt(s,p,name,'shuangxiong');
  if(name==='据守')return prompt(s,p,name,'jushou');
  if(name==='进趋')return prompt(s,p,name,'jinqu');
  if(name==='集智')return prompt(s,p,name,'jizhi');
  if(name==='荐降'){const min=Math.min(...alive(s).map(t=>t.hand.length));return prompt(s,p,name,'jianjiang',{targets:alive(s).filter(t=>t.hand.length===min).map(t=>t.id),minTargets:1});}
  if(name==='罪论'){const quota=Number((st.turn.damage||0)>0)+Number(!(st.turn.discarded||0))+Number(alive(s).every(t=>p.hand.length<=t.hand.length));return prompt(s,p,name,'zuilunStart',{targets:quota?[]:livingTargets(s,p),minTargets:quota?0:1,info:{quota}});}
  if(name==='奇制'){const ids=alive(s).filter(t=>!info.excluded.includes(t.id)&&(t.hand.length+t.equip.length+t.judge.length>0)).map(t=>t.id);if(ids.length)return prompt(s,p,name,'qizhi',{targets:ids,minTargets:1});return;}
  if(name==='英魂'){const n=p.maxHp-p.hp;if(n>0)return prompt(s,p,name,'yinghun',{targets:livingTargets(s,p),minTargets:1,choices:[{id:'many',label:`目标摸${n}弃1`},{id:'one',label:`目标摸1弃${n}`}],info:{n}});return;}
}

export function resolveSkill(s,p,a){
  if(resolveComplete(s,p,a))return;
  const q=s.rules.pending;check(q?.kind==='skill'&&q.player===p.id,'等待对应玩家决定技能');const st=stateOf(p),info=q.internal||{},ids=a.cards||[],targets=a.targets||[];
  check(Array.isArray(ids)&&new Set(ids).size===ids.length&&Array.isArray(targets)&&new Set(targets).size===targets.length,'技能选择重复或无效');
  if(a.choice==='decline'){check(q.optional,'此技能必须完成选择');s.rules.pending=null;if(q.stage==='lordHelp')nextLordHelp(s,info);return;}
  check(q.choices.some(c=>c.id===a.choice),'技能选项无效');check(targets.length>=q.minTargets&&targets.length<=q.maxTargets&&targets.every(id=>q.targetIds.includes(id)&&!seat(s,id).dead),'请选择技能要求的目标');
  check(ids.length>=q.minCards&&ids.length<=q.maxCards||q.zone==='public','请选择技能要求的材料数量');
  if(ids.length&&q.zone!=='public')check(ids.every(id=>q.zone==='peek'?s.peek[p.id]?.includes(id):q.zone==='both'?p.hand.includes(id)||p.equip.includes(id)||q.stage==='lordHelp'&&isUsableHand(p,id):q.zone==='equip'?p.equip.includes(id):p.hand.includes(id)),'技能材料已移动或不属于你的可用区');
  const t=targets.length?seat(s,targets[0]):null,name=q.skill;s.rules.pending=null;
  if(q.stage==='lordHelp'){
    const dragon=info.resume?.kind==='borrow'&&info.resume.skill==='青龙偃月刀',rest=dragon?s.rules.queue:null;if(dragon)s.rules.queue=[];
    check(!st.turn.handBlocked||ids.every(id=>!p.hand.includes(id)),'本回合不能使用或打出手牌');
    const requestor=seat(s,info.requestor),desired=name==='护驾'?'shan':'sha';let kind;try{kind=effectiveKind(p,ids,a.as||null);}catch{kind=effectiveKind(p,ids,desired);}if(kind!==desired&&!(desired==='sha'&&['fire_sha','thunder_sha'].includes(kind)))kind=effectiveKind(p,ids,desired);
    check(desired==='sha'?['sha','fire_sha','thunder_sha'].includes(kind):kind===desired,'盟友需要提供指定的牌或合法转化');check(ids.length===1||ids.length===2&&desired==='sha'&&equipKind(p,'weapon')==='zhangba','牌的材料数不符');recordPlay(s,p,ids,kind,[requestor.id],true);if(dragon)completeHandUse(s,p,ids,kind);removeOwned(s,p,ids,{reason:'use'});
    if(info.active){s.pool.push(...ids);s.rules.queue.push({type:'skillVirtualUse',source:requestor.id,cards:ids,target:info.target,kind});}
    else if(dragon){s.pool.push(...ids);s.rules.resolving.push(...ids);s.rules.queue.push({type:'equipmentSlash',owner:requestor.id,target:info.resume.target,cards:ids,kind,provided:true},...rest);}
    else{s.discard.push(...ids);const resume=info.resume;resume.remaining--;if(resume.remaining>0)s.rules.pending=resume;else if(resume.kind==='duel'){const other=resume.opponent;resume.opponent=requestor.id;resume.player=other;resume.remaining=hasSkill(requestor,'无双')?2:1;s.rules.pending=resume;}else if(resume.kind==='borrow')s.rules.queue.unshift({type:'slash',source:requestor.id,target:resume.target,card:ids[0],cards:ids,amount:1,nature:'normal'});}
    if(desired==='shan'&&hasSkill(p,'雷击'))s.rules.queue.unshift(task(p,'雷击'));note(s,`${p.name} 响应${requestor.name}的「${name}」，打出 ${ids.map(cardLabel).join('、')}。`);return;
  }
  if(q.stage==='draw'){drawCards(s,p,info.n);}
  else if(q.stage==='wangzun'){drawCards(s,p,1);stateOf(seat(s,info.lord)).turn.handLimit=(stateOf(seat(s,info.lord)).turn.handLimit||0)-1;}
  else if(q.stage==='jianjiang')drawCards(s,t,1);
  else if(q.stage==='congjian'){const id=ids[0],equipment=!!CARD_MAP[CARD_BY_ID[id].kind].slot;giveCards(s,p,t,ids);drawCards(s,p,equipment?2:1);}
  else if(q.stage==='weidiStart'){
    const available=info.cards.filter(id=>s.discard.includes(id));for(const id of available)s.discard.splice(s.discard.indexOf(id),1);s.pool.push(...available);offerWeidi(s,p,{available,used:[]});
  }
  else if(q.stage==='weidiGift'){
    if(a.choice==='give'){check(ids.length===1&&info.available.includes(ids[0])&&s.pool.includes(ids[0])&&t&&!info.used.includes(t.id),'每人至多分配一张本阶段弃牌');s.pool.splice(s.pool.indexOf(ids[0]),1);t.hand.push(ids[0]);info.available=info.available.filter(id=>id!==ids[0]);info.used.push(t.id);note(s,`${p.name} 伪帝分配 ${cardLabel(ids[0])} 给 ${t.name}。`);offerWeidi(s,p,info);}else finishWeidi(s,info.available);
  }
  else if(q.stage==='zuilunStart'){
    check(!s.peek[p.id]?.length,'先归还已有观看牌');s.peek[p.id]=s.deck.splice(0,3);const data={quota:Math.min(info.quota,s.peek[p.id].length),afterLoss:info.quota?[]:[p.id,t.id]};
    if(data.quota)prompt(s,p,name,'zuilunTake',{optional:false,zone:'peek',maxCards:data.quota,info:data,choices:[{id:'take',label:`所选收入手牌（最多${data.quota}张），其余置顶`}]});else startZuilunArrange(s,p,data);
  }
  else if(q.stage==='zuilunTake'){for(const id of ids)s.peek[p.id].splice(s.peek[p.id].indexOf(id),1);p.hand.push(...ids);startZuilunArrange(s,p,info);}
  else if(q.stage==='juzhanSource'){st.marks.juzhan=false;st.turn.noTargets??=[];st.turn.noTargets.push(info.target);s.rules.queue.unshift({type:'skillPick',owner:p.id,target:info.target,operation:'take'});}
  else if(q.stage==='juzhanTarget'){st.marks.juzhan=true;drawCards(s,p,1);drawCards(s,seat(s,info.source),1);stateOf(seat(s,info.source)).turn.noTargets??=[];stateOf(seat(s,info.source)).turn.noTargets.push(p.id);}
  else if(q.stage==='jianchu')s.rules.queue.unshift({type:'skillPick',owner:p.id,target:info.target,operation:'discard',afterJianchu:info});
  else if(q.stage==='liyu')s.rules.queue.unshift({type:'skillPick',owner:p.id,target:info.target,operation:'take',afterLiyu:{owner:p.id,target:info.target}});
  else if(q.stage==='liyuDuel'){const source=seat(s,info.source);check(!(hasSkill(t,'空城')&&!t.hand.length),'空城：不能指定此决斗目标');const rest=s.rules.queue;s.rules.queue=[];prepareUseSkills(s,source,'juedou',[],[t]);s.rules.queue.push({type:'duel',source:source.id,target:t.id,counter:true,cardKind:'juedou'},...rest);}
  else if(q.stage==='lijunGive'){st.used.lijun=1;moveToHand(s,seat(s,info.lord),info.cards);s.rules.queue.unshift(task(seat(s,info.lord),name,'decision',{stage:'lijunDraw',data:{source:p.id}}));}
  else if(q.stage==='lijunDraw')drawCards(s,seat(s,info.source),1);
  else if(q.stage==='zhibaAccept'){if(a.choice==='accept')s.rules.pending={kind:'pindian',players:[info.source,p.id],player:null,skill:'制霸',initiator:info.source};}
  else if(q.stage==='zhibaTake'){if(a.choice==='yes')moveToHand(s,p,info.cards);finishWeidi(s,info.cards);}
  else if(q.stage==='lianying'){for(const id of targets)drawCards(s,seat(s,id),1);}
  else if(q.stage==='leiji')s.rules.queue.unshift({type:'judge',target:t.id,purpose:'skill:雷击',skillInfo:{owner:p.id,target:t.id}});
  else if(q.stage==='rendeBasic'){const kind=a.choice,targets=['tao','jiu'].includes(kind)?[p.id]:a.targets;check(targets.length===1,'虚拟杀需要一个目标');s.rules.queue.push({type:'skillFreeUse',source:p.id,kind,targets});}
  else if(q.stage==='drawBonus')st.turn.drawBonus=(st.turn.drawBonus||0)+1;
  else if(q.stage==='replaceDraw'){st.turn.replaceDraw=true;st.marks.orange=(st.marks.orange||0)+1;}
  else if(q.stage==='orange'){stateOf(t).marks.orange=(stateOf(t).marks.orange||0)+1;if(a.choice==='orange')st.marks.orange--;else loseHp(s,p);}
  else if(q.stage==='stealDraw'){
    for(const id of targets){const other=seat(s,id);check(other.hand.length,'目标已无手牌');const card=other.hand.splice(randomIndex(other.hand.length),1)[0];p.hand.push(card);note(s,`${p.name} 突袭获得 ${other.name} 一张手牌。`);}
    st.turn.drawBonus=(st.turn.drawBonus||0)-targets.length;if(!isJie(p))st.turn.replaceDraw=true;
  }
  else if(q.stage==='bare'){st.turn.drawBonus=(st.turn.drawBonus||0)-1;st.marks.bare=true;}
  else if(q.stage==='revealBare'){st.turn.replaceDraw=true;st.marks.bare=true;const got=[];for(let i=0;i<3;i++){const id=topCard(s);if(id)got.push(id);}for(const id of got){const c=CARD_BY_ID[id];if(CARD_MAP[c.kind].type==='基本'||CARD_MAP[c.kind].slot==='weapon'||c.kind==='juedou')p.hand.push(id);else s.discard.push(id);}note(s,`${p.name} 裸衣亮出 ${got.map(cardLabel).join('、')}。`);}
  else if(q.stage==='peek'){check(!s.peek[p.id]?.length,'先处理已有观看区');s.peek[p.id]=s.deck.splice(0,info.n);prompt(s,p,name,'arrange',{optional:false,zone:'peek',maxCards:info.n,choices:[{id:'top',label:'按所选顺序置顶'},{id:'bottom',label:'按所选顺序置底'}],info:{allBottom:true},hint:'反复选择若干牌置顶或置底，全部归还后自动继续。'});}
  else if(q.stage==='arrange'){check(ids.length,'请选择观看区的牌');for(const id of ids)s.peek[p.id].splice(s.peek[p.id].indexOf(id),1);if(a.choice==='top'){s.deck.unshift(...ids);info.allBottom=false;}else s.deck.push(...ids);if(s.peek[p.id].length)prompt(s,p,name,'arrange',{...q,info});else{if(isJie(p)&&info.allBottom)st.turn.guanxingAgain=true;for(const id of info.afterLoss||[])s.rules.queue.push(task(seat(s,id),'罪论','applyLoss'));}note(s,`${p.name} 将${ids.length}张观看牌置于牌堆${a.choice==='top'?'顶':'底'}。`);}
  else if(q.stage==='judge')s.rules.queue.unshift({type:'judge',target:name==='暴虐'?info.lord:p.id,purpose:`skill:${name}`,skillInfo:{...info,owner:p.id}});
  else if(q.stage==='jianxiong'){if(info.cards?.length)moveToHand(s,p,info.cards);else if(info.card)moveToHand(s,p,[info.card]);if(isJie(p))drawCards(s,p,1);}
  else if(q.stage==='take'){
    const other=seat(s,info.source);let id;if(a.choice==='hand'){check(other.hand.length,'目标已无手牌');id=other.hand.splice(randomIndex(other.hand.length),1)[0];}
    else{check(ids.length===1&&(other.equip.includes(ids[0])||other.judge.includes(ids[0])),'请选择目标的公开牌');id=ids[0];if(other.equip.includes(id))removeOwned(s,other,[id],{reason:'skill'});else other.judge.splice(other.judge.indexOf(id),1);}
    if(name==='刚烈'){s.discard.push(id);note(s,`${p.name} 刚烈弃置 ${cardLabel(id)}。`);}else{p.hand.push(id);note(s,`${p.name} 反馈获得 ${other.name} ${a.choice==='hand'?'一张手牌':cardLabel(id)}。`);}
  }
  else if(q.stage==='yiji'){
    if(isJie(p)){drawCards(s,p,2);s.rules.queue.unshift(task(p,name,'gift',{budget:2,zone:'hand'}));}
    else{check(!s.peek[p.id]?.length,'先完成现有观看区');s.peek[p.id]=s.deck.splice(0,2);s.rules.queue.unshift(task(p,name,'gift',{budget:s.peek[p.id].length,zone:'peek'}));}
  }
  else if(q.stage==='gift'){
    if(a.choice==='give'){check(ids.length>0&&t,'选择分配牌与目标');giveCards(s,p,t,ids,q.zone);info.budget-=ids.length;}
    if(a.choice==='keep'||info.budget===0){if(q.zone==='peek'){p.hand.push(...(s.peek[p.id]||[]));s.peek[p.id]=[];}}
    else s.rules.queue.unshift(task(p,name,'gift',info));
  }
  else if(q.stage==='jieming'){drawCards(s,t,2);if(t.hand.length<t.maxHp)drawCards(s,p,1);}
  else if(['kuanggu','yaowu','reward'].includes(q.stage)){if(a.choice==='heal')heal(s,p);else drawCards(s,p,q.stage==='reward'?2:1);}
  else if(q.stage==='fangzhu')s.rules.queue.unshift(task(t,name,'decision',{stage:'fangzhuTarget',optional:false,choices:[{id:'flip',label:`摸${info.n}张并翻面`},{id:'lose',label:`弃${info.n}张并失去1体力`}],maxCards:info.n,zone:'both',data:info}));
  else if(q.stage==='fangzhuTarget'){if(a.choice==='flip'){drawCards(s,p,info.n);completeFlip(s,p);}else{check(ids.length===Math.min(info.n,p.hand.length+p.equip.length),'请选择应弃数量');if(ids.length)discard(s,p,ids);loseHp(s,p);}}
  else if(q.stage==='benghuai'){if(a.choice==='max'){p.maxHp--;p.hp=Math.min(p.hp,p.maxHp);}else loseHp(s,p);}
  else if(q.stage==='xingshang'){if(a.choice==='take')moveToHand(s,p,info.cards);else heal(s,p);}
  else if(q.stage==='tiandu')moveToHand(s,p,[info.card]);
  else if(q.stage==='songwei'){const lord=seat(s,info.lord);drawCards(s,lord,1);}
  else if(q.stage==='haoshi'){st.turn.drawBonus=(st.turn.drawBonus||0)+2;st.turn.haoshi=true;}
  else if(q.stage==='haoshiGive')giveCards(s,p,t,ids);
  else if(q.stage==='shuangxiong'){st.turn.replaceDraw=true;const cards=[topCard(s),topCard(s)].filter(Boolean);s.pool.push(...cards);prompt(s,p,name,'chooseShuang',{optional:false,zone:'public',info:{cards},choices:[{id:'take',label:'获得所选一张，另一张弃置'}],hint:'从结算区选择一张本次亮出的牌。'});}
  else if(q.stage==='chooseShuang'){check(ids.length===1&&info.cards.includes(ids[0]),'选择一张双雄亮出的牌');moveToHand(s,p,ids);st.turn.shuangColor=red(CARD_BY_ID[ids[0]])?'red':'black';for(const id of info.cards.filter(id=>!ids.includes(id))){const at=s.pool.indexOf(id);if(at>=0){s.pool.splice(at,1);s.discard.push(id);}}}
  else if(q.stage==='jushou'){completeFlip(s,p);drawCards(s,p,4);s.rules.queue.unshift(task(p,name,'decision',{stage:'jushouDiscard',optional:false,minCards:1,maxCards:1,zone:'hand',choices:[{id:'discard',label:'弃置所选手牌；装备则直接装备'}]}));}
  else if(q.stage==='jushouDiscard'){const id=ids[0],def=CARD_MAP[CARD_BY_ID[id].kind];if(def.slot){check(!st.abolished.includes(def.slot),'此装备栏已废除');const old=p.equip.find(c=>CARD_MAP[CARD_BY_ID[c].kind].slot===def.slot);if(old)discard(s,p,[old]);p.hand.splice(p.hand.indexOf(id),1);p.equip.push(id);}else discard(s,p,ids,{hand:true});}
  else if(q.stage==='jinqu'){drawCards(s,p,2);const n=Math.max(0,p.hand.length-(st.turn.qizhi||0));if(n)s.rules.queue.unshift(task(p,name,'mandatoryDiscard',{n}));}
  else if(q.stage==='jizhi'){if(complete(s)&&st.turn.bonusJizhi)drawCards(s,p,1);else if(isJie(p)){drawCards(s,p,1);const id=p.hand.at(-1);if(id&&CARD_MAP[CARD_BY_ID[id].kind].type==='基本')prompt(s,p,name,'jizhiBasic',{info:{id},choices:[{id:'drop',label:'弃刚摸到的基本牌，手牌上限+1'}]});}else{const id=topCard(s);if(id){s.pool.push(id);note(s,`${p.name} 集智亮出 ${cardLabel(id)}。`);if(CARD_MAP[CARD_BY_ID[id].kind].type!=='基本')moveToHand(s,p,[id]);else if(complete(s))s.rules.queue.unshift({type:'completeSkill',owner:p.id,skill:'集智交换',data:{card:id}});else prompt(s,p,name,'jizhiManual',{optional:false,info:{id},choices:[{id:'drop',label:'将基本牌弃置'},{id:'manual',label:'保留在结算区，换牌分支人工裁定'}]});}}}
  else if(q.stage==='jizhiManual'){if(a.choice==='drop'){const i=s.pool.indexOf(info.id);if(i>=0){s.pool.splice(i,1);s.discard.push(info.id);}}}
  else if(q.stage==='jizhiBasic'){check(p.hand.includes(info.id),'该牌已不在手中');discard(s,p,[info.id]);st.turn.handLimit=(st.turn.handLimit||0)+1;}
  else if(q.stage==='qizhi'){if(name==='奇制')st.turn.qizhi=(st.turn.qizhi||0)+1;s.rules.queue.unshift({type:'skillPick',owner:p.id,target:t.id,operation:'discard',afterDraw:name==='奇制'?t.id:null});}
  else if(q.stage==='yinghun'){const draw=a.choice==='many'?info.n:1,drop=a.choice==='many'?1:info.n;drawCards(s,t,draw);const n=Math.min(drop,t.hand.length+t.equip.length);if(n)s.rules.queue.unshift(task(t,name,'mandatoryDiscard',{n,zone:'both'}));}
  else if(q.stage==='discard'){discard(s,p,ids,{hand:q.zone==='hand'});if(info.suits)st.turn.freeSuits=[...new Set(ids.map(id=>CARD_BY_ID[id].suit))];}
  else if(q.stage==='feijunTarget'){if(info.give)giveCards(s,p,seat(s,info.source),ids);else discard(s,p,ids);}
  else if(q.stage==='luanwu'){
    if(a.choice==='lose')loseHp(s,p);else{check(t&&ids.length>0&&owns(p,ids),'选择杀材料和最近的目标');const kind=effectiveKind(p,ids,a.as||null);check(['sha','fire_sha','thunder_sha'].includes(kind),'需要杀或合法杀转化');check(!(hasSkill(t,'空城')&&!t.hand.length),'空城：不能指定此目标');check(!st.turn.handBlocked||ids.every(id=>!p.hand.includes(id)),'雄乱：不能使用手牌');check(unlimitedDistance(s,p,t,ids,kind)||distance(s,p.id,t.id)<=cardAttackRange(s,p,ids),'目标在最近距离但超出攻击范围，请选择失去体力');const rest=s.rules.queue;s.rules.queue=[];prepareUseSkills(s,p,kind,ids,[t]);removeOwned(s,p,ids,{reason:'use'});s.pool.push(...ids);s.rules.resolving.push(...ids);s.rules.queue.push({type:'slash',source:p.id,target:t.id,card:ids[0],cards:[...ids],sourceHand:p.hand.length,targetHand:t.hand.length,ignoreArmor:equipKind(p,'weapon')==='qinggang',amount:1,nature:kind==='fire_sha'?'fire':kind==='thunder_sha'?'thunder':'normal',color:ids.every(id=>cardRedFor(p,CARD_BY_ID[id]))?'red':ids.every(id=>!cardRedFor(p,CARD_BY_ID[id]))?'black':'none'},...(complete(s)?[{type:'skillAfterUse',owner:p.id,kind,cards:[...ids],useKey:s.rev+':'+ids.join('.'),targets:[t.id]},{type:'completeFinishUse',cards:[...ids]}]:[]),...rest);}
  }
  else if(q.stage==='quhuDamage')s.rules.queue.unshift({type:'damage',source:info.source,target:t.id,amount:1});
  else if(q.stage==='liegong'){s.skillFlags??={};s.skillFlags[info.key]={noDodge:info.noDodge,extraDamage:info.extraDamage};}
  else if(q.stage==='tieqi')s.rules.queue.unshift({type:'judge',target:p.id,purpose:'skill:铁骑',skillInfo:info});
  else if(q.stage==='xiangle'){if(a.choice==='pay'){check(ids.length===1&&CARD_MAP[CARD_BY_ID[ids[0]].kind].type==='基本','须弃一张基本牌');discard(s,p,ids,{hand:true});}else{s.skillFlags??={};s.skillFlags[info.key]={cancel:true};}}
  else if(q.stage==='qianxun'){const n=p.hand.length;st.shelter??=[];st.shelter.push(...p.hand);p.hand=[];if(n&&hasSkill(p,'连营')){st.turn.lastLossRev=s.rev;s.rules.queue.unshift(task(p,'连营','offer',{n}));}}
  else if(q.stage==='fanjianGuess'){
    const source=seat(s,info.source);check(source.hand.length>0,'来源已无手牌');const id=source.hand.splice(randomIndex(source.hand.length),1)[0];p.hand.push(id);note(s,`${p.name} 猜${a.choice}，获得并展示 ${cardLabel(id)}。`);if(CARD_BY_ID[id].suit!==a.choice)s.rules.queue.unshift({type:'damage',source:source.id,target:p.id,amount:1});
  }
  else if(q.stage==='jieFanjian'){
    if(a.choice==='lose')loseHp(s,p);else{const cards=p.hand.filter(id=>CARD_BY_ID[id].suit===info.suit);note(s,`${p.name} 展示全部手牌：${p.hand.map(cardLabel).join('、')}。`);if(cards.length)discard(s,p,cards,{hand:true});}
  }
  else if(q.stage==='gangleCost'){if(a.choice==='discard'){check(ids.length===2&&ids.every(id=>p.hand.includes(id)),'须弃两张手牌');discard(s,p,ids,{hand:true});}else s.rules.queue.unshift({type:'damage',source:info.source,target:p.id,amount:1});}
  else if(q.stage==='pick'){
    const other=seat(s,info.target);let id;if(a.choice==='hand'){check(other.hand.length,'已无手牌');id=other.hand.splice(randomIndex(other.hand.length),1)[0];}
    else{check(ids.length===1&&info.allowed.includes(ids[0])&&(other.equip.includes(ids[0])||other.judge.includes(ids[0])),'请选择目标可操作的公开牌');id=ids[0];if(other.equip.includes(id))removeOwned(s,other,[id],{reason:'skill'});else other.judge.splice(other.judge.indexOf(id),1);}
    if(info.operation==='take'){p.hand.push(id);note(s,`${p.name} 获得 ${other.name} ${a.choice==='hand'?'一张手牌':cardLabel(id)}。`);}else{s.discard.push(id);st.turn.discarded=(st.turn.discarded||0)+1;note(s,`${p.name} 弃置 ${other.name} 的 ${cardLabel(id)}。`);}if(info.afterDraw)drawCards(s,seat(s,info.afterDraw),1);
    if(info.afterJianchu){if(CARD_MAP[CARD_BY_ID[id].kind].slot){s.skillFlags??={};s.skillFlags[info.afterJianchu.key]={...(s.skillFlags[info.afterJianchu.key]||{}),noDodge:true};}else moveToHand(s,other,info.afterJianchu.cards||[]);}
    if(info.afterLiyu){if(CARD_MAP[CARD_BY_ID[id].kind].slot){const candidates=livingTargets(s,other,t=>t.id!==p.id);if(candidates.length)s.rules.queue.unshift(task(other,'利驭','decision',{stage:'liyuDuel',optional:false,minTargets:1,targets:candidates,data:{source:p.id}}));}else drawCards(s,other,1);}
  }
  else throw new Error('此技能步骤尚未实现，请保留人工裁定');
  note(s,`${p.name} 完成「${name}」的${q.stage==='arrange'?'牌序操作':'技能选择'}。`);
}

export function processSkillPick(s,e){
  const p=seat(s,e.owner),t=seat(s,e.target);if(p.dead||t.dead)return;
  const protectedEquip=id=>e.owner!==e.target&&e.operation==='discard'&&hasSkill(t,'奇才')&&(isJie(t)?['armor','treasure'].includes(CARD_MAP[CARD_BY_ID[id].kind].slot):!['minus','plus'].includes(CARD_MAP[CARD_BY_ID[id].kind].slot));
  const allowed=[...t.equip.filter(id=>!protectedEquip(id)),...t.judge];if((e.fieldOnly||!t.hand.length)&&!allowed.length){if(e.afterDraw)drawCards(s,seat(s,e.afterDraw),1);return;}
  prompt(s,p,e.skill||'技能选牌','pick',{optional:false,zone:'public',info:{...e,allowed},choices:[...(!e.fieldOnly&&t.hand.length?[{id:'hand',label:'随机手牌'}]:[]),...(allowed.length?[{id:'public',label:'所选装备 / 判定牌'}]:[])],hint:`选择 ${t.name} 的牌区`});
}
export function prepareSkillSlash(s,e){
  if(!s.skillAutomation||e.skillPrepared)return false;const p=seat(s,e.source),t=seat(s,e.target);e.skillPrepared=true;e.skillKey=`${s.rev}:${e.source}:${e.target}:${e.card||'virtual'}`;s.rules.queue.unshift({...e});
  const jobs=completeSlashJobs(s,e);
  if(hasSkill(p,'烈弓'))jobs.push(task(p,'烈弓','decision',{stage:'liegong',data:{key:e.skillKey,noDodge:(e.sourceHand??p.hand.length)>=(e.targetHand??t.hand.length),extraDamage:p.hp<=t.hp?1:0}}));
  if(skillGeneral(p,'铁骑')==='machao'&&hasSkill(p,'铁骑'))jobs.push(task(p,'铁骑','decision',{stage:'tieqi',data:{key:e.skillKey}}));
  if(hasSkill(t,'享乐'))jobs.push(task(p,'享乐','decision',{stage:'xiangle',optional:false,maxCards:1,choices:[{id:'pay',label:'弃一张基本牌'},{id:'cancel',label:'杀对目标无效'}],data:{key:e.skillKey}}));
  if(hasSkill(p,'鞬出')&&t.hand.length+t.equip.length+t.judge.length)jobs.push(task(p,'鞬出','decision',{stage:'jianchu',data:{key:e.skillKey,target:t.id,cards:e.cards||[e.card]}}));
  if(hasSkill(p,'拒战')&&stateOf(p).marks.juzhan&&t.hand.length+t.equip.length+t.judge.length)jobs.push(task(p,'拒战','decision',{stage:'juzhanSource',data:{target:t.id}}));
  if(hasSkill(t,'拒战')&&!stateOf(t).marks.juzhan)jobs.push(task(t,'拒战','decision',{stage:'juzhanTarget',data:{source:p.id}}));
  s.rules.queue.unshift(...jobs);return true;
}
export function afterSkillPindian(s,q,a,b,ca,cb,winner){
  if(completePindian(s,q,a,b,ca,cb,winner))return;
  if(!s.skillAutomation||!q.skill)return;
  const st=stateOf(a);
  if(q.skill==='天义')st.turn.tianyi=winner===a.id;
  if(q.skill==='驱虎'){
    if(winner!==a.id)s.rules.queue.unshift({type:'damage',source:b.id,target:a.id,amount:1});
    else{const targets=livingTargets(s,b,t=>distance(s,b.id,t.id)<=attackRange(b));if(targets.length)s.rules.queue.unshift(task(a,'驱虎','decision',{stage:'quhuDamage',optional:false,targets,minTargets:1,data:{source:b.id}}));}
  }
  if(q.skill==='制霸'&&winner!==a.id){s.rules.queue.unshift(task(b,'制霸','decision',{stage:'zhibaTake',optional:false,data:{cards:[ca,cb]},choices:[{id:'yes',label:'获得双方拼点牌'},{id:'no',label:'不获得，正常弃置'}]}));}else finishWeidi(s,[ca,cb]);
}
export function afterSkillUse(s,e){
  completeAfterUse(s,e);
  const p=seat(s,e.owner);if(!s.skillAutomation||p.dead)return;
  if(e.kind==='nanman'){const receiver=alive(s).find(t=>t.id!==p.id&&hasSkill(t,'巨象'));if(receiver)moveToHand(s,receiver,e.cards);}
  if(e.guoseDraw)drawCards(s,p,1);
  if(e.luanji&&!(s.skillUseDamage?.[e.useKey]||0))drawCards(s,p,e.targets.length);
  if(['sha','fire_sha','thunder_sha'].includes(e.kind)&&s.turn===p.id&&s.phase===3&&faction(p)==='吴'&&!stateOf(p).used.lijun&&e.cards.every(id=>s.pool.includes(id))){const lord=alive(s).find(t=>t.id!==p.id&&t.role==='lord'&&hasSkill(t,'立军'));if(lord)s.rules.queue.unshift(task(p,'立军','decision',{stage:'lijunGive',data:{cards:e.cards,lord:lord.id}}));}
  if(s.skillUseDamage)delete s.skillUseDamage[e.useKey];
}
function finishWeidi(s,cards){for(const id of cards){const at=s.pool.indexOf(id);if(at>=0){s.pool.splice(at,1);s.discard.push(id);}}}
function offerWeidi(s,p,info){const targets=livingTargets(s,p,t=>faction(t)==='群'&&!info.used.includes(t.id));if(!info.available.length||!targets.length){finishWeidi(s,info.available);return;}prompt(s,p,'伪帝','weidiGift',{optional:false,zone:'public',targets,maxTargets:1,maxCards:1,info,choices:[{id:'give',label:'所选弃牌交给目标（每人一张）'},{id:'finish',label:'完成，剩余仍弃置'}]});}
function startZuilunArrange(s,p,info){if(!s.peek[p.id]?.length){for(const id of info.afterLoss||[])s.rules.queue.push(task(seat(s,id),'罪论','applyLoss'));return;}prompt(s,p,'罪论','arrange',{optional:false,zone:'peek',maxCards:3,info,choices:[{id:'top',label:'按所选顺序置顶'}]});}

export function resolveSkillJudge(s,q,c){
  if(completeJudge(s,q))return true;
  if(!q.purpose?.startsWith('skill:'))return false;const name=q.purpose.slice(6),info=q.skillInfo||{},p=seat(s,info.owner||q.player),st=stateOf(p),judged=seat(s,q.player),isRed=red(c),suit=hasSkill(judged,'红颜')&&c.suit==='S'?'H':c.suit;
  if(name==='洛神'){if(!isRed&&suit!=='H'){moveToHand(s,p,[q.card]);s.rules.queue.unshift(task(p,name));}}
  if(name==='刚烈'&&info.source){const t=s.players.find(t=>t.id===info.source&&!t.dead);if(t){if(isJie(p)){if(isRed)s.rules.queue.unshift({type:'damage',source:p.id,target:t.id,amount:1});else s.rules.queue.unshift(task(p,name,'take',{source:t.id}));}else if(suit!=='H')s.rules.queue.unshift(task(t,name,'decision',{stage:'gangleCost',optional:false,maxCards:2,zone:'hand',choices:[{id:'discard',label:'弃两张手牌'},{id:'damage',label:'承受1点伤害'}],data:{source:p.id}}));}}
  if(name==='铁骑'){s.skillFlags??={};s.skillFlags[info.key]={noDodge:isRed};}
  if(name==='雷击'){if(suit==='S')s.rules.queue.unshift({type:'damage',source:p.id,target:q.player,amount:2,nature:'thunder'});else if(suit==='C'){heal(s,p);s.rules.queue.unshift({type:'damage',source:p.id,target:q.player,amount:1,nature:'thunder'});}}
  if(name==='暴虐'&&suit==='S')heal(s,seat(s,info.lord));
  return true;
}

export function activateSkill(s,p,a){
  check(s.skillAutomation,'本桌未开启扩展技能自动结算');check(s.status==='playing'&&!p.dead,'当前不能发动技能');const name=a.skill,st=stateOf(p),ids=a.cards||[],targets=(a.targets||[]).map(id=>seat(s,id));
  check(ACTIVE_SKILLS.has(name),'此技能没有主动自动入口');check(hasSkill(p,name)||['黄天','制霸'].includes(name),'你没有此技能');
  check(ids.length<=skillInput(s,p,name).maxCards,'此技能不需要这些材料；按技能步骤重新选择');
  if(['护驾','激将'].includes(name)){
    check(p.role==='lord','只有主公能发动主公技');const q=s.rules.pending,desired=name==='护驾'?'shan':'sha',responsive=q&&q.player===p.id&&q.required===desired;
    check(responsive||name==='激将'&&!q&&s.turn===p.id&&s.phase===3,'当前没有对应的主公技时机');if(!responsive)check(targets.length===1&&targets[0].id!==p.id,'主动激将需要指定杀的目标');
    const list=alive(s).filter(t=>t.id!==p.id&&faction(t)===(name==='护驾'?'魏':'蜀')).map(t=>t.id);check(list.length>0,'没有可请求的同势力盟友');s.rules.pending=null;nextLordHelp(s,{requestor:p.id,list,index:0,resume:responsive?q:null,active:!responsive,target:targets[0]?.id,skill:name});return;
  }
  const rescue=name==='涅槃'&&s.rules.pending?.kind==='save'&&s.rules.pending.target===p.id;
  check(rescue||p.hp>0,'濒死时请先完成救援');
  check(rescue||!s.rules.pending&&!s.rules.queue.length,'请先完成当前响应');check(rescue||s.turn===p.id&&s.phase===3,'请在自己的出牌阶段发动');
  check(new Set(ids).size===ids.length&&new Set(targets.map(t=>t.id)).size===targets.length&&targets.every(t=>!t.dead),'技能材料或目标重复');
  const once=()=>{check(!st.used[name],'本回合已发动此技能');st.used[name]=1;};
  const other=()=>{check(targets.length===1&&targets[0].id!==p.id,'选择一名其他角色');return targets[0];};
  const limited=()=>{check(!st.marks[name],'此限定技已经用过');st.marks[name]=true;};
  if(name==='制衡'){once();check(ids.length>0&&owns(p,ids),'选择弃置牌');const all=p.hand.length>0&&p.hand.every(id=>ids.includes(id));discard(s,p,ids);drawCards(s,p,ids.length+(isJie(p)&&all?1:0));}
  else if(name==='反间'){once();const t=other();check(p.hand.length>0,'需要有手牌');if(isJie(p)){check(ids.length===1&&p.hand.includes(ids[0]),'选择一张手牌');const suit=CARD_BY_ID[ids[0]].suit;giveCards(s,p,t,ids);note(s,`${p.name} 展示反间牌 ${cardLabel(ids[0])}。`);prompt(s,t,name,'jieFanjian',{optional:false,choices:[{id:'show',label:'展示手牌并弃同花色牌'},{id:'lose',label:'失去1体力'}],info:{suit}});}else prompt(s,t,name,'fanjianGuess',{optional:false,choices:['S','H','C','D'].map(id=>({id,label:{S:'猜黑桃',H:'猜红桃',C:'猜梅花',D:'猜方块'}[id]})),info:{source:p.id}});}
  else if(name==='苦肉'){if(isJie(p)){once();check(ids.length===1,'弃置一张牌');discard(s,p,ids);}loseHp(s,p);if(!isJie(p))s.rules.queue.push(drawEvent(p,2));}
  else if(name==='仁德'){const t=other(),before=st.used.rende||0;if(isJie(p)){st.turn.rendeTargets??=[];check(!st.turn.rendeTargets.includes(t.id),'本阶段已仁德给过该目标');st.turn.rendeTargets.push(t.id);}giveCards(s,p,t,ids);st.used.rende=before+ids.length;if(before<2&&st.used.rende>=2){if(!isJie(p))heal(s,p);else prompt(s,p,name,'rendeBasic',{targets:alive(s).map(t=>t.id),maxTargets:1,choices:(s.deckSet==='standard'?['sha','tao']:['sha','fire_sha','thunder_sha','tao','jiu']).map(id=>({id,label:'视为使用'+CARD_MAP[id].name})),hint:'自用基本牌无需选目标；杀需选择一名合法目标。'});}}
  else if(name==='国色'){check(isJie(p),'标准国色请使用基础转化入口');check(ids.length===1&&owns(p,ids)&&cardSuitFor(p,CARD_BY_ID[ids[0]])==='D'&&targets.length===1,'选一张方块牌和一名目标');check(!st.used.guose,'本阶段已经发动国色');if(a.option==='remove'){const t=targets[0],id=t.judge.find(id=>(s.delayKinds[id]||CARD_BY_ID[id].kind)==='le');check(id,'目标判定区没有乐不思蜀');discard(s,p,ids);t.judge.splice(t.judge.indexOf(id),1);s.discard.push(id);delete s.delayKinds[id];st.used.guose=1;drawCards(s,p,1);}else s.rules.queue.push({type:'skillGuose',source:p.id,cards:ids,target:targets[0].id});}
  else if(name==='青囊'){check(ids.length===1&&targets.length===1&&targets[0].hp<targets[0].maxHp,'选择一张手牌和一名受伤角色');if(isJie(p)){check(!(st.turn.qingnangTargets||[]).includes(targets[0].id)&&!st.turn.qingnangStopped,'本阶段不能再次发动青囊或选择该目标');st.turn.qingnangTargets??=[];st.turn.qingnangTargets.push(targets[0].id);if(!red(CARD_BY_ID[ids[0]]))st.turn.qingnangStopped=true;}else once();discard(s,p,ids,{hand:true});heal(s,targets[0]);}
  else if(name==='结姻'){once();const t=other();check(gender(t)==='男','目标须为男性');if(!isJie(p)){check(ids.length===2&&t.hp<t.maxHp,'弃两张手牌，目标须已受伤');discard(s,p,ids,{hand:true});heal(s,p);heal(s,t);}else{check(ids.length===1&&p.hand.includes(ids[0]),'选择一张手牌或装备牌');const def=CARD_MAP[CARD_BY_ID[ids[0]].kind];if(a.option==='equip'){check(def.slot&&!stateOf(t).abolished.includes(def.slot)&&!t.equip.some(id=>CARD_MAP[CARD_BY_ID[id].kind].slot===def.slot),'目标对应装备栏须为空且可用');p.hand.splice(p.hand.indexOf(ids[0]),1);t.equip.push(ids[0]);}else discard(s,p,ids,{hand:true});if(p.hp!==t.hp){const higher=p.hp>t.hp?p:t,lower=higher===p?t:p;drawCards(s,higher,1);heal(s,lower);}}}
  else if(name==='离间'){once();check(ids.length===1&&targets.length===2&&targets.every(t=>t.id!==p.id&&gender(t)==='男'),'弃一张牌并选择两名其他男性');check(!(hasSkill(targets[1],'空城')&&!targets[1].hand.length),'空城：不能指定此决斗目标');discard(s,p,ids);prepareUseSkills(s,targets[0],'juedou',[],[targets[1]]);s.rules.queue.push({type:'duel',source:targets[0].id,target:targets[1].id,counter:true,cardKind:'juedou'});}
  else if(name==='强袭'){const t=other();st.turn.qiangxi??=[];check(!st.turn.qiangxi.includes(t.id),'本阶段已强袭该目标');const weapon=ids.length===1&&CARD_MAP[CARD_BY_ID[ids[0]].kind].slot==='weapon';check(!ids.length||weapon,'弃一张武器，或不选牌失去1体力');const range=ids.some(id=>p.equip.includes(id))?1:attackRange(p);check(distance(s,p.id,t.id)<=range,'目标超出支付武器后的攻击范围');st.turn.qiangxi.push(t.id);if(weapon)discard(s,p,ids);else loseHp(s,p);s.rules.queue.push({type:'damage',source:p.id,target:t.id,amount:1});}
  else if(name==='奇谋'){limited();check(Number.isInteger(a.value)&&a.value>=1&&a.value<=p.hp,'失去体力数应在1与当前体力之间');st.turn.distanceReduction=(st.turn.distanceReduction||0)+a.value;st.turn.extraSlash=(st.turn.extraSlash||0)+a.value;loseHp(s,p,a.value);}
  else if(name==='涅槃'){limited();const cards=[...p.hand,...p.equip];if(cards.length)discard(s,p,cards);s.discard.push(...p.judge);p.judge=[];st.faceDown=false;p.chained=false;drawCards(s,p,3);heal(s,p,Math.max(0,Math.min(3,p.maxHp)-p.hp));if(rescue&&p.hp>0)s.rules.pending=null;}
  else if(name==='直谏'){const t=other();check(ids.length===1&&p.hand.includes(ids[0]),'选择一张手中装备');const def=CARD_MAP[CARD_BY_ID[ids[0]].kind];check(def.slot&&!stateOf(t).abolished.includes(def.slot)&&!t.equip.some(id=>CARD_MAP[CARD_BY_ID[id].kind].slot===def.slot),'目标相应装备栏须为空且可用');p.hand.splice(p.hand.indexOf(ids[0]),1);t.equip.push(ids[0]);drawCards(s,p,1);}
  else if(name==='缔盟'){once();check(targets.length===2&&targets.every(t=>t.id!==p.id),'选择两名其他角色');check(ids.length===Math.abs(targets[0].hand.length-targets[1].hand.length),'弃牌数须等于两人手牌差');if(ids.length)discard(s,p,ids);[targets[0].hand,targets[1].hand]=[targets[1].hand,targets[0].hand];note(s,`${targets[0].name} 与 ${targets[1].name} 交换手牌，不公开牌面。`);}
  else if(name==='挑衅'){once();const t=other();s.rules.pending={kind:'borrow',skill:'挑衅',player:t.id,source:p.id,target:p.id,required:'sha',remaining:1};}
  else if(name==='驱虎'||name==='天义'||name==='制霸'){
    if(name==='制霸'){once();const lord=alive(s).find(t=>t.role==='lord'&&hasSkill(t,'制霸'));check(lord&&p.id!==lord.id&&faction(p)==='吴','须为其他吴角色向制霸主公发起');targets.splice(0,targets.length,lord);}else once();const t=other();check(p.hand.length&&t.hand.length,'双方须有手牌');check(!hasSkill(t,'谦节'),'谦节：不能被拼点');if(name==='驱虎')check(t.hp>p.hp,'驱虎目标体力须比你多');if(name==='制霸'&&stateOf(t).marks.hunzi)prompt(s,t,name,'zhibaAccept',{optional:false,info:{source:p.id},choices:[{id:'accept',label:'接受拼点'},{id:'refuse',label:'拒绝拼点'}]});else s.rules.pending={kind:'pindian',players:[p.id,t.id],player:null,skill:name,initiator:p.id};
  }
  else if(name==='黄天'){once();const lord=alive(s).find(t=>t.role==='lord'&&hasSkill(t,'黄天'));check(lord&&lord.id!==p.id&&faction(p)==='群'&&ids.length===1&&['shan','shandian'].includes(CARD_BY_ID[ids[0]].kind),'群角色交一张闪或闪电给黄天主公');giveCards(s,p,lord,ids);}
  else if(name==='成略'){once();const yin=!!st.marks.chenglue;st.marks.chenglue=!yin;drawCards(s,p,yin?2:1);s.rules.queue.push(task(p,name,'mandatoryDiscard',{n:yin?1:2,suits:true}));}
  else if(name==='飞军'){once();const t=other();check(ids.length===1,'先弃一张牌');discard(s,p,ids);const handEligible=t.hand.length>p.hand.length,equip=t.equip.length>p.equip.length;const branch=a.option||(handEligible?'hand':'equip');check(branch==='hand'?handEligible:branch==='equip'&&equip,'所选分支要求目标手牌或装备比你多');const hand=branch==='hand';st.marks.feijunTargets??=[];if(hasSkill(p,'兵略')&&!st.marks.feijunTargets.includes(t.id)){st.marks.feijunTargets.push(t.id);drawCards(s,p,2);}s.rules.queue.push(task(t,name,'decision',{stage:'feijunTarget',optional:false,minCards:1,maxCards:1,zone:hand?'hand':'equip',data:{source:p.id,give:hand},choices:[{id:'pay',label:hand?'交一张手牌':'弃一张装备'}]}));}
  else if(name==='雄乱'){limited();const t=other();if(p.equip.length)discard(s,p,[...p.equip]);s.discard.push(...p.judge);p.judge=[];st.abolished=['weapon','armor','plus','minus','treasure','judge'];st.turn.xiongluan=t.id;stateOf(t).turn.handBlocked=true;}
  else if(name==='怀柔'){check(ids.length===1&&CARD_MAP[CARD_BY_ID[ids[0]].kind].slot,'选择一张装备重铸');discard(s,p,ids,{hand:true});drawCards(s,p,1);}
  else if(name==='决堰'){check(a.option!=='treasure'||complete(s),'旧局不启用宝物分支');once();check(['weapon','armor','horses',...(complete(s)?['treasure']:[])].includes(a.option),'选择要废除的装备栏');const slots=a.option==='horses'?['plus','minus']:[a.option];check(slots.every(x=>!st.abolished.includes(x)),'此装备栏已废除');const costs=p.equip.filter(id=>slots.includes(CARD_MAP[CARD_BY_ID[id].kind].slot));if(costs.length)discard(s,p,costs);st.abolished.push(...slots);if(a.option==='weapon')st.turn.extraSlash=(st.turn.extraSlash||0)+3;if(a.option==='armor'){drawCards(s,p,3);st.turn.handLimit=(st.turn.handLimit||0)+3;}if(a.option==='horses')st.turn.unlimitedDistance=true;if(a.option==='treasure')st.turn.bonusJizhi=true;}
  else if(name==='乱武'){limited();for(const t of alive(s).filter(t=>t.id!==p.id))s.rules.queue.push(task(t,name,'decision',{stage:'luanwu',optional:false,targets:livingTargets(s,t,x=>distance(s,t.id,x.id)===Math.min(...alive(s).filter(x=>x.id!==t.id).map(x=>distance(s,t.id,x.id)))),maxTargets:1,maxCards:2,zone:complete(s)?'both':'hand',choices:[{id:'slash',label:'对最近角色出杀'},{id:'lose',label:'失去1点体力'}]}));}
  else throw new Error('此技能仍需人工裁定');note(s,`${p.name} 发动「${name}」，系统执行效果。`);
}
function nextLordHelp(s,info){
  const p=s.players.find(t=>t.id===info.list[info.index]&&!t.dead);if(!p){if(info.index<info.list.length){info.index++;nextLordHelp(s,info);}else if(info.resume)s.rules.pending=info.resume;return;}
  const current={...info,index:info.index+1};prompt(s,p,info.skill,'lordHelp',{maxCards:2,zone:'both',info:current,hint:`可为${seat(s,info.requestor).name}提供${info.skill==='护驾'?'闪':'杀'}，或放弃`});
}
