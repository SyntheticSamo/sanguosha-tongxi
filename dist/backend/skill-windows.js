import {hasSkill} from './primitives.js';

// Phase opportunities are private decisions, separate from the resolution queue.
export const phaseExperience=s=>!!s.tableExperience&&!!s.skillAutomation;
export const stageKey=s=>`${s.skillTurnNo||0}:${s.turn}:${s.phase}`;
export function phaseJobs(s,p,jobs,timing){
  if(!phaseExperience(s)||!jobs.length)return jobs;
  return [...jobs.map(e=>e.owner===p.id?{...e,phaseOffer:timing}:e),{type:'phaseGate',owner:p.id,phaseKey:stageKey(s)}];
}
export function feasiblePrompt(q){
  if(!q||q.kind!=='skill')return false;
  return q.choices.some(c=>{
    const cards=c.minCards??q.minCards,targets=c.minTargets??q.minTargets;
    return cards<=(c.maxCards??q.maxCards)&&targets<=(c.maxTargets??q.maxTargets)&&
      (!q.cardChoices||q.cardChoices.length>=cards)&&q.targetIds.length>=targets;
  });
}
export function captureOpportunity(s,e){
  const q=s.rules.pending;
  if(!phaseExperience(s)||!e.phaseOffer||e.owner!==s.turn||!q?.optional)return false;
  s.rules.pending=null;if(!feasiblePrompt(q))return true;
  let w=s.flow.skillWindow;
  if(!w||w.phaseKey!==stageKey(s)){s.skillWindowSeq=(s.skillWindowSeq||0)+1;w=s.flow.skillWindow={id:`${stageKey(s)}:skills:${s.skillWindowSeq}`,owner:s.turn,phaseKey:stageKey(s),offers:[]};}
  if(!w.offers.some(o=>o.skill===q.skill))w.offers.push({skill:q.skill,task:{...e,phaseOffer:undefined},prompt:q});return true;
}
export function opportunityBlocks(s,o){
  if(o.skill==='巧变'&&s.phase===1)return s.players.find(p=>p.id===s.turn).judge.length>0;
  if(o.skill==='巧变'&&s.phase===4)return false; // Actual discard requirements are checked by the phase engine.
  return true;
}
export function projectOpportunities(s,viewer){
  const w=s.flow?.skillWindow;if(!w||w.owner!==viewer)return null;
  return {id:w.id,owner:w.owner,phaseKey:w.phaseKey,offers:w.offers.map(o=>({skill:o.skill,hint:o.prompt.hint}))};
}
export function validateSkillWindow(s,check){
  const w=s.flow?.skillWindow;if(!w)return;
  check(phaseExperience(s)&&w.owner===s.turn&&w.phaseKey===stageKey(s)&&typeof w.id==='string'&&w.id.length<160&&Array.isArray(w.offers)&&w.offers.length<=32,'阶段技能窗口无效');
  check(new Set(w.offers.map(o=>o.skill)).size===w.offers.length&&w.offers.every(o=>o.task.owner===w.owner&&o.prompt.optional&&feasiblePrompt(o.prompt)),'阶段技能机会无效');
}
export function stillHasOpportunity(s,o){
  const p=s.players.find(p=>p.id===s.turn);
  return p&&!p.dead&&hasSkill(p,o.skill)&&!p.skillState?.turn?.skipPhases?.includes(s.phase);
}
