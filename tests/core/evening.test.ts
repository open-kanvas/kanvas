import { randomUUID } from 'node:crypto';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { startHarness,success,denied,fact,PNG,type Harness,type Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { DisplayRecord,InteractionRecord,UpdateRecord,ViewSpec } from '../../src/shared/types.js';

describe('evening display workflows, feedback and permissions',()=>{
  let h:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
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
  it('applies owner settings and records a linked feedback event; rejects stale drafts without partial changes',async()=>{
    await owner.submit(s,[d],{version:1,template:'settings',data:{}});
    success(await owner.request('POST',`${path()}/settings`,{expectedRevision:0,config:{style:'iris',theme:'light'}}));
    const detail=await owner.detail(s);expect(detail.session.config).toMatchObject({style:'iris',theme:'light'});expect(detail.interactions.filter(x=>x.actionId==='settings.changed')).toHaveLength(1);expect(detail.interactions.at(-1)?.value).toMatchObject({applied:true,configRevision:1});
    denied(await owner.request('POST',`${path()}/settings`,{expectedRevision:0,config:{theme:'dark'}}),[409]);expect((await owner.detail(s)).session.config.theme).toBe('light');
  });
  it('lets contributing guests propose settings without granting editing; view-only guests cannot propose',async()=>{
    await owner.submit(s,[d],{version:1,template:'settings',data:{}});const g=await guest(true),body={revision:1,requestId:randomUUID(),value:{kind:'settings.request',config:{theme:'light'},expectedConfigRevision:0}};
    success(await g.request('POST',`${path()}/respond`,body));success(await g.request('POST',`${path()}/respond`,body));
    const detail=await owner.detail(s);expect(detail.session.config.theme).toBe('dark');expect(detail.interactions.filter(x=>x.actionId==='settings.request')).toHaveLength(1);expect(detail.interactions.at(-1)?.value).toMatchObject({applied:false,config:{theme:'light'}});
    denied(await g.request('POST',`${path()}/settings`,{expectedRevision:0,config:{theme:'light'}}));const readonly=await guest(false);denied(await readonly.request('POST',`${path()}/respond`,{...body,requestId:randomUUID()}));
  });
  it('notifies context changes once, never stores coordinates in the inbox and ignores late consent resurrection',async()=>{
    await owner.submit(s,[d],fact('Weather context'));
    const base={tabId:'location-tab',sequence:1,revision:1,renderedRevision:1,status:'ready',visible:true,text:'Weather',width:443,height:823,context:{consent:true,timeZone:'Europe/Oslo',locationStatus:'requesting'}};
    success(await owner.request('POST',`${path()}/observe`,base));
    const granted={...base,sequence:2,context:{...base.context,locationStatus:'granted',location:{latitude:58.461234,longitude:8.771234,accuracy:15}}};
    success(await owner.request('POST',`${path()}/observe`,granted));success(await owner.request('POST',`${path()}/observe`,{...granted,sequence:3}));
    success(await owner.request('POST',`${path()}/observe`,{...granted,sequence:4,context:null}));
    expect(success(await owner.request<{ignored:boolean}>('POST',`${path()}/observe`,granted)).ignored).toBe(true);
    expect(success(await owner.request<{ignored:boolean}>('POST',`${path()}/observe`,{...granted,sequence:undefined})).ignored).toBe(true);
    const events=(await owner.detail(s)).interactions.filter(x=>x.actionId==='viewer.context');expect(events).toHaveLength(3);expect(JSON.stringify(events)).not.toMatch(/58\.461234|8\.771234|latitude|longitude/);expect(events.at(-1)?.value).toMatchObject({consent:false,locationStatus:'withdrawn'});
    const viewers=await call<{context:unknown}[]>('kanvas_viewers_read',{sessionId:s});expect(viewers[0].context).toBeNull();
  });
  it('preserves every procedure step while advancing, retrying and returning from completion without content regeneration',async()=>{
    const steps=['First exact step.','Second exact step.','Third exact step.'];await owner.submit(s,[d],{version:1,template:'recipe',data:{name:'A guide',materials:['Exact material'],steps,mode:'steps'}});
    const request={sessionId:s,displayId:d,requestId:randomUUID(),expectedRevision:1,action:'next'};
    const first=await call('kanvas_procedure_control',request);expect(await call('kanvas_procedure_control',request)).toMatchObject({interaction:{id:(first as {interaction:InteractionRecord}).interaction.id,value:(first as {interaction:InteractionRecord}).interaction.value}});expect((await current()).revision).toBe(2);
    for(const action of ['next','next','next','back']){await call('kanvas_procedure_control',{...request,requestId:randomUUID(),expectedRevision:(await current()).revision,action});expect((await current()).view?.data.steps).toEqual(steps);}
    expect((await current()).view?.data).toMatchObject({index:2,stage:'step'});await expect(call('kanvas_procedure_control',{...request,requestId:randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
    expect((await owner.detail(s)).updates).toHaveLength(1);
  });
  it('returns bounded real retained previews only for the explicitly displayed overview',async()=>{
    const other=(await owner.display(s,'Source')).id;await owner.submit(s,[other],fact('An actual retained idea'));await owner.submit(s,[other],{version:1,template:'number',data:{value:'123456789.0001'}});
    await owner.submit(s,[d],{version:1,template:'overview',data:{displayIds:[other]}});
    const cards=success(await owner.request<{cards:{revision:number;view?:unknown}[]}>('GET',`${path()}/overview`)).cards;expect(cards).toHaveLength(2);expect(cards.every(c=>!c.view)).toBe(true);
    const preview=success(await owner.request<{view:ViewSpec}>('GET',`${path()}/overview/preview?sourceDisplayId=${other}&revision=1`));expect(preview.view.data.text).toBe('An actual retained idea');
    const g=await guest(false);expect(success(await g.request<{view:ViewSpec}>('GET',`${path()}/overview/preview?sourceDisplayId=${other}&revision=2`)).view.data.value).toBe('123456789.0001');
    denied(await g.request('GET',`${path()}/overview/preview?sourceDisplayId=${d}&revision=1`));await owner.submit(s,[d],fact('Gallery closed'));denied(await g.request('GET',`${path()}/overview/preview?sourceDisplayId=${other}&revision=1`),[409]);
  });
  it('authorizes only actually rendered menu and join assets for paired screens',async()=>{
    const a=success(await owner.request<{id:string;url:string}>('POST',`/api/sessions/${s}/assets`,{name:'Menu image',mimeType:'image/png',base64:PNG}));
    await owner.submit(s,[d],{version:1,template:'menu',data:{groups:[{title:'Lunch',items:[{name:'Soup',image:{url:a.url,alt:'Supplied soup'}}]}]}});const g=await guest(false);expect((await g.raw(a.url)).status).toBe(200);
    await owner.submit(s,[d],fact('Image no longer displayed'));expect((await g.raw(a.url)).status).toBe(404);
  });
  it('creates an on-screen QR exactly once for concurrent and later identical retries',async()=>{
    const args={sessionId:s,displayId:d,requestId:randomUUID(),expectedRevision:0,showOnDisplay:true,label:'Join the room'};
    const [first,again]=await Promise.all([call<{id:string;url:string;qrAssetId:string;update:UpdateRecord}>('kanvas_share_create',args),call<{id:string}>('kanvas_share_create',args)]);expect(first.id).toBe(again.id);await settle(first.update);
    expect((await current()).view).toMatchObject({template:'join',data:{url:new URL(first.url).pathname,label:'Join the room'}});expect((await h.runtime.store.list('share',s))).toHaveLength(1);expect((await h.runtime.store.list('asset',s))).toHaveLength(1);
    expect(await call('kanvas_share_create',args)).toEqual(first);await expect(call('kanvas_share_create',{...args,label:'Different'})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
    const g=await guest(false);expect((await g.raw(`/api/assets/${first.qrAssetId}`)).status).toBe(200);
  });
  it('does not replace content by default or create half an invitation for a stale show request',async()=>{
    await owner.submit(s,[d],fact('Keep this'));await call('kanvas_share_create',{sessionId:s,displayId:d});expect((await current()).view?.data.text).toBe('Keep this');
    const before=(await h.runtime.store.list('share',s)).length;
    await expect(call('kanvas_share_create',{sessionId:s,displayId:d,showOnDisplay:true,requestId:randomUUID(),expectedRevision:0})).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect((await h.runtime.store.list('share',s))).toHaveLength(before);
    const shown=await call<{update:UpdateRecord}>('kanvas_share_create',{sessionId:s,displayId:d,showOnDisplay:true});await settle(shown.update);expect((await current()).view?.template).toBe('join');
  });
  // Static tour lifecycle cases were retired with demo publication.
  // navigation-help.test exercises read-only legacy compatibility and no side effects.
  it('rolls back nested composite writes without leaving a partially committed inner transaction',async ()=>{
    (await expect((async ()=>(await h.runtime.store.transaction(async ()=>{(await h.runtime.store.put('test',{id:'outer'}));(await h.runtime.store.transaction(async ()=>(await h.runtime.store.put('test',{id:'inner'}))));throw new Error('Rollback');})))()).rejects.toThrow());expect((await h.runtime.store.list('test'))).toEqual([]);
    (await h.runtime.store.transaction(async ()=>{(await h.runtime.store.put('test',{id:'kept'}));try{(await h.runtime.store.transaction(async ()=>{(await h.runtime.store.put('test',{id:'discard'}));throw new Error('Inner rollback');}));}catch{}}));expect((await h.runtime.store.list<{id:string}>('test')).map(x=>x.id)).toEqual(['kept']);
  });
});
