import {randomUUID} from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { ViewSpec } from '../../src/shared/types';
import { validateView } from '../../src/shared/view-schemas';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, test, waitForDisplay } from './support';

const columns = ['Tool identifier', 'Original description'];
const rows = Array.from({ length: 51 }, (_, index) => ({
  'Tool identifier': `fixture_tool_${String(index + 1).padStart(2, '0')}${index === 50 ? `_with_an_unbroken_source_identifier_${'0'.repeat(48)}` : ''}`,
  'Original description': `  Supplied description ${index + 1}. Keep original spacing and details.\nSecond supplied line.  `,
}));
const table = (options: Partial<ViewSpec> = {}): ViewSpec => validateView({ version: 1, template: 'table', data: { columns, rows }, ...options });
async function setup(page: Page) {
  await register(page);
  const sessionId = await createSession(page, 'Complete quiet tables'), display = await createDisplay(page, sessionId, 'Table reading screen');
  const viewer = await openViewer(page, sessionId, display.id);
  return { sessionId, display, viewer };
}
async function waitForReceiverReady(viewer: Page, revision: number) {
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(revision));
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready');
  await viewer.evaluate(() => document.fonts.ready.then(() => undefined));
  await viewer.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function show(page: Page, viewer: Page, sessionId: string, displayId: string, view: ViewSpec) {
  const before = (await sessionDetail(page, sessionId)).displays.find(display => display.id === displayId)!.revision;
  await publishPrepared(page, sessionId, [displayId], view);
  const current = await waitForDisplay(page, sessionId, displayId, display => display.revision > before && display.appliedRevision === display.revision);
  await waitForReceiverReady(viewer, current.revision);
}
async function pageRows(viewer: Page) {
  return viewer.locator('.viewer-candidate .table-surface tbody tr').evaluateAll(elements => elements.map(element => ({
    index: Number(element.getAttribute('data-source-row')),
    cells: [...element.querySelectorAll('td')].map(cell => ({ text: cell.textContent, type: cell.getAttribute('data-cell-type') })),
  })));
}
async function geometry(viewer: Page) {
  return viewer.locator('.viewer-candidate .table-surface').evaluate(root => {
    const scroll = root.querySelector<HTMLElement>('.table-scroll')!;
    const surface = root.closest('.render-surface')!, body = surface.querySelector(':scope > .render-body')!;
    const menu = document.querySelector<HTMLButtonElement>('.viewer-menu-toggle')!, qualifier = surface.querySelector(':scope > .view-qualification');
    const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const styles = getComputedStyle(surface);
    const shell = document.querySelector<HTMLElement>('.viewer-shell')!;
    const receiver = { revision: shell.dataset.revision, renderedRevision: shell.dataset.renderedRevision, status: shell.dataset.renderStatus, stages: [...shell.querySelectorAll(':scope > .viewer-candidate,:scope > .viewer-last-good')].map(stage => ({ name: stage.className, visibility: getComputedStyle(stage).visibility })) };
    const controls = [...root.querySelectorAll<HTMLButtonElement>('.table-pages > button'), menu].map(element => {
      const box = rect(element);
      const style = getComputedStyle(element);
      return {
        label: element.getAttribute('aria-label') || element.textContent, rect: box, disabled: element.disabled,
        style: { pointerEvents: style.pointerEvents, visibility: style.visibility, opacity: style.opacity }, receiver,
        hits: [[.5, .5], [.1, .1], [.9, .1], [.1, .9], [.9, .9]].map(([x, y]) => {
          const hit = document.elementFromPoint(box.x + box.width * x, box.y + box.height * y);
          return { x, y, clear: hit !== null && (hit === element || element.contains(hit)), hit: hit ? `${hit.tagName}.${hit.getAttribute('class') ?? ''}` : null, stage: hit?.closest('.viewer-candidate,.viewer-last-good')?.className };
        }),
      };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight }, document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      scroll: { width: scroll.clientWidth, height: scroll.clientHeight, contentWidth: scroll.scrollWidth, contentHeight: scroll.scrollHeight },
      minimumFont: Math.min(...[...root.querySelectorAll('th,td,.table-pages button')].map(cell => parseFloat(getComputedStyle(cell).fontSize))),
      whiteSpace: getComputedStyle(root.querySelector('td')!).whiteSpace,
      surface: rect(surface), body: rect(body), menu: rect(menu), qualifier: qualifier ? rect(qualifier) : null,
      padding: { top: parseFloat(styles.paddingTop), right: parseFloat(styles.paddingRight), bottom: parseFloat(styles.paddingBottom), left: parseFloat(styles.paddingLeft) },
      pagination: [...root.querySelectorAll('.table-pages > *')].map(element => ({ text: element.textContent, rect: rect(element) })), controls,
    };
  });
}
async function assertNavigation(viewer: Page, insets = { top: 0, right: 0, bottom: 0, left: 0 }) {
  // Wait for the actual child controls, not only the ancestor's ready flag.
  // Chromium can apply inherited visibility a frame after a retained-view swap.
  await expect(viewer.locator('.viewer-candidate .table-pages > button').last()).toBeVisible();
  const metrics = await geometry(viewer);
  const separate = (a: typeof metrics.menu, b: typeof metrics.menu) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  for (const control of metrics.controls) {
    expect(control.hits.every(hit => hit.clear), `Actual hit areas while checking ${control.label}: ${JSON.stringify(metrics.controls)}`).toBe(true);
    expect(control.rect.width).toBeGreaterThanOrEqual(44); expect(control.rect.height).toBeGreaterThanOrEqual(44);
    expect(control.rect.x).toBeGreaterThanOrEqual(insets.left); expect(control.rect.y).toBeGreaterThanOrEqual(insets.top);
    expect(control.rect.x + control.rect.width).toBeLessThanOrEqual(metrics.viewport.width - insets.right);
    expect(control.rect.y + control.rect.height).toBeLessThanOrEqual(metrics.viewport.height - insets.bottom);
  }
  for (const item of metrics.pagination) {
    expect(separate(item.rect, metrics.menu), `${item.text} clears the display menu`).toBe(true);
    if (metrics.qualifier) expect(separate(item.rect, metrics.qualifier), `${item.text} clears the actual qualification`).toBe(true);
  }
  if (metrics.qualifier) expect(metrics.qualifier.y, 'The actual qualification follows the reading surface').toBeGreaterThanOrEqual(metrics.body.y + metrics.body.height);
  expect(metrics.document.width).toBeLessThanOrEqual(metrics.viewport.width + 1); expect(metrics.document.height).toBeLessThanOrEqual(metrics.viewport.height + 1);
  expect(metrics.minimumFont).toBeGreaterThanOrEqual(16);
  return metrics;
}

