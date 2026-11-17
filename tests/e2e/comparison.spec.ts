import type { Page } from '@playwright/test';
import type { ViewSpec } from '../../src/shared/types';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionDetail } from './support';
import { test } from './support';
import { waitForDisplay } from './support';

test.describe("comparison coverage 1", () => {

const photo='https://example.com/feedback-photo.png';
const image='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#c9e4f0"/><path d="M0 160L95 35L185 150L260 50L320 155Z" fill="#36745b"/><rect y="150" width="320" height="30" fill="#2986b2"/><text x="12" y="24" font-family="sans-serif" font-size="16" fill="#173849">Synthetic image fixture</text></svg>';
async function setup(page:Page){await page.context().route('https://example.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:image}));await page.context().route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:image}));await register(page);const sessionId=await createSession(page,'Synthetic feedback acceptance'),display=await createDisplay(page,sessionId,'Feedback');const viewer=await openViewer(page,sessionId,display.id);return{sessionId,display,viewer};}
async function show(page:Page,viewer:Page,sessionId:string,id:string,view:ViewSpec){const before=(await sessionDetail(page,sessionId)).displays.find(d=>d.id===id)!.revision;await publishPrepared(page,sessionId,[id],view);const current=await waitForDisplay(page,sessionId,id,d=>d.revision>before&&d.appliedRevision===d.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));await viewer.evaluate(()=>document.fonts.ready.then(()=>undefined));}
const v=(template:ViewSpec['template'],data:Record<string,unknown>):ViewSpec=>({version:1,template,data});
test('headerless grid, source-aware highlights and ten-item comparison are readable',async({page},info)=>{const{sessionId,display,viewer}=await setup(page);await show(page,viewer,sessionId,display.id,v('table',{rows:Array.from({length:12},(_,i)=>Array.from({length:6},(_,j)=>`Template ${i*6+j+1}`)),pageSize:12}));const surface=viewer.locator('.viewer-candidate');await expect(surface.locator('thead')).toHaveCount(0);await expect(surface.locator('td')).toHaveCount(72);await surface.getByText('Template 72',{exact:true}).scrollIntoViewIfNeeded();await viewer.screenshot({animations:'disabled',path:info.outputPath('headerless-grid.png')});
 await show(page,viewer,sessionId,display.id,{...v('table',{columns:['Day','Revenue'],rows:[{Day:'Fri',Revenue:0},{Day:'Sat',Revenue:320000},{Day:'Sun',Revenue:-1}],emphasis:[{row:1,column:'Revenue'}]}),selection:{where:[],sort:[],match:'all',highlight:[{field:'Revenue',op:'gte',value:0,type:'auto'}]}});await expect(surface.locator('tr.agent-highlight')).toHaveCount(2);await expect(surface.locator('[data-emphasis=true]')).toHaveCount(1);expect(await surface.locator('tr.agent-highlight td').first().evaluate(e=>getComputedStyle(e).boxShadow)).not.toBe('none');await viewer.screenshot({animations:'disabled',path:info.outputPath('table-emphasis.png')});
 await show(page,viewer,sessionId,display.id,v('comparison',{criteria:['Price','Location'],items:Array.from({length:10},(_,i)=>({name:`Holiday Inn Express Long Hotel Name ${i+1}`,image:{url:photo,alt:`Hotel ${i+1}`},values:{Price:`NOK ${1000+i*100}`,Location:'City centre'},highlights:i===0?['Price']:[]})),commentary:{Price:'First hotel costs least; no invented totals',Location:'Choose by your priorities'}}));await expect(surface.locator('.comparison-name')).toHaveCount(10);for(const name of await surface.locator('.comparison-name').all()){expect(await name.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);expect(await name.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(22);}await expect(surface.locator('.cell-emphasis')).toHaveCount(1);await surface.getByText('Choose by your priorities').scrollIntoViewIfNeeded();const overflow=await viewer.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow).toBe(false);await viewer.screenshot({animations:'disabled',path:info.outputPath('comparison-ten.png')});
});
});
