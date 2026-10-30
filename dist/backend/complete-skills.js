import {settleWood,storedCards} from './wood.js';
import {GENERAL_MAP,GENERALS} from '../data/generals.js';
import {CARD_BY_ID,CARD_MAP,cardLabel,red} from '../data/cards.js';
import {check,seat,alive,hasSkill,drawCards,removeOwned,topCard,note,event,distance,attackRange,cardRedFor,cardSuitFor,randomIndex,shuffle,skillGeneral} from './primitives.js';
import {cardMotion,recordPlay} from './presentation.js';

// These handlers belong to the authoritative transaction, not the animation queue.
export const complete=s=>!!s.completeSkills&&!!s.skillAutomation;
export const cs=p=>(p.skillState??={used:{},marks:{},turn:{},gained:[],lost:[],faceDown:false,abolished:[]});
const zoneNames=['field','honor','duty','wound','song'];
export const special=(p,z)=>(cs(p).zones??={})[z]??=([]);
export const specialCards=p=>zoneNames.flatMap(z=>p.skillState?.zones?.[z]||[]);
const living=(s,p,fn=()=>true)=>alive(s).filter(t=>t.id!==p.id&&fn(t)).map(t=>t.id);
const job=(p,skill,step='offer',data={})=>({type:'completeSkill',owner:p.id,skill,step,data});
const enqueue=(s,...jobs)=>s.rules.queue.unshift(...jobs.filter(Boolean));
const option=(id,label,extra={})=>({id,label,...extra});
function ask(s,p,skill,step,{options=[option('yes','发动')],optional=true,cards=[],targets=[],minCards=0,maxCards=minCards,minTargets=0,maxTargets=minTargets,hint='',data={},cardTargets=null}={}){
  s.skillPromptSeq=(s.skillPromptSeq||0)+1;
  s.rules.pending={kind:'skill',windowId:`${s.rev}:${s.skillPromptSeq}`,player:p.id,skill,stage:`complete:${step}`,choices:options,optional,zone:'public',minCards,maxCards,minTargets,maxTargets,targetIds:targets,hint,internal:{...data,allowedCards:[...cards]},cardChoices:[...cards],...(cardTargets?{cardTargets}:{})};
}
function heal(s,p,n=1){const a=Math.min(n,p.maxHp-p.hp);if(a>0){p.hp+=a;event(s,'heal',{player:p.id,amount:a});note(s,`${p.name} 回复${a}点体力。`);}}
function loss(s,p,n=1){p.hp-=n;event(s,'hp',{player:p.id,amount:-n});enqueue(s,{type:'checkDying',target:p.id});if(hasSkill(p,'诈降'))s.rules.queue.push({type:'skillTask',owner:p.id,skill:'诈降',stage:'apply',info:{n}});}
function drop(s,p,ids){if(!ids.length)return;removeOwned(s,p,ids,{reason:'discard'});s.discard.push(...ids);cs(p).turn.discarded=(cs(p).turn.discarded||0)+ids.length;note(s,`${p.name} 弃置 ${ids.map(cardLabel).join('、')}。`);}
function take(s,p,ids){for(const id of ids){const src=[s.pool,s.discard,s.deck,...s.players.flatMap(t=>[t.hand,t.equip,t.judge,...zoneNames.map(z=>special(t,z)),cs(t).shelter||[]])].find(z=>z.includes(id));if(!src)continue;const owner=s.players.find(t=>t.hand===src||t.equip===src);if(owner)removeOwned(s,owner,[id],{reason:'obtain'});else src.splice(src.indexOf(id),1);p.hand.push(id);}}
function give(s,p,t,ids){removeOwned(s,p,ids,{handOnly:true,reason:'give'});t.hand.push(...ids);cardMotion(s,ids,{zone:'hand',owner:p.id},{zone:'hand',owner:t.id},{actor:p.id});note(s,`${p.name} 交给 ${t.name} ${ids.length}张牌。`);}
function store(s,p,z,ids){removeOwned(s,p,ids,{reason:'store'});special(p,z).push(...ids);note(s,`${p.name} 放置${ids.length}张${{field:'田',honor:'荣',duty:'任',wound:'创',song:'箜声'}[z]}。`);}
function maxDown(s,p){p.maxHp=Math.max(1,p.maxHp-1);p.hp=Math.min(p.hp,p.maxHp);}
function gained(p,name){if(!cs(p).gained.includes(name))cs(p).gained.push(name);}
function viewCards(s,p,target){return [...seat(s,target).hand];}
const type=id=>CARD_MAP[CARD_BY_ID[id].kind].type;
const suit=(p,id)=>cardSuitFor(p,CARD_BY_ID[id]);
const color=(p,id)=>cardRedFor(p,CARD_BY_ID[id]);
function flip(s,p){cs(p).faceDown=!cs(p).faceDown;if(!cs(p).faceDown&&hasSkill(p,'解围')&&p.hand.length)enqueue(s,job(p,'解围'));}
export function completeFlip(s,p){if(complete(s))flip(s,p);else cs(p).faceDown=!cs(p).faceDown;}

export function startComplete(s){
  if(!complete(s))return;
  for(const p of s.players){cs(p).zones??={};
    if(hasSkill(p,'明任')){drawCards(s,p,1);s.rules.queue.push(job(p,'明任','initial'));}
    if(hasSkill(p,'征荣')){const id=topCard(s);if(id)special(p,'honor').push(id);}
    if(hasSkill(p,'化身')){addAvatars(s,p,3);s.rules.queue.push(job(p,'化身','initial'));}
  }
  s.skillMoveBaseline=locations(s);
}
function addAvatars(s,p,n){
  const held=new Set(s.players.flatMap(t=>[t.general,...(cs(t).avatars||[])]).map(id=>GENERAL_MAP[id]?.baseName));
  const list=shuffle(GENERALS.filter(g=>s.generalPacks.includes(g.pack)&&!held.has(g.baseName)&&g.id!=='zuoci').map(g=>g.id)),chosen=[];
  for(const id of list)if(!held.has(GENERAL_MAP[id].baseName)){chosen.push(id);held.add(GENERAL_MAP[id].baseName);if(chosen.length===n)break;}
  cs(p).avatars??=[];cs(p).avatars.push(...chosen);note(s,`${p.name} 获得${chosen.length}张化身。`);
}
const borrowable=sk=>!/^主公技|^限定|^觉醒/.test(sk.text)&&!['化身','新生'].includes(sk.name);
function avatarOptions(p){return (cs(p).avatars||[]).flatMap(id=>GENERAL_MAP[id].skills.filter(borrowable).map(sk=>option(`${id}:${sk.name}`,`${GENERAL_MAP[id].name} · ${sk.name}`)));}

