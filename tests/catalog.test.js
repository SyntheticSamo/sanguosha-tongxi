import test from 'node:test';
import assert from 'node:assert/strict';
import {GENERALS,GENERAL_PACKS,GENERAL_MAP} from '../dist/data/generals.js';
import {newRoom,joinRoom,reduce} from '../dist/backend/engine.js';
test('specified roster is exactly 27 standard + 26 reworked + 48 myth, with no gods',()=>{
 assert.equal(GENERALS.length,101);assert.equal(new Set(GENERALS.map(g=>g.id)).size,101);
 const counts=Object.fromEntries(Object.keys(GENERAL_PACKS).map(pack=>[pack,GENERALS.filter(g=>g.pack===pack).length]));
 assert.deepEqual(counts,{standard:27,jie:26,wind:8,fire:8,forest:8,mountain:8,yin:8,thunder:8});
 for(const g of GENERALS){assert(!g.name.startsWith('神')&&g.faction!=='神');assert(g.baseName&&g.edition&&g.source);assert(g.skills.length>0);assert(g.hp>=3&&g.hp<=8);}
});
test('normal and reworked versions of one person cannot coexist',()=>{
 let s=newRoom({hostId:'h',token:'h'.repeat(32),selectionMode:'choose'});s=joinRoom(s,{token:'g'.repeat(32)}).state;
 s=reduce(s,'h',{type:'general',general:'caocao',rev:s.rev});assert.throws(()=>reduce(s,s.players[1].id,{type:'general',general:'jie_caocao',rev:s.rev}),/同人物/);
});
test('eight-seat random and five-choice drafts do not duplicate a historical person',()=>{
 for(const selectionMode of ['random','five']){
 let s=newRoom({hostId:'h',token:'h'.repeat(32),selectionMode,size:8});for(let i=1;i<8;i++)s=joinRoom(s,{token:String(i).repeat(32)}).state;
 if(selectionMode==='five'){const ids=Object.values(s.choices).flat();assert.equal(ids.length,40);assert.equal(new Set(ids.map(id=>GENERAL_MAP[id].baseName)).size,40);for(const p of s.players)s=reduce(s,p.id,{type:'general',general:s.choices[p.id][0],rev:s.rev});}
 s=reduce(s,'h',{type:'start',rev:s.rev});assert.equal(new Set(s.players.map(p=>GENERAL_MAP[p.general].baseName)).size,8);
 }
});
