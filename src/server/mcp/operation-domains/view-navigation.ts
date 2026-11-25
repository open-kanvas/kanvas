

import {navigationInputSchema,navigationReadSchema} from '../../../shared/navigation.js';

import type {Definition} from '../canonical.js';
import {name} from '../operation-fields.js';

/** view-navigation operation contracts. Domain services enforce current account, role and scope. */
export const viewNavigationOperations: readonly Definition[] = [
{
        name: "kanvas.navigation.control", summary: "Zoom, scroll, search, or navigate within current content when adjusting the view without rewriting its source.", description: "Explicit user scroll/page/navigation requests must be executed, regardless of pageCount or inferred visibility. When a human asks to zoom or enlarge the current view, use this operation rather than session reading settings. Zoom/density on every template with navigation:{action:\"zoom\",scale:0.75} or direction:\"in\"/\"out\"/\"reset\" (0.25\u20133; reflows content, does not change source). Page, scroll, search, highlight, focus, gotoLine for code/diff (optional panelId and side before/after), selectDay for itinerary maps (day 1..N or all), or fit a diagram within the existing view without rewriting source data or history. Read kanvas_call with operationId:\"kanvas.navigation.read\" and arguments:{\u2026} for capabilities, then supply revision and a new requestId. Zoom belongs to one device window across content and sessions, never the content/display. Supply viewerId from kanvas_call with operationId:\"kanvas.viewers.read\" and arguments:{\u2026}; omission resolves only when exactly one viewer is active, otherwise VIEWER_REQUIRED. Newly joined windows start at responsive default 100%, ignoring legacy shared zoom. Other navigation cues the display, or one active independent viewerId. Use kanvas_call with operationId:\"kanvas.window.viewport\" and arguments:{\u2026} for an owned root overview window. Waits up to the configurable 2-second default for genuine acknowledgements from each originally targeted viewer and returns delivery outcomes applied/failed/offline/unconfirmed/superseded (pending while waiting). Applied confirms that viewer handled the command; an accepted command alone is not proof. Read kanvas.navigation.read only for a later check when unconfirmed; navigation receipts are not kanvas.update.status publication receipts. A content hold does not block within-view navigation.", schema: navigationInputSchema, idempotent: true,
        domain: "view-navigation",
        requiredScope: "publish",
        discovery: {"group":"controls","hint":"Within-view navigation, separate from source revision/history. Pages are one-based.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"page-1","navigation":{"action":"page","direction":"next"}}]},
        searchAliases: ["kanvas.navigation.control"]
    },
{
        name: "kanvas.navigation.read", summary: "Read navigation capabilities, position, and viewer acknowledgements when checking available actions and their application within content.", description: 'Read within-view position, available actions and per-viewer navigation acknowledgements. state.page is one-based like page input; pageIndex is explicitly zero-based. Includes current sync mode; cross-origin page contents are not observable.', schema: navigationReadSchema, readOnly: true,
        domain: "view-navigation",
        requiredScope: "read",
        discovery: {"group":"controls","hint":"Inspect navigation capabilities and per-viewer acknowledgements.","examples":[{"sessionId":"session-id","displayId":"display-id"}]},
        searchAliases: ["kanvas.navigation.read"]
    }
];
