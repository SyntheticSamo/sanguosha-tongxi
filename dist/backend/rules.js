import {check,seat,alive,note,topCard,drawCards,hasSkill,equipKind,distance,attackRange,isSlash,natureOf,removeOwned,effectiveKind,CARD_BY_ID,CARD_MAP,cardLabel,red,randomIndex} from './primitives.js';

export const freshRules=()=>({pending:null,queue:[],resolving:[],market:[],commits:{},slash:0,slashPlayed:0,wineUsed:false,drank:0,skipDraw:false,skipPlay:false,lastResult:null});
const active=s=>s.mode==='auto';
const idle=s=>check(!s.rules.pending&&!s.rules.queue.length,'请先完成当前响应');
function playPhase(s,p){check(s.turn===p.id&&s.phase===3,'请在自己的出牌阶段使用');check(!p.dead&&p.hp>0,'当前不能出牌');}
const attackAllowed=(s,a,b)=>{check(a.id!==b.id&&!b.dead,'目标无效');check(distance(s,a.id,b.id)<=attackRange(a),'目标超出攻击范围');check(!(hasSkill(b,'空城')&&!b.hand.length),'空城：不能指定该目标');};
function useCards(s,p,ids,kind){removeOwned(s,p,ids);s.pool.push(...ids);s.rules.resolving.push(...ids);note(s,`${p.name} 使用 ${ids.map(cardLabel).join('、')}${kind!==CARD_BY_ID[ids[0]].kind?`（${CARD_MAP[kind].name}）`:''}。`);}
function discardResponse(s,p,ids){removeOwned(s,p,ids);s.discard.push(...ids);note(s,`${p.name} 打出 ${ids.map(cardLabel).join('、')}。`);}
function finishCards(s){
  for(const id of [...s.rules.resolving,...s.rules.market]){const i=s.pool.indexOf(id);if(i>=0){s.pool.splice(i,1);s.discard.push(id);}}
  s.rules.resolving=[];s.rules.market=[];
}
function pending(s,value){s.rules.pending=value;}
function order(s,start=s.turn){const list=alive(s).map(p=>p.id),i=Math.max(0,list.indexOf(start));return [...list.slice(i),...list.slice(0,i)];}
function endGame(s){
  const live=alive(s),lord=s.players.find(p=>p.role==='lord');let winner=null;
  if(lord.dead)winner=live.length===1&&live[0].role==='spy'?'内奸':'反贼';
  else if(!live.some(p=>p.role==='rebel'||p.role==='spy'))winner='主忠';
  if(winner){s.status='finished';s.winner=winner;s.rules.pending=null;s.rules.queue=[];finishCards(s);note(s,`${winner} 获胜。`);}
}
function death(s,p,source){
  p.dead=true;p.roleOpen=true;const privateCards=s.peek[p.id]||[];s.peek[p.id]=[];s.discard.push(...p.hand,...p.equip,...p.judge,...privateCards);p.hand=[];p.equip=[];p.judge=[];
  note(s,`${p.name} 阵亡（${{lord:'主公',loyal:'忠臣',rebel:'反贼',spy:'内奸'}[p.role]}）。`);
  const killer=s.players.find(x=>x.id===source&&!x.dead);
  if(killer&&p.role==='rebel'){drawCards(s,killer,3);note(s,`${killer.name} 击杀反贼，摸3张牌。`);}
  if(killer?.role==='lord'&&p.role==='loyal'){s.discard.push(...killer.hand,...killer.equip);killer.hand=[];killer.equip=[];note(s,'主公误杀忠臣，弃置全部手牌和装备。');}
  endGame(s);
}
function wounded(s,p,source){
  if(p.hp>0||p.dead)return;
  const saviors=order(s);pending(s,{kind:'save',target:p.id,source,saviors,index:0,player:saviors[0]});note(s,`${p.name} 濒死，等待求桃。`);
}
function armorDamage(s,p,n,nature,ignoreArmor){
  if(ignoreArmor)return n;const armor=equipKind(p,'armor');
  if(armor==='tengjia'&&nature==='fire')n++;
  if(armor==='baiyin')n=Math.min(n,1);return n;
}
function damage(s,{source,target,amount=1,nature='normal',ignoreArmor=false,chain=false,slash=false}){
  const p=seat(s,target);if(p.dead)return;
  if(slash&&source&&equipKind(seat(s,source),'weapon')==='guding'&&!p.hand.length)amount++;
  const n=armorDamage(s,p,amount,nature,ignoreArmor);p.hp-=n;note(s,`${p.name} 受到${nature==='fire'?'火焰':nature==='thunder'?'雷电':''}伤害 ${n}（${p.hp}/${p.maxHp}）。`);
  if(nature!=='normal'&&p.chained&&!chain){const others=alive(s).filter(x=>x.id!==p.id&&x.chained);for(const x of [p,...others])x.chained=false;
    s.rules.queue.unshift(...others.map(x=>({type:'damage',source,target:x.id,amount:n,nature,chain:true})));}
  wounded(s,p,source);
}
function counter(s,effect){pending(s,{kind:'counter',player:null,effect,passed:[],negated:false,players:order(s)});}
export function pump(s){
  let limit=0;
  while(!s.rules.pending&&s.rules.queue.length&&s.status==='playing'){
    check(++limit<100,'结算队列异常');const e=s.rules.queue.shift();
    if(e.target&&seat(s,e.target).dead)continue;
    if(e.counter){const effect={...e};delete effect.counter;counter(s,effect);break;}
    const p=e.target?seat(s,e.target):null;
    switch(e.type){
      case 'slash':{
        if(!e.ignoreArmor&&(equipKind(p,'armor')==='renwang'&&(e.color||(!red(CARD_BY_ID[e.card])?'black':'red'))==='black'||equipKind(p,'armor')==='tengjia'&&e.nature==='normal')){note(s,`${p.name} 的防具抵消杀。`);break;}
        pending(s,{kind:'slash',player:p.id,required:'shan',remaining:hasSkill(seat(s,e.source),'无双')?2:1,...e});break;
      }
      case 'duel':pending(s,{kind:'duel',player:p.id,opponent:e.source,source:e.source,required:'sha',remaining:hasSkill(seat(s,e.source),'无双')?2:1});break;
      case 'aoe':if(equipKind(p,'armor')==='tengjia'){note(s,`${p.name} 的藤甲抵消${e.kind==='nanman'?'南蛮入侵':'万箭齐发'}。`);break;}pending(s,{kind:'aoe',player:p.id,required:e.kind==='nanman'?'sha':'shan',source:e.source,remaining:1});break;
      case 'draw':note(s,`${p.name} 摸 ${drawCards(s,p,e.n)} 张牌。`);break;
      case 'heal':p.hp=Math.min(p.maxHp,p.hp+1);note(s,`${p.name} 回复1点体力。`);break;
      case 'damage':damage(s,e);break;
      case 'chain':p.chained=!p.chained;note(s,`${p.name} ${p.chained?'横置':'重置'}武将牌。`);break;
      case 'steal':case 'dismantle':pending(s,{kind:'chooseCard',player:e.source,target:e.target,operation:e.type});break;
      case 'fire':if(p.hand.length)pending(s,{kind:'fireShow',player:p.id,source:e.source,target:p.id});break;
      case 'borrow':pending(s,{kind:'borrow',player:p.id,source:e.source,target:e.victim,required:'sha',remaining:1});break;
      case 'market':if(s.rules.market.length)pending(s,{kind:'market',player:p.id,available:[...s.rules.market]});break;
      case 'delay':{const owner=seat(s,e.owner),i=s.pool.indexOf(e.card);if(i>=0)s.pool.splice(i,1);owner.judge.push(e.card);s.delayKinds[e.card]=e.kind;note(s,`${owner.name} 判定区加入${CARD_MAP[e.kind].name}。`);break;}
      case 'judge':{
        const card=topCard(s);if(!card){note(s,'牌堆为空，判定暂停；请手动纠正。');break;}
        s.pool.push(card);pending(s,{kind:'judge',player:e.target,card,purpose:e.purpose||'generic',delayed:e.delayed||null});note(s,`${p.name} 判定：${cardLabel(card)}。`);break;
      }
    }
  }
  if(!s.rules.pending&&!s.rules.queue.length)finishCards(s);
}
function commitPindian(s,p,id){
  const q=s.rules.pending;check(q.kind==='pindian'&&q.players.includes(p.id),'你不参与此次拼点');check(!s.rules.commits[p.id],'你已经选牌');removeOwned(s,p,[id],{handOnly:true});s.rules.commits[p.id]=[id];note(s,`${p.name} 已选择拼点牌。`);
  if(q.players.every(id=>s.rules.commits[id])){
    const [a,b]=q.players.map(id=>seat(s,id)),[ca,cb]=q.players.map(id=>s.rules.commits[id][0]);s.pool.push(ca,cb);s.rules.commits={};
    s.rules.lastResult={kind:'pindian',source:a.id,target:b.id,cards:[ca,cb],winner:CARD_BY_ID[ca].rank>CARD_BY_ID[cb].rank?a.id:null};
    note(s,`拼点：${a.name} ${cardLabel(ca)} / ${b.name} ${cardLabel(cb)}；${CARD_BY_ID[ca].rank>CARD_BY_ID[cb].rank?a.name+' 胜':a.name+' 未赢'}。`);s.rules.pending=null;
  }
}
export function cancelResolution(s){
  for(const [id,cards]of Object.entries(s.rules.commits))seat(s,id).hand.push(...cards);
  s.rules.commits={};s.rules.pending=null;s.rules.queue=[];s.rules.resolving=[];s.rules.market=[];
}
function clearDelayed(s,p,id,purpose,passLightning=false){
  const i=p.judge.indexOf(id);check(i>=0,'延时牌已被移动');p.judge.splice(i,1);delete s.delayKinds[id];
  if(purpose==='shandian'&&passLightning){const seq=order(s,p.id);const next=seq.slice(1).concat(p.id).map(id=>seat(s,id)).find(x=>!x.judge.some(id=>(s.delayKinds[id]||CARD_BY_ID[id].kind)==='shandian'));
    if(next){next.judge.push(id);s.delayKinds[id]='shandian';note(s,`闪电传给 ${next.name}。`);}else s.discard.push(id);
  }else s.discard.push(id);
}
function confirmJudge(s,q){
  const c=CARD_BY_ID[q.card],p=seat(s,q.player),success=q.purpose==='le'?c.suit==='H':q.purpose==='bingliang'?c.suit==='C':q.purpose==='shandian'?c.suit==='S'&&c.rank>=2&&c.rank<=9:null;
  s.rules.lastResult={kind:'judge',card:q.card,purpose:q.purpose,success};
  if(q.delayed){clearDelayed(s,p,q.delayed,q.purpose,q.purpose==='shandian'&&!success);
    if(q.purpose==='le'&&!success)s.rules.skipPlay=true;if(q.purpose==='bingliang'&&!success)s.rules.skipDraw=true;if(q.purpose==='shandian'&&success)s.rules.queue.unshift({type:'damage',target:p.id,source:null,amount:3,nature:'thunder'});
  }
  const at=s.pool.indexOf(q.card);if(at>=0){s.pool.splice(at,1);s.discard.push(q.card);}note(s,`${p.name} 的${q.purpose==='generic'?'判定':CARD_MAP[q.purpose]?.name||'判定'}生效${success===null?'':success?'（命中条件）':'（未命中条件）'}。`);s.rules.pending=null;
}
export function useCard(s,p,a){
  idle(s);playPhase(s,p);const ids=a.cards;check(Array.isArray(ids),'请选择手牌');const kind=effectiveKind(p,ids,a.as||null),def=CARD_MAP[kind];
  check(!['shan','wuxie'].includes(kind),'该牌用于响应');check(!def.manual,'该牌请手动结算');
  if(!a.as)check(ids.every(id=>p.hand.includes(id)),'请从手牌使用，装备区牌仅可用于合法转化');
  const targets=[...new Set(a.targets||[a.target||p.id])].map(id=>seat(s,id));check(targets.length<=2,'目标过多');check(targets.every(t=>!t.dead),'目标已经阵亡');const t=targets[0];
  if(isSlash(kind)){
    check(targets.length===1,'请选择一个目标');attackAllowed(s,p,t);check(s.rules.slash<1||equipKind(p,'weapon')==='liannu'||hasSkill(p,'咆哮'),'本回合已经使用过杀');
    useCards(s,p,ids,kind);s.rules.slash++;const damage=1+s.rules.drank;s.rules.drank=0;
    const color=ids.every(id=>red(CARD_BY_ID[id]))?'red':ids.every(id=>!red(CARD_BY_ID[id]))?'black':'none';
    s.rules.queue.push({type:'slash',source:p.id,target:t.id,card:ids[0],color,amount:damage,nature:natureOf(kind),ignoreArmor:equipKind(p,'weapon')==='qinggang'});
  }else if(kind==='tao'){check(p.hp<p.maxHp,'你的体力已满');check(t?.id===p.id,'出牌阶段的桃只能对自己使用');useCards(s,p,ids,kind);p.hp++;}
  else if(kind==='jiu'){check(t?.id===p.id,'酒只能对自己使用');check(!s.rules.wineUsed,'本回合已使用酒');useCards(s,p,ids,kind);s.rules.wineUsed=true;s.rules.drank=1;note(s,'本回合下一张杀伤害基数 +1。');}
  else if(def.slot){check(ids.length===1,'一次装备一张');useCards(s,p,ids,kind);const old=p.equip.find(id=>CARD_MAP[CARD_BY_ID[id].kind].slot===def.slot);if(old){removeOwned(s,p,[old]);s.discard.push(old);}s.pool.splice(s.pool.indexOf(ids[0]),1);p.equip.push(ids[0]);}
  else {
    if(['chai','shun','juedou','le','bingliang','jiedao'].includes(kind))check(t&&t.id!==p.id,'请选择其他角色');
    if(['chai','shun'].includes(kind))check(t.hand.length+t.equip.length+t.judge.length>0,'目标区域没有牌');
    if(['shun','le'].includes(kind))check(!hasSkill(t,'谦逊'),'谦逊：不能指定此目标');
    if(['shun','bingliang'].includes(kind)&&!hasSkill(p,'奇才'))check(distance(s,p.id,t.id)<=1,'目标距离大于1');
    if(kind==='juedou')check(!(hasSkill(t,'空城')&&!t.hand.length),'空城：不能指定此目标');
    if(kind==='huogong')check(t.hand.length,'目标没有手牌');
    if(['le','bingliang','shandian'].includes(kind)){const owner=kind==='shandian'?p:t;check(!owner.judge.some(id=>(s.delayKinds[id]||CARD_BY_ID[id].kind)===kind),'判定区已有同名牌');}
    if(kind==='jiedao'){check(targets.length===2&&equipKind(t,'weapon'),'请选择持武器者和杀的目标');attackAllowed(s,t,targets[1]);}
    useCards(s,p,ids,kind);const e=(type,target=t?.id,extra={})=>({type,source:p.id,target,counter:true,cardKind:kind,...extra});
    if(kind==='wuzhong')s.rules.queue.push(e('draw',p.id,{n:2}));
    else if(kind==='juedou')s.rules.queue.push(e('duel'));
    else if(kind==='chai'||kind==='shun')s.rules.queue.push(e(kind==='chai'?'dismantle':'steal'));
    else if(kind==='huogong')s.rules.queue.push(e('fire'));
    else if(kind==='jiedao')s.rules.queue.push(e('borrow',t.id,{victim:targets[1].id}));
    else if(['nanman','wanjian'].includes(kind))s.rules.queue.push(...order(s,p.id).slice(1).map(id=>e('aoe',id,{kind})));
    else if(kind==='taoyuan')s.rules.queue.push(...order(s,p.id).map(id=>e('heal',id)));
    else if(kind==='tiesuo')s.rules.queue.push(...targets.map(x=>e('chain',x.id)));
    else if(kind==='wugu'){
      for(let i=0;i<alive(s).length;i++){const id=topCard(s);if(id){s.pool.push(id);s.rules.market.push(id);}}
      s.rules.queue.push(...order(s,p.id).map(id=>e('market',id)));
    }else if(['le','bingliang','shandian'].includes(kind)){const owner=kind==='shandian'?p:t;s.rules.queue.push(e('delay',owner.id,{owner:owner.id,card:ids[0],kind,counter:false}));}
    else throw new Error('该牌请改用手动结算');
  }
  pump(s);
}
export function ruleAction(s,p,a){
  if(!active(s))return false;
  switch(a.type){
    case 'use':useCard(s,p,a);return true;
    case 'respond':{
      const q=s.rules.pending;check(q,'当前没有待响应事件');const ids=a.cards||[];check(ids.length,'请选择响应牌');
      if(q.kind==='pindian'){check(ids.length===1,'拼点选择一张');commitPindian(s,p,ids[0]);break;}
      if(q.kind==='counter'){
        check(q.players.includes(p.id),'你不能响应');check(ids.length===1&&effectiveKind(p,ids)==='wuxie','需要无懈可击');discardResponse(s,p,ids);q.negated=!q.negated;q.passed=[p.id];note(s,`无懈链：当前${q.negated?'抵消':'恢复'}原效果。`);break;
      }
      check(q.player===p.id,'请等待对应玩家响应');
      if(q.kind==='save'){
        check(ids.length===1,'一次使用一张');const kind=effectiveKind(p,ids,a.as||null);check(kind==='tao'||kind==='jiu'&&q.target===p.id,'仅桃或濒死者自己的酒可救援');
        if(a.as==='tao')check(s.turn!==p.id,'急救只能在回合外使用');discardResponse(s,p,ids);const dying=seat(s,q.target);dying.hp++;
        if(p.id!==dying.id&&dying.role==='lord'&&dying.general==='sunquan'&&GENERAL_MAP_SAFE(p,null)==='吴')dying.hp++;
        note(s,`${dying.name} 回复体力至 ${dying.hp}。`);if(dying.hp>0)s.rules.pending=null;break;
      }
      if(q.kind==='fireShow'){check(ids.length===1&&p.hand.includes(ids[0]),'展示一张手牌');note(s,`${p.name} 展示 ${cardLabel(ids[0])}。`);pending(s,{kind:'firePay',player:q.source,source:q.source,target:p.id,suit:CARD_BY_ID[ids[0]].suit});break;}
      if(q.kind==='firePay'){check(ids.length===1&&p.hand.includes(ids[0])&&CARD_BY_ID[ids[0]].suit===q.suit,'须弃置同花色手牌');discardResponse(s,p,ids);s.rules.pending=null;s.rules.queue.unshift({type:'damage',source:p.id,target:q.target,nature:'fire',amount:1});break;}
      check(['slash','duel','aoe','borrow'].includes(q.kind),'当前事件不接受此响应');check(ids.length===1,'逐张响应');
      const kind=effectiveKind(p,ids,a.as||null);check(q.required==='sha'?isSlash(kind):kind===q.required,`需要${q.required==='sha'?'杀':'闪'}`);discardResponse(s,p,ids);if(isSlash(kind)&&s.turn===p.id&&s.phase===3)s.rules.slashPlayed++;q.remaining--;q.baguaUsed=false;
      if(q.remaining<=0){
        if(q.kind==='duel'){const opponent=q.opponent;q.opponent=p.id;q.player=opponent;q.remaining=hasSkill(p,'无双')?2:1;}
        else if(q.kind==='borrow'){s.rules.pending=null;s.rules.queue.unshift({type:'slash',source:p.id,target:q.target,card:ids[0],amount:1,nature:natureOf(kind),ignoreArmor:equipKind(p,'weapon')==='qinggang'});}
        else s.rules.pending=null;
      }break;
    }
    case 'pass':{
      const q=s.rules.pending;check(q,'当前没有响应');
      if(q.kind==='counter'){check(q.players.includes(p.id)&&!q.passed.includes(p.id),'你已放弃本轮无懈');q.passed.push(p.id);if(q.players.every(id=>q.passed.includes(id))){s.rules.pending=null;if(!q.negated)s.rules.queue.unshift(q.effect);else if(q.effect.type==='judge'&&q.effect.delayed)clearDelayed(s,seat(s,q.effect.target),q.effect.delayed,q.effect.purpose,q.effect.purpose==='shandian');}break;}
      if(q.kind==='judge'&&p.id===s.hostId){confirmJudge(s,q);break;}
      check(q.player===p.id,'等待对应玩家响应');
      if(q.kind==='save'){q.index++;if(q.index>=q.saviors.length){s.rules.pending=null;death(s,seat(s,q.target),q.source);}else q.player=q.saviors[q.index];break;}
      if(q.kind==='judge'){confirmJudge(s,q);break;}
      check(['slash','duel','aoe','borrow','firePay'].includes(q.kind),'此事件必须选择卡牌');s.rules.pending=null;
      if(q.kind==='borrow'){const weapon=seat(s,q.player).equip.find(id=>CARD_MAP[CARD_BY_ID[id].kind].slot==='weapon');if(weapon){removeOwned(s,p,[weapon]);seat(s,q.source).hand.push(weapon);note(s,`${p.name} 交出武器。`);}}
      else if(q.kind!=='firePay')damage(s,{source:q.kind==='duel'?q.opponent:q.source,target:p.id,amount:q.amount||1,nature:q.nature||'normal',ignoreArmor:q.ignoreArmor,slash:q.kind==='slash'});break;
    }
    case 'bagua':{
      const q=s.rules.pending;check(q&&q.player===p.id&&q.required==='shan'&&!q.ignoreArmor&&equipKind(p,'armor')==='bagua','当前不可使用八卦阵');
      check(!q.baguaUsed,'本次闪已尝试八卦阵');q.baguaUsed=true;const id=topCard(s);check(id,'牌堆为空');s.pool.push(id);note(s,`八卦阵判定：${cardLabel(id)}。`);
      if(red(CARD_BY_ID[id])){q.remaining--;q.baguaUsed=false;if(q.remaining<=0)s.rules.pending=null;}break;
    }
    case 'pickEffect':{
      const q=s.rules.pending;check(q&&q.player===p.id,'等待对应玩家选择');
      if(q.kind==='market'){check(s.rules.market.includes(a.card),'请选择五谷牌');s.rules.market.splice(s.rules.market.indexOf(a.card),1);s.pool.splice(s.pool.indexOf(a.card),1);p.hand.push(a.card);note(s,`${p.name} 获得 ${cardLabel(a.card)}。`);}
      else if(q.kind==='chooseCard'){const other=seat(s,q.target);let id;
        if(a.zone==='hand'){check(other.hand.length,'目标没有手牌');id=other.hand.splice(randomIndex(other.hand.length),1)[0];}
        else{check(['equip','judge'].includes(a.zone)&&other[a.zone].includes(a.card),'请选择目标公开牌');id=a.card;if(a.zone==='equip')removeOwned(s,other,[id]);else other.judge.splice(other.judge.indexOf(id),1);}
        if(q.operation==='steal'){p.hand.push(id);note(s,`${p.name} 获得 ${other.name} 的${a.zone==='hand'?'一张手牌':cardLabel(id)}。`);}else{s.discard.push(id);note(s,`${p.name} 弃置 ${other.name} 的 ${cardLabel(id)}。`);}
      }else throw new Error('当前事件不接受选牌');s.rules.pending=null;break;
    }
    case 'recast':idle(s);playPhase(s,p);check(a.cards?.length===1&&CARD_BY_ID[a.cards[0]]?.kind==='tiesuo','请选择一张铁索连环');removeOwned(s,p,a.cards,{handOnly:true});s.discard.push(...a.cards);drawCards(s,p,1);note(s,`${p.name} 重铸铁索连环。`);break;
    case 'judge':idle(s);s.rules.queue.push({type:'judge',target:p.id});break;
    case 'rejudge':{
      const q=s.rules.pending;check(q?.kind==='judge','当前没有判定');check(a.cards?.length===1,'请选择一张改判牌');
      check(hasSkill(p,'鬼才')||hasSkill(p,'鬼道')||p.id===s.hostId,'需要鬼才、鬼道或房主纠正');const id=a.cards[0];if(hasSkill(p,'鬼道')&&!hasSkill(p,'鬼才'))check(!red(CARD_BY_ID[id]),'鬼道需要黑色牌');
      removeOwned(s,p,[id]);s.pool.splice(s.pool.indexOf(q.card),1);if(hasSkill(p,'鬼道')&&!hasSkill(p,'鬼才'))p.hand.push(q.card);else s.discard.push(q.card);q.card=id;s.pool.push(id);note(s,`${p.name} 改判为 ${cardLabel(id)}。`);break;
    }
    case 'pindian':idle(s);{const t=seat(s,a.target);check(t.id!==p.id&&!p.dead&&!t.dead&&p.hand.length&&t.hand.length,'双方需存活且有手牌');pending(s,{kind:'pindian',players:[p.id,t.id],player:null});note(s,`${p.name} 与 ${t.name} 拼点，请各自选一张手牌。`);}break;
    default:return false;
  }
  pump(s);return true;
}
// Only classic rescue's faction check is shared with the catalog.
import {GENERAL_MAP} from '../data/generals.js';
function GENERAL_MAP_SAFE(p,skill){return skill?hasSkill(p,skill):GENERAL_MAP[p.general]?.faction;}
export function advancePhase(s,p,nextTurn=false){
  idle(s);check(p.id===s.turn||p.id===s.hostId,'只有当前玩家或房主可推进');check(!Object.values(s.peek).some(z=>z.length),'请先放回观看牌');
  if(s.phase===4)check(seat(s,s.turn).hand.length<=Math.max(0,seat(s,s.turn).hp)||hasSkill(seat(s,s.turn),'克己')&&s.rules.slash===0&&s.rules.slashPlayed===0,'请先弃牌至体力上限');
  if(nextTurn){check(s.phase===5,'请依次完成回合阶段；特殊跳过可由房主纠正');}
  if(s.phase===5){let i=s.players.findIndex(x=>x.id===s.turn),old=i;do{i=(i+1)%s.players.length;}while(s.players[i].dead);if(i<=old)s.round++;s.turn=s.players[i].id;s.phase=0;s.rules={...freshRules(),lastResult:s.rules.lastResult};}
  else s.phase++;
  const current=seat(s,s.turn);
  if(s.phase===1){s.rules.queue.push(...[...current.judge].reverse().map(id=>({type:'judge',target:current.id,delayed:id,purpose:s.delayKinds[id]||CARD_BY_ID[id].kind,cardKind:s.delayKinds[id]||CARD_BY_ID[id].kind,counter:true})));pump(s);}
  if(s.phase===2){if(s.rules.skipDraw)note(s,'跳过摸牌阶段。');else note(s,`${current.name} 摸 ${drawCards(s,current,2)} 张牌。`);}
  if(s.phase===3&&s.rules.skipPlay){s.phase=4;note(s,'跳过出牌阶段。');}
  note(s,`${current.name} · ${['准备','判定','摸牌','出牌','弃牌','结束'][s.phase]}。`);
}
