import {writeFile} from 'node:fs/promises';
import {CARD_TYPES} from '../dist/data/cards.js';
// Curated review notes; card identities and rule text remain in dist/data.
const notes={
sha:['攻击范围、次数、闪与防具；伤害关联原牌','保留；响应线指向原杀','rules / tactile / advisor'],
fire_sha:['火属性杀；允许连环；藤甲逐目标增伤','修复逐人重置、渠道与增伤不重叠','round-six / rules / tactile'],
thunder_sha:['雷属性杀；允许连环','修复死亡后的传导与逐人结束','round-six / rules'],
shan:['响应杀，含无双的连续闪','仅最新响应显示动态抵消线','rules / tactile'],
tao:['受伤时自用、濒死时按顺序救援','合法来源筛选，连续求桃与自救文案','round-six / experience'],
jiu:['自用增伤、濒死本人自救','自救资格；酒增伤不在连环中重复','round-six / tactile'],
chai:['可弃区域、角色保护与匿名手牌选择','手牌准备1.5秒，冻结匿名映射；装备直接选','round-six / experience'],
shun:['距离、合法牌区、真实获得','准备时限与身份无关；整理提示不传牌序','round-six / experience / complete-sync'],
juedou:['依次响应杀，无双可要求两张','当前响应者和剩余杀数量；响应关联原牌','rules / round-six'],
jiedao:['使用者、持武器者、被杀者；杀或交武器','三方提示；两种移动方向分别演示','rules / tactile'],
wuzhong:['本人获得两张，当前效果可无懈','各张到位前隐藏；双击去重','experience / round-six browser'],
wuxie:['当前对象的一次锦囊效果及反无懈','保留逐目标反制与中途重新检测；隐去无资格名单','experience / complete-sync / round-six'],
nanman:['依行动顺序逐人无懈、杀、伤害；普通伤害','保留顺序；普通伤害不传导','rules / round-six / complete-skills'],
wanjian:['依行动顺序逐人无懈、闪、伤害','拒绝后位抢先响应，结果逐人展示','round-six / rules'],
taoyuan:['依行动顺序回复；逐目标无懈','实际体力变化处显示回复光圈','rules / presentation'],
wugu:['公开牌列，逐角色无懈后选一张','中途获得无懈可用于后续对象；剩余牌归弃牌','round-six / experience'],
huogong:['展示手牌后可弃同有效花色牌造成火伤','两方分别使用当前有效花色；明确放弃','round-six / advisor'],
tiesuo:['一至两名角色横置或重置；可重铸','待出牌预览；金属环网络；按实际伤害依次解链','experience / round-six / rules'],
le:['先当前效果无懈，再翻判、改判、确认','角色右侧判定区与当前判定状态','experience / skill-windows'],
bingliang:['距离和同名限制；先无懈后判定','待翻／确认、跳摸牌标记','experience / skill-windows'],
shandian:['自身放置；先无懈、判定，再命中或传递','自用双击；结果显示命中／传递','rules / experience'],
liannu:['出杀次数修正','外置武器槽；规则入口共用','rules / tactile'],
qinggang:['指定目标的防具无效，不延伸至其他连环者','保留；传导单独计算防具','rules / tactile'],
cixiong:['符合条件时目标弃手牌或使用者摸牌','保留已实现的选择与权威结算','tactile'],
qinglong:['闪抵消后可对同一对象追杀','保留队列恢复与多目标后续','tactile'],
zhangba:['两张合法可用牌转杀，支持储牌混合','装备默认详情；材料选择与目标互不干扰','tactile / complete-sync'],
guanshi:['闪及触发后支付两张合法牌，原杀生效','保留不可弃本斧费用及恢复原杀','tactile'],
fangtian:['最后手牌的目标数量修正','共用目标合法性，不由箭头决定成功','tactile'],
qilin:['正确伤害时机弃目标坐骑','保留转移、防止与实际失牌触发','tactile'],
hanbing:['防止原伤害，依次弃目标至多两张','保留每次失牌事件与结束出口','tactile'],
guding:['无手牌目标的杀增伤','连环不重复原始武器增伤','tactile / round-six'],
zhuque:['普通杀转火杀','保留转化来源；铁索按火伤处理','tactile'],
bagua:['手动翻判、改判、确认后响应闪','保留，不在判定完成前代推进','experience / tactile'],
renwang:['黑色杀抵消及防具无效例外','保留；伤害防止不触发铁索','rules / tactile'],
tengjia:['普通杀／指定群体牌防止，火伤增加','每名连环者单独计算','round-six / rules / tactile'],
baiyin:['伤害限制与失去装备回复','逐目标限制；替换触发真实失牌','round-six / tactile'],
muniu:['储牌隐私、可用材料、转交保留、离区清理','含合法蛊惑；不伪造入手或重复触发失牌；中止退回原容器','round-six / tactile / complete-sync']
};
const mounted=new Set(['jueying','dilu','zhuahuang','chitu','dayuan','zixing','hualiu']);
const rows=CARD_TYPES.map(c=>{const n=notes[c.id]||(mounted.has(c.id)?['实际距离修正，与武器攻击范围分开','外置坐骑槽；数字与布局共用实际距离','rules / tactile / scene']:null);if(!n)throw new Error('缺少审查条目 '+c.id);return `| ${c.name} | ${c.id==='muniu'?'[官方FAQ][W]':c.slot?'[装备][E]':['sha','fire_sha','thunder_sha','shan','tao','jiu'].includes(c.id)?'[基本][B]':'[锦囊][T]'} | ${n[0]} | ${n[1]} | ${n[2]} |`;});
await writeFile(new URL('../docs/CARD_RULE_AUDIT_V8.md',import.meta.url),`# 第六轮逐牌复核 · 44种牌

以现有实体身份版牌库和规则集3.0为参考，不引入国战无懈变体，不以旧版武将FAQ覆盖本项目选定的技能文本。[伤害流程][D]明确区分伤害渠道、原始基数和连环伤害；[濒死流程][S]按当前回合角色开始依次响应。

下表记录检查的基础分支、实际改动和回归入口。测试栏为 tests/同名.test.js 或 scripts/browser-同名.mjs；它不表示每种牌与190项技能的全部组合已穷举。来源旧示例中的天香、不屈等版本仍以 docs/CATALOG_VERSIONS.md、dist/data/ 为准。未增加新牌种或插画。

| 牌 | 规则来源 | 当前行为与复核点 | 本轮处理 | 回归证据入口 |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

所有公开使用与响应进入桌心的当前回合账本；按接收席位投影牌面。结束时按使用者归档展示副本，不重复移动真实牌。普通快照32条，较早记录经授权sync分页（最多32条、64KiB）；真实牌区守恒不依赖展示历史。

共享失败检查：非法材料和后位响应完整回滚、匿名选牌未就绪拒绝、过期页／窗口／操作者拒绝、隐藏材料不随新持有者手牌曝光、首次伤害死亡仍正确继续连环、恢复不重播。详细本机验证和未验证范围见 [TESTING.md](TESTING.md)。

[B]: https://gltjk.com/sanguosha/rules/card/basic.html
[T]: https://gltjk.com/sanguosha/rules/card/scroll.html
[E]: https://gltjk.com/sanguosha/rules/card/equipment.html
[W]: https://www.sanguosha.com/news/20140521_4929_0717
[D]: https://gltjk.com/sanguosha/rules/flow/damage.html
[S]: https://gltjk.com/sanguosha/rules/flow/neardeath.html
`,'utf8');
console.log(`Reviewed ${rows.length} card kinds; audit written.`);
