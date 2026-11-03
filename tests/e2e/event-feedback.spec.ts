import { operationRequest } from '../mcp/requests.js';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Page,TestInfo} from '@playwright/test';
import type {ViewSpec} from '../../src/shared/types';
import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi,sessionDetail,isolatedContext,tab} from './support';

const fact=(text:string):ViewSpec=>({version:1,template:'fact',data:{text}});
async function setup(page:Page,info:TestInfo,baseURL:string,useDefaultDisplay=false){
  await register(page);const s=await createSession(page,'Event acceptance');
  const defaults=(await sessionDetail(page,s)).displays;expect(defaults).toHaveLength(1);
  // Session-wide and short-key links open the actual session default.
  const d=useDefaultDisplay?defaults[0]:await createDisplay(page,s,'Main screen'),v=await openViewer(page,s,d.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable event checks',scopes:['read','publish']});expect(issued.status).toBe(201);
  const headers={Authorization:`Bearer ${issued.data!.token}`},client=info.project.name.startsWith('phone')?new LegacyClient({name:'event-legacy',version:'1'}):new Client({name:'event-current',version:'1'});
  if(client instanceof LegacyClient)await client.connect(new LegacyTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));else await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));
  const call=async(name:string,operation:string,args:Record<string,unknown>={})=>{const r=await client.callTool(operationRequest({name,arguments:{operation,...args}}));expect(r.isError,`${name} ${operation}: ${JSON.stringify(r.isError?r.content:[])}`).not.toBe(true);expect((r.structuredContent as any).truncated).not.toBe(true);return(r.structuredContent as any).data;};
  const current=()=>waitForDisplay(page,s,d.id,x=>x.revision>0&&x.appliedRevision===x.revision),show=async(view:ViewSpec)=>{const before=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;await publishPrepared(page,s,[d.id],view);const next=await waitForDisplay(page,s,d.id,x=>x.revision>before.revision&&x.appliedRevision===x.revision);await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(next.revision));return next;};
  return {s,d,v,client,call,current,show};
}
async function photo(page:Page,info:TestInfo,name:string){
  for(const notice of await page.getByRole('button',{name:'Dismiss notification',exact:true}).all())await notice.click();
  await page.evaluate(()=>document.fonts.ready);await mkdir(info.outputPath('visuals'),{recursive:true});
  await page.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No page-level horizontal overflow').toBe(true);
}

test('scoreboards update from receiving taps and agent calls; grouped standings keep exact sortable values',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    await a.show({version:1,template:'scoreboard',data:{sides:[{id:'ada',name:'Ada',score:3.5},{id:'bo',name:'Bo',score:4},{id:'casey',name:'Casey',score:'Advantage'}],context:'Family game',period:'Round 3',clock:'04:32'}});
    await a.v.getByRole('button',{name:'Increase Ada',exact:true}).click();await expect(a.v.locator('.scoreboard-score').first()).toHaveText('4.5');
    await a.v.getByRole('button',{name:'Decrease Ada',exact:true}).click();await expect(a.v.locator('.scoreboard-score').first()).toHaveText('3.5');
    const before=await a.current();await a.call('kanvas_control','scoreboard.control',{sessionId:a.s,displayId:a.d.id,requestId:randomUUID(),expectedRevision:before.revision,sideId:'casey',action:'set',score:'Winner'});
    await expect(a.v.locator('.scoreboard-score').nth(2)).toHaveText('Winner');expect(await a.v.locator('.scoreboard-score').nth(2).evaluate(e=>e.getBoundingClientRect().height/parseFloat(getComputedStyle(e).fontSize))).toBeLessThan(1.3);await photo(a.v,info,'scoreboard');
    const standings:ViewSpec={version:1,template:'standings',data:{columns:[{id:'match.points',label:'Points',type:'number'},{id:'record',label:'W–D–L',type:'text'}],groups:[{id:'north',name:'North division',rows:[{id:'b',name:'Forest',position:2,movement:-1,values:{'match.points':'9007199254740993.001',record:'3–1–2'}},{id:'a',name:'Harbour',position:1,movement:1,values:{'match.points':'9007199254740993.002',record:'4–1–1'}}]},{id:'south',name:'South division',rows:[{id:'c',name:'Coast',position:1,movement:0,values:{'match.points':'1.2300',record:'1–0–1'}}]}],sort:{column:'match.points',direction:'desc'}}};
    await a.show(standings);await expect(a.v.locator('.standings-content tbody').first().getByRole('row').first()).toContainText('Harbour');await expect(a.v.locator('.standings-content')).toContainText('1.2300');
    expect((await a.current()).view?.data).toMatchObject(standings.data);await expect(a.v.getByLabel('Down 1',{exact:true})).toBeVisible();await photo(a.v,info,'standings-dark');
    await a.v.evaluate(()=>{const shell=document.querySelector('.viewer-shell')!;shell.classList.remove('theme-dark');shell.classList.add('theme-light');});await photo(a.v,info,'standings-light');
  }finally{await a.client.close();}
});

