import {diagnosticEventSchema,diagnosticRoute,type DiagnosticEvent} from '../shared/frontend-diagnostics';
import {KANVAS_VERSION} from '../shared/version';
import {viewerTabId} from './window-identity';
const referenceKey='kanvas-diagnostic-reference',queueKey='kanvas-diagnostic-buffer';
export const supportReference=(()=>{try{const value=sessionStorage.getItem(referenceKey);if(value&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))return value;const fresh=crypto.randomUUID();sessionStorage.setItem(referenceKey,fresh);return fresh;}catch{return crypto.randomUUID();}})();
let csrf='',queue:DiagnosticEvent[]=[],sending=false,sent=0,pausedUntil=0,last=new Map<string,number>();
try{const saved=sessionStorage.getItem(queueKey);if(saved&&saved.length<=16000){const events:unknown=JSON.parse(saved);if(Array.isArray(events))queue=events.slice(0,40).flatMap(e=>{const r=diagnosticEventSchema.safeParse(e);return r.success&&r.data.clientAt&&Date.now()-r.data.clientAt<86400000?[r.data]:[];});}}catch{/* Storage can be disabled. */}
function persist(){try{sessionStorage.setItem(queueKey,JSON.stringify(queue));}catch{/* Metadata buffering must not affect navigation. */}}

export function diagnostic(e:DiagnosticEvent){
 try{const parsed=diagnosticEventSchema.parse(e),key=JSON.stringify(parsed),time=Date.now();if(time-(last.get(key)??0)<3000)return;
 if(last.size>100)last.clear();last.set(key,time);if(queue.length<40&&sent<240){queue.push({...parsed,clientAt:time});persist();}
 }catch{/* Observability must never break the display. */}
}
/** Telemetry is never posted while this page's sign-in is in doubt: right after a request that can end it (signing
 * out, revoking browsers) and after any refused request. Without the wait, the five-second post could go out with a
 * cookie the server had just revoked, before the page had noticed. Queued events are kept. The wait ends early when
 * the sign-in is confirmed; the events are dropped when the page learns it is signed out. */
let doubtUntil=0;
export function pauseDiagnostics(ms=15000){doubtUntil=Math.max(doubtUntil,Date.now()+ms);}
export function diagnosticsAuthenticated(token:string){if(csrf&&!token){queue=[];persist();}if(token)doubtUntil=0;csrf=token;void flush();}
async function flush(){
 if(!csrf||sending||!queue.length||sent>=240||Date.now()<pausedUntil||Date.now()<doubtUntil)return;sending=true;const events=queue.splice(0,20);persist();sent+=events.length;
 try{const response=await fetch('/api/diagnostics',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json','X-Kanvas-CSRF':csrf},body:JSON.stringify({clientRelease:KANVAS_VERSION,supportRef:supportReference,windowId:viewerTabId(),events}),signal:AbortSignal.timeout(5000)});if(response.ok){const body=await response.json();if(body?.data?.rateLimited===true){const delay=body.data.retryAfterMs;pausedUntil=Date.now()+(typeof delay==='number'&&Number.isFinite(delay)?Math.max(1000,Math.min(60000,delay)):60000);}}}catch{/* No retries/flooding when the service is unavailable. */}finally{sending=false;}
}
export function initializeDiagnostics(){
 diagnostic({event:'startup',route:diagnosticRoute(location.pathname)});
 window.addEventListener('error',e=>diagnostic({event:e.target!==window?'asset-error':'js-error'}),true);
 window.addEventListener('unhandledrejection',()=>diagnostic({event:'js-error'}));
 window.addEventListener('popstate',()=>diagnostic({event:'route',route:diagnosticRoute(location.pathname)}));
 const timer=setInterval(()=>void flush(),5000);window.addEventListener('pagehide',()=>{clearInterval(timer);void flush();},{once:true});
}
