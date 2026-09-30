import { afterEach, describe, expect, it } from 'vitest';
import { startHarness, success, type Harness } from './harness.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
let h:Harness;
afterEach(async()=>{await h?.close();});
describe('night regional preference persistence',()=>{
  it('round-trips IANA zones, seeds new sessions only, and accepts explicit device reset',async()=>{
    h=await startHarness();const owner=await h.account(),s=(await owner.session()).id;
    expect(configPatchSchema.safeParse({timeZone:'Invented/Zone'}).success).toBe(false);
    success(await owner.request('PATCH',`/api/sessions/${s}/config`,{expectedRevision:0,config:{timeZone:'Europe/Oslo',timeFormat:'24h'}}));
    expect((await owner.detail(s)).session.config.timeZone).toBe('Europe/Oslo');
    const principal={userId:owner.user!.id},pref=await h.runtime.service.execute('kanvas_preferences_get',{},principal) as any;
    await h.runtime.service.execute('kanvas_preferences_update',{expectedRevision:pref.revision,config:{timeZone:'America/New_York'}},principal);
    expect((await owner.session()).config.timeZone).toBe('America/New_York');expect((await owner.detail(s)).session.config.timeZone).toBe('Europe/Oslo');
    success(await owner.request('PATCH',`/api/sessions/${s}/config`,{expectedRevision:1,config:{timeZone:''}}));expect((await owner.detail(s)).session.config.timeZone).toBe('');
  });
});
