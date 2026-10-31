/** Ordinary public history/calendar presentation. Rendering and callbacks only: never fetches or saves. */
import {calendarMonthModel,calendarDayEvents,calendarDayLabel,isCalendarDay,formatReviewDate,formatReviewDateTime,normalizedReviewRows,cardDueLabel} from './parity-model.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const activityLabel=kind=>({'adaptive-review':'Scheduled recall review','cm-review':'Charlotte Mason review',read:'Read',listen:'Listened','external-audio':'Listened elsewhere','recall-practice':'Recall practice'}[kind]||'Saved activity');
const removable=event=>event.canRemove===true&&typeof event.key==='string'&&/^practice:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.key);
function timezone(value){const zone=value||'UTC';try{new Intl.DateTimeFormat('en',{timeZone:zone}).format(new Date(0));}catch{throw Error('The selected timezone is invalid.');}return zone;}
export function calendarHTML(data,month=data?.today?.slice(0,7),{timeZone='UTC'}={}){
 const model=calendarMonthModel(data,month),zone=timezone(timeZone);
 return '<section class="parity-calendar" aria-label="Saved activity calendar"><div class="calendar-heading"><button type="button" class="secondary" data-calendar-previous aria-label="Previous month"'+(model.canPrevious?'':' disabled')+'>←</button><h3>'+esc(model.label)+'</h3><button type="button" class="secondary" data-calendar-next aria-label="Next month"'+(model.canNext?'':' disabled')+'>→</button></div><div class="memory-calendar">'+['S','M','T','W','T','F','S'].map(day=>'<span aria-hidden="true">'+day+'</span>').join('')+'<span aria-hidden="true" class="calendar-spacer"></span>'.repeat(model.offset)+model.days.map(day=>'<button type="button" class="calendar-day'+(day.count?' practiced':'')+'" data-calendar-day="'+day.day+'" aria-label="'+esc(calendarDayLabel(day.day)+', '+day.count+' confirmed '+(day.count===1?'activity':'activities'))+'"'+(day.disabled?' disabled':'')+(day.today?' aria-current="date"':'')+'>'+day.number+(day.count?'<span class="day-dot" aria-hidden="true">•</span>':'')+'</button>').join('')+'</div><p class="subtle">Colored days have confirmed practice or reviews. Tap a day to see saved activity. '+esc(zone)+'.</p><div data-calendar-detail aria-live="polite"></div><p data-calendar-status role="status"></p></section>';
}
export function calendarDayDetailHTML(data,day,{timeZone='UTC',allowCorrections=false}={}){
 const zone=timezone(timeZone);if(!isCalendarDay(day)||day>data?.today)return '<p>Choose a saved or past calendar day.</p>';
 const events=calendarDayEvents(data,day);
 return '<section class="calendar-day-detail"><h4>'+esc(calendarDayLabel(day))+'</h4>'+(events.length?'<ul class="activity-day-list">'+events.map(event=>'<li><strong>'+esc(event.reference||event.targetId||'Learning item')+'</strong><small>'+esc(activityLabel(event.kind))+' · '+esc(formatReviewDateTime(event.at,zone))+'</small>'+(event.scheduled?'<span class="subtle">Saved scheduled review</span>':'')+(allowCorrections&&removable(event)?'<button type="button" class="text-button" data-calendar-correct="'+esc(event.key)+'">Remove accidental entry</button>':'')+'</li>').join('')+'</ul>':'<p>No confirmed activity on this day.</p>')+'</section>';
}
/** Recent Adaptive history is read-only. It does not mix practice or CM completions into FSRS ratings. */
export function reviewHistoryHTML({reviews=[],cards=[],timeZone='UTC',title='Saved Adaptive review history',limit=100}={}){
 const zone=timezone(timeZone),rows=normalizedReviewRows(reviews,cards);
 const cap=Number.isSafeInteger(limit)&&limit>0?limit:100,visible=rows.slice(0,cap);
 return '<section class="saved-review-history"><h2>'+esc(title)+'</h2><p class="subtle">Most recent saved Adaptive recall reviews, up to '+cap+'. Practice has its own history; Charlotte Mason completions appear in the activity calendar.</p>'+(visible.length?'<ol class="review-history-list">'+visible.map(row=>reviewRowHTML(row,zone,true)).join('')+'</ol>':'<p>No saved Adaptive reviews yet.</p>')+'</section>';
}
function reviewRowHTML(row,zone,showReference){
 return '<li>'+(showReference?'<strong>'+esc(row.reference)+'</strong>':'')+'<span class="review-rating" aria-label="Self-rating: '+esc(row.ratingLabel)+'">'+esc(row.ratingLabel)+'</span><time datetime="'+esc(row.reviewedAt)+'">'+esc(formatReviewDateTime(row.reviewedAt,zone))+'</time>'+(row.intervalDays!==null?'<span>Saved next interval: '+row.intervalDays+' '+(row.intervalDays===1?'day':'days')+'</span>':'')+(row.nextDue?'<small>Scheduled then for '+esc(formatReviewDate(row.nextDue,zone))+'</small>':'<small>Saved next date unavailable.</small>')+'</li>';
}
/** Per-item review story, without an advanced curve or invented progress score. */
export function itemReviewHistoryHTML(data,card,{timeZone='UTC',now,reviewPolicy='adaptive'}={}){
 const zone=timezone(timeZone),id=card?.id,rows=normalizedReviewRows(data?.reviews||[],card?[card]:[]).filter(row=>row.cardId===id);
 const total=Number.isSafeInteger(data?.totalReviews)&&data.totalReviews>=0?data.totalReviews:rows.length;
 let status=card?.studyStatus==='later'||card?.scheduled===false?'Schedule paused; saved history is preserved.':'';
 if(now&&card)status=cardDueLabel(card,{now,timeZone:zone,reviewPolicy});
 return '<section class="item-review-history"><h2>'+esc(card?.reference||'Learning item')+'</h2><p>'+total+' saved Adaptive '+(total===1?'review':'reviews')+(status?' · '+esc(status):'')+'</p><p class="subtle">Your saved self-ratings and dates—not an automatic measure of mastery. Extra practice does not change these review dates.</p><h3>Your review history</h3>'+(rows.length?'<ol class="review-history-list">'+rows.map(row=>reviewRowHTML(row,zone,false)).join('')+'</ol>':'<p>Your first saved Adaptive review starts this history. Charlotte Mason completions remain in the activity calendar.</p>')+'</section>';
}
/**
 * Scoped calendar controller. No global selectors, fetches or writes.
 * onDay(day,events), onMonth(month), onCorrect(event,{day}), onError(error).
 */