test('tool-call log survives reload, shows newest first and folds consecutive tools only',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    await a.show({version:1,template:'tool-call-log',data:{channel:'main',limit:100}});
    const events=['read','read','write','read','read','read'].map((tool,i)=>({id:`call-${i}`,integration:'Source',tool,timestamp:new Date(Date.UTC(2026,8,21,12,0,i)).toISOString(),summary:`Exact call ${i} — 1.2300`}));
    const args={sessionId:a.s,requestId:randomUUID(),events};await a.call('kanvas_publish','tool-log.append',args);await a.call('kanvas_publish','tool-log.append',args);
    const groups=a.v.locator('.tool-call-content>ol>li').filter({has:a.v.locator('.tool-call-integration',{hasText:'Source'})});await expect(groups).toHaveCount(3);await expect(groups.first()).toContainText('3 consecutive calls');await expect(groups.last()).toContainText('2 consecutive calls');
    await groups.first().locator('summary').click();await expect(groups.first()).toContainText('Exact call 5');await expect(groups.first().locator('details time').first()).toHaveAttribute('dateTime',events[5].timestamp);
    await a.v.reload();await expect(groups).toHaveCount(3);await photo(a.v,info,'tool-calls');
    const stored=await a.call('kanvas_inspect','tool-log.read',{sessionId:a.s});expect(stored.events.filter((e:any)=>e.integration==='Source').map((e:any)=>e.id)).toEqual([...events].reverse().map(e=>e.id));expect(stored.events.some((e:any)=>e.source==='automatic'&&e.tool==='kanvas_call'&&e.operation==='kanvas.tool.log.append')).toBe(true);
  }finally{await a.client.close();}
});

test('autoplay advances prepared frames, pauses, resumes, stops and completes once from prepared content',async({page,baseURL},info)=>{
  test.setTimeout(100000);const a=await setup(page,info,baseURL!);try{
    await a.show({version:1,template:'presentation',data:{slides:[fact('First prepared frame'),fact('Second prepared frame')],index:0}});
    await tab(page,'Displays');const control=page.locator('.autoplay-settings').last();await control.locator('summary').click();await control.getByLabel('Seconds per view').fill('2.75');await control.getByLabel('Playlist').selectOption('presentation');await control.getByLabel('Loop continuously').uncheck();await control.getByRole('button',{name:'Start autoplay',exact:true}).click();
    await expect(a.v.locator('.fact-text')).toHaveText('Second prepared frame',{timeout:12000});await expect(control.getByRole('status')).toContainText('completed',{timeout:12000});
    const display=await a.current();let run=await a.call('kanvas_control','autoplay.control',{sessionId:a.s,displayId:a.d.id,requestId:randomUUID(),action:'start',expectedRevision:display.revision,intervalSeconds:3.25,loop:true});
    run=await a.call('kanvas_control','autoplay.control',{sessionId:a.s,displayId:a.d.id,requestId:randomUUID(),action:'pause'});await expect(a.v.locator('.fact-text')).toHaveText('First prepared frame');const paused=(await a.current()).revision;
    await a.v.waitForTimeout(3600);expect((await a.current()).revision).toBe(paused);
    await expect(control.getByRole('button',{name:'Resume autoplay'})).toBeVisible();await control.getByRole('button',{name:'Resume autoplay'}).click();await expect(a.v.locator('.fact-text')).toHaveText('Second prepared frame',{timeout:12000});
    await control.getByRole('button',{name:'Stop autoplay'}).click();await expect(control.getByRole('status')).toContainText('stopped');await photo(a.v,info,'autoplay-frame');
  }finally{await a.client.close();}
});

