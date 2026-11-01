// Stable display helpers. None of these functions changes the game snapshot.
export function cardTilt(room,turn,id){let hash=2166136261;for(const c of `${room}:${turn}:${id}`){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return ((hash>>>0)%601-300)/100;}
export function capturePositions(container,selector){return new Map([...container.querySelectorAll(selector)].map(el=>[el.dataset.cardAnchor||el.dataset.effectCard||el.dataset.play,el.getBoundingClientRect()]));}
export function settlePositions(container,selector,before,reduce=false,exclude=null){
 if(reduce)return;
 for(const el of container.querySelectorAll(selector)){const key=el.dataset.cardAnchor||el.dataset.effectCard||el.dataset.play,old=before.get(key);if(!old||key===exclude)continue;const now=el.getBoundingClientRect(),dx=old.x-now.x,dy=old.y-now.y;if(Math.abs(dx)+Math.abs(dy)<1)continue;
  el.animate([{translate:`${dx}px ${dy}px`},{translate:'0px 0px'}],{duration:150,easing:'cubic-bezier(.2,.7,.3,1)'});
 }
}
