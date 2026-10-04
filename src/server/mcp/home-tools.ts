import { z } from 'zod';
import { connectionRedirectSchema } from '../window-receivers.js';
import { accountInventorySchema } from '../../shared/account-inventory.js';
import type { Definition } from './canonical.js';

/** Account-level reach: one inventory read, and moving a live browser window across sessions. */
export const homeTools: Definition[] = [
  {name:'kanvas_account_begin',description:'When the user asks to start Kanvas with no active session, check live owned browser windows and open a clean branded ready screen on the single connected window. No connected window: returns the bare environment startUrl; ask the user to open that, then retry. Multiple windows: choose deviceId/windowId explicitly; never redirect them all or overwrite existing content. A fresh subject-named session is created only once a receiver is selected. requestId makes retries safe. Selected-session grants cannot create sessions.',schema:z.strictObject({requestId:z.string().min(1).max(128),name:z.string().trim().min(1).max(160).default('Kanvas session'),deviceId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),windowId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional()}),idempotent:true},
  { name: 'kanvas_account_inventory', readOnly: true, schema: accountInventorySchema,
    description: 'ACCOUNT INVENTORY: every session the account can open (each display with its name, online state and what it shows), registered devices with their browser windows, and groups, plus manage: the operations that read or change each resource. Bounded; ended sessions only with includeEnded. Read-only.' },
  { name: 'kanvas_connection_redirect', idempotent: true, schema: connectionRedirectSchema,
    description: 'REDIRECT A LIVE BROWSER: move one of your own open browser windows, identified by its topology.read connection id, to any display you can open, including a display in another session. sessionId and displayId are the target. A retry with the same requestId returns the original command.' },
];
