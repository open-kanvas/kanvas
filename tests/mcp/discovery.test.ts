import { profileResultData, interactionRoutes } from '../../src/server/mcp/profile-guidance.js';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { CANONICAL_TOOLS, parseCanonicalArguments } from '../../src/server/mcp/canonical.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { DiscoveryCatalog, BUILTIN_PROVIDERS, canonicalForOperation, discoveryCatalog, discoveryToolDefinitions, helpCatalog, operationCatalog, templateCatalog, parseDiscoveryInput, SEARCH_RESULT_BYTES, discoveryResult, CATALOG_ONLY_CANONICAL, type CatalogProvider } from '../../src/server/mcp/discovery.js';
import { DISCOVERY_TOOL_NAMES, DOMAIN_OPERATION_ENTRIES, OPERATION_ENTRIES, operationId, profileScope, publicExample, publicGuidanceText } from '../../src/server/mcp/operations.js';
import { LocalSearch } from '../../src/server/mcp/local-search.js';
import { TOOL_DISCOVERY } from '../../src/server/mcp/tool-discovery.js';
import { HELP_TOPICS } from '../../src/shared/help.js';
import { GUIDE_TOPICS } from '../../src/server/mcp/guide.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
const context = { principal: { userId: 'account-a', scopes: ['read', 'publish'] } };
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });

