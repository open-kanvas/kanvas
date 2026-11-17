import {z} from 'zod';

const id = z.string().min(1).max(128);
export const overviewDataSchema = z.object({ layout:z.enum(['grid','list']).default('grid'), scope:z.enum(['session','account']).default('session').describe('Session: retained content thumbnails, oldest first. Account: live recent-session choices for an authenticated account, as used by the Home display; never selects a recent session automatically.'), displayIds: z.array(id).max(20).optional(), order: z.enum(['oldest', 'newest']).default('oldest').describe('Chronological oldest-first by default. Set newest explicitly only when requested.'), showPreviews: z.boolean().default(true), showMetadata: z.boolean().default(true) }).strict();
