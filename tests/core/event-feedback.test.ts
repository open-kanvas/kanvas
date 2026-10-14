import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { eventViewExamples, consecutiveCalls, standingsDataSchema, type ToolCall } from '../../src/shared/event-views.js';
import { publicSnapshot } from '../../src/server/public-sessions.js';
import { startHarness, success, denied, fact, PNG, type Harness } from './harness.js';
let h:Harness;
afterEach(async()=>{await h?.close();});
const id=()=>randomUUID();

describe('durable prepared-content autoplay',()=>{
  it('retains exact frames, supports non-preset intervals and once/loop, and restores pause/resume after restart',async()=>{
    h=await startHarness();const owner=await h.account(),s=await owner.session(),a=await owner.display(s.id,'First'),b=await owner.display(s.id,'Second'),out=await owner.display(s.id,'Kiosk'),p={userId:owner.user!.id},svc=h.runtime.service;
    await owner.submit(s.id,[a.id],fact('Exact 9007199254740993.0001'));await owner.submit(s.id,[b.id],fact('Second'));
    const input={sessionId:s.id,displayId:out.id,requestId:id(),action:'start',expectedRevision:0,intervalSeconds:2.75,loop:false,frames:[{displayId:a.id},{displayId:b.id}]};
    let run:any=(await svc.autoplay.control(p,input));expect(run).toMatchObject({status:'running',index:0,total:2,intervalSeconds:2.75,loop:false});expect((await svc.autoplay.control(p,input))).toEqual(run);
    (await expect((async ()=>(await svc.autoplay.control(p,{...input,loop:true})))()).rejects.toThrow(/different/));
    (await svc.autoplay.tick(run.nextAt));run=(await svc.autoplay.read(p,{sessionId:s.id,displayId:out.id}));expect(run.index).toBe(1);
    run=(await svc.autoplay.control(p,{sessionId:s.id,displayId:out.id,requestId:id(),action:'pause',expectedVersion:run.version}));expect(run.status).toBe('paused');
    await h.shutdown();const restored=await createApp({database:h.database});
    try{
      const r=restored.service;run=(await r.autoplay.read(p,{sessionId:s.id,displayId:out.id}));expect(run.status).toBe('paused');
      (await r.autoplay.tick(Date.now()+3600000));expect((await r.display(p,s.id,out.id)).view!.data.index).toBe(1);
      run=(await r.autoplay.control(p,{sessionId:s.id,displayId:out.id,requestId:id(),action:'resume',expectedVersion:run.version}));(await r.autoplay.tick(run.nextAt));expect((await r.autoplay.read(p,{sessionId:s.id,displayId:out.id}))).toMatchObject({status:'completed',index:1});
      expect((await r.display(p,s.id,a.id)).view!.data.text).toBe('Exact 9007199254740993.0001');expect((await r.display(p,s.id,b.id)).revision).toBe(1);
      run=(await r.autoplay.control(p,{...input,requestId:id(),expectedRevision:(await r.display(p,s.id,out.id)).revision,loop:true,intervalSeconds:307}));(await r.autoplay.tick(run.nextAt));run=(await r.autoplay.read(p,{sessionId:s.id,displayId:out.id}));(await r.autoplay.tick(run.nextAt));run=(await r.autoplay.read(p,{sessionId:s.id,displayId:out.id}));expect(run).toMatchObject({status:'running',index:0});
      (await r.autoplay.control(p,{sessionId:s.id,displayId:out.id,requestId:id(),action:'stop',expectedVersion:run.version}));const revision=(await r.display(p,s.id,out.id)).revision;(await r.autoplay.tick(Date.now()+86400000));expect((await r.display(p,s.id,out.id)).revision).toBe(revision);
    }finally{await restored.close();}
  });
  it('stops before overwriting newer content, honors holds/revocation, and rejects foreign frames and stale actions',async()=>{
    h=await startHarness();const owner=await h.account(),editor=await h.account(),stranger=await h.account(),s=await owner.session(),d=await owner.display(s.id),other=await stranger.session(),foreign=await stranger.display(other.id),svc=h.runtime.service,p={userId:editor.user!.id};
    success(await owner.request('POST',`/api/sessions/${s.id}/members`,{username:editor.user!.username,role:'editor'}));
    await owner.submit(s.id,[d.id],{version:1,template:'presentation',data:{slides:[fact('A'),fact('B')],index:0}});
    const start=async ()=>(await svc.autoplay.control(p,{sessionId:s.id,displayId:d.id,requestId:id(),action:'start',expectedRevision:(await svc.display(p,s.id,d.id)).revision,intervalSeconds:2})) as any;
    (await expect((async ()=>(await svc.autoplay.control(p,{sessionId:s.id,displayId:d.id,requestId:id(),action:'start',expectedRevision:1,intervalSeconds:2,frames:[{displayId:foreign.id}]})))()).rejects.toThrow());
    let run=(await start());(await expect((async ()=>(await svc.autoplay.control(p,{sessionId:s.id,displayId:d.id,requestId:id(),action:'pause',expectedVersion:0})))()).rejects.toThrow(/revision|changed/i));
    await owner.submit(s.id,[d.id],fact('Newer manual content'));(await svc.autoplay.tick());expect((await svc.autoplay.read(p,{sessionId:s.id,displayId:d.id}))).toMatchObject({status:'stopped'});expect((await svc.display(p,s.id,d.id)).view!.data.text).toBe('Newer manual content');
    await owner.submit(s.id,[d.id],{version:1,template:'presentation',data:{slides:[fact('C'),fact('D')],index:0}});run=(await start());
    success(await owner.request('PATCH',`/api/sessions/${s.id}/displays/${d.id}`,{held:true,expectedRevision:(await svc.display(p,s.id,d.id)).revision}));(await svc.autoplay.tick());expect((await svc.autoplay.read(p,{sessionId:s.id,displayId:d.id}))).toMatchObject({status:'stopped'});
    success(await owner.request('PATCH',`/api/sessions/${s.id}/displays/${d.id}`,{held:false,expectedRevision:(await svc.display(p,s.id,d.id)).revision}));run=(await start());
    success(await owner.request('DELETE',`/api/sessions/${s.id}/members/${editor.user!.id}`));(await svc.autoplay.tick());expect((await svc.autoplay.read({userId:owner.user!.id},{sessionId:s.id,displayId:d.id}))).toMatchObject({status:'stopped'});
    (await expect((async ()=>(await svc.autoplay.read({userId:stranger.user!.id},{sessionId:s.id,displayId:d.id})))()).rejects.toThrow());
  });
});

