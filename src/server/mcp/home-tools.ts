import {clientDetailsSchema} from '../../shared/agent-context.js';
import { z } from 'zod';
import { connectionRedirectSchema } from '../window-receivers.js';
import { accountInventorySchema } from '../../shared/account-inventory.js';
import type { Definition } from './canonical.js';

/** Account-level reach: one inventory read, and moving a live browser window across sessions. */
export const homeTools: Definition[] = [
  {name:'kanvas_account_details',readOnly:true,description:'Read only YOUR signed-in account email, display name, quota tier and configured limits. No accountId argument; account-wide permission required. Returns a ready account-details view recipe: publish only on a private display chosen by the user, since email is personal.',schema:z.strictObject({})},
  {name:'kanvas_account_begin',description:'Start a requested Kanvas session on one connected owned window. With multiple windows choose deviceId/windowId; never broadcast. With none, an actively opted-in returning account can get a ready session and queued push (only with no explicit target); otherwise returns needs_display and bare startUrl to open before retry. A notification is not delivery or paint: publish to returned IDs and verify. requestId retries are safe. Selected-session grants cannot create sessions.',schema:z.strictObject({clientDetails:clientDetailsSchema.optional(),requestId:z.string().min(1).max(128),name:z.string().trim().min(1).max(160).default('Kanvas session'),deviceId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),windowId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional()}),idempotent:true},
  { name: 'kanvas_account_inventory', readOnly: true, schema: accountInventorySchema,
    description: 'ACCOUNT INVENTORY: every session the account can open (each display with its name, online state and what it shows), registered devices with their browser windows, and groups, plus manage: the operations that read or change each resource. Bounded; ended sessions only with includeEnded. Read-only.' },
  { name: 'kanvas_connection_redirect', idempotent: true, schema: connectionRedirectSchema,
    description: 'REDIRECT A LIVE BROWSER: move one of your own open browser windows, identified by its topology.read connection id, to any display you can open, including a display in another session. sessionId and displayId are the target. A retry with the same requestId returns the original command.' },
];
