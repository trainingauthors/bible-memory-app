/** Public-only view models. No storage, fetch, mutation receipts, scheduling writes or private defaults. */
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const validInstant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const text=value=>typeof value==='string'?value:'';
const normalized=value=>text(value).normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
const aliases=name=>{
 const value=normalized(name),names=[value];
 if(value==='psalms')names.push('psalm');
 if(value==='song of songs')names.push('song of solomon');
 if(value==='song of solomon')names.push('song of songs');
 return names;
};
function booksIndex(books){
 if(!Array.isArray(books)||!books.length)throw Error('Approved Bible book metadata is required for ordering.');
 const rows=books.map((book,index)=>({code:text(book?.code).toUpperCase(),index,names:aliases(book?.name)}));
 if(rows.some(book=>!/^[A-Z0-9]{3}$/.test(book.code)||!book.names[0])||new Set(rows.map(book=>book.code)).size!==rows.length)throw Error('Approved Bible book metadata is invalid.');
 return rows;
}
function position(card,books){
 const segment=card?.segments?.[0],coordinate=segment&&books.find(book=>book.code===text(segment.bookCode).toUpperCase());
 if(coordinate&&integer(segment.startChapter,1,150)&&integer(segment.startVerse,1,176))return[coordinate.index,segment.startChapter,segment.startVerse];
 const id=/^bsb-(?:story-)?([a-z0-9]+)-(\d+)-(\d+)-(\d+)$/.exec(text(card?.id));
 const identified=id&&books.find(book=>book.code===id[1].toUpperCase());
 if(identified&&integer(Number(id[2]),1,150)&&integer(Number(id[3]),1,176))return[identified.index,Number(id[2]),Number(id[3])];
 for(const raw of [card?.passageReference,card?.reference]){
  const reference=normalized(raw);
  const candidates=books.flatMap(book=>book.names.map(name=>({book,name}))).filter(row=>reference===row.name||reference.startsWith(row.name+' ')).sort((a,b)=>b.name.length-a.name.length);
  if(candidates.length){
   const {book,name}=candidates[0],suffix=reference.slice(name.length).trim();
   if(!suffix)return[book.index,0,0];
   const match=/^(\d+)(?::(\d+))?/.exec(suffix);
   if(match&&integer(Number(match[1]),1,150))return[book.index,Number(match[1]),match[2]?Number(match[2]):0];
  }
 }
 return[books.length,Number.POSITIVE_INFINITY,Number.POSITIVE_INFINITY];
}
/** Stable non-mutating front-to-back order; keeps category grouping to the caller. */
export function sortBibleCards(cards,books){
 const index=booksIndex(books);
 if(!Array.isArray(cards))throw Error('A public card list is required.');
 return cards.map((card,order)=>({card,order,position:position(card,index)})).sort((a,b)=>{
  for(let i=0;i<3;i++){if(a.position[i]<b.position[i])return-1;if(a.position[i]>b.position[i])return 1;}
  return a.order-b.order;
 }).map(row=>row.card);
}
function sessionClock(session){
 if(!validInstant(session?.now))throw Error('Refresh the current session before showing review status.');
 const timeZone=session.timeZone||'UTC';
 try{new Intl.DateTimeFormat('en',{timeZone}).format(new Date(session.now));}catch{throw Error('The selected timezone is invalid.');}
 return{now:Date.parse(session.now),timeZone};
}
export function formatReviewDate(value,timeZone='UTC'){
 if(!validInstant(value))return 'Date unavailable';
 return new Intl.DateTimeFormat(undefined,{timeZone,dateStyle:'medium'}).format(new Date(value));
}
export function formatReviewDateTime(value,timeZone='UTC'){
 if(!validInstant(value))return 'Saved date unavailable';
 return new Intl.DateTimeFormat(undefined,{timeZone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}
/** Labels are projections only. A skipped or paused item never becomes a new due item here. */
export function cardDueStatus(card,session){
 const {now,timeZone}=sessionClock(session);
 if(card?.studyStatus==='later'||card?.learningStage==='later')return{kind:'later',label:'Later',date:null};
 if(validInstant(card?.skipUntil)&&Date.parse(card.skipUntil)>now)return{kind:'skipped',label:'Skipped today',date:card.skipUntil};
 if(card?.scheduled===false)return{kind:'inactive',label:'Schedule paused',date:null};
 const ready=session.reviewPolicy==='charlotte-mason'?card?.cmDue===true:validInstant(card?.due)&&Date.parse(card.due)<=now;
 if(ready)return{kind:'ready',label:'Ready to review',date:validInstant(card?.due)?card.due:null};
 if(validInstant(card?.due))return{kind:'next',label:'Next: '+formatReviewDate(card.due,timeZone),date:card.due};
 return{kind:'unavailable',label:'Review date unavailable',date:null};
}
export const cardDueLabel=(card,session)=>cardDueStatus(card,session).label;

export function isCalendarDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01')return false;
 const instant=new Date(value+'T12:00:00Z');
 return Number.isFinite(+instant)&&instant.toISOString().slice(0,10)===value;
}
function calendarMonth(value){if(typeof value!=='string'||!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)||value<'0001-01')throw Error('Choose a valid calendar month.');return value;}
export function shiftCalendarMonth(month,delta){
 calendarMonth(month);if(!Number.isSafeInteger(delta))throw Error('Use a whole-month calendar step.');
 const number=Number(month.slice(0,4))*12+Number(month.slice(5))-1+delta;
 if(number<12||number>9999*12+11)throw Error('That calendar month is outside the supported range.');
 return String(Math.floor(number/12)).padStart(4,'0')+'-'+String(number%12+1).padStart(2,'0');
}
function nonnegative(value){return Number.isSafeInteger(value)&&value>=0?value:0;}
export function calendarMonthModel(data,requestedMonth=data?.today?.slice(0,7)){
 if(!isCalendarDay(data?.today))throw Error('A valid current local calendar day is required.');
 const latest=data.today.slice(0,7),month=calendarMonth(requestedMonth)>latest?latest:requestedMonth;
 const first=month+'-01',start=new Date(first+'T12:00:00Z'),last=new Date(start);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
 const days=Array.from({length:last.getUTCDate()},(_,i)=>{
  const day=month+'-'+String(i+1).padStart(2,'0');return{day,number:i+1,count:nonnegative(data.daily?.[day]?.count),disabled:day>data.today,today:day===data.today};
 });
 return{month,label:new Intl.DateTimeFormat(undefined,{timeZone:'UTC',month:'long',year:'numeric'}).format(start),offset:start.getUTCDay(),days,canPrevious:month>'0001-01',canNext:month<latest,previous:month>'0001-01'?shiftCalendarMonth(month,-1):null,next:month<latest?shiftCalendarMonth(month,1):null};
}
export function calendarDayLabel(day){if(!isCalendarDay(day))throw Error('Choose a valid calendar day.');return new Intl.DateTimeFormat(undefined,{timeZone:'UTC',dateStyle:'long'}).format(new Date(day+'T12:00:00Z'));}
/** Returned arrays and records are copies; malformed/future days cannot be opened as saved history. */
export function calendarDayEvents(data,day){
 if(!isCalendarDay(data?.today)||!isCalendarDay(day)||day>data.today)return[];
 const events=Array.isArray(data.daily?.[day]?.events)?data.daily[day].events:[];
 return events.filter(event=>event&&typeof event==='object'&&!Array.isArray(event)&&validInstant(event.at)).map(event=>({...event})).sort((a,b)=>b.at.localeCompare(a.at)||text(a.key).localeCompare(text(b.key)));
}

