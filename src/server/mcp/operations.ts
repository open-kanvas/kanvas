import { AsyncLocalStorage } from 'node:async_hooks';

/** A deployment chooses a profile, never a caller. Every profile uses the same
 * canonical operations, domain permissions and idempotency namespace.
 * 'domains' (default) groups operations by resource into ~40 tools; 'twelve'
 * is the former 13-tool grouping; 'legacy' exposes every canonical tool. */
export type McpProfile = 'domains' | 'twelve' | 'legacy';
export type GroupedProfile = Exclude<McpProfile, 'legacy'>;
export function mcpProfile(value: unknown = 'domains'): McpProfile {
  if (value !== 'domains' && value !== 'twelve' && value !== 'legacy') throw new Error('KANVAS_MCP_PROFILE must be domains, twelve or legacy.');
  return value;
}
export const isGrouped = (profile: McpProfile): profile is GroupedProfile => profile !== 'legacy';

/** Reviewed, exhaustive registry. Do not synthesize handler names from input. */
export const OPERATION_REGISTRY = {
  kanvas_inspect: { 'archive.list':'kanvas_archive_list',
    'pointing.read':'kanvas_pointing_read','autoplay.read':'kanvas_autoplay_read','tool-log.read':'kanvas_tool_log_read',
    'profile.read':'kanvas_profile_read','groups.list':'kanvas_groups_list','group.read':'kanvas_group_read',
    'group-access.read':'kanvas_group_access_read','session-context.read':'kanvas_session_context_read',
    'activity.read':'kanvas_activity_read','analytics.read':'kanvas_analytics_read','topology.read':'kanvas_topology_read',
    'start.read':'kanvas_start_read',
    'devices.read':'kanvas_devices_read','account.inventory':'kanvas_account_inventory',
    'participants.read':'kanvas_participants_read',
    'help.read': 'kanvas_help',
    'navigation.read': 'kanvas_navigation_read', 'draft.read': 'kanvas_draft_read', 'planner.read': 'kanvas_planner_read', 'displays.sync.read': 'kanvas_displays_sync_read',
    'pins.read': 'kanvas_pins_read',
    'guide.get': 'kanvas_guide',
    'template.get': 'kanvas_template_get',
    'reports.read': 'kanvas_reports_read',
    'sessions.list': 'kanvas_sessions_list',
    'session.state': 'kanvas_session_state',
    'display.history': 'kanvas_display_history',
    'video.status': 'kanvas_video_status',
    'update.status': 'kanvas_update_status',
    'presentations.list': 'kanvas_presentations_list',
    'interactions.read': 'kanvas_interactions_read',
    'display.current': 'kanvas_display_current',
    'view.validate': 'kanvas_view_validate',
    'styles.list': 'kanvas_styles_list',
    'preferences.get': 'kanvas_preferences_get',
    'pairings.read': 'kanvas_pairings_read',
    'viewers.read': 'kanvas_viewers_read',
    'display.observe': 'kanvas_display_inspect',
    'session.overview': 'kanvas_session_overview',
    'session.log': 'kanvas_session_log',
    'monitoring.read': 'kanvas_monitoring_read',
  },
  kanvas_session: {rename:'kanvas_session_rename', create: 'kanvas_session_create', 'display.register': 'kanvas_display_register', 'display.rename':'kanvas_display_rename', 'address.get': 'kanvas_address_get', 'address.customize':'kanvas_address_customize' },
  kanvas_publish: {'tool-log.append':'kanvas_tool_log_append','chat.append':'kanvas_chat_append', show: 'kanvas_submit', 'progress.append': 'kanvas_progress_append', replace_data: 'kanvas_display_edit', patch: 'kanvas_view_patch', notify: 'kanvas_toast', 'draft.edit': 'kanvas_draft_edit', 'draft.suggest': 'kanvas_draft_suggest', 'draft.review': 'kanvas_draft_review', 'planner.edit': 'kanvas_planner_edit', 'planner.propose': 'kanvas_planner_propose', 'planner.review': 'kanvas_planner_review', 'planner.finalize': 'kanvas_planner_finalize' },
  kanvas_control: {'start.begin':'kanvas_account_begin','autoplay.control':'kanvas_autoplay_control','scoreboard.control':'kanvas_scoreboard_control',
    'selection.set':'kanvas_selection_set',
    'device.present':'kanvas_device_present',
    'window.present':'kanvas_window_present','connection.redirect':'kanvas_connection_redirect',
    'device.rename':'kanvas_device_rename',
    'navigation.control': 'kanvas_navigation_control', 'pin.save':'kanvas_pin_save', 'pin.recall':'kanvas_pin_recall', 'pin.remove':'kanvas_pin_remove',
    'display.update': 'kanvas_display_update', 'history.navigate': 'kanvas_display_navigate',
    'video.control': 'kanvas_video_control', 'timer.control': 'kanvas_timer_control', 'map.camera': 'kanvas_map_camera',
    'presentation.create': 'kanvas_presentation_create', 'presentation.cue': 'kanvas_presentation_cue', 'presentation.navigate': 'kanvas_presentation_navigate',
    'procedure.control': 'kanvas_procedure_control',
    'displays.identify': 'kanvas_displays_identify', 'displays.sync': 'kanvas_displays_sync',
  },
  kanvas_configure: { 'profile.update':'kanvas_profile_update','group.update':'kanvas_group_update','session-context.set':'kanvas_session_context_set', 'session.update': 'kanvas_config_update', 'preferences.update': 'kanvas_preferences_update' },
  kanvas_import: { 'dataset.import': 'kanvas_dataset_import', 'asset.import': 'kanvas_asset_import', 'asset.export':'kanvas_asset_export' },
  kanvas_interactions: { acknowledge: 'kanvas_interaction_ack' },
  kanvas_feedback: { submit: 'kanvas_feedback_submit', 'error.report': 'kanvas_error_report', 'report.update': 'kanvas_report_update', patch:'kanvas_report_patch' },
  kanvas_capture: { snapshot: 'kanvas_display_snapshot' },
  kanvas_monitor: { start: 'kanvas_monitoring_start', update: 'kanvas_monitoring_update', stop: 'kanvas_monitoring_stop', push: 'kanvas_live_push' },
  kanvas_access: {'pointing.configure':'kanvas_pointing_configure','session.public':'kanvas_session_public_access','group.create':'kanvas_group_create','group.member.set':'kanvas_group_member_set','group-access.set':'kanvas_group_access_set','invite.create':'kanvas_invite_create','invite.accept':'kanvas_invite_accept','invite.revoke':'kanvas_invite_revoke', 'share.create': 'kanvas_share_create', 'pairing.revoke':'kanvas_pairing_revoke', 'pairing.decide': 'kanvas_pairing_decide', 'member.add': 'kanvas_member_add', 'member.remove': 'kanvas_member_remove' },
  kanvas_remove: { 'archive.manage':'kanvas_archive_manage', 'display.clear': 'kanvas_clear', 'session.end': 'kanvas_session_end', 'dataset.delete': 'kanvas_dataset_delete', 'asset.delete': 'kanvas_asset_delete' },
} as const;

