import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { operationRequest } from '../mcp/requests.js';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { test } from './support';
import { waitForDisplay } from './support';
import { sessionDetail } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { gameExample } from '../../src/shared/game';
import type { Page } from '@playwright/test';
import { samples } from '../../src/shared/template-examples';
import { emailRuntime } from './email-oauth-fixture';
import { beginEmailConnector } from './email-oauth-fixture';

test.describe("instruments coverage 1", () => {
    test('keyboard/fretted stable updates and one local scale schedule reach the receiver', async ({ page, baseURL }, info) => {
        await register(page);
        const sessionId = await createSession(page, 'Instruments'), display = await createDisplay(page, sessionId, 'Music screen'), viewer = await openViewer(page, sessionId, display.id);
        const issued = await sessionApi<{
            token: string;
        }>(page, '/api/tokens', 'POST', { name: 'Instruments test', scopes: ['read', 'publish'] });
        expect(issued.status).toBe(201);
        const client = new Client({ name: 'instruments-test', version: '1' });
        await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers: { Authorization: `Bearer ${issued.data!.token}` } } }));
        const read = async () => { const r = await client.callTool(operationRequest({
            name: "kanvas_call",
            arguments: {
                operationId: "kanvas.display.current",
                arguments: {
                    sessionId, displayId: display.id
                }
            }
        })); expect(r.isError).not.toBe(true); return (r.structuredContent as any).data; };
        const patch = async (operations: unknown[]) => { const current = await read(); const r = await client.callTool(operationRequest({
            name: "kanvas_call",
            arguments: {
                operationId: "kanvas.view.patch",
                arguments: {
                    sessionId, displayId: display.id, expectedRevision: current.revision, requestId: randomUUID(), operations
                }
            }
        })); expect(r.isError, JSON.stringify(r)).not.toBe(true); await waitForDisplay(page, sessionId, display.id, d => d.appliedRevision === d.revision); };
        const notes = (values: [
            number,
            string
        ][]) => Object.fromEntries(values.map(([midi, label]) => [`key:${midi}`, { highlight: true, pitch: { midi, label } }]));
        try {
            const config = { family: 'keyboard', firstMidi: 60, lastMidi: 83 };
            await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'instrument', data: { config, label: 'Cm7', elements: notes([[60, 'C4'], [63, 'Eb4'], [67, 'G4'], [70, 'Bb4']]) } });
            const visual = viewer.locator('.instrument-visual');
            await expect(visual.locator('[data-highlight=true]')).toHaveCount(4);
            await expect(visual.locator('[data-element-id="key:63"] text')).toHaveText('Eb4');
            // DOM node identity survives a narrow element update, not reconstructed ad-hoc HTML.
            await visual.locator('[data-element-id="key:60"]').evaluate(el => { (el as any).identityMarker = 'retained'; });
            await patch([{ op: 'instrument', label: 'E major', changes: [...[60, 63, 67, 70].map(m => ({ id: `key:${m}`, value: null })), ...Object.entries(notes([[64, 'E4'], [68, 'G#4'], [71, 'B4']])).map(([id, value]) => ({ id, value }))] }]);
            await expect(visual.locator('[data-highlight=true]')).toHaveCount(3);
            expect((await read()).view.data.config).toEqual(config);
            expect(await visual.locator('[data-element-id="key:60"]').evaluate(el => (el as any).identityMarker)).toBe('retained');
            await viewer.screenshot({ path: info.outputPath('keyboard-e-major.png') });
            await patch([{ op: 'instrument-sequence', action: 'replace', frames: [{ id: 'c', durationMs: 1000, elements: notes([[60, 'C4']]) }, { id: 'd', durationMs: 4000, elements: notes([[62, 'D4']]) }] }, { op: 'instrument-sequence', action: 'resume' }]);
            await expect(visual).toHaveAttribute('data-active-frame', 'd');
            await expect(visual.locator('[data-element-id="key:62"]')).toHaveAttribute('data-highlight', 'true');
            await patch([{ op: 'instrument-sequence', action: 'pause' }]);
            await viewer.reload();
            await expect(visual).toHaveAttribute('data-active-frame', 'd');
            await patch([{ op: 'instrument-sequence', action: 'clear' }]);
            await expect(visual.locator('[data-element-id="key:62"]')).toHaveAttribute('data-highlight', 'true');
            const tuning: [
                [
                    number,
                    string
                ],
                [
                    number,
                    string
                ],
                [
                    number,
                    string
                ],
                [
                    number,
                    string
                ],
                [
                    number,
                    string
                ],
                [
                    number,
                    string
                ]
            ] = [[40, 'E2'], [45, 'A2'], [50, 'D3'], [55, 'G3'], [59, 'B3'], [64, 'E4']];
            const strings = tuning.map(([midi, label], i) => ({ id: `s${i}`, label, openPitch: { midi, label } }));
            await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'instrument', data: { label: 'E major — supplied fingering', config: { family: 'fretted', strings, firstFret: 0, fretCount: 5, capo: 0 }, elements: Object.fromEntries([0, 2, 2, 1, 0, 0].map((fret, i) => [`string:s${i}:fret:${fret}`, { highlight: true, finger: String([0, 2, 3, 1, 0, 0][i]) }])) } });
            await expect(viewer.getByRole('region', { name: 'Fretted-string visualization' })).toBeVisible();
            await expect(visual.locator('[data-highlight=true]')).toHaveCount(6);
            await expect(visual.locator('[data-element-id="string:s0:fret:0"] circle')).toBeVisible();
            await viewer.screenshot({ path: info.outputPath('guitar-e-major.png') });
        }
        finally {
            await client.close();
        }
    });
});

