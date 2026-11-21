import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Page} from '@playwright/test';
import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,sessionApi} from './support';

async function setup(page:Page,baseURL:string,mode:'success'|'denied'|'unsupported') {
  // This test substitutes only the OS picker. The activation, fixed client
  // routine, real API authorization, bounded image upload and asset are real.
  await page.context().addInitScript(mode=>{
    const state={calls:0,stopped:0,active:false}; (window as any).__capture=state;
    if (!navigator.mediaDevices) return; // about:blank test pages have no secure media API.
    Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:mode==='unsupported'?undefined:async()=>{
      state.calls++;state.active=navigator.userActivation.isActive;
      if(mode==='denied')throw new DOMException('User declined','NotAllowedError');
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#663399';ctx.fillRect(0,0,640,360);ctx.fillStyle='#ffffff';ctx.fillText('Consented test frame',30,30);
      const stream=canvas.captureStream(10);for(const track of stream.getTracks()){const original=track.stop.bind(track);track.stop=()=>{state.stopped++;original();};}return stream;
    }});
  },mode);
  await register(page);const sessionId=await createSession(page,'Client capture checks'),display=await createDisplay(page,sessionId,'Capture screen');
  await publishPrepared(page,sessionId,[display.id],{version:1,template:'fact',data:{text:'Capture remains consented'}});
  const viewer=await openViewer(page,sessionId,display.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable capture client',scopes:['read','publish']});
  const client=(page.viewportSize()?.width??1000)<600 ? new LegacyClient({name:'capture-test-legacy',version:'1'}) : new Client({name:'capture-test',version:'1'});
  const options={requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}};
  if(client instanceof LegacyClient)await client.connect(new LegacyTransport(new URL('/mcp',baseURL),options));
  else await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),options));
  const call=async(operation:string,args:Record<string,unknown>={})=>{
    const result=await client.callTool({name:'kanvas_call',arguments:{operationId:operation,arguments:{sessionId,displayId:display.id,...args}}});
    expect(result.isError, JSON.stringify(result.structuredContent ?? result.content)).not.toBe(true);return (result.structuredContent as any).data;
  };
  await expect.poll(async()=>{const result=await sessionApi<any[]>(page,`/api/sessions/${sessionId}/viewers`);return result.data?.filter(v=>v.connected&&v.displayId===display.id).length;}).toBe(1);
  return {viewer,client,call,sessionId,display};
}
for(const mode of ['success','denied','unsupported'] as const)test(`client capture ${mode} respects activation and native permission outcome`,async({page,baseURL})=>{
  const s=await setup(page,baseURL!,mode);
  if(mode==='denied')await s.viewer.route('**/client-capture/*',async route=>{
    // Force the native rejection to beat network acknowledgement. The client
    // must serialize status reports, with no late409 from permission state.
    if(route.request().method()==='POST'&&route.request().postDataJSON()?.status==='awaiting-permission')await new Promise(resolve=>setTimeout(resolve,200));
    await route.continue();
  });
  try {
    let delivered!:()=>void; const armed=new Promise<void>(resolve=>{delivered=resolve;});
    s.viewer.on('response',async response=>{if(response.url().includes('/client-capture?')){const data=await response.json().catch(()=>null);if(data?.data?.captureId)delivered();}});
    const q=await s.call('kanvas.display.request.capture');expect(q.status).toBe('awaiting-user-gesture');
    await armed;
    expect(await s.viewer.evaluate(()=>(window as any).__capture.calls)).toBe(0);
    if(mode!=='unsupported'){
      // A synthetic DOM event is not a user gesture and cannot trigger sharing.
      await s.viewer.evaluate(()=>document.dispatchEvent(new MouseEvent('click',{bubbles:true})));
      expect(await s.viewer.evaluate(()=>(window as any).__capture.calls)).toBe(0);
      await s.viewer.locator('.viewer-shell').click({position:{x:20,y:20}});
    }
    await expect.poll(async()=>(await s.call('kanvas.display.capture.status',{captureId:q.captureId})).status).toBe(mode==='success'?'complete':mode);
    if(mode==='success'){
      const result=await s.call('kanvas.display.capture.status',{captureId:q.captureId});expect(result).toMatchObject({width:640,height:360,source:'consented-client-screen'});expect(result.assetId).toBeTruthy();
      const state=await s.viewer.evaluate(()=>(window as any).__capture);expect(state).toMatchObject({calls:1,stopped:1,active:true});
      const image=await page.request.get(result.assetUrl);expect(image.ok()).toBe(true);expect(image.headers()['content-type']).toContain('image/jpeg');expect((await image.body()).length).toBeGreaterThan(100);
      await s.viewer.locator('.viewer-shell').click({position:{x:20,y:20}});expect(await s.viewer.evaluate(()=>(window as any).__capture.calls)).toBe(1);
    }
  } finally {await s.client.close();}
});