test('owner opt-in opens all current displays read-only and revocation clears an already-connected public browser',async({page,baseURL,browser,diagnostics},info)=>{
  const a=await setup(page,info,baseURL!,true),anonymous=await isolatedContext(browser,info,baseURL!);try{
    await a.show({version:1,template:'scoreboard',data:{sides:[{id:'a',name:'Harbour',score:12},{id:'b',name:'Forest',score:9}]}});
    const second=await createDisplay(page,a.s,'Another screen');await publishPrepared(page,a.s,[second.id],fact('Other published display'));
    await tab(page,'People & access');await page.getByRole('button',{name:'Enable public viewing',exact:true}).click();await expect(page.getByRole('button',{name:'Make session private'})).toBeVisible();
    const address=await a.call('kanvas_session','address.get',{sessionId:a.s}),publicPage=await anonymous.newPage();diagnostics.watch(publicPage);await publicPage.goto(address.url);
    await expect(publicPage.locator('.public-session')).toBeVisible();await expect(publicPage.locator('.scoreboard-score').first()).toHaveText('12');await expect(publicPage.getByRole('button',{name:'Increase Harbour'})).toHaveCount(0);
    await expect(publicPage.locator('.public-session>header,.public-session>nav')).toHaveCount(0);await publicPage.goto(`/view/${a.s}/${second.id}`);await expect(publicPage.locator('.fact-text')).toHaveText('Other published display');
    await publishPrepared(page,a.s,[second.id],fact('Public live update — exact 1.2300'));await expect(publicPage.locator('.fact-text')).toHaveText('Public live update — exact 1.2300');await photo(publicPage,info,'public-session');
    expect((await publicPage.request.get('/api/start')).status()).toBe(401);expect((await anonymous.cookies()).some(c=>c.name.includes('auth'))).toBe(false);
    // The owner is still a signed-in interactive viewer, not demoted to public.
    await a.v.goto(`/session/${a.s}`);await expect(a.v.getByRole('button',{name:'Increase Harbour',exact:true})).toBeVisible();
    diagnostics.allowHttp(publicPage,`/api/public/sessions/${a.s}`,404);await page.getByRole('button',{name:'Make session private',exact:true}).click();await expect(publicPage.getByRole('alert')).toContainText('Public access has ended');await expect(publicPage.locator('.fact-text,.scoreboard-score')).toHaveCount(0);
  }finally{await anonymous.close();await a.client.close();}
});

