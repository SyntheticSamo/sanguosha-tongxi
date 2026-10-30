import {SKILL_DIFFICULTIES} from './skill-difficulties.js';
export const ACTIVE_SKILLS=new Set(['仁德','制衡','苦肉','青囊','结姻','离间','强袭','奇谋','涅槃','直谏','缔盟','挑衅','驱虎','天义','乱武','黄天','制霸','成略','飞军','雄乱','决堰','怀柔','护驾','激将','反间','国色','义绝','审时','贞良','攻心','急袭','清侧','蛊惑']);
export const AUTOMATED_NAMES=new Set([...ACTIVE_SKILLS,'奸雄','反馈','刚烈','突袭','裸衣','天妒','遗计','洛神','观星','英姿','闭月','连营','枭姬','节命','狂骨','放逐','行殇','颂威','激昂','耀武','崩坏','暴虐','血裔','肉林','完杀','帷幕','祸首','巨象','截辎','八阵','火计','看破','酒池','断粮','连环','乱击','同疾','享乐','父荫','谦节','断肠','兵略','怀橘','遗礼','整论','寸目','庸肆','诈降','马术','武圣','龙胆','倾国','急救','奇袭','国色','咆哮','无双','空城','奇才','谦逊','克己','鬼才','鬼道','救援','好施','双雄','据守','进趋','集智','奇制','英魂','志继','魂姿','若愚','烈弓','铁骑','雷击','解围','妄尊','红颜','荐降','拒战','掣政','立军','从谏','伪帝','鞬出','利驭','破势','罪论']);

const partial={caoren:{解围:'装备转无懈已实现；从背面翻回时的弃牌移动分支仍人工裁定'},jie_luxun:{谦逊:'普通单目标锦囊暂存已支持；延时锦囊的来源与生效时机仍待补齐'},lukang:{决堰:'武器、防具和坐骑分支已自动；宝物获得集智的版本分支待核对'},jie_guanyu:{义绝:'禁用非锁定技与手牌的完整窗口待实现'},jie_machao:{铁骑:'本回合非锁定技失效及同花色弃牌分支待实现'},jie_sunquan:{救援:'界版改为他人自用桃的替代回复，尚未接入'},huangyueying:{集智:'亮顶基本牌的交换位置需要进一步核对，暂不自动执行此分支'},yanliangwenchou:{双雄:'摸牌替换与决斗转化已接入；受伤回收对手杀仍待补齐'}};
export const COMPLETE_NAMES=new Set([...AUTOMATED_NAMES,...Object.keys(SKILL_DIFFICULTIES),'急袭','清侧','攻心','缠怨']);
export function skillSupport(g,skill,complete=false){
 if(complete&&COMPLETE_NAMES.has(skill.name))return {status:ACTIVE_SKILLS.has(skill.name)?'主动自动':'触发 / 被动自动',full:true,difficult:false,reason:'玩家决定发动、材料和目标，系统执行效果。专属牌区、阶段跳过及后续追踪由权威队列管理。'};
 const reason=SKILL_DIFFICULTIES[skill.name]||partial[g.id]?.[skill.name];
 if(reason)return {status:AUTOMATED_NAMES.has(skill.name)&&!['jie_machao:铁骑','jie_sunquan:救援'].includes(g.id+':'+skill.name)?'部分自动':'困难 · 人工',full:false,difficult:true,reason};
 if(AUTOMATED_NAMES.has(skill.name))return {status:ACTIVE_SKILLS.has(skill.name)?'主动自动':'触发 / 被动自动',full:true,difficult:false,reason:'由系统校验时机、成本和效果；可选技能仍由玩家决定是否发动。'};
 return {status:'待实现 · 人工',full:false,difficult:true,reason:'此技能尚无完整自动处理器，继续使用人工步骤与工具。'};
}