/** Resource/domain grouping (reports #13/#27). Every canonical operation
 * appears exactly once. kanvas_feedback is deliberately IDENTICAL to the
 * twelve profile (same name, operations and argument shape): existing agent
 * hosts manage reports through it. */
export const DOMAIN_REGISTRY = {
  kanvas_account: { begin:'kanvas_account_begin', start: 'kanvas_start_read', inventory: 'kanvas_account_inventory', activity: 'kanvas_activity_read', analytics: 'kanvas_analytics_read' },
  kanvas_profile: { read: 'kanvas_profile_read', update: 'kanvas_profile_update', 'preferences.read': 'kanvas_preferences_get', 'preferences.update': 'kanvas_preferences_update', 'styles.list': 'kanvas_styles_list' },
  kanvas_session_history: { list: 'kanvas_sessions_list' },
  kanvas_archive: { list:'kanvas_archive_list', manage:'kanvas_archive_manage' },
  kanvas_session: { create: 'kanvas_session_create', rename: 'kanvas_session_rename', state: 'kanvas_session_state', log: 'kanvas_session_log', 'settings.update': 'kanvas_config_update', 'context.read': 'kanvas_session_context_read', 'context.set': 'kanvas_session_context_set', participants: 'kanvas_participants_read' },
  kanvas_session_end: { end: 'kanvas_session_end' },
  kanvas_session_gallery: { read: 'kanvas_session_overview' },
  kanvas_sharing: { 'address.get': 'kanvas_address_get', 'address.customize': 'kanvas_address_customize', 'link.create': 'kanvas_share_create', 'public.set': 'kanvas_session_public_access' },
  kanvas_display: { register: 'kanvas_display_register', rename: 'kanvas_display_rename', current: 'kanvas_display_current', observe: 'kanvas_display_inspect', update: 'kanvas_display_update', identify: 'kanvas_displays_identify', snapshot: 'kanvas_display_snapshot' },
  kanvas_display_clear: { clear: 'kanvas_clear' },
  kanvas_display_revisions: { list: 'kanvas_display_history', go: 'kanvas_display_navigate' },
  kanvas_display_sync: { set: 'kanvas_displays_sync', read: 'kanvas_displays_sync_read' },
  kanvas_publish: { show: 'kanvas_submit', replace: 'kanvas_display_edit', patch: 'kanvas_view_patch', validate: 'kanvas_view_validate', status: 'kanvas_update_status', notify: 'kanvas_toast' },
  kanvas_template: { get: 'kanvas_template_get' },
  kanvas_help: { read: 'kanvas_help', guide: 'kanvas_guide' },
  kanvas_feed: { 'chat.append': 'kanvas_chat_append', 'progress.append': 'kanvas_progress_append', 'tool-log.append': 'kanvas_tool_log_append', 'tool-log.read': 'kanvas_tool_log_read' },
  kanvas_view_navigation: { control: 'kanvas_navigation_control', read: 'kanvas_navigation_read', 'selection.set': 'kanvas_selection_set' },
  kanvas_pins: { save: 'kanvas_pin_save', recall: 'kanvas_pin_recall', remove: 'kanvas_pin_remove', list: 'kanvas_pins_read' },
  kanvas_presentation: { create: 'kanvas_presentation_create', cue: 'kanvas_presentation_cue', navigate: 'kanvas_presentation_navigate', list: 'kanvas_presentations_list', autoplay: 'kanvas_autoplay_control', 'autoplay.read': 'kanvas_autoplay_read' },
  kanvas_video: { control: 'kanvas_video_control', status: 'kanvas_video_status' },
  kanvas_timer: { control: 'kanvas_timer_control' },
  kanvas_map: { camera: 'kanvas_map_camera' },
  kanvas_scoreboard: { control: 'kanvas_scoreboard_control' },
  kanvas_procedure: { control: 'kanvas_procedure_control' },
  kanvas_draft: { read: 'kanvas_draft_read', edit: 'kanvas_draft_edit', suggest: 'kanvas_draft_suggest', review: 'kanvas_draft_review' },
  kanvas_planner: { read: 'kanvas_planner_read', edit: 'kanvas_planner_edit', propose: 'kanvas_planner_propose', review: 'kanvas_planner_review', finalize: 'kanvas_planner_finalize' },
  kanvas_devices: { list: 'kanvas_devices_read', rename: 'kanvas_device_rename', present: 'kanvas_device_present', 'window.present': 'kanvas_window_present' },
  kanvas_connections: { read: 'kanvas_topology_read', redirect: 'kanvas_connection_redirect' },
  kanvas_pairing: { list: 'kanvas_pairings_read', decide: 'kanvas_pairing_decide', revoke: 'kanvas_pairing_revoke' },
  kanvas_viewers: { list: 'kanvas_viewers_read', 'pointing.read': 'kanvas_pointing_read', 'pointing.configure': 'kanvas_pointing_configure' },
  kanvas_interactions: { read: 'kanvas_interactions_read', acknowledge: 'kanvas_interaction_ack' },
  kanvas_groups: { list: 'kanvas_groups_list', read: 'kanvas_group_read', create: 'kanvas_group_create', update: 'kanvas_group_update', 'member.set': 'kanvas_group_member_set', 'access.read': 'kanvas_group_access_read', 'access.set': 'kanvas_group_access_set' },
  kanvas_members: { add: 'kanvas_member_add', remove: 'kanvas_member_remove', 'invite.create': 'kanvas_invite_create', 'invite.accept': 'kanvas_invite_accept', 'invite.revoke': 'kanvas_invite_revoke' },
  kanvas_import: { dataset: 'kanvas_dataset_import', asset: 'kanvas_asset_import', 'asset.export':'kanvas_asset_export' },
  kanvas_data_delete: { dataset: 'kanvas_dataset_delete', asset: 'kanvas_asset_delete' },
  kanvas_feedback: OPERATION_REGISTRY.kanvas_feedback,
  kanvas_reports: { read: 'kanvas_reports_read' },
  kanvas_monitor: { start: 'kanvas_monitoring_start', update: 'kanvas_monitoring_update', stop: 'kanvas_monitoring_stop', push: 'kanvas_live_push', read: 'kanvas_monitoring_read' },
} as const;

