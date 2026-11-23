import {exposeSchemaProperties} from './schema-properties.js';
import type {HelpTopic} from '../../shared/help.js';
import {intentResolveSchema,INTENT_EXAMPLES} from './intent-schema.js';
import {activeContextSchema,ACTIVE_CONTEXT_HELP} from './active-context.js';
import {workflowIds,WORKFLOW_NOTE,PLANNER_BOUNDARY,SUBMIT_SHAPE} from './workflow-guidance.js';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {CallToolResult,Tool} from '@modelcontextprotocol/server';
import {CANONICAL_TOOLS,canonicalToolDefinitions} from './canonical.js';
import {HELP_KEYWORDS,HELP_PAGES,HELP_PRIORITY,HELP_TOPICS} from '../../shared/help.js';
import {GUIDE_TOPICS,guideFor} from './guide.js';
import {TEMPLATE_IDS,type Principal,type TemplateId} from '../../shared/types.js';
import {templateConcept} from '../../shared/template-concepts.js';
import {samples,templateNames,chartVariantSamples} from '../../shared/template-examples.js';
import {templateViewSchema} from '../../shared/view-schemas.js';
import {TEMPLATE_DISPLAY_GUIDANCE} from '../../shared/display-guidance.js';
import {toolDiscovery} from './tool-discovery.js';
import {DISCOVERY_TOOL_NAMES,operationTable,operationId,discoveryExample,discoveryGuidanceText} from './operations.js';
import {profileSchema} from './profile-guidance.js';
import {InputError,validationIssues} from '../input-errors.js';
import {LocalSearch,type SearchDocument} from './local-search.js';
import {KANVAS_VERSION} from '../../shared/version.js';
import {compactSchemaReferences} from '../../shared/json-schema.js';
export type CatalogKind = 'tool' | 'help' | 'template';
export interface CatalogContext {
    readonly privateTemplates?: readonly CatalogItem[];
    readonly principal: Principal;
    readonly signal?: AbortSignal;
}
export interface CatalogItem extends SearchDocument {
    readonly provider: string;
    /** Provider revision invalidates cursors when a private contract changes. */
    readonly revision?: string | number;
    readonly detail: (options?: {
        expand?: 'own' | 'full';
    }) => Record<string, unknown>;
    /** Minimal valid example shown inline on search hits, so the shape is known before a first attempt. */
    readonly example?: () => unknown;
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
const catalogSchema = z.enum(['tools', 'templates', 'help']);
const cursorSchema = z.string().max(512).optional();
/** Each action accepts only its own fields: no type facet or accidental narrowing. */
export const discoverSchema = z.discriminatedUnion('action', [
    intentResolveSchema,
    z.strictObject({ activeContext: activeContextSchema, catalog: catalogSchema, action: z.literal('list'), cursor: cursorSchema, prefix: z.string().max(180).regex(/^[a-z0-9][a-z0-9._-]*$/).optional().describe('Only IDs starting with this text, e.g. kanvas.display. or kanvas.template.c'), examples: z.boolean().optional().describe('Add each entry\'s minimal valid example. Larger response.') }),
    z.strictObject({ activeContext: activeContextSchema, catalog: catalogSchema, action: z.literal('search'), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(20).default(5), cursor: cursorSchema }),
    z.strictObject({ activeContext: activeContextSchema, catalog: catalogSchema, action: z.literal('get'), id: idSchema, expand: z.enum(['own', 'full']).optional().describe('Templates only. own (default): this template\'s own shape, with slots that hold another view collapsed to a reference. full: the complete embedded union of every template.') }),
]);
export const useSchema = z.strictObject({ activeContext: activeContextSchema, operationId: idSchema, arguments: z.record(z.string(), z.unknown()) });
/** Safety budget, not ordinary pagination. Whole entries only; explicit continuation. */
export const SEARCH_RESULT_BYTES = 384 * 1024;
const discoverySchemas = { kanvas_discover: discoverSchema, kanvas_call: useSchema };
export const isDiscoveryTool = (name: string): name is keyof typeof discoverySchemas => Object.hasOwn(discoverySchemas, name);
export function parseDiscoveryInput(name: string, raw: unknown): Record<string, unknown> {
    if (!isDiscoveryTool(name))
        throw new InputError([{ path: 'tool', problem: 'Unknown tool. Use kanvas_discover or kanvas_call.' }]);
    const parsed = discoverySchemas[name].safeParse(raw ?? {});
    if (!parsed.success)
        throw new InputError(validationIssues(parsed.error, 'arguments', raw, false, discoverySchemas[name]));
    return parsed.data;
}
const descriptions: Record<typeof DISCOVERY_TOOL_NAMES[number], string> = {
    kanvas_discover: 'Discover Kanvas tools, templates and help. New user/no active screen: get help kanvas.help.about first; ask the user to open this environment’s bare Kanvas URL and sign in, then use account.begin/devices.read/window.present. Takes {catalog,action,id/query}; if a host shows no parameters, pass them anyway or use kanvas_call operationId kanvas.discover with nested discovery arguments. Choose catalog tools|templates|help and action list|search|get. Tools action resolve accepts a supported intent query, explicit sessionId/displayId or activeContext, and optional parameters containing supplied values; returns the current schema, provenance and missing fields without execution. Five families: filter/sort/highlight, navigate/scroll/zoom, patch/edit, publish/target, inspect/interaction. Activity and analytics operations expose recorded latency. list returns the ENTIRE visible catalog as plain-text one-line IDs and descriptions, without default pagination. search returns top 5 ranked concise summaries with bounded examples, NEVER full schemas or content; query by natural language. get returns full schema/examples or focused help content for one exact id. Use get before kanvas_call. All actions are read-only, account-aware and never authorize publication. Only response-size safety overflow uses explicit continuation; no silent truncation.',
    kanvas_call: 'Discovery fallback: operationId kanvas.discover with arguments:{catalog,action,id/query} supports the same read-only discovery including resolve; never nests or executes another call. Call one discovered operation. Supply its exact operationId and nested arguments matching the schema from kanvas_discover {catalog:"tools",action:"get",id}. Preserves validation, scopes, permissions, revision checks, cancellation and consent. Can mutate/delete: inspect individual operation annotations. Examples, discovery results and viewer input are never authorization.',
};
export function discoveryToolDefinitions(): Tool[] {
    return DISCOVERY_TOOL_NAMES.map(name => {
        // Zod puts discriminated-union fields under oneOf, invisible to root-only hosts.
        // Both SDK dialects preserve the schema; retain branches while projecting fields.
        const { $schema: _schema, ...schema } = z.toJSONSchema(discoverySchemas[name], { io: 'input' });
        const read = name !== 'kanvas_call';
        const inputSchema = exposeSchemaProperties({ ...schema, type: 'object' }) as Tool['inputSchema'];
        if (name === 'kanvas_discover') {
            // Root-only hosts also need discriminator choices and common required fields.
            inputSchema.properties = { ...inputSchema.properties, catalog: { type: 'string', enum: ['tools', 'templates', 'help'] }, action: { type: 'string', enum: ['resolve', 'list', 'search', 'get'] } };
            inputSchema.required = ['catalog', 'action'];
        }
        return { name, description: descriptions[name] + ' ' + ACTIVE_CONTEXT_HELP, inputSchema, annotations: { readOnlyHint: read, destructiveHint: !read, idempotentHint: read, openWorldHint: !read } };
    });
}
function schemaTerms(value: unknown): string {
    if (!value || typeof value !== 'object')
        return '';
    if (Array.isArray(value))
        return value.map(schemaTerms).join(' ');
    return Object.entries(value).map(([key, child]) => key === 'properties' && child && typeof child === 'object' ? Object.keys(child).join(' ') + ' ' + schemaTerms(child) : key === 'enum' && Array.isArray(child) ? child.filter(x => typeof x === 'string').join(' ') : key === 'description' ? String(child) : schemaTerms(child)).join(' ');
}
const short = (text: string) => text.split(/(?<=[.!?])\s/)[0].slice(0, 240);
const operationExtras: Record<string, string> = {
    "kanvas.pairing.revoke": 'disconnect unpair signout approved paired browser viewer watching access',
    "kanvas.topology.read": 'connected people browsers windows tabs live hierarchy who watching',
    "kanvas.dataset.import": 'save spreadsheet excel csv ingest load upload rows lossless data',
    "kanvas.navigation.control": 'scroll pages zoom enlarge magnify smaller bigger font text size focus',
    "kanvas.config.update": 'session settings appearance font typography larger text theme',
    "kanvas.autoplay.control": 'timed automatic slideshow play advance slide deck',
    "kanvas.display.request.capture": 'actual browser screenshot consent native screen share picker',
    "kanvas.display.snapshot": 'server rendered image snapshot export not physical screen',
    "kanvas.checklist.show": 'restore retained checklist show on another display',
    "kanvas.display.register": 'create display add display new display second screen another screen second monitor extra screen split content across screens two screens multiple displays',
    "kanvas.display.rename": 'rename display change display name label screen',
    "kanvas.display.update": 'resize display viewport width height hold freeze display size change display',
    "kanvas.window.present": 'put this on that screen move window to display send to tv show on second screen point device at display',
    "kanvas.checklist.update": 'tick item check off uncheck mark done single item by id add item remove item highlight current item',
    "kanvas.session.state": 'current state displays revisions manage map what can i change',
    "kanvas.toast": 'notification notify toast alert message banner popup icon',
};
/** Words people actually use for an operation whose verb is not theirs. Search title only; the id is unchanged. */
const operationTitles: Record<string, string> = {
    "kanvas.display.register": 'create a display, add a new display, second screen',
};
let operations: CatalogItem[] | undefined;
export const CATALOG_ONLY_CANONICAL = new Set(["kanvas.help", "kanvas.guide", "kanvas.template.get"]);
export function operationCatalog(): readonly CatalogItem[] {
    return operations ??= canonicalToolDefinitions().filter(tool => !CATALOG_ONLY_CANONICAL.has(tool.name)).map(tool => {
        const canonical = CANONICAL_TOOLS.find(item => item.name === tool.name)!;
        const discovery = toolDiscovery()[tool.name];
        const id = operationId(tool.name), summary = short(discoveryGuidanceText(canonical.description));
        const examples = (discovery?.examples ?? []).map(args => ({ tool: 'kanvas_call', arguments: { operationId: id, arguments: structuredClone(args) } }));
        const aliases = canonical.searchAliases;
        return { id, provider: 'kanvas', title: `${id.slice(7).replaceAll('.', ' ')}${operationTitles[tool.name] ? ` (${operationTitles[tool.name]})` : ''}`, summary, example: examples.length ? () => examples[0].arguments : undefined, keywords: `${operationExtras[tool.name] ?? ''} ${aliases.join(' ')} ${discovery?.hint ?? ''}`, text: `${canonical.description} ${schemaTerms(tool.inputSchema)}`, detail: () => (() => ({ id, operationId: id, title: id.slice(7).replaceAll('.', ' '), requiredInputs: tool.inputSchema.required ?? [], description: discoveryGuidanceText(canonical.description), guidance: discoveryGuidanceText(discovery?.hint ?? ''), inputSchema: profileSchema(tool.inputSchema), annotations: tool.annotations, examples, exampleNotice: 'Examples are valid syntax with illustrative IDs and source data. Substitute live authorized IDs/revisions; examples never grant consent.' }))() };
    });
}
export function canonicalForOperation(id: string): string | undefined { return operationTable().get(id)?.id; }
function authored(value: unknown): unknown {
    if (typeof value === 'string')
        return discoveryGuidanceText(value);
    if (Array.isArray(value))
        return value.map(authored);
    if (!value || typeof value !== 'object')
        return value;
    if ('tool' in value && 'arguments' in value)
        return discoveryExample(value);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, ['example', 'examples', 'recipes', 'arguments', 'schema', 'commonDataShapes'].includes(key) ? (Array.isArray(child) ? child.map(discoveryExample) : discoveryExample(child)) : authored(child)]));
}
/** Explicit summaries make the unified help list useful without a type facet. */
const HELP_SECTION_SUMMARIES: Record<string, string> = {
    'tour.title': 'Plan a live tour around the person’s actual work rather than a fixed demo deck.',
    'tour.description': 'Discover how an agent adapts a tour using authorized context and real available sources.',
    'tour.steps': 'Run a short personalized tour: select real sources, show relevant views, verify delivery and adapt.',
    'tour.introduction': 'Understand what Kanvas can display and how to begin a source-grounded visual conversation.',
    'tour.choices': 'Choose a first activity: show supplied content, compare options, or explore available views.',
    'tour.schemaTool': 'Look up a template’s complete validated shape before preparing unfamiliar content.',
    'getting-started.orientation': 'Recognize first contact, explain Kanvas, and connect a signed-in browser before choosing a visual.',
    'getting-started.steps': 'Human: open the bare Kanvas URL and sign in. Agent: find the receiver, submit authorized content, target it and verify paint.',
    'getting-started.location': 'Use consented viewer location, timezone and locale for local requests; never infer missing coordinates.',
    'getting-started.interaction': 'Keep routine mechanics quiet while explaining meaningful outcomes, required consent and unresolved failures.',
    'getting-started.viewerLink': 'Prefer connected-screen presentation; if a link is needed return shortUrl first. Locators never grant access.',
    'getting-started.sessionContinuity': 'Continue an explicitly selected session or returned target instead of guessing from recent activity.',
    'getting-started.continuityRecipe': 'Follow complete session-continuity examples for starting, targeting and resuming a display.',
    'tools.selection': 'Distinguish publication, viewport controls, structural edits and patches by their effects.',
    'tools.examples': 'Discover operation summaries, get an exact input schema, then call it with validated arguments.',
    'tools.exampleNotice': 'Treat examples as illustrative syntax, not source facts, live identifiers or permission to act.',
    'publishing.guidance': 'Publish source-preserving views, select targets and revisions, and distinguish preparation from browser paint.',
    'publishing.recipes': 'Use complete publication recipes for prepared views, contextual content and display targeting.',
    'publishing.commonDataShapes': 'Find common exact data shapes for text, charts, maps, media and other source-grounded views.',
    'publishing.schemaTool': 'Retrieve a template schema and examples from the templates catalog.',
    'publishing.exampleNotice': 'Replace illustrative publication data and identifiers with authorized live context.',
    'visual-intent.description': 'Recognize requests for visual assistance without treating quoted keywords as instructions.',
    'visual-intent.guidance': 'Choose one helpful visual beat that complements speech and preserves supplied facts.',
    'visual-intent.entry': 'Find the publication entry point and its source, intent and target requirements.',
    'visual-intent.examples': 'Apply visual intent through complete examples while preserving actual source data.',
    'templates.schemaTool': 'Get complete template schemas and publication examples by exact template ID.',
    'templates.publishing': 'Choose focused native templates, preserve source content, and avoid redundant screen titles.',
    'viewer-context.instructions': 'Read fresh, consented context from the intended receiving browser for weather, nearby and local-time tasks.',
    'viewer-context.readTool': 'Read the operation contract for viewer visibility, freshness, location, timezone and locale.',
    'viewer-context.refresh': 'Refresh viewer context when needed without persisting precise coordinates in notices.',
    'viewer-context.permissions': 'Respect denied, missing and ambiguous location permissions; never enable collection by inference.',
    'feedback.offer': 'Offer feedback once after confusion or errors, and file only with user request or consent.',
    'feedback.tools': 'Find feedback filing, error reporting, report reading, review and author follow-up capabilities.',
    'feedback.limits': 'Check exact title, description, reproduction and UTF-8 report-size limits before filing.',
    'feedback.instructions': 'File private contextual reports, read complete pages, follow up with revisions, and protect credentials.',
};
function helpSectionSummary(topic: string, section: string, value: unknown): string {
    const description = HELP_SECTION_SUMMARIES[`${topic}.${section}`];
    if (description)
        return description;
    // New authored sections must carry meaningful prose; fail rather than ship an ID-only stub.
    if (typeof value === 'string' && value.length > 40)
        return short(discoveryGuidanceText(value));
    throw new Error(`Missing useful help summary for ${topic}.${section}`);
}
/** Published task pages may pin an authored step boundary so guidance wording
 * changes do not move existing content between stable help IDs. */
