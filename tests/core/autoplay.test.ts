import { describe } from 'vitest';
import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { PNG } from './harness.js';
import type { Harness } from './harness.js';
import { createApp } from '../../src/server/app.js';
import { validateMedia } from '../../src/server/rendering/media.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { normalizedScroll } from '../../src/client/renderers/Navigation.js';
import { navigationCapabilities } from '../../src/shared/navigation.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';

describe("autoplay coverage 1", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});const id=()=>randomUUID();
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient></defs><rect width="100" height="60" fill="url(#g)"/><text x="4" y="30">Team &amp; Friends</text></svg>';
it('accepts documented bare autoplay pause/resume/stop while retaining optional stale-run guards and retry semantics',async()=>{
  h=await startHarness();const owner=await h.account(),s=await owner.session(),d=await owner.display(s.id),svc=h.runtime.service,p={userId:owner.user!.id};await owner.submit(s.id,[d.id],{version:1,template:'presentation',data:{slides:[fact('One'),fact('Two')]}});
  const start=await svc.execute('kanvas_autoplay_control',{sessionId:s.id,displayId:d.id,action:'start',requestId:id(),expectedRevision:1,intervalSeconds:2,loop:true},p) as any;
  const pause={sessionId:s.id,displayId:d.id,action:'pause',requestId:id()};const paused:any=await svc.execute('kanvas_autoplay_control',pause,p);expect(paused.status).toBe('paused');expect(await svc.execute('kanvas_autoplay_control',pause,p)).toEqual(paused);
  await expect(svc.execute('kanvas_autoplay_control',{...pause,action:'resume',requestId:id(),runId:'not-the-run'},p)).rejects.toMatchObject({code:'AUTOPLAY_CHANGED'});
  await expect(svc.execute('kanvas_autoplay_control',{...pause,action:'resume',requestId:id(),expectedVersion:start.version},p)).rejects.toThrow(/changed|revision/i);
  for(const action of ['resume','stop'])expect(await svc.execute('kanvas_autoplay_control',{...pause,action,requestId:id()},p)).toMatchObject({status:action==='stop'?'stopped':'running'});
});
});
