import { DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { afterEach, describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { listToolDefinitions, resolveToolCall } from '../../src/server/mcp/catalog.js';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical.js';
import { OPERATION_ENTRIES, PUBLIC_TOOL_NAMES, mcpProfile, publicReference } from '../../src/server/mcp/operations.js';
import { TOOL_DISCOVERY } from '../../src/server/mcp/tool-discovery.js';
import { GUIDE_TOPICS, guideFor } from '../../src/server/mcp/guide.js';
import { profileResourceData } from '../../src/server/mcp/profile-guidance.js';
import { toolSuccess, toolFailure, MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { InputError } from '../../src/server/input-errors.js';
import { harness } from './harness.js';

const publicTools = listToolDefinitions('twelve');
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
const validators = new Map(publicTools.map(tool => [tool.name, ajv.compile(tool.inputSchema)]));
const namesIn = (value: unknown) => [...new Set(JSON.stringify(value).match(/\bkanvas_[a-z_]+\b/g) ?? [])];
const envelope = (result: ReturnType<typeof toolSuccess>) => result.structuredContent as Record<string, unknown>;
let server: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => { await server?.close(); server = undefined; });

describe('twelve-tool strict published and runtime contract', () => {
  it('covers every canonical operation once across the public MCP tools', () => {
    expect(publicTools.map(tool => tool.name)).toEqual(PUBLIC_TOOL_NAMES);
    expect(publicTools).toHaveLength(12);
    expect(OPERATION_ENTRIES).toHaveLength(CANONICAL_TOOLS.length);
    expect(OPERATION_ENTRIES.map(entry => entry.canonical).sort()).toEqual(CANONICAL_TOOLS.map(tool => tool.name).sort());
    for (const tool of publicTools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.required).toEqual(['operation']);
      expect(tool.inputSchema.properties?.operation).not.toHaveProperty('default');
    }
    expect(() => mcpProfile('unknown')).toThrow('KANVAS_MCP_PROFILE');
    expect(mcpProfile('twelve')).toBe('twelve');
    expect(mcpProfile()).toBe('discovery');
  });

  for (const { tool, operation, canonical } of OPERATION_ENTRIES) it(`${tool}/${operation}: preserves valid inputs, defaults and rejects cross-branch extras`, () => {
    const validate = validators.get(tool)!;
    for (const args of TOOL_DISCOVERY[canonical].examples) {
      const input = { operation, ...structuredClone(args) };
      const before = structuredClone(input);
      expect(validate(input), JSON.stringify(validate.errors)).toBe(true);
      const mapped = resolveToolCall('twelve', tool, input);
      const legacy = resolveToolCall('legacy', canonical, args);
      expect(mapped.error).toBeUndefined(); expect(legacy.error).toBeUndefined();
      expect(mapped.canonicalName).toBe(canonical);
      if(!('requestId' in args)&&mapped.args?.requestId!==undefined){expect(mapped.args.requestId).toEqual(expect.any(String));expect(legacy.args?.requestId).toEqual(expect.any(String));expect({...mapped.args,requestId:undefined}).toEqual({...legacy.args,requestId:undefined});}
      else expect(mapped.args).toEqual(legacy.args);
      expect(mapped.args).not.toHaveProperty('operation');
      expect(input).toEqual(before);
      for (const malformed of [{ ...input, unexpectedOtherBranchField: true }, { ...input, operation: 'unknown' }, args]) {
        expect(validate(malformed)).toBe(false);
        expect(resolveToolCall('twelve', tool, malformed).error).toBeDefined();
      }
      expect(resolveToolCall('legacy', canonical, input).error).toBeDefined();
      expect(resolveToolCall('twelve', canonical, args).error).toBeDefined();
    }
  });

  it.each([
    ['kanvas_feedback', {operation:'submit',requestId:'r',title:'T',description:'D'}],
    ['kanvas_feedback', {operation:'submit',scope:'account',sessionId:'s',requestId:'r',title:'T',description:'D'}],
    ['kanvas_feedback', {operation:'error.report',scope:'service',diagnosticId:'private',requestId:'r',title:'T',description:'D'}],
    ['kanvas_inspect', {operation:'reports.read',scope:'all',sessionId:'s'}],
    ['kanvas_control', { operation: 'display.update', sessionId: 's', displayId: 'd' }],
    ['kanvas_control', { operation: 'display.update', sessionId: 's', displayId: 'd', held: true }],
    ['kanvas_control', { operation: 'history.navigate', sessionId: 's', displayIds: ['d'], requestId: 'r', expectedRevisions: { d: 1 } }],
    ['kanvas_control', { operation: 'history.navigate', sessionId: 's', displayIds: ['d'], requestId: 'r', expectedRevisions: { d: 1 }, direction: 'back', revision: 0 }],
    ['kanvas_control', { operation: 'video.control', sessionId: 's', displayId: 'd', requestId: 'r', expectedRevision: 1, command: { action: 'seek' } }],
    ['kanvas_control', { operation: 'video.control', sessionId: 's', displayId: 'd', requestId: 'r', expectedRevision: 1, command: { action: 'volume', value: 2 } }],
    ['kanvas_control', { operation: 'video.control', sessionId: 's', displayId: 'd', requestId: 'r', expectedRevision: 1, command: { action: 'rate', value: 0.1 } }],
    ['kanvas_publish', { operation: 'show', sessionId: 's', displayIds: ['d', 'd'], requestId: 'r', view: { version: 1, template: 'fact', data: { text: 'exact' } } }],
    ['kanvas_publish', { operation: 'show', sessionId: 's', displayIds: ['d'], requestId: 'r', actions: [{ id: 'pick', label: 'Choose', kind: 'choice' }], data: { text: 'exact' }, templateHint: 'fact' }],
    ['kanvas_publish', { operation: 'patch', sessionId: 's', displayId: 'd', requestId: 'r', expectedRevision: 1, operations: [{ op: 'set', path: '/data/text' }] }],
    ['kanvas_inspect', { operation: 'update.status', sessionId: 's' }],
    ['kanvas_inspect', { operation: 'update.status', sessionId: 's', requestId: 'r', updateId: 'u' }],
    ['kanvas_import', { operation: 'dataset.import', sessionId: 's', name: 'source', csv: 'a\n1', rows: [{ a: '1' }] }],
    ['kanvas_import', { operation: 'dataset.import', sessionId: 's', name: 'source' }],
    ['kanvas_configure', { operation: 'session.update', sessionId: 's', expectedRevision: 0, config: {} }],
    ['kanvas_configure', { operation: 'preferences.update', expectedRevision: 0, config: { style: 'not-a-preset' } }],
    ['kanvas_access', { operation: 'share.create', sessionId: 's', displayId: 'd', showOnDisplay: true }],
    ['kanvas_access', { operation: 'pairing.decide', sessionId: 's', pairingId: 'p', approve: true, confirm: false }],
  ] as const)('published schema rejects the same branch refinement as runtime: %s %j', (tool, args) => {
    expect(resolveToolCall('twelve', tool, args).error).toBeDefined();
    expect(validators.get(tool)!(args)).toBe(false);
  });

  it('documents byte-only checks and keeps enforcement before source ingestion', () => {
    const csv = '漢'.repeat(700000);
    const args = { operation: 'dataset.import', sessionId: 's', name: 'source', csv };
    expect(csv.length).toBeLessThan(2 * 1024 * 1024);
    expect(Buffer.byteLength(csv)).toBeGreaterThan(2 * 1024 * 1024);
    expect(resolveToolCall('twelve', 'kanvas_import', args).error).toBeDefined();
    const schema = publicTools.find(tool => tool.name === 'kanvas_import')!.inputSchema;
    expect(JSON.stringify(schema)).toContain('x-maxUtf8Bytes');
    // UTF-8 bytes are not a standard JSON Schema keyword. Host validation is
    // not the safety gate; the canonical validator enforces the advertised bound.
    expect(validators.get('kanvas_import')!(args)).toBe(true);
  });

  it.each(['https://example.com/status', 'https:example.com/status', 'HTTPS:/example.com/status'])('preserves safe URL normalization already accepted by monitoring: %s', url => {
    const input = { operation: 'start', sessionId: 's', displayId: 'd', requestId: 'r', expectedRevision: 0, config: { mode: 'uptime', url } };
    const { operation: _operation, ...canonical } = input;
    expect(resolveToolCall('legacy', 'kanvas_monitoring_start', canonical).error).toBeUndefined();
    expect(resolveToolCall('twelve', 'kanvas_monitor', input).error).toBeUndefined();
    expect(validators.get('kanvas_monitor')!(input)).toBe(true);
    for (const unsafe of ['http://example.com/status', 'https://example.com:8080/status', 'https://example.com/#fragment']) {
      expect(resolveToolCall('twelve', 'kanvas_monitor', { ...input, config: { ...input.config, url: unsafe } }).error).toBeDefined();
    }
  });

  it('uses conservative aggregate effects, not the safest operation of each group', () => {
    for (const tool of publicTools) {
      expect(tool.annotations?.readOnlyHint).toBe(tool.name === 'kanvas_inspect');
      expect(tool.annotations?.idempotentHint).toBe(['kanvas_inspect', 'kanvas_interactions'].includes(tool.name));
    }
    expect(publicTools.find(tool => tool.name === 'kanvas_access')!.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(publicTools.find(tool => tool.name === 'kanvas_capture')!.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    expect(publicTools.find(tool => tool.name === 'kanvas_monitor')!.annotations).toMatchObject({ destructiveHint: true, openWorldHint: true });
  });

  it('reduces actual description/schema bytes, without using tool-count as a token claim', () => {
    const bytes = (profile: 'legacy' | 'twelve') => Buffer.byteLength(JSON.stringify(listToolDefinitions(profile).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))));
    expect(bytes('twelve')).toBeLessThan(bytes('legacy'));
    // The expanded catalog adds account and group operations; retain a bounded current catalog and
    // compare like-for-like with all 110 flat operations, not the old 57-op snapshot.
    // New operations are feature growth: bound the average bytes per operation and the absolute size.
    expect(bytes('twelve') / OPERATION_ENTRIES.length).toBeLessThan(960);
    // The ceiling covers this round's drafting, planner, display-sync and account operations; the
    // per-operation average above is the primary guard against unbounded growth.
    expect(bytes('twelve')).toBeLessThan(116 * 1024);
    // Returned schemas/examples are detached; callers cannot poison later catalogs.
    const changed = listToolDefinitions('twelve');
    (changed[0].inputSchema.examples as unknown[]).push({ poison: true });
    expect(JSON.stringify(listToolDefinitions('twelve'))).not.toContain('poison');
  });

  it.each(['modern', 'legacy'] as const)('real %s SDK accepts the public schemas, strict selection and isolated canonical dispatch', async protocol => {
    server = await harness({ profile: 'twelve' });
    const connection = await server[protocol](server.service.issue('owner'));
    const listed = await connection.client.listTools();
    expect(listed.tools.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
    const result = await connection.client.callTool({ name: 'kanvas_inspect', arguments: { operation: 'session.state', sessionId: 'alpha' } });
    expect(result.isError).not.toBe(true);
    expect(server.service.calls.at(-1)).toMatchObject({ name: 'kanvas_session_state', args: { sessionId: 'alpha' }, userId: 'owner' });
    const callCount = server.service.calls.length;
    for (const call of [
      { name: 'kanvas_inspect', arguments: { sessionId: 'alpha' } },
      { name: 'kanvas_inspect', arguments: { operation: 'session.state', sessionId: 'alpha', name: 'Wrong branch' } },
      { name: 'kanvas_inspect', arguments: { operation: 'member.remove', sessionId: 'alpha' } },
      { name: 'kanvas_inspect', arguments: { operation: '__proto__', sessionId: 'alpha' } },
      { name: 'kanvas_session_state', arguments: { sessionId: 'alpha' } },
    ]) expect((await connection.client.callTool(call)).isError).toBe(true);
    expect(server.service.calls).toHaveLength(callCount);
    expect(namesIn(connection.client.getInstructions()).every(name => DISCOVERY_TOOL_NAMES.includes(name as never))).toBe(true);
    const templates = await connection.client.listResourceTemplates();
    expect(namesIn(templates).every(name => DISCOVERY_TOOL_NAMES.includes(name as never))).toBe(true);
  });
});

describe('profile-aware results preserve source data and route only trusted guidance', () => {
  for (const topic of GUIDE_TOPICS) it(`updates the ${topic} guide without obsolete callable names`, () => {
    const result = toolSuccess(guideFor(topic), undefined, 'kanvas_guide', 'twelve');
    expect(result.isError).not.toBe(true);
    expect(envelope(result).truncated).not.toBe(true);
    expect(namesIn(result).every(name => PUBLIC_TOOL_NAMES.includes(name as never))).toBe(true);
    if (topic === 'publishing') for (const recipe of (envelope(result).data as { recipes: { arguments: Record<string, unknown> }[] }).recipes) expect(resolveToolCall('twelve', 'kanvas_publish', recipe.arguments).error).toBeUndefined();
  });

  it('never rewrites arbitrary content that happens to name an old tool', () => {
    const source = { view: { data: { text: 'kanvas_submit 1.2300', labels: ['kanvas_template_get'] } }, reports: [{ description: 'Use kanvas_member_remove' }], interactions: [{ value: { readTool: 'kanvas_viewers_read' } }] };
    const result = toolSuccess(source, 's', 'kanvas_session_state', 'twelve');
    expect(envelope(result).data).toEqual(source);
    expect(envelope(result).orientation).toMatchObject({ guide: { tool: 'kanvas_inspect', operation: 'guide.get', topic: 'getting-started' } });
    const inbox = toolSuccess(source.interactions, 's', 'kanvas_interactions_read', 'twelve');
    expect(envelope(inbox).data).toEqual(source.interactions);
    expect(envelope(inbox).routing).toMatchObject({ read: { tool: 'kanvas_inspect', operation: 'interactions.read' } });
  });

  it('returns usable error/truncation routes while preserving bounded results', () => {
    const error = toolFailure(new InputError([{ path: 'description', problem: 'Maximum 12000 characters.' }], undefined, { schemaTool: 'kanvas_guide', topic: 'feedback' }), 'diagnostic-id', 'twelve');
    expect(envelope(error).error).toMatchObject({ code: 'INVALID_ARGUMENT', schemaTool: 'kanvas_inspect', schemaOperation: 'guide.get', topic: 'feedback', diagnosticId: 'diagnostic-id' });
    const large = toolSuccess({ rows: Array.from({ length: 2000 }, () => ({ text: 'kanvas_submit'.repeat(200) })) }, 's', 'kanvas_session_state', 'twelve');
    expect(large.structuredContent).toMatchObject({ truncated: true, interactionsTool: 'kanvas_inspect', interactionsOperation: 'interactions.read' });
    expect(Buffer.byteLength((large.content[0] as { text: string }).text)).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
    expect((envelope(large).data as { rows: { text: string }[] }).rows[0].text).toContain('kanvas_submit');
  });

  it('adapts deferred rendering guidance without rewriting stored records or literal content', () => {
    const failed = { id: 'u', status: 'failed', errorCode: 'INVALID_SOURCE_CONTENT', error: 'Inspect kanvas_template_get for the schema.', diagnosticId: 'd', metrics: { path: 'source' } };
    const original = structuredClone(failed);
    const expected = { ...failed, error: 'Inspect kanvas_inspect operation template.get for the schema.' };
    const source = { text: 'kanvas_template_get is literal content', error: 'kanvas_submit' };
    expect(envelope(toolSuccess(failed, 's', 'kanvas_update_status', 'twelve')).data).toEqual(expected);
    expect(envelope(toolSuccess({ view: { data: source }, latestUpdate: failed }, 's', 'kanvas_display_current', 'twelve')).data).toEqual({ view: { data: source }, latestUpdate: expected });
    const state = { displays: [{ view: { data: source } }], updates: [failed], reports: [{ description: 'kanvas_submit' }] };
    expect(envelope(toolSuccess(state, 's', 'kanvas_session_state', 'twelve')).data).toEqual({ ...state, updates: [expected] });
    expect(profileResourceData('kanvas://sessions/s/state', state, 'twelve')).toEqual({ ...state, updates: [expected] });
    expect(profileResourceData('kanvas://sessions/s/reports', state, 'twelve')).toBe(state);
    expect(envelope(toolSuccess(failed, 's', 'kanvas_update_status', 'legacy')).data).toBe(failed);
    expect(envelope(toolSuccess(failed, 's', 'kanvas_reports_read', 'twelve')).data).toBe(failed);
    expect(failed).toEqual(original);
  });
});