test('all 51 requested table rows remain reachable without search, sorting or empty source chrome', async ({ page }, info) => {
  test.setTimeout(150_000);
  const { sessionId, display, viewer } = await setup(page);
  const view = table(), receipt: unknown[] = [];
  const viewports = info.project.name.startsWith('phone') ? [{ width: 390, height: 844 }, { width: 443, height: 823 }] : [{ width: 1440, height: 900 }];
  await mkdir(info.outputPath('visuals'), { recursive: true });
  for (const viewport of viewports) {
    await viewer.setViewportSize(viewport);
    await expect.poll(() => viewer.locator('.viewer-shell').evaluate(element => {
      const { width, height } = element.getBoundingClientRect(); return { width, height };
    }), { message: 'The table receives the actual resized viewport' }).toEqual(viewport);
    await show(page, viewer, sessionId, display.id, view);
    const surface = viewer.locator('.viewer-candidate .table-surface');
    await expect(surface.locator('.table-toolbar,input,th button')).toHaveCount(0);
    await expect(viewer.locator('.viewer-candidate .view-information')).toHaveCount(0);
    await expect(surface.locator('.table-source-summary')).toHaveCount(0);
    const previous = surface.getByRole('button', { name: '← Previous', exact: true }), next = surface.getByRole('button', { name: 'Next →', exact: true });
    // A resize or identical publication keeps the reading page; navigate back
    // explicitly before auditing the entire supplied dataset again.
    for (let index = 0; index < 4 && !await previous.isDisabled(); index++) await previous.click();
    await expect(previous).toBeDisabled();
    const seen: number[] = [];
    for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
      await assertNavigation(viewer);
      const supplied = await pageRows(viewer);
      expect(supplied).toHaveLength(pageIndex === 4 ? 3 : 12);
      for (const row of supplied) {
        expect(row.cells.map(cell => cell.text)).toEqual(columns.map(column => rows[row.index][column as keyof typeof rows[number]]));
        seen.push(row.index);
      }
      if (pageIndex === 0) await viewer.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-first-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
      if (pageIndex < 4) await next.click();
    }
    expect(seen).toEqual(Array.from({ length: 51 }, (_, index) => index)); await expect(next).toBeDisabled();
    await surface.locator('[data-source-row="50"]').scrollIntoViewIfNeeded();
    await expect(surface.locator('[data-source-row="50"]')).toBeInViewport();
    const metrics = await geometry(viewer);
    expect(metrics.document.width).toBeLessThanOrEqual(viewport.width + 1); expect(metrics.document.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(metrics.minimumFont).toBeGreaterThanOrEqual(16); expect(metrics.whiteSpace).toBe('break-spaces');
    await viewer.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-last-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
    // Root's stable table stage keeps local reading state but still paints and
    // acknowledges the newly published metadata revision through ReadyProbe.
    await show(page, viewer, sessionId, display.id, { ...view, title: 'Updated metadata only' });
    expect((await pageRows(viewer)).map(row => row.index)).toEqual([48, 49, 50]);
    expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)?.view?.data).toEqual(view.data);
    receipt.push({ ...metrics, seen, metadataPagePreserved: true });
  }
  await writeFile(`${info.outputPath('visuals')}/${info.project.name}-paging.json`, JSON.stringify(receipt, null, 2));
});

