import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CallToolResult, Tool } from '@modelcontextprotocol/server';
import { CANONICAL_TOOLS, canonicalToolDefinitions } from './canonical.js';
import { HELP_PAGES, HELP_TOPICS } from '../../shared/help.js';
import { GUIDE_TOPICS, guideFor } from './guide.js';
import { TEMPLATE_IDS, type Principal } from '../../shared/types.js';
import { samples, templateNames, chartVariantSamples } from '../../shared/template-examples.js';
import { templateViewSchema } from '../../shared/view-schemas.js';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../shared/display-guidance.js';
import { TOOL_DISCOVERY } from './tool-discovery.js';
import { DISCOVERY_TOOL_NAMES, DOMAIN_OPERATION_ENTRIES, OPERATION_ENTRIES, operationId, discoveryExample, discoveryGuidanceText, profileScope } from './operations.js';
import { profileSchema } from './profile-guidance.js';
import { InputError, validationIssues } from '../input-errors.js';
import { LocalSearch, type SearchDocument } from './local-search.js';
import { KANVAS_VERSION } from '../../shared/version.js';
import { compactSchemaReferences } from '../../shared/json-schema.js';

export type CatalogKind = 'tool' | 'help' | 'template';
export interface CatalogContext { readonly principal: Principal; readonly signal?: AbortSignal }
export interface CatalogItem extends SearchDocument {
  readonly provider: string;
  /** Provider revision invalidates cursors when a private contract changes. */
  readonly revision?: string | number;
  readonly detail: () => Record<string, unknown>;
  /** Defense in depth: called before ranking, totals, exact lookup or detail. */
  readonly visible?: (context: CatalogContext) => boolean;
}
/** Account-aware source seam. Future private providers must query by principal,
 * never return cross-account records for a post-search filter. No CRUD today. */