const ratingLabels={1:'Again',2:'Hard',3:'Good',4:'Easy'};
/** Handles the existing /api/history raw rows and /api/progress?card public projection. */
export function normalizedReviewRows(reviews,cards=[]){
 if(!Array.isArray(reviews)||!Array.isArray(cards))throw Error('Saved review lists are required.');
 const definitions=new Map(cards.filter(Boolean).map(card=>[card.id,card]));
 return reviews.flatMap((review,index)=>{
  const cardId=review?.cardId??review?.card_id,reviewedAt=review?.reviewedAt??review?.reviewed_at,nextDue=review?.nextDue??review?.next_due;
  if(typeof cardId!=='string'||!cardId||!validInstant(reviewedAt)||!integer(review?.rating,1,4))return[];
  const card=definitions.get(cardId),intervalDays=Number.isSafeInteger(review.intervalDays)&&review.intervalDays>=0?review.intervalDays:null;
  return[{key:text(review.request_id)||cardId+':'+reviewedAt+':'+index,cardId,reference:text(card?.reference)||text(review.reference)||cardId,rating:review.rating,ratingLabel:ratingLabels[review.rating],reviewedAt,nextDue:validInstant(nextDue)?nextDue:null,intervalDays}];
 }).sort((a,b)=>b.reviewedAt.localeCompare(a.reviewedAt)||a.key.localeCompare(b.key));
}