test('agent selection remains available without viewer widgets and preserves exact source cells', async ({ page }, info) => {
  const { sessionId, display, viewer } = await setup(page);
  if (info.project.name.startsWith('phone')) await viewer.setViewportSize({ width: 390, height: 844 });
  const view = table({ showControls: true }), surface = viewer.locator('.viewer-candidate .table-surface');
  await show(page, viewer, sessionId, display.id, view);
  await assertNavigation(viewer);

  await expect(surface.locator('.table-toolbar,input,th button')).toHaveCount(0);
  const select=async(selection:unknown)=>{const result=await sessionApi(page,`/api/sessions/${sessionId}/displays/${display.id}/selection`,'POST',{requestId:randomUUID(),selection});expect(result.status).toBe(200);};
  await select({where:[{field:'Tool identifier',op:'contains',value:'fixture_tool_51'}]});
  await expect.poll(async()=> (await pageRows(viewer)).map(row=>row.index)).toEqual([50]);
  await select({sort:[{field:'Tool identifier',direction:'desc'}]});
  await expect.poll(async()=> (await pageRows(viewer))[0]?.index).toBe(50);
  expect((await pageRows(viewer))[0].cells[1].text).toBe(rows[50]['Original description']);
  await select(null);
  await expect.poll(async()=> (await pageRows(viewer))[0]?.index).toBe(0);
  expect((await sessionDetail(page,sessionId)).displays.find(d=>d.id===display.id)?.view?.data.rows).toEqual(rows);
  await expect(surface.locator('.table-toolbar,input,th button')).toHaveCount(0);

  const exact = '9007199254740993.00000000000000001';
  const precise = table({ data: { columns: ['Identifier', 'Exact amount', 'Enabled', 'Absent'], rows: [{ Identifier: '  0000007  ', 'Exact amount': exact, Enabled: false, Absent: null }, { Identifier: '', 'Exact amount': '\t0.00000000000000001\n  trailing spaces  ', Enabled: true, Absent: 0 }], summary: { sourceRows: 51, displayedRows: 2, precisionNote: 'Exact supplied cells.' } } });
  await show(page, viewer, sessionId, display.id, precise);
  const exactRows = await pageRows(viewer);
  expect(exactRows.map(row => row.cells.map(cell => cell.text))).toEqual([['  0000007  ', exact, 'false', '—'], ['', '\t0.00000000000000001\n  trailing spaces  ', 'true', '0']]);
  expect(exactRows[0].cells.map(cell => cell.type)).toEqual(['string', 'string', 'boolean', 'null']);
  await expect(surface.locator('.table-source-summary')).toHaveCount(0);
  await show(page, viewer, sessionId, display.id, { ...precise, showControls: true });
  await expect(surface.locator('.table-source-summary')).toHaveCount(0);
  await show(page, viewer, sessionId, display.id, table({}));
  await expect(viewer.locator('.viewer-candidate .table-source-summary,.viewer-candidate .view-information')).toHaveCount(0);
  expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)?.view?.data).toEqual(table().data);
});

