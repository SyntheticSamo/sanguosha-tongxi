import {CARD_TYPES} from '../dist/data/cards.js';
import {CARD_STORYBOARDS} from '../dist/data/card-storyboards.js';
import {makePresentationFixture} from './presentation-fixtures.mjs';
const failures=[];for(const card of CARD_TYPES){try{const f=makePresentationFixture(card.id);if(!f.steps.length||!CARD_STORYBOARDS[card.id])throw new Error('缺少脚本或真实场景');console.log(`${card.name}: ${f.steps.length} authority snapshots`);}catch(e){failures.push({kind:card.id,error:e.message});}}
console.log(`${CARD_TYPES.length-failures.length}/${CARD_TYPES.length} card scenarios generated.`);if(failures.length){console.error(failures);process.exitCode=1;}
