/** Anki "Notes in Plain Text" and spreadsheet (CSV) files into card inputs, the same in both apps.
 * Reads only the file the person chooses, on their device. No storage, network, identity or scheduling. */
import {normalizeCardInput,clozeNumbers,clozeBracketed,hasNestedBlank,tidyCardInput} from './card-model.js';
export const MAX_IMPORT_CHARS=5_000_000;
const SEPARATORS={tab:'\t',comma:',',semicolon:';',pipe:'|',space:' ',colon:':'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plural=(n,one,many=one+'s')=>n.toLocaleString('en-US')+' '+(n===1?one:many);
/** Rows of fields. A quote mark starts a quoted field only as a field's first character, as spreadsheets write it;
 * anywhere else it is an ordinary character. A quoted field that never closes is reported by line, never guessed at. */
function records(text,separator,firstLine){
 const rows=[];let row=[],field='',quoted=false,wasQuoted=false,line=firstLine,quoteLine=0;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='\n')line++;
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=ch;continue;}
  if(ch==='"'&&field===''&&!wasQuoted){quoted=wasQuoted=true;quoteLine=line;continue;}
  if(ch===separator){row.push(field);field='';wasQuoted=false;continue;}
  if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';wasQuoted=false;continue;}
  field+=ch;
 }
 if(quoted)throw Error('A quote mark (") on line '+quoteLine+' is never closed, so the lines after it can’t be read. Fix that line, or open the file in a spreadsheet and save it again as CSV.');
 if(field!==''||row.length){row.push(field);rows.push(row);}
 return rows.filter(r=>r.some(f=>f.trim()!==''));
}
const ENTITIES={nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
function entity(all,code){
 if(code[0]!=='#'){const name=code.toLowerCase();return Object.hasOwn(ENTITIES,name)?ENTITIES[name]:all;}
 const n=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):Number(code.slice(1));
 return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'�';
}
/** One Anki field as plain text. Pictures and sounds are counted and left out; no HTML is kept.
 * Only real tags are removed ("<b>", "</div>"), so "5 < 6 and 7 > 3" keeps its words. */
