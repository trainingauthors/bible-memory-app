import {createRecallFlow,recallFlowView} from './recall-flow.js';
/** Local-only typed recall helpers. They never save practice, choose a rating, or send an answer. */
export const MAX_RECALL_LENGTH=50000;
export const MAX_FLOW_DRAFT_LENGTH=4*MAX_RECALL_LENGTH;
const MAX_LCS_CELLS=4000000;
const DRAFT_PREFIX='bible-memory-public-ui-v1:recall-draft';
const modes=['full','first'];
const lower=value=>value.toLocaleLowerCase('en');
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function boundedText(text){
 if(typeof text!=='string')throw Error('Enter a text answer before checking.');
 if(text.length>MAX_RECALL_LENGTH)throw Error('Please use an answer of 50,000 characters or fewer.');
 return text;
}
function normalized(text){const value=text.normalize('NFKC');if(value.length>MAX_RECALL_LENGTH)throw Error('Please compare a shorter section at a time.');return value;}
function words(text){return normalized(text).replace(/[’']/g,'').match(/[\p{L}\p{N}]+/gu)||[];}

/** Verse numbers and reference metadata are deliberately not part of the answer. */
export function recallWords(verses){
 if(!Array.isArray(verses))throw Error('Load the exact passage before checking your answer.');
 let length=0;
 const text=verses.map(verse=>{
  if(!verse||typeof verse.text!=='string')throw Error('Load the exact passage before checking your answer.');
  length+=verse.text.length+1;
  if(length>MAX_RECALL_LENGTH+1)throw Error('Please compare a shorter passage at a time.');
  return verse.text;
 }).join(' ');
 boundedText(text);
 return words(text);
}

/**
 * Case/punctuation-insensitive LCS, matching the established personal recall comparison.
 * Missing and extra tokens remain separate: an extra word never earns a correct word.
 * Common ends are stripped first so even a long exact chapter needs no LCS matrix.
 * Highly divergent oversized comparisons fail explicitly instead of freezing the UI
 * or silently returning an approximate score. No result is a suggested review rating.
 */
export function compareRecall(verses,input,mode='full'){
 if(!modes.includes(mode))throw Error('Choose full text or first letters.');
 boundedText(input);
 const expectedWords=recallWords(verses);
 const wanted=mode==='first'?expectedWords.map(word=>lower(Array.from(word)[0])):expectedWords;
 const actual=mode==='first'?Array.from(lower(normalized(input)).replace(/[^\p{L}\p{N}]/gu,'')):words(input);
 const wantedLower=wanted.map(lower),actualLower=actual.map(lower);
 let start=0,wantedEnd=wanted.length,actualEnd=actual.length;
 while(start<wantedEnd&&start<actualEnd&&wantedLower[start]===actualLower[start])start++;
 while(wantedEnd>start&&actualEnd>start&&wantedLower[wantedEnd-1]===actualLower[actualEnd-1]){wantedEnd--;actualEnd--;}
 const expectedMiddle=wantedEnd-start,actualMiddle=actualEnd-start;
 if(expectedMiddle&&actualMiddle&&(expectedMiddle+1)*(actualMiddle+1)>MAX_LCS_CELLS)throw Error('This answer has too many differences to compare at once. Please compare a shorter section at a time.');
 const tokens=[];
 const match=(i,j)=>tokens.push({expected:wanted[i],actual:actual[j],correct:true});
 for(let i=0;i<start;i++)match(i,i);
 if(!expectedMiddle){for(let j=start;j<actualEnd;j++)tokens.push({expected:'',actual:actual[j],correct:false});}
 else if(!actualMiddle){for(let i=start;i<wantedEnd;i++)tokens.push({expected:wanted[i],actual:'',correct:false});}
 else{
  const rows=Array.from({length:expectedMiddle+1},()=>new Uint16Array(actualMiddle+1));
  for(let i=expectedMiddle-1;i>=0;i--)for(let j=actualMiddle-1;j>=0;j--)rows[i][j]=wantedLower[start+i]===actualLower[start+j]?rows[i+1][j+1]+1:Math.max(rows[i+1][j],rows[i][j+1]);
  let i=0,j=0;
  while(i<expectedMiddle||j<actualMiddle){
   if(i<expectedMiddle&&j<actualMiddle&&wantedLower[start+i]===actualLower[start+j]){match(start+i++,start+j++);}
   else if(i<expectedMiddle&&(j===actualMiddle||rows[i+1][j]>=rows[i][j+1]))tokens.push({expected:wanted[start+i++],actual:'',correct:false});
   else tokens.push({expected:'',actual:actual[start+j++],correct:false});
  }
 }
 for(let i=wantedEnd,j=actualEnd;i<wanted.length;i++,j++)match(i,j);
 return {expectedCount:wanted.length,correctCount:tokens.filter(token=>token.correct).length,tokens};
}

/** Optional safe display of a comparison. The caller owns the caption and raw-answer display. */
export function recallComparisonHTML(comparison){
 if(!comparison||!Array.isArray(comparison.tokens))throw Error('Check your answer before displaying differences.');
 return comparison.tokens.map(token=>{
  const expected=escapeHTML(token.expected??''),actual=escapeHTML(token.actual??'');
  if(token.correct===true)return '<span class="recall-match">'+expected+'</span>';
  return (expected?'<span class="recall-missing"><small>Missing</small> '+expected+'</span>':'')+(expected&&actual?' ':'')+(actual?'<span class="recall-extra"><small>Extra</small> '+actual+'</span>':'');
 }).join(' ');
}

function identity(value){
 if(!value||typeof value.id!=='string'||!value.id.length||value.id.length>300||!Number.isSafeInteger(value.version)||value.version<1||!Number.isSafeInteger(value.generation)||value.generation<0)throw Error('Refresh this passage before recovering its draft.');
 return {id:value.id,version:value.version,generation:value.generation};
}
function draftRecord(raw){
 // JSON can escape each UTF-16 code unit as six characters (for example control characters).
 if(typeof raw!=='string'||raw.length>12*MAX_RECALL_LENGTH+3000)return null;
 let value;try{value=JSON.parse(raw);}catch{return null;}
 if(!value||value.schemaVersion!==1||typeof value.id!=='string'||!Number.isSafeInteger(value.version)||value.version<1||!Number.isSafeInteger(value.generation)||value.generation<0||!modes.includes(value.mode)||!value.drafts||modes.some(mode=>typeof value.drafts[mode]!=='string'||value.drafts[mode].length>MAX_RECALL_LENGTH))return null;
 return value;
}
const draftView=record=>({mode:record.mode,drafts:{full:record.drafts.full,first:record.drafts.first}});
const methods=['oral','full','first'],scopes=['verse','passage'];
const MAX_FLOW_RECORD_LENGTH=6*MAX_FLOW_DRAFT_LENGTH+200000;
const flowKeys=['schemaVersion','verseCount','method','scope','verseIndex','oralRevealedCount','showAll','checked','coverage'];
function flowDraftView(value,verseCount,{recover=false}={}){
 const hiddenFlow=createRecallFlow({verseCount,saved:value?.flow});
 if(!value?.flow)throw Error('Choose a recall method and passage scope before saving a draft.');
 const verified=recallFlowView(value.flow);
 const flow=recover?hiddenFlow:Object.fromEntries(flowKeys.map(key=>[key,verified[key]]));
 const drafts={};let length=0;
 for(const method of modes){
  const source=value.drafts?.[method];
  if(!source||typeof source.passage!=='string'||!Array.isArray(source.verses)||source.verses.length!==verseCount)throw Error('Recover this passage’s draft again before saving.');
  const check=text=>{boundedText(text);length+=text.length;if(length>MAX_FLOW_DRAFT_LENGTH)throw Error('Recall drafts can contain at most 200,000 characters across methods and scopes.');return text;};
  drafts[method]={passage:check(source.passage),verses:Array.from(source.verses,check)};
 }
 return {flow,drafts};
}
function parsedFlowRecord(raw){
 if(typeof raw!=='string'||raw.length>MAX_FLOW_RECORD_LENGTH)return null;
 let value;try{value=JSON.parse(raw);}catch{return null;}
 if(!value||value.schemaVersion!==1||typeof value.id!=='string'||!Number.isSafeInteger(value.version)||value.version<1||!Number.isSafeInteger(value.generation)||value.generation<0)return null;
 return value;
}
function preferenceView(value){
 if(!value||!methods.includes(value.method)||!scopes.includes(value.scope))throw Error('Choose a recall method and passage scope.');
 return {method:value.method,scope:value.scope};
}

/**
 * Optional browser-local recovery, deliberately separate from confirmed progress/backup.
 * Pass the current public session generation on EVERY operation. Observing a newer
 * generation fences off old callbacks in this and other tabs using this namespace.
 * Storage denial/quota/readback failures throw; there is no in-memory "saved" fallback.
 */
export function createRecallDraftStore({storage,prefix=DRAFT_PREFIX}={}){
 if(typeof prefix!=='string'||!/^bible-memory-public-ui-v1:recall-draft(?::[A-Za-z0-9_-]+)*$/.test(prefix))throw Error('Recall drafts require the public browser storage namespace.');
 // Generation/version in the key is essential: localStorage has no compare-and-swap.
 // Even an old callback interleaved with a restore can only write its OLD key.
 const fenceKey=prefix+':generation',itemKey=id=>prefix+':item:'+encodeURIComponent(id);
 const keyFor=target=>itemKey(target.id)+':v'+target.version+':g'+target.generation;
 let observedGeneration=-1;
 const observedVersions=new Map();
 function get(key){try{if(!storage||typeof storage.getItem!=='function')throw Error();const value=storage.getItem(key);if(value!==null&&typeof value!=='string')throw Error();return value;}catch{throw Error('This browser could not recover its local recall drafts. Your confirmed progress is unchanged.');}}
 function put(key,value){try{if(!storage||typeof storage.setItem!=='function')throw Error();storage.setItem(key,value);if(storage.getItem(key)!==value)throw Error();}catch{throw Error('This browser could not preserve your recall draft. Keep this tab open or copy your answer before leaving.');}}
 function fence(generation){
  const raw=get(fenceKey),saved=raw===null?-1:Number(raw);
  if(raw!==null&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(saved)))throw Error('This browser could not recover its recall draft generation. Refresh before using saved drafts.');
  observedGeneration=Math.max(observedGeneration,saved);
  if(generation<observedGeneration)return false;
  if(generation>observedGeneration){put(fenceKey,String(generation));observedGeneration=generation;}
  return true;
 }
 function versionFence(target){
  const key=itemKey(target.id)+':version:g'+target.generation,raw=get(key),saved=raw===null?0:Number(raw);
  if(raw!==null&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(saved)||saved<1))throw Error('This browser could not recover its recall draft version. Reload this passage before using saved drafts.');
  const observed=Math.max(saved,observedVersions.get(key)??0);
  observedVersions.set(key,observed);
  if(target.version<observed)return false;
  if(target.version>observed){put(key,String(target.version));observedVersions.set(key,target.version);}
  return true;
 }
 function read(value){
  const target=identity(value);
  if(!fence(target.generation)||!versionFence(target))return null;
  const record=draftRecord(get(keyFor(target)));
  if(!record||record.id!==target.id||record.version!==target.version||record.generation!==target.generation)return null;
  if(!fence(target.generation)||!versionFence(target))return null;
  return draftView(record);
 }
 function save(value){
  const target=identity(value);
  if(!modes.includes(value.mode))throw Error('Choose full text or first letters before saving a draft.');
  boundedText(value.text);
  if(!fence(target.generation))throw Error('This browser was restored. Refresh before saving a new recall draft.');
  if(!versionFence(target))throw Error('This passage changed. Reload it before saving a new recall draft.');
  const key=keyFor(target),previous=draftRecord(get(key));
  if(previous&&previous.generation>target.generation)throw Error('This browser was restored. Refresh before saving a new recall draft.');
  const current=previous?.id===target.id&&previous.version===target.version&&previous.generation===target.generation?previous:null;
  const record={schemaVersion:1,...target,mode:value.mode,drafts:{full:current?.drafts.full??'',first:current?.drafts.first??'',[value.mode]:value.text}};
  put(key,JSON.stringify(record));
  if(!fence(target.generation))throw Error('This browser was restored. Refresh before saving a new recall draft.');
  if(!versionFence(target))throw Error('This passage changed. Reload it before saving a new recall draft.');
  return draftView(record);
 }
 function remove(value){
  const target=identity(value);
  if(!fence(target.generation)||!versionFence(target))return false;
  const key=keyFor(target),record=draftRecord(get(key));
  if(!record||record.id!==target.id||record.version!==target.version||record.generation!==target.generation)return false;
  try{if(typeof storage.removeItem!=='function')throw Error();storage.removeItem(key);if(storage.getItem(key)!==null)throw Error();}catch{throw Error('This browser could not remove its local recall draft. Your confirmed progress is unchanged.');}
  return true;
 }
 function readFlowDraft(value){
  const target=identity(value);
  // Reuse the shared bound/count validation before allocating per-verse drafts.
  createRecallFlow({verseCount:value.verseCount});
  if(!fence(target.generation)||!versionFence(target))return null;
  const raw=get(keyFor(target)+':flow');
  if(raw===null){
   // Non-destructive compatibility: old typed answers belong to whole-passage scope.
   const legacy=read(target);if(!legacy)return null;
   const flow=createRecallFlow({verseCount:value.verseCount,method:legacy.mode,scope:'passage'});
   return {flow,drafts:Object.fromEntries(modes.map(mode=>[mode,{passage:legacy.drafts[mode],verses:Array(value.verseCount).fill('')}]))};
  }
  const record=parsedFlowRecord(raw);
  if(!record||record.id!==target.id||record.version!==target.version||record.generation!==target.generation||record.flow?.verseCount!==value.verseCount)return null;
  let recovered;try{recovered=flowDraftView(record,value.verseCount,{recover:true});}catch{return null;}
  if(!fence(target.generation)||!versionFence(target))return null;
  return recovered;
 }
 function saveFlowDraft(value){
  const target=identity(value),verified=flowDraftView(value,value.flow?.verseCount);
  if(!fence(target.generation))throw Error('This browser was restored. Refresh before saving a new recall draft.');
  if(!versionFence(target))throw Error('This passage changed. Reload it before saving a new recall draft.');
  const record={schemaVersion:1,...target,...verified};
  const raw=JSON.stringify(record);
  if(raw.length>MAX_FLOW_RECORD_LENGTH)throw Error('This recall draft is too large to preserve safely.');
  put(keyFor(target)+':flow',raw);
  if(!fence(target.generation))throw Error('This browser was restored. Refresh before saving a new recall draft.');
  if(!versionFence(target))throw Error('This passage changed. Reload it before saving a new recall draft.');
  return verified;
 }
 function removeFlowDraft(value){
  const target=identity(value);
  if(!fence(target.generation)||!versionFence(target))return false;
  const key=keyFor(target)+':flow',raw=get(key),record=parsedFlowRecord(raw);
  if(raw===null){if(!read(target))return false;}
  else if(!record||record.id!==target.id||record.version!==target.version||record.generation!==target.generation||record.discarded===true)return false;
  // An explicit discard must not resurrect an untouched legacy draft on next read.
  // A text-free tombstone avoids a destructive migration of the old API's record.
  try{put(key,JSON.stringify({schemaVersion:1,...target,discarded:true}));}catch{throw Error('This browser could not remove its local recall draft. Your confirmed progress is unchanged.');}
  if(!fence(target.generation)||!versionFence(target))return false;
  return true;
 }
 function readPreference(){
  const raw=get(prefix+':preference');if(raw===null)return null;
  if(raw.length>1000)return null;
  try{const value=JSON.parse(raw);return value?.schemaVersion===1?preferenceView(value):null;}catch{return null;}
 }
 function savePreference(value){
  const preference=preferenceView(value);put(prefix+':preference',JSON.stringify({schemaVersion:1,...preference}));return preference;
 }
 return {read,save,remove,readFlowDraft,saveFlowDraft,removeFlowDraft,readPreference,savePreference};
}
