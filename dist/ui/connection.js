import {decodeSignal,invitationURL,localPreview} from '../sync/signals.js';
import {readNickname,saveNickname} from './nickname.js';
const $=id=>document.getElementById(id);
const pathName={direct:'直连',relay:'中继',unknown:'连接已建立'};
// Owns connection controls and transient timers, never the game state or seat tokens.
export class ConnectionUX{
 constructor(hooks){
  this.hooks=hooks;this.jobs=new Map();this.epoch=0;this.timers=new Map();this.inviteNo=0;
  $('connection-enter').addEventListener('click',()=>$('connect-dialog').close());
  $('show-offer-code').addEventListener('click',()=>{const panel=$('signal-code-panel');panel.hidden=!panel.hidden;$('show-offer-code').setAttribute('aria-expanded',String(!panel.hidden));});
  $('answer-input').addEventListener('input',()=>{clearTimeout(this.pasteTimer);const text=$('answer-input').value;if(!text.trim()){$('answer-feedback').textContent='';return;}this.pasteTimer=setTimeout(()=>this.autoAccept(text),250);});
  $('offer-input').addEventListener('input',()=>{$('answer-output').value='';$('answer-ready').hidden=true;});
  try{const name=readNickname(localStorage);if(name){$('guest-name').value=name;document.querySelector('#create-form [name=name]').value=name;}}catch{}
  for(const id of ['share-offer','share-answer'])$(id).hidden=typeof navigator.share!=='function';
  $('local-invite-note').hidden=!localPreview(location.href);
 }
 rememberName(value){const name=String(value||'').trim().slice(0,24);if(!name)return;try{saveNickname(localStorage,name);}catch{}for(const field of [$('guest-name'),document.querySelector('#create-form [name=name]')])if(field!==document.activeElement&&field.value!==name)field.value=name;}
 reset(){this.epoch++;this.jobs.clear();this.pendingPeer?.close();this.pendingPeer=null;clearTimeout(this.pasteTimer);for(const t of this.timers.values())clearTimeout(t);this.timers.clear();this.acceptedText=null;this.inviteNo=0;for(const id of ['offer-output','offer-link','answer-input','answer-output'])$(id).value='';$('connection-enter').hidden=true;$('offer-ready').hidden=true;$('answer-ready').hidden=true;$('answer-feedback').textContent='';$('connection-retry').hidden=true;for(const [kind,label]of Object.entries({offer:'生成邀请链接',answer:'加入并生成回应',accept:'接收回应'})){const button=document.querySelector(`[data-do="${kind}"]`);button.disabled=false;button.textContent=label;}}
 run(kind,fn){
  if(this.jobs.has(kind))return this.jobs.get(kind);if(kind==='offer'){$('offer-output').value='';$('offer-link').value='';$('offer-ready').hidden=true;}if(kind==='answer'){$('answer-output').value='';$('answer-ready').hidden=true;}const epoch=this.epoch,button=document.querySelector(`[data-do="${kind}"]`),label=button?.textContent;
  if(button){button.disabled=true;button.textContent=kind==='offer'?'正在准备邀请…':kind==='answer'?'正在准备回应…':'正在连接…';}
  const promise=Promise.resolve().then(()=>{if(this.epoch===epoch)return fn();}).finally(()=>{if(this.epoch!==epoch)return;this.jobs.delete(kind);if(button){button.disabled=false;button.textContent=kind==='offer'&&!$('offer-ready').hidden?'再邀请一位':label;}});this.jobs.set(kind,promise);return promise;
 }
 offerReady(code,link){link.inviteNo=++this.inviteNo;$('offer-output').value=code;$('offer-link').value=invitationURL(code,location.href);$('offer-ready').hidden=false;$('answer-input').value='';$('answer-feedback').textContent='';this.acceptedText=null;$('offer-ready').setAttribute('aria-label',`第${link.inviteNo}份邀请已准备好`);}
 answerReady(code){if(!this.hooks.state().view)$('connection-enter').hidden=true;$('answer-output').value=code;$('answer-ready').hidden=false;}
 async autoAccept(text){
  if(!this.hooks.state().isHost||text!==$('answer-input').value||text===this.acceptedText)return;
  try{await this.hooks.accept(text);if(text===$('answer-input').value){if(this.acceptedText===text)$('answer-feedback').textContent='✓ 回应已接收';else this.pasteTimer=setTimeout(()=>this.autoAccept(text),0);}}
  catch(e){if(text===$('answer-input').value)$('answer-feedback').textContent=e.message;}
 }
 async initial(){
  const params=new URLSearchParams(location.hash.slice(1));if(!params.has('offer'))return;
  const text=location.href;history.replaceState(null,'',location.pathname+location.search);this.hooks.role('guest');this.hooks.open();
  try{const signal=await decodeSignal(text);if(signal.type!=='offer')throw new Error('这不是邀请，请向房主索取邀请链接');$('offer-input').value=new URLSearchParams(new URL(text).hash.slice(1)).get('offer');this.hooks.status('邀请已填好。确认昵称后点击加入，再将回应发回房主。');$('guest-name').focus();$('guest-name').select();}
  catch(e){this.hooks.status(e.message);$('offer-input').focus();}
 }
 async share(kind){
  const input=kind==='offer'?$('offer-link'):$('answer-output');if(!input.value)throw new Error(kind==='offer'?'先生成邀请':'先加入并生成回应');
  const data=kind==='offer'?{title:'同席 · 一起玩三国杀',text:'这份邀请供一位好友加入；打开后按页面提示发回回应。',url:input.value}:{title:'同席 · 连接回应',text:input.value};
  if(typeof navigator.share==='function'){try{await navigator.share(data);return;}catch(e){if(e.name==='AbortError')return;}}
  const copied=await this.hooks.copy(input);if(copied!==false)this.hooks.toast(kind==='offer'?'邀请链接已复制，可粘贴给好友。':'回应已复制，请发回房主。');
 }
 track(state,link,error){
  if(link.disposed)return;
  if(['open','connected'].includes(state)){clearTimeout(this.timers.get(link.id));this.timers.delete(link.id);$('connection-retry').hidden=true;if(link.channel?.readyState==='open'){link.status='open';link.path().then(path=>{if(link.disposed)return;link.pathType=path;this.hooks.peers();this.hooks.status(path==='unknown'?'连接已建立。':`已连接 · ${pathName[path]}。`);});}}
  if(state==='disconnected'){
   link.interrupted=true;this.hooks.status('网络波动，正在等待连接恢复…');
   if(!this.timers.has(link.id))this.timers.set(link.id,setTimeout(()=>{this.timers.delete(link.id);if(link.disposed||link.pc.connectionState!=='disconnected')return;this.hooks.status('连接暂未恢复。可继续等待，或重新交换邀请；原席位会保留。');$('connection-retry').hidden=false;},5000));
  }
  if(['failed','closed','protocol-error'].includes(state)){clearTimeout(this.timers.get(link.id));this.timers.delete(link.id);if(!this.hooks.state().isHost)$('connection-enter').hidden=true;this.hooks.status(error||'连接已中断。房主重新生成邀请，好友在原标签页加入即可回到原席位。');$('connection-retry').hidden=false;}
 }
 synced(link){const {view,isHost}=this.hooks.state();if(!link||!view)return;$('connection-enter').hidden=false;if(!link.synced||link.awaitingSync){if(!isHost)this.rememberName(view.players.find(p=>p.id===view.you)?.name);link.synced=true;link.awaitingSync=false;this.hooks.status(isHost?'好友已入席，可继续邀请下一位。':'已入席，可以进入牌桌。');}}
 retry(){if(this.hooks.state().isHost)return this.hooks.offer();this.hooks.role('guest');$('offer-input').value='';$('answer-output').value='';$('answer-ready').hidden=true;$('offer-input').focus();this.hooks.status('请粘贴房主新发来的邀请，再点击加入；保留本标签页即可认领原席位。');}
}
