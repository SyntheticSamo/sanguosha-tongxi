import {CARD_BY_ID,CARD_MAP} from '../data/cards.js';
import {responseMaterials} from '../backend/advisor.js';
const $=id=>document.getElementById(id),seat=id=>document.querySelector(`[data-seat="${CSS.escape(id||'')}"]`);
// Presentation is cancellable and never participates in the resolution queue.
export class TableFeedback{
 constructor(scene){this.scene=scene;this.animations=new Set();this.nodes=new Set();this.landedRecords=new Map();this.epoch=0;}
 get v(){return this.scene.v;}
 get reduce(){return this.scene.reduceMotion;}
 play(el,frames,duration=350){if(!el||this.reduce)return;const a=el.animate(frames,{duration:this.scene.motionChoice==='fast'?duration*.5:duration,easing:'cubic-bezier(.2,.7,.3,1)'});this.animations.add(a);a.finished.catch(()=>{}).finally(()=>this.animations.delete(a));return a;}
 clearBattle(){this.scene.cinema?.clear();for(const el of this.nodes)el.remove();this.nodes.clear();document.querySelectorAll('.combat-burst,.card-effect,.counter-collision').forEach(e=>e.remove());}
 clear(){this.epoch++;for(const a of this.animations)a.cancel();this.animations.clear();this.clearBattle();this.landedRecords.clear();this.handoff=null;this.responseKey=null;}
 sync(old,animate){
  this.response();
  if(!animate||!old){this.handoff=null;return;}
  if(old.turn!==this.v.turn||old.round!==this.v.round||old.turnHistory?.turnId!==this.v.turnHistory?.turnId){this.handoff={turn:this.v.turn,epoch:this.epoch};this.tryHandoff();}
 }
 tryHandoff(){
  if(!this.handoff||this.scene.motion.queue.some(j=>j.e.type==='archive')||[...this.scene.motion.active].some(j=>j.e.type==='archive'))return;
  const {turn,epoch}=this.handoff;this.handoff=null;if(epoch!==this.epoch||turn!==this.v.turn||this.reduce)return;
  const el=seat(turn);this.play(el,[{boxShadow:'0 0 0 0 #efd394b0'},{boxShadow:'0 0 0 9px #efd39400',offset:.75},{boxShadow:'0 0 0 0 #efd39400'}],650);
  this.play(document.querySelector('.phase-cell.current'),[{scale:1},{scale:1.2,offset:.4},{scale:1}],350);
 }
 response(){
  const q=this.v?.pending,key=`${q?.windowId}:${q?.kind}:${q?.player}:${this.v?.you}`,fresh=key!==this.responseKey;this.responseKey=key;
  document.querySelectorAll('.response-material').forEach(el=>el.classList.remove('response-material'));
  if(!q||q.player!==this.v.you)return;
  const materialKey=`${this.v.rev}:${this.v.you}:${q.windowId}`;if(this.materialKey!==materialKey){this.materialKey=materialKey;this.materials=responseMaterials(this.v);}
  for(const id of this.materials||[])for(const el of document.querySelectorAll(`[data-card="${CSS.escape(id)}"]`))el.classList.add('response-material');
  if(fresh)this.play(seat(this.v.you),[{outline:'0px solid #f3df9d00'},{outline:'4px solid #f3df9d90',offset:.4},{outline:'1px solid #f3df9d00'}],450);
 }
 landed(j){
  const e=j.e;if(e.type==='play'){
   this.landedRecords.set(e.id,(this.scene.clock?.now()??performance.now())+600);const el=document.querySelector(`[data-play="${CSS.escape(e.id)}"]`);
   el?.classList.remove('pending-play');this.play(el,[{scale:1.06,translate:'0px -3px'},{scale:.98,translate:'0px 1px',offset:.45},{scale:1,translate:'0px 0px'}],190);
  }else if(j.arrival){const el=document.querySelector(`#hand [data-card="${CSS.escape(j.id)}"]`);this.play(el,[{filter:'brightness(1.35)',scale:1.025},{filter:'brightness(1)',scale:1}],240);}
  else if(['equip','judge','wood','history'].includes(e.to.zone)){
   if(e.to.zone==='equip'&&j.id)this.scene.cinema.equipment(this.scene.v.players.find(p=>p.id===e.to.owner)?.equip.includes(j.id)?e.kind||CARD_BY_ID[j.id]?.kind:null,e.to.owner);
   const el=e.to.zone==='history'?seat(e.to.owner)?.querySelector('.played-card'):seat(e.to.owner)?.querySelector(`[data-card="${CSS.escape(j.id||'')}"]`);this.play(el,[{filter:'brightness(1.5)',scale:1.07},{filter:'brightness(1)',scale:1}],250);
  }
 }
 health(e){
  const el=seat(e.player);if(!el)return;const damage=e.type==='damage',heal=e.type==='heal',delta=damage?-e.amount:e.amount;
  const label=document.createElement('span');label.className=`hp-float ${e.type}`;label.textContent=`${e.type==='correction'?'纠正 ':e.type==='maxHp'?'上限 ':e.type==='hp'?'体力 ':''}${delta>0?'+':''}${delta}`;el.append(label);this.nodes.add(label);
  const duration=this.reduce?700:1000;setTimeout(()=>{label.remove();this.nodes.delete(label);},duration);
  if((damage||heal)&&!this.reduce){
   const flash=document.createElement('span');flash.className=`seat-flash ${damage?'hurt':'heal'}`;flash.setAttribute('aria-hidden','true');el.append(flash);this.nodes.add(flash);setTimeout(()=>{flash.remove();this.nodes.delete(flash);},700);
   if(damage)this.play(el,[{translate:'0 0'},{translate:'-6px 1px',offset:.12},{translate:'5px -1px',offset:.28},{translate:'-3px 0',offset:.46},{translate:'2px 0',offset:.64},{translate:'0 0'}],440);
  }
  if(damage||heal){
   const p=this.v.players.find(p=>p.id===e.player),cells=[...el.querySelectorAll('.hp-cell')],after=e.hpAfter??p.hp,from=heal?Math.max(0,after-e.amount):Math.max(0,after),to=heal?Math.min(cells.length,after):Math.min(cells.length,after+e.amount),changed=cells.slice(from,to);
   for(let i=0;i<changed.length;i++){const cell=changed[i],frames=heal?[{background:'#315947',opacity:.3,scale:.7},{background:'#c7dda0',opacity:1,scale:1}]:[{background:'#d4d7ab',clipPath:'inset(0)'},{background:'#e1a083',clipPath:'polygon(0 0,45% 0,35% 55%,65% 45%,50% 100%,0 100%)',offset:.5},{background:'#234839',opacity:.4,scale:.7}];this.play(cell,frames,Math.min(400,220+i*70));}
   this.combat(e);
  }
 }
 combat(e){
  const record=(this.v.centerPlays||[]).find(p=>p.id===e.recordId),motif=e.type==='heal'?'heal':e.nature==='fire'?'fire':e.nature==='thunder'?'thunder':record&&['sha','fire_sha','thunder_sha'].includes(record.kind)?'slash':'impact';
  this.scene.cinema.run(motif,e.player,{duration:motif==='thunder'?500:650,result:true});
  if(e.type==='damage'&&e.nature!=='normal'&&this.scene.relations.shown?.has(e.player))this.scene.relations.propagate(e.player);
 }
 prevention(e){
  const el=seat(e.effectTarget);if(!el)return;if(e.prevention==='armor'&&CARD_MAP[e.preventionName])this.scene.cinema.equipment(e.preventionName,e.effectTarget,e.effectTarget);const slot=e.prevention==='armor'?el.querySelector('[data-slot="armor"]'):el;
  this.play(slot,[{boxShadow:'0 0 0 0 #cce2df00'},{boxShadow:'0 0 10px 3px #cce2df',offset:.4},{boxShadow:'0 0 0 0 #cce2df00'}],400);
  const label=document.createElement('span');label.className='prevention-label';label.textContent=`${CARD_MAP[e.preventionName]?.name||e.preventionName||'技能'} · 抵消`;el.append(label);this.nodes.add(label);setTimeout(()=>{label.remove();this.nodes.delete(label);},1100);
 }
}
