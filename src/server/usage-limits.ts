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