describe('two-tool discoverable catalog', () => {
  it('publishes only two compact fixed schemas with conservative dispatcher annotations', () => {
    const definitions = discoveryToolDefinitions();
    expect(definitions.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
    expect(JSON.stringify(definitions).length).toBeLessThan(9000);
    for (const definition of definitions) { ajv.compile(definition.inputSchema); expect(definition.annotations?.readOnlyHint).toBe(definition.name !== 'kanvas_call'); }
    expect(definitions.at(-1)?.annotations).toMatchObject({ destructiveHint: true, openWorldHint: true, idempotentHint: false });
  });
  it('covers every canonical and formerly nested operation exactly once; aliases do not create duplicate search hits', () => {
    const catalog = operationCatalog();
    expect(catalog.length).toBeGreaterThan(100);
    expect(catalog.map(item => canonicalForOperation(item.id)).sort()).toEqual(CANONICAL_TOOLS.filter(tool => !CATALOG_ONLY_CANONICAL.has(tool.name)).map(tool => tool.name).sort());
    expect(new Set(catalog.map(item => item.id)).size).toBe(catalog.length);
    for (const entry of [...DOMAIN_OPERATION_ENTRIES, ...OPERATION_ENTRIES].filter(entry => !CATALOG_ONLY_CANONICAL.has(entry.canonical))) expect(canonicalForOperation(operationId(entry.canonical))).toBe(entry.canonical);
  });
  it('every operation exposes a complete schema and executable examples passing both JSON Schema and unchanged canonical validators', () => {
    for (const item of operationCatalog()) {
      const detail = item.detail(), canonical = canonicalForOperation(item.id)!;
      const validate = ajv.compile(detail.inputSchema as object);
      const examples = detail.examples as { tool: string; arguments: { operationId: string; arguments: Record<string, unknown> } }[];
      expect(examples.length, item.id).toBeGreaterThan(0);
      expect(detail.annotations).toBeDefined();
      for (const example of examples) {
        expect(example.tool).toBe('kanvas_call');
        expect(validate(example.arguments.arguments), `${item.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
        expect(parseCanonicalArguments(canonical, example.arguments.arguments), item.id).toBeDefined();
        const routed = resolveToolCall('discovery', example.tool, example.arguments);
        expect(routed.error, item.id).toBeUndefined();
        expect(routed.canonicalName).toBe(canonical);
        const legacy = resolveToolCall('legacy', canonical, example.arguments.arguments).args;
        if (routed.args?.requestId && !example.arguments.arguments.requestId) { expect(routed.args.requestId).toEqual(expect.any(String)); expect({ ...routed.args, requestId: undefined }).toEqual({ ...legacy, requestId: undefined }); }
        else expect(routed.args).toEqual(legacy);
        expect(routed.reference).toEqual({ tool: 'kanvas_call', operation: item.id });
      }
    }
  });
  it('returns default top five summaries without materializing detail; get alone returns full detail', () => {
    const input = parseDiscoveryInput('kanvas_discover', { catalog: 'tools', action: 'search', query: 'display' });
    const response = discoveryCatalog.query('tool', 'search', input, context);
    expect(response.returned).toBe(5);
    expect(response).toEqual(discoveryCatalog.query('tool', 'search', input, context));
    expect(response.nextCursor).toEqual(expect.any(String));
    for (const item of response.results as Record<string, unknown>[]) expect(Object.keys(item).sort()).toEqual(['description', 'id']);
    const exact = discoveryCatalog.query('tool', 'get', { id: 'kanvas.checklist.show' }, context);
    expect(exact.entry).toHaveProperty('inputSchema');
    expect(exact.entry).toHaveProperty('examples');
    expect(discoveryCatalog.query('tool', 'search', { query: 'qzxunrelatedgibberish' }, context).results).toEqual([]);
    expect(() => discoveryCatalog.query('tool', 'get', { id: 'checklist show' }, context)).toThrow();
    for (const id of ['kanvas.help','kanvas.guide','kanvas.template.get']) expect(canonicalForOperation(id)).toBeUndefined();
  });
  it('retrieves related wording, paraphrases and misspellings with useful rankings', () => {
    const search = new LocalSearch(operationCatalog());
    const cases = [
      ['bring a saved tick list onto a different monitor', 'kanvas.checklist.show'],
      ['enlarge the typography', 'kanvas.config.update'],
      ['take a screenshot with native browser consent', 'kanvas.display.request.capture'],
      ['undo to a previous retained screen', 'kanvas.display.navigate'],
      ['automatically advance my slideshow', 'kanvas.autoplay.control'],
      ['grant a colleague access with an invitation', 'kanvas.invite.create'],
      ['ingest excel csv rows', 'kanvas.dataset.import'],
      ['halt public source polling', 'kanvas.monitoring.stop'],
      ['cheklist saved items', 'kanvas.checklist.read'],
      ['sessoin state', 'kanvas.session.state'],
    ];
    for (const [query, expected] of cases) expect(search.search(query).slice(0, 5).map(row => row.document.id), query).toContain(expected);
    expect(search.search('actual browser screen capture')[0].document.id).toBe('kanvas.display.request.capture');
  });
  it('lists every entry as concise plain text by default, with no structured JSON duplication', () => {
    for (const [catalog, kind] of [['tools','tool'],['help','help'],['templates','template']] as const) {
      const result = discoveryResult('kanvas_discover', { catalog, action: 'list' }, context);
      expect(result.structuredContent).toBeUndefined();
      const text = (result.content[0] as { text: string }).text;
      const lines = text.split('\n').filter(line => line.includes(' — '));
      expect(lines.length).toBe(discoveryCatalog.list(kind, context).length);
      expect(lines.map(line => line.split(' — ')[0])).toEqual(discoveryCatalog.list(kind, context).map(item => item.id));
      expect(text).toContain('(complete)'); expect(text).not.toContain('cursor=');
    }
  });
  it('rejects invalid action fields, facets, aliases and unsafe dispatcher inputs', () => {
    for (const raw of [
      { catalog: 'tools', action: 'search', query: '' }, { catalog: 'tools', action: 'search', query: 'x', limit: 21 },
      { catalog: 'tools', action: 'search', query: 'x', injected: true }, { catalog: 'tools', action: 'search', query: 'x'.repeat(501) },
      { catalog: 'help', action: 'list', type: 'guide' }, { catalog: 'help', action: 'list', limit: 1 },
      { catalog: 'schema', action: 'list' }, { catalog: 'tools', action: 'get', id: 'kanvas.submit', query: 'x' },
    ]) expect(() => parseDiscoveryInput('kanvas_discover', raw)).toThrow();
    for (const operationId of ['__proto__', 'constructor', '../kanvas.session.state', 'kanvas.execute', 'kanvas.session.state;eval','kanvas.guide','kanvas.help','kanvas.template.get']) expect(resolveToolCall('discovery', 'kanvas_call', { operationId, arguments: {} }).error).toBeDefined();
    expect(resolveToolCall('discovery', 'kanvas_call', { operationId: 'kanvas.session.state', arguments: { sessionId: 'x', extra: true } }).error).toBeDefined();
    for (const name of ['kanvas_arbitrary_eval','kanvas_tool_use','kanvas_tool_search','kanvas_help_index','kanvas_submit','kanvas_publish']) expect(resolveToolCall('discovery', name, {}).error).toBeDefined();
  });
  it('covers all actual built-in templates with full schema, valid view examples and executable publication wrappers', () => {
    expect(templateCatalog().map(item => item.id).sort()).toEqual(TEMPLATE_IDS.map(id => `kanvas.template.${id}`).sort());
    for (const item of templateCatalog()) {
      const detail = item.detail(), validate = ajv.compile(detail.schema as object);
      expect(validate(detail.example), `${item.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(templateViewSchema(detail.template as typeof TEMPLATE_IDS[number]).safeParse(detail.example).success, item.id).toBe(true);
      for (const example of detail.examples as { tool: string; arguments: Record<string, unknown> }[]) expect(resolveToolCall('discovery', example.tool, example.arguments).error, item.id).toBeUndefined();
      expect(Buffer.byteLength(JSON.stringify(detail))).toBeLessThan(SEARCH_RESULT_BYTES);
    }
    const result = discoveryCatalog.query('template', 'search', { query: 'display', limit: 5 }, context);
    expect(result.results).toHaveLength(5);
    expect(result).not.toHaveProperty('truncated');
  }, 30000);
  it('chunks all help and guide topics without publishing or returning the whole manual', () => {
    const ids = helpCatalog().map(item => item.id);
    for (const topic of HELP_TOPICS) expect(ids.some(id => id.startsWith(`kanvas.help.${topic}`)), topic).toBe(true);
    for (const topic of GUIDE_TOPICS) expect(ids.some(id => id === `kanvas.help.${topic}` || id.startsWith(`kanvas.help.${topic}.`)), topic).toBe(true);
    const result = discoveryCatalog.query('help', 'search', { query: 'kanvas.help.recovery', limit: 5 }, context);
    expect(result.returned).toBe(1);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(18000);
    let examples = 0;
    const scan = (value: any): void => { if (!value || typeof value !== 'object') return; if (typeof value.tool === 'string' && value.arguments) { examples++; if (value.tool === 'kanvas_discover') expect(() => parseDiscoveryInput(value.tool, value.arguments)).not.toThrow(); else expect(resolveToolCall('discovery', value.tool, value.arguments).error, JSON.stringify(value).slice(0,200)).toBeUndefined(); } for (const child of Object.values(value)) scan(child); };
    for (const topic of helpCatalog()) scan(topic.detail());
    expect(examples).toBeGreaterThan(5);
  });
  it('scales to thousands with lazy summaries and explicit account-bound safety continuation', () => {
    let materialized = 0, revision = 1;
    const provider: CatalogProvider = { namespace: 'fixture', kind: 'template', list: () => Array.from({length: 5000}, (_, n) => ({ id: `fixture.template.${String(n).padStart(5,'0')}`, provider: 'fixture', revision, title: 'Budget fixture', summary: 'Searchable template summary ' + 'complete '.repeat(16), detail: () => { materialized++; return { id: n, schema: { description: 'x'.repeat(150000) } }; } })) };
    const catalog = new DiscoveryCatalog([provider]);
    const first = catalog.query('template', 'list', {}, context);
    expect(first.total).toBe(5000); expect(first.complete).toBe(false); expect(first.nextCursor).toEqual(expect.any(String));
    let cursor = first.nextCursor; const seen = [...first.results as any[]];
    while (cursor) { const next = catalog.query('template', 'list', { cursor }, context); seen.push(...next.results as any[]); cursor = next.nextCursor; }
    expect(seen).toHaveLength(5000); expect(new Set(seen.map(row => row.id)).size).toBe(5000);
    expect(materialized).toBe(0);
    const ranked = catalog.query('template', 'search', { query:'budget' }, context);
    expect(ranked.returned).toBe(5); expect(materialized).toBe(0);
    expect(JSON.stringify(ranked)).not.toContain('schema');
    expect((catalog.query('template','get',{id:'fixture.template.00002'},context).entry as any).schema.description).toHaveLength(150000);
    expect(materialized).toBe(1);
    expect(() => catalog.query('template', 'search', { query:'budget',cursor:first.nextCursor }, context)).toThrow();
    expect(() => catalog.query('template', 'list', { cursor:first.nextCursor }, {principal:{userId:'other'}})).toThrow();
    revision++;
    expect(() => catalog.query('template', 'list', { cursor:first.nextCursor }, context)).toThrow();
    const huge = new DiscoveryCatalog([{namespace:'huge',kind:'help',list:()=>[{id:'huge.topic',provider:'huge',title:'Huge',summary:'Oversized detail',detail:()=>({text:'x'.repeat(SEARCH_RESULT_BYTES+1)})}]}]);
    expect(() => huge.query('help','get',{id:'huge.topic'},context)).toThrow(/response safety budget/);
  }, 30000);
  it('filters private-provider entries before ranking, exact lookup, totals and materialization', () => {
    const privateProvider: CatalogProvider = { namespace: 'private', kind: 'template', list: ({ principal }) => [{ id: `private.template.${principal.userId}`, provider: 'private', title: 'Private example', summary: 'Private', detail: () => ({ owner: principal.userId }) }, { id: 'private.template.hidden', provider: 'private', title: 'Hidden', summary: 'Secret', visible: () => false, detail: () => { throw Error('Must not materialize hidden data'); } }] };
    const catalog = new DiscoveryCatalog([...BUILTIN_PROVIDERS, privateProvider]);
    expect(catalog.list('template', context).some(item => item.id === 'private.template.hidden')).toBe(false);
    expect(catalog.query('template', 'search', { query: 'private.template.account-b' }, context).results).toEqual([]);
    for (const id of ['private.template.account-b','private.template.hidden']) expect(() => catalog.query('template','get',{id},context)).toThrow(/Unknown or unavailable/);
    expect(catalog.query('template','get',{id:'private.template.account-a'},context).entry).toEqual({owner:'account-a'});
    const controller = new AbortController(); controller.abort();
    expect(() => catalog.query('template','list',{}, {...context,signal:controller.signal})).toThrow();
  });
  it('aligns full authored catalogs with the two-tool contract and meaningful unified help names', () => {
    for (const item of helpCatalog()) {
      expect(item.id).toMatch(/^kanvas\.help\./);
      expect(item.summary).not.toMatch(/^Agent guidance for/);
      expect(item.summary.length).toBeGreaterThan(35);
    }
    for (const item of [...operationCatalog(),...templateCatalog(),...helpCatalog()]) {
      const detail=JSON.stringify(item.detail());
      expect(detail, item.id).not.toMatch(/kanvas_(?:tool|help|template)_(?:search|index|use)/);
      expect(detail, item.id).not.toMatch(/operationId[^a-z]{1,8}kanvas\.(?:guide|help|template\.get)(?:["\s,}]|$)/);
    }
  });
  it('translates server-owned guidance and recipes without modifying argument/source literals', () => {
    const recipe = { tool: 'kanvas_publish', arguments: { operation: 'show', requestId: 'x', view: { version: 1, template: 'fact', data: { text: 'kanvas_session_state is literal source text' } } } };
    const transformed = publicExample(recipe, 'discovery') as any;
    expect(transformed.arguments.operationId).toBe('kanvas.submit');
    expect(transformed.arguments.arguments.view.data).toEqual(recipe.arguments.view.data);
    expect(publicGuidanceText('Read kanvas_inspect operation session.state.', 'discovery')).toContain('operationId:"kanvas.session.state"');
    const user = { question: 'kanvas_submit is literal user prose', context: { name: 'kanvas_session_state' }, steps: ['Read kanvas_session_state.'] };
    const result = profileScope.run('discovery', () => profileResultData('kanvas_help', user, 'discovery')) as any;
    expect(result.question).toBe(user.question); expect(result.context).toEqual(user.context);
    expect(result.steps[0]).toContain('operationId');
    expect(interactionRoutes('discovery').read).toMatchObject({ tool: 'kanvas_call', arguments: { operationId: 'kanvas.interactions.read' } });
  });
});
