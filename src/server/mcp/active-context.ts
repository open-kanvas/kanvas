import { z } from 'zod';
/** Host-owned, per-call context. Never persisted on an account or connection. */
export const activeContextSchema = z.strictObject({ sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).nullable().optional();
export const ACTIVE_CONTEXT_HELP = 'Optional activeContext:{sessionId} attaches authorized session guidance to this call only. Explicit operation sessionId/groupId takes precedence. Switch by supplying another ID; clear by null or omission. Context never fills operation arguments, grants access, or selects a browser window.';
export function guidanceContext(name: string, raw: unknown): unknown {
 const outer = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
 const args = name === 'kanvas_call' && outer.arguments && typeof outer.arguments === 'object' && !Array.isArray(outer.arguments) ? outer.arguments as Record<string, unknown> : {};
 // Even invalid explicit targets suppress fallback: never leak the other context.
 if (Object.hasOwn(args, 'sessionId') || Object.hasOwn(args, 'groupId')) return args;
 const context = activeContextSchema.safeParse(outer.activeContext);
 return context.success && context.data ? { sessionId: context.data.sessionId } : undefined;
}
