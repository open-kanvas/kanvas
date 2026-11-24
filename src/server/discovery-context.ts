import type {KanvasService} from './domain.js';
import type {AuthPrincipal, Token} from './auth.js';
import type {OverviewContext} from './mcp/overview.js';
/** Read-only projection: never provisions an entry, session, display or alias. */
export async function discoveryOverviewContext(service: KanvasService, principal: AuthPrincipal): Promise<OverviewContext> {
 await service.auth.assertCurrent(principal, 'read', principal.scopedSessionId);
 const token = principal.tokenId ? await service.store.get<Token>('token', principal.tokenId) : undefined;
 const accountWide = !principal.scopedSessionId && !principal.captureOnly && !principal.pairingId && !token?.sessionIds;
 const sessions = (await service.sessions(principal)).filter(session => !session.endedAt);
 const entryIds = new Set((await service.store.list<{sessionId: string}>('account-entry')).map(entry => entry.sessionId));
 const activity = sessions.length ? (await service.store.query<{session_id: string; at: string}>(
 `SELECT session_id,MAX(COALESCE(value::jsonb->>'updatedAt',value::jsonb->>'createdAt',value::jsonb->>'at')) AS at FROM documents WHERE kind IN ('display','interaction','audit-event') AND session_id=ANY($1::text[]) AND value::jsonb->>'archivedAt' IS NULL GROUP BY session_id`, [sessions.map(session => session.id)]
 )).rows : [];
 const dates = new Map(activity.map(row => [row.session_id, row.at]));
 const recentSessions = sessions.filter(session => !entryIds.has(session.id)).map(session => ({id: session.id, name: session.name, updatedAt: [session.updatedAt, dates.get(session.id) ?? ''].sort().at(-1)!})).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).slice(0,10);
 const screens: Record<string, unknown>[] = [];
 if (accountWide) {
 const {devices} = await service.devices.list(principal);
 for (const device of devices) for (const window of device.windows.filter(window => window.connected)) {
 screens.push({deviceId: device.id, deviceName: device.name, windowId: window.id, name: window.name, version: window.version, ...(window.current ? {sessionId: window.current.sessionId, displayId: window.current.displayId} : {}), connected: true});
 }
 }
 for (const session of sessions) {
 const viewers = await service.experience.receiving.viewers(session.id);
 for (const viewer of viewers) {
 if (screens.some(screen => screen.sessionId === session.id && screen.displayId === viewer.displayId)) continue;
 const display = await service.store.get<{name: string}>('display', viewer.displayId);
 screens.push({sessionId: session.id, displayId: viewer.displayId, name: display?.name ?? session.name, connected: true});
 }
 }
 return {screens, recentSessions, savedGuidance: accountWide ? await service.agentGuidance(principal) ?? null : null};
}
