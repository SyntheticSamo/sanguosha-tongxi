import {handLimit} from './skills.js';
import {hasSkill} from './primitives.js';

export const tactile=s=>s.interactionMode==='tactile'&&s.mode==='auto';
export const phaseToken=s=>`${s.skillTurnNo||0}:${s.turn}:${s.phase}`;
export function canAutoAdvance(s){
  if(!tactile(s)||s.status!=='playing'||s.flow?.opening||s.flow?.paused||s.tableExperience&&(s.players.find(p=>p.id===s.turn)?.autoAdvanceEnabled===false||s.flow?.needsContinue===phaseToken(s))||s.rules.pending||s.rules.queue.length||s.phase===3||s.flow?.draw?.remaining>0||Object.values(s.peek).some(x=>x.length))return false;
  const p=s.players.find(p=>p.id===s.turn);
  return s.phase!==4||p.hand.length<=handLimit(s,p)||hasSkill(p,'克己')&&s.rules.slash===0&&s.rules.slashPlayed===0;
}
export function validateFlow(s,check){
  check(s.interactionMode===undefined||['classic','tactile'].includes(s.interactionMode),'交互模式无效');
  check(s.interactionMode!=='tactile'||s.mode==='auto','逐张摸牌需要自动牌桌');
  for(const p of s.players)check(p.autoAdvanceEnabled===undefined||typeof p.autoAdvanceEnabled==='boolean','自动推进设置无效');
  if(!s.flow)return;
  check(s.flow.needsContinue===undefined||typeof s.flow.needsContinue==='string'&&s.flow.needsContinue.length<=100,'判定继续标记无效');
  check(typeof s.flow.paused==='boolean','阶段暂停状态无效');
  if(s.flow.opening)check(s.status==='playing'&&typeof s.flow.opening.id==='string'&&/^\d+:opening$/.test(s.flow.opening.id)&&Number.isFinite(s.flow.opening.duration)&&s.flow.opening.duration>=0&&s.flow.opening.duration<=10000,'开局展示无效');
  if(s.flow.draw){const d=s.flow.draw;check(typeof d.id==='string'&&/^\d+:draw$/.test(d.id)&&Number.isInteger(d.remaining)&&d.remaining>=0&&d.remaining<=40&&s.phase===2&&s.turn===d.player,'摸牌窗口无效');}
}