test('anonymous short-key link makes account and pairing explicit, then grants only the approved display',async({page,baseURL,browser,diagnostics},info)=>{
  const a=await setup(page,info,baseURL!,true),anonymous=await isolatedContext(browser,info,baseURL!);try{
    await a.show(fact('Approved screen only'));const address=await a.call('kanvas_session','address.get',{sessionId:a.s}),short=new URL(address.url).pathname.split('/').pop()!;
    const guest=await anonymous.newPage();diagnostics.watch(guest);await guest.goto('/');await expect(guest.getByLabel('Password',{exact:true})).toHaveCount(0);await expect(guest.getByRole('heading',{name:'Sign in on this screen',exact:true})).toBeVisible();await expect(guest.locator('.login-letters')).toBeVisible();
    // Root is account-code sign-in; the published short link is the session entry point.
    await guest.goto('/s/'+short);
    await expect(guest.getByRole('group',{name:'Choose display access'})).toBeVisible();await expect(guest.getByRole('button',{name:'Sign in to my account'})).toBeVisible();
    let pending=await a.call('kanvas_inspect','pairings.read',{sessionId:a.s});expect(pending.requests??pending).toHaveLength(0);
    await guest.getByRole('button',{name:'Pair this screen'}).click();await expect(guest.getByRole('heading',{name:'Waiting for the owner.'})).toBeVisible();
    await expect.poll(async()=>{pending=await a.call('kanvas_inspect','pairings.read',{sessionId:a.s});return(pending.requests??pending).length;}).toBe(1);
    const request=(pending.requests??pending)[0];await a.call('kanvas_access','pairing.decide',{sessionId:a.s,pairingId:request.id,approve:true,confirm:true});await expect(guest.locator('.fact-text')).toHaveText('Approved screen only',{timeout:15000});
    expect((await guest.request.get('/api/start')).status()).toBe(403);await guest.reload();await expect(guest.locator('.fact-text')).toHaveText('Approved screen only');await photo(guest,info,'approved-screen');
    diagnostics.allowHttp(guest,`/api/sessions/${a.s}`,401);await a.call('kanvas_access','pairing.revoke',{sessionId:a.s,pairingId:request.id});await expect(guest.locator('.fact-text')).toHaveCount(0);await expect(guest.getByRole('group',{name:'Choose display access'})).toBeVisible();await expect(a.v.locator('.fact-text')).toHaveText('Approved screen only');expect((await guest.request.get(`/api/sessions/${a.s}?displayId=${a.d.id}`)).status()).toBe(401);
    await a.v.getByRole('button',{name:'Display controls',exact:true}).click();await a.v.getByRole('button',{name:/^Session overview/}).click();await expect(a.v.locator('.filmstrip-overview .filmstrip-grid')).toBeVisible();await expect(a.v.getByRole('button',{name:'Sign out of this browser',exact:true})).toBeVisible();
  }finally{await anonymous.close();await a.client.close();}
});

