import {command as sceneCommand,reveal as revealControl,setSeat} from './browser-controls.mjs';
// Optional UI regression: temporary Chromium profiles, supported import API,
// real mouse/touch input; no player data or product debugging endpoints.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {newRoom,reduce,validateState} from '../dist/backend/engine.js';
import {deckFor} from '../dist/data/cards.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const dest=path.resolve(process.env.SCREENSHOT_DIR||'test-results');await mkdir(dest,{recursive:true});
const errors=[],context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
const base=process.env.TEST_URL||'http://localhost:4173';
const rev=async()=>Number((await p.locator('#revision').textContent()).split('/')[1]);
const waitRev=n=>p.waitForFunction(n=>Number(document.querySelector('#revision').textContent.split('/')[1])>=n,n);
const act=(s,id,type,data={})=>reduce(s,id,{type,rev:s.rev,...data});
const cmd=name=>sceneCommand(p,name);
function fixture(n=4){
  let s=newRoom({hostId:'host',token:'h'.repeat(32),size:n,practice:true,selectionMode:'choose'});
  while(s.players.length<n)s=act(s,'host','localSeat');
  const gs=['guanyu','caocao','huangyueying','zhaoyun','lvbu','simayi','sunquan','zhugeliang'];
  for(let i=0;i<n;i++)s=act(s,s.players[i].id,'general',{general:gs[i]});s=act(s,'host','start');s.turn='host';s.phase=3;s.rev=200;
  for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.hp=p.maxHp=4;}
  const move=(kind,owner=0,nth=0,zone='hand')=>{const id=deckFor(s.deckSet,s.ex).filter(c=>c.kind===kind)[nth].id;for(const z of [s.deck,...s.players.flatMap(p=>[p.hand,p.equip,p.judge])]){const at=z.indexOf(id);if(at>=0)z.splice(at,1);}s.players[owner][zone].push(id);return id;};
  const ids={sha:move('sha'),sha2:move('sha',0,1),tao:move('tao'),red:move('wuzhong'),chain:move('tiesuo'),wine:move('jiu'),borrow:move('jiedao'),armor:move('bagua'),dodge:move('shan',1)};
  move('liannu',0,0,'equip');move('qilin',1,0,'equip');if(n>2)move('jueying',2,0,'equip');s.players[0].hp=3;validateState(s);return {s,ids};
}
async function load(s){if(!await p.locator('#tools-dialog').evaluate(e=>e.open))await cmd('tools');await p.locator('#import-file').setInputFiles({name:'ux-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await p.waitForFunction(({rev,room})=>Number(document.querySelector('#revision').textContent.split('/')[1])===rev&&document.querySelector('.room-code').textContent===room,{rev:s.rev+1,room:s.roomId.slice(0,8).toUpperCase()});}
async function select(id){await p.locator(`#hand [data-card="${id}"]`).click();}
async function control(id){await setSeat(p,id);}
async function drag(id,locator,{cancel=false}={}){
  const card=p.locator(`#hand [data-card="${id}"]`);await card.scrollIntoViewIfNeeded();const a=await card.boundingBox(),b=await locator.boundingBox();assert(a&&b);await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:14});if(cancel)await p.keyboard.press('Escape');await p.mouse.up();
}
async function settleCounters(s){
  for(let step=0;step<20&&await p.locator('#response-panel').isVisible();step++){
    let advanced=false;for(const player of s.players){await control(player.id);const pass=p.locator('#response-panel [data-do=pass]');if(await pass.isVisible()&&await pass.isEnabled()){const r=await rev();await pass.click();await waitRev(r+1);advanced=true;if(!await p.locator('#response-panel').isVisible())break;}}
    if(!advanced)break;
  }await control('host');
}
try{
  await p.goto(base);assert.equal(await p.locator('dialog[open]').count(),0);await cmd('tutorial');await p.locator('#tutorial-dialog [data-close]').first().click();assert.equal(await p.locator('#game').isVisible(),false);
  await cmd('practice');await p.locator('#game:not([hidden])').waitFor();assert.equal(await p.locator('.seat').count(),4);assert.equal(await p.locator('#tutorial-coach').isVisible(),false);
  let {s,ids}=fixture();await load(s);const foe=s.players[1].id,far=s.players[2].id;
  await select(ids.sha);assert(await p.locator(`[data-seat="${far}"]`).getAttribute('class').then(x=>x.includes('invalid-target')));assert.match(await p.locator(`[data-seat="${far}"] .target-reason`).textContent(),/攻击范围/);
  let r=await rev();await drag(ids.sha,p.locator('#use-zone'));assert.equal(await rev(),r);await drag(ids.sha,p.locator(`[data-seat="${foe}"]`),{cancel:true});assert.equal(await rev(),r);
  // Dropping onto an already selected target still submits exactly once.
  await p.locator(`[data-target-seat="${foe}"]`).click();await drag(ids.sha,p.locator(`[data-seat="${foe}"]`));await waitRev(r+1);assert.match(await p.locator('#response-panel').textContent(),/使用杀/);
  await control(foe);await select(ids.dodge);await cmd('respond');await p.locator('#response-panel').waitFor({state:'hidden'});await control('host');
  await p.locator(`[data-target-seat="${foe}"]`).click();await select(ids.tao);assert.equal(await p.locator('[data-target-seat][aria-pressed=true]').count(),0);r=await rev();await cmd('play');await waitRev(r+1);assert.match(await p.locator('[data-seat=host] .seat-hp').textContent(),/4\/4/);
  await p.locator('[data-skill="武圣"]').click();assert.match(await p.locator('#skill-title').textContent(),/主动操作/);await p.locator('#skill-options [data-kind=sha]').click();await select(ids.red);assert(await p.locator('[data-do=play]').isDisabled());
  r=await rev();await drag(ids.red,p.locator(`[data-seat="${foe}"]`));await waitRev(r+1);await control(foe);r=await rev();await cmd('pass');await waitRev(r+1);assert.match(await p.locator(`[data-seat="${foe}"] .seat-hp`).textContent(),/3\/4/);assert(await p.locator('.hp-float').count()>0);
  await control('host');if(await p.locator('[data-ui=conversion-clear]').isVisible())await p.locator('[data-ui=conversion-clear]').click();await select(ids.chain);r=await rev();await drag(ids.chain,p.locator(`[data-seat="${foe}"]`));assert.equal(await rev(),r);assert.equal(await p.locator(`[data-seat="${foe}"] .target-index`).textContent(),'1');await p.locator('[data-target-seat=host]').click();assert.equal(await p.locator('[data-seat=host] .target-index').textContent(),'2');await cmd('play');await waitRev(r+1);await settleCounters(s);assert.match(await p.locator('[data-seat=host] .seat-hp').textContent(),/⛓/);
  console.log('PASS: mouse drag, invalid drops, Escape, selected target, response, self cards, conversion, HP events, ordered targets.');
  // Counter decisions never depend on a hand-detected timeout.
  ({s,ids}=fixture());s=act(s,'host','use',{cards:[ids.red],target:'host'});await load(s);r=await rev();await p.waitForTimeout(3200);assert.equal(await rev(),r);assert.equal(await p.locator('#auto-counter,#counter-countdown').count(),0);assert.equal(await p.locator('[data-do=respond]').textContent(),'出');assert.equal(await p.locator('[data-do=pass]').textContent(),'不出');await cmd('pass');await waitRev(r+1);
  console.log('PASS: legacy counter uses explicit play/pass without a timer.');
  // Sorting is local, and does not send game actions.
  ({s,ids}=fixture());await load(s);r=await rev();await revealControl(p,'#hand-sort');await p.locator('#hand-sort').selectOption('rank');await p.locator('#hand-context [data-close]').click();await select(ids.sha);await p.keyboard.press('Alt+ArrowRight');assert.equal(await rev(),r);await revealControl(p,'[data-ui=card-detail]');await p.locator('[data-ui=card-detail]').click();assert.match(await p.locator('#detail-card').textContent(),/出牌阶段/);await p.locator('#card-dialog [data-close]').click();
  // Draw only once, and never replays on same-revision refresh/sort.
  ({s,ids}=fixture());s.phase=1;await load(s);const count=await p.locator('#hand [data-card]').count();r=await rev();await cmd('phase');await waitRev(r+1);assert.equal(await p.locator('#hand [data-card]').count(),count+2);assert.equal(await p.locator('#hand .new-label').count(),2);await revealControl(p,'#hand-sort');await p.locator('#hand-sort').selectOption('type');await p.locator('#hand-context [data-close]').click();assert.equal(await p.locator('#hand .new-card').count(),0);await p.waitForFunction(()=>document.querySelectorAll('#hand .new-label').length===0);await cmd('tools');await cmd('tutorial');await p.locator('#tutorial-dialog [data-ui=tutorial-start]').click();await p.locator('#tutorial-coach:not([hidden])').waitFor();await p.locator('[data-ui=tutorial-close]').click();assert.equal(await p.locator('#tutorial-coach').isVisible(),false);
  for(const n of [2,4,8]){
    ({s,ids}=fixture(n));await load(s);await p.locator('#toast').waitFor({state:'hidden'});for(const size of [{width:1440,height:1000},{width:390,height:844}]){
      await p.setViewportSize(size);await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(dest,`ux-${n}-${size.width}.png`)});
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const cells=await p.locator('.hp-cell').count();assert.equal(cells,n*4);
      const overlaps=await p.locator('.seat').evaluateAll(seats=>{const out=[];for(let i=0;i<seats.length;i++)for(let j=i+1;j<seats.length;j++){const a=seats[i].getBoundingClientRect(),b=seats[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)out.push([i,j]);}return out;});assert.deepEqual(overlaps,[],`${n} seats at ${size.width}px overlap`);
      if(size.width===390){const hand=await p.locator('#hand-panel').boundingBox();assert(hand.y>=0&&hand.y+hand.height<=845);assert(await p.locator('#record-panel').isHidden());}
    }
  }
  // Real Chromium touch events. A vertical swipe selects/drags; horizontal scroll cancels drag.
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base);await mobile.locator('[data-do=practice]').click();await mobile.locator('#game:not([hidden])').waitFor();await mobile.locator('[data-do=tools]').click();({s,ids}=fixture(2));await mobile.locator('#import-file').setInputFiles({name:'touch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await mobile.waitForFunction(()=>Number(document.querySelector('#revision').textContent.split('/')[1])===201);
  const c=await mobile.locator(`#hand [data-card="${ids.sha}"]`).boundingBox(),t=await mobile.locator(`[data-seat="${s.players[1].id}"]`).boundingBox(),cdp=await mobileContext.newCDPSession(mobile);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:c.x+c.width/2,y:c.y+c.height/2}]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:c.x+c.width/2+(t.x+t.width/2-c.x-c.width/2)*i/12,y:c.y+c.height/2+(t.y+t.height/2-c.y-c.height/2)*i/12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForFunction(()=>Number(document.querySelector('#revision').textContent.split('/')[1])===202);await mobile.locator('#toast').waitFor({state:'hidden'});await mobile.screenshot({path:path.join(dest,'ux-touch-response.png')});// Reload the conserved fixture through the same public import flow.
  await mobile.locator('[data-do=tools]').click();await mobile.locator('#import-file').setInputFiles({name:'touch-scroll.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await mobile.waitForFunction(()=>Number(document.querySelector('#revision').textContent.split('/')[1])===201);
  const scrollStart=await mobile.locator('#hand').evaluate(e=>e.scrollLeft),scrollCard=await mobile.locator('#hand [data-card]').nth(2).boundingBox(),tx=scrollCard.x+scrollCard.width/2,ty=scrollCard.y+scrollCard.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx-i*8,y:ty+2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(await mobile.locator('#drag-layer').isHidden());assert.equal(await mobile.locator('#revision').textContent(),'SYNC / 201');assert(await mobile.locator('#hand').evaluate(e=>e.scrollLeft)>=scrollStart);
  const hold=await mobile.locator('#hand [data-card]').nth(3).boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:hold.x+hold.width/2,y:hold.y+hold.height/2}]});await mobile.locator('#card-dialog[open]').waitFor();await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await mobile.locator('#revision').textContent(),'SYNC / 201');await mobile.locator('#card-dialog [data-close]').click();await mobileContext.close();
  assert.deepEqual(errors,[]);console.log('PASS: optional lesson, local sorting, draw-once feedback, 2/4/8-seat desktop and 390px layouts, real Chromium touch drag.');
}catch(error){console.error('Page errors:',errors);console.error(await p.evaluate(()=>({toast:document.querySelector('#toast').textContent,selection:document.querySelector('#selection-label').textContent,room:document.querySelector('#room-title').textContent})));await p.screenshot({path:path.join(dest,'ux-failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
