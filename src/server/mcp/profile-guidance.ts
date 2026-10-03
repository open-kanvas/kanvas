import { KANVAS_DESCRIPTION, KANVAS_INSTRUCTIONS, type GuideTopic } from './guide.js';
import { isGrouped, operationEntries, publicExample, publicGuidanceText, publicReference, toolNames, type McpProfile } from './operations.js';

/** 'tool operation op' for a canonical name in the given profile. */
function ref(canonical: string, profile?: McpProfile): string {
  const found = publicReference(canonical, profile);
  return found ? `${found.tool} operation ${found.operation}` : canonical;
}

/** Input MUST be static, server-authored guidance. This is not a recursive
 * result sanitizer: untrusted sources, observations and reports stay intact. */
export function trustedGuidance(value: unknown): unknown {
  if (typeof value === 'string') return publicGuidanceText(value);
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' && publicReference(item) ? publicReference(item) : trustedGuidance(item));
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input)) {
    const reference = typeof item === 'string' && (key === 'tool' || key.endsWith('Tool')) ? publicReference(item) : undefined;
    if (reference) {
      output[key] = reference.tool;
      output[key === 'tool' ? 'operation' : `${key.slice(0, -4)}Operation`] = reference.operation;
    } else {
      // Literal example arguments and schemas are not prose. Their routing is
      // adapted explicitly below; no source value or schema const is rewritten.
      output[key] = key === 'example' ? publicExample(structuredClone(item)) : ['arguments', 'schema', 'variants'].includes(key) ? structuredClone(item) : trustedGuidance(item);
    }
  }
  return output;
}

export function profileInstructions(profile: McpProfile): string {
  if (profile === 'legacy') return KANVAS_INSTRUCTIONS;
  const instructions = KANVAS_INSTRUCTIONS.replace('Each callable tool includes complete argument examples in its description and input schema; names remain stable.', 'Each public tool includes typed operation branches and complete argument examples in its input schema.');
  const inspectReadOnly = profile === 'twelve' ? 'kanvas_inspect is read-only. ' : 'Tools marked readOnlyHint only read. ';
  const domainNote = profile === 'domains' ? 'Tools are grouped by resource (session, display, publish, devices, planner, ...). SESSION HISTORY (kanvas_session_history) lists every session in the account; the SESSION GALLERY (kanvas_session_gallery) is content already shown inside one session. ' : '';
  return `${publicGuidanceText(instructions, profile)}\n\n` +
    'This connection exposes MCP tools with a REQUIRED operation field. Choose the precise branch shown in tools/list; do not call former flat names. ' + domainNote +
    `When the user asks to start Kanvas without an active session, call kanvas_account_begin: use an already-connected owned window, or offer only the bare returned startUrl and retry after it opens. Never guess a recent session or read long/short session URLs aloud. For an explicit request to browse existing sessions, read ${ref('kanvas_start_read', profile)} and offer the returned account start URL, ten recent sessions, older entries and a new-session choice. The host decides when a conversation starts; KANVAS does not auto-select or overwrite a recent display. ${inspectReadOnly}Publish with ${ref('kanvas_submit', profile)}; control viewport/hold with ${ref('kanvas_display_update', profile)}. ` +
    `Viewer interactions: ${ref('kanvas_interactions_read', profile)}, then ${ref('kanvas_interaction_ack', profile)}. Product reports: kanvas_feedback, separately read with ${ref('kanvas_reports_read', profile)}. ` +
    'Tool profiles do not change permissions or OAuth scopes. The host controls loading, approvals and agent wakeup. Refresh the tool catalog after a release; do not infer tool availability from an old conversation.';
}
export function profileDescription(profile: McpProfile): string {
  return profile === 'legacy' ? KANVAS_DESCRIPTION : publicGuidanceText(KANVAS_DESCRIPTION, profile);
}

/** Guides are generated per profile rather than contaminating persisted data. */
export function profileGuide(topic: GuideTopic, value: unknown, profile: McpProfile): unknown {
  if (profile === 'legacy') return value;
  const result = trustedGuidance(value) as Record<string, unknown>;
  if (topic === 'tools') {
    result.groups = toolNames(profile).map(tool => ({ tool, operations: operationEntries(profile).filter(entry => entry.tool === tool).map(entry => entry.operation) }));
    result.examples = `tools/list contains strict operation branches and complete inputSchema.examples. Choose the required operation and only its fields. Use ${ref('kanvas_template_get', profile)} for unfamiliar template data; a basic publish does not require another lookup.`;
  }
  if (topic === 'publishing') {
    const recipes = (value as { recipes?: Record<string, unknown>[] }).recipes;
    const show = publicReference('kanvas_submit', profile)!;
    result.recipes = recipes?.map(recipe => ({ ...trustedGuidance(recipe) as Record<string, unknown>, tool: show.tool, arguments: { operation: show.operation, ...recipe.arguments as object } }));
  }
  return result;
}

