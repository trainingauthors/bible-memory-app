/** The same user-card form and card face in both apps. It owns no API, identity, scheduler or receipt. */
import {clozeParts,clozeNumbers,normalizeCardInput,hasNestedBlank,tidyCardInput} from './card-model.js';
export const DEFAULT_CARD_GROUP='My cards';
const NEW_GROUP='__new__';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WORD=/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const wordsOf=text=>[...text.matchAll(WORD)].map(match=>match[0]);
export function isUserCard(card){return card?.kind==='card'&&(card.provenance==='user-card-v1'||card.userCard===true);}
export function cardTypeLabel(card){return card?.cardType==='cloze'||card?.card?.type==='cloze'?'Fill in the blank':'Card';}
/** Every card group in Library order; My cards first, then A to Z. */
export function cardGroups(cards){const names=new Set(cards.filter(isUserCard).map(c=>c.cardGroup||c.group||DEFAULT_CARD_GROUP));return [...names].sort((a,b)=>a===DEFAULT_CARD_GROUP?-1:b===DEFAULT_CARD_GROUP?1:a.localeCompare(b));}
export function cardFormHTML(groups=[]){
 const options=[...new Set([DEFAULT_CARD_GROUP,...groups])].map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('')+'<option value="'+NEW_GROUP+'">+ New group…</option>';
 return '<section id="user-card-fields" class="user-card-fields" hidden>'
  +'<fieldset class="card-type-choice"><legend>What kind of card?</legend><label><input type="radio" name="user-card-type" value="basic" checked> Question and answer</label><label><input type="radio" name="user-card-type" value="cloze"> Fill in the blank</label></fieldset>'
  +'<div id="user-card-basic"><label for="user-card-front">Front: the question</label><textarea id="user-card-front" maxlength="2000" rows="3" placeholder="For example: Who wrote about half of the Psalms?"></textarea>'
  +'<label for="user-card-back">Back: the answer</label><textarea id="user-card-back" maxlength="2000" rows="2" placeholder="For example: David"></textarea>'
  +'<label class="toggle"><input type="checkbox" id="user-card-reverse"> Also quiz me the other way round (makes a second card)</label></div>'
  +'<div id="user-card-cloze" hidden><label for="user-card-text">Your sentence or verse</label><textarea id="user-card-text" maxlength="4000" rows="4" placeholder="Type or paste the words here."></textarea>'
  +'<p class="subtle" id="user-card-words-help">Type your sentence above, then tap the words to hide.</p><div id="user-card-words" class="cloze-words" aria-label="Words in your sentence"></div>'
  +'<fieldset class="cloze-mode" id="user-card-cloze-mode" hidden><legend>You hid more than one word. How should they be asked?</legend><label><input type="radio" name="user-card-cloze-mode" value="together" checked> All at once (one card)</label><label><input type="radio" name="user-card-cloze-mode" value="each"> One at a time (a card for each)</label></fieldset>'
  +'<div id="user-card-preview" class="user-card-preview" aria-live="polite"></div></div>'
  +'<div class="card-pictures" id="user-card-pictures" hidden>'+pictureRowHTML('front','Picture on the front (optional)')+pictureRowHTML('back','Picture on the back (optional)')+'</div>'
  +'<label for="user-card-reference">Bible reference (optional)</label><input id="user-card-reference" maxlength="200" placeholder="For example: Psalm 23">'
  +'<label for="user-card-group">Put it in a group</label><select id="user-card-group">'+options+'</select>'
  +'<label for="user-card-new-group" id="user-card-new-group-label" hidden>Name of the new group</label><input id="user-card-new-group" maxlength="80" placeholder="For example: Romans facts" hidden>'
  +'</section>';
}
function pictureRowHTML(side,label){return '<div class="card-picture" data-picture-side="'+side+'"><p class="card-picture-label">'+label+'</p><div class="card-picture-preview" data-picture-preview="'+side+'"></div><div class="card-picture-actions"><label class="secondary card-picture-add"><input type="file" accept="image/*" data-picture-input="'+side+'" hidden><span data-picture-add-label="'+side+'">Add picture</span></label><button type="button" class="text-button" data-picture-remove="'+side+'" hidden>Remove</button></div><p class="subtle card-picture-status" data-picture-status="'+side+'" role="status"></p></div>';}
const PICTURE_SIDE=1600,PICTURE_TARGET=1_200_000;
function canvasBlob(canvas,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('This picture could not be prepared.')),'image/jpeg',quality));}
async function decodePicture(file){
 if(typeof createImageBitmap==='function'){try{return await createImageBitmap(file);}catch{}}
 const url=URL.createObjectURL(file);try{return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('This file is not a picture the app can show.'));image.src=url;});}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
