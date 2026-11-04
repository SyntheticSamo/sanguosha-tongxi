import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSignal,normalizeRelay,parseRoomLink,roomLink,roomFromKey,randomKey} from '../dist/sync/relay.js';
import {gathered,rearmCandidates} from '../dist/sync/rtc.js';
import {MAX_SIGNAL} from '../dist/sync/signals.js';
import {SIGNAL_URL} from '../dist/sync/relay-config.js';

const SDP='v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=mid:0\r\na=candidate:3124902669 1 udp 2113937151 a.local 41142 typ host generation 0\r\na=candidate:3306748912 1 udp 1677729535 203.0.113.9 41142 typ srflx raddr 0.0.0.0 rport 0 generation 0\r\na=ice-ufrag:abcd\r\n';

test('host key derives a stable 22-character room id that differs per key',async()=>{const key=randomKey(),room=await roomFromKey(key);assert.match(room,/^[A-Za-z0-9_-]{22}$/);assert.equal(await roomFromKey(key),room);assert.notEqual(await roomFromKey(randomKey()),room);});

test('relay addresses must be https, or http only for local development hosts',()=>{
 assert.equal(normalizeRelay('https://sig.example.workers.dev/'),'https://sig.example.workers.dev');
 assert.equal(normalizeRelay('https://example.org/tongxi/'),'https://example.org/tongxi');
 assert.equal(normalizeRelay('http://localhost:8787'),'http://localhost:8787');
 assert.equal(normalizeRelay(''),'');
 for(const bad of ['http://sig.example.org','https://user:pw@sig.example.org','https://sig.example.org/?token=1','https://sig.example.org/#x','javascript:alert(1)','ftp://sig.example.org'])assert.throws(()=>normalizeRelay(bad));
});

test('room links carry only a room id and a non-default relay, and are validated on open',async()=>{
 const room=await roomFromKey(randomKey()),link=roomLink(room,'https://sig.example.workers.dev','https://example.org/sanguosha-tongxi/?private=1#old');
 const url=new URL(link);assert.equal(url.search,'');assert.equal(url.pathname,'/sanguosha-tongxi/');assert(!link.includes('private'));
 assert.deepEqual(parseRoomLink(link),{room,relay:'https://sig.example.workers.dev',custom:true});
 assert.equal(parseRoomLink('https://example.org/#offer=TX1G.abc'),null);
 assert.throws(()=>parseRoomLink('https://example.org/#room=short&relay=https%3A%2F%2Fa.example'));
 assert.throws(()=>parseRoomLink(`https://example.org/#room=${room}&room=${room}&relay=https%3A%2F%2Fa.example`));
 assert.throws(()=>parseRoomLink(`https://example.org/#room=${room}&relay=http%3A%2F%2Fevil.example`));
 // No relay in the link and none configured for this site: tell the guest to use manual codes.
 if(!SIGNAL_URL)assert.throws(()=>parseRoomLink(`https://example.org/#room=${room}`),/未配置/);
 else assert.equal(parseRoomLink(`https://example.org/#room=${room}`).custom,false);
 assert.throws(()=>roomLink('bad','https://a.example','https://example.org/'));
});

test('relayed signaling messages are reduced to known fields and size-limited',()=>{
 assert.deepEqual(checkSignal({kind:'connect',seatToken:'must-not-pass'}),{kind:'connect'});
 assert.deepEqual(checkSignal({kind:'offer',linkId:'L1',roomId:'room-1',sdp:SDP,extra:{secret:1}}),{kind:'offer',linkId:'L1',roomId:'room-1',sdp:SDP});
 assert.deepEqual(checkSignal({kind:'candidate',linkId:'L1',candidate:{candidate:'candidate:1 1 udp 1 1.2.3.4 9 typ host',sdpMid:'0',sdpMLineIndex:0,usernameFragment:'x'}}),{kind:'candidate',linkId:'L1',candidate:{candidate:'candidate:1 1 udp 1 1.2.3.4 9 typ host',sdpMid:'0',sdpMLineIndex:0}});
 for(const bad of [null,{kind:'hello'},{kind:'answer',linkId:'L1',sdp:'not sdp'},{kind:'answer',linkId:'bad id',sdp:SDP},{kind:'offer',linkId:'L1',sdp:SDP},{kind:'answer',linkId:'L1',sdp:'v=0'+'x'.repeat(MAX_SIGNAL)},{kind:'candidate',linkId:'L1',candidate:{candidate:'x'.repeat(2000)}},{kind:'candidate',linkId:'L1',candidate:{candidate:'a=candidate:1'}}])assert.throws(()=>checkSignal(bad));
});

test('re-armed candidates keep address and type but get a fresh foundation',()=>{
 const one=rearmCandidates(SDP,1),two=rearmCandidates(SDP,2);
 assert.equal(one.length,2);assert.equal(one[0].sdpMid,'0');
 assert.match(one[0].candidate,/^candidate:3124902669r1 1 udp 2113937151 a\.local 41142 typ host/);
 assert.match(one[1].candidate,/203\.0\.113\.9 41142 typ srflx/);
 assert.notEqual(one[1].candidate,two[1].candidate);
 assert.deepEqual(rearmCandidates('v=0\r\na=ice-ufrag:x\r\n',1),[]);
});

class FakePC extends EventTarget{
 constructor(){super();this.iceGatheringState='gathering';this.connectionState='new';this.signalingState='have-local-offer';this.localDescription={type:'offer',sdp:'v=0\r\n'};}
 add(type){this.localDescription={type:'offer',sdp:this.localDescription.sdp+`a=candidate:1 1 udp 1 192.0.2.1 9 typ ${type}\r\n`};this.dispatchEvent(Object.assign(new Event('icecandidate'),{candidate:{candidate:'x'}}));}
}
test('candidate gathering stops early once the useful type arrives instead of waiting for "complete"',async()=>{
 const pc=new FakePC(),start=Date.now();setTimeout(()=>pc.add('host'),5);setTimeout(()=>pc.add('srflx'),20);
 await gathered(pc,{iceServers:[{urls:'stun:stun.example:3478'}],grace:10,soft:2000,hard:4000});assert(Date.now()-start<500);
});
test('a gathering that never completes continues with what it has, and only fails with nothing at all',async()=>{
 const pc=new FakePC();setTimeout(()=>pc.add('host'),5);
 await gathered(pc,{iceServers:[{urls:'stun:blocked.example:3478'}],grace:10,soft:40,hard:80});
 assert.match(pc.localDescription.sdp,/typ host/);
 await assert.rejects(()=>gathered(new FakePC(),{iceServers:[],grace:10,soft:20,hard:40}),/没有收集到/);
 const closed=new FakePC();setTimeout(()=>{closed.connectionState='closed';closed.dispatchEvent(new Event('connectionstatechange'));},5);
 await assert.rejects(()=>gathered(closed,{grace:10,soft:500,hard:1000}),/取消/);
});
