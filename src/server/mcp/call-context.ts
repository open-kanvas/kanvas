import { AsyncLocalStorage } from 'node:async_hooks';
import type { ToolReference } from './operations.js';

/** Out-of-band diagnostic context: never included in domain arguments,
 * idempotency digests, OAuth grants, source data, or display content. Node async
 * context also follows deferred render work scheduled by the canonical call. */
interface CallContext extends ToolReference { canonicalName: string }
const context = new AsyncLocalStorage<CallContext>();
export const currentToolContext = () => context.getStore();
export function inToolContext<T>(value: CallContext | undefined, fn: () => T): T {
  return value ? context.run(value, fn) : context.exit(fn);
}
