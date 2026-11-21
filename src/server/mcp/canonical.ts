import {interactionsOperations} from './operation-domains/interactions.js';
import {archiveOperations} from './operation-domains/archive.js';
import {helpOperations} from './operation-domains/help.js';
import {viewNavigationOperations} from './operation-domains/view-navigation.js';
import {pinsOperations} from './operation-domains/pins.js';
import {presentationOperations} from './operation-domains/presentation.js';
import {timerOperations} from './operation-domains/timer.js';
import {monitorOperations} from './operation-domains/monitor.js';
import {templateOperations} from './operation-domains/template.js';
import {feedbackOperations} from './operation-domains/feedback.js';
import {reportsOperations} from './operation-domains/reports.js';
import {sessionOperations} from './operation-domains/session.js';
import {sessionHistoryOperations} from './operation-domains/session-history.js';
import {sessionEndOperations} from './operation-domains/session-end.js';
import {displayOperations} from './operation-domains/display.js';
import {publishOperations} from './operation-domains/publish.js';
import {displayRevisionsOperations} from './operation-domains/display-revisions.js';
import {videoOperations} from './operation-domains/video.js';
import {displayClearOperations} from './operation-domains/display-clear.js';
import {importOperations} from './operation-domains/import.js';
import {dataDeleteOperations} from './operation-domains/data-delete.js';
import {membersOperations} from './operation-domains/members.js';
import {suggestedGuidanceTools} from '../suggested-guidance.js';

import {venueTools} from '../venue.js';
import {customTools} from '../custom-templates.js';
import {mediaTools} from '../media-library.js';
import {browserAuthTools} from '../browser-auth.js';
import {inviteEmailTools} from '../invite-email.js';
import {guidanceTools} from '../agent-guidance.js';
import {diagnosticTools} from '../frontend-diagnostics.js';
import {flashcardTools} from '../flashcards.js';
import {checklistTools} from '../checklists.js';

import {randomUUID} from 'node:crypto';

import {eventTools} from './event-tools.js';
import {accountTools} from './account-tools.js';
import {workTools} from './work-tools.js';
import {documentTools,plannerTools} from './document-tools.js';
import {syncTools} from './sync-tools.js';
import {homeTools} from './home-tools.js';

import {invitationTools} from './invitation-tools.js';
import {z} from 'zod';
import {taskListTools} from '../task-lists.js';
import {agentTools} from '../agents.js';
import {frictionTools} from '../friction.js';
import {monitorStreamTools} from '../monitor-streams.js';
import {boardTools} from '../message-board.js';
import {pickerTools} from '../pickers.js';

import {experienceTools} from './experience-tools.js';

import type {Tool} from '@modelcontextprotocol/server';
import {TEMPLATE_IDS} from '../../shared/types.js';

import {InputError,validationIssues} from '../input-errors.js';

import {withToolDiscovery} from './tool-discovery.js';
import {VIEWER_LINK_TOOL_GUIDANCE} from './viewer-link-guidance.js';
import {PUBLISHING_DESCRIPTION} from './publishing-guidance.js';
import {SESSION_CONTINUITY_TOOL_GUIDANCE} from './session-continuity.js';
import {VISUAL_INTENT_SUBMIT_HINT} from './visual-intent.js';

/** The session's declared tempo; auto returns to the deterministic default. See help kanvas.help.modes. */

export interface Definition {
  domain: string;
  requiredScope: 'read' | 'publish';
  discovery: import('./tool-discovery.js').ToolDiscoveryEntry;
  searchAliases: readonly string[];
  name: string;
  description: string;
  schema: z.ZodType;
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  openWorld?: boolean;
  jsonSchemaExtras?: Record<string, unknown>;
}

const definitions: readonly Definition[] = [
  ...interactionsOperations,
  ...venueTools,
  ...customTools,
  ...mediaTools,
  ...archiveOperations,
  ...browserAuthTools,
  ...inviteEmailTools,
  ...guidanceTools,
  ...suggestedGuidanceTools,
  ...diagnosticTools,
  ...flashcardTools,
  ...checklistTools,
  ...taskListTools,
  ...agentTools,
  ...frictionTools,
  ...monitorStreamTools,
  ...boardTools,
  ...pickerTools,
  ...eventTools,
  ...experienceTools,
  ...invitationTools,
  ...workTools,
  ...accountTools,
  ...documentTools,
  ...plannerTools,
  ...syncTools,
  ...homeTools,
  ...helpOperations,
  ...viewNavigationOperations,
  ...pinsOperations,
  ...presentationOperations,
  ...timerOperations,
  ...monitorOperations,
  ...templateOperations,
  ...feedbackOperations,
  ...reportsOperations,
  ...sessionOperations,
  ...sessionHistoryOperations,
  ...sessionEndOperations,
  ...displayOperations,
  ...publishOperations,
  ...displayRevisionsOperations,
  ...videoOperations,
  ...displayClearOperations,
  ...importOperations,
  ...dataDeleteOperations,
  ...membersOperations
];

