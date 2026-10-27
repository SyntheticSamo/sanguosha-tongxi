// Full host snapshots stay on the host device. Peers never receive this store.
export async function saveSnapshot(state){
  const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('rooms','readwrite');tx.objectStore('rooms').put(state,'latest');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
}
export async function loadSnapshot(){const db=await open();const result=await new Promise((resolve,reject)=>{const req=db.transaction('rooms').objectStore('rooms').get('latest');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();return result;}
function open(){return new Promise((resolve,reject)=>{const req=indexedDB.open('tongxi-host-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('rooms');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
