import {CARD_MAP} from '../data/cards.js';
import {CARD_STORYBOARDS} from '../data/card-storyboards.js';

const strokes={
 slash:'<path d="M12 79Q42 25 91 12L49 58Z"/><path class="fine" d="M21 85L86 20"/>',
 fire:'<path d="M48 88C8 76 22 43 35 30C31 51 46 49 51 10C78 35 89 58 73 81C79 58 56 63 60 39C40 59 40 70 48 88Z"/><path class="fine" d="M26 18l3-7m49 14l4-7M17 62l-6-2"/>',
 thunder:'<path d="M62 7L24 51L48 47L36 91L81 39L56 43Z"/><path class="fine" d="M24 51L12 44M75 36l12-12M39 78l-15 5"/>',
 shield:'<path d="M50 8L81 22L75 65L50 89L25 65L19 22Z"/><path class="fine" d="M50 18L70 28L66 60L50 76L34 60L30 28Z"/>',
 heal:'<circle cx="50" cy="50" r="27"/><path d="M50 33V67M33 50H67"/><path class="fine" d="M14 36Q6 50 14 64M86 36Q94 50 86 64"/>',
 wine:'<path d="M32 21H68L65 57Q50 77 35 57ZM50 68V85M34 85H66"/><path class="fine" d="M34 38Q50 47 66 38"/>',
 ripple:'<ellipse cx="50" cy="55" rx="17" ry="9"/><ellipse cx="50" cy="55" rx="31" ry="18"/><ellipse cx="50" cy="55" rx="45" ry="27"/>',
 arrows:'<path d="M12 12L37 69M27 63L38 72L39 58M40 7L65 64M55 58L66 67L67 53M68 12L91 65M81 59L92 68L93 54"/>',
 duel:'<path d="M21 12L73 72M63 74L79 60M24 74L79 12M20 60L36 74"/><circle class="fine" cx="50" cy="44" r="13"/>',
 borrow:'<path d="M11 66L43 34L64 55L86 24M73 24H86V37"/><path class="fine" d="M17 80L35 62M66 70L83 53"/>',
 dismantle:'<path d="M20 18H79V82H20ZM48 18L39 41L60 54L47 82"/><path class="fine" d="M16 44L6 41M84 59L94 63"/>',
 steal:'<path d="M16 60Q43 28 78 43M65 29L81 43L66 58"/><path class="fine" d="M23 68H55V88H23Z"/>',
 seal:'<rect x="23" y="17" width="54" height="66" rx="3"/><path d="M19 67L80 31M31 34L69 68"/>',
 grain:'<path d="M36 15Q50 30 64 15L69 32Q88 75 67 85H33Q12 75 31 32ZM30 34H70"/><path class="fine" d="M38 54l11 12 14-17M50 41V77"/>',
 charge:'<circle cx="50" cy="50" r="32" stroke-dasharray="5 8"/><path d="M61 15L33 51L52 47L40 85L72 42L54 46Z"/>',
 repeater:'<path d="M20 25L40 42H61L81 25M21 75L40 58H61L81 75M50 13V88M35 48H67"/>',
 pierce:'<path d="M14 83L85 12M68 14L86 11L82 30"/><path class="fine" d="M32 29L61 23L72 48L57 73L30 62" stroke-dasharray="4 5"/>',
 twin:'<path d="M24 13L56 72M43 74L62 63M76 13L44 72M38 63L57 74"/>',
 follow:'<path d="M24 25A34 34 0 1 1 19 64M24 10V27H7"/><path class="fine" d="M39 67L66 39"/>',
 merge:'<path d="M8 26L36 49L8 73M92 26L64 49L92 73"/><path d="M38 31H62V69H38Z"/>',
 axe:'<path d="M25 83L70 19M53 18Q89 13 84 48L60 44Z"/><path class="fine" d="M20 30L42 47L31 61L51 82"/>',
 fork:'<path d="M50 86V48M50 48L17 18M50 48V12M50 48L83 18M9 23L17 15L24 23M42 20L50 11L58 20M76 23L83 15L91 23"/>',
 bow:'<path d="M24 12Q86 50 24 88L39 50ZM39 50H91M79 40L92 50L79 60"/>',
 ice:'<path d="M50 9V91M15 29L85 71M15 71L85 29M40 18L50 29L60 18M40 82L50 71L60 82"/>',
 force:'<path d="M20 77L77 20L70 51L44 77ZM16 47L27 36M50 83L61 72"/>',
 feather:'<path d="M21 84Q13 19 81 12Q87 72 21 84ZM21 84L70 27M34 68L34 44M47 55L47 32M47 55L70 55"/>',
 oracle:'<circle cx="50" cy="50" r="31"/><path d="M50 19C20 19 20 50 50 50C80 50 80 81 50 81"/><circle cx="50" cy="35" r="4"/><circle cx="50" cy="65" r="4"/>',
 vine:'<path d="M21 78Q68 77 38 54T79 20M30 69Q6 43 29 38M52 46Q85 62 83 38M52 46Q31 23 51 17"/>',
 lion:'<path d="M50 11L67 20L81 40L76 68L50 89L24 68L19 40L33 20ZM34 42L43 47M66 42L57 47M43 64L50 69L57 64"/>',
 'distance-plus':'<path d="M34 24L12 50L34 76M66 24L88 50L66 76M40 50H60M50 40V60"/>',
 'distance-minus':'<path d="M12 24L34 50L12 76M88 24L66 50L88 76M41 50H59"/>',
 wood:'<path d="M24 28H76V73H24ZM19 23H81V35H19ZM50 35V73"/><path class="fine" d="M32 81H68M36 18L50 8L64 18"/>',
 impact:'<circle cx="50" cy="50" r="21"/><path d="M50 8V22M50 78V92M8 50H22M78 50H92M20 20L30 30M70 70L80 80M20 80L30 70M70 30L80 20"/>'
};
export const motifSVG=motif=>`<svg viewBox="0 0 100 100" aria-hidden="true">${strokes[motif]||strokes.impact}</svg>`;

