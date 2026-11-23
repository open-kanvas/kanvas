import type {Request} from 'express';
/** A stateless protocol has no implicit client-instance identity. Hosts may
 * supply a fresh opaque id per connection; it is never authorization. Unknown
 * identity stays request-local rather than sharing one account/agent setting. */
export function guidanceConnectionId(request: Request, metadata: unknown, requestId: string): string {
  const legacy = request.get('mcp-session-id');
  if (legacy) return 'mcp:' + legacy;
  const meta = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['kanvas/connectionId'] : undefined;
  const supplied = request.get('kanvas-connection-id') ?? meta;
  return typeof supplied === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(supplied) ? 'client:' + supplied : 'request:' + requestId;
}