it('keeps all original tool events, folds only consecutive tools, scopes pagination and restores across process restart',async()=>{
  h=await startHarness();const owner=await h.account(),other=await h.account(),s=await owner.session(),d=await owner.display(s.id),svc=h.runtime.service,p={userId:owner.user!.id};
  const events:ToolCall[]=['read','read','write','read'].map((tool,i)=>({id:`e${i}`,integration:'KANVAS',tool,timestamp:new Date(1700000000000+i*1000).toISOString(),status:'completed',summary:`Exact event ${i}`}));
  const request={sessionId:s.id,requestId:id(),events};(await svc.toolLog.append(p,request));(await svc.toolLog.append(p,request));(await svc.toolLog.append(p,{...request,requestId:id()}));
  await owner.submit(s.id,[d.id],eventViewExamples['tool-call-log']);
  const page=(await svc.toolLog.read(p,{sessionId:s.id,limit:2}));expect(page.events.map(e=>e.id)).toEqual(['e3','e2']);expect(page.nextCursor).toBeTruthy();
  expect((await svc.toolLog.read(p,{sessionId:s.id,before:page.nextCursor})).events).toEqual([events[1],events[0]]);
  expect(consecutiveCalls((await svc.toolLog.forDisplay(p,s.id,d.id)).events).map(g=>g.calls.length)).toEqual([1,1,2]);
  (await expect((async ()=>(await svc.toolLog.read({userId:other.user!.id},{sessionId:s.id})))()).rejects.toThrow());(await expect((async ()=>(await svc.toolLog.read(p,{sessionId:s.id,channel:'another',before:page.nextCursor})))()).rejects.toThrow(/cursor/));
  (await expect((async ()=>(await svc.toolLog.append(p,{...request,events:[{...events[0],summary:'Changed'}]})))()).rejects.toThrow(/different/));
  (await expect((async ()=>(await svc.toolLog.append(p,{...request,requestId:id(),events:[{...events[0],summary:'Changed'}]})))()).rejects.toThrow(/different content/));
  await h.shutdown();const reopened=await createApp({database:h.database});try{expect((await reopened.service.toolLog.read(p,{sessionId:s.id})).events).toEqual([...events].reverse());}finally{await reopened.close();}
});

