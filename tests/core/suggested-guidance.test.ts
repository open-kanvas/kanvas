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


it('supports omitted current-state guards while preserving explicit CAS, retries and administration',async()=>{
 h=await startHarness();const admin=await h.account(),reader=await h.account(),ap={userId:admin.user!.id},p={userId:reader.user!.id},service=h.runtime.service;service.accounts.serviceAdmins.add(ap.userId);
 const call=(who:typeof p,name:string,args:Record<string,unknown>)=>service.execute('kanvas_guidance_suggestions_'+name,args,who);
 const create={suggestionId:'optional',name:'Optional',text:'Original',requestId:'create'};
 await expect(call(p,'save',create)).rejects.toMatchObject({code:'FORBIDDEN'});
 const created:any=await call(ap,'save',create);expect(created.revision).toBe(1);expect(await call(ap,'save',create)).toEqual(created);
 await expect(call(ap,'save',{...create,requestId:'create-only',expectedRevision:0})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const updated:any=await call(ap,'save',{...create,text:'Current content',requestId:'update'});expect(updated.revision).toBe(2);
 await expect(call(ap,'save',{...create,expectedRevision:1,requestId:'stale-edit'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const copy={suggestionId:'optional',promptId:'copied',requestId:'copy-current'};
 const imported:any=await call(p,'import',copy);expect(imported.prompt.text).toBe('Current content');expect(imported.source.revision).toBe(2);expect(imported.activated).toBe(false);
 expect(await call(p,'import',copy)).toEqual(imported);
 await expect(call(p,'import',{...copy,requestId:'no-overwrite'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 await expect(call(p,'import',{...copy,promptId:'other',expectedRevision:1,requestId:'stale-import'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 await expect(call(p,'delete',{suggestionId:'optional',requestId:'unauthorized-delete'})).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(call(ap,'delete',{suggestionId:'optional',expectedRevision:1,requestId:'stale-delete'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const removed:any=await call(ap,'delete',{suggestionId:'optional',requestId:'delete-current'});expect(removed).toMatchObject({revision:3,deleted:true});
 expect((await service.guidance.library(p,{},'list') as any).prompts[0].text).toBe('Current content');
});
