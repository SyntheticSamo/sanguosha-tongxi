import {GENERAL_MAP} from './generals.js';
export const REFERENCE_SKILLS={jueyanJizhi:{name:'集智',text:'使用普通锦囊牌时，可以摸一张牌。',edition:'经典集智 · 本桌决堰引用定义',source:'https://gltjk.com/sanguosha/rules/card/hero/shu.html',sourceNote:'决堰原条目未注明同名集智版本。本项目明确引用旧标准的普通锦囊摸一张定义，不声称已核验陆抗最新实体印次。'}};
export const skillGeneral=(p,name)=>p.skillState?.avatar?.skill===name?p.skillState.avatar.general:p.general;
export const DERIVED_SKILLS={缠怨:{name:'缠怨',text:'锁定：不能质疑蛊惑，体力为1时其他技能失效。',parent:'yuji'},急袭:{name:'急袭',text:'可将一张田当顺手牵羊使用。',parent:'dengai'},清侧:{name:'清侧',text:'出牌阶段，移去一张荣，弃置场上一张牌。',parent:'guanqiujian'},攻心:{name:'攻心',text:'出牌阶段限一次，观看他人手牌，可弃置或置顶其中一张红桃。',parent:'jie_lvmeng'}};
export function skillText(p,name){return GENERAL_MAP[skillGeneral(p,name)]?.skills.find(sk=>sk.name===name)?.text||DERIVED_SKILLS[name]?.text||'';}
export const lockedSkill=(p,name)=>/^锁定|^觉醒/.test(skillText(p,name));
