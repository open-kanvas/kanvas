import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,it,expect} from 'vitest';
import {startHarness,success,denied,type Harness} from './harness.js';
import {satisfactionDataSchema,satisfactionReadSchema,parseKioskRoute} from '../../src/shared/satisfaction.js';
let h:Harness;afterEach(async()=>{await h?.close();});
it('validates faces, explicit ranges and exact kiosk routes',()=>{expect(satisfactionDataSchema.parse({surveyId:'q'}).levels).toBe(3);expect(satisfactionDataSchema.safeParse({surveyId:'q',levels:4}).success).toBe(false);expect(satisfactionReadSchema.safeParse({sessionId:'s',from:'2026-01-01T00:00:00Z',to:'2025-01-01T00:00:00Z'}).success).toBe(false);expect(parseKioskRoute('/kiosk/s/d')).toEqual({sessionId:'s',displayId:'d'});expect(parseKioskRoute('/kiosk/s/d/else')).toBeUndefined();});
it('records repeat taps with retry/CAS/rate protection and editor-only half-open aggregates',async()=>{
 h=await startHarness();const a=await h.account(),other=await h.account(),s=await a.session(),d=await a.display(s.id),p={userId:a.user!.id};
 await a.submit(s.id,[d.id],{version:1,template:'satisfaction',data:{surveyId:'q',levels:3}});
 const display=await h.runtime.service.display(p,s.id,d.id),revision=display.revision;
 const command={revision,requestId:'one',value:{kind:'satisfaction.rate',rating:5}};
 const first=await h.runtime.service.respond(p,s.id,d.id,command);
 expect(first.status).toBe('acknowledged');expect((await h.runtime.service.respond(p,s.id,d.id,command)).id).toBe(first.id);
 await expect(h.runtime.service.respond(p,s.id,d.id,{...command,requestId:'fast'})).rejects.toMatchObject({code:'RATE_LIMIT'});
 await expect(h.runtime.service.respond(p,s.id,d.id,{...command,value:{kind:'satisfaction.rate',rating:1}})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
 await expect(h.runtime.service.respond(p,s.id,d.id,{...command,requestId:'bad',value:{kind:'satisfaction.rate',rating:2}})).rejects.toMatchObject({code:'INVALID_RESPONSE'});
 await expect(h.runtime.service.respond({...p,scopedSessionId:s.id,scopedDisplayId:d.id},s.id,d.id,{...command,requestId:'readonly'})).rejects.toMatchObject({code:'FORBIDDEN'});
 await new Promise(r=>setTimeout(r,510));
 await h.runtime.service.respond(p,s.id,d.id,{...command,requestId:'two',value:{kind:'satisfaction.rate',rating:1}});
 const args={sessionId:s.id,displayId:d.id,surveyId:'q',from:new Date(Date.now()-60000).toISOString(),to:new Date(Date.now()+86400000).toISOString()};
 const result:any=await h.runtime.service.execute('kanvas_satisfaction_read',args,p);expect(result.total).toBe(2);expect(result.counts['1']).toBe(1);expect(result.counts['5']).toBe(1);
 const excluded:any=await h.runtime.service.execute('kanvas_satisfaction_read',{...args,to:first.createdAt},p);expect(excluded.total).toBe(0);
 await expect(h.runtime.service.execute('kanvas_satisfaction_read',args,{...p,scopedSessionId:s.id,interactive:true})).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(h.runtime.service.execute('kanvas_satisfaction_read',args,{userId:other.user!.id})).rejects.toBeDefined();
 await expect(h.runtime.service.respond(p,s.id,d.id,{...command,requestId:'stale',revision:revision+1})).rejects.toBeDefined();
});

it('serves direct kiosk SPA route and enforces real approved paired-cookie rating scope',async()=>{
 const staticDirectory=await mkdtemp(join(tmpdir(),'kanvas-kiosk-spa-'));await writeFile(join(staticDirectory,'index.html'),'<!doctype html><title>Kiosk fixture shell</title>');
 h=await startHarness({staticDirectory});const owner=await h.account(),s=await owner.session(),d=await owner.display(s.id),other=await owner.display(s.id);
 const path=`/api/sessions/${s.id}`;await owner.submit(s.id,[d.id],{version:1,template:'satisfaction',data:{surveyId:'q'}});const revision=(await owner.detail(s.id)).displays.find(x=>x.id===d.id)!.revision;
 const shell=await h.browser().raw(`/kiosk/${s.id}/${d.id}`);expect(shell.status).toBe(200);expect(await shell.text()).toContain('Kiosk fixture shell');
 for(const interactive of [true,false]){
  const share:any=success(await owner.request('POST',path+'/shares',{displayId:d.id,label:'Kiosk',allowInteraction:interactive,expiresInHours:1}));const guest=h.browser();const pair:any=success(await guest.request('POST','/api/pairings',{shareId:share.id,deviceName:'Kiosk fixture',requestedInteractive:interactive}));
  success(await owner.request('POST',`/api/pairings/${pair.id}/decision`,{approve:true,interactive}));success(await guest.request('GET',`/api/pairings/${pair.id}/status`));const me:any=success(await guest.request('GET','/api/auth/me'));guest.csrf=me.csrfToken;expect(me.interactive).toBe(interactive);
  const body={revision,requestId:'paired-rating',value:{kind:'satisfaction.rate',rating:5}},result=await guest.request('POST',`${path}/displays/${d.id}/respond`,body);
  if(interactive){const accepted:any=success(result);const retry:any=success(await guest.request('POST',`${path}/displays/${d.id}/respond`,body));expect(retry.id).toBe(accepted.id);}else denied(result,[403]);
  denied(await guest.request('POST',`${path}/displays/${other.id}/respond`,{...body,requestId:'wrong-display'}),[403,404]);
  denied(await guest.request('PATCH',`${path}/displays/${d.id}/name`,{name:'Unauthorized change'}),[403,404]);
 }
 const totals:any=await h.runtime.service.execute('kanvas_satisfaction_read',{sessionId:s.id,from:new Date(Date.now()-60000).toISOString(),to:new Date(Date.now()+60000).toISOString()},{userId:owner.user!.id});expect(totals.total).toBe(1);
});