it('adjusts numeric/text scores with CAS and idempotency while read-only paired viewers remain read-only',async()=>{
  h=await startHarness();const owner=await h.account(),s=await owner.session(),d=await owner.display(s.id),svc=h.runtime.service,p={userId:owner.user!.id};
  await owner.submit(s.id,[d.id],{...eventViewExamples.scoreboard,data:{...eventViewExamples.scoreboard.data,sides:[{id:'a',name:'A',score:3.5},{id:'b',name:'B',score:'Advantage'}]}});
  const command={revision:1,requestId:id(),value:{kind:'scoreboard.adjust',sideId:'a',action:'increase'}};
  const changed=(await svc.respond(p,s.id,d.id,command));expect((await svc.respond(p,s.id,d.id,command))).toEqual(changed);expect(((await svc.display(p,s.id,d.id)).view!.data.sides as any[])[0].score).toBe(4.5);
  (await expect((async ()=>(await svc.respond(p,s.id,d.id,{...command,requestId:id()})))()).rejects.toThrow(/revision|changed/i));
  (await expect((async ()=>(await svc.respond(p,s.id,d.id,{revision:2,requestId:id(),value:{kind:'scoreboard.adjust',sideId:'b',action:'increase'}})))()).rejects.toThrow(/numeric/));
  (await svc.respond(p,s.id,d.id,{revision:2,requestId:id(),value:{kind:'scoreboard.adjust',sideId:'b',action:'set',score:'Winner'}}));
  const anon=h.browser(),pair=success(await anon.request<any>('POST','/api/pairings',{sessionId:s.id,displayId:d.id,deviceName:'Read only'}));success(await owner.request('POST',`/api/pairings/${pair.id}/decision`,{approve:true}));success(await anon.request('GET',`/api/pairings/${pair.id}/status`));anon.csrf=success(await anon.request<any>('GET','/api/auth/me')).csrfToken;
  denied(await anon.request('POST',`/api/sessions/${s.id}/displays/${d.id}/respond`,{revision:3,requestId:id(),value:{kind:'scoreboard.adjust',sideId:'a',action:'increase'}}));
  expect(((await svc.display(p,s.id,d.id)).view!.data.sides as any[])[1].score).toBe('Winner');
});

