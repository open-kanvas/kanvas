import {z} from 'zod';
import {parseJsonTree} from './connection-views.js';
import {HUMAN_INVITATION} from './philosophy.js';
const jsonSource=z.string().min(1).max(262144).refine(value=>{try{parseJsonTree(value);return true;}catch{return false;}},'Supply valid JSON source text with at most 12000 nodes and 64 nested levels.');
const pane=z.enum(['raw','tree']);
/** One tool call in full: what was sent beside what came back. */
export const toolCallDetailsDataSchema=z.object({
 tool:z.string().min(1).max(160).describe('Tool or operation name.'),
 integration:z.string().max(120).optional(),
 status:z.enum(['success','error','running']).default('success'),
 durationMs:z.number().int().nonnegative().max(86_400_000).optional(),
 timestamp:z.string().datetime({offset:true}).optional(),
 request:jsonSource.describe('The arguments as exact JSON source text.'),
 response:jsonSource.optional().describe('The result as exact JSON source text. Use responseText when the result was not JSON.'),
 responseText:z.string().max(262144).optional().describe('The result when it came back as plain text.'),
 error:z.object({code:z.string().max(80).optional(),message:z.string().min(1).max(1000)}).strict().optional().describe('Shown prominently under the header when the call failed.'),
 view:pane.default('raw').describe('raw (default): pretty-printed JSON text with line numbers. tree: collapsible tree. Applies to both panes.'),
 highlight:z.object({pane:z.enum(['request','response']),path:z.string().min(1).max(300).regex(/^\$(?:\.[A-Za-z_$][\w$-]*|\[\d+\]|\["(?:[^"\\]|\\.)*"\])*$/).describe('JSON path of the field to mark, e.g. $.arguments.items[0].start'),note:z.string().max(160).optional()}).strict().optional(),
 expanded:z.boolean().default(false).describe('Long results are cut to the first lines on screen; true shows everything. The full content is always stored.'),
}).strict().refine(data=>!(data.response&&data.responseText),{path:['responseText'],message:'Supply response (JSON) or responseText (plain text), not both.'});
export type ToolCallDetailsData=z.infer<typeof toolCallDetailsDataSchema>;
/** Lines shown per pane before a long result is cut on screen. */
export const TOOL_CALL_LINES=60;
/** Compact overview of the agents connected to an account. */
export const agentsDataSchema=z.object({
 agents:z.array(z.object({
  id:z.string().min(1).max(128),name:z.string().min(1).max(80),type:z.string().max(40).optional(),
  connectedNow:z.boolean().default(false),lastSeenAt:z.string().datetime({offset:true}).optional(),
  sessionCount:z.number().int().nonnegative().default(0),lastSession:z.string().max(120).optional().describe('Name of the most recent session only; full lists stay readable through kanvas.agents.read.'),
  model:z.string().max(120).optional().describe('Self-reported, unverified.'),revoked:z.boolean().optional(),
 }).strict()).max(50),
}).strict();
export type AgentsData=z.infer<typeof agentsDataSchema>;
/** The first-time invitation, in Kanvas's own style. Every field has the founder's default. */
export const welcomeDataSchema=z.object({
 line:z.string().min(1).max(120).default(HUMAN_INVITATION.line),
 examples:z.array(z.string().min(1).max(90)).min(1).max(3).default([...HUMAN_INVITATION.examples]).describe('Things to say to the agent.'),
}).strict();
export type WelcomeData=z.infer<typeof welcomeDataSchema>;
