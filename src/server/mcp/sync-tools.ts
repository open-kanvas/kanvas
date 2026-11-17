import {displaysSyncReadSchema,displaysSyncSchema} from '../display-sync.js';
import type {Definition} from './canonical.js';

/** Linked displays within a session: slide and step navigation moves together. */
/** Linked displays within a session: slide and step navigation moves together. */
export const syncTools: Definition[] = [
    {
        name: "kanvas.displays.sync", schema: displaysSyncSchema,
        description: 'LINK DISPLAYS: keep the slide or step position of two or more displays in a session together, in both directions (for example a main deck and a speaker-notes deck on a phone). action link (optionally alignTo) or unlink. Navigation on any linked display moves the others; links persist for the session. Works for presentations, procedures and recipes.',
        domain: "display-sync",
        requiredScope: "publish",
        discovery: {"group":"displays","hint":"Link displays so slide or step navigation on any of them moves the others. It works in both directions, for example a main deck and matching speaker notes on a phone. Link aligns the others to alignTo, or to an already-linked display; unlink removes displays. Links persist for the session; new content on a linked display keeps its own position until someone navigates.","examples":[{"sessionId":"session-id","action":"link","displayIds":["main-display-id","notes-display-id"],"alignTo":"main-display-id"},{"sessionId":"session-id","action":"unlink","displayIds":["notes-display-id"]}]},
        searchAliases: ["kanvas.displays.sync"]
    },
    {
        name: "kanvas.displays.sync.read", readOnly: true, schema: displaysSyncReadSchema,
        description: 'LINKED DISPLAYS: which displays in a session are linked, the shared position, and each display’s current slide or step. Read-only.',
        domain: "display-sync",
        requiredScope: "read",
        discovery: {"group":"displays","hint":"Show which displays of a session are linked, their shared position and each display’s current slide or step.","examples":[{"sessionId":"session-id"}]},
        searchAliases: ["kanvas.displays.sync.read"]
    },
];
