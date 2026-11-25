import {randomUUID} from 'node:crypto';
import type {KanvasService} from '../domain.js';
import type {AuthPrincipal} from '../auth.js';
import {CANONICAL_TOOLS} from './canonical.js';
import {operationCatalog} from './discovery.js';
import {intentResolveSchema,INTENT_EXAMPLES} from './intent-schema.js';
import {templateViewSchema} from '../../shared/view-schemas.js';
import {navigationCapabilities,navigationLeaf} from '../../shared/navigation.js';
import {selectionKey} from '../../shared/selection.js';
import {logEntries,type LogData} from '../../shared/task-views.js';
const boundary='Read-only discovery; no execution or consent. Execute with kanvas_call only after the host checks user intent and operation annotations. Re-resolve after revision/target changes. Browser delivery requires actual acknowledgements.';
export async function resolveIntent(service: KanvasService, p: AuthPrincipal, raw: unknown) {
    const input = intentResolveSchema.parse(raw), query = input.query.toLowerCase(), parameters = input.parameters ?? {};
    const choices = [
        { name: "kanvas.selection.set", family: 'filter/sort/highlight', match: /\b(filter|sort|highlight|only errors|only warnings)\b/.test(query) },
        { name: "kanvas.navigation.control", family: 'navigate/scroll/zoom', match: /\b(navigate|scroll|zoom|next page|previous page)\b/.test(query) },
        { name: "kanvas.view.patch", family: 'patch/edit', match: /\b(patch|edit|append|replace)\b/.test(query) },
        { name: "kanvas.publish", family: 'publish/target', match: /\b(publish|show supplied|send supplied)\b/.test(query) },
        { name: /\b(interaction|interactions|clicks|feedback)\b/.test(query) ? "kanvas.interactions.read" : "kanvas.display.current", family: 'inspect/interaction', match: /\b(inspect|current screen|interactions|clicks|feedback)\b/.test(query) },
    ].filter(x => x.match);
    await service.fullAccount(p);
    if (/\b(calculate|compute|aggregate|average|median|sum)\b/.test(query) || (/\b(overview|root window)\b/.test(query) && /\b(navigate|scroll|zoom)\b/.test(query)))
        return { status: 'unsupported', missingFields: ['intent outside this resolver'], uncertainty: ['No calculation or root-window targeting is inferred. Use existing search/get for the exact capability and supply any computed source data.'], examples: INTENT_EXAMPLES, boundary };
    if (choices.length !== 1)
        return { status: choices.length ? 'ambiguous' : 'unsupported', alternatives: choices.map(x => ({ operationId: x.name, family: x.family })), missingFields: ['intent'], uncertainty: ['Choose one supported intent; aggregation/computation and arbitrary language inference are not performed.'], examples: INTENT_EXAMPLES, boundary };
    const choice = choices[0], definition = CANONICAL_TOOLS.find(x => x.name === choice.name)!, operationId = choice.name, detail = operationCatalog().find(x => x.id === operationId)!.detail();
    const args: Record<string, unknown> = { ...parameters }, sources: Record<string, string> = {}, missing = new Set<string>(), uncertainty: string[] = [];
    for (const field of Object.keys(args))
        sources[field] = 'explicit parameters';
    const contextSession = input.sessionId ?? input.activeContext?.sessionId;
    // Explicit operation/session target always wins over contextual binding.
    let sessionId = input.sessionId ?? (typeof args.sessionId === 'string' ? args.sessionId : undefined) ?? contextSession;
    let displayId = input.displayId ?? (typeof args.displayId === 'string' ? args.displayId : undefined) ?? (choice.name === "kanvas.publish" && Array.isArray(args.displayIds) && args.displayIds.length === 1 && typeof args.displayIds[0] === 'string' ? args.displayIds[0] : undefined);
    let targetDisplays: string[] | undefined;
    if (input.targetRef && !input.sessionId && !args.sessionId) {
        const binding = await service.publication.resolveTarget(p, input.targetRef);
        sessionId = binding.sessionId;
        targetDisplays = binding.displayIds;
    }
    const set = (field: string, value: unknown, source: string) => { args[field] = value; sources[field] = source; };
    const base = { operationId, family: choice.family, inputSchema: detail.inputSchema, annotations: detail.annotations, rationale: choice.family + ' using an existing operation', boundary };
    // Malformed explicit IDs must not be replaced by contextual or sole-display guesses.
    const invalidTargets = ['sessionId', 'displayId'].filter(field => !(field === 'sessionId' ? input.sessionId : input.displayId) && Object.hasOwn(parameters, field) && (typeof parameters[field] !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(parameters[field] as string)));
    if (invalidTargets.length)
        return { ...base, status: 'needs_input', arguments: args, fieldSources: sources, missingFields: invalidTargets, uncertainty: ['Correct explicit target IDs; invalid supplied targets never fall back to contextual targets.'], next: 'Supply valid explicit IDs and resolve again.' };
    if (!sessionId) {
        const available = (await service.sessions(p)).filter(s => !s.endedAt), targets = available.slice(0, 12).map(s => ({ sessionId: s.id, name: s.name }));
        return { ...base, status: 'needs_context', arguments: args, fieldSources: sources, missingFields: ['sessionId'], possibleTargets: targets, possibleTargetsTruncated: available.length > 12, uncertainty: ['No explicit session context. Choose a target; even one available session is not selected implicitly.'], next: 'Supply an authorized sessionId or activeContext and resolve again.' };
    }
    await service.access(p, sessionId, definition.readOnly ? 'viewer' : 'editor');
    set('sessionId', sessionId, input.sessionId ? 'explicit' : args.sessionId ? 'explicit parameters' : input.targetRef ? 'authorized targetRef' : 'activeContext');
    let display: Awaited<ReturnType<KanvasService['display']>> | undefined;
    if (choice.name !== "kanvas.interactions.read") {
        const candidates = (await service.store.list<{
            id: string;
            name: string;
        }>('display', sessionId)).filter(d => (!p.scopedDisplayId || d.id === p.scopedDisplayId) && (!targetDisplays || targetDisplays.includes(d.id)));
        if (!displayId && candidates.length === 1) {
            displayId = candidates[0].id;
            sources.displayId = 'sole display in explicit authorized session';
        }
        if (!displayId) {
            missing.add('displayId');
            return { ...base, status: 'needs_context', arguments: args, fieldSources: sources, missingFields: [...missing], possibleTargets: candidates.map(d => ({ sessionId, displayId: d.id, name: d.name })), uncertainty: ['Select an explicit display.'], next: 'Resolve again with displayId.' };
        }
        if (targetDisplays && !targetDisplays.includes(displayId))
            return { ...base, status: 'needs_input', arguments: args, fieldSources: sources, missingFields: ['displayId'], uncertainty: ['Explicit display does not belong to targetRef. Choose a bound display or remove the reference and resolve with an explicit session.'], next: 'Resolve again with consistent targets.' };
        display = await service.display(p, sessionId, displayId, definition.readOnly ? 'viewer' : 'editor');
        set('displayId', displayId, sources.displayId ?? 'explicit');
    }
    if (!definition.readOnly) {
        if (args.requestId === undefined)
            set('requestId', randomUUID(), 'generated unique retry ID; retain for identical retry');
        if (display && choice.name !== "kanvas.publish") {
            if (args.expectedRevision !== undefined && args.expectedRevision !== display.revision) {
                missing.add('expectedRevision (supplied revision is stale or invalid; review edits against current state)');
                uncertainty.push('Current authorized display revision: ' + display.revision);
            }
            else
                set('expectedRevision', display.revision, 'live authorized display revision');
        }
    }
    if (display?.held && !definition.readOnly && choice.name !== "kanvas.navigation.control")
        missing.add('display (held; host must resolve hold explicitly)');
    const view = display?.view ? navigationLeaf(display.view) : null;
    if (choice.name === "kanvas.selection.set") {
        const key = view && selectionKey(view), rows = view?.template === 'log' ? logEntries(view.data as LogData) : key ? view?.data[key] : undefined;
        if (!key || !Array.isArray(rows))
            missing.add('selection (current view has no supported record collection)');
        else if (args.selection === undefined) {
            const level = /\berrors?\b/.test(query) ? 'error' : /\bwarnings?\b/.test(query) ? 'warn' : undefined;
            const fieldMatch = /\bsort by ([a-zA-Z0-9_.-]+)\b/i.exec(input.query);
            if (fieldMatch) {
                const field = fieldMatch[1];
                if (rows.some(r => r && typeof r === 'object' && Object.hasOwn(r, field)))
                    set('selection', { sort: [{ field, direction: /\b(descending|desc)\b/.test(query) ? 'desc' : 'asc' }] }, 'intent + verified source field');
                else
                    missing.add('selection.sort.field (not present in current source)');
            }
            else if (level && rows.some(r => r && typeof r === 'object' && 'level' in r && r.level === level)) {
                set('selection', { [/\bhighlight\b/.test(query) ? 'highlight' : 'where']: [{ field: 'level', op: 'eq', value: level }] }, 'intent + verified source level value');
            }
            else
                missing.add('selection (supply field/operator/value; no matching source value inferred)');
        }
    }
    if (choice.name === "kanvas.navigation.control") {
        if (args.navigation === undefined) {
            const navigation = /\bzoom in\b/.test(query) ? { action: 'zoom', direction: 'in' } : /\bzoom out\b/.test(query) ? { action: 'zoom', direction: 'out' } : /\breset zoom\b/.test(query) ? { action: 'zoom', direction: 'reset' } : /\bscroll.*bottom\b/.test(query) ? { action: 'scroll', y: 1 } : /\bscroll.*top\b/.test(query) ? { action: 'scroll', y: 0 } : /\bnext page\b/.test(query) ? { action: 'page', direction: 'next' } : /\bprevious page\b/.test(query) ? { action: 'page', direction: 'previous' } : undefined;
            if (navigation)
                set('navigation', navigation, 'curated intent');
            else
                missing.add('navigation');
        }
        const nav = args.navigation as {
            action?: string;
        } | undefined, caps = navigationCapabilities(display?.view ?? null);
        if (nav?.action && !({ page: caps.paging, scroll: caps.scroll, zoom: caps.zoom } as Record<string, boolean>)[nav.action])
            missing.add('navigation (current view capability unsupported by this resolver)');
        const viewers = await service.experience.viewers(p, sessionId, displayId);
        const live = viewers.filter(v => v.connected !== false);
        if (nav?.action === 'zoom') {
            if (args.viewerId && !live.some(v => v.id === args.viewerId))
                missing.add('viewerId (not live on this display)');
            else if (!args.viewerId && live.length === 1)
                set('viewerId', live[0].id, 'sole live viewer on authorized display');
            else if (!args.viewerId)
                missing.add('viewerId');
        }
        if (!live.length)
            uncertainty.push('No live viewer; no browser application can be assumed.');
    }
    if (choice.name === "kanvas.view.patch" && args.operations === undefined)
        missing.add('operations (supply exact edits; content is never invented)');
    if (choice.name === "kanvas.publish") {
        delete args.displayId;
        delete sources.displayId;
        if (args.displayIds !== undefined && (!Array.isArray(args.displayIds) || args.displayIds.length !== 1 || args.displayIds[0] !== displayId))
            missing.add('displayIds (resolve supports one matching explicit target; use submit schema for multiple destinations)');
        if (args.displayIds === undefined)
            set('displayIds', [displayId!], 'explicit authorized destination');
        // submit has no revision guard in its current schema; never invent one.
        if (args.view === undefined)
            missing.add('view (supply source-preserving prepared content)');
        else {
            const supplied = args.view as {
                template?: unknown;
            };
            if (!supplied || typeof supplied.template !== 'string')
                missing.add('view.template');
            else
                try {
                    const parsed = templateViewSchema(supplied.template as Parameters<typeof templateViewSchema>[0]).safeParse(supplied);
                    if (!parsed.success)
                        for (const issue of parsed.error.issues)
                            missing.add('view.' + issue.path.join('.'));
                }
                catch {
                    missing.add('view.template');
                }
        }
    }
    // Validate using the actual current canonical operation schema, not a duplicate.
    const validated = definition.schema.safeParse(args);
    if (!validated.success)
        for (const issue of validated.error.issues)
            missing.add(issue.path.join('.') || 'arguments');
    const ready = missing.size === 0 && validated.success;
    const argumentsOut = validated.success ? validated.data : args;
    const fields: Record<string, string> = {};
    const provenance = (value: unknown, path = '') => { if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            const next = path ? path + '.' + k : k;
            const original = next.split('.').reduce<unknown>((v, k) => v && typeof v === 'object' && Object.hasOwn(v, k) ? (v as Record<string, unknown>)[k] : undefined, args);
            fields[next] = original === undefined ? 'schema default' : sources[next] ?? sources[next.split('.')[0]] ?? 'explicit parameters';
            provenance(v, next);
        }
    } };
    provenance(argumentsOut);
    for (const field of missing)
        fields[field] = 'missing';
    return { ...base, status: ready ? 'ready' : 'needs_input', arguments: argumentsOut, fieldSources: fields, missingFields: [...missing], uncertainty, next: ready ? 'kanvas_call' : 'Supply missing fields in parameters and resolve again.', ...(ready ? { call: { tool: 'kanvas_call', arguments: { operationId, arguments: argumentsOut } } } : {}), delivery: "Submission acceptance is not browser paint. Inspect kanvas_call with operationId:\"kanvas.update.status\" and arguments:{\u2026} or kanvas_call with operationId:\"kanvas.navigation.read\" and arguments:{\u2026} receipts after execution." };
}