// Observe real card locations between effects. Reasons are attached by removeOwned,
// and private IDs stay exclusively in the authority. Nothing is inferred from logs.
function locations(s){const out={};const put=(ids,z,owner)=>{for(const id of ids||[])out[id]={zone:z,owner};};put(s.deck,'deck');put(s.discard,'discard');put(s.pool,'pool');for(const p of s.players){for(const z of ['hand','equip','judge'])put(p[z],z,p.id);for(const z of zoneNames)put(special(p,z),z,p.id);put(cs(p).shelter,'shelter',p.id);put(storedCards(p),'wood',p.id);put(s.peek[p.id],'peek',p.id);put(s.rules.commits[p.id],'commit',p.id);}return out;}
export function observeCompleteMoves(s){
  settleWood(s);
  if(!complete(s)||s.status!=='playing')return;
  for(const p of s.players)if(p.hp>0)delete cs(p).marks.buquDying;
  const prev=s.skillMoveBaseline||{},now=locations(s),losses=new Map(),gains=new Map(),outside=[],inside=[];
  s.skillMoveBaseline=now;
  for(const [id,b]of Object.entries(now)){const a=prev[id];if(!a||a.zone===b.zone&&a.owner===b.owner)continue;
    if(b.zone==='discard'){const t=cs(seat(s,s.turn)).turn;t.redDiscards=(t.redDiscards||0)+(red(CARD_BY_ID[id])?1:0);if(s.phase===4&&a.owner===s.turn){t.phaseDiscards??=[];if(!t.phaseDiscards.includes(id))t.phaseDiscards.push(id);}}
    if(a.owner&&['hand','equip'].includes(a.zone)&&!(b.owner===a.owner&&['hand','equip'].includes(b.zone))){if(!losses.has(a.owner))losses.set(a.owner,[]);losses.get(a.owner).push({id,zone:a.zone,reason:s.skillMoveCauses?.[id]||'move'});}
    if(b.zone==='hand'&&b.owner&&!(a.zone==='hand'&&a.owner===b.owner)){if(!gains.has(b.owner))gains.set(b.owner,[]);gains.get(b.owner).push(id);}
    if(['song','shelter','field','honor','duty','wound','wood'].includes(b.zone)&&!['song','shelter','field','honor','duty','wound','wood'].includes(a.zone))outside.push(id);
    if(b.zone==='hand'&&['song','shelter','field','honor','duty','wound','wood'].includes(a.zone))inside.push(id);
  }
  s.skillMoveCauses={};const jobs=[];
  for(const [owner,items]of losses){const p=seat(s,owner);if(p.dead)continue;
    if(s.turn!==owner&&hasSkill(p,'屯田'))jobs.push(job(p,'屯田'));
    if(items.some(x=>x.zone==='hand'&&!['use','respond'].includes(x.reason)))for(const t of alive(s))if(hasSkill(t,'奋激')&&!cs(t).turn.fenji?.includes(owner))jobs.push(job(t,'奋激','offer',{target:owner}));
  }
  for(const [owner,ids]of gains){const p=seat(s,owner);if(hasSkill(p,'清俭')&&!(s.turn===owner&&s.phase===2)&&!cs(p).used['清俭'])jobs.push(job(p,'清俭','offer',{cards:ids}));}
  for(const p of alive(s).filter(t=>hasSkill(t,'良姻'))){if(outside.length)jobs.push(job(p,'良姻','outside'));if(inside.length)jobs.push(job(p,'良姻','inside'));}
  s.rules.queue.push(...jobs);
}

export function completePhase(s,p,phase,afterAvatar=false){
  if(!complete(s))return;const st=cs(p),jobs=[];
  if(phase===0&&hasSkill(p,'化身')&&!afterAvatar){if(st.avatar)s.rules.queue.push(job(p,'化身'));s.rules.queue.push({type:'completePhaseSkills',owner:p.id,phase});return;}
  if(phase===0){
    delete st.marks.substitute;
    if(st.turn.bonusJizhi)delete st.turn.bonusJizhi;
    if(hasSkill(p,'凿险')&&!st.marks.zaoxian&&special(p,'field').length>=3){st.marks.zaoxian=true;maxDown(s,p);gained(p,'急袭');note(s,`${p.name} 凿险觉醒，获得急袭。`);}
    if(hasSkill(p,'鸿举')&&!st.marks.hongju&&special(p,'honor').length>=3){drawCards(s,p,special(p,'honor').length);maxDown(s,p);st.marks.hongju=true;gained(p,'清侧');}
    if(hasSkill(p,'勤学')&&!st.marks.qinxue&&p.hand.length-p.hp>=(s.size>=7?2:3)){st.marks.qinxue=true;maxDown(s,p);gained(p,'攻心');}
    if(hasSkill(p,'箜声')&&p.hand.length+p.equip.length)jobs.push(job(p,'箜声'));
  }
  if([1,3,4].includes(phase)&&hasSkill(p,'神速'))jobs.push(job(p,'神速',String(phase)));
  if([1,2,3,4].includes(phase)&&hasSkill(p,'巧变')&&p.hand.length)jobs.push(job(p,'巧变',String(phase)));
  if(phase===3&&hasSkill(p,'放权'))jobs.push(job(p,'放权'));
  if(phase===5){
    if(hasSkill(p,'明任')&&p.hand.length)jobs.push(job(p,'明任','replace'));
    if(hasSkill(p,'镇骨'))jobs.push(job(p,'镇骨'));
    if(hasSkill(p,'箜声')&&special(p,'song').length)jobs.push(job(p,'箜声','return'));
  }
  s.rules.queue.push(...jobs);
}
export function completeLeave(s,p,phase){
  if(!complete(s))return [];const st=cs(p),jobs=[];
  if(st.turn.skipPhases?.includes(phase))return jobs;
  if(phase===3&&hasSkill(p,'替身'))jobs.push(job(p,'替身'));
  if(phase===4){
    if(hasSkill(p,'再起')&&st.turn.redDiscards)jobs.push(job(p,'再起','offer',{n:st.turn.redDiscards}));
    if(hasSkill(p,'溃诛')&&st.turn.phaseDiscards?.length)jobs.push(job(p,'溃诛','offer',{n:st.turn.phaseDiscards.length}));
    const cards=(st.turn.phaseDiscards||[]).filter(id=>s.discard.includes(id));if(cards.length)for(const t of alive(s))if(t.id!==p.id&&hasSkill(t,'固政'))jobs.push(job(t,'固政','offer',{target:p.id,cards}));
  }
  if(phase===5){
    if(st.turn.fangquan&&p.hand.length)jobs.push(job(p,'放权','extra'));
    for(const t of s.players){const ts=cs(t);if(ts.marks.zhenguTarget===p.id||t.id===p.id&&ts.turn.zhengu)jobs.push(job(t,'镇骨','adjust',{target:ts.marks.zhenguTarget}));
      if(!t.dead&&ts.marks.shenshiWatch?.some(w=>seat(s,w.target).hand.includes(w.card)))drawCards(s,t,Math.max(0,4-t.hand.length));delete ts.marks.shenshiWatch;}
    if(hasSkill(p,'化身'))jobs.push(job(p,'化身'));
  }
  return jobs;
}

export function beforeCompleteDamage(s,e){
  if(!complete(s)||e.completeDamage)return false;const p=seat(s,e.target);
  if(hasSkill(p,'天香')&&p.hand.some(id=>suit(p,id)==='H')){enqueue(s,job(p,'天香','offer',{effect:{...e,completeDamage:true}}));return true;}return false;
}
export function completeDying(s,p,source){
  if(!complete(s)||!hasSkill(p,'不屈')||p.hp>0||p.dead||cs(p).marks.buquDying)return false;
  const st=cs(p),before=p.hp;p.hp=1;event(s,'heal',{player:p.id,amount:1-before});st.turn.fenji=[];
  const id=topCard(s);if(!id)return true;const wounds=special(p,'wound');
  if(wounds.some(c=>CARD_BY_ID[c].rank===CARD_BY_ID[id].rank)){s.discard.push(id);st.marks.buquDying=true;loss(s,p);}
  else wounds.push(id);note(s,`${p.name} 不屈展示 ${cardLabel(id)}${wounds.includes(id)?'，置为创':'，点数重复，移去新创并失去1体力'}。`);return true;
}
export function completeAfterDamage(s,e){
  if(!complete(s))return;const p=seat(s,e.target),a=s.players.find(t=>t.id===e.source),jobs=[];
  if(!p.dead){if(hasSkill(p,'新生'))for(let i=0;i<e.amount;i++)jobs.push(job(p,'新生'));
    if(hasSkill(p,'审时')&&cs(p).marks.shenshi&&a&&!a.dead&&p.hand.length)jobs.push(job(p,'审时','yin',{source:a.id}));
    if(hasSkill(p,'双雄')&&e.kind==='juedou'&&e.useKey&&s.completeUses?.[e.useKey]?.shuangxiong){const ids=(s.completeUses[e.useKey].responses||[]).filter(x=>x.owner!==p.id).map(x=>x.card);if(ids.some(id=>s.discard.includes(id)))jobs.push(job(p,'双雄','reclaim',{cards:ids}));}
  }
  if(e.kind==='sha')for(const t of alive(s))if(hasSkill(t,'悲歌')&&t.hand.length+t.equip.length)jobs.push(job(t,'悲歌','offer',e));
  if(e.useKey){s.completeUses??={};s.completeUses[e.useKey]??={};s.completeUses[e.useKey].damaged??=[];s.completeUses[e.useKey].damaged.push(p.id);}
  enqueue(s,...jobs);
}
export function completeAfterDeath(s,p,killer){if(!complete(s))return;for(const t of [p,killer].filter(Boolean))if(hasSkill(t,'破虏'))enqueue(s,job(t,'破虏','offer',{allowDead:true}));}

