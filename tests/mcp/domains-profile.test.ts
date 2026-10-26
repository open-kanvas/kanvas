import { operationRequest } from './requests.js';
import { DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical.js';
import { listToolDefinitions, resolveToolCall } from '../../src/server/mcp/catalog.js';
import { DOMAIN_OPERATION_ENTRIES, DOMAIN_REGISTRY, DOMAIN_TOOL_NAMES, OPERATION_ENTRIES, OPERATION_REGISTRY, mcpProfile, publicGuidanceText, publicReference } from '../../src/server/mcp/operations.js';
import { profileInstructions } from '../../src/server/mcp/profile-guidance.js';
import type { DisplayRecord, SessionRecord } from '../../src/shared/types.js';
import { ORIGIN, fact, startHarness, type Harness } from '../core/harness.js';

// Reports #13 (resource/domain grouping with discoverable names) and #27
// (session history vs session gallery must not be confusable).
const harnesses: Harness[] = [];
const clients: Client[] = [];
afterEach(async () => {
  await Promise.allSettled(clients.map(client => client.close())); clients.length = 0;
  for (const h of harnesses.reverse()) await h.close(); harnesses.length = 0;
});

describe('domains profile catalog', () => {
  it('is the default profile and groups every canonical operation exactly once into 30-50 resource tools', () => {
    expect(mcpProfile()).toBe('discovery');
    expect(DOMAIN_TOOL_NAMES.length).toBeGreaterThanOrEqual(30);
    expect(DOMAIN_TOOL_NAMES.length).toBeLessThanOrEqual(50);
    const canonical = CANONICAL_TOOLS.map(tool => tool.name).sort();
    expect(DOMAIN_OPERATION_ENTRIES.map(entry => entry.canonical).sort()).toEqual(canonical);
    // No kitchen-sink tool: the largest group stays small enough to scan.
    expect(Math.max(...DOMAIN_TOOL_NAMES.map(name => Object.keys(DOMAIN_REGISTRY[name]).length))).toBeLessThanOrEqual(10);
    const tools = listToolDefinitions('domains');
    expect(tools.map(tool => tool.name)).toEqual([...DOMAIN_TOOL_NAMES]);
    expect(tools.every(tool => tool.name.startsWith('kanvas_') && tool.inputSchema.required?.includes('operation'))).toBe(true);
    // Eight requested guidance/browser-auth/invite/overview operations: bounded catalog growth.
    // Group size and exhaustive mapping guards above remain unchanged.
    // Ten new operations; retain max10 per resource group and bounded per-operation growth.
    expect(JSON.stringify(tools).length/CANONICAL_TOOLS.length).toBeLessThan(1000);
    // Two added operations plus optional client context on five existing inputs
    // and device metadata increase the total contract. Keep both the max10
    // resource guard and unchanged <1000 bytes/operation guard above.
    expect(JSON.stringify(tools).length).toBeLessThan(155_000);
  });

  it('keeps kanvas_feedback byte-for-byte identical to the former profile', () => {
    expect(DOMAIN_REGISTRY.kanvas_feedback).toEqual(OPERATION_REGISTRY.kanvas_feedback);
    const domain = listToolDefinitions('domains').find(tool => tool.name === 'kanvas_feedback');
    const twelve = listToolDefinitions('twelve').find(tool => tool.name === 'kanvas_feedback');
    expect(JSON.stringify(domain)).toBe(JSON.stringify(twelve));
    for (const operation of ['submit', 'error.report', 'report.update']) {
      const args = operation === 'report.update' ? { operation, reportId: 'r', expectedRevision: 0, status: 'resolved', note: 'Verified.', sessionId: 's' } : { operation, requestId: 'x', title: 'T', description: 'D', sessionId: 's' };
      const resolved = resolveToolCall('domains', 'kanvas_feedback', args);
      expect(resolved.error).toBeUndefined();
      expect(resolved.canonicalName).toBe(OPERATION_REGISTRY.kanvas_feedback[operation as keyof typeof OPERATION_REGISTRY.kanvas_feedback]);
    }
  });

  it('separates session history, session gallery and per-display revisions by name (#27)', () => {
    expect(publicReference('kanvas_sessions_list', 'domains')).toEqual({ tool: 'kanvas_session_history', operation: 'list' });
    expect(publicReference('kanvas_session_overview', 'domains')).toEqual({ tool: 'kanvas_session_gallery', operation: 'read' });
    expect(publicReference('kanvas_display_history', 'domains')).toEqual({ tool: 'kanvas_display_revisions', operation: 'list' });
    expect(publicReference('kanvas_display_navigate', 'domains')).toEqual({ tool: 'kanvas_display_revisions', operation: 'go' });
    const tools = listToolDefinitions('domains');
    const history = tools.find(tool => tool.name === 'kanvas_session_history')!;
    const gallery = tools.find(tool => tool.name === 'kanvas_session_gallery')!;
    expect(history.description).toMatch(/^SESSION HISTORY/);
    expect(gallery.description).toMatch(/^SESSION GALLERY/);
    // Only one tool name contains "history".
    expect(DOMAIN_TOOL_NAMES.filter(name => name.includes('history'))).toEqual(['kanvas_session_history']);
    expect(profileInstructions('domains')).toContain('kanvas_session_history');
    expect(profileInstructions('domains')).toContain('kanvas_account operation start');
    expect(publicGuidanceText('Use kanvas_sessions_list first.', 'domains')).toBe('Use kanvas_session_history operation list first.');
    expect(publicGuidanceText('Use kanvas_sessions_list first.', 'twelve')).toBe('Use kanvas_inspect operation sessions.list first.');
    // Authored guidance in the former form is translated, and translation is idempotent.
    const translated = publicGuidanceText('Read kanvas_inspect operation session.state, then navigation.control; file with kanvas_feedback submit. See data.json and https://kanvas.example/docs.', 'domains');
    expect(translated).toBe('Read kanvas_session operation state, then kanvas_view_navigation control; file with kanvas_feedback submit. See data.json and https://kanvas.example/docs.');
    expect(publicGuidanceText(translated, 'domains')).toBe(translated);
    expect(publicGuidanceText('kanvas_presentation autoplay.read and kanvas_session_end operation end', 'domains')).toBe('kanvas_presentation autoplay.read and kanvas_session_end operation end');
  });

  it('derives honest annotations per resource tool', () => {
    const byName = new Map(listToolDefinitions('domains').map(tool => [tool.name, tool.annotations]));
    expect(byName.get('kanvas_session_history')).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    expect(byName.get('kanvas_account')).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.get('kanvas_display_clear')).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.get('kanvas_session_end')).toMatchObject({ destructiveHint: true });
    expect(byName.get('kanvas_feed')).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.get('kanvas_feedback')).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
  });

  it('still accepts every former twelve-profile call (hidden compatibility for cached hosts)', () => {
    for (const entry of OPERATION_ENTRIES) {
      const resolved = resolveToolCall('domains', entry.tool, { operation: entry.operation });
      // Arguments are deliberately empty: routing must succeed even when the
      // canonical schema then rejects missing fields.
      expect(resolved.canonicalName, `${entry.tool} ${entry.operation}`).toBe(entry.canonical);
    }
    const unknown = resolveToolCall('domains', 'kanvas_nope', {});
    expect(unknown.error?.issues[0].problem).toContain('kanvas_session_history');
    expect(resolveToolCall('twelve', 'kanvas_session_history', { operation: 'list' }).error).toBeDefined();
  });
});