test.describe("instruments coverage 2", () => {


test('fretted left-handed mode mirrors positions but preserves ordered strings and theme styling',async({page},info)=>{
 await register(page);const s=await createSession(page,'Handedness'),d=await createDisplay(page,s,'Fretboard'),viewer=await openViewer(page,s,d.id);
 const strings=[['one','1 · E4',64],['two','2 · B3',59],['three','3 · G3',55],['four','4 · D3',50],['five','5 · A2',45],['six','6 · E2',40]].map(([id,label,midi])=>({id,label,openPitch:{midi,label}}));
 const show=async(handedness:string)=>{await publishPrepared(page,s,[d.id],validateView({template:'instrument',data:{config:{family:'fretted',strings,fretCount:5,handedness},elements:{'string:one:fret:1':{highlight:true,label:'A'},'string:six:fret:3':{highlight:true,label:'B'}}}}));await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision);};
 await show('right');const root=viewer.locator('.viewer-candidate .instrument-visual');
 const right=await root.locator('[data-element-id="string:one:fret:1"] circle').getAttribute('cx');
 await show('left');const left=await root.locator('[data-element-id="string:one:fret:1"] circle').getAttribute('cx');expect(Number(left)).toBeGreaterThan(Number(right));
 const labels=await root.locator('svg>g>text').allTextContents();expect(labels.filter(t=>/^[1-6] ·/.test(t))).toEqual(strings.map(s=>String(s.label)));
 await expect(root.locator('svg')).not.toHaveAttribute('transform',/scale/);
 await viewer.screenshot({path:info.outputPath('instrument-left.png')});
});
});

test.describe("instruments coverage 3", () => {

const quiet=async(page:Page)=>{for(const button of await page.locator('.viewer-toast button').all())await button.click();};
const fact=(text:string)=>({version:1 as const,template:'fact' as const,data:{text}});

test('portrait QR fits a short caption and fretted boards distinguish fit from readable overflow',async({page},info)=>{
 await register(page);const s=await createSession(page,'Fit contracts'),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],validateView({template:'qr',data:{content:'https://example.com/',title:'Scan to open',text:'Open the supplied page.'}}));
 const qr=viewer.locator('.viewer-candidate .qr-viewport');await expect(qr.locator('img')).toBeVisible();
 const fit=await qr.evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('.qr-code img,.qr-copy')].every(e=>{const b=e.getBoundingClientRect();return b.top>=r.top-1&&b.bottom<=r.bottom+1&&b.right<=r.right+1;});});expect(fit).toBe(true);await quiet(viewer);await viewer.screenshot({path:info.outputPath('qr-fit.png')});
 const strings=[64,59,55,50,45,40].map((midi,i)=>({id:'s'+i,label:'String '+i,openPitch:{midi,label:'E'}}));
 for(const count of [5,24]){await publishPrepared(page,s,[d.id],validateView({template:'instrument',data:{config:{family:'fretted',strings,fretCount:count,capo:2,handedness:'left'},elements:{}}}));
  // 2026-11-11: the 24-fret board replaces the 5-fret one under the same selector. Without waiting for the painted
  // revision this measured the old board on a slow run (scroll 334 = width 334) and failed once on the phone.
  const painted=await waitForDisplay(page,s,d.id,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(painted.revision));
  const root=viewer.locator('.viewer-candidate .instrument-scroll');await expect(root).toBeVisible();const size=await root.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));if(count===5)expect(size.scroll).toBeLessThanOrEqual(size.width+1);else{if(info.project.name.startsWith('phone'))expect(size.scroll).toBeGreaterThan(size.width);expect(await root.locator('[data-fret-marker="12"]').count()).toBe(2);}await quiet(viewer);await viewer.screenshot({path:info.outputPath(`frets-${count}.png`)});}
});
});
