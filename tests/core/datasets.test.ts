import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { PNG } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import { validateView } from '../../src/shared/view-schemas.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';

describe("datasets coverage 1", () => {


describe("datasets contracts",()=>{
  let h!:Harness,owner:Browser,sessionId:string,displayId:string,p:AuthPrincipal;
  const path=()=>`/api/sessions/${sessionId}/displays/${displayId}`;
  const call=async (name:string,args:unknown)=>(await h.runtime.service.execute(name,args,p));
  beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;p={userId:owner.user!.id};});
  afterEach(async()=>{await h?.close();});
  it('validates row arrays losslessly without publishing or saving a source, and rejects mismatched widths',async()=>{
    const before=(await h.runtime.store.db.prepare('SELECT count(*) n FROM documents').get())!.n;
    const result=await call('kanvas_view_validate',{sessionId,view:{version:1,template:'table',data:{columns:['Item','Value'],rows:[['A','12345678901234567890.001'],['B',null]]}}}) as {valid:boolean;view:{data:{rows:unknown[]}}};
    expect(result.view.data.rows).toEqual([{Item:'A',Value:'12345678901234567890.001'},{Item:'B',Value:null}]);expect((await h.runtime.store.db.prepare('SELECT count(*) n FROM documents').get())!.n).toBe(before);
    expect(()=>validateView({version:1,template:'table',data:{columns:['A','B'],rows:[[1]]}})).toThrow();
    await expect(call('kanvas_view_validate',{sessionId,view:{version:1,template:'image',data:{images:[{url:'/api/assets/missing',alt:'Missing'}]}}})).rejects.toBeTruthy();
  });});
});
