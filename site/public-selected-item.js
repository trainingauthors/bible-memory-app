/** Canonical classification of an already source-verified exact BSB selection. */
export function selectedPublicId({bookCode,chapter,startVerse,endVerse,kind='verse'}){return `bsb-${kind==='story'?'story-':''}${bookCode.toLowerCase()}-${chapter}-${startVerse}-${endVerse}`;}
export function parseSelectedPublicId(id){const m=typeof id==='string'&&/^bsb-(story-)?([a-z0-9]{3})-(\d+)-(\d+)-(\d+)$/.exec(id);return m?{kind:m[1]?'story':'verse',bookCode:m[2].toUpperCase(),chapter:Number(m[3]),startVerse:Number(m[4]),endVerse:Number(m[5])}:null;}
export function selectedPublicDefinition(source,kind='verse'){
 if(!['verse','story'].includes(kind))throw Error('Choose Verse or Story classification.');
 const selection=parseSelectedPublicId(source.id);if(!selection||selection.kind!=='verse'||source.kind!=='verse')throw Error('Approved BSB source definition is required.');
 const copy=JSON.parse(JSON.stringify(source));if(kind==='story'){copy.id=selectedPublicId({...selection,kind});copy.kind='story';delete copy.memoryGroup;}return copy;
}
