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

test.describe("roster coverage 1", () => {

const photo='https://example.com/feedback-photo.png';
const image='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#c9e4f0"/><path d="M0 160L95 35L185 150L260 50L320 155Z" fill="#36745b"/><rect y="150" width="320" height="30" fill="#2986b2"/><text x="12" y="24" font-family="sans-serif" font-size="16" fill="#173849">Synthetic image fixture</text></svg>';
async function setup(page:Page){await page.context().route('https://example.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:image}));await page.context().route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:image}));await register(page);const sessionId=await createSession(page,'Synthetic feedback acceptance'),display=await createDisplay(page,sessionId,'Feedback');const viewer=await openViewer(page,sessionId,display.id);return{sessionId,display,viewer};}
async function show(page:Page,viewer:Page,sessionId:string,id:string,view:ViewSpec){const before=(await sessionDetail(page,sessionId)).displays.find(d=>d.id===id)!.revision;await publishPrepared(page,sessionId,[id],view);const current=await waitForDisplay(page,sessionId,id,d=>d.revision>before&&d.appliedRevision===d.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));await viewer.evaluate(()=>document.fonts.ready.then(()=>undefined));}
const v=(template:ViewSpec['template'],data:Record<string,unknown>):ViewSpec=>({version:1,template,data});
test('roster day summaries remain visible and separable at team scale',async({page},info)=>{const{sessionId,display,viewer}=await setup(page);const people=Array.from({length:20},(_,i)=>({id:`p${i}`,name:`Person ${i+1}`}));await show(page,viewer,sessionId,display.id,v('roster',{start:'2026-10-01',end:'2026-10-07',people,shifts:[{id:'d',label:'Day',segment:'morning'},{id:'n',label:'Night',segment:'night'}],assignments:people.flatMap((p,i)=>Array.from({length:7},(_,j)=>({person:p.id,date:`2026-10-0${j+1}`,shift:i<15?'d':'n'}))),showDayCounts:true}));const surface=viewer.locator('.viewer-candidate');await expect(surface.getByRole('gridcell',{name:'2026-10-01: Day 15',exact:true})).toHaveCount(1);await expect(surface.getByRole('gridcell',{name:'2026-10-01: Night 5',exact:true})).toHaveCount(1);await surface.getByRole('gridcell',{name:'2026-10-07: Night 5',exact:true}).scrollIntoViewIfNeeded();await viewer.screenshot({animations:'disabled',path:info.outputPath('roster-counts.png')});});
});
