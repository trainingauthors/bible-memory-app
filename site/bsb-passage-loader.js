/** PUBLIC, explicit user-selected BSB passages only. Never follows response URLs or private fallbacks. */
export const BSB_CHAPTER_ORIGIN='https://bible.helloao.org';
const maxResponseBytes=2*1024*1024;
export class BSBPassageError extends Error{constructor(status,message){super(message);this.name='BSBPassageError';this.status=status;}}
const fail=(status,message)=>{throw new BSBPassageError(status,message);};
function bookMap(books){
 if(!Array.isArray(books)||!books.length||books.length>66)fail(400,'Provide the approved Bible book bounds.');
 const map=new Map();
 for(const source of books){
  if(!source||typeof source!=='object'||Array.isArray(source)||typeof source.code!=='string'||!(/^[A-Z0-9]{3}$/).test(source.code)||map.has(source.code)||typeof source.name!=='string'||!source.name.length||source.name.length>100||!Number.isInteger(source.chapterCount)||source.chapterCount<1||source.chapterCount>150||!Array.isArray(source.verseCounts)||source.verseCounts.length!==source.chapterCount||source.verseCounts.some(n=>!Number.isInteger(n)||n<1||n>176))fail(400,'Invalid approved Bible book bounds.');
  map.set(source.code,{code:source.code,name:source.name,chapterCount:source.chapterCount,verseCounts:[...source.verseCounts]});
 }
 return map;
}
function selectionWithMap(selection,books){
 if(!selection||typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).some(k=>!['bookCode','chapter','startVerse','endVerse'].includes(k)))fail(400,'Choose one book, chapter, and verse range.');
 const {bookCode,chapter,startVerse,endVerse}=selection,book=books.get(bookCode);
 if(!book||!Number.isInteger(chapter)||chapter<1||chapter>book.chapterCount||!Number.isInteger(startVerse)||!Number.isInteger(endVerse)||startVerse<1||endVerse<startVerse||endVerse>book.verseCounts[chapter-1])fail(400,'Choose a verse range within the selected chapter.');
 return {bookCode,chapter,startVerse,endVerse};
}
/** Pure prevalidation. Metadata must be the injected approved book-bound array, never remote URLs. */
export function validateBSBSelection(selection,books){return selectionWithMap(selection,bookMap(books));}
function validateChapter(data,selection,expected){
 const {bookCode,chapter}=selection,ref=data?.thisChapterReference;
 if(!data||typeof data!=='object'||Array.isArray(data)||data.translation?.id!=='BSB'||data.book?.id!==bookCode||data.chapter?.number!==chapter||ref?.translationId!=='BSB'||ref?.book!==bookCode||ref?.chapter!==chapter||data.numberOfVerses!==expected||!Array.isArray(data.chapter?.content))fail(502,'The Scripture response did not match the selected BSB chapter.');
 const rows=data.chapter.content.filter(node=>node?.type==='verse');
 if(rows.length!==expected||rows.some((v,index)=>!Number.isInteger(v.number)||v.number!==index+1||typeof v.text!=='string'||!v.text.trim().length||v.text.length>10000))fail(502,'The Scripture response did not contain the complete exact verse sequence.');
 return rows;
}
/** One bounded request to a fixed public BSB endpoint; exact verse strings are preserved. */
export function createBSBPassageLoader({books,fetcher=globalThis.fetch,timeoutMs=12000}={}){
 const approved=bookMap(books);
 if(typeof fetcher!=='function')fail(503,'The public Scripture source cannot be loaded in this browser.');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)fail(400,'Invalid Scripture request timeout.');
 const validate=selection=>selectionWithMap(selection,approved);
 async function load(selection){
  const chosen=validate(selection),book=approved.get(chosen.bookCode),expected=book.verseCounts[chosen.chapter-1];
  const url=BSB_CHAPTER_ORIGIN+'/api/BSB/'+chosen.bookCode+'/'+chosen.chapter+'.simple.json';
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new BSBPassageError(504,'The public Scripture request timed out. Please try again.'));},timeoutMs);});
  try{
   const request=(async()=>{
    const response=await fetcher(url,{signal:controller.signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}});
    if(!response?.ok||response.redirected===true||response.url&&response.url!==url)fail(502,'The public Scripture source was unavailable or redirected.');
    let data;
    try{
     const text=await response.text();if(new TextEncoder().encode(text).byteLength>maxResponseBytes)fail(502,'The Scripture response was too large.');data=JSON.parse(text);
    }catch(error){if(error instanceof BSBPassageError)throw error;fail(502,'The public Scripture response was not valid JSON.');}
    const rows=validateChapter(data,chosen,expected),verses=rows.slice(chosen.startVerse-1,chosen.endVerse).map(({number,text})=>({number,text}));
    return {id:'bsb-'+chosen.bookCode.toLowerCase()+'-'+chosen.chapter+'-'+chosen.startVerse+'-'+chosen.endVerse,kind:'verse',...(chosen.endVerse>chosen.startVerse?{memoryGroup:'extended'}:{}),version:1,reference:book.name+' '+chosen.chapter+':'+chosen.startVerse+(chosen.endVerse===chosen.startVerse?'':'-'+chosen.endVerse),text:verses.map(v=>v.text).join(' '),verses,translation:'BSB'};
   })();
   return await Promise.race([request,timeout]);
  }catch(error){if(error instanceof BSBPassageError)throw error;fail(503,'The public Scripture source could not be reached. No other source was used.');}
  finally{clearTimeout(timer);}
 }
 load.validate=validate;
 load.chapterVerseCount=(bookCode,chapter)=>{const book=approved.get(bookCode);if(!book||!Number.isInteger(chapter)||chapter<1||chapter>book.chapterCount)fail(400,'Choose an approved Bible chapter.');return book.verseCounts[chapter-1];};
 load.bookName=bookCode=>{const book=approved.get(bookCode);if(!book)fail(400,'Choose an approved Bible book.');return book.name;};
 return load;
}
