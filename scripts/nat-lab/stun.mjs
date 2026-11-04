import dgram from 'node:dgram';
const s=dgram.createSocket('udp4');let n=0;
s.on('message',(m,r)=>{
 if(m.length<20||m.readUInt16BE(0)!==1||m.readUInt32BE(4)!==0x2112A442)return;n++;
 const tid=m.subarray(8,20),port=r.port^0x2112,ip=r.address.split('.').map(Number),x=Buffer.from([0,1,(port>>8)&255,port&255,ip[0]^0x21,ip[1]^0x12,ip[2]^0xA4,ip[3]^0x42]);
 const attr=Buffer.concat([Buffer.from([0x00,0x20,0,8]),x]);const h=Buffer.alloc(20);h.writeUInt16BE(0x0101,0);h.writeUInt16BE(attr.length,2);h.writeUInt32BE(0x2112A442,4);tid.copy(h,8);
 s.send(Buffer.concat([h,attr]),r.port,r.address);
 if(process.env.LOG)console.log('binding',r.address,r.port);
});
s.bind(3478,'0.0.0.0',()=>console.log('stun up'));
