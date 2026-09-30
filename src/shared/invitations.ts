import { z } from 'zod';
const slot=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const invitationSchema=z.object({requestId:slot,label:z.string().trim().min(1).max(120).default('Join me on KANVAS'),groupId:slot.optional(),expiresInHours:z.number().int().min(1).max(720).default(168)}).strict();
