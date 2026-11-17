

import {z} from 'zod';

import {videoControlInput} from '../../video-controls.js';

import type {Definition} from '../canonical.js';
import {id,requestId,name,revision} from '../operation-fields.js';

/** video operation contracts. Domain services enforce current account, role and scope. */
export const videoOperations: readonly Definition[] = [
{
        name: "kanvas.video.control",
        description: "Control the already-loaded video without replacing its view: play/pause, seek (time in seconds, 0\u201386400), skip (signed value in seconds), restart, mute/unmute, volume (value 0\u20131), rate (value 0.25\u20134), fullscreen (optional desired fullscreen boolean). Supply current expectedRevision and stable requestId. Returns a command receipt; check kanvas_call with operationId:\"kanvas.video.status\" and arguments:{\u2026}. Receiving-browser play/fullscreen restrictions may require a local click. Commands expire after 30 seconds.",
        schema: z.strictObject({ sessionId: id, displayId: id, requestId, expectedRevision: revision.optional(), command: videoControlInput }), idempotent: true,
        domain: "video",
        requiredScope: "publish",
        discovery: {"group":"controls","hint":"Send a command to the already loaded video; action belongs inside command. Inspect the separate acknowledgement.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"video-pause-1","command":{"action":"pause"}}]},
        searchAliases: ["kanvas.video.control"]
    },
{
        name: "kanvas.video.status",
        description: 'Read the receiving browser’s acknowledgement of a runtime video command. Reports pending/applied/blocked/failed/expired/superseded and actual playback state when acknowledged. A queued command is not proof of playback; blocked requires a local device gesture.',
        schema: z.strictObject({ sessionId: id, displayId: id, commandId: id.optional() }), readOnly: true,
        domain: "video",
        requiredScope: "read",
        discovery: {"group":"controls","hint":"Read the latest video-command acknowledgement, not publication status or an assumption that playback started.","examples":[{"sessionId":"session-id","displayId":"display-id"}]},
        searchAliases: ["kanvas.video.status"]
    }
];
