import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import type { InteractionRecord } from '../../src/shared/types';
import type { UpdateRecord } from '../../src/shared/types';
import type { ViewSpec } from '../../src/shared/types';
import type { ViewPatchOperation } from '../../src/shared/view-patch';
import { captureDisplay } from './support';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { test } from './support';
import { waitForDisplay } from './support';
import { isolatedContext } from './support';

test.describe("drafting coverage 1", () => {


async function setup(page: Page, info: TestInfo) {
  await register(page); const sessionId = await createSession(page, 'Drafting acceptance'), display = await createDisplay(page, sessionId, 'Draft display');
  const viewer = await openViewer(page, sessionId, display.id);
  if (info.project.name.startsWith('phone')) await viewer.setViewportSize({ width: 443, height: 823 });
  await viewer.bringToFront();
  return { sessionId, displayId: display.id, viewer };
}
async function ready(page: Page, viewer: Page, sessionId: string, displayId: string, revision: number) {
  await waitForDisplay(page, sessionId, displayId, display => display.revision === revision && display.appliedRevision === revision);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready');
  await expect(viewer.locator('.viewer-candidate .drafting-source')).toBeVisible();
}
async function patch(page: Page, sessionId: string, displayId: string, expectedRevision: number, operations: ViewPatchOperation[], requestId = randomUUID()) {
  const result = await sessionApi<UpdateRecord>(page, `/api/sessions/${sessionId}/displays/${displayId}/patch`, 'POST', { expectedRevision, requestId, operations });
  expect(result.status, result.code ?? 'Draft patch accepted').toBeGreaterThanOrEqual(200); expect(result.status).toBeLessThan(300);
  return result.data!;
}
const draft = (text: string, extra: Record<string, unknown> = {}): ViewSpec => ({ version: 1, template: 'drafting', data: { text, status: 'drafting', purpose: 'Note draft', ...extra } });
const scrollTop = (viewer: Page) => viewer.locator('.drafting-scroll').evaluate(element => element.scrollTop);
const atEnd = (viewer: Page) => viewer.locator('.drafting-scroll').evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop <= 32);
async function scrollReview(viewer: Page, top: number) {
  await viewer.locator('.drafting-scroll').evaluate((element, top) => { element.scrollTop = top; element.dispatchEvent(new Event('scroll')); }, top);
  await expect(viewer.locator('.drafting-content')).toHaveAttribute('data-following', 'false');
}

test('draft chunks follow only the end and preserve manual scroll and renderer identity', async ({ page }, info) => {
  const { sessionId, displayId, viewer } = await setup(page, info);
  let text = Array.from({ length: 35 }, (_, index) => `Supplied passage ${index + 1}. Keep the whole draft in context, including exact  spaces and 👋 Unicode.`).join('\n\n');
  await publishPrepared(page, sessionId, [displayId], draft(text)); await ready(page, viewer, sessionId, displayId, 1);
  const source = await viewer.locator('.drafting-source').elementHandle();
  await expect.poll(() => atEnd(viewer)).toBe(true);
  expect(await viewer.locator('.drafting-source').textContent()).toBe(text);
  expect(await viewer.locator('.drafting-source').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(18);
  const chunk = '\n\nA supplied second chunk, appended once.', requestId = randomUUID();
  await patch(page, sessionId, displayId, 1, [{ op: 'appendText', path: '/data/text', value: chunk }], requestId);
  await patch(page, sessionId, displayId, 1, [{ op: 'appendText', path: '/data/text', value: chunk }], requestId);
  text += chunk; await ready(page, viewer, sessionId, displayId, 2);
  await expect.poll(() => atEnd(viewer)).toBe(true); expect(await viewer.locator('.drafting-source').textContent()).toBe(text);
  // Keep a real successful scroll response in flight across publication. An
  // old request must not make the next revision's default scroll authoritative.
  let capturing = false, intercepted = false, release!: () => void, finished!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const settled = new Promise<void>(resolve => { finished = resolve; });
  const navigation = `**/api/sessions/${sessionId}/displays/${displayId}/navigation`;
  await viewer.route(navigation, async route => {
    const request = route.request(), body = request.method() === 'POST' ? request.postDataJSON() : undefined;
    if (capturing || body?.expectedRevision !== 2 || body.navigation?.action !== 'scroll' || !(body.navigation.y > 0 && body.navigation.y < .8)) { await route.continue(); return; }
    // Claim exactly one scroll request before awaiting I/O; additional browser
    // scroll events must not create untracked suspended handlers.
    capturing = true;
    try {
      const response = await route.fetch(); expect(response.status()).toBe(200); intercepted = true; await released;
      await route.fulfill({ response });
    } finally { finished(); }
  });
  try {
    await expect.poll(async () => { if (!intercepted) await scrollReview(viewer, 175); return intercepted; }, { intervals: [200, 400] }).toBe(true);
    const before = await scrollTop(viewer), later = '\n\nLater content. '.repeat(16);
    await patch(page, sessionId, displayId, 2, [{ op: 'appendText', path: '/data/text', value: later }]);
    text += later; await ready(page, viewer, sessionId, displayId, 3);
    expect(Math.abs(await scrollTop(viewer) - before)).toBeLessThanOrEqual(2);
    expect(await source!.evaluate(element => element === document.querySelector('.viewer-candidate .drafting-source'))).toBe(true);
    expect(await viewer.locator('.drafting-source').textContent()).toBe(text);
  } finally { release(); if (capturing) await settled; await viewer.unrouteAll({ behavior: 'wait' }); }
  await captureDisplay(viewer, info, 'drafting-manual-review');
  await viewer.getByRole('button', { name: 'Follow latest', exact: false }).click(); await expect.poll(() => atEnd(viewer)).toBe(true);
});

test('native text selection survives an append to its text node and sends exact revision-bound feedback', async ({ page }, info) => {
  const { sessionId, displayId, viewer } = await setup(page, info);
  const text = 'Keep  this 👋 exact phrase.\n' + 'More supplied context with exact punctuation.\n'.repeat(38), selected = 'this 👋 exact';
  const start = text.indexOf(selected), end = start + selected.length;
  await publishPrepared(page, sessionId, [displayId], draft(text)); await ready(page, viewer, sessionId, displayId, 1);
  await scrollReview(viewer, 0);
  await viewer.locator('.drafting-source').evaluate((root, span) => {
    const node = root.querySelector('.drafting-passage')!.firstChild!;
    const range = document.createRange(); range.setStart(node, span.start); range.setEnd(node, span.end);
    const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }, { start, end });
  await expect.poll(async () => (await sessionDetail(page, sessionId)).interactions.length).toBe(1);
  const feedback = (await sessionDetail(page, sessionId)).interactions[0];
  expect(feedback).toMatchObject({ revision: 1, actionId: 'drafting.select', value: { start, end, text: selected, via: 'selection', textPath: '/data/text' } });
  await expect.poll(() => viewer.evaluate(() => document.getSelection()?.toString())).toBe(selected);
  const before = await scrollTop(viewer), node = await viewer.locator('.drafting-passage').first().elementHandle();
  const chunk = 'An exact append in the same passage 👋.';
  await patch(page, sessionId, displayId, 1, [{ op: 'appendText', path: '/data/text', value: chunk }]); await ready(page, viewer, sessionId, displayId, 2);
  expect(await viewer.evaluate(() => document.getSelection()?.toString())).toBe(selected);
  expect(await node!.evaluate(element => element === document.querySelector('.drafting-passage'))).toBe(true);
  expect(Math.abs(await scrollTop(viewer) - before)).toBeLessThanOrEqual(2);
  expect(await viewer.locator('.drafting-source').textContent()).toBe(text + chunk);
  expect((await sessionDetail(page, sessionId)).interactions).toHaveLength(1);
  await expect(viewer.locator('.drafting-feedback')).toContainText('Draft updated');
  await captureDisplay(viewer, info, 'drafting-native-selection');
});

test('a delayed review callback keeps its original revision and shows the stale-response error', async ({ page, diagnostics }, info) => {
  const { sessionId, displayId, viewer } = await setup(page, info), text = 'Select this original source passage.';
  await publishPrepared(page, sessionId, [displayId], draft(text, { status: 'reviewing' })); await ready(page, viewer, sessionId, displayId, 1);
  const responsePath = `/api/sessions/${sessionId}/displays/${displayId}/respond`;
  let release!: () => void, intercepted!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), held = new Promise<void>(resolve => { intercepted = resolve; });
  let submitted: { revision: number; value: { start: number; end: number; text: string } } | undefined;
  diagnostics.allowHttp(viewer, responsePath, 409);
  await viewer.route(`**${responsePath}`, async route => { submitted = route.request().postDataJSON(); intercepted(); await gate; await route.continue(); });
  try {
    await viewer.locator('.drafting-passage').first().press('Enter'); await held;
    await patch(page, sessionId, displayId, 1, [{ op: 'appendText', path: '/data/text', value: ' A newer chunk.' }]); await ready(page, viewer, sessionId, displayId, 2);
    expect(submitted).toMatchObject({ revision: 1, value: { start: 0, end: text.length, text } });
    release();
    await expect(viewer.locator('.drafting-feedback [role=alert]')).toBeVisible();
    expect((await sessionDetail(page, sessionId)).interactions).toHaveLength(0);
    await expect(viewer.locator('.drafting-source')).toHaveText(text + ' A newer chunk.');
  } finally { release(); await viewer.unroute(`**${responsePath}`); }
});

test('agent suggestions and visible-slide feedback stay anchored without pulling a manual reviewer away', async ({ page }, info) => {
  const { sessionId, displayId, viewer } = await setup(page, info);
  const text = Array.from({ length: 35 }, (_, i) => `Draft section ${i + 1}: keep these exact supplied words for review.`).join('\n\n');
  const sourcePhrase = 'Draft section 18', start = text.indexOf(sourcePhrase), end = start + sourcePhrase.length;
  const leaf = draft(text, { status: 'reviewing', suggestions: [{ id: 'wording', start, end, replacement: 'Revised section 18', reason: 'Make this passage more specific' }], focus: { start, end } });
  await publishPrepared(page, sessionId, [displayId], { version: 1, template: 'presentation', data: { index: 1, slides: [{ version: 1, template: 'fact', data: { text: 'Hidden slide' } }, leaf] } });
  await ready(page, viewer, sessionId, displayId, 1);
  expect(await viewer.evaluate(() => [...CSS.highlights.entries()].filter(([name]) => name.endsWith('-focus')).flatMap(([, ranges]) => [...ranges].map(range => range.toString())))).toContain(sourcePhrase);
  await expect(viewer.locator('.drafting-suggestions')).toHaveCount(0);
  await expect(viewer.locator('[data-suggestion-id="wording"] .drafting-ins')).toHaveText('Revised section 18');
  await viewer.locator('[data-suggestion-id="wording"] .drafting-del').click();
  await expect.poll(async () => (await sessionDetail(page, sessionId)).interactions.length).toBe(1);
  expect((await sessionDetail(page, sessionId)).interactions[0]).toMatchObject({ actionId: 'drafting.select', revision: 1, value: { textPath: '/data/slides/1/data/text', text: sourcePhrase, suggestion: { id: 'wording', replacement: 'Revised section 18' } } } satisfies Partial<InteractionRecord>);
  await scrollReview(viewer, 0); const before = await scrollTop(viewer), source = await viewer.locator('.drafting-source').elementHandle();
  const focusStart = text.indexOf('Draft section 33');
  await patch(page, sessionId, displayId, 1, [{ op: 'appendText', path: '/data/slides/1/data/text', value: '\n\nA later supplied chunk.' }, { op: 'set', path: '/data/slides/1/data/focus', value: { start: focusStart, end: focusStart + 'Draft section 33'.length } }]);
  await ready(page, viewer, sessionId, displayId, 2);
  expect(Math.abs(await scrollTop(viewer) - before)).toBeLessThanOrEqual(2);
  expect(await source!.evaluate(element => element === document.querySelector('.drafting-source'))).toBe(true);
  await viewer.getByRole('button', { name: 'Go to highlighted passage', exact: true }).click();
  expect(await scrollTop(viewer)).toBeGreaterThan(before + 50);
  expect(((await sessionDetail(page, sessionId)).displays.find(item => item.id === displayId)!.view?.data.slides as ViewSpec[])[1].data.text).toBe(text + '\n\nA later supplied chunk.');
  await captureDisplay(viewer, info, 'drafting-suggestion-review');
});
});

