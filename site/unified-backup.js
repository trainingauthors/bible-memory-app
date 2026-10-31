/** Public-only backup codec. No DOM, storage writes, network, or private import path.
 * The caller validates all components before starting its recoverable restore.
 * A null component in parseUnifiedBackup means KEEP that component, never erase it.
 */
import {normalizePublicBackup} from './backup-validation.js';

export const UNIFIED_BACKUP_FORMAT='bible-memory-public-unified-backup';
export const MAX_UNIFIED_BACKUP_BYTES=6*1024*1024;
const MEMORY_FORMAT='bible-memory-public-browser-backup';
const forbidden=new Set(['__proto__','prototype','constructor']);
const own=(value,key)=>Object.hasOwn(value,key);
const clone=value=>JSON.parse(JSON.stringify(value));
function bad(message='Invalid public backup. Nothing was restored.'){
 const error=new Error(message);error.status=400;throw error;
}
function exact(value,allowed,required=allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!own(value,key)))bad();
}
function date(value,nullable=false){
 if(nullable&&value===null)return;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==(value.length===20?value.slice(0,-1)+'.000Z':value))bad('Invalid backup timestamp. Nothing was restored.');
}
function integer(value,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)bad();}
function enumeration(value,allowed){if(!allowed.includes(value))bad();}
function identifier(value){if(typeof value!=='string'||value.length>160||!/^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(value)||forbidden.has(value))bad('Invalid or duplicate playlist identifier. Nothing was restored.');}
function name(value){if(typeof value!=='string'||!value.trim()||value.length>1000)bad('Invalid playlist name. Nothing was restored.');}

// Do not stringify objects with getters/toJSON, exotic prototypes, sparse arrays,
// circular references, or hidden/symbol keys. Parsed hostile keys stay data, never
// become Object.assign targets. Bound traversal as well as serialized byte length.
function jsonValue(input){
 let value=input;
 if(typeof input==='string'){
  if(new TextEncoder().encode(input).length>MAX_UNIFIED_BACKUP_BYTES)bad('Public backup exceeds 6 MiB.');
  try{value=JSON.parse(input);}catch{bad('The selected file is not valid JSON.');}
 }
 const stack=new Set();let nodes=0;
 function visit(item,depth){
  if(++nodes>500000||depth>64)bad('Public backup is too complex.');
  if(item===null||typeof item==='string'||typeof item==='boolean')return;
  if(typeof item==='number'){if(!Number.isFinite(item))bad();return;}
  if(typeof item!=='object'||stack.has(item))bad();
  const array=Array.isArray(item),prototype=Object.getPrototypeOf(item);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)bad('Only plain public backup data is accepted.');
  stack.add(item);
  const descriptors=Object.getOwnPropertyDescriptors(item),all=Reflect.ownKeys(item);
  if(array&&item.length>100000)bad();
  for(const key of all){
   if(array&&key==='length')continue;
   const descriptor=descriptors[key];
   if(typeof key!=='string'||forbidden.has(key)||!descriptor.enumerable||!own(descriptor,'value')||array&&(!/^(?:0|[1-9]\d*)$/.test(key)||Number(key)>=item.length))bad('Unsafe backup field. Nothing was restored.');
   visit(descriptor.value,depth+1);
  }
  if(array&&all.length!==item.length+1)bad();
  stack.delete(item);
 }
 visit(value,0);
 let encoded;try{encoded=JSON.stringify(value);}catch{bad();}
 if(!encoded||new TextEncoder().encode(encoded).length>MAX_UNIFIED_BACKUP_BYTES)bad('Public backup exceeds 6 MiB.');
 return JSON.parse(encoded);
}
function bookMap(books){
 if(!Array.isArray(books)||!books.length||books.length>100)bad('Approved public Bible book metadata is required.');
 const map=new Map();
 for(const book of books){
  if(!book||typeof book.code!=='string'||!/^[A-Z0-9]{3}$/.test(book.code)||map.has(book.code)||!Number.isSafeInteger(book.chapterCount)||book.chapterCount<1||book.chapterCount>150||!Array.isArray(book.verseCounts)||book.verseCounts.length!==book.chapterCount||book.verseCounts.some(count=>!Number.isSafeInteger(count)||count<1||count>176))bad('Approved public Bible book metadata is required.');
  map.set(book.code,book);
 }
 return map;
}
function validateAudio(value,books,{complete=false}={}){
 const optional=['options','display','studyFont'];
 exact(value,['version','lists','current',...optional],['version','lists','current',...(complete?optional:[])]);
 if(value.version!==1||!Array.isArray(value.lists)||value.lists.length>100)bad('Invalid public Audio playlists. Nothing was restored.');
 const approved=bookMap(books),playlistIds=new Set(),trackIds=new Set();let total=0;
 for(const playlist of value.lists){
  exact(playlist,['id','name','items']);identifier(playlist.id);name(playlist.name);
  if(playlistIds.has(playlist.id))bad('Invalid or duplicate playlist identifier. Nothing was restored.');
  playlistIds.add(playlist.id);
  if(!Array.isArray(playlist.items)||playlist.items.length>1000||(total+=playlist.items.length)>10000)bad('Too many playlist passages. Nothing was restored.');
  for(const track of playlist.items){
   exact(track,['id','book','chapter','start','end','reps','pauseSeconds'],['id','book','chapter','start','end','reps']);identifier(track.id);
   if(trackIds.has(track.id))bad('Invalid or duplicate track identifier. Nothing was restored.');
   trackIds.add(track.id);
   const book=approved.get(track.book);if(!book)bad('Unknown public Bible book. Nothing was restored.');
   integer(track.chapter,1,book.chapterCount);const max=book.verseCounts[track.chapter-1];integer(track.start,1,max);integer(track.end,track.start,max);integer(track.reps,1,100);
   if(own(track,'pauseSeconds'))integer(track.pauseSeconds,0,600);
  }
 }
 if(value.current!==null&&!playlistIds.has(value.current))bad('The selected playlist is missing. Nothing was restored.');
 if(own(value,'options')){
  const options=value.options;exact(options,['repeat','reflect','pause','speed','chapterMode'],['repeat','reflect','pause','speed']);
  enumeration(options.repeat,['off','verse','passage','playlist']);enumeration(options.reflect,['off','verses','tracks','reps']);integer(options.pause,0,600);enumeration(options.speed,[0.5,0.75,1,1.25,1.5,1.75,2]);
  if(own(options,'chapterMode'))enumeration(options.chapterMode,['stop','autoplay','repeat']);
 }
 if(own(value,'display')){exact(value.display,['theme','font','mode']);enumeration(value.display.theme,['light','dark']);integer(value.display.font,14,32);enumeration(value.display.mode,['text','first','none']);}
 if(own(value,'studyFont'))integer(value.studyFont,16,30);
 return value;
}
/** Validates an Audio snapshot or the list-only component of a legacy import.
 * Missing settings remain missing, so callers can merge without wiping them.
 */
