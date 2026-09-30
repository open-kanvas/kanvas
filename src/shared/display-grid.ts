import { z } from 'zod';

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

/** Live grid of what every display in a session shows right now. The data
 * only selects and arranges displays; content comes from each display's
 * current stored view, never from this payload. */
export const displayGridDataSchema = z.object({
  displayIds: z.array(identifier).min(1).max(16).optional().describe('Only these displays, in session order (default: every other display in the session, up to 16).'),
  columns: z.number().int().min(1).max(6).optional().describe('Grid columns (default chosen from the number of displays).'),
  showNames: z.boolean().optional().describe('Show each display name, online status and current view label (default true).'),
  includeSelf: z.boolean().optional().describe('Also include the display that shows this grid (default false).'),
}).strict();
export type DisplayGridData = z.infer<typeof displayGridDataSchema>;
