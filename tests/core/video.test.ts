import { operationRequest } from '../mcp/requests.js';
import { operationId } from '../../src/server/mcp/operations.js';
import { DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { DisplayRecord } from '../../src/shared/types.js';
import type { InteractionRecord } from '../../src/shared/types.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { Store } from '../../src/server/store.js';
import { DisplayHistory } from '../../src/server/display-history.js';
import type { VideoCommandRecord } from '../../src/server/video-controls.js';
import { RenderingError } from '../../src/server/rendering/errors.js';
import { fact } from './harness.js';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import type { Browser } from './harness.js';
import type { Harness } from './harness.js';

describe("video coverage 1", () => {


describe("video contracts", () => {
  let h!:Harness, owner: Browser, sessionId: string, displayId: string;
  const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
  beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; });
  afterEach(async () => { await h?.close(); });
  const current = async () => (await owner.detail(sessionId)).displays.find(display => display.id === displayId)!;
  const publish = async (view: ViewSpec) => { await owner.submit(sessionId, [displayId], view); return current(); };
  const respond = async (browser: Browser, value: Record<string, unknown>, revision: number, requestId = randomUUID()) => browser.request<InteractionRecord>('POST', `${path()}/respond`, { value, revision, requestId });
  const addViewer = async () => { const viewer = await h.account(); success(await owner.request('POST', `/api/sessions/${sessionId}/members`, { username: viewer.user!.username, role: 'viewer' })); return viewer; };
  const navigate = async (direction: 'back'|'forward', displays: DisplayRecord[]) => owner.request<UpdateRecord>('POST', `/api/sessions/${sessionId}/navigate`, { direction, displayIds: displays.map(d => d.id), expectedRevisions: Object.fromEntries(displays.map(d => [d.id, d.revision])), requestId: randomUUID() });

  it('controls an already-loaded video without a new content revision and accepts a real blocked-to-applied acknowledgement', async () => {
    const display = await publish({version: 1, template: 'video', data: {url: 'https://example.com/video.mp4'}});
    const input = {expectedRevision: display.revision, requestId: randomUUID(), command: {action: 'play'}};
    const receipt = success(await owner.request<{id: string; status: string}>('POST', `${path()}/video-control`, input));
    expect(receipt.status).toBe('pending'); expect((await current()).revision).toBe(display.revision);
    const state = {currentTime: 0, paused: true, muted: false, fullscreen: false, volume: 1, playbackRate: 8};
    const resultPath = `${path()}/video-commands/${receipt.id}/result`;
    const blocked = success(await owner.request<{status: string; result: {message: string}}>('POST', resultPath, {...state, status: 'blocked', message: 'private browser exception'}));
    expect(blocked.status).toBe('blocked'); expect(blocked.result.message).not.toContain('private');
    expect(success(await owner.request<{status: string}>('POST', resultPath, {...state, paused: false, status: 'applied'})).status).toBe('applied');
    expect(success(await owner.request<{id: string}>('POST', `${path()}/video-control`, input)).id).toBe(receipt.id);
    expect((await owner.request('POST', `${path()}/video-control`, {...input, command: {action: 'pause'}})).status).toBe(409);
  });

  it('does not apply expired/superseded video commands and respects write scope and parameter bounds', async () => {
    let display = await publish({version: 1, template: 'video', data: {url: 'https://example.com/video.mp4'}});
    const viewer = await addViewer(); denied(await viewer.request('POST', `${path()}/video-control`, {expectedRevision: display.revision, requestId: randomUUID(), command: {action: 'play'}}));
    for (const command of [{action: 'seek'}, {action: 'volume', value: 2}, {action: 'rate', value: 10}]) expect((await owner.request('POST', `${path()}/video-control`, {expectedRevision: display.revision, requestId: randomUUID(), command})).status).toBe(400);
    const receipt = success(await owner.request<{id: string}>('POST', `${path()}/video-control`, {expectedRevision: display.revision, requestId: randomUUID(), command: {action: 'pause'}}));
    const stored = (await h.runtime.store.get<VideoCommandRecord>('video-command', receipt.id))!;
    (await h.runtime.store.put('video-command', {...stored, expiresAt: new Date(Date.now() - 1).toISOString()}));
    const state = {status: 'applied', currentTime: 0, paused: true, muted: false, fullscreen: false, volume: 1, playbackRate: 1};
    expect(success(await owner.request<{status: string}>('POST', `${path()}/video-commands/${receipt.id}/result`, state)).status).toBe('expired');
    const next = success(await owner.request<{id: string}>('POST', `${path()}/video-control`, {expectedRevision: display.revision, requestId: randomUUID(), command: {action: 'play'}}));
    display = await publish(fact('No longer video'));
    expect(success(await owner.request<{status: string}>('POST', `${path()}/video-commands/${next.id}/result`, state)).status).toBe('superseded');
    expect((await current()).revision).toBe(display.revision);
  });});
});
