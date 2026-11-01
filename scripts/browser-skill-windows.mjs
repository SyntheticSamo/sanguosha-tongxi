import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {newRoom,reduce,validateState} from '../dist/backend/engine.js';
import {freshRules,pump} from '../dist/backend/rules.js';
import {completePhase,observeCompleteMoves} from '../dist/backend/complete-skills.js';
import {stateOf} from '../dist/backend/skills.js';
import {deckFor} from '../dist/data/cards.js';
import {command} from './browser-controls.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})}),p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));await mkdir('test-results',{recursive:true});
const act=(s,id,type,a={})=>reduce(s,id,{type,rev:s.rev,...a});
function fixture(phase=3,occupied=false){
 let s=newRoom({hostId:'host',token:'h'.repeat(32),size:2,practice:true,selectionMode:'choose',skillAutomation:true,completeSkills:true,tableExperience:true,equipmentAutomation:true,deckSet:'wood'});
 s=act(s,'host','localSeat');for(const [i,g]of ['zhanghe','sunquan'].entries())s=act(s,s.players[i].id,'general',{general:g});s=act(s,'host','start');s.turn='host';s.interactionMode='tactile';s.rules=freshRules();s.flow={paused:true};s.phase=phase;for(const t of s.players){stateOf(t);t.hp=t.maxHp=4;if(t.id!=='host')t.skillState.lost=['*'];}
 if(occupied)give(s,0,'qinggang','equip');give(s,1,occupied?'liannu':'bagua','equip');give(s,0,'sha');
 // Keep the sole Ox available for the later practice-gain check, never in a random opening hand or first draw.
 const ox=deckFor(s.deckSet,s.ex).find(c=>c.kind==='muniu').id;for(const cards of [s.deck,s.discard,s.pool,...s.players.flatMap(p=>[p.hand,p.equip,p.judge])]){const i=cards.indexOf(ox);if(i>=0)cards.splice(i,1);}s.deck.push(ox);
 delete s.skillMoveBaseline;observeCompleteMoves(s);s.rules.queue=[];completePhase(s,s.players[0],phase);s.rules.queue.push({type:'completePhaseBody',owner:'host'});pump(s);return s;
}
function give(s,i,kind,zone='hand'){const id=deckFor(s.deckSet,s.ex).find(c=>c.kind===kind).id;for(const z of [s.deck,s.pool,s.discard,...s.players.flatMap(p=>[p.hand,p.equip,p.judge])]){const n=z.indexOf(id);if(n>=0)z.splice(n,1);}s.players[i][zone].push(id);return id;}
let seq=0;async function load(s){s.rev=10000*(++seq);validateState(s);await command(p,'tools');await p.locator('#import-file').setInputFiles({name:'synthetic-windows.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await p.waitForFunction(n=>document.querySelector('#revision').textContent===`SYNC / ${n}`,s.rev+1);await p.evaluate(()=>scrollTo(0,0));}
const clickChoice=choice=>p.locator(`#response-panel [data-ui=skill-choice][data-choice="${choice}"]`).click();
try{
 await p.goto(process.env.TEST_URL||'http://localhost:4173');await command(p,'practice');await p.locator('#game:not([hidden])').waitFor();
 // Same-slot equipment: no forced movement or repeated phase popup.
 let s=fixture(3,true);await load(s);await p.locator('[data-skill="巧变"].phase-available').click();await p.locator('#hand [data-zone=decision]').first().click();await clickChoice('yes');await p.waitForFunction(()=>document.querySelector('#round-label').textContent.includes('弃牌'));await p.locator('#response-panel').waitFor({state:'hidden'});assert(await p.locator('#response-panel').isHidden());
 // Legal move can be cancelled after payment; no refund or manual correction needed.
 s=fixture();await load(s);await p.locator('[data-skill="巧变"]').click();await p.locator('[data-ui=clear]:visible').click();await p.locator('#response-panel').waitFor({state:'hidden'});assert(await p.locator('#response-panel').isHidden());assert(await p.locator('[data-skill="巧变"].phase-available').count());
 await p.locator('[data-skill="巧变"]').click();await p.locator('#hand [data-zone=decision]').first().click();await clickChoice('yes');await p.getByRole('button',{name:'不移动',exact:true}).click();await p.locator('#response-panel').waitFor({state:'hidden'});assert(await p.locator('#response-panel').isHidden());
 // First draw seals Qiaobian; buttons stay centred and library gains remain usable.
 s=fixture(2);await load(s);await p.locator('[data-pile=deck]').click();await p.waitForFunction(()=>document.querySelector('.draw-remaining')?.textContent.includes('1'));assert.equal(await p.locator('[data-skill="巧变"].phase-available').count(),0);
 await command(p,'practice-gain');await p.locator('#library-search').fill('木牛流马');const gain=p.locator('[data-gain-kind=muniu]');await gain.click();await p.waitForFunction(()=>document.querySelector('[data-gain-kind=muniu]')?.disabled);await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('#library-dialog').open&&document.activeElement?.id==='practice-gain');
 // Repeated keyboard acquisition must refresh availability after the acknowledgement.
 await command(p,'practice-gain');await p.locator('#library-search').fill('杀');let take=p.locator('[data-gain-kind=sha]');await take.focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>!document.querySelector('[data-gain-kind=sha]')?.disabled);await p.keyboard.press('Space');await p.waitForFunction(()=>!document.querySelector('[data-gain-kind=sha]')?.disabled);await p.keyboard.press('Escape');
 for(const [width,height]of [[1440,900],[1280,720],[844,390],[390,844]]){
  await p.setViewportSize({width,height});await load(fixture());await p.locator('[data-skill="巧变"]').focus();await p.keyboard.press('Enter');await p.locator('#response-panel').waitFor({state:'visible'});await p.screenshot({path:`test-results/skill-windows-${width}x${height}.png`});
  const box=await p.locator('[data-ui=clear]:visible').boundingBox(),hand=await p.locator('#hand').boundingBox();assert(box.y+box.height<=hand.y+20,JSON.stringify({box,hand}));await p.keyboard.press('Escape');await p.locator('[data-ui=clear]:visible').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS: Qiaobian occupied-slot/decline/cancel, first draw, real practice gains, repeated keyboard acquisition, private opportunities and four responsive layouts.');
}catch(e){await p.screenshot({path:'test-results/skill-windows-failure.png'});console.error(await p.locator('#toast').textContent().catch(()=>''));throw e;}finally{await browser.close();}
