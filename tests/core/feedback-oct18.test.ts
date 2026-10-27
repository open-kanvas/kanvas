import {validateMedia} from '../../src/server/rendering/media';
import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {startHarness,success,PNG,type Harness,type Browser} from './harness';
import {materializeSeats,signSchema} from '../../src/shared/venue';
import {navigate,initialNavigation,navigationCapabilities,navigationActionSchema} from '../../src/shared/navigation';
import {guidanceTools,DEFAULT_AGENT_GUIDANCE} from '../../src/server/agent-guidance';
import {safeUrl} from '../../src/client/api';
import {bindTemplate} from '../../src/shared/custom-templates';
import {CANONICAL_TOOLS} from '../../src/server/mcp/canonical';
it('5000-char guidance including Unicode, and exact owner-overridable default',()=>{
 const schema=guidanceTools.find(t=>t.name==='kanvas_guidance_set')!.schema;
 expect(schema.safeParse({scope:'user',text:'å'.repeat(5000),requestId:'long',expectedRevision:0}).success).toBe(true);
 expect(schema.safeParse({scope:'user',text:'x'.repeat(5001),requestId:'long',expectedRevision:0}).success).toBe(false);
 expect(DEFAULT_AGENT_GUIDANCE).toContain('Default behavior: be proactive with Kanvas');
});
it('group grids, meaningful labels and localizable microcopy retain explicit names',()=>{
 expect(materializeSeats({layout:'round-tables',tableCount:4,tableColumns:2}).tableColumns).toBe(2);
 expect(materializeSeats({layout:'theater'}).tables[0].name).toBe('Row 1');
 expect(materializeSeats({layout:'classroom-grid'}).tables[0].name).toBe('Section 1');
 expect(materializeSeats({layout:'theater',tables:[{id:'a',name:'Balcony'}]}).tables[0].name).toBe('Balcony');
 expect(signSchema.parse({openNow:false,closedLabel:'Stengt',closedDayLabel:'Stengt'}).closedLabel).toBe('Stengt');
});
it('platform zoom supports any template without modifying source or reading settings',()=>{
 for(const template of ['kanban','menu','image','website','document','seat-map']){const view:any={version:1,template,data:{}};expect(navigationCapabilities(view).zoom).toBe(true);const initial=initialNavigation(view),next=navigate(view,initial,{action:'zoom',scale:.5});expect(next.scale).toBe(.5);expect(initial.scale).toBeUndefined();expect(navigate(view,next,{action:'zoom',direction:'reset'}).scale).toBe(1);}
 expect(navigationActionSchema.safeParse({action:'zoom',scale:0}).success).toBe(false);
});
it('protected media is a safe image URL, not an arbitrary relative URL',()=>{
 expect(safeUrl('/api/media/abc',true)).toBe('/api/media/abc');expect(safeUrl('/api/assets/abc',true)).toBe('/api/assets/abc');expect(safeUrl('/api/media/../tokens',true)).toBeUndefined();
 expect(bindTemplate('<ul>{{#each points}}<li>{{value}}</li>{{/each}}</ul>',{points:['A','<B>']})).toBe('<ul><li>A</li><li>&lt;B&gt;</li></ul>');
 expect(CANONICAL_TOOLS.find(t=>t.name==='kanvas_account_templates_create')!.description).toContain('{{value}}');
});
describe('account media reuse and image diagnostics',()=>{
 let h:Harness,o:Browser,s:string,d:string;
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;});afterEach(async()=>{await h?.close();});
 it('explicit import copies an asset into private account storage without losing session scope',async()=>{
  const asset=success(await o.request<any>('POST',`/api/sessions/${s}/assets`,{name:'reuse.png',mimeType:'image/png',base64:PNG}));
  const p={userId:o.user!.id};const media:any=await h.runtime.service.execute('kanvas_media_import',{sessionId:s,assetId:asset.id,tags:['reuse']},p);
  expect(media.id).not.toBe(asset.id);expect(media.url).toBe('/api/media/'+media.id);expect((await h.runtime.service.mediaLibrary.list(p,'reuse'))).toHaveLength(1);
  const stranger=await h.account();await expect(h.runtime.service.mediaLibrary.own({userId:stranger.user!.id},media.id)).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(h.runtime.service.mediaLibrary.importAsset({userId:stranger.user!.id},s,asset.id)).rejects.toThrow();
  expect((await o.request('GET',asset.url)).status).toBe(200);expect((await o.request('GET',media.url)).status).toBe(200);
 });
 it('client diagnostic only records current referenced URLs; no arbitrary source or stale poisoning',async()=>{
  const asset=success(await o.request<any>('POST',`/api/sessions/${s}/assets`,{name:'test.png',mimeType:'image/png',base64:PNG}));
  await o.submit(s,[d],{version:1,template:'image',data:{images:[{url:asset.url}]}});const display=(await o.detail(s)).displays.find(x=>x.id===d)!;
  const path=`/api/sessions/${s}/displays/${d}/image-diagnostic`,body={expectedRevision:display.revision,url:asset.url,reason:'HTTP_404'};
  expect((await o.request('POST',path,body)).status).toBe(200);
  expect((await o.detail(s)).displays.find(x=>x.id===d)!.imageDiagnostics).toEqual(expect.arrayContaining([expect.objectContaining({reason:'HTTP_404',host:'protected-media'})]));
  expect((await o.request('POST',path,{...body,url:'/api/assets/not-referenced'})).status).toBe(404);
  expect((await o.request('POST',path,{...body,expectedRevision:0})).status).toBe(409);
  expect((await o.request('POST',path,{...body,reason:'cookies secret'})).status).toBe(400);
 });
});

it('rejects corrupt PNG header/framing accepted by the previous signature-only check',()=>{
 const valid=Buffer.from(PNG,'base64');expect(validateMedia({name:'pixel.png',mimeType:'image/png',base64:PNG}).width).toBe(1);
 const header=Buffer.from(valid);header[29]^=1;
 expect(()=>validateMedia({name:'bad-header.png',mimeType:'image/png',base64:header.toString('base64')})).toThrow();
 const chunk=Buffer.from(valid);chunk.writeUInt32BE(0xffffffff,33);
 expect(()=>validateMedia({name:'bad-chunk.png',mimeType:'image/png',base64:chunk.toString('base64')})).toThrow();
 const truncated=Buffer.concat([valid.subarray(0,37),valid.subarray(valid.length-12)]);
 expect(()=>validateMedia({name:'truncated.png',mimeType:'image/png',base64:truncated.toString('base64')})).toThrow();
});
