/** Visitor-made cards: own words only, never a Bible translation or generated text. */
import {normalizeCardInput,cardDigest,cardTitle} from './card-model.js';
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
export const isPublicCard=item=>item?.kind==='card'&&item?.provenance==='user-card-v1';
export const publicCardId=input=>'card-'+cardDigest(input);
export function publicCardDefinition(input){
 const card=normalizeCardInput(input),{reference,group,tags,...face}=card;
 return{id:publicCardId(card),kind:'card',version:1,reference:cardTitle(card),provenance:'user-card-v1',card:face,...(reference?{bibleReference:reference}:{}),group,tags};
}
export function publicCardInput(item){return{...item.card,...(item.bibleReference?{reference:item.bibleReference}:{}),group:item.group,tags:item.tags};}
export function validatePublicCardDefinition(item){
 if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['id','kind','version','reference','provenance','card','bibleReference','group','tags'].includes(key))||!isPublicCard(item)||item.version!==1||typeof item.id!=='string'||!/^card-[0-9a-f]{64}$/.test(item.id)||!item.card||typeof item.card!=='object'||Array.isArray(item.card))throw Error('Invalid visitor-made card.');
 const expected=publicCardDefinition(publicCardInput(item));
 if(stable(item)!==stable(expected))throw Error('The card differs from its entered words.');
 return expected;
}
