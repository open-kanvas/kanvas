import { beforeAll, afterAll } from 'vitest';
import { profileInstructions } from '../../src/server/mcp/profile-guidance.js';
import { FIRST_DISPLAY_LINK_GUIDANCE } from '../../src/server/mcp/viewer-link-guidance.js';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { operationCatalog } from '../../src/server/mcp/discovery.js';
import { templateCatalog } from '../../src/server/mcp/discovery.js';
import { helpCatalog } from '../../src/server/mcp/discovery.js';
import { discoveryCatalog } from '../../src/server/mcp/discovery.js';
import { discoveryToolDefinitions } from '../../src/server/mcp/discovery.js';
import { workflowIds } from '../../src/server/mcp/workflow-guidance.js';
import { toolSuccess } from '../../src/server/mcp/results.js';
import { toolFailure } from '../../src/server/mcp/results.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { InputError } from '../../src/server/input-errors.js';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach } from 'vitest';
import { startHarness } from '../core/harness';
import type { Harness } from '../core/harness';
import { TASK_MAPPING } from './operation-fixtures.js';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical.js';
import { operationId } from '../../src/server/mcp/operations.js';
import { AGENT_CONDUCT } from '../../src/shared/philosophy.js';
import { RHYTHM_NUDGE } from '../../src/shared/philosophy.js';
import { KANVAS_VERSION } from '../../src/shared/version.js';

describe("guidance coverage 1", () => {

const context={principal:{userId:'test-account',scopes:['read','publish']}};
describe('contextual discovery and first contact',()=>{
 for(const template of ['planner','checklist','drafting','presentation','chat','progress','scoreboard','countdown'])it(`${template} workflow links name real callable operations and surface the complete family`,()=>{
  const ids=new Set(operationCatalog().map(x=>x.id));
   for(const id of workflowIds(template))expect(ids.has(id),id).toBe(true);
   const detail=templateCatalog().find(x=>x.id===`kanvas.template.${template}`)!.detail();expect(detail.relatedOperations).toHaveLength(workflowIds(template).length);expect(detail.submitShape).toContain('displayIds');
 // Presentation builds the full composite catalog (10.101s with two workers).
 // Keep every workflow assertion and leave ordinary template budgets unchanged.
 },template==='presentation'?30_000:10_000);
 it('first-contact queries find front-door help and submit is the canonical topic identity',()=>{
  const ids=helpCatalog().map(x=>x.id);expect(ids).toContain('kanvas.help.about');expect(ids).toContain('kanvas.help.what-is-kanvas');expect(ids).toContain('kanvas.help.submit');expect(ids).not.toContain('kanvas.help.publish');
  for(const query of ['about kanvas','what is kanvas']){const out=discoveryCatalog.query('help','search',{query,limit:5},context);expect(JSON.stringify(out.results)).toMatch(/kanvas.help.(about|what-is-kanvas)/);}
  expect(JSON.stringify(helpCatalog().find(x=>x.id==='kanvas.help.getting-started.steps')!.detail())).toContain('Human-facing first instruction');
  expect(JSON.stringify(discoveryToolDefinitions())).toContain('kanvas.help.about');expect(profileInstructions('discovery')).toContain('kanvas.help.about');expect(FIRST_DISPLAY_LINK_GUIDANCE).toContain('prefer the returned shortUrl');expect(profileInstructions('discovery')).not.toContain('Show literal returned viewer URLs on first use');
 });});
});