test('table and display controls keep separate hit areas in a quiet surface and an active presentation with device insets', async ({ page }, info) => {
  test.setTimeout(150_000);
  const { sessionId, display, viewer } = await setup(page);
  await viewer.bringToFront();
  const cdp = await viewer.context().newCDPSession(viewer);
  const clearInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  const profiles = info.project.name.startsWith('phone') ? [
    { viewport: { width: 390, height: 844 }, insets: clearInsets },
    { viewport: { width: 443, height: 823 }, insets: clearInsets },
    { viewport: { width: 320, height: 568 }, insets: clearInsets },
    { viewport: { width: 390, height: 844 }, insets: { top: 24, right: 20, bottom: 28, left: 18 } },
  ] : [{ viewport: { width: 1440, height: 900 }, insets: clearInsets }];
  for (const profile of profiles) {
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: profile.insets });
    await viewer.setViewportSize(profile.viewport);
    await expect.poll(() => viewer.locator('.viewer-shell').evaluate(element => {
      const { width, height } = element.getBoundingClientRect(); return { width, height };
    })).toEqual(profile.viewport);
    for (const presentation of [false, true]) await test.step(`${profile.viewport.width}/${profile.insets.bottom ? 'device-insets' : 'ordinary'}/${presentation ? 'presentation' : 'table'}`, async () => {
      const leaf = table({ showControls: false });
      const view: ViewSpec = presentation ? {
        version: 1, template: 'presentation', showControls: true, title: 'A supplied table inside a presentation, with independent page and slide navigation.', showTitle: true,
        data: { index: 0, slides: [leaf, { version: 1, template: 'fact', data: { text: 'The second supplied slide' } }] },
      } : leaf;
      await show(page, viewer, sessionId, display.id, view);
      const surface = viewer.locator('.viewer-candidate .table-surface');
      const metrics = await assertNavigation(viewer, profile.insets);
      await expect(surface.locator('.table-toolbar,input,th button,.table-source-summary')).toHaveCount(0);
      await expect(viewer.locator('.viewer-candidate .view-information')).toHaveCount(0);
      if (!presentation) {
        await expect(viewer.locator('.viewer-candidate .view-qualification,.viewer-candidate .view-heading')).toHaveCount(0);
        expect(metrics.body.height, 'Unqualified tables retain their full reading height without an empty footer').toBeCloseTo(metrics.surface.height - metrics.padding.top - metrics.padding.bottom, 0);
        expect(metrics.scroll.width, 'Only the pager, not the table, reserves menu width').toBeCloseTo(metrics.surface.width - metrics.padding.left - metrics.padding.right, 0);
      } else await expect(viewer.locator('.viewer-candidate .template-table > .view-qualification')).toHaveCount(0);

      const before = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!;
      await surface.getByRole('button', { name: 'Next →', exact: true }).click();
      await assertNavigation(viewer, profile.insets);
      const supplied = await pageRows(viewer);
      expect(supplied.map(row => row.index)).toEqual(Array.from({ length: 12 }, (_, index) => index + 12));
      for (const row of supplied) expect(row.cells.map(cell => cell.text)).toEqual(columns.map(column => rows[row.index][column as keyof typeof rows[number]]));
      await surface.getByRole('button', { name: '← Previous', exact: true }).click();
      expect((await pageRows(viewer))[0].index).toBe(0);
      const afterPaging = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!;
      expect(afterPaging.revision, 'Local table paging is not a slide command or data edit').toBe(before.revision); expect(afterPaging.view?.data).toEqual(view.data);

      const menu = viewer.getByRole('button', { name: 'Display controls', exact: true });
      await menu.click(); await expect(viewer.locator('.viewer-menu')).toBeInViewport({ ratio: 1 });
      await menu.click(); await expect(viewer.locator('.viewer-menu')).toHaveCount(0);
      await assertNavigation(viewer, profile.insets);
      if (presentation) {
        await viewer.getByRole('button', { name: 'Next slide', exact: true }).click();
        const advanced = await waitForDisplay(page, sessionId, display.id, item => item.revision > before.revision && item.appliedRevision === item.revision && item.view?.data.index === 1);
        await waitForReceiverReady(viewer, advanced.revision);
        await expect(viewer.locator('.viewer-candidate .fact-text')).toHaveText('The second supplied slide');
        await expect(viewer.locator('.viewer-candidate .table-surface')).toHaveCount(0);
        await viewer.getByRole('button', { name: 'Previous slide', exact: true }).click();
        const returned = await waitForDisplay(page, sessionId, display.id, item => item.revision > advanced.revision && item.appliedRevision === item.revision && item.view?.data.index === 0);
        // A retained→candidate switch can still have inherited hidden controls
        // before their next paint, even when the shell and server report ready.
        // Use the same receiving-frame preconditions as a direct publication.
        await waitForReceiverReady(viewer, returned.revision);
        await expect(surface).toBeVisible();
        try { await assertNavigation(viewer, profile.insets); }
        catch (error) {
          const snapshots = [await geometry(viewer)];
          for (let frame = 0; frame < 2; frame++) {
            await viewer.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
            snapshots.push(await geometry(viewer));
          }
          const framesPath = info.outputPath('table-slide-return-hit-frames.json');
          await writeFile(framesPath, JSON.stringify(snapshots, null, 2));
          await info.attach('table-slide-return-hit-frames', { path: framesPath, contentType: 'application/json' });
          const path = info.outputPath('table-slide-return-hit.png');
          await viewer.screenshot({ path, animations: 'disabled' });
          await info.attach('table-slide-return-hit', { path, contentType: 'image/png' });
          throw error;
        }
        const previous = surface.getByRole('button', { name: '← Previous', exact: true }), next = surface.getByRole('button', { name: 'Next →', exact: true });
        await expect(previous).toBeDisabled(); await expect(next).toBeEnabled();
        await next.click(); await assertNavigation(viewer, profile.insets);
        expect((await pageRows(viewer))[0].index).toBe(12);
        await previous.click(); expect((await pageRows(viewer))[0].index).toBe(0);
      }
    });
  }
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
  await cdp.detach();
});


