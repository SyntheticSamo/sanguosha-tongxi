// Optional: real WebRTC through the automatic-pairing Worker. Needs a running relay, e.g.
//   cd cloudflare && npx wrangler dev --port 8787 --var ALLOWED_ORIGINS:
//   RELAY_URL=http://127.0.0.1:8787 node scripts/browser-relay.mjs
// Not part of browser-all.mjs because it depends on that external process.
import assert from 'node:assert/strict';
const RELAY=process.env.RELAY_URL,BASE=process.env.TEST_URL||'http://localhost:4173/';
if(!RELAY){console.log('SKIP: set RELAY_URL to a running signaling Worker');process.exit(0);}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})}),errors=[];
const seated=p=>p.waitForFunction(()=>/已入席/.test(document.getElementById('connection-status').textContent),null,{timeout:30000});
async function page(name){const c=await browser.newContext({viewport:{width:1280,height:800}});await c.addInitScript(r=>{localStorage.setItem('tongxi:relay-url',r);localStorage.setItem('tongxi:motion','reduce');},RELAY);const p=await c.newPage();p.on('pageerror',e=>errors.push(name+': '+e.message));return p;}
try{
 const host=await page('host');await host.goto(BASE);
 await host.locator('#welcome [data-do=create]').click();await host.locator('#create-form [name=size]').fill('3');await host.locator('#create-form button.primary').click();await host.waitForSelector('#game:not([hidden])');
 await host.locator('.stage-header [data-do=connect]').click();await host.locator('[data-ui=connect-host]').click();
 await host.waitForFunction(()=>document.getElementById('room-link').value.includes('#room='));const link=await host.locator('#room-link').inputValue();
 assert(!/key|token|sdp/i.test(new URL(link).hash),'room link carries only the room id and relay');
 const guests=[];
 for(const name of ['好友乙','好友丙']){const g=await page(name);await g.goto(link);await g.waitForSelector('#room-join:not([hidden])');assert.equal(new URL(g.url()).hash,'','room fragment removed after opening');await g.locator('#guest-name').fill(name);await g.locator('[data-do=join-room]').click();await seated(g);guests.push(g);}
 await host.waitForFunction(()=>(document.getElementById('peer-status-list').textContent.match(/已连接/g)||[]).length===2);
 // A guest reload rejoins the same seat with one click (same-tab seat credential).
 const g=guests[0],seat=await g.evaluate(()=>{document.getElementById('connection-enter').click();return document.querySelector('.seat.mine')?.dataset.seat;});
 await g.reload();await g.locator('nav [data-do=connect]').click();await g.locator('#room-join:not([hidden]) [data-do=join-room]').click();await seated(g);
 await g.locator('#connection-enter').click();assert.equal(await g.evaluate(()=>document.querySelector('.seat.mine')?.dataset.seat),seat);
 // Host refresh + restore: the same room link reconnects waiting guests automatically.
 await host.reload();await host.locator('#welcome [data-do=restore]').click();await host.waitForSelector('#game:not([hidden])');
 await host.waitForFunction(()=>(document.getElementById('peer-status-list').textContent.match(/已连接/g)||[]).length===2,null,{timeout:40000});
 // A guest cannot claim the host role of a room it only has the link for.
 const room=new URLSearchParams(new URL(link).hash.slice(1)).get('room'),probe=await page('probe');await probe.goto(BASE);
 const code=await probe.evaluate(({r,room})=>new Promise(res=>{const u=new URL(r+`/v1/room/${room}/ws`);u.protocol=u.protocol==='https:'?'wss:':'ws:';u.searchParams.set('role','host');u.searchParams.set('peer','impostor1');const ws=new WebSocket(u);ws.onopen=()=>ws.send(JSON.stringify({t:'auth',key:'x'.repeat(43)}));ws.onclose=e=>res(e.code);}),{r:RELAY,room});
 assert.equal(code,4003);
 assert.deepEqual(errors,[]);console.log('Relay pairing, reload rejoin, host restore and host-claim rejection passed.');
}finally{await browser.close();}
