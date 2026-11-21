import {afterEach,expect,it} from 'vitest';
import {startHarness,type Harness} from './harness';
import {sessionCaptureLimit} from '../../src/server/usage-limits';
import {isCaptureTileUrl} from '../../src/server/capture-providers';
let h:Harness;afterEach(async()=>{await h?.close();});
it('capture counts follow owner entitlement without removing media/rate guards or granting admin authority',async()=>{
 h=await startHarness();const owner=await h.account(),s=(await owner.session()).id,store=h.runtime.service.store;
 expect(await sessionCaptureLimit(store,s)).toBe(100);
 await store.put('account-tier',{id:owner.user!.id,tier:'free'});expect(await sessionCaptureLimit(store,s)).toBe(1000);
 await store.put('account-tier',{id:owner.user!.id,tier:'admin'});expect(await sessionCaptureLimit(store,s)).toBe(Infinity);
 await store.put('account-tier',{id:owner.user!.id,tier:'unknown'});expect(await sessionCaptureLimit(store,s)).toBe(100);
});
it('capture provider policy only accepts exact public raster tile paths, never arbitrary hosts, ports or redirects',()=>{
 expect(isCaptureTileUrl('https://tile.openstreetmap.org/12/2074/1409.png')).toBe(true);
 for(const url of ['http://tile.openstreetmap.org/1/0/0.png','https://tile.openstreetmap.org:444/1/0/0.png','https://tile.openstreetmap.org.evil.test/1/0/0.png','https://127.0.0.1/1/0/0.png','https://tile.openstreetmap.org/20/0/0.png','https://tile.openstreetmap.org/1/3/0.png','https://tile.openstreetmap.org/1/0/0.png?url=http://localhost','https://a@tile.openstreetmap.org/1/0/0.png','https://tile.openstreetmap.org/admin'])expect(isCaptureTileUrl(url)).toBe(false);
});
