# 资料来源

核对日期：2026-10-27。名单范围由用户明确为标准27 + 界标26 + 神话再临48，不含神。

## 武将

- 标准：原25人 + 华雄、袁术；不把其他新标准替换名单再叠加。
- 界标26：原25人的界版 + 界华雄。该范围按用户指定计数收录，不声称所有历史实体界限突破产品仅26张。
- 神话48：风、火、林、山、阴、雷各8名普通将。
- 标准/界/卧龙/雷袁术等同人物变体可在资料库并存，但不同时上桌。

主来源为 [三国杀 Wiki](https://sanguosha.fandom.com/zh/wiki/三国杀武将列表)，每个条目保留独立链接、所采用版次和已知差异。优先选明确列为实体身份版的后期修订，不把Mobile、Online、国战或只在收藏版外线上出现的重做直接当作实体最新。

数据初始分包参照 [LTKGeneralList](https://github.com/zhangshenxing/LTKGeneralList/blob/master/index.html)（blob `c12732deb6383c5a89f2396483c137ec04511ad4`），该表自身声明技能/发行仅供参考，存在混合修订和错误。现已逐项修正高风险角色并保存版次，不能单凭该表推断实体最新。

已核实条目采用的后期版次含2017/2018神话、2020神话及界限、2022修订、2023《飞鸿印雪》、董卓2024、刘备2025等。实体版修订与未证实项详见 [CATALOG_VERSIONS.md](CATALOG_VERSIONS.md)，101项索引见 [ROSTER.md](ROSTER.md)。三项尤其不能冒称已核实最新印次：标准黄月英、界吕布后续体力、界关羽当前修订的精确实体发行。

## 牌堆和基础规则

- [身份局牌面分布](https://gltjk.com/sanguosha/rules/info/role.html)：区分标准104、EX4、军争52和额外木牛1，不混入国战牌。
- [基本牌](https://gltjk.com/sanguosha/rules/card/basic.html)：杀、闪、桃、酒、属性杀。
- [锦囊牌](https://gltjk.com/sanguosha/rules/card/scroll.html)：常用锦囊、延时、铁索与火攻。
- [装备牌](https://gltjk.com/sanguosha/rules/card/equipment.html)：范围、坐骑、防具。
- [拼点流程](https://gltjk.com/sanguosha/rules/flow/rankcompare.html)：秘密提交、同时公开、比较点数。
- [三国杀OL FAQ](https://g.iqiyi.com/sanguosha/news/321006.html)：延时锦囊的无懈时机为判定阶段翻牌之前。

规则集表述中的「包括你在内的角色」等为多模式规则语法；本项目普通身份场的桃、酒和无中默认只对自己。自动范围及人工例外见README。

## 技术

- [MDN WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols)：ICE、STUN、NAT与TURN。
- [MDN RTCDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)：有序可靠数据传输与缓冲。

技能文字为功能性归纳，不附台词或原版插画。新建完整模式接入本项目选定101将文本的武将技能效果，不把未见实体牌面的版本认作2026最新印刷；实现范围不等于所有技能组合或实体印次均已核验。

## v4 结算补充口径

- 2013集智交换位置：[游戏牌操作](https://gltjk.com/sanguosha/rules/glossary/gamecard.html)，交换手牌扣置牌堆顶，同时获得原基本牌。
- 标准2013与经典普通锦囊摸牌定义分列：[蜀势力武将](https://gltjk.com/sanguosha/rules/card/hero/shu.html)。陆抗宝物集智的本桌引用定义采用经典版；尚未独立确认其所选实体印次的引用，应保留此限制。
- 化身更换屯田时田入弃牌堆：[山包左慈FAQ](https://u.360.cn/gl/article/9110/)。其他专属牌区随所关联技能失去时清理；临时谦逊手牌按已生成的回合末效果归还。
- 蛊惑采用条目所选新版“质疑才翻开、真实得缠怨”规则；扣置处理牌按尚未公开的状态投影，不混入旧版质疑奖惩或移动版其他重做。参考 [于吉分版本及FAQ](https://sanguosha.fandom.com/zh/wiki/%E4%BA%8E%E5%90%89)。

## v5 装备与展示口径

- [实体身份规则集装备条目](https://gltjk.com/sanguosha/rules/card/equipment.html)：六件武器触发时机、方天额外目标、青龙同目标追加、木牛游戏外储牌和移动清理。
- [游卡木牛流马官方FAQ](https://www.sanguosha.com/news/20140521_4929_0717)：持有者可见、使用／打出及转化、混合丈八／乱击材料，不能直接拼点或作为普通弃牌费用。
- [贯石斧FAQ](https://www.feihuo.com/article/detail/article_id/11422.html?flag=1)：不能弃斧自身、两牌同时支付、先结算闪触发的雷击。该FAQ为旧版辅助证据，与所选实体规则条目一并使用，不据此覆盖其他印次。
- [锦囊规则](https://gltjk.com/sanguosha/rules/card/scroll.html)：无懈针对锦囊对当前目标的一次效果，支持反无懈；展示记录没有独立牌区含义。
