import { OPERATION_ENTRIES, DOMAIN_OPERATION_ENTRIES, operationId } from '../../src/server/mcp/operations.js';
/** Historical operation fixtures still use their descriptive group/canonical labels.
 * Translate test INPUTS to the new public wire contract; never install server aliases
 * or normalize outputs. discovery-http.test exercises raw new/obsolete wire names. */
export function operationRequest<T extends { name: string; arguments?: Record<string, unknown> }>(request: T): T {
  if (request.name === 'kanvas_call' || request.name === 'kanvas_discover') return request;
  const args = request.arguments ?? {};
  const entry = [...OPERATION_ENTRIES, ...DOMAIN_OPERATION_ENTRIES].find(entry => entry.tool === request.name && entry.operation === args.operation)
    ?? OPERATION_ENTRIES.find(entry => entry.canonical === request.name && !('operation' in args));
  if (!entry) return request;
  const { operation: _operation, ...rest } = args;
  if (entry.canonical === 'kanvas_template_get') return { ...request, name:'kanvas_discover',arguments:{catalog:'templates',action:'get',id:`kanvas.template.${rest.template}`} };
  if (entry.canonical === 'kanvas_help') return { ...request, name:'kanvas_discover',arguments:{catalog:'help',action:'get',id:`kanvas.help.${rest.topic ?? 'orientation'}`} };
  if (entry.canonical === 'kanvas_guide') return { ...request, name:'kanvas_discover',arguments:{catalog:'help',action:'search',query:rest.topic ?? 'getting started'} };
  return { ...request, name:'kanvas_call',arguments:{operationId:operationId(entry.canonical),arguments:rest} };
}
