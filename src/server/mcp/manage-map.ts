import { ACCOUNT_MANAGE } from '../../shared/account-inventory.js';
import { operationId } from './operations.js';
/** Compact resource -> operations map with the IDs agents actually call. It
 * replaces guessing a verb with reading: display.register is how a display is
 * created, whatever word the person used. */
let cached: Record<string, { read: string[]; change: string[] }> | undefined;
export function manageMap(): Record<string, { read: string[]; change: string[] }> {
  if (cached) return cached;
  const ids = (names: readonly string[]) => names.map(name => operationId(name));
  cached = Object.fromEntries(Object.entries(ACCOUNT_MANAGE).map(([resource, value]) => [resource, { read: ids(value.read), change: ids(value.change) }]));
  cached.agents = { read: ['kanvas.agents.read'], change: ['kanvas.agents.revoke'] };
  cached.savedState = { read: ['kanvas.checklist.read', 'kanvas.tasklist.read', 'kanvas.monitor.stream.read'], change: ['kanvas.checklist.update', 'kanvas.checklist.show', 'kanvas.tasklist.update', 'kanvas.tasklist.show', 'kanvas.monitor.stream.create', 'kanvas.monitor.stream.revoke'] };
  return cached;
}