const HELP_PAGE_STEP_BREAKS: Partial<Record<HelpTopic, readonly number[]>> = { navigation: [10] };
let helps: CatalogItem[] | undefined;
export function helpCatalog(): readonly CatalogItem[] {
    if (helps)
        return helps;
    const items: CatalogItem[] = [];
    const add = (id: string, title: string, summary: string, content: unknown, keywords?: string, priority?: string) => {
        const detail = { id, title, summary, content: authored(content), note: 'Static guidance. Use live authorized state and real source data; reading help never publishes.' };
        items.push({ id, provider: 'kanvas', title, summary, ...(keywords ? { keywords } : {}), ...(priority ? { priority } : {}), text: JSON.stringify(content), detail: () => detail });
    };
    for (const topic of HELP_TOPICS) {
        const page = HELP_PAGES[topic];
        // Split long task pages along authored step boundaries, never by token cuts.
        const chunks: string[][] = [];
        let current: string[] = [];
        const authoredBreaks = HELP_PAGE_STEP_BREAKS[topic];
        for (const [index, step] of page.steps.entries()) {
            if (current.length && (authoredBreaks ? authoredBreaks.includes(index) : current.join('').length + step.length > 4500)) {
                chunks.push(current);
                current = [];
            }
            current.push(step);
        }
        if (current.length)
            chunks.push(current);
        chunks.forEach((steps, i) => add(`kanvas.help.${topic}${i ? `.${i + 1}` : ''}`, `${page.title}${chunks.length > 1 ? ` — part ${i + 1}` : ''}`, page.description, { steps, ...(page.example ? { example: 'tool' in page.example ? discoveryExample(page.example) : { tool: 'kanvas_call', arguments: { operationId: 'kanvas.submit', arguments: 'version' in page.example && 'template' in page.example ? { requestId: `help-${topic}-example`, view: page.example } : Object.fromEntries(Object.entries(page.example).filter(([key]) => key !== 'operation')) } } } : {}) }, HELP_KEYWORDS[topic], i === 0 ? HELP_PRIORITY[topic] : undefined));
    }
    // The authored tour page already contains this guide in full. Metadata-only
    // schemaTool/exampleNotice sections become contextual notes, not fake topics.
    for (const topic of GUIDE_TOPICS) {
        if (topic === 'tour')
            continue;
        const guide = guideFor(topic);
        for (const [section, value] of Object.entries(guide)) {
            if (['topic', 'version', 'principle', 'note', 'groups', 'catalogue', 'topics', 'schemaTool', 'exampleNotice'].includes(section))
                continue;
            add(`kanvas.help.${topic}.${section.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`, `${topic.replaceAll('-', ' ')}: ${section}`, helpSectionSummary(topic, section, value), section === 'schemaTool' ? { tool: 'kanvas_discover', arguments: { catalog: 'templates', action: 'list' }, next: 'Choose the exact template ID, then get its full schema.' } : value);
        }
    }
    add('kanvas.help.tools.discovery', 'Discover and call Kanvas', 'List a complete catalog, search ranked alternatives, get exact schemas or help, then call validated operations.', {
        steps: [
            'This MCP connection exposes only kanvas_discover and kanvas_call. Refresh the connector after upgrades; former callable names are rejected.',
            'Choose catalog tools, templates or help. All help subjects share one catalog without a type filter; IDs provide natural grouping hints.',
            'action:list returns every visible ID and one-line description in plain text, with no default pagination. Only an explicit response-safety continuation can make the response incomplete; follow its cursor.',
            'action:search ranks natural-language alternatives as concise summaries, default five. It includes bounded examples where available, never full schemas or content. Matching totals and nextCursor show alternatives beyond the top matches.',
            'action:get returns full content for one exact ID. Tools include inputSchema, annotations and executable examples; templates include their complete schema and sample view; help includes focused guidance.',
            'If a host hides discovery parameters, pass catalog/action/id/query anyway, or use kanvas_call operationId kanvas.discover with nested discovery arguments. Reconnect after an upgrade to refresh tools/list.',
            'Then use kanvas_call with operationId and nested arguments. Discovering a capability, reading an example or possessing an ID is not authorization; preserve actual sources, permissions and revisions.',
        ],
        examples: [
            { tool: 'kanvas_discover', arguments: { catalog: 'tools', action: 'resolve', query: 'scroll to the bottom', sessionId: 'AUTHORIZED_SESSION_ID', displayId: 'AUTHORIZED_DISPLAY_ID' } },
            { tool: 'kanvas_call', arguments: { operationId: 'kanvas.discover', arguments: { catalog: 'tools', action: 'get', id: 'kanvas.tasklist.update' } } },
            { tool: 'kanvas_discover', arguments: { catalog: 'tools', action: 'list' } },
            { tool: 'kanvas_discover', arguments: { catalog: 'tools', action: 'search', query: 'restore a saved checklist on another monitor' } },
            { tool: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id: 'kanvas.checklist.show' } },
            { tool: 'kanvas_discover', arguments: { catalog: 'templates', action: 'get', id: 'kanvas.template.checklist' } },
        ],
    });
    return helps = items;
}
let templates: CatalogItem[] | undefined;
/** A slot that can hold any other view is described by reference, not by
 * embedding every template again. */
