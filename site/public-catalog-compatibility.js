/** Compatibility-only metadata from the former approved PUBLIC catalog.
 * Never seeds a fresh visitor. No personal content or Scripture text is bundled.
 */
// The former 105-Story selection was removed from the public app (Oct 30, 2026). No live
// visitor ever had it: the first production release already started visitors with no Stories.
const archive=[];
const clone=value=>JSON.parse(JSON.stringify(value));
const byId=new Map(archive.map(item=>[item.id,item]));
export const legacyPublicCatalog=()=>clone(archive);
export const legacyPublicDefinition=id=>byId.has(id)?clone(byId.get(id)):null;
/** Conservative preservation: any durable reference is touched. catalogVersions
 * is deliberately NOT scanned, so an untouched old105 backup stays empty.
 */
export function referencedLegacyPublicIds(root){
 const ids=new Set();const add=id=>{if(typeof id==='string'&&byId.has(id))ids.add(id);};
 // Only structural identity fields count. User outlines, Scripture text, display
 // references and arbitrary prose must never turn into catalog enrollment.
 for(const map of [root.items,root.cards,root.storyNotes])for(const id of Object.keys(map??{}))add(id);
 for(const row of root.reviews??[])add(row.card_id);
 for(const row of root.practice??[])add(row.target_id);
 const box=root.cm?.plan?.box;
 if(box){
  for(const id of box.daily??[])add(id);
  for(const entry of [box.odd,box.even,...Object.values(box.weekdays??{})])add(entry?.id);
  for(const bucket of Object.values(box.monthly??{}))for(const entry of bucket??[])add(entry?.id);
  for(const map of [box.completed,box.dailySince])for(const id of Object.keys(map??{}))add(id);
 }
 for(const action of Object.values(root.receipts??{})){
  const receipt=action.receipt??{};for(const key of ['cardId','targetId','itemId'])add(receipt[key]);
  for(const id of receipt.cardIds??[])add(id);
  for(const entry of [...(receipt.moves??[]),...(receipt.completions??[])])add(entry?.id);
  if(typeof action.request==='string'&&action.request.length<=30000&&action.path!=='/api/restore'){
   let request;try{request=JSON.parse(action.request);}catch{continue;}
   for(const key of ['cardId','targetId'])add(request?.[key]);
   for(const id of request?.dailyIds??[])add(id);
   for(const entry of request?.items??[])add(entry?.cardId);
  }
 }
 return [...ids].sort();
}
/** Mutates only the passed detached/local root. Adds, never deletes history. */
export function migrateLegacyPublicRoot(root){
 let changed=false;root.items??={};
 for(const id of referencedLegacyPublicIds(root))if(!Object.hasOwn(root.items,id)){root.items[id]=legacyPublicDefinition(id);changed=true;}
 if(!Object.hasOwn(root,'storyNotes')){root.storyNotes={};changed=true;}
 return changed;
}
