# 资料来源与版本口径

核对日期：2026-10-27。

## 收录范围

- 经典标准版 25 将：魏 7、蜀 7、吴 8、群 3。
- 标准游戏牌 104 张：基本 53、锦囊 34、装备 17。
- EX 4 张：黑桃 2 寒冰剑、梅花 2 仁王盾、红桃 Q 闪电、方块 Q 无懈可击。
- 104 + EX 的总牌数为 108，32 种名称；同名牌按花色、点数与独立 ID 存放。
- 不含军争、界限突破、2013 标准版新增武将或之后的重做技能。经典仁德、遗计、离间等与后续版本有差异。

## 链接与核对方式

1. [三国杀 Wiki：规则](https://sanguosha.fandom.com/zh/wiki/%E8%A7%84%E5%88%99)：规则入口和区域术语。
2. [三国杀 Wiki：武将列表](https://sanguosha.fandom.com/zh/wiki/%E4%B8%89%E5%9B%BD%E6%9D%80%E6%AD%A6%E5%B0%86%E5%88%97%E8%A1%A8)：版本区分、经典标准武将归属。每位武将的数据还提供其 Wiki 条目链接。
3. [三国杀规则集 3.0：身份局资料](https://gltjk.com/sanguosha/rules/info/role.html)：核对牌名、花色、点数。该表同时包含军争等内容，项目只取标准 / EX 对应项，例如无懈仅取黑桃 J、梅花 Q/K 及 EX 方块 Q，不取军争黑桃 K 与红桃 A/K。
4. [游戏官网：游戏规则](https://game.qidian.com/Game/showNews/index?name=sgs&nid=1082111)：交叉核对 25 将、104 + 4 EX 的经典组件口径和身份目标。
5. [三国杀 OL 官网：标准版甄姬](https://www.sanguosha.com/news/20161025_6540_1618)：经典武将与技能背景的交叉参照。

Wiki 部分页面在本次环境无法直接抓取，使用可见搜索条目、规则集与官网交叉核对；没有将受限页面当作已完整读取。项目中的技能文字为人工裁定的独立简写，不是逐字转载。没有宣称逐条 FAQ 已由代码自动覆盖；对技能时机有争议时，请同桌打开对应版本原文核对。

## 技术资料

- [MDN：WebRTC 连接建立与信令](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling)：信令与传输分离；邀请 / 回应通过人工渠道交换。
- [MDN：WebRTC 协议、STUN 和 TURN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols)：NAT 穿透和中继边界，不能保证所有网络都可直接连接。
- [MDN：RTCDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)：可靠有序数据通道与缓冲水位。

当前 UI、美术排版、程序和技能简写为本项目实现。三国杀的名称、规则与相关商标属于相应权利人；项目不附带官方游戏美术资源。