test('server snapshot uses real viewer viewport and settled renderer while remaining independently labelled',async({page,baseURL},info)=>{
  const s=await setup(page,baseURL!,'unsupported');
  try{
    await expect(s.viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
    const size=s.viewer.viewportSize()!;
    await expect.poll(async()=>{const result=await sessionApi<any[]>(page,`/api/sessions/${s.sessionId}/viewers`);return result.data?.find(v=>v.connected)?.width;}).toBe(size.width);
    const started=Date.now(),result=await s.call('kanvas.display.snapshot');
    expect(result).toMatchObject({width:size.width,height:size.height,viewportSource:'connected-viewer',source:'isolated-server-browser',settleMs:1500,readiness:'ready'});
    expect(Date.now()-started).toBeGreaterThanOrEqual(1500);expect(result.assetId).toBeTruthy();
  }finally{await s.client.close();}
});

for (const limit of ['network-timeout','request-expiry'] as const) test(`client capture stops live sharing on ${limit} while permission report stalls`,async({page,baseURL})=>{
  const s=await setup(page,baseURL!,'success');
  try {
    // Stall only the acknowledgement transport, preserving native stream creation
    // and real server request/poll authorization. Abort remains observable.
    await s.viewer.evaluate(()=>{
      const original=window.fetch.bind(window);
      window.fetch=(input,init)=>{
        if(String(input).includes('/client-capture/')&&init?.method==='POST'&&JSON.parse(String(init.body)).status==='awaiting-permission'){
          return new Promise<Response>((_resolve,reject)=>{
            init.signal?.addEventListener('abort',()=>{(window as any).__capture.aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true});
          });
        }
        return original(input,init);
      };
    });
    if(limit==='request-expiry') await s.viewer.route('**/client-capture?*',async route=>{
      const response=await route.fetch(),body=await response.json();
      if(body.data)body.data.expiresAt=Date.now()+1200;
      await route.fulfill({response,json:body});
    });
    const armed=s.viewer.waitForResponse(async response=>response.url().includes('/client-capture?')&&Boolean((await response.json().catch(()=>null))?.data?.captureId));
    const request=await s.call('kanvas.display.request.capture');await armed;
    await s.viewer.locator('.viewer-shell').click({position:{x:20,y:20}});
    await expect.poll(()=>s.viewer.evaluate(()=>(window as any).__capture.calls)).toBe(1);
    await expect.poll(()=>s.viewer.evaluate(()=>(window as any).__capture.stopped),{timeout:limit==='request-expiry'?4000:12000}).toBe(1);
    if(limit==='request-expiry')expect(await s.viewer.evaluate(()=>(window as any).__capture.aborted)).not.toBe(true);
    else expect(await s.viewer.evaluate(()=>(window as any).__capture.aborted)).toBe(true);
    const result=await s.call('kanvas.display.capture.status',{captureId:request.captureId});expect(result.assetId).toBeUndefined();
    await s.viewer.close();
  } finally {await s.client.close();}
});
