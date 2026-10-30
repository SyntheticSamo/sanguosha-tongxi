// Keep the final control point behind the tip, even directly above the source.
export function aimPath(x,y,tx,ty){
  const dx=tx-x,dy=ty-y,len=Math.hypot(dx,dy);if(len<12)return '';
  const ux=dx/len,uy=dy/len,lead=Math.min(70,len*.3),bend=Math.min(28,len*.09);
  return `M${x},${y} C${x+ux*lead-uy*bend},${y+uy*lead+ux*bend} ${tx-ux*lead},${ty-uy*lead} ${tx},${ty}`;
}
