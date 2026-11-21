import type { Response } from 'express';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { hash } from '../../src/server/auth.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import { ACCOUNT_MANAGE } from '../../src/server/account-inventory.js';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical.js';
import { profileResultData } from '../../src/server/mcp/profile-guidance.js';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { success } from './harness';
import { createApp } from '../../src/server/app';
import { safePushEndpoint } from '../../src/server/push';
import { diagnosticBatchSchema } from '../../src/shared/frontend-diagnostics';
import { diagnosticRoute } from '../../src/shared/frontend-diagnostics';
import { chatDataSchema } from '../../src/shared/work-views';
import { flashcardDataSchema } from '../../src/shared/flashcards';
import { advanceFlashcards } from '../../src/shared/flashcards';
import { flashcardControlSchema } from '../../src/shared/flashcards';

describe("account home coverage 1", () => {


describe('account home, inventory and live-browser redirect (reported regression)', () => {
  let h!:Harness, owner: Browser, p: AuthPrincipal & { browserId: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as any;
  const waitFor = async (check: () => boolean) => { for (let attempt = 0; attempt < 100 && !check(); attempt++) await new Promise(resolve => setTimeout(resolve, 20)); };
  beforeEach(async () => {
    h = await startHarness(); owner = await h.account();
    const browser = (await h.runtime.auth.issueBrowser(owner.user!.id, { cookie: () => {} } as unknown as Response));
    p = { userId: owner.user!.id, browserId: browser.id };
  });
  afterEach(async () => { await h?.close(); });

  it('names only real operations and translates them for the twelve profile', () => {
    const names = new Set(canonicalToolDefinitions().map(tool => tool.name));
    for (const area of Object.values(ACCOUNT_MANAGE)) for (const name of [...area.read, ...area.change]) expect(names.has(name), name).toBe(true);
    const translated = profileResultData('kanvas_account_inventory', { manage: ACCOUNT_MANAGE }, 'twelve') as { manage: Record<string, { change: string[] }> };
    expect(translated.manage.connections!.change).toContain('kanvas_control connection.redirect');
    expect(translated.manage.devices!.change).toContain('kanvas_control device.present');
  });

  it('lists sessions with their displays, devices with windows, groups and the manage map', async () => {
    const planning = await owner.session('Planning'), wall = await owner.display(planning.id, 'Wall');
    await owner.submit(planning.id, [wall.id], { ...fact('Hello'), title: 'Morning briefing' });
    const old = await owner.session('Old session');
    await call('kanvas_session_end', { sessionId: old.id });
    const device = await h.runtime.service.devices.register(p, { installationId: 'inventory' }, 'Chrome/140');
    const tab = await h.runtime.service.devices.windows.register(p, device.id, 'inventory-tab');
    const inventory = await call('kanvas_account_inventory', {});
    const names = inventory.sessions.map((session: { name: string }) => session.name);
    expect(names).toContain('Planning'); expect(names).not.toContain('Old session'); expect(inventory.endedHidden).toBeGreaterThanOrEqual(1);
    expect(inventory.sessions.find((session: { id: string }) => session.id === planning.id)).toMatchObject({ role: 'owner', displays: [{ id: wall.id, name: 'Wall', online: false, shows: 'Morning briefing' }] });
    expect(inventory.devices).toEqual([expect.objectContaining({ id: device.id, windows: [expect.objectContaining({ id: tab.id, connected: false })] })]);
    expect(Array.isArray(inventory.groups)).toBe(true);
    expect(inventory.manage.connections.change).toContain('kanvas_connection_redirect'); expect(inventory.notAvailable.length).toBeGreaterThan(0);
    expect((await call('kanvas_account_inventory', { includeEnded: true })).sessions.map((session: { name: string }) => session.name)).toContain('Old session');
  });

  it('redirects the owner’s own live browser window to a display in another session, idempotently', async () => {
    const first = await owner.session('First'), here = await owner.display(first.id, 'Here');
    const second = await owner.session('Second'), there = await owner.display(second.id, 'There');
    const svc = h.runtime.service, device = await svc.devices.register(p, { installationId: 'redirect' }, 'Chrome/140');
    const tab = await svc.devices.windows.register(p, device.id, 'redirect-tab'), connectionId = hash(`${p.browserId}:redirect-tab`).slice(0, 32);
    const args = { connectionId, sessionId: second.id, displayId: there.id, requestId: 'redirect-1' };
    await expect(call('kanvas_connection_redirect', { ...args, requestId: 'while-offline' })).rejects.toMatchObject({ code: 'WINDOW_OFFLINE' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seen: any[] = [], stream = await svc.devices.windows.stream(p, device.id, tab.id, event => seen.push(event));
    try {
      const sent = await call('kanvas_connection_redirect', args);
      await waitFor(() => seen.some(event => event?.command?.id === sent.commandId));
      expect(seen.find(event => event?.command?.id === sent.commandId)?.command).toMatchObject({ sessionId: second.id, displayId: there.id, status: 'pending' });
      expect((await call('kanvas_connection_redirect', args)).commandId).toBe(sent.commandId);
      await expect(call('kanvas_connection_redirect', { ...args, sessionId: first.id, displayId: here.id })).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });
      await expect(call('kanvas_connection_redirect', { ...args, connectionId: 'not-a-window', requestId: 'unknown' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally { stream.close(); }
  });
});
});

describe("account home coverage 2", () => {

describe("account home contracts",()=>{
 let h!:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
 const send=vi.fn(async(_subscription:unknown,_payload:string)=>({statusCode:201}));
 beforeEach(async()=>{send.mockClear();h=await startHarness({pushOptions:{publicKey:'test-public-key',privateKey:'test-private-key',subject:'mailto:test@example.invalid',send}});owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
 afterEach(async()=>{await h?.close();});
 async function deck(){const result=await owner.submit(s,[d],{version:1,template:'flashcards',data:{mode:'test',cards:[{id:'hola',prompt:'hola',answer:'hello',acceptedAnswers:['hi']},{id:'adios',prompt:'adiós',answer:'goodbye'}]}});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;}
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/inert',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};
 it('offline begin creates exactly one ready session only for explicitly opted-in returning users',async()=>{
  const token=await h.runtime.auth.issueToken(p.userId,'Agent'),agent={...p,tokenId:token.token.id};
  expect(await h.runtime.service.beginSession(agent,{name:'No opt-in',requestId:'no-opt-in'})).toMatchObject({status:'needs_display'});
  success(await owner.request('POST','/api/push',subscription));
  const args={name:'Ready by push',requestId:'start'},first=await h.runtime.service.beginSession(agent,args);expect(first).toMatchObject({status:'started',notification:true});
  const retry=await h.runtime.service.beginSession(agent,args);expect(retry).toMatchObject({sessionId:'sessionId' in first?first.sessionId:undefined});
  await h.runtime.service.push.close();expect(send).toHaveBeenCalledTimes(1);
 });});
});
