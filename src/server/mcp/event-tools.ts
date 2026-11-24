import type {Definition} from './canonical.js';
import {pointingConfigureSchema,pointingReadSchema} from '../../shared/pointing.js';
import {z} from 'zod';
import {autoplayControlSchema,autoplayReadSchema} from '../autoplay.js';
import {toolLogAppendSchema,toolLogReadSchema} from '../tool-log.js';
import {publicAccessSchema} from '../public-sessions.js';
const id=z.string().min(1).max(128);
export const eventTools: readonly Definition[] = [
    {
        name: "kanvas.pointing.configure", description: 'Pointing is ON by default: a tap leaves a fading named mark, a long press or double tap pins it, and what was pointed at arrives in a pointing block on your next response. OWNER: disable/enable a session, or show the on-screen Point tools, with confirm:true and settings expectedRevision (initially 0). Overlay only: no source/history edits.', schema: pointingConfigureSchema,
        domain: "viewers",
        requiredScope: "publish" as const,
        discovery: {"group":"access","hint":"Turn session pointing off or on, or show the on-screen Point tools. Pointing is on by default.","examples":[{"sessionId":"session-id","enabled":false,"expectedRevision":0,"confirm":true}]},
        searchAliases: ["kanvas.pointing.configure"]
    },
    {
        name: "kanvas.pointing.read", description: 'Read session pointing settings and the marks on a display now. Not needed to learn what was pointed at: that arrives in the pointing block of your next response. canPoint describes only the calling principal: agents are read-only (eligibilityReason agent-read-only), not proof that a receiving browser cannot point. Text spans, source table cells and chart marks are semantic; images use image-relative coordinates; anything else is a point as a fraction of the view.', schema: pointingReadSchema, readOnly: true,
        domain: "viewers",
        requiredScope: "read" as const,
        discovery: {"group":"access","hint":"Read the pointing setting and the marks on a display now. Gestures reach you unasked in the pointing block of your next response.","examples":[{"sessionId":"session-id"},{"sessionId":"session-id","displayId":"display-id"}]},
        searchAliases: ["kanvas.pointing.read"]
    },
    {
        name: "kanvas.autoplay.control", description: 'Explicit prepared-content carousel/kiosk: start, pause, resume or stop. Start accepts an optional stale-write expectedRevision guard and intervalSeconds from 0.25 to 86400 (default 5; faster sequences require an explicit user request); loop:false plays once. frames selects saved display views/history; omit for the current presentation. Frames are already prepared. Persistent across server/context restart; stops on newer publication, hold or lost authority. Bare pause/resume/stop needs sessionId, displayId, requestId and action. Optional runId/expectedVersion guards reject stale commands. Browser painting is separate.', schema: autoplayControlSchema, idempotent: true,
        domain: "presentation",
        requiredScope: "publish" as const,
        discovery: {"group":"controls","hint":"Explicit kiosk/slideshow playback of prepared views. Arbitrary interval, once or loop; persists between contexts.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"autoplay-1","action":"start","intervalSeconds":7.5,"loop":true},{"sessionId":"session-id","displayId":"display-id","requestId":"autoplay-pause","action":"pause"}]},
        searchAliases: ["kanvas.autoplay.control"]
    },
    {
        name: "kanvas.autoplay.read", description: 'Read the durable autoplay state, current index, interval, loop/once, next deadline and version. No publication.', schema: autoplayReadSchema, readOnly: true,
        domain: "presentation",
        requiredScope: "read" as const,
        discovery: {"group":"controls","hint":"Read autoplay state. Optional expectedVersion/runId guards reject stale controls; bare pause/stop controls the current run.","examples":[{"sessionId":"session-id","displayId":"display-id"}]},
        searchAliases: ["kanvas.autoplay.read"]
    },
    {
        name: "kanvas.tool.log.append", description: 'Persist supplied tool-call events in the selected session/channel. KANVAS MCP calls are logged automatically. Append is optional for external integrations. Each event has a unique id, timestamp, integration and tool. Same IDs/content safely deduplicate. Never include credentials or sensitive raw arguments. Publish tool-call-log to show newest first with adjacent repeats folded.', schema: toolLogAppendSchema, idempotent: true,
        domain: "feed",
        requiredScope: "publish" as const,
        discovery: {"group":"content","hint":"Agent-reported tool calls; append exact events to persistent history.","examples":[{"sessionId":"session-id","requestId":"calls-1","channel":"main","events":[{"id":"call-1","integration":"Browser","tool":"search","timestamp":"2026-09-21T19:00:00Z","status":"completed"}]}]},
        searchAliases: ["kanvas.tool.log.append"]
    },
    {
        name: "kanvas.tool.log.read", description: 'Read persistent automatic KANVAS and supplied external calls. Omit sessionId for private account-level calls. Newest first, paginating nextCursor as before. Calls survive agent context resets; no metrics or charts are generated.', schema: toolLogReadSchema, readOnly: true,
        domain: "feed",
        requiredScope: "read" as const,
        discovery: {"group":"feedback","hint":"Read original tool-call events; paginate the returned cursor. Newest first, no aggregate stats.","examples":[{"sessionId":"session-id","channel":"main","limit":100}]},
        searchAliases: ["kanvas.tool.log.read"]
    },
    {
        name: "kanvas.session.public.access", description: 'OWNER-ONLY explicit opt-in public session. enabled:true exposes all current session displays to anonymous browsers without pairing or login; no workspace, history, reports or management access. OFF by default. confirm:true requires the owner request, current publicAccess.revision (0 initially). enabled:false immediately revokes readers.', schema: publicAccessSchema,
        domain: "sharing",
        requiredScope: "publish" as const,
        discovery: {"group":"access","hint":"Owner-only explicit anonymous read access; off by default. Disabling revokes live readers.","examples":[{"sessionId":"session-id","enabled":true,"confirm":true,"expectedRevision":0}]},
        searchAliases: ["kanvas.session.public.access"]
    },
    {
        name: "kanvas.scoreboard.control", description: 'Adjust a numeric scoreboard side by plus/minus its configured step, or set its exact numeric/text score. Editor access is required; expectedRevision is an optional stale-write guard. Supply a stable requestId for safe retries. No sport-specific rules. Authorized interactive viewers may tap the displayed plus/minus controls.', schema: z.object({ sessionId: id, displayId: id, expectedRevision: z.number().int().nonnegative().optional(), requestId: id, sideId: id, action: z.enum(['increase', 'decrease', 'set']), score: z.union([z.number().finite(), z.string().max(120)]).optional() }).strict().refine(a => a.action === 'set' ? a.score !== undefined : a.score === undefined, 'Only set supplies a score'), idempotent: true,
        domain: "scoreboard",
        requiredScope: "publish" as const,
        discovery: {"group": "controls", "hint": "Change one scoreboard score with current revision; identical retries are safe.", "examples": [{"sessionId": "session-id", "displayId": "display-id", "expectedRevision": 3, "requestId": "score-1", "sideId": "home", "action": "increase"}, {"sessionId": "session-id", "displayId": "display-id", "sideId": "home", "action": "set", "score": "Advantage", "requestId": "score-set-1"}]},
        searchAliases: ["kanvas.scoreboard.control"]
    },
] as const;