export function ankiFieldText(value,html){
 let pictures=0,sounds=0,text=String(value??'').replace(/\[sound:[^\]]*\]/g,()=>{sounds++;return '';});
 if(html)text=text.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi,'').replace(/<img\b[^>]*>/gi,()=>{pictures++;return '';})
  .replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:div|p|li|h[1-6])\s*>/gi,'\n').replace(/<\/?[a-z][^<>]*>/gi,'')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,entity);
 text=text.replace(/ /g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 return {text,pictures,sounds};
}
/** A plain-language reason this file is not a card list, from its name and first bytes; null when it may be one. */
export function fileProblem(name,bytes){
 const ext=(/\.([a-z0-9]+)$/i.exec(name||'')?.[1]||'').toLowerCase(),b=bytes instanceof Uint8Array?bytes:new Uint8Array(0);
 const zip=b[0]===0x50&&b[1]===0x4b,office=b[0]===0xd0&&b[1]===0xcf&&b[2]===0x11&&b[3]===0xe0,pdf=b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46;
 if(['apkg','colpkg','anki2','anki21'].includes(ext))return {kind:'anki',message:'This is an Anki deck package (.'+ext+'). This app can’t open those yet. In Anki on a computer, export the deck as Notes in Plain Text instead (the steps are above), then choose that file here.'};
 if(['xlsx','xls','numbers','ods'].includes(ext)||(office&&ext!=='txt'&&ext!=='csv'))return {kind:'spreadsheet',message:'This is a spreadsheet file. Save it as CSV first: in Excel choose File → Save As → CSV; in Google Sheets choose File → Download → CSV; in Numbers choose File → Export To → CSV. Then choose the CSV file here.'};
 if(pdf||['pdf','doc','docx','pages','rtf'].includes(ext))return {kind:'document',message:'This looks like a document, not a list of cards. Choose a .txt file exported from Anki, or a .csv file saved from a spreadsheet.'};
 if(zip)return {kind:'zip',message:'This is a compressed file. If it came from Anki, export the deck as Notes in Plain Text instead (the steps are above). If it is a spreadsheet, save it as CSV first.'};
 if(b.subarray(0,4096).includes(0))return {kind:'binary',message:'This file isn’t plain text. Choose a .txt file exported from Anki, or a .csv file saved from a spreadsheet.'};
 return null;
}
export function parseCardFile(input,{fileName=''}={}){
 if(typeof input!=='string')throw Error('Choose a text or CSV file.');
 if(input.length>MAX_IMPORT_CHARS)throw Error('This file is larger than 5 MB. Split it into smaller files.');
 if(input.slice(0,4096).includes('\0'))throw Error('This file isn’t plain text. Choose a .txt file exported from Anki, or a .csv file saved from a spreadsheet.');
 const text=input.replace(/^﻿/,'').replace(/\r\n?/g,'\n'),lines=text.split('\n'),headers={};let start=0;
 while(start<lines.length){const m=/^#([a-z ]+):(.*)$/i.exec(lines[start]);if(!m)break;headers[m[1].trim().toLowerCase()]=m[2].trim();start++;}
 const body=lines.slice(start).join('\n'),first=body.split('\n').find(line=>line.trim())||'';
 const named=headers.separator?.toLowerCase(),separator=named?SEPARATORS[named]??(headers.separator.length===1?headers.separator:null):first.includes('\t')?'\t':(first.split(';').length>first.split(',').length?';':',');
 if(!separator)throw Error('This file’s separator is not supported.');
 const rows=records(body,separator,start+1);
 // A spreadsheet's own heading row (Front, Back, Question, Answer…) names the columns instead of becoming a card.
 let headingRow=null;if(!headers.columns&&rows.length>1&&rows[0].filter(f=>f.trim()).length>=2&&rows[0].every(f=>!f.trim()||/^(?:front|back|question|answer|term|definition|prompt|response|reference|verse|text|extra|notes?|tags?|deck|side ?[12])$/i.test(f.trim())))headingRow=rows.shift();
 if(!rows.length)throw Error('No cards were found in this file.');
 if(rows.length>5000)throw Error('This file has more than 5,000 rows. Split it into smaller files.');
 const meta={};for(const key of ['notetype','deck','tags','guid']){const n=Number(headers[key+' column']);if(Number.isInteger(n)&&n>=1)meta[key]=n-1;}
 const width=Math.max(...rows.map(r=>r.length)),named2=headers.columns?headers.columns.split(separator):headingRow??[];
 const html=headers.html?headers.html.toLowerCase()==='true':rows.slice(0,50).some(r=>r.some(f=>/<(?:br|div|p|img|b|i|span)\b/i.test(f)));
 const fieldColumns=Array.from({length:width},(_,i)=>i).filter(i=>!Object.values(meta).includes(i));
 const columns=fieldColumns.map((index,n)=>({index,name:(named2[index]||'Column '+(n+1)).trim(),sample:ankiFieldText(rows.find(r=>r[index]?.trim())?.[index]??'',html).text.slice(0,60)}));
 return {fileName,html,meta,columns,rows,fileTags:(headers.tags||'').split(/\s+/).filter(Boolean)};
}
const groupName=value=>value.split('::').map(part=>part.trim()).filter(Boolean).join(' › ').slice(0,80).trim();
export function defaultGroupName(parsed){return (parsed.fileName.replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ').trim()||'Imported cards').slice(0,80);}
/** Card inputs for the chosen columns. Fill-in-the-blank notes become one card per blank number, as in Anki. */
export function cardsFromImport(parsed,{front=parsed.columns[0]?.index,back=parsed.columns[1]?.index,group,deckGroups=true}={}){
 const out=[],seen=new Set(),skipped={empty:0,invalid:0,duplicate:0};let pictures=0,sounds=0;const fallback=(group||defaultGroupName(parsed)).trim().slice(0,80)||'Imported cards';
 for(const row of parsed.rows){
  const noteType=parsed.meta.notetype!==undefined?row[parsed.meta.notetype]||'':'',deck=parsed.meta.deck!==undefined?row[parsed.meta.deck]||'':'';
  const name=deckGroups&&deck?groupName(deck)||fallback:fallback;
  const tags=[...new Set([...parsed.fileTags,...(parsed.meta.tags!==undefined?(row[parsed.meta.tags]||'').split(/\s+/):[])].filter(tag=>/^[^\s\0]{1,40}$/u.test(tag)))].slice(0,20);
  const f=ankiFieldText(row[front],parsed.html),b=ankiFieldText(row[back],parsed.html);pictures+=f.pictures+b.pictures;sounds+=f.sounds+b.sounds;
  if(f.text.length>4000||b.text.length>4000){skipped.invalid++;continue;}
  const blanks=clozeNumbers(f.text),inputs=[];
  if(/cloze/i.test(noteType)||blanks.length){if(!blanks.length||hasNestedBlank(f.text)){skipped.invalid++;continue;}for(const blank of blanks)inputs.push({type:'cloze',text:f.text,blank,reference:'',group:name,tags});}
  else{if(!f.text||!b.text){skipped.empty++;continue;}inputs.push({type:'basic',front:f.text,back:b.text,side:'front',reference:'',group:name,tags});if(/reverse/i.test(noteType)&&!/optional/i.test(noteType))inputs.push({type:'basic',front:f.text,back:b.text,side:'back',reference:'',group:name,tags});}
  for(const input of inputs){let card;try{card=normalizeCardInput(tidyCardInput(input));}catch{skipped.invalid++;continue;}const key=JSON.stringify(card);if(seen.has(key)){skipped.duplicate++;continue;}seen.add(key);out.push(card);}
 }
 return {cards:out,skipped,pictures,sounds,groups:[...new Set(out.map(c=>c.group))]};
}
/** Splits saved-card requests into batches of at most `count` items and `bytes` of sent JSON (real UTF-8 bytes, so
 * words in Hebrew, Greek or Chinese are measured truly), keeping their order. */
export function importBatches(items,{count,bytes}){
 const batches=[],encoder=new TextEncoder();let size=0;
 for(const item of items){const length=encoder.encode(JSON.stringify(item)).length+1,last=batches.at(-1);if(!last||last.length>=count||size+length>bytes){batches.push([item]);size=length+64;}else{last.push(item);size+=length;}}
 return batches;
}
/** Daily pace plans live in this browser only. Which cards are still waiting comes from the saved Library. */
export function readPacePlans(storage,key){try{const plans=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(plans)?plans.filter(p=>p&&typeof p.group==='string'&&Number.isInteger(p.perDay)&&p.perDay>=1&&p.perDay<=50):[];}catch{return [];}}
export function writePacePlans(storage,key,plans){try{storage.setItem(key,JSON.stringify(plans));}catch{}}
/** The next new cards of a deck you have started are offered once the last ones have been reviewed.
 * This comes from the saved Library, so it shows on every device; a plan only remembers how many a day
 * and keeps one device from offering the same deck twice in a day (Not today counts as that day's offer). */
export const DEFAULT_PER_DAY=5;
export function paceDue(cards,plans,today){
 const groups=[...new Set(cards.filter(c=>c.kind==='card').map(c=>c.cardGroup||''))];
 return groups.map(group=>{const mine=cards.filter(c=>c.kind==='card'&&(c.cardGroup||'')===group),plan=plans.find(p=>p.group===group);
  return {group,perDay:plan?.perDay??DEFAULT_PER_DAY,lastDay:plan?.lastDay,waiting:mine.filter(c=>c.studyStatus==='later'&&!c.hasReviews),started:mine.some(c=>c.studyStatus==='active'||c.hasReviews),unseen:mine.some(c=>c.studyStatus==='active'&&!c.hasReviews)};})
  .filter(p=>p.waiting.length&&p.started&&!p.unseen&&p.lastDay!==today);
}
export function rememberPace(storage,key,group,patch){const plans=readPacePlans(storage,key),plan=plans.find(p=>p.group===group);if(plan)Object.assign(plan,patch);else plans.push({group,perDay:DEFAULT_PER_DAY,...patch});writePacePlans(storage,key,plans);}
export function paceRowsHTML(due){return due.map((plan,index)=>{const n=Math.min(plan.perDay,plan.waiting.length);return '<div class="pace-offer"><button class="due-row pace-row" data-pace="'+index+'"><span><strong>'+esc(plan.group)+': start '+plural(n,'new card')+'</strong><small>'+plural(plan.waiting.length,'card')+' still waiting. More are offered after you review these.</small></span><span class="row-action">Start →</span></button><button type="button" class="text-button pace-skip" data-pace-skip="'+index+'">Not today</button></div>';}).join('');}
/** Wires Start and Not today on rows from paceRowsHTML. Not today only hides the offer on this device until tomorrow. */
export function bindPaceRows(root,{due,start,skip}){
 root.querySelectorAll?.('[data-pace]').forEach(button=>button.onclick=()=>{const plan=due()[Number(button.dataset.pace)];if(plan)start(plan.group);});
 root.querySelectorAll?.('[data-pace-skip]').forEach(button=>button.onclick=()=>{const plan=due()[Number(button.dataset.paceSkip)];if(plan)skip(plan.group);});
}
const STEPS='<details class="import-steps"><summary>How to get your cards out of Anki</summary><p>Do this in Anki on a computer (Windows, Mac or Linux):</p><ol><li>Choose <b>File → Export</b>.</li><li>Next to <b>Export format</b>, choose <b>Notes in Plain Text</b>.</li><li>Tick <b>Include deck name</b>, <b>Include notetype name</b> and <b>Include tags</b>. These keep your decks as groups, and bring cards that quiz both ways across both ways.</li><li>Click <b>Export</b>, then choose that file below.</li></ol><p class="subtle">Pictures and sounds stay behind for now; the words come across.</p></details>'
 +'<details class="import-steps"><summary>How to use a spreadsheet</summary><ol><li>Put each question in column A and its answer in column B, one card per row.</li><li>Save or download it as <b>CSV</b>.</li><li>Choose that file below.</li></ol></details>';
/** The Import cards screen. `onImport({cards,mode,perDay,groups,progress})` saves and returns {added, existing};
 * nothing is saved before Import. `pending` ({count, retry, abandon}) offers to finish an interrupted import first. */
export function mountCardImport(root,{onImport,capacity=Infinity,pending=null}){
 let parsed=null,swap=false;
 root.innerHTML='<div id="card-import-pending"></div><p>Bring in cards from Anki, or from a spreadsheet with the question in one column and the answer in the next.</p>'+STEPS+'<label for="card-import-file">Choose your file (.txt or .csv)</label><input class="file-input" type="file" id="card-import-file" accept=".txt,.csv,.tsv,text/plain,text/csv"><div id="card-import-preview"></div>';
 const preview=root.querySelector('#card-import-preview'),fileInput=root.querySelector('#card-import-file');
 const showError=message=>{preview.innerHTML='<p class="error" role="alert">'+esc(message)+'</p>';preview.scrollIntoView?.({block:'nearest'});};
 const done=(value,mode,perDay)=>'<div class="import-done" role="status"><strong>'+plural(value.added,'card')+' added</strong>'+(value.existing?'<span>'+plural(value.existing,'card was','cards were')+' already in your Library and stayed as '+(value.existing===1?'it was':'they were')+'.</span>':'')+(mode?'<span>'+esc(mode==='pace'?'The first '+perDay+' start today. More are offered on Review after you have reviewed them.':mode==='all'?'They are ready to review today.':'They wait in Memorize Later until you start them.')+'</span>':'')+'</div>';
 function drawPending(){
  const box=root.querySelector('#card-import-pending');
  if(!pending){box.innerHTML='';fileInput.disabled=false;return;}
  fileInput.disabled=true;
  box.innerHTML='<section class="import-interrupted" role="alert"><h3>Finish your last import first</h3><p>'+plural(pending.count,'card')+' from your last import may not have saved. Tap Finish to check and save them. Nothing is added twice.</p><button type="button" class="primary full" id="card-import-retry">Finish the last import</button><button type="button" class="text-button" id="card-import-abandon">Stop trying</button><p id="card-import-pending-status" role="status"></p></section>';
  box.querySelector('#card-import-retry').onclick=async()=>{const button=box.querySelector('#card-import-retry');button.disabled=true;box.querySelector('#card-import-pending-status').textContent='Checking…';
   try{const value=await pending.retry();pending=null;drawPending();preview.innerHTML=done(value,'later')+'<p class="subtle">If the file had more cards, choose it again: cards you already have are skipped.</p>';}
   catch(error){button.disabled=false;box.querySelector('#card-import-pending-status').textContent=error.message;}};
  box.querySelector('#card-import-abandon').onclick=()=>{if(!confirm('Those cards may already be saved. Stop trying and check your Library instead?'))return;try{pending.abandon();pending=null;drawPending();}catch(error){box.querySelector('#card-import-pending-status').textContent=error.message;}};
 }
 function draw(){
  if(!parsed){preview.innerHTML='';return;}
  const pick=id=>Number(root.querySelector(id)?.value),frontIndex=root.querySelector('#card-import-front')?pick('#card-import-front'):parsed.columns[0]?.index,backIndex=root.querySelector('#card-import-back')?pick('#card-import-back'):parsed.columns[1]?.index;
  const groupInput=root.querySelector('#card-import-group')?.value??defaultGroupName(parsed),deckGroups=root.querySelector('#card-import-decks')?.checked??true;
  const perDay=Number(root.querySelector('#card-import-per-day')?.value||DEFAULT_PER_DAY),mode=root.querySelector('[name="card-import-start"]:checked')?.value||'pace';
  const result=cardsFromImport(parsed,{front:swap?backIndex:frontIndex,back:swap?frontIndex:backIndex,group:groupInput,deckGroups});
  const option=(selected)=>parsed.columns.map(c=>'<option value="'+c.index+'"'+(c.index===selected?' selected':'')+'>'+esc(c.name+(c.sample?' · '+c.sample:''))+'</option>').join('');
  const left=[result.skipped.empty&&plural(result.skipped.empty,'row')+' with an empty side',result.skipped.invalid&&plural(result.skipped.invalid,'row')+' too long or with a broken blank',result.skipped.duplicate&&plural(result.skipped.duplicate,'repeat')].filter(Boolean);
  const media=[result.pictures&&plural(result.pictures,'picture'),result.sounds&&plural(result.sounds,'sound')].filter(Boolean);
  const oneColumn=parsed.columns.length<2&&!result.cards.length,full=result.cards.length>capacity;
  preview.innerHTML='<h3>'+esc(parsed.fileName||'Your file')+'</h3><p><strong>'+plural(parsed.rows.length,'row')+' found. '+(result.cards.length?'They make '+plural(result.cards.length,'card')+(result.groups.length>1?' in '+result.groups.length+' groups':'')+'.':'No cards can be made yet.')+'</strong></p>'
   +(oneColumn?'<p class="error" role="alert">Each row needs two columns: the question and the answer. This file has only one column. Put the answers in the next column, save it as CSV again, and choose it here.</p>':'')
   +(left.length?'<p class="subtle">Left out: '+esc(left.join(', '))+'.</p>':'')+(media.length?'<p class="subtle">'+esc(media.join(' and '))+' left out. The words come across; pictures and sounds come in a later update.</p>':'')
   +(parsed.columns.length>1?'<div class="import-fields"><label>Question side (front)<select id="card-import-front">'+option(frontIndex)+'</select></label><label>Answer side (back)<select id="card-import-back">'+option(backIndex)+'</select></label><button type="button" class="secondary" id="card-import-swap">Swap sides</button></div>':'')
   +(result.cards.length?'<p class="subtle">How the first cards will look:</p><div class="import-preview">'+result.cards.slice(0,3).map(c=>'<div><span>'+esc(c.type==='cloze'?'Fill in the blank':(c.side==='back'?c.back:c.front))+'</span><span>'+esc(c.type==='cloze'?clozeBracketed(c.text):(c.side==='back'?c.front:c.back))+'</span></div>').join('')+'</div>':'')
   +(parsed.meta.deck!==undefined?'<label class="check"><input type="checkbox" id="card-import-decks"'+(deckGroups?' checked':'')+'> Use the Anki deck names as groups</label>':'')
   +'<label for="card-import-group">'+(parsed.meta.deck!==undefined?'Group for cards without a deck':'Group name for these cards')+'</label><input id="card-import-group" maxlength="80" value="'+esc(groupInput)+'">'
   +'<fieldset class="import-start"><legend>When should the new cards start?</legend><label><input type="radio" name="card-import-start" value="pace"'+(mode==='pace'?' checked':'')+'> A few each day (recommended)</label><label class="import-per-day">New cards each day <select id="card-import-per-day">'+[1,2,3,5,10,15,20].map(n=>'<option value="'+n+'"'+(n===perDay?' selected':'')+'>'+n+'</option>').join('')+'</select></label><label><input type="radio" name="card-import-start" value="all"'+(mode==='all'?' checked':'')+'> All of them today</label><label><input type="radio" name="card-import-start" value="later"'+(mode==='later'?' checked':'')+'> Not yet: wait in Memorize Later</label></fieldset>'
   +(full?'<p class="error" role="alert">Your Library has room for '+plural(Math.max(0,capacity),'more item')+'. Split the file, or untick some decks, and import fewer cards.</p>':'')
   +'<button type="button" class="primary full" id="card-import-go"'+(!result.cards.length||full?' disabled':'')+'>Import '+plural(result.cards.length,'card')+'</button><p id="card-import-status" role="status" class="subtle">Nothing is added until you tap Import. Cards you already have are left as they are.</p>';
  for(const id of ['#card-import-front','#card-import-back','#card-import-decks'])root.querySelector(id)?.addEventListener('change',draw);
  root.querySelector('#card-import-group').onchange=draw;
  root.querySelector('#card-import-per-day').onchange=()=>{root.querySelector('[name="card-import-start"][value="pace"]').checked=true;};
  root.querySelector('#card-import-swap')?.addEventListener('click',()=>{swap=!swap;draw();});
  root.querySelector('#card-import-go').onclick=async()=>{const button=root.querySelector('#card-import-go'),status=root.querySelector('#card-import-status');button.disabled=true;const mode=root.querySelector('[name="card-import-start"]:checked').value,perDay=Number(root.querySelector('#card-import-per-day').value);
   const progress=text=>{status.className='subtle';status.textContent=text;};progress('Importing…');
   try{const value=await onImport({cards:result.cards,mode,perDay,groups:result.groups,progress});preview.innerHTML=done(value,mode,perDay);parsed=null;fileInput.value='';}
   catch(error){button.disabled=false;status.className='error';status.setAttribute('role','alert');status.textContent=error.message;status.scrollIntoView?.({block:'nearest'});}};
 }
 fileInput.onchange=async event=>{const file=event.target.files?.[0];swap=false;parsed=null;preview.innerHTML='';if(!file)return;
  try{
   const problem=fileProblem(file.name,new Uint8Array(await file.slice(0,4096).arrayBuffer()));
   if(problem){if(['anki','zip'].includes(problem.kind))root.querySelector('.import-steps').open=true;throw Error(problem.message);}
   if(file.size>MAX_IMPORT_CHARS*4)throw Error('This file is larger than 5 MB. Split it into smaller files.');
   parsed=parseCardFile(await file.text(),{fileName:file.name});draw();
  }catch(error){showError(error.message);}};
 drawPending();
}
