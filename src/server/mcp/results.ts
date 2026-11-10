import {samples} from '../../shared/template-examples.js';
import { workflowIds, WORKFLOW_NOTE, PLANNER_BOUNDARY, SUBMIT_SHAPE } from './workflow-guidance.js';
import { operationCatalog } from './discovery.js';
import { ProtocolError, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { InputError, validationIssues, type ValidationIssue } from '../input-errors.js';
import { AppError } from '../store.js';
import { RenderingError } from '../rendering/errors.js';
import { TEMPLATE_IDS, type TemplateId } from '../../shared/types.js';
import { VisualCaptureResult } from '../visual-capture.js';
import { orientationFor } from './guide.js';
import { operationId, isGrouped, operationEntries, publicGuidanceText, publicReference, toolNames, type McpProfile } from './operations.js';
import { interactionRoutes, profileResultData, trustedGuidance } from './profile-guidance.js';
import { KANVAS_VERSION } from '../../shared/version.js';

// Keep the expanded composite template contract intact; ordinary data remains bounded.
export const MAX_TOOL_RESULT_BYTES = 96 * 1024;
export const MAX_RESOURCE_BYTES = 256 * 1024;
export const mcpServerInfo = (profile: McpProfile) => ({ name: 'kanvas', version: KANVAS_VERSION, profile, tools: isGrouped(profile) ? toolNames(profile).length : operationEntries(profile).length, operations: profile === 'discovery' ? operationCatalog().length : operationEntries(profile).length });

export interface SafeError { wouldRemoveIds?:string[]; layer?:string; example?:unknown; validateTool?:string; currentRevision?:number; expectedRevision?:number; code: string; message: string; issues?: ValidationIssue[]; schemaTool?: string; topic?: string; template?: TemplateId; diagnosticId?: string }

const messages: Record<string, string> = {
  NAVIGATION_UNAVAILABLE:'This action or page is unavailable for the current view. Read navigation.read for supported actions and pageCount. See /docs/navigation.',
  VIEWER_UNAVAILABLE:'Select a connected viewer using viewers.read.',
  PRESENTER_REQUIRED:'Select a connected presenterViewerId from viewers.read before enabling presenter mode.',
  PRESENTER_ONLY:'This session follows its designated presenter. Only that viewer or an authorized editor can cue navigation.',
  EMPTY_VIEW:'Publish content before pinning the view.',
  UNAUTHORIZED: 'Publisher authorization is required or has expired.',
  FORBIDDEN: 'This publisher is not authorized for this operation.',
  NOT_FOUND: 'The requested item is unavailable to this publisher.',
  INVALID_ARGUMENT: 'Invalid arguments. Check the tool schema and referenced session state.',
  CONFLICT: 'State changed or a request ID was reused with different content. Read current state before retrying.',
  REVISION_CONFLICT: 'The expected revision is stale. Read current state before retrying.',
  PATCH_UNSUPPORTED: 'This patch does not address a supported data field. Read the current view and use /data/... paths.',
  PATCH_PATH_CONFLICT: 'A patch path does not match the current view. Read current state before retrying.',
  PATCH_PARTICIPATION_CONFLICT: 'This patch would change the question or response identity. Publish a new view to start new participation.',
  PATCH_SOURCE_CONFLICT: 'This patch would replace authoritative source-bound data. Update the source or publish a new validated view instead.',
  DISPLAY_HELD: 'The display is held. Release it explicitly before starting source updates.',
  MONITORING_ACTIVE: 'This display already has an active source. Read or update the existing monitoring job instead.',
  MONITORING_STOPPED: 'This source job has stopped. Start a new job explicitly if updates are still wanted.',
  MONITORING_SUPERSEDED: 'The display or its configuration changed. Source updates stopped without overwriting the new content.',
  MONITORING_IMAGE_UNAVAILABLE: 'The source did not provide a supported raster image. The last valid view is retained.',
  REQUEST_ID_CONFLICT: 'This request ID was already used with different input. Read the prior result or use a new request ID.',
  LIMIT_REACHED: 'A bounded storage, active-job or request limit was reached. Stop unused source jobs or reduce the stored content.',
  SERVICE_CLOSED: 'The service is stopping. Retry after it reconnects.',
  LIMIT_EXCEEDED: 'A configured size, count, or request-rate limit was exceeded.',
  SESSION_ENDED: 'This session has ended.',
  UNAVAILABLE: 'The requested service is temporarily unavailable.',
  INTERNAL_ERROR: 'KANVAS could not complete this operation.',
  HISTORY_BOUNDARY: 'There is no retained view in that direction or at that revision. Read kanvas_display_history for available positions.',
  NOT_VIDEO: 'The current view does not contain a controllable video. Publish video content first.',
  NOT_TIMER: 'The active view is not a countdown/count-up. Select its presentation slide or publish a timer first.',
  NOT_PRESENTATION: 'The current view is not a presentation. Read the display before navigating.',
  INVALID_SLIDE: 'The slide index is outside this presentation. Read its current index and slide count; indexes start at zero.',
  PUBLISH_SETUP_DISABLED: 'Automatic publishing setup is disabled on this server. Supply the existing sessionId and displayIds explicitly.',
  SESSION_CREATION_FORBIDDEN: 'This connection has selected-session access and cannot create another session. Select an authorized session, or explicitly change the connection grant in its settings. Creating a session elsewhere does not extend this grant.',
  TARGET_CHOICE_EXPIRED: 'This publication choice is expired or unavailable. Start with a new requestId; no content was published by the unresolved choice.',
  TIMER_ALREADY_PAUSED: 'This timer is already paused. Resume it, or retry the exact original pause request to retrieve its receipt.',
  TIMER_NOT_PAUSED: 'This timer is not paused. Read its current state; a new resume action needs a stored paused duration.',
  TIMER_NOT_STARTED: 'This count-up has a future start. Wait until startedAt before pausing; the scheduled start is unchanged.',
  TIMER_COMPLETE: 'This countdown is complete. Publish a new explicit deadline to start a new timer.',
  TIMER_SOURCE_CONFLICT: 'Timer validation would change unrelated source content. Refresh the current view before trying a new action.',
  TIMER_RANGE: 'The timer duration cannot be represented within its supported range. Read the countdown schema; no time or display state was changed.',
  SNAPSHOT_BUSY: 'Snapshot capacity is busy. Retry shortly; at most six captures per account per minute.',
  SNAPSHOT_CHANGED: 'The display changed during capture. Read current state and retry against the new revision.',
  SNAPSHOT_UNAVAILABLE: 'The isolated server browser could not capture this view. Inspect the authenticated viewer URL or report this diagnostic.',
  SNAPSHOT_TOO_LARGE: 'The capture exceeds 2 MiB. Request a smaller viewport.',
  RENDER_TIMEOUT: 'Rendering exceeded its configured work deadline. Inspect per-display rendering timing before retrying with a new request ID.',
  INVALID_VIEW: 'The current view does not support this operation. Read kanvas_display_current and the relevant template schema.',
  INVALID_TARGET: 'The annotation target does not match the current source, image or chart point. Refresh the display and retry.',
  INVALID_CURSOR: 'This cursor is no longer retained. Read the first page again.',
  REQUEST_CLOSED: 'This request has already been decided or has expired. Ask the intended browser to request access again.',
  CONFIRM_REQUIRED: 'Explicit owner confirmation of the requesting browser is required.',
  ALIAS_CAPACITY: 'A short address could not be reserved. The full authenticated display URL still works.',
};

const renderingMessages: Record<string, string> = {
  PREPARED_VIEW_REQUIRED: 'Supply an explicit templateHint with schema-valid literal data, or a prepared view {version:1,template,data}. Kanvas does not generate missing content.',
  INVALID_SOURCE_CONTENT: 'Supplied content does not match the template. Read its schema and supply a valid prepared view.',
  INVALID_MEDIA: 'Decoded bytes do not match a supported complete file. Supply the original file bytes as canonical base64 and the matching MIME type (PNG: image/png). Do not send a path, a data URL, compressed JSON or a truncated string. Re-encode the original file, then retry; no asset was saved.',
  INVALID_MEDIA_NAME: 'Use a filename of 1–200 characters without path separators or control characters; for example plot.png.',
  INVALID_MEDIA_BASE64: 'base64 must be canonical padded file-byte base64 without whitespace or a data:image prefix. Encode the original PNG file bytes once, not a pathname or an already-base64 string.',
  MEDIA_TOO_LARGE: 'Media must be nonempty and at most 10 MiB decoded, with image dimensions at most 20000 per side and 64 million pixels. Resize the original file or choose a smaller file.',
  UNSUPPORTED_MEDIA_TYPE: 'Supply a supported image MIME type (PNG, JPEG, GIF, WebP, AVIF or passive SVG), MP4/WebM video, or PDF. HTML is not an image.',
  INVALID_TRANSCRIPT_SOURCE: 'Supply the exact transcript words in context, or complete data.segments with literal text. An intent or live-status label is not transcript content.',
  INVALID_TABLE_SOURCE: 'Supply a complete table with valid columns and literal scalar rows, or an accessible dataset binding. Nested object cells or missing rows are source errors, not rendering failures.',
  INVALID_CONTENT: 'The supplied content exceeds a schema, size or complexity limit. Check the exact template contract.',
  UNBOUND_SOURCE: 'This template requires exact supplied text, playback or date/time records; they cannot be invented by the renderer.',
  INVALID_DRAFT_SOURCE: 'Supply exact draft text in data.text or context. Suggestions and focus must address existing UTF-16 ranges in that text.',
  INVALID_PLAYBACK_SOURCE: 'Supply actual track and artist fields, plus optional genuine artwork/state/positions. KANVAS neither connects to a music service nor estimates playback.',
  INVALID_CHART_SOURCE: 'Supply the observations, weights, ranges or geometry required by the selected chart kind. Inspect kanvas_template_get for the exact contract.',
  MISSING_WEB_SOURCE: 'Web rendering needs data.url, source.url, or an uploaded page snapshot. Descriptive prose alone is not fetched page content; use a document or whiteboard for a mock-up.',
  INVALID_WEB_SOURCE: 'Supply a supported public source URL or protected snapshot asset for web rendering.',
  MISSING_TABLE_SOURCE: 'Supply datasetId, structured rows, or an exact inline Markdown/CSV/JSON table before requesting a table or chart.',
  MISSING_CODE_SOURCE: 'Supply the actual code bytes, not only a description of code, with templateHint code.',
  INVALID_CODE_SOURCE: 'The supplied code does not match the code/diff/structure source schema. Read kanvas_template_get for code.',
  MISSING_MAP_SOURCE: 'Supply coordinates or route geometry before requesting a map. KANVAS does not geocode descriptions.',
  INVALID_MAP_SOURCE: 'The supplied map records do not match the coordinate/geometry contract.',
  MISSING_TIME_SOURCE: 'Supply exact schedule records, timezone-qualified countdown endsAt, or direction:up with timezone-qualified startedAt.',
  CONTEXT_TOO_LARGE: 'Maximum intent is 1000 characters and context is 12000 characters. Import longer structured sources as datasets or assets.',
  INVALID_INLINE_DATA: 'The inline source cannot be parsed losslessly. Supply valid Markdown/CSV/JSON rows or use kanvas_dataset_import.',
  INVALID_DATASET: 'The dataset has invalid rows, cells or columns. Use unique column names (maximum 200 characters), at most 64 columns and consistent CSV widths.',
  DATASET_TOO_LARGE: 'Dataset limits are 5 MiB parsed, 20000 rows, 64 columns and 20000 characters per cell; MCP text imports are limited to 2 MiB.',
  DATASET_NOT_FOUND: 'The selected source dataset is unavailable in this session.',
  ASSET_NOT_FOUND: 'The selected media asset is unavailable in this session.',
  INVALID_ASSET_REFERENCE: 'The selected asset does not support this template. Choose compatible media or use its attachment link.',
};

/** Domain/transport exceptions may contain credentials, SQL, or private inputs. Never echo them. */
export function safeError(error: unknown): SafeError {
  if(error instanceof AppError && 'currentRevision' in error && Number.isSafeInteger(error.currentRevision))return {code:error.code,message:error.message,currentRevision:error.currentRevision as number,expectedRevision:error.currentRevision as number};
  if (error instanceof InputError || error instanceof z.ZodError) return {
    layer:error instanceof InputError&&error.template?'template':'operation-envelope',validateTool:'kanvas.view.validate',
    ...(error instanceof InputError&&error.template&&Object.hasOwn(samples,error.template)?{example:samples[error.template as TemplateId]}:{}),
    code: 'INVALID_ARGUMENT', message: (error instanceof InputError ? error.message : new InputError(validationIssues(error)).message).slice(0, 700),
    issues: error instanceof InputError ? error.issues : validationIssues(error),
    ...(error instanceof InputError && Array.isArray((error as InputError & {wouldRemoveIds?:unknown}).wouldRemoveIds) ? { wouldRemoveIds: (error as InputError & {wouldRemoveIds:string[]}).wouldRemoveIds } : {}),
    ...(error instanceof InputError && error.guidance ? error.guidance : error instanceof InputError && error.template ? { schemaTool: 'kanvas_template_get' } : { schemaTool: 'kanvas_guide', topic: 'tools' }),
    ...(error instanceof InputError && (TEMPLATE_IDS as readonly string[]).includes(error.template as string) ? { template: error.template as TemplateId } : {}),
  };
  // These errors can arise during authoritative inline-source validation,
  // before rendering. They are not server crashes.
  if (error instanceof RenderingError) return {
    layer:'template',validateTool:'kanvas.view.validate',
    code: Object.hasOwn(renderingMessages, error.code) ? error.code : 'INVALID_ARGUMENT',
    message: renderingMessages[error.code] ?? 'The supplied content or source binding could not be validated. Check the exact template/source contract.',
    ...(error.issues?.length ? { issues: error.issues.map(issue => ({path: issue.path.slice(0, 160), problem: (issue.rule ?? issue.code).slice(0, 300)})) } : {}),
    schemaTool: 'kanvas_template_get',
  };
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const rawCode = typeof value.code === 'string' ? value.code.toUpperCase() : '';
  const status = value.status ?? value.statusCode;
  const statusCode = typeof status === 'number' ? status : 500;
  const fallback = statusCode === 401 ? 'UNAUTHORIZED'
    : statusCode === 403 ? 'FORBIDDEN'
    : statusCode === 404 ? 'NOT_FOUND'
    : statusCode === 409 ? 'CONFLICT'
    : statusCode === 413 || statusCode === 429 ? 'LIMIT_EXCEEDED'
    : statusCode === 400 || statusCode === 422 ? 'INVALID_ARGUMENT'
    : statusCode === 503 || statusCode === 504 ? 'UNAVAILABLE' : 'INTERNAL_ERROR';
  const code = Object.hasOwn(messages, rawCode) ? rawCode : fallback;
  // Application validation errors carry developer-authored, actionable text.
  // Keep it with an issues array so no caller receives a bare INVALID_ARGUMENT.
  if (error instanceof AppError && (statusCode === 400 || statusCode === 422)) {
    const detail = error.message.slice(0, 300);
    return { code, message: `${messages[code] ?? ''} ${detail}`.trim().slice(0, 700), issues: [{ path: 'arguments', problem: rawCode && rawCode !== code ? `${rawCode}: ${detail}` : detail }] };
  }
  return { code, message: messages[code] };
}

export function toolFailure(error: unknown, diagnosticId?: string, profile: McpProfile = 'legacy', canonicalName?: string): CallToolResult {
  const failure = { ...safeError(error), ...(diagnosticId ? { diagnosticId } : {}) };
  const grouped = isGrouped(profile);
  const help = grouped ? publicReference('kanvas_help', profile)! : { tool: 'kanvas_inspect', operation: 'help.read' };
  const state = grouped ? publicReference('kanvas_session_state', profile)! : { tool: 'kanvas_inspect', operation: 'session.state' };
  const operation = canonicalName ? operationCatalog().find(item => item.id === operationId(canonicalName)) : undefined;
  const recovery = profile === 'discovery' && failure.code === 'INVALID_ARGUMENT' && operation ? { operationId: operation.id, get: { tool: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id: operation.id } }, ...(operation.id === 'kanvas.submit' ? { shape: SUBMIT_SHAPE } : {}), ...(failure.template ? { template: { tool: 'kanvas_discover', arguments: { catalog: 'templates', action: 'get', id: `kanvas.template.${failure.template}` } } } : {}), examples: ((operation.detail().examples ?? []) as unknown[]).filter(example => JSON.stringify(example).length < 2500).slice(0, 1), note: 'Examples are syntax only and never grant consent. Substitute authorized IDs, preserve source data, and obtain any missing explicit approval rather than copying confirm:true. Validation made no change; do not retry unchanged.' } : undefined;
  const projected = grouped ? trustedGuidance(failure) as typeof failure : failure;
  const result = { error: { ...projected, ...(recovery ? { schemaTool: 'kanvas_discover', schemaArguments: recovery.template?.arguments ?? recovery.get.arguments } : {}) }, ...(recovery ? { recovery } : {}), server: mcpServerInfo(profile), docs:{path:'/docs/recovery',help:profile === 'discovery' ? { tool: 'kanvas_discover', arguments: { catalog: 'help', action: 'get', id: 'kanvas.help.recovery' } } : {...help,topic:'recovery'}} };
  const detail = { type: 'text' as const, text: JSON.stringify(result) };
  const headline = `${result.error.code}: ${result.error.message}${diagnosticId ? ` Diagnostic: ${diagnosticId}. Read recentDiagnostics with ${profile === 'discovery' ? 'kanvas_call {operationId:"kanvas.session.state",arguments:{sessionId}}' : `${state.tool} operation ${state.operation}`} if your host hides error details.` : ''}`;
  // Standard MCP text is readable without structured-content support. Preserve
  // isError and the machine-readable envelope; never disguise failure as success.
  return { isError: true, content: grouped ? [{ type: 'text', text: headline }, detail] : [detail], structuredContent: result };
}