export function validateAudioBackup(audio,{books}={}){return validateAudio(jsonValue(audio),books);}
function validateUi(value){
 exact(value,['theme','reminderSnoozedUntil','firstAudioSavedAt','recallPreferences'],['theme']);enumeration(value.theme,['light','dark']);
 for(const key of ['reminderSnoozedUntil','firstAudioSavedAt'])if(own(value,key))date(value[key],true);
 if(own(value,'recallPreferences')){exact(value.recallPreferences,['method','scope']);enumeration(value.recallPreferences.method,['oral','full','first']);enumeration(value.recallPreferences.scope,['verse','passage']);}
 return value;
}
function memory(value,context){return normalizePublicBackup(value,context);}
let fallbackId=0;
function newId(){return globalThis.crypto?.randomUUID?.()??`restored-${Date.now().toString(36)}-${++fallbackId}-${Math.random().toString(36).slice(2,12)}`;}
function legacyAudio(value,books){
 exact(value,['app','version','exportedAt','lists']);if(value.app!=='Audio Bible BSB'||value.version!==1)bad('Private or unknown backup formats are not accepted.');date(value.exportedAt);
 if(!Array.isArray(value.lists)||value.lists.length>100)bad();
 const lists=value.lists.map(playlist=>{
  exact(playlist,['name','items']);if(typeof playlist.name!=='string'||playlist.name.length>100000||!Array.isArray(playlist.items)||playlist.items.length>1000)bad();
  return {id:newId(),name:playlist.name.trim().slice(0,100)||'Restored Playlist',items:playlist.items.map(track=>{exact(track,['book','chapter','start','end','reps','pauseSeconds'],['book','chapter','start','end','reps']);return {id:newId(),...track};})};
 });
 return validateAudio({version:1,lists,current:lists[0]?.id??null},books);
}
/** Accepts exactly the complete public format and the two old public formats.
 * Legacy Audio is additive; the caller must retain current settings/playlists.
 * This codec performs no restore and does not imply cross-store atomicity.
 */
export function parseUnifiedBackup(input,context={}){
 const value=jsonValue(input);
 if(value?.format===UNIFIED_BACKUP_FORMAT){
  exact(value,['format','schemaVersion','exportedAt','memory','audio','ui']);if(value.schemaVersion!==1)bad('Unknown public backup version.');date(value.exportedAt);
  value.memory=memory(value.memory,context);if(Date.parse(value.memory.exportedAt)>Date.parse(value.exportedAt))bad('Inconsistent backup timestamps. Nothing was restored.');
  validateAudio(value.audio,context.books,{complete:true});validateUi(value.ui);
  if(value.ui.firstAudioSavedAt&&Date.parse(value.ui.firstAudioSavedAt)>Date.parse(value.exportedAt))bad('Inconsistent backup timestamps. Nothing was restored.');
  return {kind:'unified',memory:value.memory,audio:value.audio,ui:value.ui};
 }
 if(value?.format===MEMORY_FORMAT){return {kind:'legacy-memory',memory:memory(value,context),audio:null,ui:null};}
 if(value?.app==='Audio Bible BSB')return {kind:'legacy-audio',memory:null,audio:legacyAudio(value,context.books),ui:null};
 bad('Private or unknown backup formats are not accepted.');
}
/** Export only a complete, fully validated public snapshot. Pass approved
 * {catalog,validateCatalog,books} just as for parseUnifiedBackup.
 */
export function createUnifiedBackup(input={},context={}){
 const parts=jsonValue(input);exact(parts,['memory','audio','ui','exportedAt'],['memory','audio','ui']);
 const {memory,audio,ui,exportedAt=new Date().toISOString()}=parts;
 const backup=jsonValue({format:UNIFIED_BACKUP_FORMAT,schemaVersion:1,exportedAt,memory,audio,ui});
 const parsed=parseUnifiedBackup(backup,context);backup.memory=parsed.memory;return clone(backup);
}
