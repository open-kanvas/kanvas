import { displaysSyncReadSchema, displaysSyncSchema } from '../display-sync.js';
import type { Definition } from './canonical.js';

/** Linked displays within a session: slide and step navigation moves together. */
export const syncTools: Definition[] = [
  { name: 'kanvas_displays_sync', schema: displaysSyncSchema,
    description: 'LINK DISPLAYS: keep the slide or step position of two or more displays in a session together, in both directions (for example a main deck and a speaker-notes deck on a phone). action link (optionally alignTo) or unlink. Navigation on any linked display moves the others; links persist for the session. Works for presentations, procedures and recipes.' },
  { name: 'kanvas_displays_sync_read', readOnly: true, schema: displaysSyncReadSchema,
    description: 'LINKED DISPLAYS: which displays in a session are linked, the shared position, and each display’s current slide or step. Read-only.' },
];