export function completeBeforeEffect(s,e){
  if(!complete(s))return false;const flags=s.completeUses?.[e.useKey];
  if(flags?.nullTargets?.includes(e.target))return true;
  if(flags?.unrespondable){delete e.counter;e.noDodge=true;e.unrespondable=true;if(e.type==='duel'){enqueue(s,{...e,type:'damage',amount:1,duel:true,slash:false,completeDamage:false});return true;}}
  const p=e.target?seat(s,e.target):null;
  if(p&&e.type==='slash'&&e.skillPrepared&&!e.liuliChecked&&hasSkill(p,'流离')&&p.hand.length+p.equip.length){e.liuliChecked=true;enqueue(s,job(p,'流离','offer',{effect:e}));return true;}
  if(p&&e.type==='judge'&&e.delayed&&(e.source||s.delaySources?.[e.delayed])&&(e.source||s.delaySources?.[e.delayed])!==p.id&&hasSkill(p,'谦逊')&&skillGeneral(p,'谦逊')==='jie_luxun'&&p.hand.length&&!e.completeQianxun){e.completeQianxun=true;enqueue(s,job(p,'谦逊','delayed',{effect:e}));return true;}
  return false;
}
export function completePrepareUse(s,p,kind,ids,targets){
  if(!complete(s))return;const key=s.rev+':'+ids.join('.'),st=cs(p);s.completeUses??={};const data=s.completeUses[key]??={};data.firstType=!st.turn.usedTypes?.includes(CARD_MAP[kind].type);st.turn.usedTypes??=[];st.turn.usedTypes.push(CARD_MAP[kind].type);data.shuangxiong=kind==='juedou'&&ids.some(id=>CARD_BY_ID[id].kind!=='juedou')&&hasSkill(p,'双雄');
  Object.assign(data,{owner:p.id,kind,cards:[...ids]});
  if(s.turn===p.id&&s.phase===3&&hasSkill(p,'往烈'))s.rules.queue.push(job(p,'往烈','offer',{key}));
  if(CARD_MAP[kind].type==='锦囊'&&targets.length>1)for(const t of alive(s))if(hasSkill(t,'奋威')&&!cs(t).marks.fenwei)s.rules.queue.push(job(t,'奋威','offer',{key,targets:targets.map(x=>x.id)}));
}
export function completeSlashJobs(s,e){
  if(!complete(s))return [];const p=seat(s,e.source),t=seat(s,e.target),jobs=[];
  if(hasSkill(p,'烈刃')&&p.hand.length&&t.hand.length&&!hasSkill(t,'谦节'))jobs.push(job(p,'烈刃','offer',{target:t.id}));
  if(skillGeneral(p,'铁骑')==='jie_machao'&&hasSkill(p,'铁骑'))jobs.push(job(p,'铁骑','offer',{target:t.id,key:e.skillKey}));
  return jobs;
}
export function completeAfterUse(s,e){
  if(!complete(s))return;const p=seat(s,e.owner),st=cs(p),data=s.completeUses?.[e.useKey]||{},jobs=[];
  if(hasSkill(p,'恃才')&&data.firstType&&e.cards.some(id=>s.pool.includes(id)||p.equip.includes(id)))jobs.push(job(p,'恃才','offer',{cards:e.cards}));
  if(hasSkill(p,'征荣')&&s.turn===p.id&&s.phase===3&&e.targets.some(id=>id!==p.id))jobs.push(job(p,'征荣'));
  if(['sha','fire_sha','thunder_sha'].includes(e.kind))for(const id of e.targets){const t=seat(s,id);if(cs(t).marks.substitute&&!data.damaged?.includes(id)&&e.cards.some(c=>s.pool.includes(c)))jobs.push(job(t,'替身','take',{cards:e.cards}));}
  enqueue(s,...jobs);
}
export function completeHandUse(s,p,ids,kind){if(complete(s)&&s.turn!==p.id&&ids.length&&ids.every(id=>p.hand.includes(id))&&hasSkill(p,'涯角'))s.rules.queue.push(job(p,'涯角','offer',{type:CARD_MAP[kind].type}));}
export function completeFinishedCards(s,discarded,completed=null){if(!complete(s))return;for(const [key,data]of Object.entries(s.completeUses||{})){if(completed&&!data.cards?.some(id=>completed.includes(id)))continue;const p=s.players.find(p=>p.id===data.owner);if(p&&!p.dead&&s.turn!==p.id&&hasSkill(p,'贞良')&&cs(p).marks.zhenliang&&special(p,'duty').length&&type(special(p,'duty')[0])===CARD_MAP[data.kind]?.type&&data.cards?.some(id=>discarded.includes(id)))s.rules.queue.push(job(p,'贞良','yin'));delete s.completeUses[key];}}
export function completeResponse(s,p,ids,kind,q){
  if(!complete(s))return;
  if(q.useKey){s.completeUses??={};s.completeUses[q.useKey]??={};s.completeUses[q.useKey].responses??=[];s.completeUses[q.useKey].responses.push(...ids.map(card=>({owner:p.id,card})));}
  if(s.turn!==p.id&&hasSkill(p,'涯角')&&ids.every(id=>p.hand.includes(id)))s.rules.queue.push(job(p,'涯角','offer',{type:CARD_MAP[kind].type}));
  if(s.turn!==p.id&&hasSkill(p,'贞良')&&cs(p).marks.zhenliang&&special(p,'duty').length&&type(special(p,'duty')[0])===CARD_MAP[kind].type)s.rules.queue.push(job(p,'贞良','yin'));
}

