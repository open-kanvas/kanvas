

import {feedbackSubmitSchema,errorReportSchema,reportUpdateSchema,reportPatchSchema,REPORT_DESCRIPTION_MAX,REPORT_CREATE_BYTES} from '../../../shared/reports.js';

import type {Definition} from '../canonical.js';
import {name} from '../operation-fields.js';

/** feedback operation contracts. Domain services enforce current account, role and scope. */
export const feedbackOperations: readonly Definition[] = [
    {
        name: "kanvas.feedback.submit",
        description: `Offer after errors, workarounds or confusion; file only on request or consent, without private content or credentials. Do not nag. Save detailed product feedback or an improvement suggestion. Description: 1–${REPORT_DESCRIPTION_MAX} characters, title: 1–160; stored record at most ${REPORT_CREATE_BYTES} UTF-8 JSON bytes. Over-limit errors name the field, maximum and submitted size; do not retry unchanged. kanvas_discover catalog help action search for "feedback" explains limits. There is no category field. Bugs are filed with kanvas_call with operationId:"kanvas.error.report" and arguments:{\u2026} instead. Returns a durable private report ID/status/revision. Reuse requestId only for an identical retry. No credentials, private payloads or raw logs. Separate from viewer interactions; filing does not change code or send messages.`,
        schema: feedbackSubmitSchema, jsonSchemaExtras: { anyOf: [{ required: ['sessionId'] }, { not: { anyOf: [{ required: ['displayId'] }, { required: ['updateId'] }] } }] }, idempotent: true,
        domain: "feedback",
        requiredScope: "publish",
        discovery: { "group": "feedback", "hint": "File an observed product suggestion, not a viewer interaction or an instruction to change code.", "examples": [{ "sessionId": "session-id", "requestId": "feedback-1", "title": "Example usability observation", "description": "Example only: describe the observed friction and a proposed improvement." }] },
        searchAliases: ["kanvas.feedback.submit"]
    },
    {
        name: "kanvas.error.report",
        description: `Save a reproducible KANVAS problem. Description: 1–${REPORT_DESCRIPTION_MAX} characters; title 1–160; steps accepts a list of up to 8 strings of 400 characters each OR one reproduction-text string up to 3200 characters; expected/actual each 1000; stored record at most ${REPORT_CREATE_BYTES} UTF-8 JSON bytes. Errors identify the field/limit/submitted size; see kanvas_discover catalog help action search for "feedback". Severity: low, normal or high. Link display/update and diagnosticId. Never include credentials, headers or raw private content. Reuse requestId only for identical retries. Returns a durable private report ID; filing does not mean it is fixed.`,
        schema: errorReportSchema, jsonSchemaExtras: { anyOf: [{ required: ['sessionId'] }, { not: { anyOf: [{ required: ['displayId'] }, { required: ['updateId'] }, { required: ['diagnosticId'] }] } }] }, idempotent: true,
        domain: "feedback",
        requiredScope: "publish",
        discovery: { "group": "feedback", "hint": "File an observed problem; steps accepts a list or reproduction prose, diagnosticId is optional. No credentials or raw private logs. Filing is not evidence of a fix.", "examples": [{ "sessionId": "session-id", "requestId": "error-1", "title": "Example display problem", "description": "Example only: describe the reproduction and expected versus observed result.", "steps": ["Open the intended display.", "Describe the observed result."], "severity": "normal" }, { "sessionId": "session-id", "requestId": "error-2", "title": "Example prose reproduction", "description": "Example only: describe a reproducible issue.", "steps": "Open the display, request the action, then describe what happens." }] },
        searchAliases: ["kanvas.error.report"]
    },
    {
        name: "kanvas.report.patch", description: 'Patch your report by reportId/expectedRevision; no sessionId needed. Append note or replace title/description. Account and original session access still apply; review authority unchanged. No credentials.', schema: reportPatchSchema,
        domain: "feedback",
        requiredScope: "publish",
        discovery: { "group": "feedback", "hint": "Append a follow-up to your report by ID, no original sessionId needed. Current permissions and revision still apply.", "examples": [{ "reportId": "report-id", "expectedRevision": 0, "note": "Additional verified finding." }] },
        searchAliases: ["kanvas.report.patch"]
    },
    {
        name: "kanvas.report.update",
        description: 'As session owner, record an explicit review decision: open, investigating, resolved or dismissed, with a required note explaining the finding or fix. Supply the report’s current expectedRevision to prevent overwriting another review. Status labels are reviewer assertions, not automated proof; do not mark resolved without verifying the fix.',
        schema: reportUpdateSchema,
        domain: "feedback",
        requiredScope: "publish",
        discovery: { "group": "feedback", "hint": "Record the owner’s review decision at the report’s current revision. Mark resolved only after verification.", "examples": [{ "sessionId": "session-id", "reportId": "report-id", "expectedRevision": 3, "status": "investigating", "note": "Review started; resolution has not been verified." }] },
        searchAliases: ["kanvas.report.update"]
    }
];
