/** Test convenience for constructing the actual public wire envelope. These
 * helpers accept public operation IDs, never historical tool/group aliases. */
export function operationRequest<T extends { name: string; arguments?: Record<string, unknown> }>(request: T): T {
  const args = request.arguments ?? {};
  const id = typeof args.operation === 'string' ? args.operation : request.name;
  const { operation: _operation, ...rest } = args;
  if (request.name === 'kanvas_call' && 'operationId' in args || request.name === 'kanvas_discover' && 'catalog' in args) return request;
  if (id === 'kanvas.template.get') return { ...request, name: 'kanvas_discover', arguments: { catalog: 'templates', action: 'get', id: `kanvas.template.${rest.template}`, ...(rest.expand ? { expand: rest.expand } : {}) } };
  if (id === 'kanvas.help') return { ...request, name: 'kanvas_discover', arguments: { catalog: 'help', action: 'get', id: `kanvas.help.${rest.topic ?? 'orientation'}` } };
  if (id === 'kanvas.guide') return { ...request, name: 'kanvas_discover', arguments: { catalog: 'help', action: 'search', query: rest.topic ?? 'getting started' } };
  if (!id.startsWith('kanvas.')) return request;
  return { ...request, name: 'kanvas_call', arguments: { operationId: id, arguments: rest } };
}