export function processComplete(s,e){
  if(!complete(s))return;const p=seat(s,e.owner),st=cs(p),n=e.skill,d=e.data||{},step=e.step||'offer';if(p.dead&&!d.allowDead)return;
  const hand=[...p.hand],both=[...hand,...p.equip],all=alive(s).map(t=>t.id),other=living(s,p);
  const prompt=(more={})=>ask(s,p,n,step,{data:d,...more});
  if(n==='巧变'&&st.turn.skipPhases?.includes(+step)||n==='放权'&&step==='offer'&&st.turn.skipPhases?.includes(3))return;
  if(n==='化身'){const choices=avatarOptions(p);return prompt({options:choices.length?[...choices,...(step==='initial'?[]:[option('exchange','更换至多两张未亮化身')])]:[option('none','暂无可用化身，继续')],optional:step!=='initial',hint:'选择化身及其中一个技能；未亮化身仅本人可见'});}
  if(n==='新生')return prompt();
  if(n==='明任')return prompt({cards:hand,minCards:1,optional:step!=='initial',hint:step==='initial'?'选择一张手牌置为任':'选择一张手牌替换任'});
  if(n==='箜声'){
    if(step==='return'){const ids=[...special(p,'song')],equipment=ids.filter(id=>CARD_MAP[CARD_BY_ID[id].kind].slot&&!st.abolished.includes(CARD_MAP[CARD_BY_ID[id].kind].slot));
      if(equipment.length)return prompt({cards:equipment,minCards:1,optional:false,hint:'选择下一件使用的装备；同槽装备可依次替换'});
      take(s,p,ids);return;
    }return prompt({cards:both,minCards:1,maxCards:both.length});
  }
  if(n==='清俭'){if(st.used[n]||!hand.length)return;return prompt({cards:hand,minCards:1,maxCards:hand.length,targets:other,minTargets:1,hint:'选择要交出的牌与接收者；可继续分配给其他角色'});}
  if(n==='奋激'){if(st.turn.fenji?.includes(d.target)||seat(s,d.target).dead)return;return prompt({hint:`失去1点体力，令${seat(s,d.target).name}摸两张`});}
  if(n==='良姻'){const targets=living(s,p,t=>step==='outside'?t.hand.length>p.hand.length:t.hand.length<p.hand.length&&t.hand.length+t.equip.length>0);if(!targets.length)return;return prompt({targets,minTargets:1});}
  if(n==='屯田')return prompt();
  if(n==='天香')return prompt({cards:hand.filter(id=>suit(p,id)==='H'),minCards:1,targets:other,minTargets:1,options:[option('damage','转为1点伤害，之后摸已损失体力张牌'),option('loss','令其失去1点体力并获得弃牌')],hint:'弃红桃手牌并防止原伤害'});
  if(n==='流离'){
    const targets=living(s,p,t=>t.id!==d.effect.source&&!d.effect.redirected?.includes(t.id)&&distance(s,p.id,t.id)<=attackRange(p));
    if(!targets.length){enqueue(s,d.effect);return;}return prompt({cards:both,minCards:1,targets,minTargets:1,hint:'弃一张牌，将杀转给攻击范围内的其他角色'});
  }
  if(n==='谦逊')return prompt({hint:'暂存全部手牌，回合结束取回'});
  if(n==='往烈')return prompt({hint:'使此牌不能被响应；本回合之后不能再使用牌'});
  if(n==='奋威'){if(st.marks.fenwei)return;return prompt({targets:d.targets.filter(id=>!seat(s,id).dead),minTargets:1,maxTargets:d.targets.length,hint:'限定：令锦囊对选定目标无效'});}
  if(n==='铁骑')return prompt({hint:'令目标本回合非锁定技失效，再令其判定并弃同花色牌'});
  if(n==='铁骑弃牌')return prompt({cards:both.filter(id=>suit(p,id)===d.suit),maxCards:1,options:[option('discard','弃一张同花色牌',{minCards:1}),option('no','不弃，本次杀不能闪')],optional:false});
  if(n==='烈刃'){const t=seat(s,d.target);if(!hand.length||!t.hand.length||t.dead)return;return prompt();}
  if(n==='双雄'&&step==='reclaim')return prompt();
  if(n==='悲歌'){if(seat(s,d.target).dead)return;return prompt({cards:both,minCards:1,hint:`弃一张牌，令${seat(s,d.target).name}判定`});}
  if(n==='涯角'){
    if(step==='give')return prompt({targets:all,minTargets:1,optional:false,hint:`亮出${cardLabel(d.card)}，选择接收者`});return prompt();
  }
  if(n==='破虏')return prompt({targets:all,minTargets:1,maxTargets:all.length});
  if(n==='再起')return prompt({targets:all,minTargets:1,maxTargets:Math.min(d.n,all.length)});
  if(n==='再起选择')return prompt({options:[option('draw','自己摸一张'),option('heal','令孟获回复1点体力')],optional:false});
  if(n==='固政'){const cards=d.cards.filter(id=>s.discard.includes(id));if(!cards.length)return;return prompt({cards,minCards:1,hint:'选择一张返还弃牌者，其余弃牌由你获得'});}
  if(n==='溃诛')return prompt({targets:all,minTargets:1,maxTargets:all.length,options:[option('draw',`至多${d.n}人各摸一张`),option('damage',`对体力值之和为${d.n}的角色各造成1伤害`)]});
  if(n==='神速')return prompt({cards:step==='3'?both.filter(id=>CARD_MAP[CARD_BY_ID[id].kind].slot):[],minCards:step==='3'?1:0,targets:other,minTargets:1,hint:step==='1'?'跳过判定和摸牌，视为使用无距离限制的杀':step==='3'?'弃一装备并跳过出牌，视为使用杀':'跳过弃牌并翻面，视为使用杀'});
  if(n==='巧变')return prompt({cards:hand,minCards:1,hint:`弃一张手牌跳过${['准备','判定','摸牌','出牌','弃牌'][+step]}阶段`});
  if(n==='巧变摸牌')return prompt({targets:living(s,p,t=>t.hand.length>0),maxTargets:2,optional:false});
  if(n==='移牌'){
    const pairs=Object.fromEntries(s.players.flatMap(t=>[...t.equip,...t.judge]).map(id=>[id,alive(s).filter(t=>canMoveBoard(s,id,t)).map(t=>t.id)])),cards=Object.keys(pairs).filter(id=>pairs[id].length);if(!cards.length)return;
    return prompt({cards,minCards:1,targets:[...new Set(cards.flatMap(id=>pairs[id]))],cardTargets:pairs,minTargets:1,optional:false,hint:'选择场上一张装备或判定牌，再选择高亮的新归属'});
  }
  if(n==='解围'){if(!hand.length)return;return prompt({cards:hand,minCards:1,hint:'弃一张手牌，再移动场上一张装备或判定牌'});}
  if(n==='放权')return step==='extra'?prompt({cards:hand,minCards:1,targets:other,minTargets:1,hint:'弃一张手牌，令另一角色获得额外回合'}):prompt({hint:'跳过出牌阶段，本回合手牌上限改为体力上限'});
  if(n==='替身'){if(step==='take'){take(s,p,d.cards.filter(id=>s.pool.includes(id)||s.discard.includes(id)));return;}return prompt({hint:'展示手牌，弃置锦囊及坐骑，至下回合开始收回未伤害你的杀'});}
  if(n==='恃才'){if(!d.cards.some(id=>s.pool.includes(id)||p.equip.includes(id)))return;return prompt({hint:'将此牌置于牌堆顶，然后摸一张'});}
  if(n==='征荣'){
    if(!st.marks.zhengrong){const honor=[...special(p,'honor')];return prompt({cards:[...hand,...honor],maxCards:Math.min(hand.length,honor.length)*2,optional:false,hint:'选等量手牌和荣交换（可以不交换）'});}
    const targets=living(s,p,t=>t.hand.length+t.equip.length>0);if(!targets.length)return;return prompt({targets,minTargets:1,optional:false});
  }
  if(n==='征荣取牌'){const t=seat(s,d.target);return prompt({cards:t.equip,options:[...(t.hand.length?[option('hand','随机手牌')]:[]),...(t.equip.length?[option('equip','所选装备',{minCards:1,maxCards:1})]:[])],maxCards:1,optional:false});}
  if(n==='贞良'&&step==='yin')return prompt({targets:all,minTargets:1});
  if(n==='镇骨'){
    if(step==='adjust'){const t=s.players.find(t=>t.id===d.target&&!t.dead);if(!t)return;const target=p.hand.length;if(t.hand.length<target)drawCards(s,t,Math.max(0,Math.min(5,target)-t.hand.length));else if(t.hand.length>target)enqueue(s,{type:'skillTask',owner:t.id,skill:'镇骨',stage:'mandatoryDiscard',info:{n:t.hand.length-target}});if(t.id===s.turn)delete st.marks.zhenguTarget;return;}
    return prompt({targets:other,minTargets:1});
  }
  if(n==='审时'&&step==='yin')return prompt({cards:hand,minCards:1,hint:'查看伤害来源手牌并交给其一张牌；其回合结束仍持有时你补至4张',data:{...d,viewCards:viewCards(s,p,d.source)}});
  if(n==='审时补牌')return prompt({targets:all,minTargets:1});
  if(n==='救援')return prompt({hint:'改为令界孙权回复1点体力，然后你摸一张'});
  if(n==='集智交换')return prompt({cards:hand,maxCards:1,options:[option('exchange','以一张手牌交换',{minCards:1}),option('discard','弃置亮出的基本牌')],optional:false,hint:`亮出${cardLabel(d.card)}；交换的手牌扣置于牌堆顶`});
  if(n==='义绝回复')return prompt({hint:`令${seat(s,d.target).name}回复1点体力`});
  if(n==='强制弃牌'){const count=Math.min(d.n,both.length);if(count)ask(s,p,d.skill||n,'discard',{cards:both,minCards:count,optional:false});return;}
  throw new Error(`未注册的自动技能事件：${n}/${step}`);
}