describe("guidance coverage 2", () => {

// 2026-11-10 (0875e953): guidance and orientation blocks are conditional by default. These tests verify the
// content and isolation of the full blocks, which are sent on every response under the declared 'full' preference.
const priorGuidanceDefault=process.env.KANVAS_GUIDANCE_DEFAULT;
beforeAll(()=>{process.env.KANVAS_GUIDANCE_DEFAULT='full';});
afterAll(()=>{if(priorGuidanceDefault===undefined)delete process.env.KANVAS_GUIDANCE_DEFAULT;else process.env.KANVAS_GUIDANCE_DEFAULT=priorGuidanceDefault;});
let h!:Harness,client:Client|LegacyClient;
afterEach(async()=>{await client?.close();await h?.close();});
it.each(['modern','legacy'])('%s repeats authorized distinct guidance on catalog and successful/failing calls without leaking another session',async era=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),s=await owner.session(),foreign=await other.session();
 const p={userId:owner.user!.id};await h.runtime.service.guidance.mutate(p,{scope:'session',sessionId:s.id,text:'Only publish when I ask in this session.',expectedRevision:0,requestId:'scope'},'set');
 await h.runtime.service.guidance.mutate({userId:other.user!.id},{scope:'session',sessionId:foreign.id,text:'PRIVATE FOREIGN GUIDANCE',expectedRevision:0,requestId:'foreign'},'set');
 const token=await h.runtime.auth.issueToken(owner.user!.id,'Disposable guidance regression',['read','publish']),headers={Authorization:'Bearer '+token.value};
 if(era==='modern'){client=new Client({name:'guidance-current',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
 else{client=new LegacyClient({name:'guidance-legacy',version:'1'});await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
 for(const args of [{catalog:'tools',action:'list'},{catalog:'tools',action:'search',query:'guidance'},{catalog:'tools',action:'get',id:'kanvas.guidance.read'},{catalog:'tools',action:'get',id:'nonexistent'}]){
  const result=await client.callTool({name:'kanvas_discover',arguments:args});expect(JSON.stringify(result)).toContain('agentGuidance');expect(JSON.stringify(result)).toContain('be proactive with Kanvas');
 }
 for(const [sessionId,expected] of [[s.id,true],[foreign.id,false]] as const){const result=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.session.state',arguments:{sessionId}}});expect(JSON.stringify(result).includes('Only publish when I ask')).toBe(expected);expect(JSON.stringify(result)).not.toContain('PRIVATE FOREIGN GUIDANCE');expect(JSON.stringify(result)).toContain('be proactive with Kanvas');}
 const malformed=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.flashcards.control',arguments:{sessionId:s.id}}});expect(malformed.isError).toBe(true);expect(JSON.stringify(malformed)).toContain('Only publish when I ask');
 const detail=(malformed.content as {text:string}[]).find(item=>item.text?.startsWith('{'));
 expect(detail).toBeDefined();expect(JSON.parse(detail!.text)).toEqual(malformed.structuredContent);
},30000);
});

describe("guidance coverage 3", () => {
    describe("guidance contracts", () => {
        let h!: Harness, client: Client | undefined;
        afterEach(async () => { await client?.close().catch(() => { }); client = undefined; await h?.close(); });
        const connect = async () => {
            h = await startHarness({ mcpProfile: 'discovery' });
            const owner = await h.account(), { value } = await h.runtime.auth.issueToken(owner.user!.id, 'Nov10 contract', ['read', 'publish']);
            client = new Client({ name: 'nov10-contract', version: '9.9.9' });
            await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers: { Authorization: `Bearer ${value}` } } }));
            return owner;
        };
        const use = async (id: string, args: Record<string, unknown>) => { const result = await client!.callTool({ name: 'kanvas_call', arguments: { operationId: id, arguments: args } }); return { error: result.isError === true, body: result.structuredContent as Record<string, any> }; };
        it('every new operation is discoverable by its id and callable; first contact is sent once', async () => {
            const owner = await connect(), session = await owner.session('Contract'), display = await owner.display(session.id);
            const exercised = new Set<string>();
            const first = await use('kanvas.session.state', { sessionId: session.id });
            exercised.add('state');
            expect(first.error).toBe(false);
            expect(first.body.firstContact.purpose).toBe(AGENT_CONDUCT);
            expect(first.body.agentGuidance.levels.length).toBeGreaterThan(0);
            expect(first.body.data.mode.current).toBe('live');
            expect(first.body.data.manage.displays.change).toContain('kanvas.display.register');
            const firstBytes = JSON.stringify(first.body).length;
            const second = await use('kanvas.session.state', { sessionId: session.id });
            expect(second.body.firstContact).toBeUndefined();
            expect(second.body.agentGuidance).toMatchObject({ unchanged: true });
            expect(second.body.orientation.help).toBe('kanvas.help.getting-started.steps');
            // A display connects: the receiver instructions are no longer repeated.
            const controller = new AbortController();
            await owner.raw(`/api/sessions/${session.id}/events?displayId=${display.id}&tabId=tv`, {}, { signal: controller.signal });
            const third = await use('kanvas.session.state', { sessionId: session.id });
            expect(third.body.orientation).toEqual({ guide: third.body.orientation.guide, help: 'kanvas.help.getting-started.steps' });
            expect(JSON.stringify(third.body).length).toBeLessThan(firstBytes * .75);
            const published = await use('kanvas.submit', { requestId: 'contract-task-list', sessionId: session.id, displayIds: [display.id], view: { version: 1, template: 'task-list', data: { items: [{ title: 'One' }, { title: 'Two' }] } } });
            expect(published.error).toBe(false);
            expect(published.body.rhythm).toBe(RHYTHM_NUDGE);
            expect((await use('kanvas.submit', { requestId: 'contract-fact', sessionId: session.id, displayIds: [display.id], view: { version: 1, template: 'fact', data: { text: 'Second' } } })).body.rhythm).toBeUndefined();
            const lists = await use('kanvas.tasklist.read', { sessionId: session.id });
            const taskListId = lists.body.data.taskLists[0].id;
            const calls: Record<string, Record<string, unknown>> = {
                "kanvas.tasklist.read": { sessionId: session.id, taskListId, item: 1 },
                "kanvas.tasklist.update": { sessionId: session.id, taskListId, requestId: 'contract-check', check: [1] },
                "kanvas.tasklist.show": { sessionId: session.id, taskListId, displayId: display.id, requestId: 'contract-show' },
                "kanvas.agents.read": {},
                "kanvas.fonts.list": { category: 'mono' },
                "kanvas.monitor.stream.create": { sessionId: session.id, name: 'Contract', requestId: 'contract-stream' },
            };
            for (const [canonical, args] of Object.entries(calls)) {
                const result = await use(operationId(canonical), args);
                expect(result.error, `${canonical}: ${JSON.stringify(result.body).slice(0, 300)}`).toBe(false);
                exercised.add(canonical);
                calls[canonical] = result.body.data;
            }
            const streamId = (calls["kanvas.monitor.stream.create"] as {
                streamId: string;
            }).streamId;
            for (const [canonical, args] of [["kanvas.monitor.stream.read", { sessionId: session.id, streamId }], ["kanvas.monitor.stream.revoke", { sessionId: session.id, streamId }]] as const) {
                const result = await use(operationId(canonical), args);
                expect(result.error, canonical).toBe(false);
                exercised.add(canonical);
            }
            const agents = calls["kanvas.agents.read"] as {
                agents: {
                    agentId: string;
                    thisConnection?: boolean;
                    name: string;
                }[];
            };
            expect(agents.agents.some(agent => agent.thisConnection)).toBe(true);
            // Declared refusals are still the operation answering: own connection cannot be revoked, friction is for administrators,
            // and with no outside network in tests the icon search answers that its sets are unavailable.
            const revoke = await use('kanvas.agents.revoke', { agentId: agents.agents.find(agent => agent.thisConnection)!.agentId, confirm: true });
            expect(revoke.error).toBe(true);
            expect(revoke.body.error.code).toBe('INVALID_ARGUMENT');
            exercised.add("kanvas.agents.revoke");
            const friction = await use('kanvas.friction.read', { kind: 'validation' });
            expect(friction.error).toBe(true);
            expect(friction.body.error.code).toBe('FORBIDDEN');
            exercised.add("kanvas.friction.read");
            h.runtime.service.pickers.fetcher = async () => { throw new Error('no outside network in tests'); };
            const icons = await use('kanvas.icons.search', { query: 'settings' });
            expect(icons.error).toBe(false);
            expect(icons.body.data.unavailableSets).toHaveLength(5);
            exercised.add("kanvas.icons.search");
            expect([...exercised].filter(name => name.startsWith('kanvas.')).sort()).toEqual(TASK_MAPPING.map(([name]) => name).sort());
            for (const [name] of TASK_MAPPING)
                expect(CANONICAL_TOOLS.some(tool => tool.name === name), name).toBe(true);
            controller.abort();
        }, 30000);
    });
});
