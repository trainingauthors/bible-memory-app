/**
 * Shared, text-free Recall UI state for the personal and public apps.
 * This module has no storage, network, DOM, practice-credit, or rating operation.
 * A renderer may expose Scripture ONLY for visibleVerseIndices. Target indices
 * are not displayed automatically. Every app still owns its explicit save action.
 */
const METHODS=['oral','full','first'],SCOPES=['verse','passage'];
const MAX_VERSES=5000;
const emptyCoverage=count=>({full:{verses:Array(count).fill(false),passage:false},first:{verses:Array(count).fill(false),passage:false}});
const validCount=count=>Number.isSafeInteger(count)&&count>=1&&count<=MAX_VERSES;

function initial(verseCount,method,scope){
 if(!validCount(verseCount))throw Error('Load the complete passage before starting recall.');
 if(!METHODS.includes(method)||!SCOPES.includes(scope))throw Error('Choose a recall method and passage scope.');
 return {schemaVersion:1,verseCount,method,scope,verseIndex:0,oralRevealedCount:0,showAll:false,checked:false,coverage:emptyCoverage(verseCount)};
}

/** Validate/detach plain serializable state, stripping any unrelated caller fields. */
function stateOf(value){
 if(!value||value.schemaVersion!==1)throw Error('Start this passage’s recall again.');
 const result=initial(value.verseCount,value.method,value.scope);
 if(!Number.isSafeInteger(value.verseIndex)||value.verseIndex<0||value.verseIndex>=value.verseCount||!Number.isSafeInteger(value.oralRevealedCount)||value.oralRevealedCount<0||value.oralRevealedCount>value.verseCount||typeof value.showAll!=='boolean'||typeof value.checked!=='boolean')throw Error('Start this passage’s recall again.');
 for(const method of ['full','first']){
  const coverage=value.coverage?.[method];
  if(!coverage||!Array.isArray(coverage.verses)||coverage.verses.length!==value.verseCount||coverage.verses.some(flag=>typeof flag!=='boolean')||typeof coverage.passage!=='boolean')throw Error('Start this passage’s recall again.');
  // Array.from also rejects sparse state: missing flags must never count as checked.
  if(Array.from(coverage.verses).some(flag=>typeof flag!=='boolean'))throw Error('Start this passage’s recall again.');
  result.coverage[method]={verses:[...coverage.verses],passage:coverage.passage};
 }
 Object.assign(result,{verseIndex:value.verseIndex,oralRevealedCount:value.oralRevealedCount,showAll:value.showAll,checked:value.checked});
 if(result.method==='oral'&&(result.checked||result.showAll))throw Error('Start this passage’s recall again.');
 if(result.method!=='oral'&&result.oralRevealedCount!==0)throw Error('Start this passage’s recall again.');
 if(result.method!=='oral'&&result.checked&&!(result.scope==='verse'?result.coverage[result.method].verses[result.verseIndex]:result.coverage[result.method].passage))throw Error('Start this passage’s recall again.');
 return result;
}

/**
 * A saved place restores method/scope/index/coverage, but text starts hidden again.
 * Explicit method/scope options override the saved preference. Checked coverage is
 * local UI history only; it never claims that practice or a review was saved.
 */
export function createRecallFlow(options={}){
 const {verseCount,saved}=options;
 const prior=saved===undefined||saved===null?null:stateOf(saved);
 if(prior&&prior.verseCount!==verseCount)throw Error('The passage changed. Start its recall again.');
 const method=options.method===undefined?(prior?.method??'oral'):options.method,scope=options.scope===undefined?(prior?.scope??'verse'):options.scope;
 const result=initial(verseCount,method,scope);
 if(prior){result.verseIndex=prior.verseIndex;result.coverage=prior.coverage;}
 return result;
}

function viewOf(state){
 const oral=state.method==='oral',one=state.scope==='verse';
 const all=()=>Array.from({length:state.verseCount},(_,index)=>index);
 const visibleVerseIndices=oral?Array.from({length:state.oralRevealedCount},(_,index)=>index):state.showAll?all():state.checked?(one?[state.verseIndex]:all()):[];
 const coverage=oral?null:state.coverage[state.method];
 const canFinishReview=oral?state.oralRevealedCount===state.verseCount:one?coverage.verses.every(Boolean):coverage.passage;
 return {...state,visibleVerseIndices,targetVerseIndices:oral?[]:one?[state.verseIndex]:all(),canRevealNext:oral&&state.oralRevealedCount<state.verseCount,canShowAll:oral?state.oralRevealedCount<state.verseCount:!state.showAll,canHide:visibleVerseIndices.length>0,canCheck:!oral,canNext:!oral&&one&&state.checked&&state.verseIndex<state.verseCount-1,canPrevious:!oral&&one&&state.verseIndex>0,canFinishReview,checkedVerseCount:oral?0:coverage.verses.filter(Boolean).length};
}

export function recallFlowView(flow){return viewOf(stateOf(flow));}

/**
 * Supported actions: method/scope ({value}), reveal-next, show-all, hide,
 * check, next, previous, edit, restart. Check is a local acknowledgement,
 * not a correctness threshold. Partial practice remains an app-owned explicit
 * save and is deliberately NOT gated by canFinishReview.
 */
export function advanceRecallFlow(flow,action){
 const state=stateOf(flow),event=typeof action==='string'?{type:action}:action;
 if(!event||typeof event.type!=='string')throw Error('Choose a recall action.');
 const view=viewOf(state);
 if(event.type==='method'||event.type==='scope'){
  const next=event.type==='method'?event.value:state.method,scope=event.type==='scope'?event.value:state.scope;
  const result=initial(state.verseCount,next,scope);
  result.verseIndex=state.verseIndex;result.coverage=state.coverage;
  return result;
 }
 if(event.type==='reveal-next'){
  if(!view.canRevealNext)throw Error('There is no next hidden verse.');
  state.oralRevealedCount++;return state;
 }
 if(event.type==='show-all'){
  if(state.method==='oral')state.oralRevealedCount=state.verseCount;
  else state.showAll=true;
  return state;
 }
 if(event.type==='hide'){
  state.oralRevealedCount=0;state.showAll=false;state.checked=false;return state;
 }
 if(event.type==='check'){
  if(state.method==='oral')throw Error('Choose a typing method before checking an answer.');
  state.checked=true;
  if(state.scope==='verse')state.coverage[state.method].verses[state.verseIndex]=true;
  else state.coverage[state.method].passage=true;
  return state;
 }
 if(event.type==='next'||event.type==='previous'){
  if(!(event.type==='next'?view.canNext:view.canPrevious))throw Error(event.type==='next'?'Check this verse before moving to the next verse.':'There is no previous verse in this recall view.');
  state.verseIndex+=event.type==='next'?1:-1;state.checked=false;state.showAll=false;return state;
 }
 if(event.type==='edit'){
  if(state.method==='oral')throw Error('Choose a typing method before entering an answer.');
  if(state.scope==='verse')state.coverage[state.method].verses[state.verseIndex]=false;
  else state.coverage[state.method].passage=false;
  state.checked=false;state.showAll=false;return state;
 }
 if(event.type==='restart')return initial(state.verseCount,state.method,state.scope);
 throw Error('Choose a supported recall action.');
}