function selection(ids){
 const source=ids instanceof Set?[...ids]:ids;
 if(!Array.isArray(source)||source.some(id=>typeof id!=='string'||!id||id.length>160)||new Set(source).size!==source.length)throw Error('Choose valid, distinct public learning items.');
 return[...source];
}
function selectionLimit(limit){if(!integer(limit,1,50))throw Error('Bulk changes support 1–50 items at a time.');return limit;}
function manageable(cards){if(!Array.isArray(cards))throw Error('A current public collection is required.');return new Map(cards.filter(card=>card&&typeof card.id==='string'&&card.canManage===true).map(card=>[card.id,card]));}
export function bulkSelectionSummary({cards,visibleCards=cards,selectedIds=[],limit=50}){
 selectionLimit(limit);const ids=selection(selectedIds),all=manageable(cards),visible=manageable(visibleCards),staleIds=ids.filter(id=>!all.has(id)),eligible=ids.filter(id=>all.has(id)),shown=[...visible.keys()].filter(id=>all.has(id)),missingShown=shown.filter(id=>!ids.includes(id));
 return{selectedIds:ids,count:eligible.length,visibleCount:shown.length,selectedVisibleCount:shown.filter(id=>ids.includes(id)).length,allShownSelected:shown.length>0&&missingShown.length===0,canSelectAllShown:staleIds.length===0&&eligible.length+missingShown.length<=limit,canSubmit:eligible.length>0&&eligible.length<=limit&&staleIds.length===0,staleIds,limit,atLimit:eligible.length>=limit};
}
export function toggleBulkSelection(selectedIds,id,cards,{limit=50}={}){
 selectionLimit(limit);const ids=selection(selectedIds);if(ids.includes(id))return ids.filter(value=>value!==id);
 if(!manageable(cards).has(id))throw Error('This item is no longer manageable. Refresh the collection.');
 if(ids.length>=limit)throw Error('Choose at most '+limit+' items for one bulk change.');
 return[...ids,id];
}
export function selectAllShown(selectedIds,visibleCards,{limit=50}={}){
 selectionLimit(limit);const ids=selection(selectedIds),shown=[...manageable(visibleCards).keys()],combined=[...new Set([...ids,...shown])];
 if(combined.length>limit)throw Error('Choose at most '+limit+' items for one bulk change.');return combined;
}
/** Exact CAS request body rows. Rejects a stale selection rather than silently submitting fewer targets. */
export function selectedStudyItems(cards,selectedIds,{limit=50}={}){
 selectionLimit(limit);const ids=selection(selectedIds),all=manageable(cards);
 if(ids.length>limit)throw Error('Choose at most '+limit+' items for one bulk change.');
 return ids.map(id=>{const card=all.get(id);if(!card||!integer(card.revision,0,Number.MAX_SAFE_INTEGER))throw Error('A selected item changed. Refresh before making the bulk change.');return{cardId:id,revision:card.revision};});
}
