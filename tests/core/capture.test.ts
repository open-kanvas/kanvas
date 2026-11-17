import { afterEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import type { Harness } from './harness.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
import { WebsitePreview } from '../../src/server/website-preview.js';

describe("capture coverage 1", () => {

let h!:Harness;
afterEach(async()=>{await h?.close();});
it('returns useful metadata when a refused site cannot be captured',async()=>{
  h=await startHarness();const owner=await h.account(),s=(await owner.session()).id,d=(await owner.display(s)).id;
  await owner.submit(s,[d],{version:1,template:'website',data:{pages:[{url:'https://example.com/'}]}});
  const preview=new WebsitePreview(h.runtime.service,{request:async(_url,headersOnly)=>({statusCode:200,headers:{'content-type':'text/html','x-frame-options':'DENY'},body:Buffer.from(headersOnly?'':'<title>Useful source</title><meta name="description" content="A public page summary"><meta property="og:image" content="https://example.com/cover.png">')}),screenshot:async()=>{throw new Error('Site blocks bots');}});
  const result=await preview.preview({userId:owner.user!.id},s,d,{expectedRevision:1,page:0});expect(result).toMatchObject({status:'unavailable',title:'Useful source',description:'A public page summary',previewImage:'https://example.com/cover.png',remoteContentVerified:false});
});
});
