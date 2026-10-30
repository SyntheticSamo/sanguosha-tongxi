// Capability metadata only. All skill text and edition information stays in generals.js.
import {skillSupport,ACTIVE_SKILLS} from './skill-support.js';
const passive=new Set(['马术','咆哮','无双','空城','谦逊','奇才']);
const conversions={武圣:['sha'],龙胆:['sha','shan'],倾国:['shan'],急救:['tao'],奇袭:['chai'],国色:['le'],火计:['huogong'],看破:['wuxie'],酒池:['jiu'],断粮:['bingliang'],连环:['tiesuo'],乱击:['wanjian'],双雄:['juedou'],解围:['wuxie']};
export function abilityInfo(g,skill,extended=false,complete=false){
  if(extended){const support=skillSupport(g,skill,complete);return {...support,kinds:conversions[skill.name]||[],active:ACTIVE_SKILLS.has(skill.name)&&(support.full||g.id==='lukang'&&skill.name==='决堰')&&!(g.id==='daqiao'&&skill.name==='国色'),scope:support.reason,rejudge:['鬼才','鬼道'].includes(skill.name)};}
  if(conversions[skill.name])return {status:g.pack==='jie'?'部分自动':'主动操作',kinds:conversions[skill.name],scope:'基础转化自动校验；牌面其他效果由同桌裁定。'};
  if(passive.has(skill.name))return {status:g.pack==='standard'?'自动处理':'部分自动',kinds:[],scope:g.pack==='standard'?'本版基础被动已由规则处理，请勿重复执行。':'基础距离、次数或响应限制已自动处理；本版其他效果请按技能文本人工裁定。'};
  if(['鬼才','鬼道'].includes(skill.name))return {status:'主动操作',kinds:[],scope:'判定窗口中可选牌改判；特殊附加效果由同桌裁定。',rejudge:true};
  if(skill.name==='克己')return {status:'部分自动',kinds:[],scope:'未使用或打出杀时免弃牌检查已自动处理；其他效果人工裁定。'};
  return {status:'手动结算',kinds:[],scope:'系统提供公告与牌区工具；不会自动执行本技能效果。'};
}
export function equipmentInfo(kind,automated=false){
  if(automated&&['cixiong','qinglong','guanshi','fangtian','qilin','hanbing','muniu'].includes(kind))return '效果全自动 · 按提示决定发动、材料和目标';
  if(['liannu','qinggang','guding','renwang','tengjia','baiyin'].includes(kind))return '基础效果自动';
  if(['bagua','zhangba','zhuque'].includes(kind))return '基础效果可主动操作';
  if(['jueying','dilu','zhuahuang','chitu','dayuan','zixing','hualiu'].includes(kind))return '距离自动';
  return kind==='muniu'?'储牌与转移手动裁定':'攻击范围自动 · 附加效果手动裁定';
}
