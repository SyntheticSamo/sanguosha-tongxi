import {writeFile} from 'node:fs/promises';
import {GENERALS} from '../dist/data/generals.js';
import {ACTIVE_SKILLS} from '../dist/data/skill-support.js';
const set=s=>new Set(s.split(' '));
const locked=set('马术 咆哮 无双 空城 奇才 克己 红颜 完杀 肉林 血裔 八阵 帷幕 祸首 巨象 断肠 同疾 谦节 父荫 怀橘 兵略 寸目 庸肆 诈降 征荣 享乐 截辎');
const awaken=set('志继 魂姿 若愚 凿险 勤学 破势 鸿举');
const conversion=set('武圣 龙胆 倾国 急救 奇袭 国色 火计 看破 酒池 断粮 连环 乱击');
const phase={巧变:'判定/摸牌/出牌/弃牌前',神速:'判定/出牌/弃牌前',放权:'出牌前；回合结束交牌',洛神:'准备；黑色结果后可继续',观星:'准备；界版条件满足时结束',英魂:'准备且已受伤',箜声:'准备；结束强制处理装备',化身:'开局必选；准备/回合结束可选',明任:'开局必选；结束可替换',突袭:'正常摸牌前',裸衣:'正常摸牌前',英姿:'标准摸牌前；界版为常驻修正',好施:'正常摸牌前；摸完后强制分配',双雄:'正常摸牌前；决斗受伤后回收',整论:'无橘时正常摸牌前',遗礼:'出牌开始',闭月:'结束',据守:'结束；发动后完成弃置或装备',进趋:'结束；发动后完成弃牌',罪论:'结束；发动后完成私看排序',镇骨:'结束指定；指定角色结束调整',替身:'出牌结束；追踪杀结束',再起:'弃牌结束且有红牌进入弃牌堆',溃诛:'弃牌结束且有实际弃牌',崩坏:'结束；条件满足强制选择'};
const handCost=set('巧变 清俭 明任 审时 国色 青囊 结姻 反间 仁德 缔盟 飞军 义绝 直谏 蛊惑');
const bothCost=set('流离 天香 悲歌 制衡 强袭 离间 贞良 怀柔');
let rows=[];
for(const g of GENERALS)for(const sk of g.skills){
 let timing=phase[sk.name]||(awaken.has(sk.name)?'准备阶段达成条件':locked.has(sk.name)?'对应规则事件':conversion.has(sk.name)?'使用/响应合法牌时':ACTIVE_SKILLS.has(sk.name)?'出牌空闲时；主公请求/救援按专属窗口':'对应事件发生时');
 let path=awaken.has(sk.name)?'觉醒不询问；奖励选择保留':locked.has(sk.name)?'强制效果直接执行；真实分支保留':phase[sk.name]?'阶段机会；正常操作关闭；后续强制步骤保留':conversion.has(sk.name)?'选择合法材料；非法提交回滚':ACTIVE_SKILLS.has(sk.name)?'主动入口；提交前可取消':'简短发动/放弃；需要时展开选择';
 if(sk.name==='英姿'&&g.pack==='jie')path='常驻摸牌量和手牌上限修正，不询问';
 if(sk.name==='解围'){timing='装备转无懈；翻正后可弃手牌移牌';path='响应/事件入口；移牌可放弃，无落点结束';}
 if(sk.name==='妄尊'){timing='其他主公准备阶段';path='本人事件提示；不被当前玩家继续按钮代为放弃';}
 if(['固政','伪帝'].includes(sk.name)){timing='实际弃牌完成后';path='过滤仍在弃牌堆的牌；分配结束有出口';}
 if(['鬼才','鬼道'].includes(sk.name)){timing='公开判定后、确认结果前';path='选择合法改判牌；不预先公开其他手牌';}
 const cost=handCost.has(sk.name)?'按版本手牌成本/分配':bothCost.has(sk.name)?'按版本材料；装备成本后重算':conversion.has(sk.name)?'按版本颜色/花色/牌区':awaken.has(sk.name)||locked.has(sk.name)?'条件/标记；真实选择按牌面':'按牌面目标与分支';
 rows.push(`| ${g.name}（${g.id}） | ${sk.name} | ${timing} | ${cost} | ${path} |`);
}
const header=`# 技能发动时机审查 · v7

101个武将版本、190个技能条目。此表逐项对照牌库、阶段生成器及事件处理器，记录交互契约；不改技能文本与实体版范围。版本来源见每位武将资料及 CATALOG_VERSIONS.md。

阶段技能通过本人机会窗口发动；空材料/空目标不形成可选死窗口。受伤、指定目标等瞬时事件保留发动/放弃。锁定/觉醒无选择效果直接执行，真实强制分支不能通过取消绕过。

本轮实际修复：巧变/解围移牌可放弃、同槽与判定区落点统一、双人连续阶段询问；突袭无手牌目标；神速无装备/无合法杀目标；流离支付武器/坐骑后的距离；可选空材料提示；强制弃牌在实际牌不足时取实际数量；旧v6卡住移牌与安全初始阶段提示迁移。

验证分层：现有技能回归保留；新增测试对101版本的六阶段分别检查有手牌/空手牌、阶段机会、发动前取消和状态守恒。这是1212个阶段场景，不是190技能全部多角色组合的穷举。具体执行数量与浏览器结果见 TESTING.md。

| 武将版本 | 技能 | 发动/结算时机 | 成本和选择检查 | 交互及退出契约 |
| --- | --- | --- | --- | --- |
`;
await writeFile(new URL('../docs/SKILL_TIMING_AUDIT.md',import.meta.url),header+rows.join('\n')+'\n');
console.log(`Audited ${GENERALS.length} editions / ${rows.length} skill entries.`);
