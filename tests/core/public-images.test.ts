import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startHarness,success,denied,PNG,type Harness,type Browser} from './harness.js';
import type {PublicImageOptions} from '../../src/server/public-images.js';
describe('anonymous source-bound image recovery',()=>{
  let h:Harness,b:Browser,s:string,d:string;const request=vi.fn<NonNullable<PublicImageOptions['request']>>();
  beforeEach(async()=>{request.mockReset().mockResolvedValue({statusCode:200,headers:{'content-type':'image/png'},body:Buffer.from(PNG,'base64')});h=await startHarness({publicImageOptions:{request}});b=await h.account();s=(await b.session()).id;d=(await b.display(s)).id;await b.submit(s,[d],{version:1,template:'image',data:{images:[{url:'https://example.com/original.png',alt:'Source logo'}]}});});
  afterEach(async()=>{await h?.close();});
  const path=()=>`/api/sessions/${s}/displays/${d}/image-fallback`;
  const recover=(url='https://example.com/original.png')=>b.request<any>('POST',path(),{expectedRevision:1,url}, {signal:AbortSignal.timeout(25000)});
  it('returns protected exact raster bytes and rechecks source/permissions/revision on every derivative read',async()=>{
    const result=success(await recover());expect(result).toMatchObject({status:'available',converted:false});expect(request).toHaveBeenCalledTimes(1);expect(success(await recover()).imageUrl).toBe(result.imageUrl);expect(request).toHaveBeenCalledTimes(1);
    const image=await b.raw(result.imageUrl);expect(Buffer.from(await image.arrayBuffer())).toEqual(Buffer.from(PNG,'base64'));expect(image.headers.get('cache-control')).toContain('no-store');
    denied(await h.browser().request('GET',result.imageUrl),[401]);denied(await recover('https://elsewhere.example/private.png'),[404]);
    await b.submit(s,[d],{version:1,template:'fact',data:{text:'Changed'}});denied(await b.request('GET',result.imageUrl),[409]);
  });
  it('reports host-level evidence without leaking source query data or inventing a hotlink explanation',async()=>{
    request.mockResolvedValueOnce({statusCode:403,headers:{},body:Buffer.from('PRIVATE ERROR PAGE')});const result=success(await recover());expect(result).toMatchObject({status:'unavailable',host:'example.com',reason:'HTTP_403'});expect(JSON.stringify(result)).not.toContain('PRIVATE ERROR');
    expect((await b.detail(s)).displays[0].imageDiagnostics).toMatchObject([{host:'example.com',reason:'HTTP_403'}]);
    request.mockRejectedValueOnce(Object.assign(new Error('internal resolver diagnostic'),{code:'ENOTFOUND'}));expect(success(await recover()).reason).toBe('DNS_UNAVAILABLE');
    request.mockResolvedValueOnce({statusCode:302,headers:{location:'http://127.0.0.1/private'},body:Buffer.alloc(0)});expect(success(await recover()).status).toBe('unavailable');expect(request).toHaveBeenCalledTimes(3);
  });
  it('rasterizes a real SVG in isolated Chromium without executing scripts or requesting embedded private content',async()=>{
    request.mockResolvedValue({statusCode:200,headers:{'content-type':'image/svg+xml'},body:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><script>fetch("http://127.0.0.1/private")</script><rect width="200" height="100" fill="#336699"/><text x="10" y="50" fill="white">Source SVG</text><image href="http://127.0.0.1/private"/></svg>')});
    const result=success(await recover());expect(result).toMatchObject({status:'available',converted:true});expect(request).toHaveBeenCalledTimes(1);const image=await b.raw(result.imageUrl);expect(image.headers.get('content-type')).toBe('image/png');expect(Buffer.from(await image.arrayBuffer()).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  },25000);
});
