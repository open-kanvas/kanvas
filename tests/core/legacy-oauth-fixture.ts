import { hash } from '../../src/server/auth.js';
import type { Harness, Browser } from './harness.js';
/** Simulate a selected-session authorization code persisted by a pre-upgrade release.
 * New consent is account-only; these fixtures verify old grants never widen. */
export async function legacySelectedCode(h:Harness,code:string,sessionIds:string[]){
 const grant=await h.runtime.store.get<any>('oauth-code',hash(code));if(!grant)throw new Error('Missing test grant');
 await h.runtime.store.put('oauth-code',{...grant,accessMode:'selected',sessionIds});
}

/** Seed only the precondition for protocol/legacy-grant tests. The real email
 * request/confirm/origin-proof lifecycle is independently exercised in
 * feedback-oct29.test.ts and browser acceptance; this helper is never app code. */
export async function verifiedEmailConsent(h:Harness,browser:Browser,requestId:string){
 const cookie=browser.cookies.get(h.runtime.auth.cookieName);if(!cookie)throw new Error('Missing test browser');
 const session=await h.runtime.store.get<any>('browser',hash(cookie));if(!session)throw new Error('Missing test session');
 await h.runtime.store.put('oauth-email-verification',{id:requestId,userId:session.userId,browserId:session.id,expiresAt:Date.now()+300000});
}