test('custom table colours and labelled dots, icons and logos follow source rows through agent sorting',async({page},info)=>{
  const {sessionId,display,viewer}=await setup(page);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGOQLLv0H4QZYAwAT3YJgeciwUwAAAAASUVORK5CYII=';
  const asset=await sessionApi<any>(page,'/api/sessions/'+sessionId+'/assets','POST',{name:'supplied-logo.png',mimeType:'image/png',base64:png});expect(asset.status).toBe(201);
  const rows=[{Domain:'first.example',Status:'Available',Price:'9007199254740993.0001'},{Domain:'second.example',Status:'Premium',Price:'1.2300'},{Domain:'third.example',Status:'',Price:'0.00'}];
  const data={columns:['Domain','Status','Price'],rows,rowStyles:[{row:0,background:'#e3ddff'}],cellStyles:[{row:0,column:'Status',indicator:{kind:'dot',label:'Available',color:'#7251bd'}},{row:1,column:'Status',background:'#144c64',indicator:{kind:'icon',name:'star',label:'Premium',color:'#ffd479'}},{row:2,column:'Status',indicator:{kind:'icon',name:'lock',label:'Taken'}},{row:1,column:'Domain',indicator:{kind:'image',url:asset.data.url,label:'Supplied registrar logo'}}]};
  await show(page,viewer,sessionId,display.id,validateView({version:1,template:'table',data}));
  const surface=viewer.locator('.viewer-candidate .table-surface');
  await expect(surface.locator('.table-toolbar,input,th button')).toHaveCount(0);
  await expect(surface.getByRole('img',{name:'Available',exact:true})).toBeVisible();await expect(surface.getByRole('img',{name:'Premium',exact:true})).toBeVisible();await expect(surface.getByRole('img',{name:'Taken',exact:true})).toBeVisible();
  expect(await surface.getByAltText('Supplied registrar logo').evaluate((i:HTMLImageElement)=>i.naturalWidth)).toBeGreaterThan(0);
  await expect(surface.locator('[data-source-row="0"] td').first()).toHaveCSS('background-color','rgb(227, 221, 255)');await expect(surface.locator('[data-source-row="1"] td').nth(1)).toHaveCSS('background-color','rgb(20, 76, 100)');
  await expect(surface.locator('[data-source-row="1"] td').nth(1)).toHaveCSS('color','rgb(255, 255, 255)');
  let saved=(await sessionDetail(page,sessionId)).displays.find(d=>d.id===display.id)!;
  expect((await sessionApi(page,'/api/sessions/'+sessionId+'/displays/'+display.id+'/selection','POST',{expectedRevision:saved.revision,requestId:'table-style-sort',selection:{sort:[{field:'Domain',type:'text',direction:'desc'}]}})).status).toBe(200);
  await expect(surface.locator('tbody tr').first()).toHaveAttribute('data-source-row','2');await expect(surface.locator('tbody tr').first().getByRole('img',{name:'Taken',exact:true})).toBeVisible();
  await expect(surface.locator('[data-source-row="0"] td').first()).toHaveCSS('background-color','rgb(227, 221, 255)');
  saved=(await sessionDetail(page,sessionId)).displays.find(d=>d.id===display.id)!;expect(saved.view?.data.rows).toEqual(rows);expect(saved.view?.data.rowStyles).toEqual(data.rowStyles);expect(saved.view?.data.cellStyles).toEqual(data.cellStyles);
  await mkdir(info.outputPath('visuals'),{recursive:true});for(let i=0;i<8&&await viewer.getByRole('button',{name:'Dismiss notification',exact:true}).count();i++)await viewer.getByRole('button',{name:'Dismiss notification',exact:true}).first().click();
  await viewer.screenshot({path:info.outputPath('visuals')+'/'+info.project.name+'-custom-status-table.png',animations:'disabled'});
  expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});