export function resolveComplete(s,p,a){
  const q=s.rules.pending;if(!q?.stage?.startsWith('complete:'))return false;
  check(q.player===p.id,'等待对应玩家选择');const d=q.internal||{},st=cs(p),n=q.skill,step=q.stage.slice(9),ids=a.cards||[],targets=a.targets||[],c=a.choice;
  check(Array.isArray(ids)&&Array.isArray(targets)&&new Set(ids).size===ids.length&&new Set(targets).size===targets.length,'选择重复或无效');
  if(c==='decline'){check(q.optional,'此步骤必须选择');s.rules.pending=null;if(['天香','流离','谦逊'].includes(n)&&d.effect)enqueue(s,d.effect);if(n==='救援')heal(s,p);return true;}
  const opt=q.choices.find(x=>x.id===c);check(opt,'技能选项无效');const min=opt.minCards??q.minCards,max=opt.maxCards??q.maxCards;
  check(ids.length>=min&&ids.length<=max&&ids.every(id=>d.allowedCards.includes(id)),'请选择要求的技能材料');
  check(targets.length>=(opt.minTargets??q.minTargets)&&targets.length<=(opt.maxTargets??q.maxTargets)&&targets.every(id=>q.targetIds.includes(id)&&!seat(s,id).dead),'请选择要求的技能目标');
  const t=targets.length?seat(s,targets[0]):null;s.rules.pending=null;
  if(step==='discard'){drop(s,p,ids);if(d.after)enqueue(s,d.after);}
  else if(n==='化身'){
    if(c==='none'){}
    else if(c==='exchange'){const available=(st.avatars||[]).filter(id=>id!==st.avatar?.general);if(available.length)ask(s,p,n,'exchange',{options:available.map(id=>option(id,GENERAL_MAP[id].name)),data:{selected:[],eligible:available},hint:'逐一选择要换走的未亮化身，最多两张',optional:true});}
    else if(step==='exchange'){check(st.avatars.includes(c)&&c!==st.avatar?.general,'不能替换当前化身');st.avatars.splice(st.avatars.indexOf(c),1);addAvatars(s,p,1);if(d.selected.length===0){const available=d.eligible.filter(id=>id!==c&&st.avatars.includes(id));if(available.length)ask(s,p,n,'exchange',{options:available.map(id=>option(id,GENERAL_MAP[id].name)),data:{selected:[c],eligible:available},hint:'可再换一张原有未亮化身，或完成',optional:true});}}
    else {const [id,name]=c.split(':');check(st.avatars?.includes(id)&&GENERAL_MAP[id].skills.some(sk=>sk.name===name&&borrowable(sk)),'化身选择无效');const old=st.avatar?.skill;st.avatar={general:id,skill:name};if(old&&old!==name)clearSkillZone(s,p,old);if(step==='initial'){if(name==='怀橘')st.marks.orange=3;if(name==='征荣'){const card=topCard(s);if(card)special(p,'honor').push(card);}if(name==='明任'){drawCards(s,p,1);enqueue(s,job(p,'明任','initial'));}}note(s,`${p.name} 亮出化身${GENERAL_MAP[id].name}，获得${name}。`);}
  }
  else if(n==='新生')addAvatars(s,p,1);
  else if(n==='明任'){const old=[...special(p,'duty')];store(s,p,'duty',ids);take(s,p,old);}
  else if(n==='箜声'){
    if(step==='return'){const id=ids[0],slot=CARD_MAP[CARD_BY_ID[id].kind].slot;check(special(p,'song').includes(id)&&slot&&!st.abolished.includes(slot),'该装备已经不可使用');take(s,p,[id]);enqueue(s,{type:'completeEquip',owner:p.id,card:id},job(p,n,'return'));}
    else store(s,p,'song',ids);
  }
  else if(n==='清俭'){give(s,p,t,ids);st.used[n]=true;st.turn.qingjianTypes??=[];const before=st.turn.qingjianTypes.length;st.turn.qingjianTypes=[...new Set([...st.turn.qingjianTypes,...ids.map(type)])];cs(seat(s,s.turn)).turn.handLimit=(cs(seat(s,s.turn)).turn.handLimit||0)+st.turn.qingjianTypes.length-before;if(p.hand.length)ask(s,p,n,'continue',{cards:p.hand,minCards:1,maxCards:p.hand.length,targets:living(s,p),minTargets:1,hint:'继续分配，或完成'});}
  else if(n==='奋激'){st.turn.fenji??=[];check(!st.turn.fenji.includes(d.target),'本回合已对该角色发动');st.turn.fenji.push(d.target);loss(s,p);enqueue(s,{type:'draw',target:d.target,n:2});}
  else if(n==='良姻'){if(step==='outside'){check(t.hand.length>p.hand.length,'目标手牌条件已变化');drawCards(s,t,1);}else {check(t.hand.length<p.hand.length,'目标手牌条件已变化');enqueue(s,job(t,'强制弃牌','offer',{n:1,skill:n}));}}
  else if(n==='屯田')enqueue(s,{type:'judge',target:p.id,purpose:'complete:屯田',skillInfo:{owner:p.id}});
  else if(n==='天香'){drop(s,p,ids);if(c==='damage')enqueue(s,{...d.effect,target:t.id,amount:1,completeDamage:false,chain:false,slash:false,duel:false,card:null,cards:[],useKey:null}, {type:'completeTianxiangDraw',owner:t.id});else {loss(s,t);take(s,t,ids);} }
  else if(n==='流离'){
    const test=structuredClone(p);test.equip=test.equip.filter(id=>!ids.includes(id));check(t.id!==d.effect.source&&distance(s,p.id,t.id)<=attackRange(test),'弃置装备后目标不在攻击范围内');drop(s,p,ids);const effect={...d.effect,target:t.id,targetHand:t.hand.length,skillPrepared:false,liuliChecked:false,redirected:[...(d.effect.redirected||[]),p.id]};delete effect.skillKey;delete effect.fuyinChecked;enqueue(s,effect);note(s,`${p.name} 将杀转给${t.name}。`);
  }
  else if(n==='谦逊'){const cards=[...p.hand];removeOwned(s,p,cards,{reason:'store'});st.shelter??=[];st.shelter.push(...cards);enqueue(s,d.effect);}
  else if(n==='往烈'){s.completeUses[d.key].unrespondable=true;st.turn.noMoreUse=true;}
  else if(n==='奋威'){check(!st.marks.fenwei,'奋威已使用');st.marks.fenwei=true;s.completeUses[d.key].nullTargets=targets;}
  else if(n==='铁骑'){cs(seat(s,d.target)).turn.silenced=true;enqueue(s,{type:'judge',target:d.target,purpose:'complete:铁骑',skillInfo:{owner:p.id,key:d.key}});}
  else if(n==='铁骑弃牌'){s.skillFlags??={};s.skillFlags[d.key]={...(s.skillFlags[d.key]||{}),noDodge:c==='no'};if(c==='discard')drop(s,p,ids);}
  else if(n==='烈刃'){s.rules.pending={kind:'pindian',players:[p.id,d.target],player:null,skill:n};}
  else if(n==='双雄')take(s,p,d.cards.filter(id=>s.discard.includes(id)));
  else if(n==='悲歌'){drop(s,p,ids);enqueue(s,{type:'judge',target:d.target,purpose:'complete:悲歌',skillInfo:{owner:p.id,...d}});}
  else if(n==='涯角'){
    if(step==='give'){check(s.pool.includes(d.card),'亮出牌已移动');take(s,t,[d.card]);if(type(d.card)!==d.type)enqueue(s,job(p,'强制弃牌','offer',{n:1,skill:n}));}
    else {const id=topCard(s);if(id){s.pool.push(id);note(s,`${p.name} 涯角亮出${cardLabel(id)}。`);enqueue(s,job(p,n,'give',{...d,card:id}));}}
  }
  else if(n==='破虏'){st.marks.polu=(st.marks.polu||0)+1;for(const id of targets)drawCards(s,seat(s,id),st.marks.polu);}
  else if(n==='再起'){enqueue(s,...targets.map(id=>job(seat(s,id),'再起选择','offer',{owner:p.id})));}
  else if(n==='再起选择'){if(c==='draw')drawCards(s,p,1);else heal(s,seat(s,d.owner));}
  else if(n==='固政'){check(ids.every(id=>s.discard.includes(id)),'该弃牌已被其他效果移动');take(s,seat(s,d.target),ids);take(s,p,d.cards.filter(id=>s.discard.includes(id)));}
  else if(n==='溃诛'){if(c==='draw'){check(targets.length<=d.n,'人数不能超过弃牌数');for(const id of targets)drawCards(s,seat(s,id),1);}else {check(targets.reduce((sum,id)=>sum+seat(s,id).hp,0)===d.n,'目标体力之和必须等于弃牌数');enqueue(s,...targets.map(id=>({type:'damage',source:p.id,target:id,amount:1})),targets.length>=2?{type:'damage',source:p.id,target:p.id,amount:1}:null);}}
  else if(n==='神速'){
    st.turn.skipPhases??=[];st.turn.skipPhases.push(+step);if(step==='1')st.turn.skipPhases.push(2);if(step==='3')drop(s,p,ids);if(step==='4')flip(s,p);enqueue(s,{type:'completeVirtualSlash',owner:p.id,target:t.id});
  }
  else if(n==='巧变'){drop(s,p,ids);st.turn.skipPhases??=[];st.turn.skipPhases.push(+step);if(step==='2')enqueue(s,job(p,'巧变摸牌'));if(step==='3')enqueue(s,job(p,'移牌'));}
  else if(n==='巧变摸牌'){for(const id of targets){const other=seat(s,id);if(other.hand.length){const cid=other.hand[randomIndex(other.hand.length)];give(s,other,p,[cid]);}}}
  else if(n==='移牌')moveBoard(s,p,ids[0],t);
  else if(n==='解围'){drop(s,p,ids);enqueue(s,job(p,'移牌'));}
  else if(n==='放权'){if(step==='extra'){drop(s,p,ids);s.extraTurns??=[];s.extraTurns.push(t.id);}else{st.turn.skipPhases??=[];st.turn.skipPhases.push(3);st.turn.fangquan=true;}}
  else if(n==='替身'){note(s,`${p.name} 替身展示${p.hand.map(cardLabel).join('、')||'空手牌'}。`);drop(s,p,p.hand.filter(id=>type(id)==='锦囊'||['plus','minus'].includes(CARD_MAP[CARD_BY_ID[id].kind].slot)));st.marks.substitute=true;}
  else if(n==='恃才'){const cards=d.cards.filter(id=>s.pool.includes(id)||p.equip.includes(id));for(const id of cards){if(p.equip.includes(id))removeOwned(s,p,[id],{reason:'skill'});else s.pool.splice(s.pool.indexOf(id),1);}s.deck.unshift(...cards);drawCards(s,p,1);}
  else if(n==='征荣'){
    if(!st.marks.zhengrong){const h=ids.filter(id=>p.hand.includes(id)),r=ids.filter(id=>special(p,'honor').includes(id));check(h.length===r.length&&h.length+r.length===ids.length,'请选择等量手牌和荣');store(s,p,'honor',h);take(s,p,r);st.marks.zhengrong=true;}
    else{enqueue(s,job(p,'征荣取牌','offer',{target:t.id}));st.marks.zhengrong=false;}
  }
  else if(n==='征荣取牌'){const target=seat(s,d.target),id=c==='hand'?target.hand[randomIndex(target.hand.length)]:ids[0];check(id&&(target.hand.includes(id)||target.equip.includes(id)),'目标牌已移动');removeOwned(s,target,[id],{reason:'obtain'});special(p,'honor').push(id);}
  else if(n==='贞良'){drawCards(s,t,1);st.marks.zhenliang=false;}
  else if(n==='镇骨'){st.marks.zhenguTarget=t.id;st.turn.zhengu=true;}
  else if(n==='审时'){give(s,p,seat(s,d.source),ids);st.marks.shenshi=false;st.marks.shenshiWatch??=[];st.marks.shenshiWatch.push({target:d.source,card:ids[0]});}
  else if(n==='审时补牌')drawCards(s,t,Math.max(0,4-t.hand.length));
  else if(n==='救援'){heal(s,seat(s,d.lord));drawCards(s,p,1);}
  else if(n==='集智交换'){check(s.pool.includes(d.card),'亮出牌已移动');if(c==='exchange'){removeOwned(s,p,ids,{reason:'exchange'});s.deck.unshift(...ids);take(s,p,[d.card]);}else {s.pool.splice(s.pool.indexOf(d.card),1);s.discard.push(d.card);}}
  else if(n==='义绝展示'){
    const id=ids[0],source=seat(s,d.source);check(p.hand.includes(id),'展示牌已移动');note(s,`${p.name} 义绝展示${cardLabel(id)}。`);
    if(!color(p,id)){st.turn.silenced=true;st.turn.handBlocked=true;cs(source).turn.yijueTarget=p.id;}else {give(s,p,source,[id]);enqueue(s,job(source,'义绝回复','offer',{target:p.id}));}
  }
  else if(n==='义绝回复')heal(s,seat(s,d.target));
  else if(n==='攻心'&&step!=='view'){check(seat(s,d.target).hand.includes(ids[0])&&CARD_BY_ID[ids[0]].suit==='H','请选择目标的红桃手牌');removeOwned(s,seat(s,d.target),ids,{reason:'skill'});if(c==='top')s.deck.unshift(...ids);else s.discard.push(...ids);}
  else if(n==='攻心'&&step==='view'){}
  else if(n==='蛊惑声明'){declareBluff(s,p,c,ids,targets,d.resume);}
  else if(n==='蛊惑质疑'){finishBluffQuestion(s,p,c,d);}
  else throw new Error(`未注册的自动技能选择：${n}/${step}`);
  note(s,`${p.name} 完成「${n}」选择，效果由系统结算。`);return true;
}

