import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startHarness,success,denied,type Harness,type Browser} from './harness.js';
import {WebsitePreview,framingRefusal,type WebsitePreviewOptions} from '../../src/server/website-preview.js';

describe('anonymous static fallback only for enforced framing refusal',()=>{
  let h:Harness,owner:Browser,s:string,d:string;
  const request=vi.fn<NonNullable<WebsitePreviewOptions['request']>>(),screenshot=vi.fn<NonNullable<WebsitePreviewOptions['screenshot']>>();
  beforeEach(async()=>{request.mockReset().mockResolvedValue({statusCode:200,headers:{'content-type':'text/html','x-frame-options':'DENY'},body:Buffer.from('Public HTML')});screenshot.mockReset().mockResolvedValue(Buffer.from('bounded-jpeg-fixture'));
    h=await startHarness({websitePreviewOptions:{request,screenshot}});owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;
    await owner.submit(s,[d],{version:1,template:'iframe',data:{layout:'grid',pages:[{url:'https://example.com/one'},{url:'https://example.org/two'},{url:'https://example.net/three'}]}});
  });
  afterEach(async()=>{await h?.close();});
  const path=()=>`/api/sessions/${s}/displays/${d}/website-preview`;
  const preview=(page=0,browser=owner)=>browser.request<{status:string;imageUrl?:string;remoteContentVerified:boolean}>('POST',path(),{expectedRevision:1,page});
  it('honors enforced frame-ancestors precedence, ignores report-only or ambiguous policies, and captures only confirmed refusal',async()=>{
    const parent='https://kanvas.example',site='https://example.com';
    expect(framingRefusal({'x-frame-options':'DENY'},site,parent)).toBe('x-frame-options');
    expect(framingRefusal({'x-frame-options':'DENY','content-security-policy':`frame-ancestors ${parent}`},site,parent)).toBeUndefined();
    expect(framingRefusal({'content-security-policy':"default-src 'none'; frame-ancestors 'self'"},site,parent)).toBe('csp');
    expect(framingRefusal({'content-security-policy-report-only':"frame-ancestors 'none'"},site,parent)).toBeUndefined();
    request.mockResolvedValueOnce({statusCode:200,headers:{'content-type':'text/html'},body:Buffer.from('HTML')});expect(success(await preview()).status).toBe('interactive');expect(screenshot).not.toHaveBeenCalled();
    const image=success(await preview());expect(image).toMatchObject({status:'static',remoteContentVerified:false});expect(screenshot).toHaveBeenCalledTimes(1);
    const response=await owner.raw(image.imageUrl!);expect(response.headers.get('content-type')).toContain('image/jpeg');expect(response.headers.get('cache-control')).toContain('no-store');expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('bounded-jpeg-fixture');
    expect(success(await preview()).imageUrl).toBe(image.imageUrl);expect(screenshot).toHaveBeenCalledTimes(1);
  });
  it('does not follow redirects to private services or capture authenticated/error responses',async()=>{
    request.mockResolvedValueOnce({statusCode:302,headers:{location:'http://127.0.0.1/private'},body:Buffer.alloc(0)});expect(success(await preview()).status).toBe('unavailable');expect(request).toHaveBeenCalledTimes(2);expect(screenshot).not.toHaveBeenCalled();
    request.mockResolvedValueOnce({statusCode:401,headers:{'x-frame-options':'DENY'},body:Buffer.alloc(0)});expect(success(await preview()).status).toBe('unavailable');expect(screenshot).not.toHaveBeenCalled();
    denied(await owner.request('POST',path(),{expectedRevision:1,page:0,url:'https://elsewhere.invalid'}),[400]);
    denied(await h.browser().request('POST',path(),{expectedRevision:1,page:0}),[401]);
  });
  it('bounds concurrent probes/captures and permits later grid cells to retry without duplicate capture',async()=>{
    let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});screenshot.mockImplementation(async()=>{await gate;return Buffer.from('fixture');});
    const a=preview(0),duplicate=preview(0),b=preview(1);await vi.waitFor(()=>expect(screenshot).toHaveBeenCalledTimes(1));
    expect(success(await preview(2)).status).toBe('pending');expect(request).toHaveBeenCalledTimes(1);release();
    const results=(await Promise.all([a,duplicate,b])).map(success);expect(results[0].imageUrl).toBe(results[1].imageUrl);expect(success(await preview(2)).status).toBe('static');expect(screenshot).toHaveBeenCalledTimes(2);
  });
  it('rechecks source revision and authorization after slow capture, and makes old images inaccessible',async()=>{
    const image=success(await preview());const member=await h.account();success(await owner.request('POST',`/api/sessions/${s}/members`,{username:member.user!.username,role:'viewer'}));
    let release!:(bytes:Buffer)=>void;screenshot.mockImplementationOnce(()=>new Promise(r=>{release=r;}));const pending=preview(1,member);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    success(await owner.request('DELETE',`/api/sessions/${s}/members/${member.user!.id}`));release(Buffer.from('Must not be stored'));denied(await pending);
    expect((await h.runtime.store.list('website-capture'))).toHaveLength(1);
    await owner.submit(s,[d],{version:1,template:'fact',data:{text:'New view'}},randomUUID());denied(await owner.request('GET',image.imageUrl!),[404,409]);
  });
  it('captures a refused public page in real isolated Chromium while blocking its private-network subrequest',async()=>{
    const requests:string[]=[];
    const previewer=new WebsitePreview(h.runtime.service,{request:async(url,headersOnly)=>{
      requests.push(url.href);return {statusCode:200,headers:{'content-type':'text/html','content-security-policy':"frame-ancestors 'none'"},body:Buffer.from(headersOnly?'':'<!doctype html><html><body style="background:#102a43;color:white;font:36px sans-serif"><h1>Public static preview fixture</h1><img src="http://127.0.0.1/private-secret"></body></html>')};
    }});
    const result=await previewer.preview({userId:owner.user!.id},s,d,{expectedRevision:1,page:0});expect(result.status).toBe('static');
    const response=await owner.raw(result.imageUrl!);const bytes=Buffer.from(await response.arrayBuffer());expect(bytes.subarray(0,2).toString('hex')).toBe('ffd8');expect(bytes.length).toBeGreaterThan(1000);
    expect(requests.every(x=>x.startsWith('https://example.com/'))).toBe(true);
  },25000);
  it('renders a late-discovered stylesheet after a modern page loads its script chunks',async()=>{
    const requests:string[]=[];
    const previewer=new WebsitePreview(h.runtime.service,{request:async(url,headersOnly)=>{
      if(headersOnly)return {statusCode:200,headers:{'content-type':'text/html','x-frame-options':'DENY'},body:Buffer.alloc(0)};
      requests.push(url.pathname);
      if(url.pathname.startsWith('/chunk-'))return {statusCode:200,headers:{'content-type':'application/javascript'},body:Buffer.from('void 0;')};
      if(url.pathname==='/late.css')return {statusCode:200,headers:{'content-type':'text/css'},body:Buffer.from('body{background:#102a43 url("https://example.com/style-applied.png");color:white;font:36px sans-serif}')};
      if(url.pathname==='/style-applied.png')return {statusCode:200,headers:{'content-type':'image/png'},body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=','base64')};
      return {statusCode:200,headers:{'content-type':'text/html','x-frame-options':'DENY'},body:Buffer.from(`<!doctype html><html><body><h1>Styled public content</h1><script>(async()=>{for(let i=0;i<100;i++)await new Promise(resolve=>{const script=document.createElement('script');script.src='/chunk-'+i+'.js';script.onload=resolve;script.onerror=resolve;document.head.append(script);});const style=document.createElement('link');style.rel='stylesheet';style.href='/late.css';document.head.append(style);})();</script></body></html>`)};
    }});
    const result=await previewer.preview({userId:owner.user!.id},s,d,{expectedRevision:1,page:0});
    expect(result.status).toBe('static');
    expect(requests.filter(x=>x.startsWith('/chunk-'))).toHaveLength(100);
    // The background is requested only when Chromium parses and applies the late CSS.
    expect(requests.indexOf('/late.css')).toBeGreaterThan(100);
    expect(requests).toContain('/style-applied.png');
  },25000);
});
