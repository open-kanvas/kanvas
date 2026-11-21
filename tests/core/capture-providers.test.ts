import {beforeEach,expect,it,vi} from 'vitest';
const seam=vi.hoisted(()=>({lookup:vi.fn(),request:vi.fn()}));
vi.mock('node:dns/promises',()=>({lookup:seam.lookup}));
vi.mock('../../src/server/monitoring',async original=>({...await original<object>(),pinnedMonitoringRequest:seam.request}));
import {CaptureTiles} from '../../src/server/capture-providers';
const tile='https://tile.openstreetmap.org/1/0/0.png',png=Buffer.from([137,80,78,71,13,10,26,10]);
beforeEach(()=>{seam.lookup.mockReset().mockResolvedValue([{address:'93.184.216.34',family:4}]);seam.request.mockReset().mockResolvedValue({statusCode:200,headers:{'content-type':'image/png'},body:png});});
it('pins anonymous bounded tile requests and refuses private DNS, redirects and non-PNG responses',async()=>{
 expect(await new CaptureTiles().fetch(tile)).toEqual(png);
 expect(seam.request.mock.calls[0][0]).toMatchObject({address:{address:'93.184.216.34',family:4},maxBytes:524288,accept:'image/png',headersOnly:false});
 expect(seam.request.mock.calls[0][0].headers).toBeUndefined();
 seam.lookup.mockResolvedValue([{address:'127.0.0.1',family:4}]);await expect(new CaptureTiles().fetch(tile)).rejects.toThrow('not public');
 seam.lookup.mockResolvedValue([{address:'93.184.216.34',family:4}]);seam.request.mockResolvedValue({statusCode:302,headers:{location:'http://127.0.0.1/private'},body:Buffer.alloc(0)});await expect(new CaptureTiles().fetch(tile)).rejects.toThrow('rejected');
 seam.request.mockResolvedValue({statusCode:200,headers:{'content-type':'text/html'},body:png});await expect(new CaptureTiles().fetch(tile)).rejects.toThrow('rejected');
});
it('keeps per-capture request and concurrent-request budgets',async()=>{
 const tiles=new CaptureTiles();for(let i=0;i<128;i++)await tiles.fetch(tile);await expect(tiles.fetch(tile)).rejects.toThrow('budget');
 seam.request.mockClear();const releases:(()=>void)[]=[];seam.request.mockImplementation(()=>new Promise(resolve=>releases.push(()=>resolve({statusCode:200,headers:{'content-type':'image/png'},body:png}))));const busy=new CaptureTiles();const promises=Array.from({length:17},()=>busy.fetch(tile));
 await vi.waitFor(()=>expect(releases).toHaveLength(16));expect(seam.request).toHaveBeenCalledTimes(16);
 for(const release of releases.splice(0))release();await vi.waitFor(()=>expect(releases).toHaveLength(1));releases[0]();await Promise.all(promises);
});
