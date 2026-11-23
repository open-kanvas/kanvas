import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open } from 'maxmind';
const { actualOpen } = await vi.importActual<typeof import('maxmind')>('maxmind').then(module=>({actualOpen:module.open}));
import { requestContext } from '../../src/server/request-context.js';
import { startHarness, success, type Harness } from './harness.js';

vi.mock('maxmind', async (original) => { const actual = await original<typeof import('maxmind')>(); return {...actual, open:vi.fn(actual.open)}; });

const request = { ip:'8.8.8.8', socket:{}, get:(key:string)=>key==='user-agent'?'Mozilla/5.0 Firefox/120.0':'nb-NO' } as unknown as Request;
describe('optional operator-provided GeoLite data',()=>{
  let h:Harness|undefined;
  afterEach(async()=>{await h?.close();h=undefined;vi.unstubAllEnvs();vi.useRealTimers();vi.mocked(open).mockReset();});
  it('does not infer location when unconfigured, missing or corrupt',async()=>{
    vi.mocked(open).mockImplementation(actualOpen);
    const dir=await mkdtemp(join(tmpdir(),'kanvas-geolite-'));
    try {
      for(const path of ['',join(dir,'missing.mmdb'),join(dir,'corrupt.mmdb')]) {
        if(path.endsWith('corrupt.mmdb'))await writeFile(path,'not a database');
        vi.stubEnv('KANVAS_GEOLITE_CITY_PATH',path);
        expect((await requestContext(request)).location).toBeUndefined();
      }
    } finally {await rm(dir,{recursive:true,force:true});}
  });
  it('reloads an externally updated database and drops missing data without network access',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'kanvas-geolite-update-')),path=join(dir,'city.mmdb');
    try {
      await writeFile(path,'operator test fixture');vi.stubEnv('KANVAS_GEOLITE_CITY_PATH',path);
      const first={country:{iso_code:'NO'},subdivisions:[{iso_code:'42'}],city:{names:{en:'Arendal'}},location:{latitude:58.46,longitude:8.77,accuracy_radius:20}};
      vi.mocked(open).mockResolvedValueOnce({get:()=>first} as never);
      expect((await requestContext(request)).location).toMatchObject({country:'NO',city:'Arendal',approximate:true});
      expect((await requestContext(request)).location?.country).toBe('NO');expect(open).toHaveBeenCalledTimes(1);
      await writeFile(path,'operator replacement with different size');
      vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+61000);
      vi.mocked(open).mockResolvedValueOnce({get:()=>({country:{iso_code:'SE'}})} as never);
      expect((await requestContext(request)).location?.country).toBe('SE');expect(open).toHaveBeenCalledTimes(2);
      await rm(path);vi.setSystemTime(Date.now()+61000);
      expect((await requestContext(request)).location).toBeUndefined();
    } finally {await rm(dir,{recursive:true,force:true});}
  });
  it('starts and completes a session pairing with the database missing',async()=>{
    vi.stubEnv('KANVAS_GEOLITE_CITY_PATH','/nonexistent/operator/GeoLite2-City.mmdb');
    h=await startHarness();const owner=await h.account(),session=await owner.session(),display=await owner.display(session.id),guest=h.browser();
    expect((await owner.raw('/readyz')).status).toBe(200);
    const pair=success(await guest.request<{id:string;requestContext?:{location?:unknown}}>('POST','/api/pairings',{sessionId:session.id,displayId:display.id}));
    expect(pair.requestContext?.location).toBeUndefined();
    success(await owner.request('POST','/api/pairings/'+pair.id+'/decision',{approve:true}));
    success(await guest.request('GET','/api/pairings/'+pair.id+'/status'));
    expect((await guest.request('GET','/api/auth/me')).status).toBe(200);
  });
});
