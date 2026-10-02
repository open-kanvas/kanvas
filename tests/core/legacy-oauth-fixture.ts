import { hash } from '../../src/server/auth.js';
import type { Harness } from './harness.js';
/** Simulate a selected-session authorization code persisted by a pre-upgrade release.
 * New consent is account-only; these fixtures verify old grants never widen. */
export async function legacySelectedCode(h:Harness,code:string,sessionIds:string[]){
 const grant=await h.runtime.store.get<any>('oauth-code',hash(code));if(!grant)throw new Error('Missing test grant');
 await h.runtime.store.put('oauth-code',{...grant,accessMode:'selected',sessionIds});
}
