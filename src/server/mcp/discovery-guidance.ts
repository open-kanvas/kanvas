/** Static syntax only; never an authorization grant or an inferred target. */
export const DISCOVERY_ORIENTATION = {
  hint: 'kanvas_discover takes {catalog,action,id/query}. If your host shows no parameters, pass them anyway or use the kanvas_call fallback below. Reconnect after upgrades to refresh tools/list.',
  get: { tool: 'kanvas_discover', arguments: { catalog: 'operations', action: 'get', id: 'kanvas.tasklist.update' } },
  resolve: { tool: 'kanvas_discover', arguments: { catalog: 'operations', action: 'resolve', query: 'scroll to the bottom', sessionId: 'AUTHORIZED_SESSION_ID', displayId: 'AUTHORIZED_DISPLAY_ID' } },
  fallback: { tool: 'kanvas_call', arguments: { operationId: 'kanvas.discover', arguments: { catalog: 'operations', action: 'get', id: 'kanvas.tasklist.update' } } },
  context: 'For operations relevant to a known current template, get catalog templates id kanvas.template.<template> and read relatedOperations. task-list includes tasklist.update (subtasks:[{item,check}]), tasklist.show and navigation.control. Read live authorized state before edits; discovery never executes them.',
} as const;
