const phases=new Set(['idle','loading','playing','gap','paused','preview','complete','error']);
const exact=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key));
export function createAudioBridge({origin,source,getTheme,post,onState=()=>{},onTheme=()=>{},onSize=()=>{},onSaved=()=>{}}){
 let ready=false,queuedPlay=null,queuedEntry=false,queuedControl=null,queuedOpen=false,queuedContext=null;const requests=new Map();
 const sendRaw=value=>post({type:'public-memory-audio',...value},origin);
 function ping(){sendRaw({action:'ping'});}
 function send(value){
  if(value.action==='theme'){if(ready)sendRaw({action:'theme',theme:getTheme()});else ping();return;}
  if(value.action==='play'){if(ready)sendRaw(value);else{queuedPlay=JSON.parse(JSON.stringify(value));queuedControl=null;ping();}return;}
  if(value.action==='context'){if(typeof value.compact!=='boolean')return;if(ready)sendRaw(value);else{queuedContext=value;ping();}return;}
  if(value.action==='entry'){if(ready)sendRaw(value);else{queuedEntry=true;ping();}return;}
  if(value.action==='stop')queuedPlay=null;
  if(['pause','resume','stop','open'].includes(value.action)){if(ready)sendRaw({action:value.action});else{if(value.action==='open')queuedOpen=true;else queuedControl=value.action;ping();}}
 }
 function handleMessage(event){
  if(event.origin!==origin||event.source!==source)return false;
  const data=event.data;
  if(data?.type==='public-memory-audio-ready'&&exact(data,['type'])){ready=true;sendRaw({action:'theme',theme:getTheme()});if(queuedContext){sendRaw(queuedContext);queuedContext=null;}for(const request of requests.values())if(!request.sent){request.sent=true;sendRaw(request.message);}if(queuedEntry){queuedEntry=false;sendRaw({action:'entry'});}if(queuedPlay){const play=queuedPlay;queuedPlay=null;sendRaw(play);}if(queuedControl){const action=queuedControl;queuedControl=null;sendRaw({action});}if(queuedOpen){queuedOpen=false;sendRaw({action:'open'});}return true;}
  if(data?.type==='public-memory-audio-theme'&&exact(data,['type','theme'])&&['light','dark'].includes(data.theme)){onTheme(data.theme);return true;}
  if(data?.type==='public-memory-audio-state'&&exact(data,['type','phase','label','active','paused','canToggle'])&&phases.has(data.phase)&&typeof data.label==='string'&&data.label.length<=500&&typeof data.active==='boolean'&&typeof data.paused==='boolean'&&(data.canToggle===undefined||typeof data.canToggle==='boolean')){onState({phase:data.phase,label:data.label,active:data.active,paused:data.paused,canToggle:data.canToggle!==false});return true;}
  if(data?.type==='public-memory-audio-size'&&exact(data,['type','height'])&&Number.isFinite(data.height)&&data.height>=180&&data.height<=12000){onSize(Math.ceil(data.height));return true;}
  if(data?.type==='public-memory-audio-saved'&&exact(data,['type','at'])&&typeof data.at==='string'&&Number.isFinite(Date.parse(data.at))&&new Date(data.at).toISOString()===data.at){onSaved(data.at);return true;}
  if(data?.type==='public-memory-audio-response'&&exact(data,['type','action','requestId','ok','value','error'])&&typeof data.requestId==='string'&&typeof data.ok==='boolean'){const request=requests.get(data.requestId);if(!request||data.action!==request.message.action)return false;requests.delete(data.requestId);clearTimeout(request.timer);if(data.ok)request.resolve(data.value);else request.reject(Error(typeof data.error==='string'?data.error.slice(0,500):'Audio backup could not be completed.'));return true;}
  return false;
 }
 function request(action,body={}){if(!['backup-export','backup-validate','backup-apply'].includes(action))return Promise.reject(Error('Unknown Audio backup action.'));const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{const message={action,requestId,...body},record={message,resolve,reject,sent:ready,timer:setTimeout(()=>{requests.delete(requestId);reject(Error('Audio backup response timed out. Your restore recovery record was kept.'));},20000)};requests.set(requestId,record);if(ready)sendRaw(message);else ping();});}
 return{get ready(){return ready;},start:ping,onFrameLoad(){ready=false;ping();},handleMessage,send,request};
}