export function mountCalendar(root,{data,month=data?.today?.slice(0,7),timeZone='UTC',onDay=()=>{},onMonth=()=>{},onCorrect,onError=()=>{}}={}){
 if(!root||typeof root.addEventListener!=='function'||typeof root.querySelector!=='function')throw Error('A calendar root element is required.');
 let disposed=false,currentData=data,currentMonth=calendarMonthModel(data,month).month,selectedDay=null,zone=timezone(timeZone);
 function report(error){const status=root.querySelector('[data-calendar-status]');if(status)status.textContent=error?.message||'The calendar could not open this activity.';onError(error);}
 function render(){if(disposed)return;const model=calendarMonthModel(currentData,currentMonth);currentMonth=model.month;root.innerHTML=calendarHTML(currentData,currentMonth,{timeZone:zone});if(selectedDay&&selectedDay.startsWith(currentMonth+'-')){const detail=root.querySelector('[data-calendar-detail]');if(detail)detail.innerHTML=calendarDayDetailHTML(currentData,selectedDay,{timeZone:zone,allowCorrections:typeof onCorrect==='function'});}}
 function showDay(day){if(disposed||!isCalendarDay(day)||day>currentData.today||!day.startsWith(currentMonth+'-'))return false;selectedDay=day;const detail=root.querySelector('[data-calendar-detail]');if(detail)detail.innerHTML=calendarDayDetailHTML(currentData,day,{timeZone:zone,allowCorrections:typeof onCorrect==='function'});onDay(day,calendarDayEvents(currentData,day));return true;}
 function changeMonth(value){if(disposed)return false;const next=calendarMonthModel(currentData,value).month;if(next===currentMonth)return false;currentMonth=next;selectedDay=null;render();onMonth(currentMonth);return true;}
 async function click(event){
  if(disposed)return;const target=event.target?.closest?.('[data-calendar-previous],[data-calendar-next],[data-calendar-day],[data-calendar-correct]');if(!target||target.disabled||typeof root.contains==='function'&&!root.contains(target))return;
  try{
   const model=calendarMonthModel(currentData,currentMonth);
   if(target.hasAttribute('data-calendar-previous')){if(model.previous)changeMonth(model.previous);return;}
   if(target.hasAttribute('data-calendar-next')){if(model.next)changeMonth(model.next);return;}
   if(target.hasAttribute('data-calendar-day')){showDay(target.getAttribute('data-calendar-day'));return;}
   if(target.hasAttribute('data-calendar-correct')&&typeof onCorrect==='function'&&selectedDay){const key=target.getAttribute('data-calendar-correct'),activity=calendarDayEvents(currentData,selectedDay).find(item=>item.key===key&&removable(item));if(!activity)return;target.disabled=true;try{await onCorrect(activity,{day:selectedDay});}finally{if(!disposed&&target.isConnected!==false)target.disabled=false;}}
  }catch(error){if(!disposed)report(error);}
 }
 root.addEventListener('click',click);render();
 return{dispose(){if(disposed)return;disposed=true;root.removeEventListener('click',click);},get month(){return currentMonth;},get day(){return selectedDay;},setMonth:changeMonth,selectDay:showDay,setData(next,{month:requested=currentMonth,timeZone:nextZone=zone}={}){if(disposed)return;calendarMonthModel(next,requested);zone=timezone(nextZone);currentData=next;currentMonth=requested;if(selectedDay>next.today)selectedDay=null;render();}};
}
