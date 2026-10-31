/** Spoken summary recall. User words are never compared or labelled as a Bible translation. */
export function mountSummaryRecall({root,reference,text,onPractice,onFinishReview,onReveal=()=>{},isBlocked=()=>false,practiceSaved=false}){
 if(!root?.ownerDocument||typeof reference!=='string'||typeof text!=='string')throw Error('The summary could not open.');
 const document=root.ownerDocument;let disposed=false,revealed=false,saving=false,saved=practiceSaved;
 const make=(tag,value,cls)=>{const node=document.createElement(tag);node.textContent=value;if(cls)node.className=cls;return node;};
 const title=make('h2','Recall the summary in your own words');
 const prompt=make('p','Think or speak through '+reference+', then reveal your summary to check.');
 const body=make('div','', 'summary-recall-text');body.hidden=true;body.append(make('h3','Your summary'),make('p',text,'summary-own-text'));
 const cover=make('p','Your summary is hidden.','recall-cover');
 const status=make('p','');status.setAttribute('role','status');
 function button(label,work){const b=make('button',label,'secondary');b.type='button';b.onclick=async()=>{if(disposed||saving||isBlocked())return;saving=true;sync();status.textContent='';try{await work();}catch(error){if(!disposed)status.textContent=error?.message||'This action was not confirmed. Retry it.';}finally{saving=false;if(!disposed)sync();}};return b;}
 const reveal=button('Reveal summary',async()=>{revealed=!revealed;onReveal(revealed);});
 const practice=onPractice&&!onFinishReview?button('Save practice',async()=>{await onPractice();if(!disposed){saved=true;status.textContent='Practice saved. Your review schedule does not change.';}}):null;
 const finish=onFinishReview?button('Rate how it went',async()=>{revealed=true;onReveal(true);sync();await onFinishReview({wholeSummary:true});}):null;
 function sync(){body.hidden=!revealed;cover.hidden=revealed;reveal.textContent=revealed?'Hide summary':'Reveal summary';for(const b of [reveal,practice,finish])if(b)b.disabled=saving||isBlocked()||(b===practice&&saved);if(practice&&saved)practice.textContent='Practice saved';}
 root.replaceChildren(title,prompt,cover,body,reveal);
 if(practice)root.append(practice,make('p','Extra practice. Your review schedule does not change.','subtle'));
 if(finish)root.append(finish,make('p','One rating for the whole summary, including anything you could not recall.','subtle'));
 root.append(status);sync();
 return {show(){if(disposed)return;revealed=true;onReveal(true);sync();},hide(){if(disposed)return;revealed=false;onReveal(false);sync();},get revealed(){return revealed;},dispose(){disposed=true;}};
}
