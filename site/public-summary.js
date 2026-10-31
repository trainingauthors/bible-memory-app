/** Visitor-authored words are never a Bible translation or generated commentary. */
import {normalizeSummaryInput,summaryDigest} from './summary-model.js';
import {parseSelectedPublicId,selectedPublicId} from './public-selected-item.js';
const clone=value=>JSON.parse(JSON.stringify(value));
function keys(value,allowed,required=allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))throw Error('Invalid summary definition fields.');}
export const isPublicSummary=item=>item?.kind==='chapter'&&item?.provenance==='user-summary-v1';
export const publicSummaryId=input=>'summary-'+summaryDigest(input);
export function publicSummaryInput(body){return normalizeSummaryInput({reference:body.reference,summary:body.summary,...(Object.hasOwn(body,'source')?{source:body.source}:{})});}
export function publicSummarySource(item){const value=item?.sourcePassage?parseSelectedPublicId(item.sourcePassage.id):null;return value?{bookCode:value.bookCode,chapter:value.chapter,startVerse:value.startVerse,endVerse:value.endVerse}:null;}
function exactSource(source,selection){
 keys(source,['id','kind','version','reference','text','verses','translation','memoryGroup'],['id','kind','version','reference','text','verses','translation']);
 if(source.id!==selectedPublicId(selection)||source.kind!=='verse'||source.version!==1||source.translation!=='BSB'||typeof source.reference!=='string'||!source.reference.length||source.reference.length>500||typeof source.text!=='string'||!Array.isArray(source.verses)||source.verses.length!==selection.endVerse-selection.startVerse+1||(selection.endVerse>selection.startVerse?source.memoryGroup!=='extended':source.memoryGroup!==undefined))throw Error('The linked Scripture must be an exact approved BSB selection.');
 for(const [index,verse] of source.verses.entries()){keys(verse,['number','text']);if(verse.number!==selection.startVerse+index||typeof verse.text!=='string'||!verse.text.trim()||verse.text.length>10000||verse.text.includes('\0'))throw Error('Invalid linked BSB verse.');}
 if(source.text!==source.verses.map(verse=>verse.text).join(' '))throw Error('Linked Scripture text does not match its verses.');
 return clone(source);
}
export function publicSummaryDefinition(body,source){
 const input=publicSummaryInput(body),definition={id:publicSummaryId(input),kind:'chapter',version:1,reference:input.reference,text:input.summary,provenance:'user-summary-v1'};
 if(input.source)definition.sourcePassage=exactSource(source,input.source);
 else if(source!==undefined)throw Error('An unlinked summary cannot contain Scripture source data.');
 return definition;
}
export function publicSummaryDefinitionInput(item){
 const source=publicSummarySource(item);return normalizeSummaryInput({reference:item.reference,summary:item.text,...(item.sourcePassage?{source:source?{bookCode:source.bookCode,chapter:source.chapter,startVerse:source.startVerse,endVerse:source.endVerse}:null}:{})});
}
export function validatePublicSummaryDefinition(item){
 keys(item,['id','kind','version','reference','text','provenance','sourcePassage'],['id','kind','version','reference','text','provenance']);
 if(!isPublicSummary(item)||item.version!==1||typeof item.id!=='string'||!/^summary-[0-9a-f]{64}$/.test(item.id))throw Error('Invalid manual summary identity.');
 const expected=publicSummaryDefinition(publicSummaryDefinitionInput(item),item.sourcePassage);
 if(JSON.stringify(item)!==JSON.stringify(expected)){
  const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
  if(stable(item)!==stable(expected))throw Error('The manual summary differs from its immutable entered words or linked source.');
 }
 return expected;
}
