import { operationRequest } from '../mcp/requests.js';
import { operationId, DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { DisplayRecord, InteractionRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import { Store } from '../../src/server/store.js';
import { DisplayHistory } from '../../src/server/display-history.js';
import type { VideoCommandRecord } from '../../src/server/video-controls.js';
import { RenderingError } from '../../src/server/rendering/errors.js';
import { fact, startHarness, success, denied, type Browser, type Harness } from './harness.js';

describe('feedback batch: real display history, controls, participation and diagnostics', () => {
  let h: Harness, owner: Browser, sessionId: string, displayId: string;
  const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
  beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; });
  afterEach(async () => { await h?.close(); });
  const current = async () => (await owner.detail(sessionId)).displays.find(display => display.id === displayId)!;
  const publish = async (view: ViewSpec) => { await owner.submit(sessionId, [displayId], view); return current(); };
  const respond = async (browser: Browser, value: Record<string, unknown>, revision: number, requestId = randomUUID()) => browser.request<InteractionRecord>('POST', `${path()}/respond`, { value, revision, requestId });
  const addViewer = async () => { const viewer = await h.account(); success(await owner.request('POST', `/api/sessions/${sessionId}/members`, { username: viewer.user!.username, role: 'viewer' })); return viewer; };
  const navigate = async (direction: 'back'|'forward', displays: DisplayRecord[]) => owner.request<UpdateRecord>('POST', `/api/sessions/${sessionId}/navigate`, { direction, displayIds: displays.map(d => d.id), expectedRevisions: Object.fromEntries(displays.map(d => [d.id, d.revision])), requestId: randomUUID() });

  it('restores exact retained views without content regeneration, persists the timeline and cuts a forward branch', async () => {
    await publish(fact('Original 1.00000000000000000001'));
    await publish(fact('Second view'));
    const before = await current();
    expect(success(await navigate('back', [before])).status).toBe('prepared');
    const restored = await current();
    expect(restored.view?.data.text).toBe('Original 1.00000000000000000001');
    expect(restored.revision).toBeGreaterThan(before.revision);
    success(await navigate('forward', [restored]));
    expect((await current()).view?.data.text).toBe('Second view');
    success(await navigate('back', [await current()]));
    await publish(fact('New branch'));
    const history = success(await owner.request<{canGoForward: boolean; entries: {title?: string}[]}>('GET', `${path()}/history`));
    expect(history.canGoForward).toBe(false);
    expect((await navigate('forward', [await current()])).status).toBe(409);
    const stored = new Store(h.database);
    try { expect((await new DisplayHistory(stored).list((await current()))).canGoForward).toBe(false); } finally { (await stored.close()); }
  });

  it('validates every history target and every revision before changing any display', async () => {
    await publish(fact('First')); await publish(fact('Second'));
    const first = await current(), empty = await owner.display(sessionId, 'No previous view');
    expect((await navigate('back', [first, empty])).status).toBe(409);
    expect((await current()).revision).toBe(first.revision);
    const viewer = await addViewer();
    denied(await viewer.request('POST', `/api/sessions/${sessionId}/navigate`, { displayIds: [displayId], direction: 'back', expectedRevisions: {[displayId]: first.revision}, requestId: randomUUID() }));
    const stale = {...first, revision: first.revision - 1};
    expect((await navigate('back', [stale])).status).toBe(409);
  });

  it('sends checkbox changes through the durable inbox, with a stable replay and stale-edit protection', async () => {
    const display = await publish({version: 1, template: 'checklist', data: {items: [{id: 'a', text: 'A real checkbox', checked: false}]}});
    const viewer = await addViewer(), requestId = randomUUID(), value = {kind: 'checklist.toggle', itemId: 'a', checked: true};
    const first = success(await respond(viewer, value, display.revision, requestId));
    const replay = success(await respond(viewer, value, display.revision, requestId));
    expect(replay.id).toBe(first.id); expect(first.actionId).toBe('checklist.toggle');
    expect(first.status).toBe('pending');
    expect((await current()).view?.data.items).toMatchObject([{id: 'a', checked: true}]);
    expect((await respond(viewer, {...value, checked: false}, display.revision)).status).toBe(409);
    expect((await owner.detail(sessionId)).interactions).toHaveLength(1);
  });

  it('cues a navigable saved deck and keeps intrinsic responses attached to their own slide', async () => {
    const poll: ViewSpec = {version: 1, template: 'poll', data: {question: 'Choose', options: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], revealResults: true}};
    const deck = success(await owner.request<{id: string}>('POST', `/api/sessions/${sessionId}/presentations`, {name: 'Retained deck', slides: [poll, fact('Last slide')]}));
    const cue = async (index: number) => { const requestId = randomUUID(); success(await owner.request('POST', `/api/sessions/${sessionId}/presentations/${deck.id}/cue`, {index, displayIds: [displayId], requestId})); return owner.settle(sessionId, requestId); };
    await cue(0); let display = await current(); expect(display.view?.template).toBe('presentation');
    success(await respond(owner, {kind: 'poll.vote', optionIds: ['a']}, display.revision));
    success(await respond(owner, {kind: 'presentation.navigate', index: 1}, display.revision));
    expect((await current()).view?.data.index).toBe(1);
    await cue(0); display = await current(); expect(display.responseState?.poll?.counts).toEqual({a: 1, b: 0});
    const viewer = await addViewer(); denied(await respond(viewer, {kind: 'presentation.navigate', index: 1}, display.revision));
  });

  it('validates form values against actual fields, preserves exact strings, and keeps responses private', async () => {
    const display = await publish({version: 1, template: 'form', data: {fields: [{id: 'name', type: 'text', label: 'Name', required: true, maxLength: 40}, {id: 'score', type: 'range', label: 'Score', min: 0, max: 10, step: 2}, {id: 'agree', type: 'checkbox', label: 'Agree', required: true}]}});
    const viewer = await addViewer(), other = await addViewer();
    expect((await respond(viewer, {kind: 'form.submit', values: {name: '  ', agree: true}}, display.revision)).status).toBe(400);
    expect((await respond(viewer, {kind: 'form.submit', values: {name: 'Exact', score: 3, agree: true}}, display.revision)).status).toBe(400);
    expect((await respond(viewer, {kind: 'form.submit', values: {name: 'Exact', agree: false}}, display.revision)).status).toBe(400);
    expect((await respond(viewer, {kind: 'form.submit', values: {name: 'Exact', agree: true, hidden: 'No'}}, display.revision)).status).toBe(400);
    const response = success(await respond(viewer, {kind: 'form.submit', values: {name: '  Preserve spaces  ', score: 4, agree: true}}, display.revision));
    expect(response.value).toEqual({name: '  Preserve spaces  ', score: 4, agree: true});
    const mine = success(await viewer.request<{displays: DisplayRecord[]}>('GET', `/api/sessions/${sessionId}?displayId=${displayId}`));
    expect(mine.displays[0].responseState?.form?.submitted).toBe(true);
    const theirs = await other.detail(sessionId);
    expect(theirs.interactions).toHaveLength(0); expect(theirs.displays[0].responseState?.form?.submitted).toBe(false);
    expect(JSON.stringify(theirs)).not.toContain('Preserve spaces');
  });

  it('derives poll counts from actual identities, hides aggregates before reveal, and rejects invented totals', async () => {
    const display = await publish({version: 1, template: 'poll', data: {question: 'Choose', options: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]}});
    const viewer = await addViewer(), other = await addViewer();
    const first = success(await respond(viewer, {kind: 'poll.vote', optionIds: ['a']}, display.revision)); expect(first.actionId).toBe('poll.vote');
    success(await respond(viewer, {kind: 'poll.vote', optionIds: ['b']}, display.revision));
    success(await respond(other, {kind: 'poll.vote', optionIds: ['a']}, display.revision));
    const hidden = (await viewer.detail(sessionId)).displays[0].responseState!.poll!;
    expect(hidden).toEqual({revealed: false, selectedOptionIds: ['b']});
    expect((await viewer.detail(sessionId)).interactions.every(item => item.userId === viewer.user!.id)).toBe(true);
    const reveal = success(await owner.request<DisplayRecord>('PATCH', `${path()}/view`, {expectedRevision: display.revision, data: {...display.view!.data, revealResults: true}}));
    expect(reveal.responseState!.poll).toMatchObject({revealed: true, totalVotes: 2, counts: {a: 1, b: 1}});
    expect((await owner.request('PATCH', `${path()}/view`, {expectedRevision: reveal.revision, data: {...reveal.view!.data, counts: {a: 2000}}})).status).toBe(400);
    expect((await respond(viewer, {kind: 'poll.vote', optionIds: ['absent']}, reveal.revision)).status).toBe(400);
    success(await owner.request('PATCH', `${path()}/view`, {expectedRevision: reveal.revision, data: {...reveal.view!.data, closed: true}}));
    expect((await respond(viewer, {kind: 'poll.vote', optionIds: ['a']}, (await current()).revision)).status).toBe(409);
  });

  it('bounds poll resubmission rate even though one identity owns only one active ballot', async () => {
    const display = await publish({version: 1, template: 'poll', data: {question: 'Choose', options: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]}});
    for (let index = 0; index < 10; index++) success(await respond(owner, {kind: 'poll.vote', optionIds: [index % 2 ? 'a' : 'b']}, display.revision));
    expect((await respond(owner, {kind: 'poll.vote', optionIds: ['a']}, display.revision)).status).toBe(429);
  });

  it('history restores a poll’s real responses without copying them into a newly published round', async () => {
    const poll: ViewSpec = {version: 1, template: 'poll', data: {question: 'Retained responses', options: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], revealResults: true}};
    const display = await publish(poll), viewer = await addViewer();
    success(await respond(viewer, {kind: 'poll.vote', optionIds: ['a']}, display.revision));
    await publish(fact('Another view'));
    success(await navigate('back', [await current()]));
    expect((await current()).responseState?.poll?.counts).toEqual({a: 1, b: 0});
    success(await navigate('forward', [await current()]));
    await publish(poll);
    expect((await current()).responseState?.poll?.counts).toEqual({a: 0, b: 0});
  });

  it('collects real audience words without exposing unrevealed entries or accepting supplied aggregates', async () => {
    const display = await publish({version: 1, template: 'qa', data: {prompt: 'One idea', mode: 'word-cloud', revealResults: false}});
    const viewer = await addViewer(); success(await respond(viewer, {kind: 'qa.submit', text: 'Clear clear useful'}, display.revision));
    expect((await owner.detail(sessionId)).displays[0].responseState?.qa).not.toHaveProperty('entries');
    const reveal = success(await owner.request<DisplayRecord>('PATCH', `${path()}/view`, {expectedRevision: display.revision, data: {...display.view!.data, revealResults: true}}));
    expect(reveal.responseState?.qa?.entries?.map(({text, count}) => ({text, count}))).toEqual([{text: 'clear', count: 2}, {text: 'useful', count: 1}]);
  });

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
  });

  it('reports a prepared-but-unpainted frame as offline or timed out, never applied, and accepts explicit failure/recovery', async () => {
    const {update} = await owner.submit(sessionId, [displayId], fact('Needs paint'));
    expect((await owner.detail(sessionId)).updates[0].delivery?.[displayId].status).toBe('offline');
    const principal = (await h.runtime.auth.browser({cookies: Object.fromEntries(owner.cookies)} as never)).principal;
    const disconnect = (await h.runtime.service.connectDisplay(principal, sessionId, displayId));
    (await h.runtime.store.put('update', {...update, completedAt: new Date(Date.now() - 31_000).toISOString()}));
    let status = (await owner.detail(sessionId)).updates[0]; expect(status.status).toBe('prepared'); expect(status.delivery?.[displayId].status).toBe('timed_out');
    const display = await current(); success(await owner.request('POST', `${path()}/delivery`, {revision: display.revision, status: 'failed', lastGoodRevision: 0}));
    status = (await owner.detail(sessionId)).updates[0]; expect(status.delivery?.[displayId].status).toBe('failed'); expect(status.status).toBe('prepared');
    success(await owner.request('POST', `${path()}/applied`, {revision: display.revision}));
    status = (await owner.detail(sessionId)).updates[0]; expect(status.status).toBe('applied'); expect(status.delivery?.[displayId].status).toBe('applied');
    (await disconnect());
  });

  it('returns precise schema limits/enums through real MCP and losslessly imports JSON text', async () => {
    const issued = success(await owner.request<{token: string}>('POST', '/api/tokens', {name: 'Feedback gate', scopes: ['read', 'publish'], sessionIds: [sessionId]}));
    const client = new Client({name: 'feedback-gate', version: '1'});
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), {requestInit: {headers: {Authorization: `Bearer ${issued.token}`}}}));
    try {
      const tools = await client.listTools();
      expect(tools.tools.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
      for (const name of ['kanvas_feedback_submit', 'kanvas_error_report', 'kanvas_display_snapshot', 'kanvas_video_control', 'kanvas_display_history']) { const result = await client.callTool({name: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id:operationId(name)}}); expect((result.structuredContent as any).data.entry.operationId).toBe(operationId(name)); }
      const category = await client.callTool(operationRequest({name: 'kanvas_feedback_submit', arguments: {sessionId, requestId: randomUUID(), title: 'Wrong category', description: 'Minimal report', category: 'bug'}}));
      expect(category.isError).toBe(true); expect(JSON.stringify(category.structuredContent)).toContain('usability');
      const long = await client.callTool(operationRequest({name: 'kanvas_submit', arguments: {sessionId, displayIds: [displayId], requestId: randomUUID(), intent: 'x'.repeat(1001)}}));
      expect(long.isError).toBe(true); expect(JSON.stringify(long.structuredContent)).toContain('1000');
      const imported = await client.callTool(operationRequest({name: 'kanvas_dataset_import', arguments: {sessionId, name: 'Exact', json: '[{"value":9007199254740993.123456789}]'}}));
      expect(imported.isError).not.toBe(true);
      expect((imported.structuredContent as {data: {rows: unknown[]}}).data.rows).toEqual([{value: '9007199254740993.123456789'}]);
    } finally { await client.close(); }
  });
});

