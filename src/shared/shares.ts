import { z } from 'zod';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const sharesReadSchema = z.strictObject({ sessionId: id });
export const shareRevokeSchema = z.strictObject({ sessionId: id, shareId: id });