/** A chosen photo made smaller on this device (at most 1,600 pixels on its long side, JPEG) before it is saved. */
export async function shrinkPicture(file){
 if(!file||!/^image\//.test(file.type||'')&&!/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name||''))throw Error('Choose a photo or picture.');
 const picture=await decodePicture(file),width=picture.width,height=picture.height;if(!width||!height)throw Error('This file is not a picture the app can show.');
 const scale=Math.min(1,PICTURE_SIDE/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
 const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(picture,0,0,canvas.width,canvas.height);picture.close?.();
 let quality=0.85,blob=await canvasBlob(canvas,quality);while(blob.size>PICTURE_TARGET&&quality>0.45){quality-=0.15;blob=await canvasBlob(canvas,quality);}
 return blob;
}
/** Picture IDs named by card definitions, for backups. */
export function cardPictureIds(definitions){return [...new Set(definitions.flatMap(d=>[d?.card?.frontPicture,d?.card?.backPicture]).filter(id=>typeof id==='string'&&/^[0-9a-f]{64}$/.test(id)))];}
export function bytesToBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=0x8000)text+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(text);}
export function base64ToBytes(text){const raw=atob(text),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
/** A backup's pictures section, checked: each picture's bytes must hash to its name. Returns [{id,mime,bytes}]. */
export async function readBackupPictures(list){
 if(!Array.isArray(list)||list.length>5000)throw Error('This backup\'s pictures could not be read. Nothing was restored.');
 const out=[];
 for(const item of list){
  if(!item||typeof item!=='object'||Object.keys(item).sort().join()!=='data,id,mime'||!/^[0-9a-f]{64}$/.test(item.id)||!['image/jpeg','image/png','image/webp'].includes(item.mime)||typeof item.data!=='string')throw Error('This backup\'s pictures could not be read. Nothing was restored.');
  const bytes=base64ToBytes(item.data),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==item.id)throw Error('A picture in this backup was changed. Nothing was restored.');
  out.push({id:item.id,mime:item.mime,bytes});
 }
 return out;
}
/** Plain text plus chosen word positions become Anki-style blanks. Neighbouring hidden words form one blank. */
export function clozeFromWords(text,hidden,mode){
 const words=[...text.matchAll(WORD)];let out='',last=0,number=0,open=false;
 words.forEach((match,index)=>{
  const between=text.slice(last,match.index),hide=hidden.has(index);
  if(open&&!(hide&&/^\s+$/.test(between))){out+='}}';open=false;}
  out+=between;
  if(hide&&!open){number=mode==='each'?number+1:1;out+='{{c'+number+'::';open=true;}
  out+=match[0];last=match.index+match[0].length;
 });
 if(open)out+='}}';
 return out+text.slice(last);
}
/** After an edit, the tapped words that did not change stay tapped: words before the edit keep their place,
 * words after it move with it, and only words inside the edited part are let go. */
