// Optional end-to-end automatic rules QA; uses only temporary browser contexts.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {newRoom,joinRoom,reduce,validateState} from '../dist/backend/engine.js';
import {DECK} from '../dist/data/cards.js';
import {GENERAL_MAP} from '../dist/data/generals.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://localhost:4173',dest=path.resolve(process.env.SCREENSHOT_DIR||'test-results');await mkdir(dest,{recursive:true});
const errors=[],contexts=[];
async function page(){const c=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(c);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(base);return p;}
const cmd=async(p,name)=>{if(!await p.locator(`[data-do="${name}"]:visible`).count())await p.locator(`[data-do="${name}"]`).evaluateAll(bs=>{for(const b of bs){if(b.closest('[hidden]')||b.closest('dialog:not([open])'))continue;let d=b.parentElement;while(d){if(d.tagName==='DETAILS')d.open=true;d=d.parentElement;}}});await p.locator(`[data-do="${name}"]:visible`).first().click();};
const rev=async p=>Number((await p.locator('#revision').textContent()).split('/')[1]);
const waitRev=(p,n)=>p.waitForFunction(n=>Number(document.querySelector('#revision').textContent.split('/')[1])>=n,n);
async function connect(h,g){
 for(const p of [h,g]){if(!await p.locator('#connect-dialog').evaluate(d=>d.open))await cmd(p,'connect');if(!await p.locator('#connect-dialog details').evaluate(d=>d.open))await p.locator('#connect-dialog summary').click();await p.locator('#use-stun').uncheck();}
 await cmd(h,'offer');await h.waitForFunction(()=>document.querySelector('#offer-output').value.startsWith('TX1'));await g.locator('#offer-input').fill(await h.locator('#offer-output').inputValue());await cmd(g,'answer');await g.waitForFunction(()=>document.querySelector('#answer-output').value.startsWith('TX1'));await h.locator('#answer-input').fill(await g.locator('#answer-output').inputValue());await cmd(h,'accept');await g.waitForFunction(()=>document.querySelector('#network-badge').textContent.includes('P2P 已连接'));
 for(const p of [h,g])await p.locator('#connect-dialog [data-close]').click();
}
const byKind=(kind,n=0)=>DECK.filter(c=>c.kind===kind)[n].id;
async function select(p,id){await p.locator(`#hand [data-card="${id}"]`).click();}
async function play(p,id,target){await p.locator('#target').selectOption(target);await select(p,id);const n=await rev(p);await cmd(p,'play');await waitRev(p,n+1);}
try{
 const host=await page(),guest=await page();await cmd(host,'create');await host.locator('[name=size]').selectOption('2');await host.locator('[name=selectionMode]').selectOption('five');await host.locator('#create-form button.primary').click();await host.locator('#game:not([hidden])').waitFor();await connect(host,guest);
 const candidateLists=[];
 for(const p of [host,guest]){await cmd(p,'library');const ids=await p.locator('[data-general]').evaluateAll(bs=>bs.map(b=>b.dataset.general));assert.equal(ids.length,5);candidateLists.push(ids);await p.locator('[data-general]').first().click();}
 assert.equal(new Set(candidateLists.flat().map(id=>GENERAL_MAP[id].baseName)).size,10);
 await host.waitForFunction(()=>document.querySelectorAll('.seat-general').length===2&&[...document.querySelectorAll('.seat-general')].every(e=>e.textContent!=='待选将'));
 await cmd(host,'start');await guest.waitForFunction(()=>document.querySelectorAll('#hand [data-card]').length===4);
 // Build a deterministic, conserved fixture through the supported host import API.
 const entry=await guest.evaluate(()=>Object.entries(sessionStorage).find(([k])=>k.startsWith('tongxi-seat:'))),roomId=entry[0].slice('tongxi-seat:'.length);
 let s=newRoom({hostId:'host',token:'h'.repeat(32),size:2,roomId,mode:'auto',selectionMode:'random'});s=joinRoom(s,{token:entry[1],name:'响应者'}).state;s=reduce(s,'host',{type:'start',rev:s.rev});s.players.forEach(p=>{s.deck.push(...p.hand);p.hand=[];p.hp=4;p.maxHp=4;});
 s.players[0].general='caocao';s.players[0].role='lord';s.players[0].roleOpen=true;s.players[0].hp=3;s.players[1].general='guanyu';s.players[1].role='spy';s.players[1].roleOpen=false;
 const move=(id,p,zone='hand')=>{s.deck.splice(s.deck.indexOf(id),1);p[zone].push(id);};
 const sha1=byKind('sha'),sha2=byKind('sha',1),wine=byKind('jiu'),peach=byKind('tao'),dodge=byKind('shan'),extra=byKind('sha',3),reply=byKind('tao',1);
 for(const id of [sha1,sha2,wine,peach,extra])move(id,s.players[0]);move(byKind('liannu'),s.players[0],'equip');for(const id of [dodge,reply])move(id,s.players[1]);s.turn='host';s.phase=3;s.rev=200;validateState(s);
 await cmd(host,'tools');await host.locator('#import-file').setInputFiles({name:'rules-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await waitRev(host,201);await connect(host,guest);await waitRev(guest,201);
 const foe=s.players[1].id;
 await play(host,sha1,foe);await guest.locator('#response-panel [data-do=respond]').waitFor();await guest.screenshot({path:path.join(dest,'05-auto-response.png'),fullPage:true});
 await select(guest,dodge);await cmd(guest,'respond');await host.waitForFunction(()=>document.querySelector('#response-panel').hidden);assert((await host.locator(`[data-seat="${foe}"] .seat-hp`).textContent()).includes('4/4'));
 await play(host,wine,'host');assert((await host.locator('#range-info').textContent()).includes('酒 +1'));await play(host,sha2,foe);
 await host.reload();await cmd(host,'restore');await host.locator('#response-panel').waitFor();await connect(host,guest);await guest.locator('#response-panel [data-do=pass]').waitFor();await cmd(guest,'pass');await host.waitForFunction(id=>document.querySelector(`[data-seat="${id}"] .seat-hp`).textContent.includes('2/4'),foe);
 await play(host,peach,'host');assert((await host.locator('[data-seat=host] .seat-hp').textContent()).includes('4/4'));
 await host.locator('#target').selectOption(foe);await cmd(host,'pindian');await select(host,extra);await cmd(host,'respond');await guest.waitForFunction(()=>document.querySelector('#logs').textContent.includes('已选择拼点牌'));assert.equal(await guest.locator(`#pool [data-card="${extra}"]`).count(),0);await select(guest,reply);await cmd(guest,'respond');await host.waitForFunction(()=>document.querySelector('#last-result').textContent.includes('拼点'));
 await cmd(host,'judge');await host.locator('#response-panel [data-do=pass]').waitFor();await cmd(host,'pass');await host.waitForFunction(()=>document.querySelector('#last-result').textContent.includes('判定'));
 await host.locator('#target').selectOption(foe);await cmd(host,'tools');await host.locator('#correction-controls summary').click();await host.locator('#correction-op').selectOption('hp');await host.locator('#correction-value').fill('3');await host.locator('#correction-reason').fill('测试手动纠正');let n=await rev(host);await cmd(host,'correct');await waitRev(host,n+1);await guest.waitForFunction(id=>document.querySelector(`[data-seat="${id}"] .seat-hp`).textContent.includes('3/4'),foe);await cmd(host,'undo');await guest.waitForFunction(id=>document.querySelector(`[data-seat="${id}"] .seat-hp`).textContent.includes('2/4'),foe);await host.locator('#tools-dialog [data-close]').click();
 await host.screenshot({path:path.join(dest,'06-auto-table.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: five private choices per player, auto slash/dodge/wine/peach, pending-response refresh and reconnect, hidden pindian, judgment, host correction and undo.');
}catch(error){for(const c of contexts)for(const p of c.pages())console.error(await p.evaluate(()=>({toast:document.querySelector('#toast')?.textContent,status:document.querySelector('#connection-status')?.textContent})).catch(()=>({closed:true})));throw error;}finally{await browser.close();}
