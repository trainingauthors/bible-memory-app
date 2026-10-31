/** Pure common user-card identity. No storage, fetch, owner, grading or HTML. Fill-in-the-blank text uses Anki's {{c1::answer}} / {{c1::answer::hint}} form. */
function object(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Use a plain card object.');
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(descriptors).some(key=>typeof key!=='string'||!allowed.includes(key)||descriptors[key].get||descriptors[key].set))throw Error('Unsupported card fields.');
}
const text=(value,max,message,optional=false)=>{if(optional&&(value===undefined||value===''))return '';if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\0'))throw Error(message);return value;};
/** Every {{cN::answer}} or {{cN::answer::hint}} blank, left to right. A hand-written scan, so badly formed text
 * (an unclosed {{c1:: in a big file) stays fast. It finds exactly what the earlier pattern
 * /\{\{c(\d{1,2})::((?:(?!\}\}|::).)+?)(?:::((?:(?!\}\}).)*?))?\}\}/gs found, so every saved card checks out as before. */
function blanks(value){
 const found=[],memo={'}}':null,'::':null};
 // The next '}}' or '::' at or after `from`; remembered, because the answers being searched only move forward.
 const find=(token,from)=>{const m=memo[token];if(!m||from<m.from||m.at>=0&&m.at<from)memo[token]={from,at:value.indexOf(token,from)};return memo[token].at;};
 for(let i=value.indexOf('{{c');i>=0;){
  let j=i+3;while(j<i+5&&value.charCodeAt(j)>=48&&value.charCodeAt(j)<=57)j++;
  let blank=null;
  if(j>i+3&&value.startsWith('::',j)){
   const start=j+2,close=find('}}',start),split=find('::',start),stop=split>=0&&(close<0||split<close)?split:close;
   if(stop>start){
    if(stop===close)blank={answer:value.slice(start,close),end:close+2};
    else{const after=find('}}',split+2);if(after>=0)blank={answer:value.slice(start,split),hint:value.slice(split+2,after),end:after+2};}
   }
  }
  if(blank){found.push({index:i,number:Number(value.slice(i+3,j)),...blank});i=value.indexOf('{{c',blank.end);}
  else i=value.indexOf('{{c',i+1);
 }
 return found;
}
/** Text split into plain runs and blanks; blanks whose number is `blank` are hidden, others read as plain text. */
export function clozeParts(value,blank){
 const parts=[];let last=0;
 for(const b of blanks(value)){
  if(b.index>last)parts.push({text:value.slice(last,b.index)});
  parts.push(b.number===blank?{text:b.answer,hidden:true,...(b.hint?{hint:b.hint}:{})}:{text:b.answer});
  last=b.end;
 }
 if(last<value.length)parts.push({text:value.slice(last)});
 return parts;
}
export function clozeNumbers(value){return [...new Set(blanks(value).map(b=>b.number))].sort((a,b)=>a-b);}
function withoutBlanks(value){let out='',last=0;for(const b of blanks(value)){out+=value.slice(last,b.index);last=b.end;}return out+value.slice(last);}
/** A blank holding another blank's {{ cannot be shown correctly, so the forms and imports refuse it. */
export function hasNestedBlank(value){return blanks(value).some(b=>(b.answer+(b.hint??'')).includes('{{'));}
/** The sentence with every blank's answer in [brackets], for previews. */
export function clozeBracketed(value){let out='',last=0;for(const b of blanks(value)){out+=value.slice(last,b.index)+'['+b.answer+']';last=b.end;}return out+value.slice(last);}
const CONTROL=/[\u0000-\u0008\u000b-\u001f\u007f]/g;
/** What a person typed, tidied before it becomes a card: no spaces at either end and no invisible control characters,
 * so "David" and "David " are one card. Saved cards are checked exactly as they were saved; this never changes one. */
export function tidyCardInput(value){const out={...value};for(const key of ['front','back','text','reference','group'])if(typeof out[key]==='string')out[key]=out[key].replace(CONTROL,'').trim();return out;}
export function normalizeCardInput(value){
 object(value,['type','front','back','side','text','blank','reference','group','tags','frontPicture','backPicture']);
 const out={type:value.type};
 // A picture is named by the SHA-256 of its stored bytes; a side with a picture may leave its words empty.
 for(const key of ['frontPicture','backPicture'])if(Object.hasOwn(value,key)&&(typeof value[key]!=='string'||!/^[0-9a-f]{64}$/.test(value[key])))throw Error('Choose the picture again.');
 if(value.type==='basic'){
  out.front=text(value.front,2000,'Enter the front of the card (up to 2,000 characters).',!!value.frontPicture);
  out.back=text(value.back,2000,'Enter the back of the card (up to 2,000 characters).',!!value.backPicture);
  out.side=value.side??'front';if(!['front','back'].includes(out.side))throw Error('Choose which side is asked first.');
  if(Object.hasOwn(value,'text')||Object.hasOwn(value,'blank'))throw Error('Front-and-back cards do not use blanks.');
 }else if(value.type==='cloze'){
  out.text=text(value.text,4000,'Enter the sentence or verse (up to 4,000 characters).');
  const numbers=clozeNumbers(out.text);
  if(!numbers.length||numbers.some(n=>n<1||n>50))throw Error('Hide at least one word.');
  if(/\{\{|\}\}/.test(withoutBlanks(out.text)))throw Error('Remove the stray {{ or }} from the text.');
  if(!Number.isInteger(value.blank)||!numbers.includes(value.blank))throw Error('Choose which blank this card asks.');
  out.blank=value.blank;
  if(Object.hasOwn(value,'front')||Object.hasOwn(value,'back')||Object.hasOwn(value,'side'))throw Error('Fill-in-the-blank cards use one text.');
 }else throw Error('Choose Front and back or Fill in the blank.');
 out.reference=text(value.reference,200,'Keep the Bible reference under 200 characters.',true);
 out.group=text(value.group??'My cards',80,'Name the group (up to 80 characters).').trim();
 const tags=value.tags??[];
 if(!Array.isArray(tags)||tags.length>20||tags.some(tag=>typeof tag!=='string'||!/^[^\s\0]{1,40}$/u.test(tag)))throw Error('Use up to 20 tags without spaces.');
 out.tags=[...new Set(tags)].sort();
 if(value.frontPicture)out.frontPicture=value.frontPicture;
 if(value.backPicture)out.backPicture=value.backPicture;
 return out;
}
/** Short Library title. It is the side asked first, never the answer. */
export function cardTitle(value){
 const input=normalizeCardInput(value);
 const raw=input.type==='basic'?(input.side==='front'?input.front:input.back):clozeParts(input.text,input.blank).map(part=>part.hidden?'___':part.text).join('');
 const line=raw.replace(/\s+/g,' ').trim()||'Picture card';
 return line.length>120?line.slice(0,119).trimEnd()+'…':line;
}
const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotate=(value,bits)=>(value>>>bits)|(value<<(32-bits));
function sha256(input){
 const data=new TextEncoder().encode(input),size=Math.ceil((data.length+9)/64)*64,bytes=new Uint8Array(size);bytes.set(data);bytes[data.length]=0x80;
 const view=new DataView(bytes.buffer);view.setUint32(size-8,Math.floor(data.length/0x20000000),false);view.setUint32(size-4,data.length*8>>>0,false);
 const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64);
 for(let offset=0;offset<size;offset+=64){
  for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4,false);
  for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2],s0=rotate(a,7)^rotate(a,18)^(a>>>3),s1=rotate(b,17)^rotate(b,19)^(b>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}
  let [a,b,c,d,e,f,g,j]=h;
  for(let i=0;i<64;i++){const s1=rotate(e,6)^rotate(e,11)^rotate(e,25),choice=(e&f)^(~e&g),t1=(j+s1+choice+K[i]+w[i])>>>0,s0=rotate(a,2)^rotate(a,13)^rotate(a,22),majority=(a&b)^(a&c)^(b&c),t2=(s0+majority)>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
  for(const [i,value] of [a,b,c,d,e,f,g,j].entries())h[i]=(h[i]+value)>>>0;
 }
 return Array.from(h,value=>value.toString(16).padStart(8,'0')).join('');
}
// Pictures join the identity only when a card has one, so every earlier card keeps its ID.
export function cardDigest(value){const c=normalizeCardInput(value),parts=c.type==='basic'?['basic',c.front,c.back,c.side,c.reference,c.group,c.tags]:['cloze',c.text,c.blank,c.reference,c.group,c.tags];if(c.frontPicture||c.backPicture)parts.push(['pictures',c.frontPicture??'',c.backPicture??'']);return sha256(JSON.stringify(parts));}
