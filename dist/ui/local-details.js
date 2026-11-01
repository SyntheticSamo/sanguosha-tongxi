import {ROLE_INFO,GENERAL_MAP} from '../data/generals.js';
import {CARD_MAP} from '../data/cards.js';
import {distanceExplanation} from '../backend/advisor.js';
const $=id=>document.getElementById(id);
export class LocalDetails{
 constructor(scene){
  this.scene=scene;this.tip=$('card-preview');this.origin=null;
  document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=e.target.closest('[data-help]');if(el&&!el.contains(e.relatedTarget))this.schedule(el,e.clientX,e.clientY);});
  document.addEventListener('pointermove',e=>{if(this.origin?.contains(e.target)&&!this.pinned){this.x=e.clientX;this.y=e.clientY;if(!this.tip.hidden)this.position();}});
  document.addEventListener('pointerout',e=>{if(!this.pinned&&this.origin?.contains(e.target)&&!this.origin.contains(e.relatedTarget))this.hide();});
  document.addEventListener('focusin',e=>{const el=e.target.closest('[data-help]');if(el){const r=el.getBoundingClientRect();this.schedule(el,r.right,r.top);}});
  document.addEventListener('focusout',()=>{if(!this.pinned)this.hide();});
  document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){const el=e.target.closest('[data-help]');if(el&&!el.closest('.identity-guess')){this.scene.ui.ignoreClickUntil=performance.now()+450;this.show(el,e.clientX,e.clientY,true);}}else if(this.pinned&&!this.origin?.contains(e.target))this.hide();});
  document.addEventListener('toggle',e=>{if(!e.target.matches?.('.identity-guess'))return;const panel=e.target.querySelector('.guess-options');if(e.target.open){for(const d of document.querySelectorAll('.identity-guess[open]'))if(d!==e.target)d.open=false;if(!panel.matches(':popover-open'))panel.showPopover?.();this.positionRole(e.target);}else panel.hidePopover?.();},true);
  document.addEventListener('click',e=>{const summary=e.target.closest('.identity-guess>summary');if(summary){e.preventDefault();const d=summary.parentElement;d.open=!d.open;const panel=d.querySelector('.guess-options');if(d.open){if(!panel.matches(':popover-open'))panel.showPopover?.();this.positionRole(d);}else panel.hidePopover?.();}for(const d of document.querySelectorAll('.identity-guess[open]'))if(!d.contains(e.target))d.open=false;});
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const d=document.querySelector('.identity-guess[open]');if(d){e.stopImmediatePropagation();d.open=false;d.querySelector('summary').focus();}if(this.pinned){e.stopImmediatePropagation();const o=this.origin;this.hide();o?.focus({preventScroll:true});}},true);
  window.addEventListener('scroll',()=>{if(this.pinned)this.hide();for(const d of document.querySelectorAll('.identity-guess[open]'))this.positionRole(d);},true);
  document.fonts?.ready.then(()=>this.align());document.fonts?.addEventListener('loadingdone',()=>this.align());
 }
 get v(){return this.scene.v;}
 roleText(role,guessed=false){const r=ROLE_INFO[role];return r?`${guessed?'猜测，仅你可见 · ':''}${r.name}\n${r.description}\n目标：${r.goal}`:'未知身份\n可标注自己的猜测；只有你能看到，不会改变真实身份。';}
 description(el){
  const p=this.v?.players.find(p=>p.id===(el.dataset.player||el.closest('[data-seat]')?.dataset.seat));if(!p)return '';
  switch(el.dataset.help){
   case 'distance':return distanceExplanation(this.v,this.v.you,p.id);
   case 'faction':return `势力：${GENERAL_MAP[p.skillState?.avatar?.general||p.general]?.faction||'未定'}\n势力用于部分技能条件，不代表身份阵营或胜利目标。`;
   case 'hp':return `体力 ${p.hp}／${p.maxHp}${p.hp<=0&&!p.dead?' · 濒死':''}\n体力降至0或更低时进入濒死求救；未获救则阵亡。`;
   case 'hand':return `手牌 ${p.handCount} 张${p.wood?.count?'\n木牛储牌 '+p.wood.count+' 张（不计入手牌）':''}`;
   case 'role':return this.roleText(p.role||this.scene.guess(p),!p.role&&this.scene.guess(p)!=='unknown');
   case 'status':return el.dataset.copy||el.textContent;
   case 'empty-slot':return el.getAttribute('aria-label');
  }return '';
 }
 schedule(el,x,y){this.scene.hidePreview();this.origin=el;this.x=x;this.y=y;this.timer=setTimeout(()=>this.show(el,this.x,this.y),200);}
 show(el,x,y,pinned=false){clearTimeout(this.timer);this.scene.hidePreview();if(!this.v||this.scene.ui.gesture?.active||document.querySelector('dialog[open]'))return;const text=this.description(el);if(!text)return;this.origin=el;this.pinned=pinned;this.x=x;this.y=y;this.tip.textContent=text;this.tip.hidden=false;el.setAttribute('aria-describedby','card-preview');this.position();}
 position(){const t=this.tip;t.style.left=Math.max(8,Math.min(innerWidth-t.offsetWidth-8,this.x+12))+'px';t.style.top=Math.max(8,Math.min(innerHeight-t.offsetHeight-8,this.y+12))+'px';}
 hide(){clearTimeout(this.timer);this.origin?.removeAttribute('aria-describedby');this.origin=null;this.pinned=false;this.tip.hidden=true;}
 positionRole(menu){const panel=menu.querySelector('.guess-options'),r=menu.querySelector('summary').getBoundingClientRect();if(!panel)return;panel.style.left=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,r.left))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,r.bottom+8))+'px';}
 refresh(){this.hide();requestAnimationFrame(()=>this.align());}
 align(){
  for(const row of document.querySelectorAll('.seat-general')){
   const svg=row.querySelector('.hero-lettering'),text=svg?.querySelector('text'),badge=row.querySelector('.faction-icon text');if(!text)continue;
   const b=text.getBBox(),size=parseFloat(getComputedStyle(row).fontSize);if(b.width&&b.height){svg.setAttribute('viewBox',`${b.x} ${b.y} ${b.width} ${b.height}`);svg.style.width=(size*b.width/b.height)+'px';svg.style.height=size+'px';}
   if(badge){badge.removeAttribute('transform');const b=badge.getBBox();badge.setAttribute('transform',`translate(${12-b.x-b.width/2} ${12-b.y-b.height/2})`);}
  }
 }
 control(name,b){
  if(name==='field-info'){const r=b.getBoundingClientRect();this.show(b,r.left,r.bottom,true);return true;}
  if(name==='role-info'){const p=this.v.players.find(p=>p.id===b.dataset.player);this.scene.detailOrigin=b;this.scene.ui.detail('身份与目标',this.roleText(p.role));return true;}
  return false;
 }
}