export function clearSkillZone(s,p,name){const z={屯田:'field',征荣:'honor',明任:'duty',不屈:'wound',箜声:'song'}[name];if(z&&special(p,z).length){s.discard.push(...special(p,z));cs(p).zones[z]=[];note(s,`${p.name} 失去${name}，相应专属牌移入弃牌堆。`);}}
function canMoveBoard(s,id,t){const owner=s.players.find(x=>x.equip.includes(id)||x.judge.includes(id));if(!owner||owner.id===t.id||t.dead)return false;const kind=s.delayKinds[id]||CARD_BY_ID[id].kind,slot=CARD_MAP[kind].slot;return owner.equip.includes(id)?!cs(t).abolished.includes(slot)&&!t.equip.some(cid=>CARD_MAP[CARD_BY_ID[cid].kind].slot===slot):!cs(t).abolished.includes('judge')&&!t.judge.some(cid=>(s.delayKinds[cid]||CARD_BY_ID[cid].kind)===kind);}
function moveBoard(s,p,id,t){
  const owner=s.players.find(x=>x.equip.includes(id)||x.judge.includes(id));check(owner&&owner.id!==t.id,'请选择其他角色作为新归属');
  check(canMoveBoard(s,id,t),'目标不能接收这张场上牌');
  const equip=owner.equip.includes(id),kind=s.delayKinds[id]||CARD_BY_ID[id].kind,slot=CARD_MAP[kind].slot;
  if(equip){check(!cs(t).abolished.includes(slot)&&!t.equip.some(cid=>CARD_MAP[CARD_BY_ID[cid].kind].slot===slot),'目标装备槽不可用');removeOwned(s,owner,[id],{reason:'move'});t.equip.push(id);}
  else {owner.judge.splice(owner.judge.indexOf(id),1);t.judge.push(id);}
  note(s,`${p.name} 将${owner.name}的${cardLabel(id)}移动给${t.name}。`);
}