test('pending navigation from an old table revision cannot reset a replacement reading position', async ({ page }) => {
  const { sessionId, display, viewer } = await setup(page);
  await show(page, viewer, sessionId, display.id, table({ showControls: true }));
  const next = viewer.locator('.viewer-candidate').getByRole('button', { name: 'Next →', exact: true });
  for (let index = 1; index <= 3; index++) {
    await next.click(); await expect.poll(async () => (await pageRows(viewer))[0]?.index).toBe(index * 12);
  }
  let hold!: () => void, release!: () => void, finished!: () => void;
  const held = new Promise<void>(resolve => { hold = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const settled = new Promise<void>(resolve => { finished = resolve; });
  await viewer.route(`**/api/sessions/${sessionId}/displays/${display.id}/navigation`, async route => {
    const request = route.request(), body = request.method() === 'POST' ? request.postDataJSON() : undefined;
    if (body?.navigation?.action !== 'page' || body.navigation.page !== 5) { await route.continue(); return; }
    const response = await route.fetch(); hold(); await released;
    try { await route.fulfill({ response }); } finally { finished(); }
  });
  await next.click(); await held;
  await expect.poll(async () => (await pageRows(viewer))[0]?.index).toBe(48);
  try {
    await show(page, viewer, sessionId, display.id, table({ showControls: true, data: { columns, rows: rows.slice(0, 13) } }));
    await expect.poll(async () => (await pageRows(viewer)).map(row => row.index)).toEqual([12]);
    // Keyboard navigation must use the clamped page too, while the old request
    // still drains; it must not fall through to browsing a previous publication.
    await viewer.locator('.table-scroll').click();
    await viewer.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await pageRows(viewer))[0]?.index).toBe(0);
    await viewer.keyboard.press('ArrowRight');
    await expect.poll(async () => (await pageRows(viewer)).map(row => row.index)).toEqual([12]);
  } finally { release(); await settled; }
  await expect.poll(async () => (await pageRows(viewer)).map(row => row.index)).toEqual([12]);
  await expect(viewer.locator('.navigation-error')).toHaveCount(0);
});
