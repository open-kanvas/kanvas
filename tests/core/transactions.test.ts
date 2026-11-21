import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { PNG } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { DisplayRecord } from '../../src/shared/types.js';
import type { InteractionRecord } from '../../src/shared/types.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';

describe("transactions coverage 1", () => {


describe("transactions contracts",()=>{
  let h!:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
  const path=()=>`/api/sessions/${s}/displays/${d}`;
  const call=async <T=Record<string,unknown>>(name:string,args:unknown)=>(await h.runtime.service.execute(name,args,p)) as Promise<T>;
  const current=async()=> (await owner.detail(s)).displays.find(x=>x.id===d)!;
  const settle=async(update:UpdateRecord)=>owner.settle(s,update.requestId);
  beforeEach(async()=>{h=await startHarness();owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
  afterEach(async()=>{await h?.close();});
  async function guest(interactive:boolean){
    const share=await call<{id:string}>('kanvas_share_create',{sessionId:s,displayId:d,allowInteraction:interactive});const g=h.browser();
    const pair=success(await g.request<{id:string}>('POST','/api/pairings',{shareId:share.id,deviceName:'Evening test screen',requestedInteractive:interactive}));
    await call('kanvas_pairing_decide',{sessionId:s,pairingId:pair.id,approve:true,confirm:true,interactive});success(await g.request('GET',`/api/pairings/${pair.id}/status`));g.csrf=success(await g.request<{csrfToken:string}>('GET','/api/auth/me')).csrfToken;return g;
  }
  // Static tour lifecycle cases were retired with demo publication.
  // navigation-help.test exercises read-only legacy compatibility and no side effects.
  it('rolls back nested composite writes without leaving a partially committed inner transaction',async ()=>{
    (await expect((async ()=>(await h.runtime.store.transaction(async ()=>{(await h.runtime.store.put('test',{id:'outer'}));(await h.runtime.store.transaction(async ()=>(await h.runtime.store.put('test',{id:'inner'}))));throw new Error('Rollback');})))()).rejects.toThrow());expect((await h.runtime.store.list('test'))).toEqual([]);
    (await h.runtime.store.transaction(async ()=>{(await h.runtime.store.put('test',{id:'kept'}));try{(await h.runtime.store.transaction(async ()=>{(await h.runtime.store.put('test',{id:'discard'}));throw new Error('Inner rollback');}));}catch{}}));expect((await h.runtime.store.list<{id:string}>('test')).map(x=>x.id)).toEqual(['kept']);
  });});
});