export const COMPLETE_ACTIVE=new Set(['义绝','审时','贞良','攻心','急袭','清侧','蛊惑']);
export function activateComplete(s,p,a){
  if(!complete(s)||!COMPLETE_ACTIVE.has(a.skill))return false;
  const n=a.skill,st=cs(p),ids=a.cards||[],targets=a.targets||[];
  check(s.status==='playing'&&!p.dead&&hasSkill(p,n),'当前没有此技能');
  check(Array.isArray(ids)&&new Set(ids).size===ids.length&&Array.isArray(targets)&&new Set(targets).size===targets.length,'技能选择无效');
  if(n==='蛊惑'){
    check(!st.used[n]&&p.hand.length,'本回合已蛊惑或没有手牌');const q=s.rules.pending;
    check(!q&&s.turn===p.id&&s.phase===3||q&&(q.player===p.id||q.kind==='counter'&&q.players.includes(p.id))&&['counter','slash','duel','aoe','borrow','save'].includes(q.kind),'当前不能声明蛊惑');
    const kinds=q?q.kind==='counter'?['wuxie']:q.kind==='save'?['tao',...(q.target===p.id?['jiu']:[])]:q.required==='sha'?['sha','fire_sha','thunder_sha']:['shan']:Object.keys(CARD_MAP).filter(k=>['基本','锦囊'].includes(CARD_MAP[k].type)&&!['le','bingliang','shandian','shan','wuxie'].includes(k)&&!CARD_MAP[k].manual);
    ask(s,p,'蛊惑声明','declare',{cards:p.hand,minCards:1,targets:q?[]:alive(s).map(t=>t.id),maxTargets:q?0:2,options:kinds.filter(k=>s.deckSet!=='standard'||!['fire_sha','thunder_sha','jiu','huogong','tiesuo','bingliang'].includes(k)).map(k=>option(k,`声明${CARD_MAP[k].name}`)),hint:q?'选择一张手牌扣置并声明响应牌':'选择扣置手牌及声明牌的目标；自用及全体牌可不选目标',data:{resume:q}});return true;
  }
  check(!s.rules.pending&&!s.rules.queue.length&&s.turn===p.id&&s.phase===3&&p.hp>0,'请在自己的出牌阶段发动');check(!st.turn.noMoreUse,'往烈：本回合不能再使用牌');
  check(targets.length===1,'请选择一名目标');const t=seat(s,targets[0]);check(!t.dead&&t.id!==p.id,'请选择其他存活角色');
  if(!['急袭','清侧'].includes(n)){check(!st.used[n],'本阶段已发动');st.used[n]=true;}
  if(n==='义绝'){check(ids.length===1&&t.hand.length,'弃一张牌，目标须有手牌');drop(s,p,ids);ask(s,t,'义绝展示','show',{cards:t.hand,minCards:1,optional:false,data:{source:p.id},hint:'展示一张手牌'});}
  else if(n==='审时'){check(!st.marks.shenshi&&ids.length===1&&alive(s).filter(x=>x.id!==p.id).every(x=>t.hand.length>=x.hand.length),'阳态：给其他手牌最多者一张手牌');give(s,p,t,ids);st.marks.shenshi=true;enqueue(s,{type:'damage',source:p.id,target:t.id,amount:1},{type:'completeShenshiDeath',owner:p.id,target:t.id});}
  else if(n==='贞良'){check(!st.marks.zhenliang&&special(p,'duty').length,'需要阳态和任牌');check(ids.length===Math.max(1,Math.abs(p.hp-t.hp))&&ids.every(id=>color(p,id)===color(p,special(p,'duty')[0])),'弃牌须与任同色且数量等于体力差（至少1）');check(distance(s,p.id,t.id)<=attackRange(p),'目标不在攻击范围内');drop(s,p,ids);st.marks.zhenliang=true;enqueue(s,{type:'damage',source:p.id,target:t.id,amount:1});}
  else if(n==='攻心'){const cards=t.hand.filter(id=>CARD_BY_ID[id].suit==='H');if(cards.length)ask(s,p,n,'choose',{cards,minCards:1,options:[option('discard','弃置'),option('top','置于牌堆顶')],data:{target:t.id,viewCards:[...t.hand]},hint:'查看其手牌并选择红桃牌'});else ask(s,p,n,'view',{options:[option('done','完成查看')],data:{target:t.id,viewCards:[...t.hand]},hint:'其手牌中没有红桃'});}
  else if(n==='急袭'){check(ids.length===1&&special(p,'field').includes(ids[0]),'选择一张田');take(s,p,ids);enqueue(s,{type:'completeUseField',owner:p.id,card:ids[0],target:t.id});}
  else if(n==='清侧'){check(ids.length===1&&special(p,'honor').includes(ids[0]),'选择一张荣');special(p,'honor').splice(special(p,'honor').indexOf(ids[0]),1);s.discard.push(...ids);check(t.equip.length+t.judge.length,'目标场上没有牌');enqueue(s,{type:'skillPick',owner:p.id,target:t.id,operation:'discard',fieldOnly:true,skill:n});}
  return true;
}

