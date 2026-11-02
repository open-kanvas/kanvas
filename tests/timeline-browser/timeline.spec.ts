import {test,expect} from '@playwright/test';
for(const width of [1920,390])test(`six events fit width ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1080});await page.goto('/tests/timeline-browser/');await expect(page.locator('.temporal-event')).toHaveCount(6);
 expect(await page.locator('.temporal-timeline').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const cards=await page.locator('.temporal-event').first().boundingBox();expect(cards).toBeTruthy();
 const rows=await page.locator('.temporal-event').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,right:b.right};}));
 rows.forEach((r,i)=>{expect(r.right).toBeLessThanOrEqual(width);if(i)expect(r.top).toBeGreaterThanOrEqual(rows[i-1].bottom);});if(width===1920)expect(rows[5].bottom).toBeLessThan(1080);
 const positions=await page.locator('.temporal-lane').evaluateAll(es=>es.map(e=>Number((e as HTMLElement).dataset.timePosition)));expect(positions[0]).toBe(0);expect(positions[5]).toBe(1);expect(positions[1]).toBeLessThan(.15);
 await expect(page.locator('.temporal-duration')).toHaveCount(1);await page.screenshot({path:`/home/deploy/kanvas-20261102-evidence/e/e1-${width}.png`,fullPage:true});
 await page.goto('/tests/timeline-browser/?dense');await expect(page.locator('.temporal-event')).toHaveCount(40);expect(await page.locator('.temporal-timeline').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

test('vertical axis and narrow fallback',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await page.goto('/tests/timeline-browser/?vertical');
 const lanes=await page.locator('.temporal-lane').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,height:r.height};}));
 expect(lanes[0].height).toBe(360);expect(lanes[5].x).toBeGreaterThan(lanes[0].x);expect(lanes[0].y).toBe(lanes[5].y);
 await page.setViewportSize({width:390,height:844});expect(await page.locator('.temporal-timeline').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});
