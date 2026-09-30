import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Browser, ControlledInterpreter, fact, PNG, startHarness, success, type Harness } from './harness.js';
import type { DisplayRecord, UpdateRecord } from '../../src/shared/types.js';

const runtimes:Harness[]=[];
async function start(options:Parameters<typeof startHarness>[0]={}) {const h=await startHarness(options);runtimes.push(h);return h;}
afterEach(async()=>{for(const h of runtimes.splice(0).reverse())await h.close();});

describe('PostgreSQL application continuity',()=>{
  it('keeps accounts, browser sessions, assets, published views and idempotent requests across restart',async()=>{
    const h=await start(),owner=await h.account(),session=await owner.session(),display=await owner.display(session.id),requestId=randomUUID();
    const media=await h.runtime.service.importAsset({userId:owner.user!.id},session.id,{name:'Fixture',mimeType:'image/png',base64:PNG});
    expect((await owner.submit(session.id,[display.id],fact('Persistent view'),requestId)).update.status).toBe('prepared');
    await h.shutdown(); const restarted=await start({database:h.database}),browser=new Browser(restarted.baseUrl);
    for(const [key,value] of owner.cookies)browser.cookies.set(key,value);browser.csrf=owner.csrf;
    expect((await browser.detail(session.id)).displays[0].view?.data.text).toBe('Persistent view');
    expect((await browser.raw(media.url)).status).toBe(200);
    const repeat=success(await browser.request<UpdateRecord>('POST',`/api/sessions/${session.id}/submit`,{displayIds:[display.id],requestId,view:fact('Persistent view')}));
    expect(repeat.status).toBe('prepared');expect((await browser.detail(session.id)).updates.filter(u=>u.requestId===requestId)).toHaveLength(1);
    const stranger=await restarted.account();expect([403,404]).toContain((await stranger.request('GET',`/api/sessions/${session.id}`)).status);
  });

  it('deduplicates simultaneous submissions and rejects concurrent stale revisions',async()=>{
    const h=await start(),owner=await h.account(),session=await owner.session(),display=await owner.display(session.id),p={userId:owner.user!.id};
    const input={sessionId:session.id,displayIds:[display.id],requestId:randomUUID(),view:fact('Original')};
    const outcomes=await Promise.all([h.runtime.service.submit(p,input),h.runtime.service.submit(p,input)]);
    expect(outcomes[0].id).toBe(outcomes[1].id);await owner.settle(session.id,input.requestId);
    const path=`/api/sessions/${session.id}/displays/${display.id}`;
    const current=(await owner.detail(session.id)).displays[0];
    const attempts=await Promise.all([owner.request<DisplayRecord>('PATCH',path,{held:true,expectedRevision:current.revision}),owner.request<DisplayRecord>('PATCH',path,{held:true,expectedRevision:current.revision})]);
    expect(attempts.map(x=>x.status).sort()).toEqual([200,409]);
    expect((await owner.detail(session.id)).displays[0].revision).toBe(current.revision+1);
  });

  it('never publishes a stale preparation result after newer content was committed',async()=>{
    const preparer=new ControlledInterpreter(),h=await start({interpreter:preparer}),owner=await h.account(),session=await owner.session(),display=await owner.display(session.id),p={userId:owner.user!.id};
    const old=await h.runtime.service.submit(p,{sessionId:session.id,displayIds:[display.id],requestId:randomUUID(),context:'Interpret this supplied note.'});
    await preparer.waitFor(1);
    const newer=await owner.submit(session.id,[display.id],fact('Newer wins'));
    expect(newer.update.status).toBe('prepared');
    preparer.calls[0].resolve({action:'replace',view:fact('Obsolete')});
    const settled=await owner.settle(session.id,old.requestId);
    expect(settled.update.status).toBe('superseded');expect(settled.detail.displays[0].view?.data.text).toBe('Newer wins');
  });

  it('commits delivery acknowledgements without reverting them to prepared',async()=>{
    const h=await start(),owner=await h.account(),session=await owner.session(),display=await owner.display(session.id),p={userId:owner.user!.id};
    const published=await owner.submit(session.id,[display.id],fact('Acknowledgement'));
    await h.runtime.service.applied(p,session.id,display.id,published.detail.displays[0].revision);
    await vi.waitFor(async()=>expect((await owner.detail(session.id)).updates.find(x=>x.id===published.update.id)?.status).toBe('applied'));
  });
});
