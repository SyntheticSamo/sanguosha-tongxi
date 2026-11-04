// Shared by the browser and the optional signaling Worker: a room id is the first
// 22 base64url characters of SHA-256(host key), so knowing a room link never lets a
// guest claim the host role.
export const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function roomFromKey(key){return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).slice(0,22);}
