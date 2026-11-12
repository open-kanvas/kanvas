/** 2026-11-10 operations. Exercised against real stores in
 * tests/core/feedback-20261110-*.test.ts and over MCP in tests/mcp/nov10-contract-http.test.ts. */
export const NOV10_MAPPING=[
 ['kanvas_friction_read','kanvas_inspect','friction.read'],
 ['kanvas_agents_read','kanvas_inspect','agents.read'],
 ['kanvas_agents_revoke','kanvas_access','agents.revoke'],
 ['kanvas_tasklist_read','kanvas_inspect','tasklist.read'],
 ['kanvas_tasklist_update','kanvas_publish','tasklist.update'],
 ['kanvas_tasklist_show','kanvas_publish','tasklist.show'],
 ['kanvas_monitor_stream_create','kanvas_monitor','stream.create'],
 ['kanvas_monitor_stream_read','kanvas_inspect','monitor.stream.read'],
 ['kanvas_monitor_stream_revoke','kanvas_monitor','stream.revoke'],
 ['kanvas_icons_search','kanvas_inspect','icons.search'],
 ['kanvas_fonts_list','kanvas_inspect','fonts.list'],
] as const;
