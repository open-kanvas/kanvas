import {createApp} from '../../src/server/app';
import {afterEach,expect,it} from 'vitest';
import {createHash,randomBytes} from 'node:crypto';
import {startHarness,success,type Harness} from './harness';
import {chartDataSchema} from '../../src/shared/chart-contract';
import {stackChart} from '../../src/shared/chart-stacks';
import {feedbackSubmitSchema} from '../../src/shared/reports';
import {visualHelp} from '../../src/server/visual-help';
import {HELP_TOPICS} from '../../src/shared/help';
let h:Harness;afterEach(async()=>{await h?.close();});
it('isolates named guidance libraries and copies activation without changing standing guidance',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),p={userId:owner.user!.id},q={userId:other.user!.id},session=await owner.session(),g=h.runtime.service.guidance;
 const input={promptId:'passive',name:'Passive',text:'Wait for my explicit request.',expectedRevision:0,requestId:'save'};
 const saved:any=await g.library(p,input,'save');expect(saved.revision).toBe(1);expect(await g.library(p,input,'save')).toEqual(saved);
 expect((await g.library(q,{},'list') as any).prompts).toEqual([]);
 await expect(g.library(q,{promptId:'passive',sessionId:session.id,expectedRevision:0,requestId:'steal'},'activate')).rejects.toThrow();
 await g.library(p,{promptId:'passive',sessionId:session.id,expectedRevision:0,requestId:'activate'},'activate');expect((await g.read(p,{scope:'session',sessionId:session.id})).text).toBe(input.text);
 await g.library(p,{promptId:'passive',expectedRevision:1,requestId:'delete'},'delete');expect((await g.read(p,{scope:'session',sessionId:session.id})).text).toBe(input.text);expect((await g.read(p,{scope:'user'})).text).not.toBe(input.text);
 await expect(g.library(p,{...input,text:'race',requestId:'stale',expectedRevision:1},'save')).rejects.toMatchObject({code:'REVISION_CONFLICT'});
});
it('six-letter session approval grants only its session and cannot access another account surface',async()=>{
 h=await startHarness();const owner=await h.account(),session=await owner.session(),other=await owner.session(),screen=h.browser();
 const pending=success(await screen.request<any>('POST','/api/login/request',{})),review=success(await owner.request<any>('POST','/api/login/lookup',{code:pending.code}));
 success(await owner.request('POST','/api/login/decide',{code:pending.code,approvalToken:review.approvalToken,approve:true,confirm:true,scope:'session',sessionId:session.id}));
 const claim=success(await screen.request<any>('POST','/api/login/claim',{}));expect(claim.viewerUrl).toBe('/session/'+session.id);
 const me=success(await screen.request<any>('GET','/api/auth/me'));expect(me.viewOnly).toBe(true);expect(me.sessionId).toBe(session.id);expect(me.user.email).toBeUndefined();expect(me.user.id).not.toBe(owner.user!.id);expect(me.user.username).toBe('guest');screen.csrf=me.csrfToken;
 for(const path of ['/api/preferences','/api/tokens','/api/reports','/api/groups'])expect((await screen.request('GET',path)).status,path).toBe(403);
 expect((await screen.request('POST','/api/sessions/'+session.id+'/submit',{requestId:'cannot-publish',view:{version:1,template:'fact',data:{text:'Must not publish'}}})).status).toBe(403);
 expect((await screen.request('GET','/api/sessions/'+session.id)).status).toBe(200);expect((await screen.request('GET','/api/sessions/'+other.id)).status).toBe(403);const sessions=success(await screen.request<any[]>('GET','/api/sessions'));expect(sessions.map(s=>s.id)).toEqual([session.id]);
 expect((await screen.request('POST','/api/login/claim',{})).status).toBeGreaterThanOrEqual(400);
});
it('groups positive/negative and percent stacks independently and never adds a secondary line to bars',()=>{
 const points=(y:number)=>[{x:'A',y}],data=chartDataSchema.parse({kind:'bar',stacking:'stacked',series:[{name:'a1',stackGroup:'a',points:points(2)},{name:'a2',stackGroup:'a',points:points(3)},{name:'b1',stackGroup:'b',points:points(8)},{name:'b2',stackGroup:'b',points:points(-2)},{name:'trend',kind:'line',axis:'secondary',points:points(45)}]});
 const model=stackChart(data);expect(model.barGroups).toHaveLength(2);expect(model.series.map(s=>[s[0].start,s[0].end])).toEqual([[0,2],[2,5],[0,8],[0,-2],[0,45]]);
 const percent=stackChart(chartDataSchema.parse({...data,stacking:'percent',series:data.series.filter(s=>s.name!=='b2')}));expect(percent.series.map(s=>s[0].end)).toEqual([40,100,100,45]);
});
it('accepts scope-free feedback context, preserves account provenance, and refuses foreign context',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),session=await owner.session(),s=h.runtime.service;
 const input=feedbackSubmitSchema.parse({requestId:'general',title:'Feedback',description:'A general report'});expect(feedbackSubmitSchema.safeParse({...input,scope:'service'}).success).toBe(false);
 const record=await s.reports.submit({userId:owner.user!.id},'feedback',input);expect(record.accountId).toBe(owner.user!.id);expect(record).not.toHaveProperty('scope');expect(record).not.toHaveProperty('sessionId');
 expect((await s.reports.read({userId:other.user!.id},{allAccounts:false,kind:'all',status:'all',limit:10})).reports).toEqual([]);
 await expect(s.reports.submit({userId:other.user!.id},'feedback',{...input,requestId:'foreign',sessionId:session.id})).rejects.toThrow();
});
it('generates bounded reusable help pages for every topic without dropping words',()=>{
 for(const topic of HELP_TOPICS){const first=visualHelp({topic});expect(first.pageCount).toBeGreaterThan(0);for(let page=0;page<first.pageCount;page++){const result=visualHelp({topic,page});expect(String(result.view.data.text).length).toBeLessThanOrEqual(650);}}
});
it('requires fresh email for OAuth and completes only the originating browser, preserving state/PKCE',async()=>{
 let link='';h=await startHarness({signinMailer:async(_email,url)=>{link=url;}});const owner=h.browser(),origin=h.browser(),emailBrowser=h.browser();success(await owner.request('POST','/api/auth/email/request',{email:'owner@example.invalid'}));const initialToken=new URL(link).hash.split('=')[1];const initial=success(await owner.request<any>('POST','/api/auth/email/consume',{token:initialToken,confirm:true,acceptedLegalVersion:'2026-10-14'}));owner.user=initial.user;owner.csrf=initial.csrfToken;const verifier=randomBytes(32).toString('base64url'),callback='https://client.example/callback';
 const registered=await owner.raw('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Email test',redirect_uris:[callback],grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none'})});const client=await registered.json();
 const state='opaque-'+ 'x'.repeat(1500),query=new URLSearchParams({client_id:client.client_id,redirect_uri:callback,response_type:'code',scope:'read publish',resource:'http://127.0.0.1/mcp',state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
 const authorize=await origin.raw('/oauth/authorize?'+query);expect(authorize.status).toBe(303);const requestId=new URL(authorize.headers.get('location')!).searchParams.get('authorize');
 expect((await owner.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account'})).status).toBe(403);
 success(await origin.request('POST','/api/auth/email/request',{email:owner.user!.username,authorizationRequestId:requestId,acceptedLegalVersion:'2026-10-14'}));
 const token=new URL(link).hash.split('=')[1];expect((await origin.request('POST','/api/auth/email/complete',{})).status).toBe(410);
 const confirmation=success(await emailBrowser.request<any>('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'current'}));expect(confirmation).toEqual({approved:true,connectionReceipt:expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)});const receipt={receipt:confirmation.connectionReceipt};const pending=await emailBrowser.request<any>('POST','/api/auth/email/connection-status',receipt);expect(success(pending)).toEqual({status:'pending'});expect(pending.headers.get('cache-control')).toBe('no-store');expect(success(await emailBrowser.request('POST','/api/auth/email/connection-status',{receipt:randomBytes(32).toString('base64url')}))).toEqual({status:'unavailable'});expect(confirmation).not.toHaveProperty('redirectUri');expect(confirmation).not.toHaveProperty('csrfToken');
 expect((await emailBrowser.request('POST','/api/auth/email/complete',{})).status).toBe(410);
 const signed=success(await origin.request<any>('POST','/api/auth/email/complete',{}));origin.csrf=signed.csrfToken;
 expect((await owner.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account'})).status).toBe(403);
 const approval=success(await origin.request<any>('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account'})),redirect=new URL(approval.redirectUri);expect(redirect.searchParams.get('state')).toBe(state);expect(redirect.searchParams.has('code')).toBe(true);expect(success(await emailBrowser.request('POST','/api/auth/email/connection-status',receipt))).toEqual({status:'connected'});expect((await emailBrowser.request('GET','/api/auth/me')).status).toBe(401);
 expect((await origin.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account'})).status).toBeGreaterThanOrEqual(400);
 expect((await emailBrowser.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'})).status).toBe(410);
});
it('targets named own-account push subscriptions, deduplicates retries and rechecks logout',async()=>{
 const sent:string[]=[];h=await startHarness({pushOptions:{publicKey:'unused-test-key',privateKey:'unused-test-key',subject:'mailto:test@example.invalid',send:async(subscription)=>{sent.push(subscription.endpoint);}}});
 const owner=await h.account(),other=await h.account(),session=await owner.session(),display=await owner.display(session.id),service=h.runtime.service;
 const one=(await h.runtime.store.list<any>('browser')).find(b=>b.userId===owner.user!.id),two=(await h.runtime.store.list<any>('browser')).find(b=>b.userId===other.user!.id),p={userId:owner.user!.id,browserId:one.id},q={userId:other.user!.id,browserId:two.id};
 const subscription=(tag:string)=>({endpoint:'https://fcm.googleapis.com/'+tag,keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}});
 await service.push.subscribe(p,subscription('one'));await service.push.subscribe(q,subscription('two'));
 const targets=await service.push.targets(p);expect(targets.targets).toHaveLength(1);expect(JSON.stringify(targets)).not.toContain('fcm.googleapis');
 await service.push.rename(p,{targetId:targets.targets[0].targetId,name:'My phone'});expect((await service.push.targets(p)).targets[0].name).toBe('My phone');
 await expect(service.push.rename(q,{targetId:targets.targets[0].targetId,name:'Foreign'})).rejects.toThrow();
 const input={sessionId:session.id,displayId:display.id,targetIds:[targets.targets[0].targetId],requestId:'push'};await service.push.notify(p,input);await service.push.notify(p,input);expect(sent).toEqual(['https://fcm.googleapis.com/one']);
 await h.runtime.store.delete('browser',one.id);await expect(service.push.notify(p,{...input,requestId:'after-logout'})).rejects.toThrow();expect(sent).toHaveLength(1);
});
it('native menu commands are own-screen only and signout needs a named confirmed viewer',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),session=await owner.session(),display=await owner.display(session.id),p={userId:owner.user!.id},q={userId:other.user!.id},e=h.runtime.service.experience;
 const args={sessionId:session.id,displayId:display.id,requestId:'native-menu',action:'menu'};
 expect(await e.screenControl(p,args)).toMatchObject({action:'menu',status:'queued'});await expect(e.screenControl(q,{...args,requestId:'foreign'})).rejects.toThrow();
 await expect(e.screenControl(p,{...args,requestId:'logout',action:'signout'})).rejects.toThrow();
});

it('retains named library text, revisions and session activation across an actual service restart',async()=>{
 h=await startHarness();const owner=await h.account(),session=await owner.session(),p={userId:owner.user!.id},g=h.runtime.service.guidance;
 for(let i=0;i<4;i++)await g.library(p,{promptId:'prompt-'+i,name:'Prompt '+i,text:'Exact instructions '+i,requestId:'save-'+i},'save');
 const first:any=await g.library(p,{},'list'),second:any=await g.library(p,{afterId:first.nextCursor},'list');expect(first.prompts).toHaveLength(3);expect(second.prompts).toHaveLength(1);
 await g.library(p,{promptId:'prompt-3',sessionId:session.id,requestId:'activate-persist'},'activate');await h.shutdown();const restored=await createApp({database:h.database});try{expect((await restored.service.guidance.read(p,{scope:'session',sessionId:session.id})).text).toBe('Exact instructions 3');expect((await restored.service.guidance.library(p,{afterId:first.nextCursor},'list') as any).prompts[0]).toMatchObject({name:'Prompt 3',revision:1,text:'Exact instructions 3'});}finally{await restored.close();}
});