test('account Home offers a compact recent-session list without auto-opening a session',async({page,diagnostics},info)=>{
  await register(page);for(let i=0;i<5;i++){const s=await sessionApi<{id:string}>(page,'/api/sessions','POST',{name:`Recent project ${i}`});expect(s.status).toBe(200);expect((await sessionApi(page,`/api/sessions/${s.data!.id}/displays`,'POST',{name:'Display'})).status).toBe(200);}
  await page.goto('/start');const region=page.getByRole('region',{name:'Your sessions'});await expect(region).toBeVisible();await expect(region.locator('.session-choice strong').filter({hasText:/^Recent project/})).toHaveCount(5);const names=await region.locator('.session-choice strong').allTextContents();expect(names.filter(n=>n.startsWith('Recent project'))).toHaveLength(5);
  await expect(region.getByRole('button',{name:/^(Gallery|List)$/})).toHaveCount(0);await expect(region.locator('.compact-session-list')).toBeVisible();expect(await region.locator('.session-choice strong').allTextContents()).toEqual(names);
  expect(await region.locator('.compact-session-list article').first().evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(130);await photo(page,info,'recent-session-list');
  const homeRoute=/^\/view\/([^/]+)\/([^/]+)\/?$/.exec(new URL(page.url()).pathname);expect(homeRoute).not.toBeNull();
  // Revoking this browser can reject its last in-flight Home poll. That exact
  // 401 is expected; no application exceptions or other HTTP failures are.
  diagnostics.allowHttp(page,`/api/sessions/${homeRoute![1]}`,401);
  await expect(page.getByRole('button',{name:'Sign out of this browser',exact:true})).toBeVisible();await page.getByRole('button',{name:'Sign out of this browser',exact:true}).click();await expect(page).toHaveURL(new URL('/',page.url()).href);await expect(page.getByRole('heading',{name:'Sign in on this screen',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Your sessions'})).toHaveCount(0);expect((await page.request.get('/api/start')).status()).toBe(401);
});

test('discovered table scroll and back/forward history move the receiving view without changing source',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    const source={columns:['Name','Exact value'],pageSize:50,rows:Array.from({length:45},(_,i)=>({'Name':`Original row ${i}`,'Exact value':'9007199254740993.001'}))};await a.show({version:1,template:'table',data:source});
    await expect.poll(()=>a.v.locator('.table-scroll').evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(50);const d=await a.current();await a.call('kanvas_control','navigation.control',{sessionId:a.s,displayId:a.d.id,requestId:randomUUID(),expectedRevision:d.revision,navigation:{action:'scroll',deltaY:1}});
    await expect.poll(()=>a.v.locator('.table-scroll').evaluate(e=>e.scrollTop)).toBeGreaterThan(50);expect((await a.current()).view?.data).toMatchObject(source);
    await expect.poll(async()=>{const r=await a.call('kanvas_inspect','navigation.read',{sessionId:a.s,displayId:a.d.id});return r.viewers.some((v:any)=>v.status==='applied'&&v.scroll?.maxY>50&&v.scroll?.y>0);}).toBe(true);
    await a.show(fact('Second retained beat'));for(const direction of ['back','forward']){const current=await a.current();await a.call('kanvas_control','history.navigate',{sessionId:a.s,displayIds:[a.d.id],expectedRevisions:{[a.d.id]:current.revision},requestId:randomUUID(),direction});if(direction==='back'){await expect(a.v.locator('.table-scroll')).toContainText('Original row 0');expect((await a.current()).view?.data).toMatchObject(source);}else await expect(a.v.locator('.fact-text')).toHaveText('Second retained beat');}
  }finally{await a.client.close();}
});

test('new event views scroll their actual overflowing reader and report applied navigation',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    const scroll=async(selector:string)=>{
      const reader=a.v.locator(selector);await expect.poll(()=>reader.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(100);
      const before=await a.current();await a.call('kanvas_control','navigation.control',{sessionId:a.s,displayId:a.d.id,requestId:randomUUID(),expectedRevision:before.revision,navigation:{action:'scroll',y:1}});
      await expect.poll(()=>reader.evaluate(e=>e.scrollTop)).toBeGreaterThan(100);
      await expect.poll(async()=>{const r=await a.call('kanvas_inspect','navigation.read',{sessionId:a.s,displayId:a.d.id});return r.viewers.some((v:any)=>v.status==='applied'&&v.scroll?.maxY>100&&v.scroll?.y>.99);}).toBe(true);
      expect((await a.current()).view).toEqual(before.view);
    };
    await a.show({version:1,template:'scoreboard',data:{sides:Array.from({length:16},(_,i)=>({id:`team-${i}`,name:`Team ${i}`,score:i}))}});expect(await a.v.locator('.scoreboard-content').evaluate(e=>e.scrollHeight<=e.clientHeight+2)).toBe(true);await expect(a.v.getByRole('button',{name:/^Increase Team/})).toHaveCount(16);
    await a.show({version:1,template:'standings',data:{columns:[{id:'points',label:'Points',type:'number'}],groups:[{id:'league',rows:Array.from({length:60},(_,i)=>({id:`row-${i}`,name:`Team ${i}`,position:i+1,values:{points:'1.2300'}}))}]}});await scroll('.standings-content');
    await a.show({version:1,template:'tool-call-log',data:{channel:'main',limit:100}});
    await a.call('kanvas_publish','tool-log.append',{sessionId:a.s,requestId:randomUUID(),events:Array.from({length:60},(_,i)=>({id:`scroll-call-${i}`,integration:'Source',tool:i%2?'read':'write',timestamp:new Date(Date.UTC(2026,8,21,12,0,i)).toISOString(),summary:`Exact call ${i}`}))});
    await expect(a.v.locator('.tool-call-content>ol>li').filter({has:a.v.locator('.tool-call-integration',{hasText:'Source'})})).toHaveCount(60);await scroll('.tool-call-content');
  }finally{await a.client.close();}
});
