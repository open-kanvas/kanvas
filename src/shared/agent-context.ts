import {z} from 'zod';
const hint=z.string().trim().max(240);
export const clientDetailsSchema=z.object({agent:hint.optional(),harness:hint.optional(),model:hint.optional(),effort_or_mode:hint.optional(),interaction_mode:hint.optional(),device:hint.optional(),other:z.string().trim().max(1000).optional()}).strict().describe('Optional, unverified client hints shared visibly with the user. Sharing helps adapt the experience, diagnose issues across clients/models, and recognize session history. Never guess hidden model or device details; omit unknown values.');
export type ClientDetails=z.infer<typeof clientDetailsSchema>;
export interface AgentConnection {id:string;sessionId:string;userId:string;started:boolean;joinedAt:string;updatedAt:string;selfReported:ClientDetails;inferred:{userAgent?:string;clientName?:string;clientVersion?:string};conflicts:string[];verified:false}