describe('explicit public session boundary',()=>{
  it('is off by default, owner/CAS controlled, shares only current content/assets and immediately revokes existing readers',async()=>{
    h=await startHarness();const owner=await h.account(),editor=await h.account(),s=await owner.session(),d=await owner.display(s.id),anon=h.browser();
    await owner.submit(s.id,[d.id],fact('Historical secret'));const asset=success(await owner.request<any>('POST',`/api/sessions/${s.id}/assets`,{name:'published.png',mimeType:'image/png',base64:PNG})),hidden=success(await owner.request<any>('POST',`/api/sessions/${s.id}/assets`,{name:'hidden.png',mimeType:'image/png',base64:PNG}));
    await owner.submit(s.id,[d.id],{version:1,template:'presentation',data:{index:0,slides:[{version:1,template:'image',data:{images:[{url:asset.url,alt:'Published image'}]}},fact('Future secret')]}});
    const path=`/api/public/sessions/${s.id}`;denied(await anon.request('GET',path),[404]);
    success(await owner.request('POST',`/api/sessions/${s.id}/members`,{username:editor.user!.username,role:'editor'}));denied(await editor.request('POST',`/api/sessions/${s.id}/public-access`,{enabled:true,confirm:true,expectedRevision:0}));
    expect((await owner.request('POST',`/api/sessions/${s.id}/public-access`,{enabled:true,confirm:false,expectedRevision:0})).status).toBe(400);
    success(await owner.request('POST',`/api/sessions/${s.id}/public-access`,{enabled:true,confirm:true,expectedRevision:0}));const opened=success(await anon.request<any>('GET',path));expect(opened.displays[0].view.template).toBe('image');expect(JSON.stringify(opened)).not.toMatch(/Historical secret|Future secret|ownerId|members|datasets|reports/);
    expect((await anon.raw(opened.displays[0].view.data.images[0].url)).status).toBe(200);denied(await anon.request('GET',`${path}/assets/${hidden.id}`),[404]);denied(await anon.request('GET',`/api/sessions/${s.id}`),[401]);denied(await anon.request('GET','/api/tokens'),[401]);
    const controller=new AbortController(),stream=await anon.raw(`${path}/events`,{},{signal:controller.signal});const reader=stream.body!.getReader();await reader.read();
    expect((await owner.request('POST',`/api/sessions/${s.id}/public-access`,{enabled:false,confirm:true,expectedRevision:0})).status).toBe(409);
    success(await owner.request('POST',`/api/sessions/${s.id}/public-access`,{enabled:false,confirm:true,expectedRevision:1}));const received=new TextDecoder().decode((await reader.read()).value);expect(received).toContain('revoked');controller.abort();
    denied(await anon.request('GET',path),[404]);denied(await anon.request('GET',opened.displays[0].view.data.images[0].url),[404]);expect(anon.cookies.size).toBe(0);
  });
  it('projects explicitly published topology/tool logs without private identities, control grants, unrevealed roles or unrelated sessions',async()=>{
    h=await startHarness();const owner=await h.account(),s=await owner.session(),topology=await owner.display(s.id,'Connections'),log=await owner.display(s.id,'Tools'),svc=h.runtime.service,p={userId:owner.user!.id};
    await owner.submit(s.id,[topology.id],{version:1,template:'session-topology',data:{layout:'connections',groupBy:'all',includeOffline:true,includeLocation:false,expectedCountries:[]}});
    await owner.submit(s.id,[log.id],eventViewExamples['tool-call-log']);(await svc.toolLog.append(p,{sessionId:s.id,requestId:id(),events:[{id:'one',integration:'Agent',tool:'lookup',timestamp:new Date().toISOString()}]}));
    (await svc.topology.connected(p,{id:'private-connection-id',sessionId:s.id,displayId:topology.id,name:'Published person',joinedAt:new Date().toISOString(),context:{browser:'Chrome',device:'Computer'}} as any));
    success(await owner.request('POST',`/api/sessions/${s.id}/public-access`,{enabled:true,confirm:true,expectedRevision:0}));const snapshot=(await publicSnapshot(svc,s.id));
    expect(snapshot.displays.find(d=>d.id===log.id)!.toolLog!.events).toHaveLength(1);
    const projection=snapshot.displays.find(d=>d.id===topology.id)!.topology!;expect(projection.people).toHaveLength(1);expect(JSON.stringify(projection)).not.toContain(owner.user!.id);expect(JSON.stringify(projection)).not.toContain('private-connection-id');expect(JSON.stringify(projection)).not.toContain('avatarUrl');
  });
});

it('accepts exact, configurable standings without coercing decimal strings or column identifiers',()=>{
  const source={columns:[{id:'points.net',label:'Net points',type:'number'}],groups:[{id:'g',rows:[{id:'a',name:'A',position:1,movement:2,values:{'points.net':'9007199254740993.0001'}},{id:'b',name:'B',position:2,values:{'points.net':'9007199254740993.0002'}}]}],sort:{column:'points.net',direction:'desc'}};
  expect(standingsDataSchema.parse(source)).toEqual(source);expect(standingsDataSchema.safeParse({...source,sort:{column:'missing',direction:'desc'}}).success).toBe(false);
});

it('keeps email verification explicit and password endpoints unavailable on a mail-enabled installation',async()=>{
  const mail:{email:string;link:string}[]=[];h=await startHarness({allowRegistration:true,signinMailer:async(email,link)=>{mail.push({email,link});}});const visitor=h.browser();
  expect(success(await visitor.request('GET','/api/auth/options'))).toMatchObject({emailSignin:true,passwordSignin:false});
  for(const action of ['login','register'])expect((await visitor.request('POST',`/api/auth/${action}`,{username:'fixture',password:'fixture-only-not-a-credential',displayName:'Test'})).status).toBe(403);
  success(await visitor.request('POST','/api/auth/email/request',{email:'newperson@example.com',returnTo:'/start'}));expect(mail).toHaveLength(1);expect((await h.runtime.store.db.prepare('SELECT COUNT(*) n FROM users').get())!.n).toBe(0);
  const token=new URL(mail[0].link).hash.slice('#email-signin='.length);expect((await visitor.request('POST','/api/auth/email/consume',{token,confirm:false})).status).toBe(400);
  const signed=success(await visitor.request<any>('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'}));expect(signed.user.username).toBe('newperson@example.com');expect(signed.returnTo).toBe('/start');expect((await visitor.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'})).status).toBe(410);
});
