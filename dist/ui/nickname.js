const KEY='tongxi:last-name',LEGACY='tongxi:guest-name';
export function readNickname(storage){return (storage.getItem(KEY)||storage.getItem(LEGACY)||'').trim().slice(0,24);}
export function saveNickname(storage,value){
 const name=String(value||'').trim().slice(0,24);if(!name)return '';
 if(storage.getItem(KEY)!==name)storage.setItem(KEY,name);
 if(storage.getItem(LEGACY)!==null)storage.removeItem(LEGACY);return name;
}
