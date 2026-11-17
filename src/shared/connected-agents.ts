import {z} from 'zod';

/** Compact overview of the agents connected to an account. */
export const agentsDataSchema=z.object({
 agents:z.array(z.object({
  id:z.string().max(128),name:z.string().max(80),
  connectedNow:z.boolean().default(false),lastSeenAt:z.string().datetime({offset:true}).optional(),
  sessionCount:z.number().int().nonnegative().default(0),lastSession:z.string().max(120).optional(),
  model:z.string().max(120).optional(),revoked:z.boolean().optional(),
 }).strict()).max(50),
}).strict();

export type AgentsData=z.infer<typeof agentsDataSchema>;
