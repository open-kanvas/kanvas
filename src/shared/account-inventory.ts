import { z } from 'zod';

export const accountInventorySchema = z.object({
  includeEnded: z.boolean().optional().describe('Also list ended sessions (default false).'),
}).strict();

/** Which operations read or change each account resource (canonical names;
 * MCP profiles show their own tool and operation names). */
export const ACCOUNT_MANAGE = {
  sessions: { read: ['kanvas_sessions_list', 'kanvas_session_state', 'kanvas_session_overview'], change: ['kanvas_session_create', 'kanvas_session_rename', 'kanvas_config_update', 'kanvas_session_context_set', 'kanvas_session_end'] },
  displays: { read: ['kanvas_topology_read', 'kanvas_display_current', 'kanvas_displays_sync_read'], change: ['kanvas_display_register', 'kanvas_display_rename', 'kanvas_display_update', 'kanvas_clear', 'kanvas_displays_identify', 'kanvas_displays_sync'] },
  devices: { read: ['kanvas_devices_read'], change: ['kanvas_device_rename', 'kanvas_device_present', 'kanvas_window_present'] },
  connections: { read: ['kanvas_topology_read', 'kanvas_viewers_read'], change: ['kanvas_connection_redirect', 'kanvas_window_present', 'kanvas_pairing_revoke'] },
  people: { read: ['kanvas_participants_read', 'kanvas_group_access_read', 'kanvas_pairings_read'], change: ['kanvas_member_add', 'kanvas_member_remove', 'kanvas_invite_create', 'kanvas_invite_revoke', 'kanvas_group_access_set', 'kanvas_pairing_decide', 'kanvas_share_create', 'kanvas_session_public_access'] },
  groups: { read: ['kanvas_groups_list', 'kanvas_group_read'], change: ['kanvas_group_create', 'kanvas_group_update', 'kanvas_group_member_set'] },
  profile: { read: ['kanvas_profile_read', 'kanvas_preferences_get', 'kanvas_activity_read'], change: ['kanvas_profile_update', 'kanvas_preferences_update'] },
} as const;
export const ACCOUNT_GAPS = ['Not available through tools yet: deleting registered devices or displays, and renaming individual browser windows.'] as const;