export const VIEW_SLOT = { type: 'object', required: ['template', 'data'], properties: { template: { type: 'string', description: 'A template ID from the templates catalog.' }, data: { type: 'object', description: 'That template\'s own data.' } }, description: 'Any native view: {template, data, optional title}. Its data shape is that template\'s own; get kanvas.template.<template> for it. Ask for expand:"full" on this get to receive the complete embedded union.' } as const;
export function collapseViewSlots<T>(schema: T): T {
    const root = structuredClone(schema) as Record<string, any>, defs: Record<string, any> = root.$defs ?? {};
    // Compacted schemas refer to shared definitions by $defs path or by a short local anchor that equals the definition's key.
    const refKey = (ref: unknown): string | undefined => typeof ref !== 'string' ? undefined : ref.startsWith('#/$defs/') ? ref.slice(8) : /^#[A-Za-z0-9_]+$/.test(ref) ? ref.slice(1) : undefined;
    const resolve = (node: any): any => { const key = node && typeof node === 'object' ? refKey(node.$ref) : undefined; return key !== undefined && Object.hasOwn(defs, key) ? defs[key] : node; };
    const templateOf = (branch: any): unknown => branch?.properties?.template?.const ?? resolve(branch?.properties?.template)?.const ?? resolve(branch)?.properties?.template?.const;
    const isUnion = (node: any): boolean => { const branches = node?.anyOf ?? node?.oneOf; return Array.isArray(branches) && branches.filter(branch => typeof templateOf(branch) === 'string').length >= 6; };
    const walk = (node: any): any => {
        if (Array.isArray(node))
            return node.map(walk);
        if (!node || typeof node !== 'object')
            return node;
        if (isUnion(node) || (refKey(node.$ref) !== undefined && isUnion(resolve(node))))
            return { ...VIEW_SLOT, ...(typeof node.description === 'string' ? { description: `${node.description} ${VIEW_SLOT.description}` } : {}) };
        return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, key === '$defs' ? value : walk(value)]));
    };
    const unions = new Set(Object.keys(defs).filter(key => isUnion(defs[key])));
    const body = walk(Object.fromEntries(Object.entries(root).filter(([key]) => key !== '$defs')));
    for (const key of Object.keys(defs))
        defs[key] = unions.has(key) ? { ...VIEW_SLOT, ...(defs[key].$anchor ? { $anchor: defs[key].$anchor } : {}) } : walk(defs[key]);
    // Keep only definitions the collapsed schema still reaches.
    const reachable = new Set<string>(), visit = (node: any): void => {
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        if (!node || typeof node !== 'object')
            return;
        const key = refKey(node.$ref);
        if (key !== undefined && Object.hasOwn(defs, key) && !reachable.has(key)) {
            reachable.add(key);
            visit(defs[key]);
        }
        for (const value of Object.values(node))
            visit(value);
    };
    visit(body);
    const kept = Object.fromEntries(Object.entries(defs).filter(([key]) => reachable.has(key)));
    const result = { ...(Object.keys(kept).length ? { $defs: kept } : {}), ...body };
    // Never return a schema with a reference that no longer resolves: keep the complete one instead.
    let dangling = false;
    const check = (node: any): void => { if (dangling)
        return; if (Array.isArray(node)) {
        node.forEach(check);
        return;
    } if (!node || typeof node !== 'object')
        return; if (typeof node.$ref === 'string') {
        const key = refKey(node.$ref);
        if (key === undefined ? node.$ref !== '#' : !Object.hasOwn(kept, key))
            dangling = true;
    } Object.values(node).forEach(check); };
    check(result);
    return (dangling ? schema : result) as T;
}
/** The shape, not the schema: the smallest valid view of a template, cut down
 * from its authored sample and re-validated. Falls back to the full sample. */
