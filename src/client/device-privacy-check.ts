/** One bounded verification of this browser's privacy-lock state.
 *
 * A phone that has just been reopened often has a half-awake network: the
 * first request either fails at once or hangs on a dead connection. Waiting for
 * one request to time out and then pausing a second made the reopen take six to
 * eight seconds. A cycle therefore hedges: a quick failure is retried almost
 * immediately and a silent request gets a parallel sibling, all inside the same
 * four-second bound the privacy contract already documents. The first definite
 * answer wins. No answer inside the bound is reported as unknown, and unknown
 * always hides content. */
export type PrivacyAnswer='open'|'locked';
export interface PrivacyCycleResult {answer:PrivacyAnswer|'unknown';attempts:number;elapsedMs:number}
export interface PrivacyCycleOptions {
 probe:(signal:AbortSignal)=>Promise<PrivacyAnswer>;
 /** Hard bound for the whole cycle. Content is hidden once it passes. */
 deadlineMs?:number;
 /** A request silent for this long gets a parallel sibling. */
 hedgeAfterMs?:number;
 /** Pause after a request that failed outright; doubles per failure in a cycle. */
 retryAfterMs?:number;
 /** Content is currently visible: the first outright failure ends the cycle as
  * unknown at once (hide now, verify again hidden) instead of retrying in view. */
 failFast?:boolean;
 maxAttempts?:number;
 signal?:AbortSignal;
 now?:()=>number;
}
export const PRIVACY_DEADLINE_MS=4000,PRIVACY_HEDGE_MS=1200,PRIVACY_RETRY_MS=200,PRIVACY_MAX_ATTEMPTS=6;
export function runPrivacyCycle(options:PrivacyCycleOptions):Promise<PrivacyCycleResult>{
 const deadlineMs=options.deadlineMs??PRIVACY_DEADLINE_MS,hedgeAfterMs=options.hedgeAfterMs??PRIVACY_HEDGE_MS,retryAfterMs=options.retryAfterMs??PRIVACY_RETRY_MS,maxAttempts=options.maxAttempts??PRIVACY_MAX_ATTEMPTS;
 const now=options.now??(()=>performance.now()),started=now();
 return new Promise(resolve=>{
  const controllers=new Set<AbortController>(),timers=new Set<ReturnType<typeof setTimeout>>();
  let attempts=0,pending=0,failed=0,settled=false;
  const finish=(answer:PrivacyCycleResult['answer'])=>{
   if(settled)return;settled=true;
   for(const timer of timers)clearTimeout(timer);for(const controller of controllers)controller.abort();
   options.signal?.removeEventListener('abort',cancelled);
   resolve({answer,attempts,elapsedMs:Math.max(0,Math.round(now()-started))});
  };
  const cancelled=()=>finish('unknown');
  const later=(run:()=>void,ms:number)=>{const timer=setTimeout(()=>{timers.delete(timer);run();},ms);timers.add(timer);};
  const attempt=()=>{
   if(settled||attempts>=maxAttempts)return;
   attempts++;pending++;const controller=new AbortController();controllers.add(controller);
   // Only one hedge per request: a second silent request starts its own.
   later(attempt,hedgeAfterMs);
   options.probe(controller.signal).then(finish,()=>{
    controllers.delete(controller);pending--;failed++;
    if(settled)return;
    if(options.failFast||(attempts>=maxAttempts&&pending===0))return finish('unknown');
    later(()=>{if(pending===0)attempt();},retryAfterMs*2**(failed-1));
   });
  };
  if(options.signal?.aborted)return finish('unknown');
  options.signal?.addEventListener('abort',cancelled);
  later(()=>finish('unknown'),deadlineMs);attempt();
 });
}
/** Pause before the next cycle while the state is unknown: quick at first so a
 * waking radio is caught early, never slower than the former fixed second. */
export const privacyBackoffMs=(failedCycles:number)=>Math.min(1000,150*2**Math.max(0,failedCycles-1));
export async function probePrivacyStatus(signal:AbortSignal):Promise<PrivacyAnswer>{
 const response=await fetch('/api/device-privacy/status',{credentials:'same-origin',cache:'no-store',signal});
 if(!response.ok)throw Error('Status unavailable');
 const result=await response.json();
 if(typeof result.data?.locked!=='boolean')throw Error('Invalid status');
 return result.data.locked?'locked':'open';
}
