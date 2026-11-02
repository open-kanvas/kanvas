import {afterEach,expect,it} from 'vitest';
import {startHarness,type Harness} from './harness';
import {SuggestedGuidance} from '../../src/server/suggested-guidance';
let h:Harness;afterEach(async()=>{await h?.close();});
it('keeps catalog, copies and active guidance distinct, guards revisions and admin ownership',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),admin=await h.account(),p={userId:owner.user!.id},q={userId:other.user!.id},ap={userId:admin.user!.id},service=h.runtime.service,g=new SuggestedGuidance(service);
 service.accounts.serviceAdmins.add(ap.userId);
 const active=await service.guidance.read(p,{scope:'user'});
 expect((await service.guidance.library(p,{},'list') as any).prompts).toHaveLength(0);
 const catalog:any=await g.run(p,{},'list');expect(catalog.suggestions).toHaveLength(5);
 expect((await service.guidance.library(p,{},'list') as any).prompts).toHaveLength(0);
 const input={suggestionId:'passive',expectedRevision:1,promptId:'personal',requestId:'copy'};
 const copied:any=await g.run(p,input,'import');expect(copied.activated).toBe(false);expect(await g.run(p,input,'import')).toEqual(copied);
 expect(await service.guidance.read(p,{scope:'user'})).toEqual(active);
 expect((await service.guidance.library(q,{},'list') as any).prompts).toHaveLength(0);
 await service.guidance.library(p,{promptId:'personal',name:'Mine',text:'PRIVATE CUSTOM COPY',expectedRevision:1,requestId:'edit'},'save');
 expect(JSON.stringify(await g.run(q,{},'list'))).not.toContain('PRIVATE CUSTOM COPY');
 const edit={suggestionId:'passive',name:'Updated passive',text:'NEW GLOBAL',expectedRevision:1,requestId:'edit-global'};
 for(const kind of ['save','delete'] as const)await expect(g.run(p,kind==='save'?edit:{suggestionId:'passive',expectedRevision:1,requestId:'denied'},kind)).rejects.toMatchObject({code:'FORBIDDEN'});
 await g.run(ap,edit,'save');
 expect((await service.guidance.library(p,{},'list') as any).prompts[0].text).toBe('PRIVATE CUSTOM COPY');
 expect(await g.run(p,input,'import')).toEqual(copied); // exact retry still returns original snapshot
 await expect(g.run(q,{...input,requestId:'stale'},'import')).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const fresh:any=await g.run(q,{...input,expectedRevision:2,requestId:'new-copy'},'import');expect(fresh.prompt.text).toBe('NEW GLOBAL');
 await expect(g.run(p,{...input,expectedRevision:2,requestId:'overwrite'},'import')).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 await g.run(ap,{suggestionId:'passive',expectedRevision:2,requestId:'delete'},'delete');
 expect(JSON.stringify(await new SuggestedGuidance(service).run(p,{},'list'))).not.toContain('NEW GLOBAL');
 expect((await service.guidance.library(q,{},'list') as any).prompts[0].text).toBe('NEW GLOBAL');
 const s=await owner.session();expect((await service.guidance.read(p,{scope:'session',sessionId:s.id})).text).toBe('');
 await service.guidance.library(p,{promptId:'personal',sessionId:s.id,expectedRevision:0,requestId:'activate'},'activate');
 expect((await service.guidance.read(p,{scope:'session',sessionId:s.id})).text).toBe('PRIVATE CUSTOM COPY');
 const token=await h.runtime.auth.issueToken(p.userId,'selected',['read','publish'],[s.id]);
 await expect(g.run({userId:p.userId,tokenId:token.token.id},{},'list')).rejects.toMatchObject({code:'FORBIDDEN'});
});

