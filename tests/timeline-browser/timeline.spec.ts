import {test,expect} from '@playwright/test';
for(const width of [1920,390])test(`six events fit width ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1080});await page.goto('/tests/timeline-browser/');await expect(page.locator('.temporal-event')).toHaveCount(6);
 expect(await page.locator('.temporal-timeline').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const cards=await page.locator('.temporal-event').first().boundingBox();expect(cards).toBeTruthy();
 const rows=await page.locator('.temporal-event').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,right:b.right};}));
 rows.forEach((r,i)=>{expect(r.right).toBeLessThanOrEqual(width);if(i)expect(r.top).toBeGreaterThanOrEqual(rows[i-1].bottom);});if(width===1920)expect(rows[5].bottom).toBeLessThan(1080);
 const positions=await page.locator('.temporal-lane').evaluateAll(es=>es.map(e=>Number((e as HTMLElement).dataset.timePosition)));expect(positions[0]).toBe(0);expect(positions[5]).toBe(1);expect(positions[1]).toBeLessThan(.15);
 const geometry=await page.locator('.temporal-lane').evaluateAll(es=>es.map(e=>{const rail=e.getBoundingClientRect(),mark=e.querySelector('.temporal-point,.temporal-duration')!.getBoundingClientRect();return {at:(mark.left+(e.querySelector('.temporal-point')?mark.width/2:0)-rail.left)/rail.width,duration:mark.width/rail.width};}));
 expect(geometry[0].at).toBeCloseTo(0,2);expect(geometry[1].at).toBeCloseTo(31/334,2);expect(geometry[5].at).toBeCloseTo(1,2);expect(geometry[2].duration).toBeCloseTo(45/334,2);
 await expect(page.locator('.temporal-duration')).toHaveCount(1);await page.screenshot({path:`/home/deploy/kanvas-20261102-evidence/e/e1-${width}.png`,fullPage:true});
 await page.goto('/tests/timeline-browser/?dense');await expect(page.locator('.temporal-event')).toHaveCount(40);expect(await page.locator('.temporal-timeline').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

test('vertical axis and narrow fallback',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await page.goto('/tests/timeline-browser/?vertical');
 const lanes=await page.locator('.temporal-lane').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,height:r.height};}));
 expect(lanes[0].height).toBe(360);expect(lanes[5].x).toBeGreaterThan(lanes[0].x);expect(lanes[0].y).toBe(lanes[5].y);
 await page.setViewportSize({width:390,height:844});expect(await page.locator('.temporal-timeline').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

test('incoming stable selection updates highlight and supplied visual together; clear restores static',async({page})=>{
 await page.route('https://example.com/*.png',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="steelblue"/></svg>'}));
 await page.goto('/tests/timeline-browser/');
 await expect(page.locator('.temporal-stage')).toHaveCount(0);
 await page.evaluate(()=>{(window as any).selectTimeline('event-1');});
 await expect(page.locator('.temporal-stage')).toHaveAttribute('data-active-event-id','event-1');await expect(page.getByAltText('Supplied prototype')).toBeVisible();await expect(page.locator('[aria-current="step"]')).toHaveAttribute('data-event-id','event-1');
 await page.evaluate(()=>{(window as any).selectTimeline('event-2');});
 await expect(page.getByAltText('Supplied testing')).toBeVisible();await expect(page.getByAltText('Supplied prototype')).toHaveCount(0);await expect(page.locator('[aria-current="step"]')).toHaveAttribute('data-event-id','event-2');
 await expect(page.locator('.temporal-event')).toHaveCount(6);
 const axes=await page.locator('.temporal-lane').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,width:r.width};}));
 for(const axis of axes){expect(axis.x).toBeCloseTo(axes[0].x,1);expect(axis.width).toBeCloseTo(axes[0].width,1);}
 await page.screenshot({path:'/home/deploy/kanvas-20261102-evidence/e/e2-active.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.locator('.temporal-timeline').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.evaluate(()=>{(window as any).selectTimeline(undefined);});await expect(page.locator('.temporal-stage')).toHaveCount(0);await expect(page.locator('[aria-current="step"]')).toHaveCount(0);
});

test('reuses supplied chart and flowchart renderers for milestone states',async({page})=>{
 await page.goto('/tests/timeline-browser/');
 await page.evaluate(()=>{(window as any).selectTimeline('event-3');});await expect(page.locator('.temporal-stage svg').first()).toBeVisible();await expect(page.locator('.temporal-stage')).toContainText('Iteration');
 await page.evaluate(()=>{(window as any).selectTimeline('event-4');});await expect(page.locator('.temporal-stage .relationship-diagram')).toBeVisible();await expect(page.locator('.temporal-stage')).toContainText('Beta');
});
