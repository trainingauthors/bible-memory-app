// Scheduling parameters reused from canonical pure scheduling.ts; public timezone is injected.
import {fsrs,generatorParameters,Rating,createEmptyCard} from './vendor/fsrs.js';
import {calendarDue} from './calendar.js';
export {createEmptyCard};
export const parameters=generatorParameters({request_retention:0.9,enable_fuzz:false,enable_short_term:false});
export const schedulerVersion='ts-fsrs@5.4.2';
const scheduler=fsrs(parameters);
export function hydrateCard(card){return {...card,due:new Date(card.due),...(card.last_review?{last_review:new Date(card.last_review)}:{})};}
export function nextReview(card,now,rating,timeZone){
 const result=scheduler.next(hydrateCard(card),now,rating);
 if(rating===Rating.Again)result.card.scheduled_days=1;
 result.card.due=calendarDue(now,result.card.scheduled_days,timeZone);return result;
}
export function memoryCurve(reviews){
 if(!reviews.length)return null;
 const first=JSON.parse(reviews[0].next_json),latest=JSON.parse(reviews.at(-1).next_json);
 const horizon=Math.max(7,Math.min(365,Math.ceil(latest.stability*2)));
 const points=Array.from({length:29},(_,i)=>{const days=horizon*i/28;const probability=state=>scheduler.get_retrievability(hydrateCard(state),new Date(new Date(state.last_review).getTime()+days*86400000),false);return {days,first:probability(first),latest:probability(latest)};});
 return {horizon,points,reviews:reviews.length};
}