export type TwelveToolName = keyof typeof OPERATION_REGISTRY;
export type DomainToolName = keyof typeof DOMAIN_REGISTRY;
export type PublicToolName = TwelveToolName | DomainToolName;
export interface ToolReference { tool: PublicToolName; operation: string }
export interface OperationEntry { readonly tool: PublicToolName; readonly operation: string; readonly canonical: string }
export const REGISTRIES: Readonly<Record<GroupedProfile, Readonly<Record<string, Readonly<Record<string, string>>>>>> = Object.freeze({ twelve: OPERATION_REGISTRY, domains: DOMAIN_REGISTRY });

function entriesOf(registry: Readonly<Record<string, Readonly<Record<string, string>>>>): readonly OperationEntry[] {
  return Object.freeze(Object.keys(registry).flatMap(tool => Object.entries(registry[tool]).map(([operation, canonical]) => Object.freeze({ tool: tool as PublicToolName, operation, canonical }))));
}
const PROFILE_ENTRIES = { twelve: entriesOf(OPERATION_REGISTRY), domains: entriesOf(DOMAIN_REGISTRY) } as const;
const lookups = Object.fromEntries((Object.keys(PROFILE_ENTRIES) as GroupedProfile[]).map(profile => [profile, {
  byCanonical: new Map(PROFILE_ENTRIES[profile].map(entry => [entry.canonical, entry])),
  byCall: new Map(PROFILE_ENTRIES[profile].map(entry => [`${entry.tool}:${entry.operation}`, entry])),
}])) as Record<GroupedProfile, { byCanonical: Map<string, OperationEntry>; byCall: Map<string, OperationEntry> }>;