describe('multi-target rendering failure accountability', () => {
  it('retains every previous view, preserves actionable failure fields and accounts for all target attempts', async () => {
    const h = await startHarness({interpreter: {async interpret(input) {
      if (input.display.width < 1000) { const error = new RenderingError('INVALID_SOURCE_CONTENT', 'Private ignored', false, [{path: 'view.data.items', code: 'invalid_type', rule: 'Expected an array.'}]); error.metrics = {validationMs: 2}; throw error; }
      return {action: 'replace', view: fact('Would succeed'), metrics: {validationMs: 1}};
    }}});
    try {
      const owner = await h.account(), session = await owner.session(), a = await owner.display(session.id, 'A', 800), b = await owner.display(session.id, 'B', 1200);
      await owner.submit(session.id, [a.id, b.id], fact('Prior good view'));
      const requestId = randomUUID(); success(await owner.request('POST', `/api/sessions/${session.id}/submit`, {displayIds: [a.id, b.id], requestId, intent: 'Render'}));
      const settled = await owner.settle(session.id, requestId);
      expect(settled.update.status).toBe('failed'); expect(settled.update.errorCode).toBe('INVALID_SOURCE_CONTENT');
      expect(settled.update.validationIssues).toEqual([{path: 'view.data.items', problem: 'Expected an array.'}]);
      expect(settled.update.metrics).toMatchObject({validationMs: 3});
      expect(settled.detail.displays.every(display => display.view?.data.text === 'Prior good view')).toBe(true);
      expect(JSON.stringify(settled.update)).not.toContain('Private ignored');
    } finally { await h.close(); }
  });
});
