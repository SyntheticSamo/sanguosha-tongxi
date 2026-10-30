import {CARD_TYPES} from './cards.js';
// Semantic presentation paths, not copies of card rules or card instances.
const families={sha:'slash',fire_sha:'fire',thunder_sha:'thunder',shan:'shield',tao:'heal',jiu:'wine',chai:'dismantle',shun:'steal',juedou:'duel',jiedao:'borrow',wuzhong:'draw',wuxie:'counter',nanman:'ripple',wanjian:'arrows',taoyuan:'heal',wugu:'market',le:'delay',bingliang:'delay',shandian:'thunder-delay',huogong:'fire',tiesuo:'chain',muniu:'wood'};
export const CARD_PRESENTATION=Object.fromEntries(CARD_TYPES.map(c=>[c.id,{family:families[c.id]||'equipment',anchor:c.slot?'equipment':c.type==='延时'?'judge':'effect',contexts:['use','response','judge','pindian','public','private']} ]));
