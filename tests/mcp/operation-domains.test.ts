import { operationRequest } from './requests.js';
import { DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical.js';
import { listToolDefinitions, resolveToolCall } from '../../src/server/mcp/catalog.js';
import { operationTable, mcpProfile, publicGuidanceText, publicReference } from '../../src/server/mcp/operations.js';
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

describe('public operation domains', () => {
    it('defaults to two wire tools and groups each executable public ID exactly once', () => {
        expect(mcpProfile()).toBe('discovery');
        const table=operationTable(),ids=CANONICAL_TOOLS.filter(definition=>!['kanvas.help','kanvas.guide','kanvas.template.get'].includes(definition.name)).map(definition=>definition.name);
        expect([...table.keys()].sort()).toEqual(ids.sort());
        expect(listToolDefinitions().map(tool=>tool.name)).toEqual([...DISCOVERY_TOOL_NAMES]);
        expect(new Set([...table.values()].map(operation=>operation.domain)).size).toBeGreaterThan(1);
        expect(JSON.stringify(listToolDefinitions()).length).toBeLessThan(9000);
    });
    it('uses the feedback definitions directly rather than a second profile schema', () => {
        for(const [operationId,args] of [
          ['kanvas.feedback.submit',{requestId:'feedback',title:'Title',description:'Description'}],
          ['kanvas.error.report',{requestId:'error',title:'Title',description:'Description'}],
          ['kanvas.report.update',{reportId:'r',expectedRevision:0,status:'resolved',note:'Verified.',sessionId:'s'}],
        ] as const){
          const operation=operationTable().get(operationId)!;
          expect(operation.schema).toBe(CANONICAL_TOOLS.find(definition=>definition.name===operationId)!.schema);
          const resolved=resolveToolCall('discovery','kanvas_call',{operationId,arguments:args});
          expect(resolved.error).toBeUndefined();expect(resolved.canonicalName).toBe(operationId);
        }
    });
    it('distinguishes session history, content gallery and per-display revisions by public ID', () => {
        for(const id of ['kanvas.sessions.list','kanvas.session.overview','kanvas.display.history','kanvas.display.navigate']){
          expect(publicReference(id)).toEqual({tool:'kanvas_call',operation:id});
          expect(operationTable().get(id)?.definition.name).toBe(id);
        }
        expect(operationTable().get('kanvas.sessions.list')!.definition.discovery.hint).toContain('Session history');
        expect(operationTable().get('kanvas.session.overview')!.definition.discovery.hint).toMatch(/gallery|overview/i);
        expect(profileInstructions('discovery')).toContain('kanvas.session.start');
        const source='kanvas_sessions_list and kanvas_inspect are literal source text, not callable aliases.';
        expect(publicGuidanceText(source)).toBe(source);
    });
    it('derives honest annotations on individual operations, not broad grouped tools', () => {
        const annotations=(id:string)=>operationTable().get(id)!.annotations;
        expect(annotations('kanvas.sessions.list')).toMatchObject({readOnlyHint:true,destructiveHint:false,idempotentHint:true});
        expect(annotations('kanvas.displays.clear')).toMatchObject({readOnlyHint:false,destructiveHint:true});
        expect(annotations('kanvas.session.end')).toMatchObject({destructiveHint:true});
        // An omitted requestId intentionally creates a new report; a stable explicit ID deduplicates retries.
        expect(annotations('kanvas.feedback.submit')).toMatchObject({readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false});
    });
    it('rejects former grouped and flat callable names instead of installing hidden aliases', () => {
        for(const name of ['kanvas_session_history','kanvas_inspect','kanvas_feedback','kanvas_session_state','kanvas.session.state'])
          expect(resolveToolCall('discovery',name,{operation:'state',sessionId:'s'}).error?.issues[0].path).toBe('tool');
        expect(resolveToolCall('discovery','kanvas_call',{operationId:'kanvas.nope',arguments:{}}).error?.issues[0].path).toBe('operationId');
    });
});

describe('public domain workflows over HTTP', () => {
    it('runs the session/display/publish/history/gallery/feedback workflow through public IDs', async () => {
        const h = await startHarness({ mcpProfile: "discovery" });
        harnesses.push(h);
        const owner = await h.account();
        const token = await h.runtime.auth.issueToken(owner.user!.id, 'Domains acceptance', ['read', 'publish']);
        const client = new Client({ name: 'domains-acceptance', version: '1' });
        client.onerror = () => { };
        clients.push(client);
        await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers: { Authorization: `Bearer ${token.value}` } } }));
        const listed = (await client.listTools()).tools.map(tool => tool.name);
        expect(listed).toEqual([...DISCOVERY_TOOL_NAMES]);
        expect(listed).not.toContain('kanvas_inspect');
        const call = async (name: string, operation: string, args: Record<string, unknown> = {}) => {
            const result = await client.callTool(operationRequest({ name, arguments: { operation, ...args } })) as {
                isError?: boolean;
                structuredContent: Record<string, unknown>;
            };
            return result;
        };
        const data = <T>(result: {
            isError?: boolean;
            structuredContent: Record<string, unknown>;
        }) => { expect(result.isError, JSON.stringify(result.structuredContent).slice(0, 300)).toBeFalsy(); return result.structuredContent.data as T; };
        const session = data<SessionRecord>(await call("kanvas_call", "kanvas.session.create", { name: 'Domains workflow' }));
        const display = data<DisplayRecord>(await call("kanvas_call", "kanvas.display.register", { sessionId: session.id, name: 'Main', width: 1000, height: 700 }));
        expect(display.viewerUrl).toBe(`${ORIGIN}/view/${session.id}/${display.id}`);
        const shown = await call("kanvas_call", "kanvas.publish", { sessionId: session.id, requestId: 'domains-show', displayIds: [display.id], view: fact('Hello from the domains profile') });
        data(shown);
        // Publication is asynchronous; read this profile's status operation until terminal.
        await vi.waitFor(async () => expect(data<{
            status: string;
        }>(await call("kanvas_call", "kanvas.update.status", { sessionId: session.id, requestId: 'domains-show' })).status).toBe('prepared'), { timeout: 5000, interval: 50 });
        const current = data<DisplayRecord>(await call("kanvas_call", "kanvas.display.current", { sessionId: session.id, displayId: display.id }));
        expect(current.view?.data.text).toBe('Hello from the domains profile');
        const history = data<unknown>(await call("kanvas_call", "kanvas.sessions.list"));
        expect(JSON.stringify(history)).toContain(session.id);
        const gallery = data<{
            entries?: unknown[];
            views?: unknown[];
        }>(await call("kanvas_call", "kanvas.session.overview", { sessionId: session.id }));
        expect(JSON.stringify(gallery)).toContain('Hello from the domains profile');
        const revisions = data<{
            entries: {
                revision: number;
            }[];
        }>(await call("kanvas_call", "kanvas.display.history", { sessionId: session.id, displayId: display.id }));
        expect(revisions.entries.map(entry => entry.revision)).toContain(current.revision);
        // The same discovered operation reads the retained revision without mutation.
        const former = data<DisplayRecord>(await call("kanvas_call", "kanvas.display.current", { sessionId: session.id, displayId: display.id }));
        expect(former.revision).toBe(current.revision);
        // Server-authored recovery guidance names the actual public tool.
        const failed = await call("kanvas_call", "kanvas.display.current", { sessionId: session.id });
        expect(failed.isError).toBe(true);
        expect((failed.structuredContent.docs as {
            help: {
                tool: string;
                operation: string;
            };
        }).help).toMatchObject({ tool: 'kanvas_discover', arguments: { catalog: 'help', action: 'get', id: 'kanvas.help.recovery' } });
        // Feedback remains available through its public operation IDs.
        const report = data<{
            id: string;
            revision: number;
        }>(await call("kanvas_call", "kanvas.feedback.submit", { sessionId: session.id, requestId: 'domains-report', title: 'Domains check', description: 'Filed through the unchanged feedback tool.' }));
        const updated = data<{
            status: string;
            revision: number;
        }>(await call("kanvas_call", "kanvas.report.update", { sessionId: session.id, reportId: report.id, expectedRevision: report.revision, status: 'resolved', note: 'Verified in the domains profile test.' }));
        expect(updated).toMatchObject({ status: 'resolved', revision: report.revision + 1 });
        const reports = data<{
            reports: {
                id: string;
            }[];
        }>(await call("kanvas_call", "kanvas.reports.read", { sessionId: session.id }));
        expect(reports.reports.some(entry => entry.id === report.id)).toBe(true);
        const help = data<unknown>(await client.callTool({name:'kanvas_discover',arguments:{catalog:'help',action:'get',id:'kanvas.help.navigation.within-view'}}) as any);
        expect(JSON.stringify(help)).toContain('kanvas.navigation');
        expect(JSON.stringify(help)).not.toContain('kanvas_control');
        const server = shown.structuredContent.server as {
            profile: string;
            tools: number;
            operations: number;
        };
        expect(server).toMatchObject({ profile: 'discovery', tools: 2, operations: CANONICAL_TOOLS.length - 3 });
    });
    it('documents public operation IDs and the two wire tools', async () => {
        const h = await startHarness({ mcpProfile: "discovery" });
        harnesses.push(h);
        const index = await (await fetch(`${h.baseUrl}/docs/index.json`)).json() as {
            profile: string;
            tools: {
                name: string;
            }[];
        };
        expect(index.profile).toBe('discovery');
        expect(index.tools.map(tool => tool.name)).toEqual([...DISCOVERY_TOOL_NAMES]);
        const reference = await (await fetch(`${h.baseUrl}/docs/reference.md`)).text();
        expect(reference).toContain('## kanvas.sessions.list');
        expect(reference).toContain('kanvas_discover');
        expect((await fetch(`${h.baseUrl}/docs/operations/kanvas_discover.json`)).status).toBe(200);
        const navigation = await (await fetch(`${h.baseUrl}/docs/navigation.within-view.md`)).text();
        expect(navigation).toContain('kanvas_call');
        expect(navigation).not.toContain('kanvas_control');
        expect((await fetch(`${h.baseUrl}/docs/operations/kanvas.planner.read.json`)).status).toBe(200);
    });
});