/** The grouped profile whose names guidance should use. mountMcp runs every
 * request inside profileScope; outside a request the former twelve names
 * remain the default so existing REST/report text does not change. */
export const profileScope = new AsyncLocalStorage<McpProfile>();
export function guidanceProfile(profile?: McpProfile): GroupedProfile {
  const active = profile ?? profileScope.getStore() ?? 'twelve';
  return active === 'legacy' ? 'twelve' : active;
}
export function toolNames(profile?: McpProfile): readonly PublicToolName[] { return Object.keys(REGISTRIES[guidanceProfile(profile)]) as PublicToolName[]; }
export function operationEntries(profile?: McpProfile): readonly OperationEntry[] { return PROFILE_ENTRIES[guidanceProfile(profile)]; }
export function toolOperations(tool: string, profile?: McpProfile): readonly string[] { return Object.keys(REGISTRIES[guidanceProfile(profile)][tool] ?? {}); }

/** Former twelve-profile exports; still used by the twelve profile and tests. */
export const PUBLIC_TOOL_NAMES = Object.freeze(Object.keys(OPERATION_REGISTRY) as TwelveToolName[]);
export const OPERATION_ENTRIES = PROFILE_ENTRIES.twelve;
export const DOMAIN_TOOL_NAMES = Object.freeze(Object.keys(DOMAIN_REGISTRY) as DomainToolName[]);
export const DOMAIN_OPERATION_ENTRIES = PROFILE_ENTRIES.domains;
/** Canonical operations that only read (the twelve profile's kanvas_inspect). */
export const READ_ONLY_CANONICAL: ReadonlySet<string> = new Set(Object.values(OPERATION_REGISTRY.kanvas_inspect));

export function publicReference(canonical: string, profile?: McpProfile): ToolReference | undefined {
  const entry = lookups[guidanceProfile(profile)].byCanonical.get(canonical);
  return entry ? { tool: entry.tool, operation: entry.operation } : undefined;
}
/** Resolve a stored or supplied tool+operation. The active profile wins;
 * other grouped profiles are fallbacks for stored report contexts. */
