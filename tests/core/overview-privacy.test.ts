import {afterEach,expect,it} from 'vitest';
import {startHarness,type Harness} from './harness.js';
import {discoveryResult} from '../../src/server/mcp/discovery.js';
let h:Harness;const disconnects:Array<()=>unknown>=[];
afterEach(async()=>{for(const disconnect of disconnects.splice(0))await disconnect();await h?.close();});
it('overview reads current account state without creating anything or leaking private templates, sessions, guidance or offline screens',async()=>{
 h=await startHarness();const a=await h.account(),b=await h.account(),service=h.runtime.service,pa={userId:a.user!.id},pb={userId:b.user!.id};
 const own=await a.session('My current topic'),other=await b.session('FOREIGN SESSION SECRET');
 const online=await a.display(own.id,'Laptop'),offline=await a.display(own.id,'Offline TV'),foreign=await b.display(other.id,'FOREIGN SCREEN');
 disconnects.push((await service.experience.receiving.connect(pa,own.id,online.id,'own-tab','Mozilla/5.0')).disconnect);
 disconnects.push((await service.experience.receiving.connect(pb,other.id,foreign.id,'other-tab','Mozilla/5.0')).disconnect);
 await service.guidance.mutate(pa,{scope:'user',text:'MY SAVED GUIDANCE',requestId:'mine'},'set');
 await service.guidance.mutate(pb,{scope:'user',text:'FOREIGN GUIDANCE SECRET',requestId:'theirs'},'set');
 const definition={name:'MY PRIVATE TEMPLATE',schema:{type:'object',properties:{}},html:'<p>Owned</p>',css:''};
 await service.execute('kanvas.account.templates.create',definition,pa);
 await service.execute('kanvas.account.templates.create',{...definition,name:'FOREIGN TEMPLATE SECRET'},pb);
 const fingerprint=async()=>JSON.stringify((await service.store.query('SELECT kind,id,value FROM documents ORDER BY kind,id')).rows);
 const before=await fingerprint(),at=performance.now();
 const overviewContext=await service.discoveryOverview(pa);
 const result=discoveryResult('kanvas_discover',{}, {principal:pa,overviewContext,privateTemplates:await service.customTemplateCatalog(pa),serviceAdmin:await service.discoveryIsAdmin(pa)});
 const elapsed=performance.now()-at;
 const text=JSON.stringify(result);expect(text).toContain('MY PRIVATE TEMPLATE');expect(text).toContain('MY SAVED GUIDANCE');expect(text).toContain('My current topic');expect(text).not.toContain('FOREIGN');expect(text).not.toContain(offline.id);
 expect(overviewContext.screens).toEqual([expect.objectContaining({displayId:online.id,name:'Laptop',connected:true})]);
 expect(await fingerprint()).toBe(before);
 expect(elapsed).toBeLessThan(1000);console.info('overview fixture latency ms',Math.round(elapsed));
 const token=await h.runtime.auth.issueToken(pa.userId,'Selected read',['read'],[own.id]);
 const selected={userId:pa.userId,tokenId:token.token.id,scopes:['read']};
 const restricted=await service.discoveryOverview(selected);
 expect(restricted.savedGuidance).toBeNull();expect(restricted.recentSessions.map(x=>x.id)).toEqual([own.id]);
 expect(await service.customTemplateCatalog(selected)).toEqual([]);expect(await service.discoveryIsAdmin(selected)).toBe(false);
 service.accounts.serviceAdmins.add(pa.userId);expect(await service.discoveryIsAdmin(pa)).toBe(true);expect(await service.discoveryIsAdmin(selected)).toBe(false);
},30000);
it('empty accounts can load overview repeatedly without provisioning a session or account entry',async()=>{
 h=await startHarness();const a=await h.account(),service=h.runtime.service,p={userId:a.user!.id};
 const before=JSON.stringify((await service.store.query('SELECT kind,id,value FROM documents ORDER BY kind,id')).rows);
 for(let n=0;n<2;n++){const result=await service.discoveryOverview(p);expect(result.screens).toEqual([]);expect(result.recentSessions).toEqual([]);}
 expect(JSON.stringify((await service.store.query('SELECT kind,id,value FROM documents ORDER BY kind,id')).rows)).toBe(before);
});
