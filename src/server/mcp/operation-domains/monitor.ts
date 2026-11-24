

import {monitoringStartSchema,monitoringReadSchema,monitoringUpdateSchema,monitoringStopSchema,livePushSchema} from '../../../shared/monitoring.js';
import type {Definition} from '../canonical.js';
import {name} from '../operation-fields.js';

/** monitor operation contracts. Domain services enforce current account, role and scope. */
export const monitorOperations: readonly Definition[] = [
{
        name: "kanvas.monitoring.start", summary: "Start bounded public-source polling into a display when configuring persistent uptime, JSON, or image monitoring.",
        description: 'Explicitly start bounded server-side refresh of a public HTTPS source into one display, deterministically. Editor access is required; expectedRevision is an optional stale-write guard. Example config:{mode:"uptime",url:"https://example.com/healthz",intervalSeconds:60,durationSeconds:3600}. JSON mode maps exact response data with {$path:"/field"}, {$each:"/items",map:{...}}, literal JSON; image mode accepts validated raster snapshots. Minimum interval 30s, maximum duration 7 days. No scripts, credentials, custom headers, private/local endpoints or silent background setup. Returns durable job ID/health; a newer display publication supersedes the job. Browser application and source health are separate.',
        schema: monitoringStartSchema, idempotent: true, openWorld: true,
        domain: "monitor",
        requiredScope: "publish",
        discovery: {"group":"monitoring","hint":"Start only explicitly requested public-source polling. This example is NOT authorization to contact a source or replace the display.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"monitor-1","config":{"mode":"uptime","url":"https://example.com/status","intervalSeconds":60,"durationSeconds":3600}}]},
        searchAliases: ["kanvas.monitoring.start"]
    },
{
        name: "kanvas.live.push", summary: "Replace an existing number or chart's data with an authenticated live sample when an external producer supplies updates.",
        description: 'Receive one real inbound live sample/window over authenticated MCP, without polling or generating content. Publish a number or chart (gauge, line, area, bar, heatmap) first; push COMPLETE data with current expectedRevision and a unique requestId. Serial producers use the returned revision for their next sample; retry a lost response with identical arguments. A hold, changed chart kind, stale revision, revoked grant or ended session rejects the sample without altering the display. Requires editor/publish authority. Browser paint is separately acknowledged. Stop the producer to stop updates; this call creates no polling job or anonymous webhook.',
        schema: livePushSchema, idempotent: true,
        domain: "monitor",
        requiredScope: "publish",
        discovery: {"group":"monitoring","hint":"Publish a compatible number/chart first. Send complete exact data with current revision; serialize producer samples using returned revisions. Identical retries reuse requestId; holds, revocation and conflicts stop the producer.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"sample-1","data":{"value":"23.4500","label":"Temperature","unit":"°C"}}]},
        searchAliases: ["kanvas.live.push"]
    },
{
        name: "kanvas.monitoring.read", summary: "Read monitoring job status, failures, and source health when checking persistent polling without fetching the source again.",
        description: 'Read authorized persistent monitoring jobs and source health: last success, next poll, failures/staleness, actual HTTP status and latency, expiry and stop reason. A failed check retains the last valid content; it does not prove the source itself is down. No network call is made by this read.',
        schema: monitoringReadSchema, readOnly: true,
        domain: "monitor",
        requiredScope: "read",
        discovery: {"group":"monitoring","hint":"Read persisted job health without making a network request; optionally select one jobId.","examples":[{"sessionId":"session-id","jobId":"job-id"}]},
        searchAliases: ["kanvas.monitoring.read"]
    },
{
        name: "kanvas.monitoring.update", summary: "Replace an active monitoring job's configuration when adjusting its source or schedule without reviving stopped jobs.",
        description: 'Replace the complete configuration of an active monitor with current expectedVersion and a stable requestId. Retains ownership and uses the same public-source, mapping and resource bounds as start. Does not override a newer view or revive a stopped job; explicitly start a new job for that.',
        schema: monitoringUpdateSchema, idempotent: true, openWorld: true,
        domain: "monitor",
        requiredScope: "publish",
        discovery: {"group":"monitoring","hint":"Replace an active job’s COMPLETE config using its expectedVersion, not a display revision or partial merge.","examples":[{"sessionId":"session-id","jobId":"job-id","requestId":"monitor-change-1","expectedVersion":1,"config":{"mode":"uptime","url":"https://example.com/status","intervalSeconds":60,"durationSeconds":3600}}]},
        searchAliases: ["kanvas.monitoring.update"]
    },
{
        name: "kanvas.monitoring.stop", summary: "Stop a persistent monitoring job when ending automatic polling while retaining the last valid displayed content.",
        description: 'Stop an authorized persistent monitoring job using its current expectedVersion and stable requestId. Abort in-flight work and retain the last displayed content. This stops polling, not the whole session.',
        schema: monitoringStopSchema, idempotent: true,
        domain: "monitor",
        requiredScope: "publish",
        discovery: {"group":"monitoring","hint":"Stop this job at its current expectedVersion; retain the last view and the session.","examples":[{"sessionId":"session-id","jobId":"job-id","requestId":"monitor-stop-1","expectedVersion":1}]},
        searchAliases: ["kanvas.monitoring.stop"]
    }
];
