import {command as sceneCommand,reveal as revealControl,setSeat} from './browser-controls.mjs';
// Optional browser QA. Set PLAYWRIGHT_MODULE to a file URL if Playwright is external.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_URL||'http://localhost:4173';
const dest=path.resolve(process.env.SCREENSHOT_DIR||'test-results');await mkdir(dest,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const errors=[];const contexts=[];
async function page(){const ctx=await browser.newContext({viewport:{width:1440,height:1050}});contexts.push(ctx);const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(base);return p;}
const visible=p=>p.locator('#game:not([hidden])');
const command=sceneCommand;
async function noStun(p){if(!await p.locator('#connect-dialog details').evaluate(d=>d.open))await p.locator('#connect-dialog summary').click();await p.locator('#use-stun').uncheck();}
async function revision(p){return Number((await p.locator('#revision').textContent()).split('/')[1]);}
async function waitRev(p,rev){await p.waitForFunction(r=>Number(document.querySelector('#revision').textContent.split('/')[1])>=r,rev);}
async function connect(host,guest){
 if(!await host.locator('#connect-dialog').evaluate(d=>d.open))await command(host,'connect');
 await noStun(host);await command(host,'offer');await host.waitForFunction(()=>document.querySelector('#offer-output').value.startsWith('TX1'));const invite=await host.locator('#offer-output').inputValue();assert(invite.startsWith('TX1'));
 if(!await guest.locator('#connect-dialog').evaluate(d=>d.open))await command(guest,'connect');
 await noStun(guest);await guest.locator('#offer-input').fill(invite);await command(guest,'answer');
 await guest.waitForFunction(()=>document.querySelector('#answer-output').value.startsWith('TX1'));const answer=await guest.locator('#answer-output').inputValue();assert(answer.startsWith('TX1'));
 await host.locator('#answer-input').fill(answer);await command(host,'accept');await visible(guest).waitFor({timeout:20000});
 await guest.waitForFunction(()=>document.querySelector('#network-badge').textContent.includes('P2P 已连接'));
 await host.locator('#connect-dialog [data-close]').click();await guest.locator('#connect-dialog [data-close]').click();
}
try{
 const host=await page();await host.screenshot({path:path.join(dest,'01-home.png'),fullPage:true});
 await command(host,'create');await host.locator('#create-form [name=name]').fill('主持人');await host.locator('#create-form [name=mode]').selectOption('manual');await host.locator('#create-form button.primary').click();await visible(host).waitFor();
 const guests=[];for(let i=0;i<3;i++){const g=await page();await command(g,'join');await g.locator('#guest-name').fill('好友'+(i+1));await connect(host,g);guests.push(g);console.log(`Connected guest ${i+1}`);}
 await host.waitForFunction(()=>document.querySelectorAll('.seat').length===4);
 await command(host,'start');await host.waitForFunction(()=>document.querySelector('#hand').querySelectorAll('[data-card]').length===4);
 const startRev=await revision(host);for(const g of guests)await waitRev(g,startRev);await Promise.all(guests.map(g=>g.waitForFunction(()=>document.querySelectorAll('#hand [data-card]').length===4)));
 assert.equal(await host.locator('#hand [data-card]').count(),4);
 const hands=await Promise.all([host,...guests].map(p=>p.locator('#hand [data-card]').evaluateAll(bs=>bs.map(b=>b.dataset.card))));assert.equal(new Set(hands.flat()).size,16);
 await host.screenshot({path:path.join(dest,'02-table.png'),fullPage:true});
 await command(guests[0],'draw');await guests[0].waitForFunction(()=>document.querySelectorAll('#hand [data-card]').length===6);let rev=await revision(guests[0]);await waitRev(host,rev);for(const g of guests)await waitRev(g,rev);
 const targetId=await host.locator('.seat').filter({has:host.locator('.seat-name',{hasText:'好友1'})}).getAttribute('data-seat');await host.locator(`[data-target-seat="${targetId}"]`).click();
 const gift=await host.locator('#hand [data-card]').first().getAttribute('data-card');await host.locator(`#hand [data-card="${gift}"]`).click();await command(host,'give');await guests[0].waitForFunction(id=>!!document.querySelector(`#hand [data-card="${id}"]`),gift);assert.equal(await guests[0].locator('#hand [data-card]').count(),7);
 const play=await guests[0].locator('#hand [data-card]').first().getAttribute('data-card');await guests[0].locator(`#hand [data-card="${play}"]`).click();await command(guests[0],'play');await host.waitForFunction(id=>!!document.querySelector(`#pool [data-card="${id}"]`),play);
 await command(host,'clear-pool');await host.waitForFunction(()=>document.querySelector('#pool [data-card]')===null);
 // A peer update cancels an in-flight drag; releasing cannot submit stale state.
 const dragCard=host.locator('#hand [data-card]').first(),dragFrom=await dragCard.boundingBox(),dragTo=await host.locator(`[data-seat="${targetId}"]`).boundingBox(),dragRev=await revision(host),handBeforeDrag=await host.locator('#hand [data-card]').count();
 await host.mouse.move(dragFrom.x+dragFrom.width/2,dragFrom.y+dragFrom.height/2);await host.mouse.down();await host.mouse.move(dragTo.x+dragTo.width/2,dragTo.y+dragTo.height/2,{steps:10});assert(await host.locator('#drag-layer').isVisible());
 await revealControl(guests[1],'#chat-input');await guests[1].locator('#chat-input').fill('拖拽过程中同步验证');await guests[1].locator('#chat-form button').click();await waitRev(host,dragRev+1);assert(await host.locator('#drag-layer').isHidden());await host.mouse.up();await host.waitForTimeout(100);assert.equal(await revision(host),dragRev+1);assert.equal(await host.locator('#hand [data-card]').count(),handBeforeDrag);
 await guests[1].locator('#chat-input').fill('<img src=x onerror=alert(1)>');await guests[1].locator('#chat-form button').click();await host.waitForFunction(()=>document.querySelector('#logs').textContent.includes('<img src=x'));assert.equal(await host.locator('#logs img').count(),0);assert.match(await guests[1].locator('#chat-history').textContent(),/拖拽过程中同步验证/);assert.equal(await guests[1].locator('#chat-history img').count(),0);
 // Large multi-fragment state after a full deck turnover.
 await revealControl(host,'#draw-count');if(!await host.locator('#manual-controls').evaluate(d=>d.open))await host.locator('#manual-controls summary').click();await host.locator('#draw-count').fill('8');await command(host,'reveal');await guests[2].waitForFunction(()=>document.querySelectorAll('#pool [data-card]').length===8);
 // Actual host refresh, IndexedDB restore and token-based guest seat recovery.
 const oldCards=await guests[0].locator('#hand [data-card]').evaluateAll(bs=>bs.map(b=>b.dataset.card));
 await host.reload();await command(host,'restore');await visible(host).waitFor();
 await connect(host,guests[0]);await guests[0].waitForFunction(n=>document.querySelectorAll('#hand [data-card]').length===n,oldCards.length);
 assert.deepEqual(await guests[0].locator('#hand [data-card]').evaluateAll(bs=>bs.map(b=>b.dataset.card)),oldCards);
 // Host undo keeps revision monotonic, and host-only export stays local.
 const beforeUndo=await revision(host);await command(host,'draw');await waitRev(host,beforeUndo+1);await command(host,'tools');await command(host,'undo');await waitRev(host,beforeUndo+2);await host.locator('#tools-dialog [data-close]').click();
 // Mobile layout and complete library inventory.
 const mobile=await page();await mobile.setViewportSize({width:390,height:844});await mobile.screenshot({path:path.join(dest,'03-mobile-home.png'),fullPage:true});await command(mobile,'practice');await visible(mobile).waitFor();
 await mobile.waitForFunction(()=>document.querySelectorAll('#hand [data-card]').length===4);
 assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));assert.equal(await mobile.locator('#target, #target2').count(),0);await mobile.locator('[data-target-seat]').nth(1).click();assert.equal(await mobile.locator('[data-target-seat][aria-pressed=true]').count(),1);await mobile.screenshot({path:path.join(dest,'04-mobile-table.png'),fullPage:true});
 await command(mobile,'library');assert.equal(await mobile.locator('.library-entry').count(),101);await mobile.locator('[data-library=cards]').click();assert.equal(await mobile.locator('.library-entry').count(),44);
 assert.deepEqual(errors,[]);console.log('PASS: four-browser WebRTC, free-table controls, recovery, undo, mobile layout and 101/44 catalog entries.');
}catch(error){console.error("Page errors:",errors);
 for(const ctx of contexts)for(const p of ctx.pages())console.error(await p.evaluate(()=>({status:document.querySelector('#connection-status')?.textContent,badge:document.querySelector('#network-badge')?.textContent,toast:document.querySelector('#toast')?.textContent})).catch(()=>({closed:true})));
 throw error;
}finally{await browser.close();}
