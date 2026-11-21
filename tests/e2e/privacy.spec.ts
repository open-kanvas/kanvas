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
import { validateView } from '../../src/shared/view-schemas';
import { gameExample } from '../../src/shared/game';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { operationRequest } from '../mcp/requests.js';
import { GAME_PRESETS } from '../../src/shared/game';

test.describe("privacy coverage 1", () => {


test('privacy recovery on another signed-in browser restores the locked installation',async({page,browser,baseURL,diagnostics})=>{
 const account=await register(page);const devices=await sessionApi<{devices:{id:string}[]}>(page,'/api/devices');expect(devices.data!.devices.length).toBeGreaterThan(0);
 // Separate browser context has independent installation cookies and sign-in.
 const context=await browser.newContext({baseURL});const recovery=await context.newPage();diagnostics.watch(recovery);
 try{
  expect((await context.request.post('/api/auth/login',{data:account})).status()).toBe(200);
  await recovery.goto('/console?account=sessions');await expect(recovery.getByRole('heading',{name:'Signed-in browsers',exact:true})).toBeVisible();
  const token=await sessionApi<{token:string}>(recovery,'/api/tokens','POST',{name:'Recovery fixture',scopes:['read','publish']});
  const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'recovery-fixture',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));
  try{diagnostics.allowHttp(page,'/api/',423);const result=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.device.lock',arguments:{deviceId:devices.data!.devices[0].id}}});expect(result.isError).not.toBe(true);}finally{await client.close();}
  await expect(page.getByText('Kanvas is locked on this device.',{exact:true})).toBeVisible();
  await recovery.getByRole('button',{name:'Refresh locked devices',exact:true}).click();
  await recovery.getByRole('button',{name:'Unlock',exact:true}).click();
  await expect(page.locator('.workspace')).toBeVisible();await expect(recovery.getByRole('button',{name:'Unlock',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});


test('status-channel failure hides cached content until an unlocked response is received',async({page,diagnostics})=>{
 await register(page);const s=await createSession(page,'Offline privacy'),d=await createDisplay(page,s,'Offline screen'),viewer=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],validateView({template:'fact',data:{text:'No offline private content'}}));await expect(viewer.locator('.viewer-candidate')).toContainText('No offline private content');
 diagnostics.allowOffline(viewer);await viewer.route('**/api/device-privacy/status',route=>route.abort('internetdisconnected'));
 await expect(viewer.locator('[data-privacy-state=offline]')).toBeVisible();await expect(viewer.locator('.viewer-shell')).toHaveCount(0);await expect(viewer.getByText('No offline private content',{exact:true})).toHaveCount(0);
 await viewer.unroute('**/api/device-privacy/status');await expect(viewer.locator('.viewer-candidate')).toContainText('No offline private content');
});
});

test.describe("privacy coverage 2", () => {
    test('device lock covers existing windows and reloads, while kiosk preserves visible content without chrome', async ({ page, baseURL, diagnostics }, info) => {
        await register(page);
        const s = await createSession(page, 'Private device'), d = await createDisplay(page, s, 'Protected screen'), viewer = await openViewer(page, s, d.id);
        await publishPrepared(page, s, [d.id], validateView({ template: 'fact', data: { text: 'PRIVATE RECEIVER CONTENT' } }));
        await expect(viewer.locator('.viewer-candidate')).toContainText('PRIVATE RECEIVER CONTENT');
        const second = await page.context().newPage();
        await second.goto(`/view/${s}/${d.id}`);
        await expect(second.locator('.viewer-candidate')).toContainText('PRIVATE RECEIVER CONTENT');
        const token = await sessionApi<{
            token: string;
        }>(page, '/api/tokens', 'POST', { name: 'Privacy acceptance', scopes: ['read', 'publish'] });
        const client = new Client({ name: 'nov05-privacy-acceptance', version: '1' });
        await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers: { Authorization: `Bearer ${token.data!.token}` } } }));
        const call = async (name: string, args: Record<string, unknown>) => { const result = await client.callTool(operationRequest({ name, arguments: args })); expect(result.isError, JSON.stringify(result)).not.toBe(true); return (result.structuredContent as any).data; };
        try {
            const devices = await sessionApi<{
                devices: {
                    id: string;
                }[];
            }>(page, '/api/devices');
            expect(devices.data!.devices.length).toBeGreaterThan(0);
            const deviceId = devices.data!.devices[0].id;
            for (const screen of [page, viewer, second])
                diagnostics.allowHttp(screen, '/api/', 423);
            await call("kanvas.device.lock", { deviceId });
            for (const screen of [page, viewer, second]) {
                await expect(screen.getByText('Kanvas is locked on this device.', { exact: true })).toBeVisible();
                await expect(screen.locator('.viewer-shell,.workspace')).toHaveCount(0);
            }
            expect((await page.request.get(`/api/sessions/${s}`)).status()).toBe(423);
            await second.reload();
            await expect(second.getByText('Kanvas is locked on this device.', { exact: true })).toBeVisible();
            await call("kanvas.device.unlock", { deviceId });
            await expect(viewer.locator('.viewer-candidate')).toContainText('PRIVATE RECEIVER CONTENT');
            await call("kanvas.display.lockdown", { sessionId: s, displayId: d.id, locked: true });
            try {
                await expect(viewer.locator('[data-kiosk=true]')).toContainText('PRIVATE RECEIVER CONTENT');
            }
            catch (error) {
                console.log('lockdown diagnostic', JSON.stringify({ body: await viewer.locator('body').innerText(), state: (await sessionDetail(page, s)).displays.map(d => ({ id: d.id, lockdown: d.lockdown, revision: d.revision, appliedRevision: d.appliedRevision })) }));
                await viewer.screenshot({ path: info.outputPath('lockdown-failure.png') });
                throw error;
            }
            await expect(viewer.locator('.viewer-menu-toggle,.filmstrip,.navigation-panel')).toHaveCount(0);
            await viewer.evaluate(() => window.addEventListener('kanvas:painted', e => { (window as any).__kioskPaint = (e as CustomEvent).detail; }));
            await publishPrepared(page, s, [d.id], validateView({ template: 'fact', data: { text: 'Owner-updated kiosk content' }, actions: [{ id: 'feedback', kind: 'input', label: 'Send feedback' }] }));
            await expect(viewer.locator('[data-kiosk=true]')).toContainText('Owner-updated kiosk content');
            const input = viewer.getByRole('textbox', { name: 'Send feedback' });
            await input.pressSequentially('feedback');
            await expect(input).toHaveValue('feedback');
            await input.press('ArrowLeft');
            await input.press('ArrowRight');
            await input.press('Enter');
            await expect.poll(async () => (await sessionDetail(page, s)).interactions.some(i => i.actionId === 'feedback' && i.value === 'feedback')).toBe(true);
            const revision = (await sessionDetail(page, s)).displays.find(v => v.id === d.id)!.revision;
            await expect.poll(() => viewer.evaluate(() => (window as any).__kioskPaint?.renderedRevision)).toBe(revision);
            await call("kanvas.display.lockdown", { sessionId: s, displayId: d.id, locked: false });
            await expect(viewer.locator('.viewer-menu-toggle')).toBeVisible();
        }
        finally {
            await client.close();
        }
    });
});
