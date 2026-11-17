import { operationRequest } from '../mcp/requests.js';
import { createInterpreter } from '../../src/server/rendering/interpreter.js';
import { asyncMap } from '../../src/server/async-collections.js';
import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countdownDataSchema } from '../../src/shared/timer.js';
import type { DiagnosticRecord } from '../../src/shared/reports.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { startHarness, type Harness } from './harness.js';

const endsAt = '2099-01-01T12:00:00.125+02:00';
const harnesses: Harness[] = [], clients: (Client | LegacyClient)[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close().catch(() => {})));
  await Promise.all((await asyncMap(harnesses.splice(0), async h => (await h.close()))));
});

interface ToolResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: { data?: unknown; error?: { code: string; message: string; template?: string; schemaTool?: string; diagnosticId?: string; issues?: { path: string; problem: string }[] } };
}

async function setup(protocol: 'modern' | 'legacy') {
    const interpreter = createInterpreter();
    const interpret = vi.spyOn(interpreter, 'interpret');
    const h = await startHarness({ interpreter });
    harnesses.push(h);
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const issued = (await h.runtime.auth.issueToken(owner.user!.id, 'Isolated countdown acceptance', ['read', 'publish'], [session.id]));
    const requestInit = { headers: { Authorization: `Bearer ${issued.value}` } };
    const client = protocol === 'modern'
        ? new Client({ name: 'countdown-acceptance', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
        : new LegacyClient({ name: 'countdown-acceptance', version: '1' });
    clients.push(client);
    if (client instanceof Client)
        await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit }));
    else
        await client.connect(new LegacyTransport(new URL('/mcp', h.baseUrl), { requestInit }));
    const call = async (args: Record<string, unknown>) => await client.callTool(operationRequest({
        name: "kanvas_call",
        arguments: {
            operationId: "kanvas.submit",
            arguments: {
                sessionId: session.id, displayIds: [display.id], requestId: randomUUID(), ...args
            }
        }
    })) as ToolResult;
    const readUpdate = async (requestId: string) => await client.callTool(operationRequest({
        name: "kanvas_call",
        arguments: {
            operationId: "kanvas.update.status",
            arguments: {
                sessionId: session.id, requestId
            }
        }
    })) as ToolResult;
    return { h, owner, session, display, interpret, call, readUpdate };
}

function failure(result: ToolResult, code = 'INVALID_ARGUMENT') {
  expect(result.isError).toBe(true);
  expect(result.structuredContent?.error?.code).toBe(code);
  expect(JSON.parse(result.content?.find(item => item.type === 'text' && item.text?.startsWith('{'))?.text ?? '{}')).toEqual(result.structuredContent);
  expect(result.structuredContent?.error?.schemaTool).toBe('kanvas_discover');
  return result.structuredContent!.error!;
}

describe('the extracted backwards-compatible countdown contract', () => {
  it('requires the supplied end instant and retains fractions, offsets and paused time exactly', () => {
    expect(countdownDataSchema.parse({ endsAt, pausedRemainingSeconds: 42.125 })).toEqual({ endsAt, pausedRemainingSeconds: 42.125, completeText: 'Time is up' });
    expect(countdownDataSchema.safeParse({ targetTime: endsAt }).success).toBe(false);
    expect(countdownDataSchema.safeParse({ pausedRemainingSeconds: 42 }).success).toBe(false);
    expect(countdownDataSchema.parse({ endsAt, pausedRemainingSeconds: 31_536_000 }).pausedRemainingSeconds).toBe(31_536_000);
  });
  it.each(['2030-02-31T12:00:00Z', '2030-01-01T12:00:00', 'tomorrow', '', '2030-01-01'])('rejects ambiguous or nonexistent end instants: %s', invalid => {
    expect(countdownDataSchema.safeParse({ endsAt: invalid }).success).toBe(false);
  });
  it.each([-1, 31_536_001, NaN, Infinity])('rejects unsupported paused remainders: %s', pausedRemainingSeconds => {
    expect(countdownDataSchema.safeParse({ endsAt, pausedRemainingSeconds }).success).toBe(false);
  });
});

