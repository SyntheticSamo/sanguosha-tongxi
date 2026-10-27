// Classic pre-2013 standard deck. Rank/suit distributions are deliberately explicit.
export const SUITS = { S: '♠', H: '♥', C: '♣', D: '♦' };
export const rankText = n => ({1:'A',11:'J',12:'Q',13:'K'}[n] || String(n));
export const red = c => c.suit === 'H' || c.suit === 'D';
const def = (id, name, type, rule, extra = {}) => ({ id, name, type, rule, ...extra });
export const CARD_TYPES = [
  def('sha','杀','基本','出牌阶段通常限一次，指定攻击范围内一名其他角色；其打出闪，否则受到1点伤害。'),
  def('shan','闪','基本','响应杀时打出，抵消一次杀的效果。'),
  def('tao','桃','基本','出牌阶段回复自己1点体力；濒死求桃时令濒死角色回复1点体力。'),
  def('chai','过河拆桥','锦囊','弃置其他一名角色区域内的一张牌。'),
  def('shun','顺手牵羊','锦囊','获得距离1以内其他一名角色区域内的一张牌。'),
  def('juedou','决斗','锦囊','目标先打出杀，双方轮流打出杀；先无法打出的一方受到另一方造成的1点伤害。'),
  def('jiedao','借刀杀人','锦囊','令装备武器的其他角色对其攻击范围内另一名角色出杀，否则将武器交给你。'),
  def('wuzhong','无中生有','锦囊','摸两张牌。'),
  def('wuxie','无懈可击','锦囊','锦囊对一名角色生效前，抵消该效果；无懈本身也可被无懈响应。'),
  def('nanman','南蛮入侵','锦囊','其他角色依次打出一张杀，否则受到1点伤害。'),
  def('wanjian','万箭齐发','锦囊','其他角色依次打出一张闪，否则受到1点伤害。'),
  def('taoyuan','桃园结义','锦囊','所有存活角色依次回复1点体力。'),
  def('wugu','五谷丰登','锦囊','亮出与存活人数相同的牌，各角色从使用者开始依次选取一张。'),
  def('le','乐不思蜀','延时','置入目标判定区；判定不为红桃则跳过其出牌阶段。'),
  def('shandian','闪电','延时','置入自己判定区；黑桃2至9判定造成3点无来源雷电伤害，否则传给下家。'),
  def('liannu','诸葛连弩','装备','攻击范围1；出牌阶段使用杀的次数不受限制。',{slot:'weapon',range:1}),
  def('qinggang','青釭剑','装备','攻击范围2；杀指定目标后，结算时无视其防具。',{slot:'weapon',range:2}),
  def('cixiong','雌雄双股剑','装备','攻击范围2；杀指定异性角色后，可令其弃一张手牌，否则你摸一张牌。',{slot:'weapon',range:2}),
  def('qinglong','青龙偃月刀','装备','攻击范围3；杀被闪抵消后，可对同一目标再使用一张杀。',{slot:'weapon',range:3}),
  def('zhangba','丈八蛇矛','装备','攻击范围3；可将两张手牌当一张杀使用或打出。',{slot:'weapon',range:3}),
  def('guanshi','贯石斧','装备','攻击范围3；杀被闪抵消时，可弃两张牌使此杀仍造成伤害。',{slot:'weapon',range:3}),
  def('fangtian','方天画戟','装备','攻击范围4；使用的杀是最后一张手牌时，可额外指定至多两名目标。',{slot:'weapon',range:4}),
  def('qilin','麒麟弓','装备','攻击范围5；杀造成伤害时，可弃置目标装备区里的一张坐骑。',{slot:'weapon',range:5}),
  def('bagua','八卦阵','装备','需要闪时可判定，红色则视为打出闪。',{slot:'armor'}),
  def('jueying','绝影','装备','其他角色计算与你的距离时加1。',{slot:'plus'}),
  def('dilu','的卢','装备','其他角色计算与你的距离时加1。',{slot:'plus'}),
  def('zhuahuang','爪黄飞电','装备','其他角色计算与你的距离时加1。',{slot:'plus'}),
  def('chitu','赤兔','装备','你计算与其他角色的距离时减1。',{slot:'minus'}),
  def('dayuan','大宛','装备','你计算与其他角色的距离时减1。',{slot:'minus'}),
  def('zixing','紫骍','装备','你计算与其他角色的距离时减1。',{slot:'minus'}),
  def('hanbing','寒冰剑','装备','攻击范围2；杀造成伤害时，可防止此伤害，改为依次弃置目标两张牌。',{slot:'weapon',range:2,ex:true}),
  def('renwang','仁王盾','装备','锁定：黑色杀对你无效。',{slot:'armor',ex:true}),
  def('fire_sha','火杀','基本','按杀使用，造成火焰伤害。',{pack:'army'}),
  def('thunder_sha','雷杀','基本','按杀使用，造成雷电伤害。',{pack:'army'}),
  def('jiu','酒','基本','出牌阶段每回合限一次，令本回合下一张杀的伤害基数加1；自己濒死时可使用以回复1点体力。',{pack:'army'}),
  def('huogong','火攻','锦囊','目标展示一张手牌，你可弃同花色手牌，对其造成1点火焰伤害。',{pack:'army'}),
  def('tiesuo','铁索连环','锦囊','横置或重置至多两名角色；也可重铸摸一张牌。',{pack:'army'}),
  def('bingliang','兵粮寸断','延时','距离1以内放置，判定不为梅花则跳过摸牌阶段。',{pack:'army'}),
  def('guding','古锭刀','装备','攻击范围2；杀对没有手牌的目标造成伤害时，伤害加1。',{slot:'weapon',range:2,pack:'army'}),
  def('zhuque','朱雀羽扇','装备','攻击范围4；使用普通杀时可选择转为火杀。',{slot:'weapon',range:4,pack:'army'}),
  def('tengjia','藤甲','装备','普通杀、南蛮入侵、万箭齐发无效；受到火焰伤害加1。',{slot:'armor',pack:'army'}),
  def('baiyin','白银狮子','装备','受到的伤害至多1点；失去装备区中的此牌后回复1点体力。',{slot:'armor',pack:'army'}),
  def('hualiu','骅骝','装备','其他角色计算与你的距离时加1。',{slot:'plus',pack:'army'}),
  def('muniu','木牛流马','装备','出牌阶段限一次，可将一张手牌扣置于此；可将此装备移给其他角色，储牌随之移动。需手动裁定。',{slot:'treasure',pack:'wood',manual:true}),
];
export const CARD_MAP = Object.fromEntries(CARD_TYPES.map(c => [c.id,c]));
const deck = [];
function add(kind, suit, ranks, ex=false) {
  for (const rank of ranks) deck.push({id:`c${String(deck.length+1).padStart(3,'0')}`,kind,suit,rank,ex,pack:deck.length<108?'standard':'army'});
}
add('sha','S',[7,8,8,9,9,10,10]); add('sha','H',[10,10,11]);
add('sha','C',[2,3,4,5,6,7,8,8,9,9,10,10,11,11]); add('sha','D',[6,7,8,9,10,13]);
add('shan','H',[2,2,13]); add('shan','D',[2,2,3,4,5,6,7,8,9,10,11,11]);
add('tao','H',[3,4,6,7,8,9,12]); add('tao','D',[12]);
add('chai','S',[3,4,12]); add('chai','C',[3,4]); add('chai','H',[12]);
add('shun','S',[3,4,11]); add('shun','D',[3,4]);
add('juedou','S',[1]); add('juedou','C',[1]); add('juedou','D',[1]);
add('jiedao','C',[12,13]); add('wuzhong','H',[7,8,9,11]);
add('wuxie','S',[11]); add('wuxie','C',[12,13]);
add('nanman','S',[7,13]); add('nanman','C',[7]); add('wanjian','H',[1]);
add('taoyuan','H',[1]); add('wugu','H',[3,4]);
add('le','S',[6]); add('le','H',[6]); add('le','C',[6]); add('shandian','S',[1]);
add('liannu','C',[1]); add('liannu','D',[1]); add('qinggang','S',[6]); add('cixiong','S',[2]);
add('qinglong','S',[5]); add('zhangba','S',[12]); add('guanshi','D',[5]);
add('fangtian','D',[12]); add('qilin','H',[5]); add('bagua','S',[2]); add('bagua','C',[2]);
add('jueying','S',[5]); add('dilu','C',[5]); add('zhuahuang','H',[13]);
add('chitu','H',[5]); add('dayuan','S',[13]); add('zixing','D',[13]);
add('hanbing','S',[2],true); add('renwang','C',[2],true); add('shandian','H',[12],true); add('wuxie','D',[12],true);
add('fire_sha','H',[4,7,10]); add('fire_sha','D',[4,5]);
add('thunder_sha','S',[4,5,6,7,8]); add('thunder_sha','C',[5,6,7,8]);
add('shan','H',[8,9,11,12]); add('shan','D',[6,7,8,10,11]);
add('tao','H',[5,6]); add('tao','D',[2,3]); add('jiu','S',[3,9]); add('jiu','C',[3,9]); add('jiu','D',[9]);
add('huogong','H',[2,3]); add('huogong','D',[12]); add('tiesuo','S',[11,12]); add('tiesuo','C',[10,11,12,13]);
add('wuxie','S',[13]); add('wuxie','H',[1,13]); add('bingliang','S',[10]); add('bingliang','C',[4]);
add('guding','S',[1]); add('zhuque','D',[1]); add('tengjia','S',[2]); add('tengjia','C',[2]); add('baiyin','C',[1]); add('hualiu','D',[13]);
add('muniu','D',[5]); deck.at(-1).pack='wood';
export const DECK = Object.freeze(deck.map(Object.freeze));
export const DECK_SETS={standard:'标准',army:'标准 + 军争',wood:'标准 + 军争 + 木牛'};
export const deckFor=(set='army',ex=true)=>DECK.filter(c=>(ex||!c.ex)&&(c.pack==='standard'||c.pack==='army'&&set!=='standard'||c.pack==='wood'&&set==='wood'));
export const CARD_BY_ID = Object.fromEntries(DECK.map(c => [c.id,c]));
export const cardName = id => CARD_MAP[CARD_BY_ID[id]?.kind]?.name || '未知牌';
export const cardLabel = id => { const c=CARD_BY_ID[id]; return c ? `${SUITS[c.suit]}${rankText(c.rank)} ${cardName(id)}` : '未知牌'; };
