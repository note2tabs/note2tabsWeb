/** Small, bounded, opt-in action-outcome monitor. No DOM scanning or per-frame work. */
export type FrustrationAction = 'editor_edit' | 'editor_save' | 'editor_play' | 'editor_import' | 'editor_export' | 'transcription_submit' | 'upload_start' | 'checkout_open';
type Result = 'success' | 'failed' | 'cancelled';
type Incident = {action:FrustrationAction; reason:'repeated_failure'|'repeated_no_progress'; attempts:number; elapsed_ms:number};
type Bucket = {at:number; failures:number; lastReport?:number};
const WINDOW_MS=60_000, COOLDOWN_MS=300_000, MAX_PENDING=16;
let generation=0;
let report:((incident:Incident)=>void)|undefined;
const retries=new Map<FrustrationAction,number>();
const buckets=new Map<FrustrationAction,Bucket>();
const pending=new Set<ReturnType<typeof setTimeout>>();
const noop=(_result:Result)=>{};
export function configureFrustrationSignals(sink?:typeof report){
 generation++;
 for(const timer of pending)clearTimeout(timer);
 pending.clear();buckets.clear();retries.clear();report=sink;
}
function outcome(action:FrustrationAction,result:Result,started:number,stalled=false){
 if(!report || result==='cancelled')return;
 const now=Date.now();
 const old=buckets.get(action);
 if(result==='success'){if(old)old.failures=0;return;}
 const bucket=old && now-old.at<=WINDOW_MS ? old : {at:now,failures:0,lastReport:old?.lastReport};
 bucket.failures++;buckets.set(action,bucket);
 if(bucket.failures<3 || (bucket.lastReport!==undefined && now-bucket.lastReport<COOLDOWN_MS))return;
 bucket.lastReport=now;
 try{report({action,reason:stalled?'repeated_no_progress':'repeated_failure',attempts:bucket.failures,elapsed_ms:Math.max(0,now-started)});}catch{/* Monitoring cannot break the action. */}
}
/** Synchronous edits use zero timers, observers, snapshots or network requests. */
export function monitorEditorEdit<T>(apply:()=>T, didApply?:(value:T)=>boolean):T{
 if(!report)return apply();
 const at=Date.now();
 try{const result=apply();outcome('editor_edit',!didApply || didApply(result)?'success':'failed',at);return result;}
 catch(error){outcome('editor_edit','failed',at);throw error;}
}
export function resetFrustrationContext(){configureFrustrationSignals(report);}
export function noteFrustrationRetry(action:FrustrationAction){if(report)retries.set(action,Math.min(2,(retries.get(action)??0)+1));}
export function beginFrustrationAction(action:FrustrationAction,timeoutMs=30_000){
 if(!report || pending.size>=MAX_PENDING)return noop;
 const started=Date.now(), epoch=generation;let terminal=false, timedOut=false;
 const timer=setTimeout(()=>{
  pending.delete(timer);
  if(terminal || epoch!==generation)return;
  // Background-tab timer throttling is not evidence of a broken action.
  if(typeof document!=='undefined' && document.visibilityState==='hidden')return;
  timedOut=true;
  const attempts=1+(retries.get(action)??0);retries.delete(action);
  for(let i=0;i<attempts;i++)outcome(action,'failed',started,true);
 },timeoutMs);
 pending.add(timer);
 return (result:Result)=>{
  if(terminal || epoch!==generation)return;terminal=true;clearTimeout(timer);pending.delete(timer);
  if(result!=='failed')retries.delete(action);
  if(!timedOut || result==='success')outcome(action,result,started);
 };
}
export async function monitorFrustrationPromise<T>(action:FrustrationAction,run:()=>Promise<T>):Promise<T>{
 const finish=beginFrustrationAction(action);
 try{const value=await run();finish('success');return value;}
 catch(error){finish(error instanceof Error && error.name==='AbortError'?'cancelled':'failed');throw error;}
}