test.describe("drafting coverage 2", () => {

for(const isPublic of [false,true])test(`${isPublic?'Public':'Signed-in'} in-place document edit retains a visible paragraph; a new same-template submit resets`,async({page,browser,baseURL,diagnostics},info)=>{
 await register(page);const sessionId=await createSession(page,'Retained reading'),display=await createDisplay(page,sessionId,'Reader'),ownerViewer=await openViewer(page,sessionId,display.id);
 const anonymous=isPublic?await isolatedContext(browser,info,baseURL!):undefined;let viewer=ownerViewer;
 const paragraphs=Array.from({length:65},(_,i)=>`Unique paragraph ${i+1}. These exact words provide enough source detail to fill the reading area and verify the current visible anchor across edits.`);
 const view={version:1 as const,template:'document' as const,data:{layout:'reading' as const,text:paragraphs.join('\n\n')}};
 await publishPrepared(page,sessionId,[display.id],view);let current=await waitForDisplay(page,sessionId,display.id,d=>d.revision>0&&d.appliedRevision===d.revision);
 if(anonymous){const access=await sessionApi(page,`/api/sessions/${sessionId}/public-access`,'POST',{expectedRevision:0,enabled:true,confirm:true});expect(access.status).toBe(200);viewer=await anonymous.newPage();diagnostics.watch(viewer);await viewer.goto(`/view/${sessionId}/${display.id}`);}
 const reader=viewer.getByRole('region',{name:'Document reader'});await expect(reader).toBeVisible();await reader.evaluate(el=>{el.scrollTop=1200;});await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeGreaterThan(500);
 const anchor=await reader.evaluate(el=>{const box=el.getBoundingClientRect();const p=[...el.querySelectorAll('p')].find(x=>x.getBoundingClientRect().top>=box.top&&x.getBoundingClientRect().top<box.bottom)!;return {text:p.textContent,offset:p.getBoundingClientRect().top-box.top};});
 const changed=['New introduction. '.repeat(30),...paragraphs].join('\n\n');
 const edit=await sessionApi(page,`/api/sessions/${sessionId}/displays/${display.id}/view`,'PATCH',{expectedRevision:current.revision,data:{...view.data,text:changed}});expect(edit.status).toBe(200);
 current=await waitForDisplay(page,sessionId,display.id,d=>d.revision>current.revision&&d.appliedRevision===d.revision);
 await expect.poll(()=>reader.evaluate((el,a)=>{const p=[...el.querySelectorAll('p')].find(x=>x.textContent===a.text)!;return Math.abs(p.getBoundingClientRect().top-el.getBoundingClientRect().top-a.offset);},anchor)).toBeLessThan(5);
 await publishPrepared(page,sessionId,[display.id],view);await waitForDisplay(page,sessionId,display.id,d=>d.revision>current.revision&&d.appliedRevision===d.revision);await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeLessThan(5);
 await anonymous?.close();await ownerViewer.close();
});

// Drafting retains its collaborative renderer intentionally; browsing reset must
// not rely on unmounting that editor when a fresh publication replaces the draft.
test('retained drafting renderer resets reading position for a fresh submission',async({page})=>{
 await register(page);const sessionId=await createSession(page,'Fresh draft reading'),display=await createDisplay(page,sessionId,'Draft'),viewer=await openViewer(page,sessionId,display.id);
 const view={version:1 as const,template:'drafting' as const,data:{text:Array.from({length:80},(_,i)=>`Unique draft paragraph ${i}. Supplied content for a scrollable draft.`).join('\n\n'),status:'drafting' as const,purpose:'Reader reset'}};
 await publishPrepared(page,sessionId,[display.id],view);let current=await waitForDisplay(page,sessionId,display.id,d=>d.revision>0&&d.appliedRevision===d.revision);
 const reader=viewer.locator('.drafting-scroll');await expect(reader).toBeVisible();await reader.evaluate(el=>{el.scrollTop=800;el.dispatchEvent(new Event('scroll'));});await expect(viewer.locator('.drafting-content')).toHaveAttribute('data-following','false');await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeGreaterThan(500);
 const node=await viewer.locator('.drafting-source').elementHandle();
 await publishPrepared(page,sessionId,[display.id],{...view,data:{...view.data,text:'Fresh replacement.\n\n'+view.data.text}});await waitForDisplay(page,sessionId,display.id,d=>d.revision>current.revision&&d.appliedRevision===d.revision);
 await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeLessThan(5);
 expect(await node!.evaluate(el=>el===document.querySelector('.viewer-candidate .drafting-source'))).toBe(true);await viewer.close();
});
});
