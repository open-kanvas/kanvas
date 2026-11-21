import {z} from 'zod';
import {parseJsonTree} from './connection-views.js';

const jsonSource=z.string().min(1).max(262144).refine(value=>{try{parseJsonTree(value);return true;}catch{return false;}},'Supply valid JSON source text with at most 12000 nodes and 64 nested levels.');

const pane=z.enum(['raw','tree']);

/** One tool call in full: what was sent beside what came back. */
export const toolCallDetailsDataSchema=z.object({
 tool:z.string().min(1).max(160),
 integration:z.string().max(120).optional(),
 status:z.enum(['success','error','running']).default('success'),
 durationMs:z.number().int().nonnegative().optional(),
 timestamp:z.string().datetime({offset:true}).optional(),
 request:jsonSource.describe('Arguments as JSON source text.'),
 response:jsonSource.optional().describe('Result as JSON source text.'),
 responseText:z.string().max(262144).optional(),
 error:z.object({code:z.string().max(80).optional(),message:z.string().min(1).max(1000)}).strict().optional(),
 view:pane.default('raw'),
 highlight:z.object({pane:z.enum(['request','response']),path:z.string().min(1).max(300).describe('JSON path, e.g. $.items[0].start'),note:z.string().max(160).optional()}).strict().optional(),
 expanded:z.boolean().default(false),
}).strict().refine(data=>!(data.response&&data.responseText),{path:['responseText'],message:'Supply response (JSON) or responseText (plain text), not both.'}).refine(data=>!data.highlight||data.highlight.path.startsWith('$'),{path:['highlight','path'],message:'Use a JSON path that starts with $, e.g. $.items[0].start'});

export type ToolCallDetailsData=z.infer<typeof toolCallDetailsDataSchema>;

/** Lines shown per pane before a long result is cut on screen. */
export const TOOL_CALL_LINES=60;
