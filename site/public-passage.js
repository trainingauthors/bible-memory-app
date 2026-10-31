// Reads only supplied approved story coordinates through the fixed, bounded BSB loader.
export async function loadPublicStoryPassage(definition,loader){
 const fail=message=>{const e=new Error(message);e.status=502;throw e;};
 if(definition?.kind!=='story'||!Array.isArray(definition.segments)||typeof loader!=='function'||typeof loader.chapterVerseCount!=='function'||typeof loader.bookName!=='function')fail('Approved public story passage loading is unavailable.');
 const chapters=new Map(),ranges=[];
 for(const s of definition.segments){
  if(!Number.isInteger(s.startChapter)||!Number.isInteger(s.endChapter)||s.endChapter<s.startChapter)fail('Invalid approved story boundaries.');
  for(let chapter=s.startChapter;chapter<=s.endChapter;chapter++){
   if(ranges.length>=20)fail('The approved story exceeds the bounded passage limit.');
   const count=loader.chapterVerseCount(s.bookCode,chapter),startVerse=chapter===s.startChapter?s.startVerse:1,endVerse=chapter===s.endChapter&&s.endVerse!==null?s.endVerse:count;
   loader.validate({bookCode:s.bookCode,chapter,startVerse,endVerse});ranges.push({bookCode:s.bookCode,chapter,startVerse,endVerse});
   const key=s.bookCode+':'+chapter;if(!chapters.has(key))chapters.set(key,{bookCode:s.bookCode,chapter,startVerse:1,endVerse:count});
  }
 }
 const loaded=new Map();for(const [key,selection] of chapters)loaded.set(key,await loader(selection));
 const verses=[],seen=new Set();for(const r of ranges)for(const v of loaded.get(r.bookCode+':'+r.chapter).verses){
  if(v.number<r.startVerse||v.number>r.endVerse)continue;const key=r.bookCode+':'+r.chapter+':'+v.number;if(seen.has(key))continue;seen.add(key);verses.push({book:loader.bookName(r.bookCode),chapter:r.chapter,verse:v.number,text:v.text});
 }
 if(!verses.length)fail('The approved public story passage was empty.');
 return {reference:definition.passageReference??definition.reference,translation:'BSB',verses};
}
