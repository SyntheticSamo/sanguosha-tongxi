// One side of a manual invite exchange inside the NAT lab. DELAY = seconds the host
// holds the guest's reply before pasting it (simulates relaying it through a chat app).
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const role=process.argv[2],D=Number(process.env.DELAY||0)*1000,X=(process.env.LAB_DIR||'/tmp/tongxi-nat-lab')+'/',WAIT=Number(process.env.WAIT||40)*1000;mkdirSync(X,{recursive:true});
const stun=role==='host'?'10.0.1.1':'10.0.2.1',t0=Date.now(),log=(...a)=>console.log(`[${role} ${((Date.now()-t0)/1000).toFixed(1)}s]`,...a),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,ms=120000)=>{const end=Date.now()+ms;while(Date.now()<end){const v=await f();if(v)return v;await sleep(200);}throw new Error('timeout');};
const browser=await chromium.launch(),c=await browser.newContext();
await c.addInitScript(()=>{window.__ice=[];const O=window.RTCPeerConnection;window.RTCPeerConnection=function(...a){const pc=new O(...a),t=performance.now();pc.addEventListener('iceconnectionstatechange',()=>window.__ice.push(`${((performance.now()-t)/1000).toFixed(1)} ${pc.iceConnectionState}`));return pc;};window.RTCPeerConnection.prototype=O.prototype;});
const p=await c.newPage();await p.goto('http://127.0.0.1:4173/');
const net=async()=>{await p.locator('#connect-dialog .network-options summary').click();await p.locator('#use-stun').uncheck();await p.locator('#ice-config').fill(JSON.stringify([{urls:`stun:${stun}:3478`}]));};
if(role==='host'){
 await p.locator('#welcome [data-do=create]').click();await p.locator('#create-form [name=size]').fill('2');await p.locator('#create-form button.primary').click();await p.waitForSelector('#game:not([hidden])');
 await p.locator('.stage-header [data-do=connect]').click();await p.locator('[data-ui=connect-host]').click();await net();
 const s=Date.now();await p.locator('[data-do=offer]').click();writeFileSync(X+'offer.txt',await until(()=>p.locator('#offer-output').inputValue(),60000));log('invite ready in',((Date.now()-s)/1000).toFixed(1),'s');
 const ans=await until(()=>existsSync(X+'answer.json')&&JSON.parse(readFileSync(X+'answer.json')),300000);const wait=ans.at+D-Date.now();if(wait>0){log('holding reply',Math.round(wait/1000),'s');await sleep(wait);}
 await p.locator('#answer-input').fill(ans.code);log('reply pasted');
}else{
 await p.locator('nav [data-do=connect]').click();await p.locator('[data-ui=connect-guest]').click();await net();
 await p.locator('#offer-input').fill(await until(()=>existsSync(X+'offer.txt')&&readFileSync(X+'offer.txt','utf8'),300000));await p.locator('[data-do=answer]').click();
 writeFileSync(X+'answer.json',JSON.stringify({code:await until(()=>p.locator('#answer-output').inputValue(),60000),at:Date.now()}));log('reply ready');
}
let ok=false;const end=Date.now()+WAIT+(role==='guest'?D:0);while(Date.now()<end){if(/已连接/.test(await p.locator('#peer-status-list').textContent())){ok=true;break;}await sleep(500);}
log(ok?'CONNECTED':'NOT CONNECTED','|',(await p.locator('#peer-status-list').textContent()).replace(/\n/g,' / '),'| ice:',(await p.evaluate(()=>window.__ice)).join(', '));await browser.close();process.exitCode=ok?0:1;