export function keepHiddenWords(before,after,hidden){
 let head=0;while(head<before.length&&head<after.length&&before[head]===after[head])head++;
 let tail=0;while(tail<before.length-head&&tail<after.length-head&&before[before.length-1-tail]===after[after.length-1-tail])tail++;
 const kept=new Set();for(const index of hidden){if(index<head)kept.add(index);else if(index>=before.length-tail)kept.add(index-before.length+after.length);}
 return kept;
}
/** `draft` ({storage,key}) keeps unsaved words if the form is left; it is browser-only and never progress. */
export function mountCardForm(root,draft=null,pictures=null){
 const $=selector=>root.querySelector(selector);
 const fields=$('#user-card-fields'),front=$('#user-card-front'),back=$('#user-card-back'),reverse=$('#user-card-reverse'),text=$('#user-card-text'),words=$('#user-card-words'),reference=$('#user-card-reference'),group=$('#user-card-group'),newGroup=$('#user-card-new-group');
 let hidden=new Set(),shownWords=wordsOf(text.value),chosen={front:null,back:null};
 if(pictures)$('#user-card-pictures').hidden=false;
 const type=()=>root.querySelector('[name="user-card-type"]:checked')?.value||'basic';
 const mode=()=>root.querySelector('[name="user-card-cloze-mode"]:checked')?.value||'together';
 const marked=()=>/\{\{c\d{1,2}::/.test(text.value);
 const groupName=()=>group.value===NEW_GROUP?newGroup.value:group.value;
 function chooseGroup(name){if([...group.options].some(o=>o.value===name&&o.value!==NEW_GROUP))group.value=name;else{group.value=NEW_GROUP;newGroup.value=name;}syncGroup();}
 function syncGroup(){const fresh=group.value===NEW_GROUP;newGroup.hidden=$('#user-card-new-group-label').hidden=!fresh;}
 function drawPreview(){
  const box=$('#user-card-preview');let cloze='';
  if(text.value.trim())cloze=marked()?text.value:hidden.size?clozeFromWords(text.value,hidden,mode()):'';
  const numbers=cloze?clozeNumbers(cloze):[];
  $('#user-card-cloze-mode').hidden=marked()||hidden.size<2;
  if(!numbers.length){box.innerHTML='';return;}
  box.innerHTML='<p class="preview-label">How it will look'+(numbers.length>1?' (the first of '+numbers.length+' cards)':'')+'</p>'+cardFaceHTML({card:{type:'cloze',text:cloze,blank:numbers[0]}});
 }
 function drawWords(){
  $('#user-card-basic').hidden=type()!=='basic';$('#user-card-cloze').hidden=type()!=='cloze';
  if(marked()){words.innerHTML='';$('#user-card-words-help').textContent='Using the {{c1::…}} blanks already in your text.';drawPreview();return;}
  $('#user-card-words-help').textContent=text.value.trim()?'Tap each word to hide. Tap it again to show it.':'Type your sentence above, then tap the words to hide.';
  words.innerHTML=shownWords.map((word,index)=>'<button type="button" class="cloze-word" data-word="'+index+'" aria-pressed="'+hidden.has(index)+'">'+esc(word)+'</button>').join('');
  words.querySelectorAll('[data-word]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.word);if(hidden.has(index))hidden.delete(index);else hidden.add(index);button.setAttribute('aria-pressed',String(hidden.has(index)));drawPreview();});
  drawPreview();
 }
 function pictureStatus(side,message,error=false){const box=$('[data-picture-status="'+side+'"]');box.textContent=message;box.className='subtle card-picture-status'+(error?' error':'');}
 async function showPicture(side){
  const id=chosen[side],box=$('[data-picture-preview="'+side+'"]');$('[data-picture-remove="'+side+'"]').hidden=!id;$('[data-picture-add-label="'+side+'"]').textContent=id?'Change picture':'Add picture';
  if(!id){box.innerHTML='';return;}
  try{if(pictures.draw){box.innerHTML='<canvas role="img" aria-label="Picture on the '+side+'"></canvas>';await pictures.draw(box.querySelector('canvas'),id);}else{const src=await pictures.url(id);if(chosen[side]===id)box.innerHTML='<img src="'+esc(src)+'" alt="Picture on the '+side+'">';}}catch(error){pictureStatus(side,error.message,true);}
 }
 async function addPicture(side,file){
  if(!pictures||!file)return;pictureStatus(side,'Adding the picture…');
  try{const blob=await shrinkPicture(file),saved=await pictures.save(blob);chosen[side]=saved.id;pictureStatus(side,'');await showPicture(side);save();}
  catch(error){pictureStatus(side,error.message||'The picture was not added. Try again.',true);}
 }
 for(const side of ['front','back']){
  $('[data-picture-input="'+side+'"]').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';void addPicture(side,file);});
  $('[data-picture-remove="'+side+'"]').addEventListener('click',()=>{chosen[side]=null;pictureStatus(side,'');void showPicture(side);save();});
 }
 // Pasting a picture into a box adds it to that side (front for a fill-in-the-blank sentence).
 for(const [field,side] of [[front,'front'],[back,'back'],[text,'front']])field.addEventListener('paste',event=>{const file=[...(event.clipboardData?.files||[])].find(f=>/^image\//.test(f.type));if(file&&pictures){event.preventDefault();void addPicture(side,file);}});
 function save(){if(!draft)return;try{const value={type:type(),front:front.value,back:back.value,reverse:reverse.checked,text:text.value,mode:mode(),hidden:[...hidden],reference:reference.value,group:groupName(),pictures:{...chosen}};if(value.front||value.back||value.text||value.reference||chosen.front||chosen.back)draft.storage.setItem(draft.key,JSON.stringify(value));else draft.storage.removeItem(draft.key);}catch{}}
 let restored=false;
 try{const value=draft&&JSON.parse(draft.storage.getItem(draft.key)||'null');if(value&&typeof value==='object'&&['basic','cloze'].includes(value.type)){root.querySelector('[name="user-card-type"][value="'+value.type+'"]').checked=true;front.value=String(value.front??'').slice(0,2000);back.value=String(value.back??'').slice(0,2000);reverse.checked=!!value.reverse;text.value=String(value.text??'').slice(0,4000);reference.value=String(value.reference??'').slice(0,200);chooseGroup(String(value.group||DEFAULT_CARD_GROUP).slice(0,80));root.querySelector('[name="user-card-cloze-mode"][value="'+(value.mode==='each'?'each':'together')+'"]').checked=true;shownWords=wordsOf(text.value);hidden=new Set((Array.isArray(value.hidden)?value.hidden:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<shownWords.length));if(pictures)for(const side of ['front','back']){const id=value.pictures?.[side];if(typeof id==='string'&&/^[0-9a-f]{64}$/.test(id)){chosen[side]=id;void showPicture(side);}}restored=true;}}catch{}
 text.oninput=()=>{const next=wordsOf(text.value);hidden=keepHiddenWords(shownWords,next,hidden);shownWords=next;drawWords();save();};
 for(const field of [front,back,reverse,reference,newGroup])field.addEventListener('input',save);
 group.addEventListener('change',()=>{syncGroup();if(group.value===NEW_GROUP)newGroup.focus();save();});
 root.querySelectorAll('[name="user-card-cloze-mode"]').forEach(input=>input.addEventListener('change',()=>{drawPreview();save();}));
 words.addEventListener('click',()=>queueMicrotask(save));
 root.querySelectorAll('[name="user-card-type"]').forEach(input=>input.onchange=()=>{drawWords();save();});
 syncGroup();drawWords();
 return {
  show(on){fields.hidden=!on;},
  /** True when unsaved words from earlier were put back. */
  get restored(){return restored;},
  discardDraft(){try{draft?.storage.removeItem(draft.key);}catch{}},
  /** A message next to the Save buttons, where the person is looking. */
  status(message,error=false){const box=root.querySelector('#user-card-status');if(!box)return;box.className=error?'error':'saved-note';box.setAttribute('role',error?'alert':'status');box.textContent=message;box.scrollIntoView?.({block:'nearest'});},
  /** Request card objects, tidied and checked with the same rules the server applies. */
  cards(){
   const name=groupName().trim();
   if(group.value===NEW_GROUP&&!name){newGroup.focus();throw Error('Type a name for the new group.');}
   const shared={reference:reference.value,group:name||DEFAULT_CARD_GROUP,tags:[],...(chosen.front?{frontPicture:chosen.front}:{}),...(chosen.back?{backPicture:chosen.back}:{})};
   if(type()==='basic'){
    if(!front.value.trim()&&!chosen.front){front.focus();throw Error('Type the question on the front, or add a picture.');}
    if(!back.value.trim()&&!chosen.back){back.focus();throw Error('Type the answer on the back, or add a picture.');}
    const base={type:'basic',front:front.value,back:back.value,...shared};const list=[{...base,side:'front'}];if(reverse.checked)list.push({...base,side:'back'});return list.map(card=>normalizeCardInput(tidyCardInput(card)));
   }
   if(!text.value.trim()){text.focus();throw Error('Type or paste your sentence first.');}
   if(!marked()&&!hidden.size)throw Error('Tap at least one word to hide.');
   const cloze=tidyCardInput({text:marked()?text.value:clozeFromWords(text.value,hidden,mode())}).text;
   if(hasNestedBlank(cloze))throw Error('A blank can’t hold another blank. Check the {{ }} marks in your text.');
   const numbers=clozeNumbers(cloze);if(!numbers.length)throw Error('Tap at least one word to hide.');
   return numbers.map(blank=>normalizeCardInput(tidyCardInput({type:'cloze',text:cloze,blank,...shared})));
  },
  /** Save and add another: clear the words, keep the type, group and reference style. */
  clear(){front.value='';back.value='';text.value='';reference.value='';hidden=new Set();shownWords=[];chosen={front:null,back:null};if(pictures){for(const side of ['front','back']){pictureStatus(side,'');void showPicture(side);}}if(group.value===NEW_GROUP&&newGroup.value.trim()){const name=newGroup.value.trim();if(![...group.options].some(o=>o.value===name)){const option=document.createElement('option');option.value=option.textContent=name;group.insertBefore(option,group.lastElementChild);}chooseGroup(name);}drawWords();save();(type()==='basic'?front:text).focus();},
 };
}
/** On a computer, Space shows the answer and 1 to 4 rate. Never while typing, and Space never takes over a
 * focused button or link, because Space already presses that one. */
export function cardKeys(event,{active,show,rate}){
 if(!active||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.target?.closest?.('input,textarea,select,summary,[contenteditable]'))return;
 if(event.key===' '){if(!show||event.target?.closest?.('button,a,[role="button"]'))return;event.preventDefault();show.click();}
 else if(/^[1-4]$/.test(event.key)){const button=rate(event.key);if(button){event.preventDefault();button.click();}}
}
/** Cards missed today, kept in this browser under `prefix:today`; earlier days are cleared when a new one is added. */
export function missedCardStore(storage,prefix,today){
 const key=prefix+':'+today;
 const list=()=>{try{const ids=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[];}catch{return [];}};
 return {list,
  add(id){try{for(let i=storage.length-1;i>=0;i--){const k=storage.key(i);if(k&&k.startsWith(prefix+':')&&k!==key)storage.removeItem(k);}const ids=list();if(!ids.includes(id))ids.push(id);storage.setItem(key,JSON.stringify(ids));}catch{}},
  remove(id){try{storage.setItem(key,JSON.stringify(list().filter(x=>x!==id)));}catch{}}};
}
/** One card face. Before Show answer only the asked side shows; blanks show as lines. */
/** Draws every card picture placeholder in `root` with `draw(canvas,id)`; used where pictures live in the browser. */
export async function drawCardPictures(root,draw){for(const canvas of root.querySelectorAll('canvas[data-card-picture]')){try{await draw(canvas,canvas.dataset.cardPicture);}catch{canvas.replaceWith(Object.assign(document.createElement('p'),{className:'subtle',textContent:'This picture is not in this browser.'}));}}}
export function cardFaceHTML(definition,{revealed=false,pictureUrl=null,drawPictures=false}={}){
 const card=definition.card,picture=id=>!id?'':drawPictures?'<canvas class="user-card-picture" data-card-picture="'+esc(id)+'" role="img" aria-label="Picture on the card"></canvas>':pictureUrl?'<img class="user-card-picture" src="'+esc(pictureUrl(id))+'" alt="Picture on the card">':'',reference=definition.bibleReference?'<p class="user-card-reference">'+esc(definition.bibleReference)+'</p>':'';
 if(card.type==='cloze'){
  const parts=clozeParts(card.text,card.blank);
  const body=parts.map(part=>!part.hidden?esc(part.text):revealed?'<mark class="user-card-filled">'+esc(part.text)+'</mark>':'<span class="user-card-blank" role="img" aria-label="'+esc(part.hint?'Blank, hint: '+part.hint:'Blank')+'">'+(part.hint?esc(part.hint):'')+'</span>').join('');
  return '<div class="user-card-face user-card-cloze">'+picture(card.frontPicture)+'<p class="user-card-text">'+body+'</p>'+(revealed?picture(card.backPicture)+reference:'')+'</div>';
 }
 const back=card.side==='back',asked=back?card.back:card.front,answer=back?card.front:card.back,askedPicture=back?card.backPicture:card.frontPicture,answerPicture=back?card.frontPicture:card.backPicture;
 return '<div class="user-card-face">'+picture(askedPicture)+(asked?'<p class="user-card-prompt">'+esc(asked)+'</p>':'')+(revealed?'<div class="user-card-answer">'+picture(answerPicture)+(answer?'<p>'+esc(answer)+'</p>':'')+reference+'</div>':'')+'</div>';
}