export function operationEntry(tool: string, operation: unknown, profile?: McpProfile): OperationEntry | undefined {
  if (typeof operation !== 'string') return undefined;
  const first = guidanceProfile(profile);
  return lookups[first].byCall.get(`${tool}:${operation}`)
    ?? (Object.keys(lookups) as GroupedProfile[]).filter(p => p !== first).map(p => lookups[p].byCall.get(`${tool}:${operation}`)).find(Boolean);
}
export function exactOperationEntry(tool: string, operation: unknown, profile: GroupedProfile): OperationEntry | undefined {
  return typeof operation === 'string' ? lookups[profile].byCall.get(`${tool}:${operation}`) : undefined;
}

/** Twelve-profile dotted operation names that identify one operation. */
const bareTwelveOperations = (() => {
  const counts = new Map<string, OperationEntry[]>();
  for (const entry of PROFILE_ENTRIES.twelve) if (entry.operation.includes('.')) counts.set(entry.operation, [...(counts.get(entry.operation) ?? []), entry]);
  return new Map([...counts].filter(([, entries]) => entries.length === 1).map(([operation, [entry]]) => [operation, entry]));
})();

/** Only call on trusted server guidance, never on arbitrary operation results.
 * Canonical names (kanvas_session_state) become this profile's 'tool
 * operation op'. In the domains profile, authored references written in the
 * former twelve form ('kanvas_inspect operation session.state', or a bare
 * dotted 'navigation.control') are translated to the domain names too. */
export function publicGuidanceText(text: string, profile?: McpProfile): string {
  const active = guidanceProfile(profile);
  const canonicalPass = text.replace(/\b(?:kanvas_[a-z_]+|[a-z]+(?:_[a-z]+)+)\b/g, (name: string, offset: number, whole: string) => {
    // A public tool name that shares a canonical name (kanvas_help,
    // kanvas_session_end) is already routed when an operation follows it.
    const operations = REGISTRIES[active][name];
    if (operations) {
      const next = /^ (?:operation )?([a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*)/.exec(whole.slice(offset + name.length));
      if (next && Object.hasOwn(operations, next[1])) return name;
    }
    const reference = publicReference(name.startsWith('kanvas_') ? name : `kanvas_${name}`, active);
    return reference ? `${reference.tool} operation ${reference.operation}` : name;
  });
  if (active !== 'domains') return canonicalPass;
  return canonicalPass.replace(/\b(kanvas_[a-z_]+)( operation | )([a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*)|(?<![\w./-])([a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?![\w/-])/g, (match, tool: string | undefined, separator: string | undefined, operation: string | undefined, bare: string | undefined) => {
    if (tool) {
      // Already a domain pair, or not an operation reference at all.
      if (lookups.domains.byCall.has(`${tool}:${operation}`)) return match;
      const former = lookups.twelve.byCall.get(`${tool}:${operation}`);
      if (!former) return match;
      const current = lookups.domains.byCanonical.get(former.canonical)!;
      return `${current.tool}${separator}${current.operation}`;
    }
    const former = bareTwelveOperations.get(bare!);
    if (!former) return match;
    const current = lookups.domains.byCanonical.get(former.canonical)!;
    return `${current.tool} ${current.operation}`;
  });
}

/** Structural counterpart for authored examples {tool, arguments:{operation}}:
 * route a former twelve pair to this profile without touching other values. */
export function publicExample<T>(example: T, profile?: McpProfile): T {
  const active = guidanceProfile(profile);
  if (active !== 'domains' || !example || typeof example !== 'object' || Array.isArray(example)) return example;
  const { tool, arguments: args } = example as { tool?: unknown; arguments?: unknown };
  if (typeof tool !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) return example;
  const former = lookups.twelve.byCall.get(`${tool}:${String((args as { operation?: unknown }).operation)}`);
  if (!former || lookups.domains.byCall.has(`${tool}:${String((args as { operation?: unknown }).operation)}`)) return example;
  const current = lookups.domains.byCanonical.get(former.canonical)!;
  return { ...example, tool: current.tool, arguments: { ...args, operation: current.operation } } as T;
}
