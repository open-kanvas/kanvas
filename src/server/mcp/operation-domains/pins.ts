

import {navigationReadSchema,pinSaveSchema,pinRecallSchema,pinRemoveSchema} from '../../../shared/navigation.js';

import type {Definition} from '../canonical.js';
import {name} from '../operation-fields.js';

/** pins operation contracts. Domain services enforce current account, role and scope. */
export const pinsOperations: readonly Definition[] = [
{
        name: "kanvas.pin.save", description: 'Pin current or retained source content with a label. Separate bounded snapshot survives linear-history pruning. No display content change. Max 40 pins / 6 MB per session.', schema: pinSaveSchema, idempotent: true,
        domain: "pins",
        requiredScope: "publish",
        discovery: {"group":"controls","hint":"Bookmark current or retained view with a label without publishing.","examples":[{"sessionId":"session-id","displayId":"display-id","requestId":"pin-1","label":"Options to revisit"}]},
        searchAliases: ["kanvas.pin.save"]
    },
{
        name: "kanvas.pin.recall", description: 'Recall the named pinned view on its original display as a normal new history entry. Current revision and hold checks apply; no source regeneration. Same requestId retries do not duplicate the recall.', schema: pinRecallSchema, idempotent: true,
        domain: "pins",
        requiredScope: "publish",
        discovery: {"group":"controls","hint":"Return to pinned content via normal revision-safe history.","examples":[{"sessionId":"session-id","displayId":"display-id","pinId":"pin-id","requestId":"recall-1","expectedRevision":4}]},
        searchAliases: ["kanvas.pin.recall"]
    },
{
        name: "kanvas.pin.remove", description: 'Remove one bookmark without clearing the current or retained view.', schema: pinRemoveSchema, idempotent: true,
        domain: "pins",
        requiredScope: "publish",
        discovery: {"group":"controls","hint":"Remove the bookmark, not the displayed content.","examples":[{"sessionId":"session-id","displayId":"display-id","pinId":"pin-id"}]},
        searchAliases: ["kanvas.pin.remove"]
    },
{
        name: "kanvas.pins.read", description: 'List labels, revisions and IDs for pinned views on a display, without publishing.', schema: navigationReadSchema.omit({ viewerId: true }), readOnly: true,
        domain: "pins",
        requiredScope: "read",
        discovery: {"group":"controls","hint":"Read pin IDs and labels for this display.","examples":[{"sessionId":"session-id","displayId":"display-id"}]},
        searchAliases: ["kanvas.pins.read"]
    }
];