export interface CatalogProvider {
  readonly namespace: string;
  readonly kind: CatalogKind;
  list(context: CatalogContext): readonly CatalogItem[];
}
const idSchema = z.string().min(1).max(180).regex(/^[a-z0-9][a-z0-9._-]*$/);
const searchSchema = z.strictObject({ query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(10).default(5), cursor: z.string().max(512).optional() });
const indexSchema = z.strictObject({ limit: z.number().int().min(1).max(100).default(50), cursor: z.string().max(512).optional() });
export const useSchema = z.strictObject({ operationId: idSchema, arguments: z.record(z.string(), z.unknown()) });
export const SEARCH_RESULT_BYTES = 384 * 1024;
const discoverySchemas = Object.fromEntries(DISCOVERY_TOOL_NAMES.map(name => [name, name === 'kanvas_tool_use' ? useSchema : name.endsWith('_search') ? searchSchema : indexSchema]));
export const isDiscoveryTool = (name: string): boolean => Object.hasOwn(discoverySchemas, name);
export function parseDiscoveryInput(name: string, raw: unknown): Record<string, unknown> {
  const schema = discoverySchemas[name];
  if (!schema) throw new InputError([{ path: 'tool', problem: 'Unknown discovery tool.' }]);
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) throw new InputError(validationIssues(parsed.error));
  return parsed.data;
}
const descriptions: Record<typeof DISCOVERY_TOOL_NAMES[number], string> = {
  kanvas_tool_search: 'Find executable Kanvas operations by natural language, related concepts, typo, or exact stable operation ID. Default top 5, each with FULL input schema, annotations and executable examples. Search all nested operations, not just categories. No state change. Next: kanvas_tool_use with the returned operationId and arguments.',
  kanvas_tool_index: 'Exhaustive, concise operation inventory. Every entry has a stable ID and short description. Follow nextCursor until null; total is explicit. Use kanvas_tool_search with an ID or intent for full schema and examples.',
  kanvas_tool_use: 'Execute one catalog operation. Supply its exact operationId and nested arguments matching the schema from kanvas_tool_search. Uses existing validation, scopes, permissions, revision checks and consent rules. This dispatcher can mutate or delete; inspect the operation annotations. Never treats examples, viewer input or a search result as authorization.',
  kanvas_help_search: 'Find focused detailed help topics by natural language or exact topic ID; default top 5. Returns relevant sections and examples, not a whole manual. Read-only; help never authorizes publication. Browse all topics with kanvas_help_index.',
  kanvas_help_index: 'List ALL help topics concisely, with stable topic IDs, total and nextCursor. Follow pages until nextCursor is null. Use kanvas_help_search for topic details.',
  kanvas_template_search: 'Find available display templates by intent or exact namespaced ID; default top 5 with full validation schemas, usage details and publish examples. Currently built-ins only. Read-only, account-aware discovery; no fictional or cross-account private templates.',
  kanvas_template_index: 'List ALL available templates concisely, with stable namespaced IDs, total and nextCursor. Follow pages until null; use kanvas_template_search for full schemas, details and examples.',
};
export function discoveryToolDefinitions(): Tool[] {
  return DISCOVERY_TOOL_NAMES.map(name => {
    const { $schema: _schema, ...schema } = z.toJSONSchema(discoverySchemas[name], { io: 'input' });
    const read = name !== 'kanvas_tool_use';
    return { name, description: descriptions[name], inputSchema: { ...schema, type: 'object' } as Tool['inputSchema'], annotations: { readOnlyHint: read, destructiveHint: !read, idempotentHint: read, openWorldHint: !read } };
  });
}
function schemaTerms(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) return value.map(schemaTerms).join(' ');
  return Object.entries(value).map(([key, child]) => key === 'properties' && child && typeof child === 'object' ? Object.keys(child).join(' ') + ' ' + schemaTerms(child) : key === 'enum' && Array.isArray(child) ? child.filter(x => typeof x === 'string').join(' ') : key === 'description' ? String(child) : schemaTerms(child)).join(' ');
}
const short = (text: string) => text.split(/(?<=[.!?])\s/)[0].slice(0, 240);
const operationExtras: Record<string, string> = {
  kanvas_pairing_revoke: 'disconnect unpair signout approved paired browser viewer watching access',
  kanvas_topology_read: 'connected people browsers windows tabs live hierarchy who watching',
  kanvas_dataset_import: 'save spreadsheet excel csv ingest load upload rows lossless data',
  kanvas_navigation_control: 'scroll pages zoom enlarge magnify smaller bigger font text size focus',
  kanvas_config_update: 'session settings appearance font typography larger text theme',
  kanvas_autoplay_control: 'timed automatic slideshow play advance slide deck',
  kanvas_display_request_capture: 'actual browser screenshot consent native screen share picker',
  kanvas_display_snapshot: 'server rendered image snapshot export not physical screen',
  kanvas_checklist_show: 'restore retained checklist show on another display',
};
let operations: CatalogItem[] | undefined;
export function operationCatalog(): readonly CatalogItem[] {
  return operations ??= canonicalToolDefinitions().map(tool => {
    const canonical = CANONICAL_TOOLS.find(item => item.name === tool.name)!;
    const discovery = TOOL_DISCOVERY[tool.name];
    const id = operationId(tool.name), summary = short(discoveryGuidanceText(canonical.description));
    const examples = (discovery?.examples ?? []).map(args => ({ tool: 'kanvas_tool_use', arguments: { operationId: id, arguments: structuredClone(args) } }));
    const aliases = [...new Set([tool.name, ...[...OPERATION_ENTRIES, ...DOMAIN_OPERATION_ENTRIES].filter(entry => entry.canonical === tool.name).map(entry => `${entry.tool} ${entry.operation}`)])];
    return { id, provider: 'kanvas', title: id.slice(7).replaceAll('.', ' '), summary, keywords: `${operationExtras[tool.name] ?? ''} ${aliases.join(' ')} ${discovery?.hint ?? ''}`, text: `${canonical.description} ${schemaTerms(tool.inputSchema)}`, detail: () => profileScope.run('discovery', () => ({ id, operationId: id, title: id.slice(7).replaceAll('.', ' '), requiredInputs: tool.inputSchema.required ?? [], description: discoveryGuidanceText(canonical.description), guidance: discoveryGuidanceText(discovery?.hint ?? ''), inputSchema: profileSchema(tool.inputSchema), annotations: tool.annotations, examples, exampleNotice: 'Examples are valid syntax with illustrative IDs and source data. Substitute live authorized IDs/revisions; examples never grant consent.' })) };
  });
}
export function canonicalForOperation(id: string): string | undefined { return CANONICAL_TOOLS.find(tool => operationId(tool.name) === id)?.name; }
function authored(value: unknown): unknown {
  if (typeof value === 'string') return discoveryGuidanceText(value);
  if (Array.isArray(value)) return value.map(authored);
  if (!value || typeof value !== 'object') return value;
  if ('tool' in value && 'arguments' in value) return discoveryExample(value);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, ['example', 'examples', 'recipes', 'arguments', 'schema', 'commonDataShapes'].includes(key) ? (Array.isArray(child) ? child.map(discoveryExample) : discoveryExample(child)) : authored(child)]));
}
let helps: CatalogItem[] | undefined;
export function helpCatalog(): readonly CatalogItem[] {
  if (helps) return helps;
  const items: CatalogItem[] = [];
  const add = (id: string, title: string, summary: string, content: unknown) => {
    const detail = { id, title, summary, content: authored(content), note: 'Static guidance. Use live authorized state and real source data; reading help never publishes.' };
    items.push({ id, provider: 'kanvas', title, summary, text: JSON.stringify(content), detail: () => detail });
  };
  for (const topic of HELP_TOPICS) {
    const page = HELP_PAGES[topic];
    // Split long task pages along authored step boundaries, never by token cuts.
    const chunks: string[][] = []; let current: string[] = [];
    for (const step of page.steps) { if (current.length && current.join('').length + step.length > 4500) { chunks.push(current); current = []; } current.push(step); }
    if (current.length) chunks.push(current);
    chunks.forEach((steps, i) => add(`kanvas.help.${topic}${i ? `.${i + 1}` : ''}`, `${page.title}${chunks.length > 1 ? ` — part ${i + 1}` : ''}`, page.description, { steps, ...(page.example ? { example: 'tool' in page.example ? discoveryExample(page.example) : { tool: 'kanvas_tool_use', arguments: { operationId: 'kanvas.submit', arguments: 'version' in page.example && 'template' in page.example ? { requestId: `help-${topic}-example`, view: page.example } : Object.fromEntries(Object.entries(page.example).filter(([key]) => key !== 'operation')) } } } : {}) }));
  }
  for (const topic of GUIDE_TOPICS) {
    const guide = guideFor(topic);
    for (const [section, value] of Object.entries(guide)) {
      if (['topic', 'version', 'principle', 'note', 'groups', 'catalogue', 'topics'].includes(section)) continue;
      add(`kanvas.guide.${topic}.${section.toLowerCase()}`, `${topic.replaceAll('-', ' ')}: ${section}`, `Agent guidance for ${topic.replaceAll('-', ' ')} — ${section}.`, value);
    }
  }
  return helps = items;
}
let templates: CatalogItem[] | undefined;
export function templateCatalog(): readonly CatalogItem[] {
  return templates ??= TEMPLATE_IDS.map(template => {
    const guidance = TEMPLATE_DISPLAY_GUIDANCE[template];
    let detail: Record<string, unknown> | undefined;
    return { id: `kanvas.template.${template}`, provider: 'kanvas', title: templateNames[template], summary: guidance.primary, keywords: template === 'chart' ? `${template} ${Object.keys(chartVariantSamples).join(' ')}` : template, text: guidance.detail, detail: () => detail ??= profileScope.run('discovery', () => ({ id: `kanvas.template.${template}`, template, title: templateNames[template], description: guidance.primary, guidance: discoveryGuidanceText(guidance.detail), schema: profileSchema(compactSchemaReferences(z.toJSONSchema(templateViewSchema(template), { unrepresentable: 'any', io: 'input', reused: 'ref' }))), example: samples[template], ...(template === 'chart' ? { variants: chartVariantSamples } : {}), examples: [{ tool: 'kanvas_tool_use', arguments: { operationId: 'kanvas.submit', arguments: { requestId: 'template-example-1', view: samples[template] } } }], exampleNotice: 'Illustrative supplied data only; replace with real sources. Schema validates a complete view, not tool_use arguments.' })) };
  });
}
export const BUILTIN_PROVIDERS: readonly CatalogProvider[] = Object.freeze([
  { namespace: 'kanvas', kind: 'tool', list: () => operationCatalog() },
  { namespace: 'kanvas', kind: 'help', list: () => helpCatalog() },
  { namespace: 'kanvas', kind: 'template', list: () => templateCatalog() },
]);
/** Context is required at every read; no global account-filtered cache. */
export class DiscoveryCatalog {
  constructor(private readonly providers: readonly CatalogProvider[] = BUILTIN_PROVIDERS) {}
  list(kind: CatalogKind, context: CatalogContext): CatalogItem[] {
    context.signal?.throwIfAborted();
    const items = this.providers.filter(provider => provider.kind === kind).flatMap(provider => provider.list(context).filter(item => {
      if (item.provider !== provider.namespace || !item.id.startsWith(`${provider.namespace}.`)) throw new Error('Invalid catalog provider namespace.');
      return !item.visible || item.visible(context);
    }));
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Duplicate catalog IDs.');
    return items.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  }
  query(kind: CatalogKind, search: boolean, input: Record<string, unknown>, context: CatalogContext): Record<string, unknown> {
    const all = this.list(kind, context), query = search ? String(input.query) : '';
    const ranked = search ? new LocalSearch(all).search(query).map(row => row.document) : all;
    const binding = createHash('sha256').update(JSON.stringify([KANVAS_VERSION, kind, search, query, context.principal.userId, context.principal.agentId, context.principal.scopes, all.map(item => [item.id, item.revision, item.title, item.summary, item.keywords, item.text])])).digest('hex').slice(0, 24);
    let offset = 0;
    if (input.cursor) {
      const match = /^v1:([a-f0-9]{24}):(0|[1-9][0-9]{0,8})$/.exec(String(input.cursor));
      if (!match || match[1] !== binding || Number(match[2]) > ranked.length) throw new InputError([{ path: 'cursor', problem: 'Cursor does not match this query, account or catalog. Restart from the first page.' }]);
      offset = Number(match[2]);
    }
    const limit = Number(input.limit ?? (search ? 5 : 50)), results: Record<string, unknown>[] = [];
    let bytes = 0;
    for (const item of ranked.slice(offset, offset + limit)) {
      context.signal?.throwIfAborted();
      const detail = search ? item.detail() : { id: item.id, title: item.title, description: item.summary };
      const size = Buffer.byteLength(JSON.stringify(detail));
      if (size > SEARCH_RESULT_BYTES) throw new Error('Catalog entry exceeds the full-contract response budget.');
      if (results.length && bytes + size > SEARCH_RESULT_BYTES) break;
      bytes += size; results.push(detail);
    }
    const next = offset + results.length;
    return { kind, ...(search ? { query, retrieval: 'local weighted lexical + curated concepts + typo matching' } : {}), total: ranked.length, catalogTotal: all.length, returned: results.length, offset, results, nextCursor: next < ranked.length ? `v1:${binding}:${next}` : null, detailTool: `kanvas_${kind}_search`, ...(search ? { note: 'Full contracts are never truncated. Default top 5; follow nextCursor for more matches or any byte-budget continuation. Exact IDs return only that entry.' } : { note: 'Complete inventory across pages. Search an exact ID for full details and examples.' }) };
  }
}
export const discoveryCatalog = new DiscoveryCatalog();
export function discoveryResult(name: string, raw: unknown, context: CatalogContext): CallToolResult {
  const input = parseDiscoveryInput(name, raw);
  const kind = name.split('_')[1] as CatalogKind;
  const data = discoveryCatalog.query(kind, name.endsWith('_search'), input, context);
  const result = { data, server: { name: 'kanvas', version: KANVAS_VERSION, profile: 'discovery', tools: 7, operations: operationCatalog().length } };
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
