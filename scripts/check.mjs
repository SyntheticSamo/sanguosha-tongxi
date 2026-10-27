import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','node_modules','.sites-runtime'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
let count=0;
for(const file of await walk(root))if(/\.(m?js)$/.test(file)){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status){console.error(r.stderr);process.exit(1);}count++;}
const html=await readFile(path.join(root,'dist/index.html'),'utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(ids.length!==new Set(ids).size)throw new Error('Duplicate HTML IDs');
console.log(`Syntax checked ${count} modules; HTML IDs unique.`);