export class CardCinema{
 constructor(scene){this.scene=scene;this.nodes=new Set();this.animations=new Set();}
 clear(){for(const a of this.animations)a.cancel();for(const n of this.nodes)n.remove();this.nodes.clear();this.animations.clear();}
 run(motif,target,{duration=450,slot=null,result=false}={}){
  if(!target||this.scene.reduceMotion||!this.scene.battleEffects)return 0;
  const seat=document.querySelector(`[data-seat="${CSS.escape(target)}"]`),anchor=slot?seat?.querySelector(`[data-slot="${slot}"]`):seat;if(!anchor)return 0;
  const arena=document.querySelector('.table-arena'),a=arena.getBoundingClientRect(),r=anchor.getBoundingClientRect();
  const size=innerHeight<500?40:innerWidth<760?58:82,blocks=[...document.querySelectorAll('.seat,.gear-slots,.play-slot,.judge-zone,#hand-panel,#response-panel,#center-plays,.effect-fan')].filter(e=>e.checkVisibility()).map(e=>e.getBoundingClientRect());
  const cx=r.x+r.width/2,cy=r.y+r.height/2,candidates=[[cx,r.top-size/2-5],[cx,r.bottom+size/2+5],[r.left-size/2-5,cy],[r.right+size/2+5,cy]];
  const score=([x,y])=>blocks.reduce((sum,b)=>sum+Math.max(0,Math.min(x+size/2,b.right)-Math.max(x-size/2,b.left))*Math.max(0,Math.min(y+size/2,b.bottom)-Math.max(y-size/2,b.top)),0)*100+Math.hypot(x-(a.x+a.width/2),y-(a.y+a.height/2));
  const [x,y]=candidates.map(([x,y])=>[Math.max(a.left+size/2,Math.min(a.right-size/2,x)),Math.max(a.top+size/2,Math.min(a.bottom-size/2,y))]).sort((x,y)=>score(x)-score(y))[0];
  if(slot){const pulse=anchor.animate([{boxShadow:'0 0 0 1px #e1d1a7'},{boxShadow:'0 0 0 5px #e1d1a700'}],{duration:450});this.animations.add(pulse);pulse.finished.catch(()=>{}).finally(()=>this.animations.delete(pulse));}
  const n=document.createElement('span');n.className=`cinema-cue cinema-${motif}${slot?' equipment-cue':''}${result?' result-cue combat-burst combat-'+motif:''}`;n.setAttribute('aria-hidden','true');n.innerHTML=motifSVG(motif);n.style.left=x-a.x+'px';n.style.top=y-a.y+'px';
  while(this.nodes.size>=12){const first=this.nodes.values().next().value;first.remove();this.nodes.delete(first);}document.querySelector('.table-arena').append(n);this.nodes.add(n);
  const ms=this.scene.motionChoice==='fast'?duration*.5:duration,frames=[{opacity:0,transform:'translate(-50%,-50%) scale(.65) rotate(-8deg)'},{opacity:.85,transform:'translate(-50%,-50%) scale(1) rotate(0deg)',offset:.28},{opacity:.65,transform:'translate(-50%,-50%) scale(1.04) rotate(0deg)',offset:.68},{opacity:0,transform:'translate(-50%,-50%) scale(1.12) rotate(2deg)'}];
  const paths=[...n.querySelectorAll('path,ellipse,circle,rect')];
  const extra=(el,keyframes,options)=>{const delay=(options.delay||0)*(this.scene.motionChoice==='fast'?.5:1);const a=el.animate(keyframes,{...options,delay,duration:Math.max(1,ms-delay)});this.animations.add(a);a.finished.catch(()=>{}).finally(()=>this.animations.delete(a));};
  for(const [i,path]of paths.entries()){
   const length=path.getTotalLength?.()||180;path.style.strokeDasharray=length;path.style.transformOrigin='50px 50px';
   if(['slash','pierce','axe','force'].includes(motif))extra(path,[{strokeDashoffset:length,opacity:0,transform:'translate(10px,-10px)'},{strokeDashoffset:0,opacity:1,transform:'none',offset:.32},{strokeDashoffset:0,opacity:0,transform:'translate(-5px,5px)'}],{});
   else if(motif==='arrows')extra(path,[{transform:'translate(-15px,-34px)',opacity:0},{transform:'none',opacity:.95,offset:.45},{transform:'translate(4px,8px)',opacity:0}],{delay:i*35});
   else if(['ripple','heal'].includes(motif))extra(path,[{transform:'scale(.55)',opacity:0},{transform:'scale(.9)',opacity:.9,offset:.35},{transform:'scale(1.2)',opacity:0}],{delay:i*35});
   else if(['thunder','charge'].includes(motif))extra(path,[{strokeDashoffset:length,opacity:0},{strokeDashoffset:0,opacity:1,offset:.2},{opacity:.55,offset:.45},{opacity:.85,offset:.6},{opacity:0}],{});
   else if(['duel','twin','fork','follow'].includes(motif))extra(path,[{transform:`rotate(${i%2?18:-18}deg)`,opacity:0},{transform:'rotate(0deg)',opacity:1,offset:.45},{transform:`rotate(${i%2?-3:3}deg)`,opacity:0}],{});
   else if(['fire','feather'].includes(motif))extra(path,[{strokeDashoffset:length,transform:'translateY(13px) scale(.8)',opacity:0},{strokeDashoffset:0,transform:'none',opacity:1,offset:.4},{strokeDashoffset:0,transform:'translateY(-9px) scale(1.05)',opacity:0}],{});
   else extra(path,[{strokeDashoffset:length,opacity:0},{strokeDashoffset:0,opacity:1,offset:.4},{strokeDashoffset:0,opacity:0}],{delay:i*20});
  }
  const anim=n.animate(frames,{duration:ms,easing:'cubic-bezier(.2,.7,.3,1)'});this.animations.add(anim);anim.finished.catch(()=>{}).finally(()=>{n.remove();this.nodes.delete(n);this.animations.delete(anim);});return duration;
 }
 equipment(kind,owner,target){const c=CARD_STORYBOARDS[kind];return c?this.run(c.motif,target||owner,{slot:!target||target===owner?CARD_MAP[kind]?.slot:null,duration:450}):0;}
}
