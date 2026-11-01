import {CARD_TYPES} from './cards.js';
// Visual direction only; card rules and legal choices remain in the engine.
const paths={
 sha:['slash','落桌→响应→刀光→实际体力变化'],fire_sha:['fire','落桌→响应→火焰命中→连环'],thunder_sha:['thunder','落桌→响应→雷弧命中→连环'],
 shan:['shield','抵达响应位→护盾截击→抵消'],tao:['heal','自用或救援→实际回复→体力格填充'],jiu:['wine','落桌→酒标记；自救只回复'],
 chai:['dismantle','展开牌区→背面整理→选牌→抽离弃置'],shun:['steal','展开牌区→背面整理→选牌→精确入手'],juedou:['duel','双方对峙→交替响应杀→实际伤害'],jiedao:['borrow','使用者→持刀者→被杀者；杀或交武器'],wuzhong:['draw','无懈处理→逐张摸牌→入手'],wuxie:['counter','抵达→轻撞→斜裂→抬起压下'],nanman:['ripple','号令→逐目标响应→结果→下一人'],wanjian:['arrows','箭阵→当前目标箭束→响应或伤害'],taoyuan:['heal','按实际顺序回复→体力格填充'],wugu:['market','逐张铺牌→拾取→飞入手牌→余牌弃置'],huogong:['reveal','展示有效花色→支付→火焰伤害或熄灭'],tiesuo:['chain','待用→角色间拉链→确认→逐目标连接或解链'],
 le:['seal','入判定区→翻判改判确认→封印出牌阶段'],bingliang:['grain','入判定区→翻判改判确认→收束摸牌额度'],shandian:['charge','入判定区→蓄电翻判→命中或传递'],
 liannu:['repeater','入槽→每次实际杀机械回位'],qinggang:['pierce','武器提示→本次防具失效→恢复'],cixiong:['twin','双刃展开→弃牌或摸牌→继续原杀'],qinglong:['follow','闪及插入效果→追加杀→返回原流程'],zhangba:['merge','两张材料汇合→效果杀→材料详情'],guanshi:['axe','闪抵消→两张成本弃置→盾裂→原杀生效'],fangtian:['fork','最后手牌条件→目标分支→依次响应'],qilin:['bow','伤害时机→选坐骑→弃置→继续伤害'],hanbing:['ice','防止伤害→依次弃置并处理失牌触发'],guding:['force','无手牌条件→加力刻痕→实际伤害'],zhuque:['feather','确认转化→纸边火纹→同一次火杀'],
 bagua:['oracle','发动→翻判改判→红色视为闪'],renwang:['shield','实际条件成立→黑杀截断'],tengjia:['vine','藤纹拦截；火伤实际增伤'],baiyin:['lion','减伤收拢；真实离槽后回复'],
 jueying:['distance-plus','入槽→扩距弧→实际距离'],dilu:['distance-plus','入槽→扩距弧→替换离槽'],zhuahuang:['distance-plus','入槽→扩距弧→实际距离'],hualiu:['distance-plus','入槽→扩距弧→叠加实际修正'],chitu:['distance-minus','入槽→收距弧→实际距离'],dayuan:['distance-minus','入槽→收距弧→替换离槽'],zixing:['distance-minus','入槽→收距弧→失去后恢复'],muniu:['wood','扣牌成包→随装备转交或离区清理']
};
export const CARD_STORYBOARDS=Object.freeze(Object.fromEntries(CARD_TYPES.map(c=>{
 const [motif,sequence]=paths[c.id];return [c.id,Object.freeze({motif,sequence,contexts:c.slot?['use','equipment','move','judge','public','private']:['use','response','judge','pindian','public','private'],duration:c.id==='tiesuo'?1150:c.id==='wuxie'?1000:450})];
})));
