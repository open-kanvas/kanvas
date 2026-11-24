

import {z} from 'zod';

import type {Definition} from '../canonical.js';
import {id,name,revision,dimensions,ratio} from '../operation-fields.js';

/** display operation contracts. Domain services enforce current account, role and scope. */
export const displayOperations: readonly Definition[] = [
{
        name: "kanvas.display.register", summary: "Create a named display and return its viewer URL when adding a new screen target to a session.",
        description: "Set up a named screen and return its viewerUrl. Width/height are optional usable CSS pixels: provisional 1280\u00D7720 when unknown; the receiving browser reports its actual viewport after opening. First-time orientation: kanvas_discover catalog help action search for \"getting started\", current displays and revisions in kanvas_call with operationId:\"kanvas.session.state\" and arguments:{\u2026}, templates in kanvas_discover catalog templates action get by exact template ID, and consented viewer location/timezone in kanvas_call with operationId:\"kanvas.viewers.read\" and arguments:{\u2026}. Open the URL with a separately signed-in or owner-approved browser; it is not an access grant. Respect permissions and held displays.",
        schema: z.strictObject({ sessionId: id, name, width: dimensions.default(1280), height: dimensions.default(720), pixelRatio: ratio.optional() }),
        domain: "display",
        requiredScope: "publish",
        discovery: {"group":"displays","hint":"Register a named screen; unknown dimensions use a provisional 1280×720 until browser telemetry arrives. Use the returned viewer URL; publish separately with kanvas_call with operationId:\"kanvas.submit\" and arguments:{…}.","examples":[{"sessionId":"session-id","name":"Workshop screen"},{"sessionId":"session-id","name":"Known phone viewport","width":443,"height":823}]},
        searchAliases: ["kanvas.display.register"]
    },
{
        name: "kanvas.display.update", summary: "Change viewport dimensions or hold automatic updates when adjusting an existing display without replacing its content.",
        description: "Update display viewport dimensions or hold/release automatic updates. Supply expectedRevision for content-state changes such as hold. Does not replace content; use kanvas_call with operationId:\"kanvas.submit\" and arguments:{\u2026}.",
        schema: z.strictObject({
            sessionId: id, displayId: id, width: dimensions.optional(), height: dimensions.optional(),
            pixelRatio: ratio.optional(), held: z.boolean().optional(), expectedRevision: revision.optional(),
        }).refine(value => (value.width !== undefined || value.height !== undefined || value.pixelRatio !== undefined || value.held !== undefined)),
        jsonSchemaExtras: { anyOf: ['width', 'height', 'pixelRatio', 'held'].map(field => ({ required: [field] })) },
        idempotent: true,
        domain: "display",
        requiredScope: "publish",
        discovery: {"group":"displays","hint":"Viewport/hold only, NOT content. Publish with kanvas_call with operationId:\"kanvas.submit\" and arguments:{…}; expectedRevision optionally rejects stale held changes.","examples":[{"sessionId":"session-id","displayId":"display-id","width":443,"height":823},{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"held":true}]},
        searchAliases: ["kanvas.display.update"]
    },
{
        name: "kanvas.display.request.capture", summary: "Request a browser capture prompt when the person will locally choose and authorize a screen surface.", description: 'Arm one fixed capture routine on your connected signed-in browser; editor access required. Supply viewerId if ambiguous. No scripts. The person must click the existing viewer, then choose a surface in the native share picker; a remote call cannot supply user activation. Two-minute expiry. Poll capture-status; saved pixels are private session assets, not proof of which surface the person selected.', schema: z.strictObject({ sessionId: id, displayId: id, viewerId: id.optional() }), readOnly: false,
        domain: "display",
        requiredScope: "publish",
        discovery: {"group":"displays","hint":"Arm a predefined real browser capture; tell the person to click the viewer then choose a surface in the native picker. No remote scripting.","examples":[{"sessionId":"session-id","displayId":"display-id"}]},
        searchAliases: ["kanvas.display.request.capture"]
    },
{
        name: "kanvas.display.capture.status", summary: "Read a browser capture request's status and saved asset when checking completion after local sharing consent.", description: "Poll captureId for awaiting-user-gesture/awaiting-permission/complete/denied/unsupported/failed/expired. Complete returns private assetId/assetUrl; export via kanvas_call with operationId:\"kanvas.asset.export\" and arguments:{\u2026}. Request status expires ten minutes after its deadline or on restart; saved assets retain normal session protection.", schema: z.strictObject({ sessionId: id, displayId: id, captureId: id }), readOnly: true,
        domain: "display",
        requiredScope: "publish",
        discovery: {"group":"displays","hint":"Poll the captureId returned by request-capture for consent, failure or the private image asset.","examples":[{"sessionId":"session-id","displayId":"display-id","captureId":"capture-id"}]},
        searchAliases: ["kanvas.display.capture.status"]
    },
{
        name: "kanvas.display.snapshot", summary: "Render a display in an isolated server browser when obtaining an image rather than verifying physical-screen delivery.",
        description: 'Render an authorized display in an isolated server browser, NOT the physical viewer or delivery proof. Omitted dimensions use the latest connected viewer (foreground preferred), otherwise display defaults, capped at 1920×1080. Waits for fonts/images plus 1.5s settle. External media is blocked and reported except the built-in OpenStreetMap raster basemap (bounded anonymous, public DNS-pinned requests; no redirects). Session textSize applies; per-window navigation zoom is not inherited. Returns image, readiness/revision, and private session asset (capture quota follows the session owner’s tier: trial 100, free 1000, admin no count quota; byte/rate budgets remain); read grants save derived pixels without upload/publish rights. includeBase64:true adds metadata.export {base64,mimeType,name,size}, max 2 MiB, for authorized attachment workflows. Private URLs are not public download links. No credentials or raw URLs accepted.',
        schema: z.strictObject({ sessionId: id, displayId: id, width: z.number().int().min(320).max(1920).optional(), height: z.number().int().min(240).max(1080).optional(), includeBase64: z.boolean().default(false) }), readOnly: false,
        domain: "display",
        requiredScope: "publish",
        discovery: {"group":"displays","hint":"Capture an authorized view in a separate server browser; this is not the human screen or proof of its delivery.","examples":[{"sessionId":"session-id","displayId":"display-id"}]},
        searchAliases: ["kanvas.display.snapshot"]
    }
];