describe.each(['modern', 'legacy'] as const)('%s MCP countdown field guidance', protocol => {
    it('names targetTime and endsAt, redacts supplied content, and accepts a corrected prepared retry without source interpretation', async () => {
        const { h, owner, session, display, interpret, call } = await setup(protocol);
        const marker = `private-source-${randomUUID()}`, privateKey = `private-key-${randomUUID()}`, requestId = randomUUID();
        const requestsBefore = (await h.runtime.store.db.prepare('SELECT count(*) AS n FROM requests').get())?.n;
        const rejected = await call({ requestId, view: { version: 1, template: 'countdown', data: { targetTime: marker, [privateKey]: marker } } });
        const error = failure(rejected);
        expect(error.template).toBe('countdown');
        expect(error.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: 'view.data.endsAt', problem: expect.stringContaining('ISO 8601') }),
            expect.objectContaining({ path: 'view.data.targetTime', problem: expect.stringContaining('Use endsAt instead') }),
        ]));
        expect(error.message).toContain('endsAt');
        expect(error.message).toContain('targetTime');
        const diagnostic = (await h.runtime.store.get<DiagnosticRecord>('diagnostic', error.diagnosticId!));
        expect(diagnostic).toMatchObject({ operation: "kanvas.submit", phase: 'validation', code: 'INVALID_ARGUMENT', template: 'countdown' });
        expect(JSON.stringify([rejected, diagnostic])).not.toContain(marker);
        expect(JSON.stringify([rejected, diagnostic])).not.toContain(privateKey);
        expect((await owner.detail(session.id)).updates).toHaveLength(0);
        expect((await owner.detail(session.id)).displays[0].revision).toBe(0);
        expect((await h.runtime.store.db.prepare('SELECT count(*) AS n FROM requests').get())?.n).toBe(requestsBefore);
        const accepted = await call({ requestId, view: { version: 1, template: 'countdown', data: { endsAt, label: 'A supplied deadline', completeText: 'Done' } } });
        expect(accepted.isError).not.toBe(true);
        expect((accepted.structuredContent?.data as UpdateRecord).status).toBe('accepted');
        const settled = await owner.settle(session.id, requestId);
        expect(settled.update.status).toBe('prepared');
        expect(settled.detail.displays.find(value => value.id === display.id)?.view?.data).toEqual({ endsAt, label: 'A supplied deadline', completeText: 'Done' });
        expect(interpret).not.toHaveBeenCalled();
    });
    it('returns timestamp rules for both prepared views and structured sources, not opaque failures', async () => {
        const { owner, session, interpret, call, readUpdate } = await setup(protocol);
        for (const invalid of ['2077-03-14T09:26:53', '2077-02-31T09:26:53Z']) {
            const result = failure(await call({ view: { version: 1, template: 'countdown', data: { endsAt: invalid } } }));
            expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'view.data.endsAt', problem: expect.stringContaining('explicit timezone') })]));
            expect(JSON.stringify(result)).not.toContain(invalid);
        }
        const marker = `private-target-${randomUUID()}`, requestId = randomUUID();
        const accepted = await call({ requestId, templateHint: 'countdown', data: { targetTime: marker } });
        expect(accepted.isError).not.toBe(true);
        await owner.settle(session.id, requestId);
        const status = await readUpdate(requestId);
        expect(status.isError).not.toBe(true);
        const source = status.structuredContent?.data as UpdateRecord;
        expect(source.status).toBe('failed');
        expect(source.errorCode).toBe('MISSING_TIME_SOURCE');
        expect(source.validationIssues).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: 'data.endsAt', problem: expect.stringContaining('ISO 8601') }),
            expect.objectContaining({ path: 'data.targetTime', problem: expect.stringContaining('Use endsAt instead') }),
        ]));
        expect(JSON.stringify(source)).not.toContain(marker);
        const wrapper = failure(await call({ view: { version: 1, template: 'countdown', data: { endsAt }, unsupported: marker } }));
        expect(wrapper.template).toBe('countdown');
        expect(wrapper.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'view.<record-key>' })]));
        expect(JSON.stringify(wrapper)).not.toContain(marker);
        expect((await owner.detail(session.id)).updates).toHaveLength(1);
        expect((await owner.detail(session.id)).displays[0].revision).toBe(0);
        expect(interpret).toHaveBeenCalledTimes(1);
    });
});
