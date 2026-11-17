

import {visualHelpSchema,showHelpSchema} from '../../visual-help.js';

import {z} from 'zod';

import {helpInputSchema} from '../../../shared/help.js';

import {GUIDE_TOPICS} from '.././guide.js';

import type {Definition} from '../canonical.js';
import {name} from '../operation-fields.js';

/** help operation contracts. Domain services enforce current account, role and scope. */
export const helpOperations: readonly Definition[] = [
{
        name: "kanvas.help.visual", description: 'Retrieve a reusable single-screen documentation view from a maintained help topic. Read-only. Includes pageCount; choose successive zero-based pages. Keyboard shortcuts share native definitions.', schema: visualHelpSchema, readOnly: true,
        domain: "help",
        requiredScope: "read",
        discovery: {"group":"guidance","hint":"Retrieve one reusable help view without publishing.","examples":[{"topic":"keyboard-shortcuts","page":0}]},
        searchAliases: ["kanvas.help.visual"]
    },
{
        name: "kanvas.help.show", description: 'Show a predefined focused help view on authorized displays, using normal publication guards and receipts. Discover visual-help and keyboard-shortcuts topics; traditional docs remain available.', schema: showHelpSchema, idempotent: true,
        domain: "help",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Publish one focused help page.","examples":[{"topic":"keyboard-shortcuts","page":0,"sessionId":"session-id","displayIds":["display-id"],"requestId":"help-show"}]},
        searchAliases: ["kanvas.help.show"]
    },
{
        name: "kanvas.help", description: 'Kanvas Help: focused task guidance and canonical public documentation. Read-only; never publishes or changes a display. General orientation offers a few choices; pass a topic and optional question for a specific how-to.', schema: helpInputSchema, readOnly: true,
        domain: "help",
        requiredScope: "read",
        discovery: {"group":"guidance","hint":"Read Kanvas Help for the user’s actual task; never auto-publish a canned deck.","examples":[{"topic":"orientation"},{"topic":"navigation","question":"How can we follow the same page?"}]},
        searchAliases: ["kanvas.help"]
    },
{
        name: "kanvas.guide",
        description: "Learn how to show useful content on a screen: current displays and revisions, templates, viewer browser location/timezone for local weather or near-me requests, and quiet outcome-focused conversation. Start here even without a session; optional topic selects a short focused guide. Read kanvas_call with operationId:\"kanvas.session.state\" and arguments:{\u2026} for current permissions and held displays, not cached metadata. Read-only documentation; it does not publish or grant access.",
        schema: z.strictObject({ topic: z.enum(GUIDE_TOPICS).default('getting-started') }), readOnly: true,
        domain: "help",
        requiredScope: "read",
        discovery: {"group":"guidance","hint":"Read a short workflow guide; no session or display is required.","examples":[{"topic":"getting-started"}]},
        searchAliases: ["kanvas.guide"]
    }
];