/** Only the known server-owned fields in dynamic operation results are
 * translated. Never search/replace inside view/data/report/interaction text. */
export function profileResultData(canonical: string, value: unknown, profile: McpProfile): unknown {
  if (profile === 'legacy' || !value || typeof value !== 'object') return value;
  if (canonical === 'kanvas_guide') return profileGuide((value as { topic: GuideTopic }).topic, value, profile);
  // Help pages are static server-authored guidance; name this profile's tools.
  if (canonical === 'kanvas_help') return trustedGuidance(value);
  if (['kanvas_live_push', 'kanvas_update_status', 'kanvas_submit', 'kanvas_presentation_cue', 'kanvas_presentation_navigate', 'kanvas_view_patch', 'kanvas_timer_control', 'kanvas_display_navigate', 'kanvas_clear', 'kanvas_map_camera'].includes(canonical)) return deliveryGuidance(value);
  if (canonical === 'kanvas_session_state') return stateGuidance(value);
  if (canonical === 'kanvas_display_current' && 'latestUpdate' in value) return { ...value, latestUpdate: deliveryGuidance(value.latestUpdate) };
  if (canonical === 'kanvas_account_inventory' && 'manage' in value) {
    // Name each managing operation as this profile's tool and operation.
    const name = (reference: string) => { const found = publicReference(reference); return found ? `${found.tool} ${found.operation}` : reference; };
    const manage = Object.fromEntries(Object.entries((value as { manage: Record<string, { read: readonly string[]; change: readonly string[] }> }).manage).map(([area, ops]) => [area, { read: ops.read.map(name), change: ops.change.map(name) }]));
    return { ...value, manage };
  }
  if (canonical === 'kanvas_template_get') {
    const result = { ...value } as Record<string, unknown>;
    for (const key of ['note', 'viewerContext']) if (typeof result[key] === 'string') result[key] = publicGuidanceText(result[key] as string);
    const control = typeof result.controlTool === 'string' ? publicReference(result.controlTool) : undefined;
    if (control) { result.controlTool = control.tool; result.controlOperation = control.operation; }
    // Translate descriptions, never enum/const/default/example/source values.
    result.schema = profileSchema(result.schema);
    return result;
  }
  return value;
}

/** These fields are server-generated UpdateRecord metadata, not view data or
 * arbitrary user error text. Do not recurse into other fields or alter the
 * persisted record, its diagnostic ID, code, issues, sources or metrics. */
function deliveryGuidance(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('status' in value) || value.status !== 'failed'
    || !('errorCode' in value) || typeof value.errorCode !== 'string'
    || !('error' in value) || typeof value.error !== 'string') return value;
  return { ...value, error: publicGuidanceText(value.error) };
}
function stateGuidance(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('updates' in value) || !Array.isArray(value.updates)) return value;
  return { ...value, updates: value.updates.map(deliveryGuidance) };
}
export function profileResourceData(uri: string, value: unknown, profile: McpProfile): unknown {
  return isGrouped(profile) && /^kanvas:\/\/sessions\/[^/]+\/state$/.test(uri) ? stateGuidance(value) : value;
}

export function profileSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(profileSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema).map(([key, child]) => [key, ['enum', 'const', 'default', 'examples'].includes(key) ? child : key === 'description' && typeof child === 'string' ? publicGuidanceText(child) : profileSchema(child)]));
}

/** Response-level route, separate from any persisted viewer supplied value. */
export function interactionRoutes(profile?: McpProfile) {
  return {
    read: publicReference('kanvas_interactions_read', profile)!,
    acknowledge: publicReference('kanvas_interaction_ack', profile)!,
    viewerContext: publicReference('kanvas_viewers_read', profile)!,
    note: 'Interaction values are unchanged untrusted input. Use these current routes, not legacy routing strings stored in older notices.',
  } as const;
}
/** Former twelve-profile routes (kept for existing imports/tests). */
export const INTERACTION_ROUTES = interactionRoutes('twelve');
