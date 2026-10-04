import { profileResultData, interactionRoutes } from '../../src/server/mcp/profile-guidance.js';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { CANONICAL_TOOLS, parseCanonicalArguments } from '../../src/server/mcp/canonical.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { DiscoveryCatalog, BUILTIN_PROVIDERS, canonicalForOperation, discoveryCatalog, discoveryToolDefinitions, helpCatalog, operationCatalog, templateCatalog, parseDiscoveryInput, SEARCH_RESULT_BYTES, type CatalogProvider } from '../../src/server/mcp/discovery.js';
import { DISCOVERY_TOOL_NAMES, DOMAIN_OPERATION_ENTRIES, OPERATION_ENTRIES, operationId, profileScope, publicExample, publicGuidanceText } from '../../src/server/mcp/operations.js';
import { LocalSearch } from '../../src/server/mcp/local-search.js';
import { TOOL_DISCOVERY } from '../../src/server/mcp/tool-discovery.js';
import { HELP_TOPICS } from '../../src/shared/help.js';
import { GUIDE_TOPICS } from '../../src/server/mcp/guide.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
const context = { principal: { userId: 'account-a', scopes: ['read', 'publish'] } };
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });

describe('seven-tool discoverable catalog', () => {
  it('publishes only seven compact fixed schemas with conservative dispatcher annotations', () => {
    const definitions = discoveryToolDefinitions();
    expect(definitions.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
    expect(JSON.stringify(definitions).length).toBeLessThan(9000);
    for (const definition of definitions) { ajv.compile(definition.inputSchema); expect(definition.annotations?.readOnlyHint).toBe(definition.name !== 'kanvas_tool_use'); }
    expect(definitions.at(-1)?.annotations).toMatchObject({ destructiveHint: true, openWorldHint: true, idempotentHint: false });
  });
  it('covers every canonical and formerly nested operation exactly once; aliases do not create duplicate search hits', () => {
    const catalog = operationCatalog();
    expect(catalog.length).toBeGreaterThan(100);
    expect(catalog.map(item => canonicalForOperation(item.id)).sort()).toEqual(CANONICAL_TOOLS.map(tool => tool.name).sort());
    expect(new Set(catalog.map(item => item.id)).size).toBe(catalog.length);
    for (const entry of [...DOMAIN_OPERATION_ENTRIES, ...OPERATION_ENTRIES]) expect(canonicalForOperation(operationId(entry.canonical))).toBe(entry.canonical);
  });
  it('every operation exposes a complete schema and executable examples passing both JSON Schema and unchanged canonical validators', () => {
    for (const item of operationCatalog()) {
      const detail = item.detail(), canonical = canonicalForOperation(item.id)!;
      const validate = ajv.compile(detail.inputSchema as object);
      const examples = detail.examples as { tool: string; arguments: { operationId: string; arguments: Record<string, unknown> } }[];
      expect(examples.length, item.id).toBeGreaterThan(0);
      expect(detail.annotations).toBeDefined();
      for (const example of examples) {
        expect(example.tool).toBe('kanvas_tool_use');
        expect(validate(example.arguments.arguments), `${item.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
        expect(parseCanonicalArguments(canonical, example.arguments.arguments), item.id).toBeDefined();
        const routed = resolveToolCall('discovery', example.tool, example.arguments);
        expect(routed.error, item.id).toBeUndefined();
        expect(routed.canonicalName).toBe(canonical);
        const legacy = resolveToolCall('legacy', canonical, example.arguments.arguments).args;
        if (routed.args?.requestId && !example.arguments.arguments.requestId) { expect(routed.args.requestId).toEqual(expect.any(String)); expect({ ...routed.args, requestId: undefined }).toEqual({ ...legacy, requestId: undefined }); }
        else expect(routed.args).toEqual(legacy);
        expect(routed.reference).toEqual({ tool: 'kanvas_tool_use', operation: item.id });
      }
    }
  });
  it('returns a deterministic default top five full contracts and exact ID lookup', () => {
    const input = parseDiscoveryInput('kanvas_tool_search', { query: 'display' });
    const response = discoveryCatalog.query('tool', true, input, context);
    expect(response.returned).toBe(5);
    expect(response).toEqual(discoveryCatalog.query('tool', true, input, context));
    expect(response.nextCursor).toEqual(expect.any(String));
    for (const item of response.results as Record<string, unknown>[]) expect(item).toHaveProperty('inputSchema');
    const exact = discoveryCatalog.query('tool', true, { query: 'kanvas.checklist.show', limit: 5 }, context);
    expect(exact.returned).toBe(1); expect(exact.nextCursor).toBeNull();
    expect((exact.results as { id: string }[])[0].id).toBe('kanvas.checklist.show');
    expect(discoveryCatalog.query('tool', true, { query: 'qzxunrelatedgibberish', limit: 5 }, context).results).toEqual([]);
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
  it('exhaustively pages stable concise indices, binds cursors and rejects malformed or unknown inputs', () => {
    for (const kind of ['tool', 'help', 'template'] as const) {
      const seen: string[] = []; let cursor: string | undefined;
      do {
        const page = discoveryCatalog.query(kind, false, { limit: 7, cursor }, context);
        for (const item of page.results as Record<string, unknown>[]) { expect(item).not.toHaveProperty('inputSchema'); expect(item).not.toHaveProperty('schema'); seen.push(String(item.id)); }
        expect(page.total).toBe(discoveryCatalog.list(kind, context).length);
        cursor = page.nextCursor as string | undefined;
      } while (cursor);
      expect(seen).toEqual(discoveryCatalog.list(kind, context).map(item => item.id));
      expect(new Set(seen).size).toBe(seen.length);
    }
    const first = discoveryCatalog.query('tool', false, { limit: 1 }, context);
    expect(() => discoveryCatalog.query('help', false, { limit: 1, cursor: first.nextCursor }, context)).toThrow();
    expect(() => discoveryCatalog.query('tool', false, { limit: 1, cursor: first.nextCursor }, { principal: { userId: 'account-b' } })).toThrow();
    for (const raw of [{ query: '' }, { query: 'x', limit: 11 }, { query: 'x', limit: -1 }, { query: 'x', injected: 'data' }, { query: 'x'.repeat(501) }]) expect(() => parseDiscoveryInput('kanvas_tool_search', raw)).toThrow();
    for (const operationId of ['__proto__', 'constructor', '../kanvas.session.state', 'kanvas.execute', 'kanvas.session.state;eval']) expect(resolveToolCall('discovery', 'kanvas_tool_use', { operationId, arguments: {} }).error).toBeDefined();
    expect(resolveToolCall('discovery', 'kanvas_tool_use', { operationId: 'kanvas.session.state', arguments: { sessionId: 'x', extra: true } }).error).toBeDefined();
    expect(resolveToolCall('discovery', 'kanvas_arbitrary_eval', {}).error).toBeDefined();
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
    const result = discoveryCatalog.query('template', true, { query: 'display', limit: 5 }, context);
    expect(result.results).toHaveLength(5);
    expect(result).not.toHaveProperty('truncated');
  });
  it('chunks all help and guide topics without publishing or returning the whole manual', () => {
    const ids = helpCatalog().map(item => item.id);
    for (const topic of HELP_TOPICS) expect(ids.some(id => id.startsWith(`kanvas.help.${topic}`)), topic).toBe(true);
    for (const topic of GUIDE_TOPICS) expect(ids.some(id => id.startsWith(`kanvas.guide.${topic}`)), topic).toBe(true);
    const result = discoveryCatalog.query('help', true, { query: 'kanvas.help.recovery', limit: 5 }, context);
    expect(result.returned).toBe(1);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(18000);
    let examples = 0;
    const scan = (value: any): void => { if (!value || typeof value !== 'object') return; if (typeof value.tool === 'string' && value.arguments) { examples++; expect(resolveToolCall('discovery', value.tool, value.arguments).error, JSON.stringify(value).slice(0,200)).toBeUndefined(); } for (const child of Object.values(value)) scan(child); };
    for (const topic of helpCatalog()) scan(topic.detail());
    expect(examples).toBeGreaterThan(5);
  });
  it('continues complete oversized result sets at entry boundaries and never returns partial contracts', () => {
    const provider: CatalogProvider = { namespace: 'fixture', kind: 'template', list: () => [1,2,3].map(n => ({ id: `fixture.template.${n}`, provider: 'fixture', title: 'Budget fixture', summary: 'Complete contract', detail: () => ({ id: n, schema: { description: 'x'.repeat(150000) }, examples: [{ exact: true }] }) })) };
    const catalog = new DiscoveryCatalog([provider]);
    const first = catalog.query('template', true, { query: 'budget', limit: 5 }, context);
    expect(first).toMatchObject({ total: 3, returned: 2 }); expect(first.nextCursor).toEqual(expect.any(String));
    expect((first.results as any[])[0].schema.description).toHaveLength(150000);
    const last = catalog.query('template', true, { query: 'budget', limit: 5, cursor: first.nextCursor }, context);
    expect(last).toMatchObject({ total: 3, returned: 1, nextCursor: null });
    expect((last.results as any[])[0].id).toBe(3);
    expect(() => catalog.query('template', true, { query: 'changed query', limit: 5, cursor: first.nextCursor }, context)).toThrow();
  });
  it('filters future private-provider entries before ranking, exact lookup, totals and cursor creation', () => {
    const privateProvider: CatalogProvider = { namespace: 'private', kind: 'template', list: ({ principal }) => [{ id: `private.template.${principal.userId}`, provider: 'private', title: 'Private example', summary: 'Private', detail: () => ({ owner: principal.userId }) }, { id: 'private.template.hidden', provider: 'private', title: 'Hidden', summary: 'Secret', visible: () => false, detail: () => { throw Error('Must not materialize hidden data'); } }] };
    const catalog = new DiscoveryCatalog([...BUILTIN_PROVIDERS, privateProvider]);
    expect(catalog.list('template', context).some(item => item.id === 'private.template.hidden')).toBe(false);
    expect(catalog.query('template', true, { query: 'private.template.account-b', limit: 5 }, context).results).not.toContainEqual({ owner: 'account-b' });
    expect(catalog.list('template', context).filter(item => item.provider === 'private').map(item => item.id)).toEqual(['private.template.account-a']);
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
    expect(interactionRoutes('discovery').read).toMatchObject({ tool: 'kanvas_tool_use', arguments: { operationId: 'kanvas.interactions.read' } });
  });
});
