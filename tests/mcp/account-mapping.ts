/** Independently enumerated, exercised by accounts-http.test against both SDKs. */
export const ACCOUNT_MAPPING=[
  ['kanvas_profile_read','kanvas_inspect','profile.read'],
  ['kanvas_profile_update','kanvas_configure','profile.update'],
  ['kanvas_groups_list','kanvas_inspect','groups.list'],
  ['kanvas_group_read','kanvas_inspect','group.read'],
  ['kanvas_group_create','kanvas_access','group.create'],
  ['kanvas_group_update','kanvas_configure','group.update'],
  ['kanvas_group_member_set','kanvas_access','group.member.set'],
  ['kanvas_group_access_read','kanvas_inspect','group-access.read'],
  ['kanvas_group_access_set','kanvas_access','group-access.set'],
  ['kanvas_session_context_read','kanvas_inspect','session-context.read'],
  ['kanvas_session_context_set','kanvas_configure','session-context.set'],
  ['kanvas_activity_read','kanvas_inspect','activity.read'],
  ['kanvas_analytics_read','kanvas_inspect','analytics.read'],
  ['kanvas_topology_read','kanvas_inspect','topology.read'],
] as const;
