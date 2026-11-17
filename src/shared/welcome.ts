import {z} from 'zod';
import {HUMAN_INVITATION} from './philosophy.js';

/** The first-time invitation, in Kanvas's own style. Every field has the founder's default. */
export const welcomeDataSchema=z.object({
 line:z.string().min(1).max(120).default(HUMAN_INVITATION.line),
 examples:z.array(z.string().min(1).max(90)).min(1).max(3).default([...HUMAN_INVITATION.examples]),
}).strict();

export type WelcomeData=z.infer<typeof welcomeDataSchema>;