export function invalidArguments(): CallToolResult {
  return toolFailure(new InputError([{ path: 'arguments', problem: 'The arguments do not match this operation schema. Read the tool schema; for view data use kanvas_inspect template.get.' }]));
}

export function resourceFailure(error: unknown): ProtocolError {
  const failure = safeError(error);
  // Do not distinguish unavailable resources from forbidden resources by a URI-bearing error.
  const code = failure.code === 'INTERNAL_ERROR' || failure.code === 'UNAVAILABLE' ? -32603 : -32602;
  return new ProtocolError(code, failure.message, { code: failure.code });
}

function preview(value: unknown, depth: number, limit: number, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return value.length <= limit ? value : `${value.slice(0, limit)}… [preview]`;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return null;
  if (seen.has(value) || depth <= 0) return '[omitted from preview]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 12).map(item => preview(item, depth - 1, limit, seen));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    result[key] = preview(item, depth - 1, limit, seen);
  }
  return result;
}

export function toolSuccess(value: unknown, sessionId?: unknown, operation = '', profile: McpProfile = 'legacy', callArgs?: Record<string, unknown>): CallToolResult {
  const server = mcpServerInfo(profile);
  if (value instanceof VisualCaptureResult) return { content: [{ type: 'text', text: JSON.stringify({ data: value.metadata, server }) }, { type: 'image', mimeType: value.mimeType, data: value.image.toString('base64') }], structuredContent: { data: value.metadata, server } };
  const canonicalOrientation = orientationFor(operation);
  const orientation = isGrouped(profile) ? trustedGuidance(canonicalOrientation) : canonicalOrientation;
  const routing = isGrouped(profile) && operation === 'kanvas_interactions_read' ? { routing: interactionRoutes(profile) } : {};
  const data = profileResultData(operation, value, profile);
  const submittedView = callArgs?.view as { template?: string; data?: { status?: string } } | undefined;
  const template = operation === 'kanvas_submit' ? submittedView?.template : undefined;
  const relatedOperations = template ? workflowIds(template).flatMap(id => { const item = operationCatalog().find(entry => entry.id === id); return item ? [{ id, description: item.summary }] : []; }) : [];
  const workflow = relatedOperations.length ? { relatedOperations, instruction: WORKFLOW_NOTE, get: { tool: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id: relatedOperations[0].id } } } : undefined;
  const commitmentBoundary = operation === 'kanvas_planner_finalize' || template === 'planner' && submittedView?.data?.status === 'committed' ? PLANNER_BOUNDARY : undefined;
  let result: Record<string, unknown> = { ...(workflow ? { workflow } : {}), ...(commitmentBoundary ? { commitmentBoundary } : {}), data: data ?? null, server, ...(orientation ? { orientation } : {}), ...routing };
  let text = JSON.stringify(result);
  if(operation==='kanvas_template_get'&&orientation&&Buffer.byteLength(text)>MAX_TOOL_RESULT_BYTES){
    // Complete schema constraints take priority over repeated onboarding prose.
    // Keep its guide link and server identity; never truncate a usable contract
    // merely to repeat instructions already provided during initialization.
    result.orientation={guide:(orientation as Record<string,unknown>).guide};text=JSON.stringify(result);
  }
  if(operation==='kanvas_template_get'&&Buffer.byteLength(text)>MAX_TOOL_RESULT_BYTES&&data&&typeof data==='object'&&!Array.isArray(data)){
    const {displayGuidance:_displayGuidance,...contract}=data as Record<string,unknown>;
    result.data={...contract,note:'Complete view schema, not submit arguments. Preserve supplied source values.'};text=JSON.stringify(result);
  }
  if(operation==='kanvas_template_get'&&Buffer.byteLength(text)>MAX_TOOL_RESULT_BYTES&&result.data&&typeof result.data==='object'&&!Array.isArray(result.data)){
    // An illustrative example is expendable; a composite schema is not. Keep
    // every validation constraint and the guide rather than previewing an
    // incomplete contract when another supported leaf grows the presentation.
    const {example: _example,...contract}=result.data as Record<string,unknown>;
    result.data=contract;text=JSON.stringify(result);
  }
  if (Buffer.byteLength(text) > MAX_TOOL_RESULT_BYTES) {
    const fallback = typeof sessionId === 'string'
      ? { stateResource: `kanvas://sessions/${sessionId}/state`, ...(isGrouped(profile) ? { interactionsTool: publicReference('kanvas_interactions_read', profile)!.tool, interactionsOperation: publicReference('kanvas_interactions_read', profile)!.operation } : { interactionsTool: 'kanvas_interactions_read' }) }
      : { sessionsResource: 'kanvas://sessions' };
    result = {
      data: preview(data, 6, 1000),
      server,
      truncated: true,
      note: 'This is a bounded preview, not the full source. The operation succeeded; do not repeat a mutation to retrieve omitted content.',
      ...fallback,
      ...(orientation ? { orientation } : {}),
      ...routing,
    };
    text = JSON.stringify(result);
    if (Buffer.byteLength(text) > MAX_TOOL_RESULT_BYTES) {
      result.data = preview(data, 3, 160);
      text = JSON.stringify(result);
    }
    if (Buffer.byteLength(text) > MAX_TOOL_RESULT_BYTES) {
      result.data = null;
      text = JSON.stringify(result);
    }
  }
  return { content: [{ type: 'text', text }], structuredContent: result };
}

export function resourceText(value: unknown, profile: McpProfile = 'legacy'): string {
  const text = JSON.stringify(value ?? null);
  if (Buffer.byteLength(text) > MAX_RESOURCE_BYTES) {
    const guidance = 'Resource is too large. Use kanvas_session_state or paginate kanvas_interactions_read.';
    throw new ProtocolError(-32602, isGrouped(profile) ? publicGuidanceText(guidance, profile) : guidance, { code: 'LIMIT_EXCEEDED' });
  }
  return text;
}