const minimal = new Map<string, unknown>();
export function minimalExample(template: TemplateId): unknown {
    if (minimal.has(template))
        return minimal.get(template);
    const { version: _version, ...sample } = samples[template] as unknown as Record<string, unknown>;
    const trim = (value: unknown, keep: number): unknown => Array.isArray(value) ? value.slice(0, keep).map(item => trim(item, keep)) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trim(item, keep)])) : value;
    let chosen: unknown = sample;
    if (JSON.stringify(sample).length > 420)
        for (const keep of [1, 2, 3]) {
            const candidate = trim(sample, keep);
            if (templateViewSchema(template).safeParse(candidate).success) {
                chosen = candidate;
                break;
            }
        }
    minimal.set(template, chosen);
    return chosen;
}
export function templateCatalog(): readonly CatalogItem[] {
    return templates ??= TEMPLATE_IDS.map(template => {
        const guidance = TEMPLATE_DISPLAY_GUIDANCE[template], concept = templateConcept(template);
        const details = new Map<string, Record<string, unknown>>();
        const build = (expand: 'own' | 'full') => (() => {
            const full = compactSchemaReferences(z.toJSONSchema(templateViewSchema(template), { unrepresentable: 'any', io: 'input', reused: 'ref' }));
            const schema = expand === 'full' ? full : collapseViewSlots(full);
            const collapsed = expand !== 'full' && JSON.stringify(schema).length < JSON.stringify(full).length;
            return { id: `kanvas.template.${template}`, template, title: templateNames[template], ...(concept ? { whenToUse: concept.when } : {}), description: guidance.primary, example: samples[template], minimalExample: minimalExample(template), guidance: discoveryGuidanceText(guidance.detail), ...(collapsed ? { nestedViews: 'Slots that hold another view are shown as a reference. Get that template for its data shape, or repeat this get with expand:"full" for the complete union.' } : {}), schema: profileSchema(schema), relatedOperations: workflowIds(template).flatMap(id => { const operation = operationCatalog().find(item => item.id === id); return operation ? [{ id, description: operation.summary, get: { tool: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id } } }] : []; }), workflow: WORKFLOW_NOTE, submitShape: SUBMIT_SHAPE, ...(template === 'planner' ? { commitmentBoundary: PLANNER_BOUNDARY } : {}), ...(template === 'chart' ? { variants: chartVariantSamples } : {}), examples: [{ tool: 'kanvas_call', arguments: { operationId: 'kanvas.submit', arguments: { requestId: 'template-example-1', view: samples[template] } } }], exampleNotice: 'Illustrative supplied data only; replace with real sources. Schema validates a complete view, not kanvas_call arguments.' };
        })();
        return { id: `kanvas.template.${template}`, provider: 'kanvas', title: templateNames[template], summary: concept?.when ?? guidance.primary, keywords: `${template} ${concept?.also ?? ''}${template === 'chart' ? ` ${Object.keys(chartVariantSamples).join(' ')}` : ''}`, text: `${guidance.primary} ${guidance.detail}`, example: () => minimalExample(template), detail: options => { const expand = options?.expand === 'full' ? 'full' : 'own'; if (!details.has(expand))
                details.set(expand, build(expand)); return details.get(expand)!; } };
    });
}
export const BUILTIN_PROVIDERS: readonly CatalogProvider[] = Object.freeze([
    { namespace: 'kanvas', kind: 'tool', list: () => operationCatalog() },
    { namespace: 'kanvas', kind: 'help', list: () => helpCatalog() },
    { namespace: 'kanvas', kind: 'template', list: () => templateCatalog() },
    { namespace: 'account', kind: 'template', list: (context: CatalogContext) => context.privateTemplates ?? [] },
]);
/** Context is required at every read; no global account-filtered cache. */
export class DiscoveryCatalog {
    constructor(private readonly providers: readonly CatalogProvider[] = BUILTIN_PROVIDERS) { }
    list(kind: CatalogKind, context: CatalogContext): CatalogItem[] {
        context.signal?.throwIfAborted();
        const items = this.providers.filter(provider => provider.kind === kind).flatMap(provider => provider.list(context).filter(item => {
            if (item.provider !== provider.namespace || !idSchema.safeParse(item.id).success || !item.id.startsWith(`${provider.namespace}.`))
                throw new Error('Invalid catalog provider namespace.');
            return !item.visible || item.visible(context);
        }));
        if (new Set(items.map(item => item.id)).size !== items.length)
            throw new Error('Duplicate catalog IDs.');
        return items.sort((a, b) => a.id.localeCompare(b.id, 'en'));
    }
    query(kind: CatalogKind, action: 'list' | 'search' | 'get', input: Record<string, unknown>, context: CatalogContext): Record<string, unknown> {
        const everything = this.list(kind, context);
        const all = action === 'list' && typeof input.prefix === 'string' ? everything.filter(item => item.id.startsWith(input.prefix as string)) : everything;
        const catalog = kind === 'tool' ? 'tools' : kind === 'template' ? 'templates' : 'help';
        if (action === 'get') {
            const item = all.find(item => item.id === input.id);
            if (!item)
                throw new InputError([{ path: 'id', problem: 'Unknown or unavailable catalog ID. Use kanvas_discover list or search in this catalog; copy the exact ID.' }]);
            context.signal?.throwIfAborted();
            const detail = item.detail({ expand: input.expand === 'full' ? 'full' : 'own' });
            // Never replace a large contract with a silently incomplete fragment.
            if (Buffer.byteLength(JSON.stringify(detail)) > SEARCH_RESULT_BYTES)
                throw new InputError([{ path: 'id', problem: 'This full catalog entry exceeds the response safety budget. No partial contract was returned; the catalog provider must split this entry into independently meaningful topics.' }]);
            return { catalog, action, entry: detail };
        }
        const query = action === 'search' ? String(input.query) : '';
        const ranked = action === 'search' ? new LocalSearch(all).search(query).map(row => row.document) : all;
        const binding = createHash('sha256').update(JSON.stringify([KANVAS_VERSION, kind, action, query, context.principal.userId, context.principal.agentId, context.principal.scopes, all.map(item => [item.id, item.revision, item.title, item.summary, item.keywords, item.text])])).digest('hex').slice(0, 24);
        let offset = 0;
        if (input.cursor) {
            const match = /^v2:([a-f0-9]{24}):(0|[1-9][0-9]{0,8})$/.exec(String(input.cursor));
            if (!match || match[1] !== binding || Number(match[2]) >= ranked.length)
                throw new InputError([{ path: 'cursor', problem: 'Cursor does not match this query, account or catalog. Restart without cursor.' }]);
            offset = Number(match[2]);
        }
        const limit = action === 'search' ? Number(input.limit ?? 5) : ranked.length;
        const withExamples = action === 'search' || input.examples === true;
        const results: {
            id: string;
            description: string;
            example?: unknown;
        }[] = [];
        let bytes = 0;
        for (const item of ranked.slice(offset, offset + limit)) {
            context.signal?.throwIfAborted();
            const example = withExamples ? item.example?.() : undefined;
            const summary = { id: item.id, description: item.summary.replace(/\s+/g, ' ').trim(), ...(example !== undefined && JSON.stringify(example).length <= 1500 ? { example } : {}) };
            const size = Buffer.byteLength(JSON.stringify(summary)) + 8;
            if (size > SEARCH_RESULT_BYTES)
                throw new InputError([{ path: 'catalog', problem: 'A catalog summary exceeds the response safety budget; provider must supply a concise summary.' }]);
            if (results.length && bytes + size > SEARCH_RESULT_BYTES)
                break;
            bytes += size;
            results.push(summary);
        }
        const next = offset + results.length;
        return { catalog, action, ...(action === 'search' ? { query, retrieval: 'local weighted lexical + curated concepts + typo matching' } : {}), total: ranked.length, catalogTotal: all.length, returned: results.length, offset, results, complete: next === ranked.length, nextCursor: next < ranked.length ? `v2:${binding}:${next}` : null, note: action === 'search' ? 'Ranked summaries, each with a minimal valid example where one exists (a template example is a view for kanvas.submit; an operation example is kanvas_call arguments). Get exact IDs for full details. More matches are available when nextCursor is present.' : 'Complete visible inventory unless an explicit response-size continuation is shown. Get exact IDs for full details.' };
    }
}
export const discoveryCatalog = new DiscoveryCatalog();
export function discoveryResult(name: string, raw: unknown, context: CatalogContext): CallToolResult {
    const input = parseDiscoveryInput(name, raw);
    if (name !== 'kanvas_discover')
        throw new InputError([{ path: 'tool', problem: 'Execution must use the authorized operation dispatcher.' }]);
    if (input.action === 'resolve')
        throw new InputError([{ path: 'action', problem: 'Resolve requires the authenticated service dispatcher.' }]);
    const kind = input.catalog === 'tools' ? 'tool' : input.catalog === 'templates' ? 'template' : 'help';
    const data = discoveryCatalog.query(kind, input.action as 'list' | 'search' | 'get', input, context);
    if (input.action === 'list') {
        const lines = (data.results as {
            id: string;
            description: string;
            example?: unknown;
        }[]).map(item => `${item.id} — ${item.description}${item.example !== undefined ? ` Example: ${JSON.stringify(item.example)}` : ''}`);
        const header = `${input.catalog}${input.prefix ? ` (prefix ${input.prefix})` : ''}: ${data.returned} of ${data.total} visible entries${data.complete ? ' (complete)' : ' (INCOMPLETE: response-size safety limit)'}.`;
        const continuation = data.nextCursor ? `Continue with kanvas_discover catalog=${input.catalog} action=list cursor=${data.nextCursor}. No entries are omitted between pages.` : '';
        return { content: [{ type: 'text', text: [header, ...lines, continuation, 'Use kanvas_discover action=get with catalog and exact id for full detail.', ...(input.catalog === 'tools' ? ['Resolve one intent with action:resolve and explicit context: filter/sort/highlight; navigate/scroll/zoom; patch/edit; publish/target; inspect/interaction. Recorded metrics: kanvas.activity.read and kanvas.analytics.read.'] : [])].filter(Boolean).join('\n') }] };
    }
    const result = { data, ...(input.catalog === 'tools' && input.action === 'search' ? { intentExamples: INTENT_EXAMPLES, metrics: ['kanvas.activity.read', 'kanvas.analytics.read'] } : {}), server: { name: 'kanvas', version: KANVAS_VERSION, profile: 'discovery', tools: 2, operations: operationCatalog().length } };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
