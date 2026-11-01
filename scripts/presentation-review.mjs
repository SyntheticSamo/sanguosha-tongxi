// Optional local, read-only authoring viewer. Not shipped in dist or used in play.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makePresentationFixture} from './presentation-fixtures.mjs';
import {CARD_TYPES} from '../dist/data/cards.js';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const viewer=`
import {Tabletop} from '/ui/tabletop.js';
import {CARD_TYPES} from '/data/cards.js';
let state={view:null,isHost:true,pending:null,selection:{ids:[],zone:'hand',owner:null},selectedTargets:[]},fixture,index=0,paused=true,rate=1,time=0,last=performance.now();
const ui=new Tabletop({state:()=>state,act:()=>{},dispatch:()=>{},selectTarget:()=>{},toast:()=>{},practiceLesson:()=>{}});ui.scene.clock={now:()=>time};
document.getElementById('welcome').hidden=true;document.getElementById('game').hidden=false;
const bar=document.createElement('div');bar.className='qa-bar';bar.innerHTML='<select aria-label="复核牌种"></select><button id="qa-play">播放</button><button id="qa-step">下一步结算</button><button id="qa-reset">重播</button><select id="qa-rate" aria-label="慢放速度"><option value="1">正常</option><option value=".5">半速</option><option value=".25">四分之一</option></select><span id="qa-status"></span>';document.body.prepend(bar);
const selector=bar.querySelector('select');for(const c of CARD_TYPES){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;selector.append(o);}
const trace=document.createElement('details');trace.className='qa-trace';trace.innerHTML='<summary>展示依赖时间线 · 只读内核场景</summary><pre></pre>';document.body.append(trace);
document.addEventListener('tongxi:presentation',e=>{const pre=trace.querySelector('pre');pre.textContent=(pre.textContent+'\\n'+e.detail.id+' '+e.detail.stage+' @'+Math.round(time)+'ms').split('\\n').slice(-160).join('\\n');});
const status=()=>{document.getElementById('qa-status').textContent=fixture?fixture.name+' · '+(index+1)+'/'+fixture.steps.length+' · '+fixture.steps[index].intent.type+' · '+(state.view.pending?.kind||'结算完成'):'';document.getElementById('qa-play').textContent=paused?'播放':'暂停';};
function step(){if(!fixture||index>=fixture.steps.length-1)return;state.view=fixture.steps[++index].view;ui.render();status();}
async function reset(){paused=true;fixture=await (await fetch('/fixture?kind='+selector.value)).json();index=0;time=0;ui.reset();state.view=fixture.steps[0].view;state.selection={ids:[],zone:'hand',owner:state.view.you};state.selectedTargets=[];ui.render();trace.querySelector('pre').textContent='';status();}
selector.onchange=reset;document.getElementById('qa-reset').onclick=reset;document.getElementById('qa-step').onclick=()=>{paused=true;step();status();};document.getElementById('qa-rate').onchange=e=>rate=Number(e.target.value);document.getElementById('qa-play').onclick=()=>{paused=!paused;if(!paused&&index===0)step();status();};
let idleSince=0;function tick(now){const elapsed=Math.min(60,now-last);last=now;if(!paused)time+=elapsed*rate;for(const a of document.getAnimations()){a.playbackRate=rate;if(paused)a.pause();else if(a.playState==='paused')a.play();}if(!paused&&fixture&&index<fixture.steps.length-1&&!ui.scene.motion.timeline.jobs.size){idleSince||=now;if(now-idleSince>750){idleSince=0;step();}}else idleSince=0;requestAnimationFrame(tick);}requestAnimationFrame(tick);reset();
`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/fixture'){const kind=url.searchParams.get('kind');if(!CARD_TYPES.some(c=>c.id===kind)){res.writeHead(400).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(makePresentationFixture(kind)));return;}
 if(url.pathname==='/__review.js'){res.setHeader('Content-Type','text/javascript');res.end(viewer);return;}
 if(url.pathname==='/'){let html=await readFile(path.join(root,'index.html'),'utf8');html=html.replace(/<script[^>]+src="\.\/ui\/app\.js"[^>]*><\/script>/,'<script type="module" src="/__review.js"></script>');html=html.replace('</head>','<style>.qa-bar{position:fixed;inset:0 0 auto;height:42px;z-index:999;background:#eee8d5;display:flex;align-items:center;gap:8px;padding:4px 10px;font:12px sans-serif}.qa-bar select,.qa-bar button{min-height:28px}.qa-trace{position:fixed;bottom:5px;left:5px;z-index:999;background:#eee8d5;color:#234839;padding:5px;max-height:30vh;overflow:auto;font:11px monospace}.qa-trace pre{white-space:pre-wrap}body{padding-top:42px}#game-stage{height:calc(100dvh - 42px)!important;min-height:0!important}</style></head>');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root)||target.includes('\0')){res.writeHead(403).end();return;}const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(await readFile(target));
 }catch(e){res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});res.end(e.message);}});
server.listen(Number(process.env.REVIEW_PORT||4174),'127.0.0.1',()=>console.log('Read-only presentation review: http://localhost:'+server.address().port));