function declareBluff(s,p,kind,ids,targets,resume){enqueue(s,{type:'completeBluffValidate',owner:p.id,kind,cards:ids,targets:targets.length?targets:[p.id],resume});}
export function beginBluff(s,e){
  const p=seat(s,e.owner);check(e.cards.length===1&&p.hand.includes(e.cards[0]),'蛊惑材料已移动');cs(p).used['蛊惑']=true;removeOwned(s,p,e.cards,{handOnly:true,reason:'use'});
  cs(p).concealed=[...e.cards];const order=alive(s),at=order.findIndex(t=>t.id===s.turn),players=[...order.slice(at),...order.slice(0,at)].filter(t=>t.id!==p.id&&!hasSkill(t,'缠怨')).map(t=>t.id);
  const data={...e,players,index:0};note(s,`${p.name} 扣置一张手牌，声明${CARD_MAP[e.kind].name}。`);nextBluff(s,data);
}
function nextBluff(s,d){
  const id=d.players[d.index];if(id){const p=seat(s,id);ask(s,p,'蛊惑质疑','challenge',{options:[option('challenge','质疑并翻开'),option('trust','不质疑')],optional:false,data:d,hint:`${seat(s,d.owner).name} 声明${CARD_MAP[d.kind].name}`});}
  else finishBluff(s,d,true);
}
function finishBluffQuestion(s,p,c,d){
  if(c==='trust'){nextBluff(s,{...d,index:d.index+1});return;}
  const card=d.cards[0],truth=CARD_BY_ID[card].kind===d.kind;note(s,`蛊惑翻开${cardLabel(card)}，声明${truth?'真实':'虚假'}。`);if(truth)gained(p,'缠怨');d.revealed=true;finishBluff(s,d,truth);
}
function finishBluff(s,d,valid){const p=seat(s,d.owner);const cards=cs(p).concealed||[];check(cards.length===1&&cards[0]===d.cards[0],'蛊惑扣置牌缺失');cs(p).concealed=[];if(valid){if(!d.revealed){s.hiddenMaterials??={};s.hiddenMaterials[cards[0]]={owner:p.id,viewers:[p.id],location:{zone:'pool',owner:p.id}};}p.hand.push(...cards);enqueue(s,{...d,type:'completeBluffUse'});}else{s.discard.push(...cards);s.rules.pending=d.resume||null;}}

export function completeJudge(s,q){
  if(!complete(s)||!q.purpose?.startsWith('complete:'))return false;
  const d=q.skillInfo||{},p=seat(s,q.player),owner=seat(s,d.owner||p.id),card=q.card,c=CARD_BY_ID[card],suit=cardSuitFor(p,c);
  if(q.purpose==='complete:屯田'){s.pool.splice(s.pool.indexOf(card),1);if(suit==='H')p.hand.push(card);else special(p,'field').push(card);}
  if(q.purpose==='complete:铁骑')enqueue(s,job(p,'铁骑弃牌','offer',{key:d.key,suit}));
  if(q.purpose==='complete:悲歌'){
    if(suit==='H')heal(s,p,d.amount);if(suit==='D')drawCards(s,p,3);
    if(d.source){const a=seat(s,d.source);if(!a.dead){if(suit==='C')enqueue(s,job(a,'强制弃牌','offer',{n:2,skill:'悲歌'}));if(suit==='S')flip(s,a);}}
  }
  return true;
}
export function completePindian(s,q,a,b,ca,cb,winner){
  if(!complete(s)||q.skill!=='烈刃')return false;
  if(winner===a.id){s.pool.splice(s.pool.indexOf(ca),1);s.pool.splice(s.pool.indexOf(cb),1);s.discard.push(ca,cb);enqueue(s,{type:'skillPick',owner:a.id,target:b.id,operation:'take',skill:'烈刃'});}
  else{take(s,b,[ca]);take(s,a,[cb]);}return true;
}

export function projectCompleteState(p,viewer){
  const st=p.skillState||{},own=p.id===viewer;
  return {zones:Object.fromEntries(zoneNames.map(z=>[z,{count:st.zones?.[z]?.length||0,cards:z==='song'&&!own?null:[...(st.zones?.[z]||[])]}])),avatar:st.avatar?{...st.avatar}:null,avatars:own?[...(st.avatars||[])]:undefined,avatarCount:st.avatars?.length||0,concealedCount:st.concealed?.length||0};
}
const publicMarks=new Set('bare buquDying chenglue feijunTargets fenwei hongju hunzi juzhan orange polu poshi qinxue ruoyu shenshi substitute zaoxian zhengrong zhenguTarget zhenliang zhiji 涅槃 奇谋 雄乱 乱武'.split(' '));
const publicTurn=new Set('benghuaiDisabled bonusJizhi cards damage discarded distanceReduction drawBonus equipLossN equipLossRev extraSlash fangquan fenji freeSuits fuyinSeen guanxingAgain handBlocked handLimit haoshi lastLossRev luanjiSuits noMoreUse noTargets phaseDiscards qiangxi qingjianTypes qingnangStopped qingnangTargets qizhi redDiscards rendeTargets replaceDraw shuangColor silenced skipPhases tianyi unlimitedDistance usedTypes xiongluan yijueTarget zhangjiang zhengu'.split(' '));
export function publicSkillFields(s,p){
  const st=p.skillState,known=new Set([...s.players.map(p=>p.id),...Object.keys(CARD_BY_ID),'S','H','C','D','red','black','基本','锦囊','装备','延时']);
  const scalar=v=>typeof v==='boolean'||Number.isSafeInteger(v)||typeof v==='string'&&known.has(v),safe=v=>scalar(v)||Array.isArray(v)&&v.every(scalar);
  const pick=(obj,keys)=>Object.fromEntries(Object.entries(obj).filter(([k,v])=>(!keys||keys.has(k))&&safe(v)).map(([k,v])=>[k,structuredClone(v)]));
  return {marks:pick(st.marks,publicMarks),turn:pick(st.turn,publicTurn),used:pick(st.used)};
}
export function validateCompleteState(s,assert){
  assert(s.completeSkills===undefined||typeof s.completeSkills==='boolean','完整结算设置无效');
  assert(!s.completeSkills||s.skillAutomation&&s.mode==='auto','完整结算需要自动模式');
  if(s.extraTurns)assert(Array.isArray(s.extraTurns)&&s.extraTurns.length<=32&&s.extraTurns.every(id=>s.players.some(p=>p.id===id)),'额外回合无效');
  if(s.hiddenMaterials)assert(Object.keys(s.hiddenMaterials).length<=161&&Object.entries(s.hiddenMaterials).every(([id,x])=>CARD_BY_ID[id]&&s.players.some(p=>p.id===x.owner)&&Array.isArray(x.viewers)&&x.viewers.length<=8&&x.viewers.every(id=>s.players.some(p=>p.id===id))),'扣置处理牌无效');
  for(const p of s.players){const st=p.skillState;if(!st)continue;
    if(st.zones)assert(Object.keys(st.zones).every(k=>zoneNames.includes(k))&&Object.values(st.zones).every(Array.isArray),'专属牌区无效');
    if(st.avatars)assert(Array.isArray(st.avatars)&&new Set(st.avatars).size===st.avatars.length&&st.avatars.every(id=>GENERAL_MAP[id]),'化身池无效');
    if(st.avatar)assert(st.avatars?.includes(st.avatar.general)&&GENERAL_MAP[st.avatar.general]?.skills.some(sk=>sk.name===st.avatar.skill&&borrowable(sk)),'亮出化身无效');
    if(st.concealed)assert(Array.isArray(st.concealed)&&st.concealed.length<=1,'扣置牌区无效');
  }
}

export function nextCompleteTurn(s){
  s.extraTurns=(s.extraTurns||[]).filter(id=>!seat(s,id).dead);
  if(s.extraTurns.length&&!s.normalTurnResume)s.normalTurnResume=s.turn;
  let from=s.normalTurnResume||s.turn;
  for(let tries=0;tries<s.players.length*2+34;tries++){
    let p;if(s.extraTurns.length){p=seat(s,s.extraTurns.shift());s.extraTurnActive=true;}
    else {s.extraTurnActive=false;delete s.normalTurnResume;let i=s.players.findIndex(p=>p.id===from);do {i=(i+1)%s.players.length;if(i===0)s.round++;}while(s.players[i].dead);p=s.players[i];from=p.id;}
    if(cs(p).faceDown){flip(s,p);note(s,`${p.name} 翻回正面并跳过此回合。`);continue;}return p.id;
  }
  throw new Error('额外回合队列异常');
}
