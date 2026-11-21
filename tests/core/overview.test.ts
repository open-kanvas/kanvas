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

describe("overview coverage 1", () => {


describe("overview contracts",()=>{
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
  it('returns bounded real retained previews only for the explicitly displayed overview',async()=>{
    const other=(await owner.display(s,'Source')).id;await owner.submit(s,[other],fact('An actual retained idea'));await owner.submit(s,[other],{version:1,template:'number',data:{value:'123456789.0001'}});
    await owner.submit(s,[d],{version:1,template:'overview',data:{displayIds:[other]}});
    const cards=success(await owner.request<{cards:{revision:number;view?:unknown}[]}>('GET',`${path()}/overview`)).cards;expect(cards).toHaveLength(2);expect(cards.every(c=>!c.view)).toBe(true);
    const preview=success(await owner.request<{view:ViewSpec}>('GET',`${path()}/overview/preview?sourceDisplayId=${other}&revision=1`));expect(preview.view.data.text).toBe('An actual retained idea');
    const g=await guest(false);expect(success(await g.request<{view:ViewSpec}>('GET',`${path()}/overview/preview?sourceDisplayId=${other}&revision=2`)).view.data.value).toBe('123456789.0001');
    denied(await g.request('GET',`${path()}/overview/preview?sourceDisplayId=${d}&revision=1`));await owner.submit(s,[d],fact('Gallery closed'));denied(await g.request('GET',`${path()}/overview/preview?sourceDisplayId=${other}&revision=1`),[409]);
  });});
});
