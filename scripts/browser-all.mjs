// Optional local QA runner; Playwright is only needed for these authoring checks.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const suites=['smoke','rules','ux','skills','skill-sync','scene','complete-skills','complete-sync','tactile','experience','skill-windows','round-six','round-seven','round-eight','connect-ux'];
const directory=new URL('../test-results/',import.meta.url);
await mkdir(directory,{recursive:true});
const reportFile=new URL('v8-3-browser-summary.json',directory),retry=process.argv.includes('--retry-failed');
const previous=retry?JSON.parse(await readFile(reportFile,'utf8')):null;
const retained=retry?(previous.suites||[]).filter(r=>suites.includes(r.name)&&r.passed===true):[];
const results=[...retained],queue=suites.filter(name=>!retained.some(r=>r.name===name));
async function run(name){
 const start=Date.now(),file=fileURLToPath(new URL(`browser-${name}.mjs`,import.meta.url));
 const result=await new Promise(resolve=>{
  const child=spawn(process.execPath,[file],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
  child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
  child.on('error',error=>resolve({code:1,output:output+error.message}));child.on('close',code=>resolve({code:code??1,output}));
 });
 await writeFile(new URL(`v8-3-final-${name}.txt`,directory),result.output,'utf8');
 results.push({name,passed:result.code===0,exitCode:result.code,durationMs:Date.now()-start});
 console.log(`${result.code===0?'PASS':'FAIL'} ${name}`);if(result.code)console.error(result.output.slice(-2500));
}
let next=0;
await Promise.all(Array.from({length:3},async()=>{while(next<queue.length){const name=queue[next++];await run(name);}}));
const report={...(retry?{retryOf:previous.finishedAt,previousFailures:(previous.suites||[]).filter(r=>!r.passed).map(r=>r.name)}:{}),finishedAt:new Date().toISOString(),suites:results.sort((a,b)=>suites.indexOf(a.name)-suites.indexOf(b.name))};
await writeFile(reportFile,JSON.stringify(report,null,2)+'\n','utf8');
const passed=results.filter(r=>r.passed).length;console.log(`${passed}/${suites.length} browser suites passed.`);if(passed!==suites.length)process.exitCode=1;
