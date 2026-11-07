import {KANVAS_VERSION} from '../shared/version.js';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import type {Store} from './store.js';
import type {AuthPrincipal} from './auth.js';
export interface EventContext {userId?:string;principal?:string;sessionId?:string;displayId?:string;client?:Record<string,unknown>}
export const eventContext=new AsyncLocalStorage<EventContext>();
export function attribute(p:AuthPrincipal){const c=eventContext.getStore();if(c){c.userId=p.userId;c.principal=p.tokenId?`token:${p.tokenId}`:`user:${p.userId}`;}}
const fields=['deviceId','windowId','commandId','reason','template','revision','status','stage','type','operation','event','errorCode','kind','role','locked','visible','width','height','renderedRevision','durationMs','elapsedMs','clientRelease','release'] as const;
const scalar=(v:unknown)=>typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&/^[A-Za-z0-9_.:/ -]{0,120}$/.test(v);
/** Explicit structural allowlist: never include raw content, arguments, tokens,
 * passwords, query strings, URLs, report prose, labels or arbitrary payloads. */
export function eventProperties(value:Record<string,unknown>){const out:Record<string,unknown>={};for(const key of fields)if(scalar(value[key]))out[key]=value[key];const view=value.view;if(view&&typeof view==='object'&&typeof (view as any).template==='string')out.template=(view as any).template;return out;}
export async function rawEvent(store:Store,eventType:string,input:{userId?:string;principal?:string;sessionId?:string;displayId?:string;operation?:string;status?:string;durationMs?:number;client?:Record<string,unknown>;properties?:Record<string,unknown>}={}){
 const c=eventContext.getStore();
 const userId=c?.userId??input.userId;
 if(userId)await store.query('UPDATE users SET last_seen_at=clock_timestamp() WHERE id=$1',[userId]);
 await store.query('INSERT INTO events(event_id,user_id,principal,session_id,display_id,event_type,operation,status,duration_ms,client_context,properties) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)',[randomUUID(),userId??null,input.principal??c?.principal??null,input.sessionId??c?.sessionId??null,input.displayId??c?.displayId??null,eventType,input.operation??null,input.status??null,input.durationMs??null,JSON.stringify({...c?.client,...input.client}),JSON.stringify({...input.properties,serverVersion:KANVAS_VERSION})]);
}
export const trackedKinds=new Set(['image-diagnostic','delivery-paint','navigation','navigation-receipt','pin-receipt','progress-receipt','chat-receipt','view-pin','session','display','display-history','update','lifecycle','registered-device','audit-event','tool-log-event','diagnostic','navigation-command','navigation-ack','invitation','group-member','pairing','device-privacy','satisfaction-response','interaction','account-entry','browser','device-login','device-request','email-signin','screen-enrollment','agent-connection','work','publish-intent','publish-receipt','toast']);