describe('domains profile over HTTP', () => {
  it('runs a session/display/publish/history/gallery/feedback workflow with domain names and former names', async () => {
    const h = await startHarness({ mcpProfile: 'domains' }); harnesses.push(h);
    const owner = await h.account();
    const token = await h.runtime.auth.issueToken(owner.user!.id, 'Domains acceptance', ['read', 'publish']);
    const client = new Client({ name: 'domains-acceptance', version: '1' }); client.onerror = () => {}; clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers: { Authorization: `Bearer ${token.value}` } } }));
    const listed = (await client.listTools()).tools.map(tool => tool.name);
    expect(listed).toEqual([...DISCOVERY_TOOL_NAMES]);
    expect(listed).not.toContain('kanvas_inspect');
    const call = async (name: string, operation: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool(operationRequest({ name, arguments: { operation, ...args } })) as { isError?: boolean; structuredContent: Record<string, unknown> };
      return result;
    };
    const data = <T>(result: { isError?: boolean; structuredContent: Record<string, unknown> }) => { expect(result.isError, JSON.stringify(result.structuredContent).slice(0, 300)).toBeFalsy(); return result.structuredContent.data as T; };
    const session = data<SessionRecord>(await call('kanvas_session', 'create', { name: 'Domains workflow' }));
    const display = data<DisplayRecord>(await call('kanvas_display', 'register', { sessionId: session.id, name: 'Main', width: 1000, height: 700 }));
    expect(display.viewerUrl).toBe(`${ORIGIN}/view/${session.id}/${display.id}`);
    const shown = await call('kanvas_publish', 'show', { sessionId: session.id, requestId: 'domains-show', displayIds: [display.id], view: fact('Hello from the domains profile') });
    data(shown);
    // Publication is asynchronous; read this profile's status operation until terminal.
    await vi.waitFor(async () => expect(data<{ status: string }>(await call('kanvas_publish', 'status', { sessionId: session.id, requestId: 'domains-show' })).status).toBe('prepared'), { timeout: 5000, interval: 50 });
    const current = data<DisplayRecord>(await call('kanvas_display', 'current', { sessionId: session.id, displayId: display.id }));
    expect(current.view?.data.text).toBe('Hello from the domains profile');
    const history = data<unknown>(await call('kanvas_session_history', 'list'));
    expect(JSON.stringify(history)).toContain(session.id);
    const gallery = data<{ entries?: unknown[]; views?: unknown[] }>(await call('kanvas_session_gallery', 'read', { sessionId: session.id }));
    expect(JSON.stringify(gallery)).toContain('Hello from the domains profile');
    const revisions = data<{ entries: { revision: number }[] }>(await call('kanvas_display_revisions', 'list', { sessionId: session.id, displayId: display.id }));
    expect(revisions.entries.map(entry => entry.revision)).toContain(current.revision);
    // Former name, same operation: still routed.
    const former = data<DisplayRecord>(await call('kanvas_inspect', 'display.current', { sessionId: session.id, displayId: display.id }));
    expect(former.revision).toBe(current.revision);
    // Server-authored guidance uses this profile's names.
    const failed = await call('kanvas_display', 'current', { sessionId: session.id });
    expect(failed.isError).toBe(true);
    expect((failed.structuredContent.docs as { help: { tool: string; operation: string } }).help).toMatchObject({ tool: 'kanvas_discover', arguments: {catalog:'help',action:'get',id:'kanvas.help.recovery'} });
    // kanvas_feedback: same name, operations and arguments as before.
    const report = data<{ id: string; revision: number }>(await call('kanvas_feedback', 'submit', { sessionId: session.id, requestId: 'domains-report', title: 'Domains check', description: 'Filed through the unchanged feedback tool.' }));
    const updated = data<{ status: string; revision: number }>(await call('kanvas_feedback', 'report.update', { sessionId: session.id, reportId: report.id, expectedRevision: report.revision, status: 'resolved', note: 'Verified in the domains profile test.' }));
    expect(updated).toMatchObject({ status: 'resolved', revision: report.revision + 1 });
    const reports = data<{ reports: { id: string }[] }>(await call('kanvas_reports', 'read', { sessionId: session.id }));
    expect(reports.reports.some(entry => entry.id === report.id)).toBe(true);
    const help = data<unknown>(await call('kanvas_help', 'read', { topic: 'navigation' }));
    expect(JSON.stringify(help)).toContain('kanvas.navigation');
    expect(JSON.stringify(help)).not.toContain('kanvas_control');
    const server = shown.structuredContent.server as { profile: string; tools: number; operations: number };
    expect(server).toMatchObject({ profile: 'discovery', tools: 2, operations: CANONICAL_TOOLS.length - 3 });
  });

  it('documents the domain names publicly with a former-name map', async () => {
    const h = await startHarness({ mcpProfile: 'domains' }); harnesses.push(h);
    const index = await (await fetch(`${h.baseUrl}/docs/index.json`)).json() as { profile: string; tools: { name: string }[] };
    expect(index.profile).toBe('discovery');
    expect(index.tools.map(tool => tool.name)).toEqual([...DISCOVERY_TOOL_NAMES]);
    const reference = await (await fetch(`${h.baseUrl}/docs/reference.md`)).text();
    expect(reference).toContain('## kanvas.sessions.list');
    expect(reference).toContain('kanvas_discover');
    expect((await fetch(`${h.baseUrl}/docs/operations/kanvas_discover.json`)).status).toBe(200);
    const navigation = await (await fetch(`${h.baseUrl}/docs/navigation.md`)).text();
    expect(navigation).toContain('kanvas_call');
    expect(navigation).not.toContain('kanvas_control');
    expect((await fetch(`${h.baseUrl}/docs/operations/kanvas.planner.read.json`)).status).toBe(200);
  });
});
