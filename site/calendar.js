// Public browser-local calendar policy: no private owner's timezone or preferences.
export function browserTimeZone(){ return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
export function validateTimeZone(timeZone){
 if(typeof timeZone!=='string'||timeZone.length>100)throw Error('Choose a valid timezone.');
 new Intl.DateTimeFormat('en-CA',{timeZone}).format(new Date());return timeZone;
}
export function dayKey(date,timeZone=browserTimeZone()){
 const t=new Date(date);if(!Number.isFinite(+t))throw Error('Invalid instant');
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return `${p.year}-${p.month}-${p.day}`;
}
export function shiftDay(day,amount){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);}
export function midnight(day,timeZone=browserTimeZone()){
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid local calendar date');const [y,m,d]=day.split('-').map(Number),target=Date.UTC(y,m-1,d);if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,10)!==day)throw Error('Invalid local calendar date');let guess=target;
 const f=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let n=0;n<6;n++){
  const p=Object.fromEntries(f.formatToParts(new Date(guess)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const delta=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);if(delta===0)return new Date(guess);guess+=delta;
 }
 // Some zones skip midnight during DST. Use the first representable instant of
 // that local day, never a fixed 24-hour addition or another owner's timezone.
 let low=Math.floor((target-36*3600000)/1000),high=Math.floor((target+36*3600000)/1000);
 while(low<high){const mid=Math.floor((low+high)/2);if(dayKey(new Date(mid*1000),timeZone)<day)low=mid+1;else high=mid;}
 const first=new Date(low*1000);if(dayKey(first,timeZone)===day)return first;
 throw Error('This calendar day does not exist in the chosen timezone.');
}
export function calendarDue(reviewedAt,days,timeZone=browserTimeZone()){
 if(!Number.isInteger(days)||days<1||!Number.isFinite(+reviewedAt))throw Error('Invalid review day');
 return midnight(shiftDay(dayKey(reviewedAt,timeZone),days),timeZone);
}
