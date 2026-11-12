export const SESSION_VIEW_LIMIT = 1000;
import type { Store } from './store.js';
import type { SessionRecord } from '../shared/types.js';
export type AccountTier = 'trial' | 'free' | 'admin';
/** Quota entitlement only. This NEVER grants service-administrator authorization.
 * Missing records and unknown future/malformed values fail closed to trial.
 * Operators manage documents(kind=account-tier,id=userId,value={id,tier}). */
export async function accountTier(store: Store, userId: string): Promise<AccountTier> {
 const record = await store.get<{tier?: string}>('account-tier', userId);
 return record?.tier === 'free' || record?.tier === 'admin' ? record.tier : 'trial';
}
export async function accountUsageLimits(store: Store, userId: string) {
 const tier = await accountTier(store, userId);
 return tier === 'trial' ? {...usageLimits(), tier} : {sessions: Infinity, views: SESSION_VIEW_LIMIT, tier};
}
export async function sessionUsageLimits(store: Store, sessionId: string) {
 const session = await store.get<SessionRecord>('session', sessionId, true);
 return session ? accountUsageLimits(store, session.ownerId) : {...usageLimits(), tier: 'trial' as const};
}
/** Deployment-admin trial guardrails. Safety/storage budgets still apply to all tiers. */
export function usageLimits(){
 const read=(name:string,fallback:number)=>{const raw=process.env[name];if(raw===undefined||raw==='')return fallback;const n=Number(raw);if(!Number.isSafeInteger(n)||n<1||n>100000)throw new Error(`${name} must be a positive integer up to 100000.`);return n;};
 return {sessions:read('KANVAS_MAX_SESSIONS_PER_ACCOUNT',10),views:SESSION_VIEW_LIMIT};
}

/** Where a higher limit is requested until paid plans exist. Configuration, not copy. */
export const limitContact=()=>process.env.KANVAS_LIMIT_CONTACT?.trim()||'kanvas@open-kanvas.ai';
/** Archived sessions do not use a slot, but storage is still bounded: this many
 * times the session limit may be stored in total, archived ones included. */
export const STORED_SESSION_FACTOR=5;
export type LimitCode='SESSION_LIMIT_REACHED'|'SESSION_STORAGE_LIMIT_REACHED'|'VIEW_LIMIT_REACHED';
export interface LimitDetails {code:LimitCode;limit:number;used:number;resource:'sessions'|'storedSessions'|'views';tier:string;whatYouCanDo:string[];contact:string;paidPlans:false}
/** One honest sentence set per limit. The numbers come from the same values
 * that enforce the limit; when paid plans ship only the last sentence changes. */
export function limitMessage(code:LimitCode,limit:number):string{
 const more=`Need more? Paid plans aren't available yet. Email ${limitContact()} to request a higher limit.`;
 if(code==='SESSION_LIMIT_REACHED')return `You've reached the free limit of ${limit} sessions on this account, so a new session can't be created. You can keep using your existing sessions, or archive one you no longer need to free up a slot. ${more}`;
 if(code==='SESSION_STORAGE_LIMIT_REACHED')return `You've reached the free limit of ${limit} stored sessions on this account, counting archived ones, so a new session can't be created. You can keep using your existing sessions, or permanently delete an archived session you no longer need to free up space. ${more}`;
 return `You've reached the free limit of ${limit} views in this session, so a new view can't be added. Everything already shown stays available. You can permanently delete views you no longer need, or continue in a new session. ${more}`;
}
