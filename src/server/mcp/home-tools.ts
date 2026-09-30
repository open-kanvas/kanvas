import { connectionRedirectSchema } from '../window-receivers.js';
import { accountInventorySchema } from '../../shared/account-inventory.js';
import type { Definition } from './canonical.js';

/** Account-level reach: one inventory read, and moving a live browser window across sessions. */
export const homeTools: Definition[] = [
  { name: 'kanvas_account_inventory', readOnly: true, schema: accountInventorySchema,
    description: 'ACCOUNT INVENTORY: every session the account can open (each display with its name, online state and what it shows), registered devices with their browser windows, and groups, plus manage: the operations that read or change each resource. Bounded; ended sessions only with includeEnded. Read-only.' },
  { name: 'kanvas_connection_redirect', idempotent: true, schema: connectionRedirectSchema,
    description: 'REDIRECT A LIVE BROWSER: move one of your own open browser windows, identified by its topology.read connection id, to any display you can open, including a display in another session. sessionId and displayId are the target. A retry with the same requestId returns the original command.' },
];
