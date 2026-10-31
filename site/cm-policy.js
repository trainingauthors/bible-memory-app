// Isolated deterministic CM prototype. Never imports app/DB/FSRS or auto-activates.
// ISO strings below are local Gregorian dates, not UTC review timestamps.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const copy = value => JSON.parse(JSON.stringify(value));
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export function cmDate(date) {
 if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Expected YYYY-MM-DD local date');
 const [y,m,d] = date.split('-').map(Number);
 if(y < 1000 || y > 9999) throw Error('Unsupported local year');
 const t = new Date(Date.UTC(y,m-1,d));
 if(t.getUTCFullYear()!==y || t.getUTCMonth()!==m-1 || t.getUTCDate()!==d) throw Error('Invalid local date');
 return date;
}
export function cmAddDays(date,days) {
 cmDate(date);if(!Number.isInteger(days))throw Error('Expected whole days');
 const [y,m,d]=date.split('-').map(Number), t=new Date(Date.UTC(y,m-1,d+days));
 return cmDate(t.toISOString().slice(0,10));
}
export function cmWeekday(date) { cmDate(date);return new Date(date+'T00:00:00Z').getUTCDay(); }
export function cmLocalDate(instant, timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone) {
 const t=new Date(instant);if(!Number.isFinite(+t))throw Error('Invalid instant');
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return cmDate(`${p.year}-${p.month}-${p.day}`);
}
function settings(options={}) {
 const sabbath=options.sabbath ?? null;
 if(sabbath!==null&&(!Number.isInteger(sabbath)||sabbath<0||sabbath>6))throw Error('Sabbath must be null or weekday 0..6');
 return {sabbath,active:options.activeIds===undefined?null:new Set(options.activeIds)};
}
export function cmEffectiveDate(nominalDate,options={}) {
 const {sabbath}=settings(options);cmDate(nominalDate);
 return cmWeekday(nominalDate)===sabbath?cmAddDays(nominalDate,1):nominalDate;
}
export function createCmState({date,dailyIds=[]}={}) {
 cmDate(date);if(!Array.isArray(dailyIds)||new Set(dailyIds).size!==dailyIds.length||dailyIds.some(id=>typeof id!=='string'||!id))throw Error('Explicit unique Daily IDs required');
 return {version:1,revision:0,startedDate:date,daily:[...dailyIds],odd:null,even:null,
  weekdays:Object.fromEntries(Array.from({length:7},(_,i)=>[i,null])),
  monthly:Object.fromEntries(Array.from({length:31},(_,i)=>[i+1,[]])),monthlyCursor:1,sequence:0,completed:{}};
}
export function cmPlacements(state) {
 if(state?.version!==1||!Number.isInteger(state.revision)||state.revision<0||!Number.isInteger(state.sequence)||state.sequence<0)throw Error('Invalid CM state version/revision');
 cmDate(state.startedDate);
 if(!Array.isArray(state.daily)||!state.completed||!state.weekdays||!state.monthly||!Number.isInteger(state.monthlyCursor)||state.monthlyCursor<1||state.monthlyCursor>31)throw Error('Invalid CM buckets/cursor');
 if(state.dailySince!==undefined){if(!state.dailySince||typeof state.dailySince!=='object'||Array.isArray(state.dailySince))throw Error('Invalid Daily enrollment dates');for(const date of Object.values(state.dailySince))if(cmDate(date)<state.startedDate)throw Error('Backdated Daily enrollment');}
 const out=state.daily.map(id=>({id,kind:'daily',slot:null,sinceDate:state.dailySince?.[id]??state.startedDate,enteredOrder:0}));
 for(const kind of ['odd','even'])if(state[kind])out.push({...state[kind],kind,slot:null});
 for(let day=0;day<7;day++){const p=state.weekdays[day];if(p)out.push({...p,kind:'weekday',slot:day});}
 for(let day=1;day<=31;day++){
  if(!Array.isArray(state.monthly[day]))throw Error('Every monthly bucket is required');
  for(const p of state.monthly[day])out.push({...p,kind:'monthly',slot:day});
 }
 const ids=new Set();
 for(const p of out){
  if(typeof p.id!=='string'||!p.id||ids.has(p.id)||!Number.isInteger(p.enteredOrder)||p.enteredOrder<0||p.enteredOrder>state.sequence)throw Error('Duplicate/invalid placement or age');
  ids.add(p.id);p.sinceDate=cmDate(p.sinceDate||state.startedDate);if(p.carryDue)cmDate(p.carryDue);
 }
 for(const d of Object.values(state.completed))cmDate(d);
 return out;
}
function matches(rule,date) {
 const day=Number(date.slice(8));
 return rule.kind==='daily'||rule.kind==='odd'&&day%2===1||rule.kind==='even'&&day%2===0||rule.kind==='weekday'&&cmWeekday(date)===Number(rule.slot)||rule.kind==='monthly'&&day===Number(rule.slot);
}
function firstOutstanding(state,p,date,options) {
 const completed=state.completed[p.id];if(completed&&completed>=date)return null;
 let best=p.carryDue&&(!completed||p.carryDue>completed)&&p.carryDue<=date?{nominalDate:null,effectiveDate:p.carryDue,carried:true}:null;
 const start=[state.startedDate,p.sinceDate,completed?cmAddDays(completed,1):state.startedDate].sort().at(-1);
 for(let d=start;d<=date;d=cmAddDays(d,1)){
  if(!matches(p,d))continue;const effectiveDate=cmEffectiveDate(d,options);
  if(effectiveDate<=date&&(!best||effectiveDate<best.effectiveDate))best={nominalDate:d,effectiveDate,carried:false};
  if(best)break;
 }
 return best;
}
// Includes missed occurrences, but coalesces to one due target. No review on Sabbath.
export function cmDueTargets(state,date,options={}) {
 cmDate(date);const {sabbath,active}=settings(options),placements=cmPlacements(state);
 if(cmWeekday(date)===sabbath)return [];
 return placements.filter(p=>!active||active.has(p.id)).flatMap(p=>{
  const due=firstOutstanding(state,p,date,options);return due?[{id:p.id,kind:p.kind,slot:p.slot,...due}]:[];
 });
}
// Exact-date occurrence IDs, useful to an independent calendar oracle.
export function cmOccurrenceIds(state,date,options={}) {
 cmDate(date);const {sabbath,active}=settings(options),placements=cmPlacements(state);
 if(cmWeekday(date)===sabbath)return [];
 return placements.filter(p=>(!active||active.has(p.id))&&state.completed[p.id]!==date).filter(p=>{
  return [cmAddDays(date,-1),date].some(n=>n>=p.sinceDate&&matches(p,n)&&cmEffectiveDate(n,options)===date);
 }).map(p=>p.id);
}
// Strictly after the supplied actual completion date; considers Sabbath deferral.
export function cmNextDueDate(rule,afterDate,options={}) {
 cmDate(afterDate);settings(options);
 if(!['daily','odd','even','weekday','monthly'].includes(rule.kind))throw Error('Unknown CM rule');
 if(rule.kind==='weekday'&&(!Number.isInteger(rule.slot)||rule.slot<0||rule.slot>6))throw Error('Invalid weekday');
 if(rule.kind==='monthly'&&(!Number.isInteger(rule.slot)||rule.slot<1||rule.slot>31))throw Error('Invalid month day');
 for(let i=-1;i<=400;i++){
  const d=cmAddDays(afterDate,i);if(rule.sinceDate&&d<rule.sinceDate)continue;
  if(matches(rule,d)){const effective=cmEffectiveDate(d,options);if(effective>afterDate)return effective;}
 }
 throw Error('No CM occurrence in bounded calendar horizon');
}
export function cmReviewed(state,id,date,options={}) {
 if(!cmDueTargets(state,date,options).some(t=>t.id===id))throw Error('CM item is not due/active today');
 const nextState=copy(state);nextState.completed[id]=date;nextState.revision++;
 return {nextState,moves:[],completions:[{id,date,reason:'reviewed'}],action:{kind:'reviewed',id,date}};
}
// Explicit recalled-and-memorized action: completes CURRENT target and moves one chain.
// CAS/request UUID/receipts and confirmation of explicit intent belong to server integration.
export function cmAdvance(state,id,date,options={}) {
 cmDate(date);const {sabbath,active}=settings(options);cmPlacements(state);
 if(cmWeekday(date)===sabbath)throw Error('Sabbath has no review/advance actions');
 if(!state.daily.includes(id))throw Error('Advance requires the selected Daily item');
 if(active&&!active.has(id))throw Error('Daily item is not Active');
 if(date<state.startedDate||state.completed[id]&&state.completed[id]>date)throw Error('Cannot backdate CM completion');
 const pending=new Map(cmDueTargets(state,date,options).map(t=>[t.id,t.effectiveDate]));
 const nextState=copy(state),moves=[];
 const completions=state.completed[id]===date?[]:[{id,date,reason:'memorized-advance'}];
 nextState.completed[id]=date;pending.delete(id);
 const older=(a,b)=>a.enteredOrder-b.enteredOrder||cmp(a.id,b.id);
 function placed(targetId){const p={id:targetId,enteredOrder:++nextState.sequence,sinceDate:date};if(pending.has(targetId))p.carryDue=pending.get(targetId);return p;}
 nextState.daily=nextState.daily.filter(targetId=>targetId!==id);
 const parities=['odd','even'].filter(k=>!nextState[k]||!active||active.has(nextState[k].id));
 if(!parities.length)throw Error('No eligible Odd/Even slot; paused placements must not be moved');
 const parity=parities.find(k=>!nextState[k])||parities.slice().sort((a,b)=>older(nextState[a],nextState[b]))[0];
 const displaced=nextState[parity];nextState[parity]=placed(id);moves.push({id,from:'daily',to:parity});
 if(displaced){
  const weekdays=WEEK_ORDER.filter(d=>d!==sabbath&&(!nextState.weekdays[d]||!active||active.has(nextState.weekdays[d].id)));
  if(!weekdays.length)throw Error('No eligible weekday slot; paused placements must not be moved');
  const day=weekdays.find(d=>!nextState.weekdays[d])??weekdays.slice().sort((a,b)=>older(nextState.weekdays[a],nextState.weekdays[b]))[0];
  const oldWeekday=nextState.weekdays[day];nextState.weekdays[day]=placed(displaced.id);moves.push({id:displaced.id,from:parity,to:'weekday',slot:day});
  if(oldWeekday){
   const dayOfMonth=nextState.monthlyCursor;
   nextState.monthly[dayOfMonth].push(placed(oldWeekday.id));moves.push({id:oldWeekday.id,from:'weekday',fromSlot:day,to:'monthly',slot:dayOfMonth});
   nextState.monthlyCursor=dayOfMonth===31?1:dayOfMonth+1;
  }
 }
 nextState.revision++;cmPlacements(nextState);
 return {nextState,moves,completions,action:{kind:'advance',id,date}};
}


// Explicit enrollment AFTER a box already exists; never initializes/activates a policy.
// Caller validates authorized top-level IDs and Active membership atomically.
export function cmEnroll(state,ids,date) {
 cmDate(date);const placements=cmPlacements(state);
 if(date<state.startedDate)throw Error('Cannot backdate CM enrollment');
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id))throw Error('Expected explicit nonempty target IDs');
 const assigned=new Set(placements.map(p=>p.id));
 const enrolledIds=[...new Set(ids)].filter(id=>!assigned.has(id));
 const nextState=copy(state);
 if(enrolledIds.length){
  nextState.dailySince={...(state.dailySince||{})};
  for(const id of enrolledIds){nextState.daily.push(id);nextState.dailySince[id]=date;}
  nextState.revision++;
 }
 cmPlacements(nextState);
 return {nextState,enrolledIds,moves:enrolledIds.map(id=>({id,from:'unassigned',to:'daily',sinceDate:date})),completions:[],action:{kind:'enroll',ids:[...new Set(ids)],date}};
}
