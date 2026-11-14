import { randomUUID } from 'node:crypto';
import { afterEach,expect,it } from 'vitest';
import { startHarness,success,denied,fact,PNG,type Harness } from './harness.js';
import { createApp } from '../../src/server/app.js';
import { validateMedia } from '../../src/server/rendering/media.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { normalizedScroll } from '../../src/client/renderers/Navigation.js';
import { navigationCapabilities,navigate,initialNavigation } from '../../src/shared/navigation.js';
let h:Harness;afterEach(async()=>{await h?.close();});const id=()=>randomUUID();
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient></defs><rect width="100" height="60" fill="url(#g)"/><text x="4" y="30">Team &amp; Friends</text></svg>';
it('accepts documented bare autoplay pause/resume/stop while retaining optional stale-run guards and retry semantics',async()=>{
  h=await startHarness();const owner=await h.account(),s=await owner.session(),d=await owner.display(s.id),svc=h.runtime.service,p={userId:owner.user!.id};await owner.submit(s.id,[d.id],{version:1,template:'presentation',data:{slides:[fact('One'),fact('Two')]}});
  const start=await svc.execute('kanvas_autoplay_control',{sessionId:s.id,displayId:d.id,action:'start',requestId:id(),expectedRevision:1,intervalSeconds:2,loop:true},p) as any;
  const pause={sessionId:s.id,displayId:d.id,action:'pause',requestId:id()};const paused:any=await svc.execute('kanvas_autoplay_control',pause,p);expect(paused.status).toBe('paused');expect(await svc.execute('kanvas_autoplay_control',pause,p)).toEqual(paused);
  await expect(svc.execute('kanvas_autoplay_control',{...pause,action:'resume',requestId:id(),runId:'not-the-run'},p)).rejects.toMatchObject({code:'AUTOPLAY_CHANGED'});
  await expect(svc.execute('kanvas_autoplay_control',{...pause,action:'resume',requestId:id(),expectedVersion:start.version},p)).rejects.toThrow(/changed|revision/i);
  for(const action of ['resume','stop'])expect(await svc.execute('kanvas_autoplay_control',{...pause,action,requestId:id()},p)).toMatchObject({status:action==='stop'?'stopped':'running'});
});
it('supports context-free reports with private ownership, unified administration, scoped-token rejection and restart recovery',async()=>{
 h=await startHarness();const a=await h.account(),b=await h.account(),admin=await h.account(),s=await a.session(),svc=h.runtime.service;
 svc.accounts.serviceAdmins.add(admin.user!.id);
 const input={requestId:id(),title:'General UI',description:'No particular session'},one=success(await a.request<any>('POST','/api/feedback',input));expect(one.sessionId).toBeUndefined();expect(one.accountId).toBe(a.user!.id);expect(one.scope).toBeUndefined();expect(success(await a.request<any>('POST','/api/feedback',input)).id).toBe(one.id);
 const privateReport=success(await a.request<any>('POST','/api/feedback',{...input,requestId:id()}));
 const sessionReport=success(await a.request<any>('POST',`/api/sessions/${s.id}/feedback`,{requestId:id(),title:'Session',description:'Private session'}));
 expect(success(await b.request<any>('GET','/api/reports')).reports).toHaveLength(0);denied(await b.request('GET','/api/reports?allAccounts=true'));
 expect(success(await a.request<any>('GET','/api/reports')).reports.map((r:any)=>r.id)).toEqual([sessionReport.id,privateReport.id,one.id]);
 const all=success(await admin.request<any>('GET','/api/reports?allAccounts=true&limit=2'));expect(all.reports).toHaveLength(2);const rest=success(await admin.request<any>('GET',`/api/reports?allAccounts=true&afterId=${all.nextCursor}`));expect([...all.reports,...rest.reports].map(r=>r.id)).toEqual([sessionReport.id,privateReport.id,one.id]);
 for(const report of [privateReport,one])denied(await b.request('PATCH',`/api/reports/${report.id}`,{expectedRevision:0,status:'resolved',note:'Cannot review another account'}));
 success(await admin.request('PATCH',`/api/reports/${one.id}`,{expectedRevision:0,status:'resolved',note:'Confirmed service fix'}));
 expect((await a.request('POST','/api/feedback',{...input,requestId:id(),scope:'service'})).status).toBe(400);
 const token=(await h.runtime.auth.issueToken(a.user!.id,'selected',['read','publish'],[s.id]));const p={userId:a.user!.id,tokenId:token.token.id,scopes:['read','publish']};await expect(svc.execute('kanvas_feedback_submit',{...input,requestId:id()},p)).rejects.toMatchObject({code:'FORBIDDEN'});
 await h.shutdown();const restored=await createApp({database:h.database});try{expect((await restored.service.reports.read({userId:a.user!.id},{allAccounts:false,status:'all',kind:'all',limit:10})).reports.map(r=>r.id)).toEqual([sessionReport.id,privateReport.id,one.id]);}finally{await restored.close();}
});
it('revokes only the selected approved browser while other paired browsers and owner account remain authorized',async()=>{
  h=await startHarness();const owner=await h.account(),stranger=await h.account(),s=await owner.session(),d=await owner.display(s.id),browsers=[h.browser(),h.browser()],pairs:any[]=[];
  for(const browser of browsers){const pair=success(await browser.request<any>('POST','/api/pairings',{sessionId:s.id,displayId:d.id,deviceName:'Pair fixture'}));pairs.push(pair);success(await owner.request('POST',`/api/pairings/${pair.id}/decision`,{approve:true}));success(await browser.request('GET',`/api/pairings/${pair.id}/status`));}
  const args={sessionId:s.id,pairingId:pairs[0].id};await expect(h.runtime.service.execute('kanvas_pairing_revoke',args,{userId:stranger.user!.id})).rejects.toThrow();await h.runtime.service.execute('kanvas_pairing_revoke',args,{userId:owner.user!.id});
  denied(await browsers[0].request('GET','/api/auth/me'),[401,403]);success(await browsers[1].request('GET','/api/auth/me'));success(await owner.request('GET',`/api/sessions/${s.id}`));expect((await h.runtime.service.experience.pairings({userId:owner.user!.id},s.id)).find(p=>p.id===pairs[0].id)?.status).toBe('revoked');
});
it('isolates default-on semantic pointing (owner can turn it off) from source/history, derives names, handles concurrent participants and revocation',async()=>{
  h=await startHarness();const a=await h.account(),b=await h.account(),s=await a.session(),d=await a.display(s.id);await a.submit(s.id,[d.id],fact('Point at this word.'));success(await a.request('POST',`/api/sessions/${s.id}/members`,{username:b.user!.username,role:'viewer'}));
  const path=`/api/sessions/${s.id}/displays/${d.id}/pointing`,svc=h.runtime.service,p={userId:a.user!.id},body={revision:1,anchor:{kind:'text',key:'12345678',occurrence:0,start:0,end:5}};
  expect(success(await a.request<any>('GET',path))).toMatchObject({enabled:true,pointers:[]});(await svc.pointing.configure(p,{sessionId:s.id,expectedRevision:0,enabled:false,confirm:true}));expect(success(await a.request<any>('GET',path))).toMatchObject({enabled:false,pointers:[]});denied(await b.request('PUT',path,body));
  (await expect((async ()=>(await svc.pointing.configure({userId:b.user!.id},{sessionId:s.id,expectedRevision:0,enabled:true,confirm:true})))()).rejects.toThrow());(await svc.pointing.configure(p,{sessionId:s.id,expectedRevision:1,enabled:true,confirm:true}));
  expect(await svc.pointing.read(p,{sessionId:s.id,displayId:d.id})).toMatchObject({enabled:true,canPoint:false,canPointScope:'calling-principal',eligibilityReason:'agent-read-only'});
  await expect(svc.pointing.write(p,s.id,d.id,body)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(success(await a.request<any>('GET',path))).toMatchObject({canPoint:true,eligibilityReason:'eligible'});
  const before=JSON.stringify((await svc.display(p,s.id,d.id)));success(await a.request('PUT',path,body));const read=success(await b.request<any>('PUT',path,{...body,anchor:{...body.anchor,start:6,end:8}}));expect(read.pointers).toHaveLength(2);expect(read.pointers.map((x:any)=>x.name)).toContain(a.user!.displayName);expect(read.pointers.every((x:any)=>x.expiresAt>Date.now()&&x.expiresAt<=Date.now()+20001)).toBe(true);expect(JSON.stringify((await svc.display(p,s.id,d.id)))).toBe(before);
  expect((await b.request('PUT',path,{...body,name:'Impersonated'})).status).toBe(400);success(await a.request('DELETE',`/api/sessions/${s.id}/members/${b.user!.id}`));expect(success(await a.request<any>('GET',path)).pointers).toHaveLength(1);
  await a.submit(s.id,[d.id],fact('Replacement'));expect(success(await a.request<any>('GET',path)).pointers).toHaveLength(0);expect((await a.request('PUT',path,body)).status).toBe(409);
  (await svc.pointing.configure(p,{sessionId:s.id,expectedRevision:2,enabled:false,confirm:true}));expect(success(await a.request<any>('GET',path))).toMatchObject({enabled:false,pointers:[]});denied(await a.request('PUT',path,{...body,revision:2}));
});
it('accepts bounded passive SVG logos while rejecting active, external, namespace and resource abuse',()=>{
  const upload=(s:string)=>validateMedia({name:'logo.svg',mimeType:'image/svg+xml',base64:Buffer.from(s).toString('base64')});expect(upload(svg)).toMatchObject({kind:'image',width:100,height:60,mimeType:'image/svg+xml'});
  const payloads=['<script>alert(1)</script>','<foreignObject><p>html</p></foreignObject>','<image href="https://example.com/image.png"/>','<use href="#self" id="self"/>','<rect onclick="x()"/>','<rect style="fill:url(https://example.com/x)"/>','<animate attributeName="href" values="bad"/>','<g xmlns="http://www.w3.org/1999/xhtml"/>','<rect fill="url(&#35;missing)"/>'];
  for(const payload of payloads)expect(()=>upload(`<svg xmlns="http://www.w3.org/2000/svg">${payload}</svg>`)).toThrow();
  expect(()=>upload('<!DOCTYPE svg [<!ENTITY e SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&e;</svg>')).toThrow();expect(()=>upload(svg.replace('0 0 100 60','0 0 999999 99'))).toThrow();
});
it('supports logos, uncropped gallery navigation and a whiteboard background through protected/public asset projection',async()=>{
  h=await startHarness();const owner=await h.account(),s=await owner.session(),d=await owner.display(s.id),asset=success(await owner.request<any>('POST',`/api/sessions/${s.id}/assets`,{name:'logo.svg',mimeType:'image/svg+xml',base64:Buffer.from(svg).toString('base64')}));
  for(const view of [
    {version:1,template:'scoreboard',data:{sides:[{id:'a',name:'A',score:2,logo:{url:asset.url}},{id:'b',name:'B',score:'Advantage',logo:{url:asset.url}}]}},
    {version:1,template:'standings',data:{columns:[{id:'p',label:'Points'}],groups:[{id:'g',rows:[{id:'a',name:'A',position:1,logo:{url:asset.url},values:{p:'9007199254740993'}}]}]}},
    {version:1,template:'image-gallery',data:{mode:'carousel',images:[{url:asset.url},{url:asset.url,caption:'Opt-in',showCaption:true}]}},
    {version:1,template:'whiteboard',data:{background:{url:asset.url},elements:[]}},
  ])expect((await owner.submit(s.id,[d.id],validateView(view))).update.status).toBe('prepared');
  const view=validateView({version:1,template:'image-gallery',data:{mode:'carousel',images:[{url:asset.url},{url:asset.url}]}});expect(navigationCapabilities(view).pageCount).toBe(2);expect(navigate(view,initialNavigation(view),{action:'page',direction:'next'}).page).toBe(1);
  success(await owner.request('POST',`/api/sessions/${s.id}/public-access`,{enabled:true,expectedRevision:0,confirm:true}));const anon=h.browser(),publicView=success(await anon.request<any>('GET',`/api/public/sessions/${s.id}`));expect(publicView.displays[0].view.data.background.url).toMatch(/^\/api\/public\/sessions/);expect((await anon.raw(publicView.displays[0].view.data.background.url)).status).toBe(200);denied(await anon.request('GET',asset.url),[401,403]);
});
it('normalizes browser overscroll, fractional endpoints and zero extents before navigation requests',()=>{expect(normalizedScroll(-15,100)).toBe(0);expect(normalizedScroll(101.25,100)).toBe(1);expect(normalizedScroll(0,0)).toBe(0);expect(normalizedScroll(50,100)).toBe(.5);expect(normalizedScroll(Infinity,1)).toBe(0);});