function requestFallbackMetadata(value:unknown):any {
  if(Array.isArray(value))return value.map(requestFallbackMetadata);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,key==='required'&&Array.isArray(child)?child.filter(field=>field!=='requestId'):requestFallbackMetadata(child)]));
  return value;
}
function forgiving(tool:Definition):Definition {
  const schema=tool.schema;
  if(tool.readOnly || !(schema instanceof z.ZodObject) || !schema.shape.requestId)return tool;
  return {...tool,idempotent:false,schema:schema.safeExtend({requestId:schema.shape.requestId.optional().transform((value:string|undefined)=>value??randomUUID()).describe('Stable ID deduplicates retries; omission creates a fresh ID per call.')}).meta(requestFallbackMetadata(schema.meta()??{}))};
}
export const CANONICAL_TOOLS: readonly Definition[] = definitions.map(forgiving).map(tool => Object.hasOwn(VIEWER_LINK_TOOL_GUIDANCE, tool.name)
    ? { ...tool, description: `${tool.description} First use: provide the actual literal, clickable, copyable URL as text, including in voice mode; do not repeat it after every update. ${VIEWER_LINK_TOOL_GUIDANCE[tool.name as keyof typeof VIEWER_LINK_TOOL_GUIDANCE]}` }
    : tool).map(tool => tool.name === "kanvas.submit" ? { ...tool, description: `${VISUAL_INTENT_SUBMIT_HINT} ${tool.description} ${PUBLISHING_DESCRIPTION}` }
    : tool.name === "kanvas.guide" ? { ...tool, description: `${tool.description} Topic tools groups the callable capabilities and distinguishes their effects; topic publishing provides complete context/data/intent recipes and common exact data shapes without a required schema round trip.` } : tool)
    .map(tool => { const shape = tool.schema instanceof z.ZodObject ? tool.schema.shape : undefined; return shape?.expectedRevision || shape?.expectedVersion || shape?.expectedRevisions || shape?.expectedDraftRevision || shape?.expectedDeckRevision ? { ...tool, description: tool.description.replace(/Requires expectedRevision/gi, 'Optional expectedRevision').replace(/(?:requires?|supply|uses?) (?:the )?current (?:display )?(?:expectedRevision|revision)/gi, 'may use an explicit revision guard') + ' Concurrency: expectedRevision/expectedVersion is OPTIONAL. Omit it to atomically apply to current authorized state; supplying it opts into stale-write rejection. Conflicts return currentRevision for retry.' } : tool; })
    .map(tool => Object.hasOwn(SESSION_CONTINUITY_TOOL_GUIDANCE, tool.name) ? { ...tool, description: `${tool.description} ${SESSION_CONTINUITY_TOOL_GUIDANCE[tool.name as keyof typeof SESSION_CONTINUITY_TOOL_GUIDANCE]}` } : tool);

export const CANONICAL_TOOL_NAMES = CANONICAL_TOOLS.map(tool => tool.name);

/** Public JSON Schema and server-side validation share the same definitions. */
export function canonicalToolDefinitions(): Tool[] {
  return CANONICAL_TOOLS.map(tool => {
    const { $schema: _schema, ...json } = z.toJSONSchema(tool.schema, { unrepresentable: 'any', io: 'input' });
    return withToolDiscovery({
      name: tool.name,
      description: tool.description,
      inputSchema: { ...json, ...tool.jsonSchemaExtras, type: 'object' } as Tool['inputSchema'],
      annotations: {
        readOnlyHint: tool.readOnly ?? false,
        destructiveHint: tool.destructive ?? false,
        idempotentHint: tool.idempotent ?? tool.readOnly ?? false,
        openWorldHint: tool.openWorld ?? false,
      },
    }, tool.discovery);
  });
}

export function parseCanonicalArguments(name: string, args: unknown): Record<string, unknown> | undefined {
  const tool = CANONICAL_TOOLS.find(candidate => candidate.name === name);
  if (!tool) return undefined;
  const result = tool.schema.safeParse(args ?? {});
  return result.success ? result.data as Record<string, unknown> : undefined;
}

/** Keep schema-owned field guidance when a host sends invalid tool arguments. */
export function canonicalArgumentError(name: string, args: unknown): InputError | undefined {
    const tool = CANONICAL_TOOLS.find(candidate => candidate.name === name);
    const result = tool?.schema.safeParse(args ?? {});
    const report = ["kanvas.feedback.submit", "kanvas.error.report", "kanvas.reports.read", "kanvas.report.update", "kanvas.report.patch"].includes(name);
    const input = args && typeof args === 'object' ? args as Record<string, unknown> : undefined;
    const suppliedView = input?.view && typeof input.view === 'object' ? input.view as Record<string, unknown> : undefined;
    const requestedTemplate = suppliedView?.template ?? input?.templateHint;
    const template = typeof requestedTemplate === 'string' && TEMPLATE_IDS.some(value => value === requestedTemplate) ? requestedTemplate : undefined;
    return result && !result.success ? new InputError(validationIssues(result.error, '', args, report, tool?.schema), template, report ? { schemaTool: "kanvas.guide", topic: 'feedback' } : template ? { schemaTool: "kanvas.template.get" } : { schemaTool: "kanvas.guide", topic: 'tools' }) : undefined;
}
