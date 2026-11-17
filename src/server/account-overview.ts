import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import {ACCOUNT_OVERVIEW_PAGE_SIZE} from '../shared/account-overview.js';
import {accountTier} from './usage-limits.js';

/** The most exposed way a session is open to others: public > team > shared > private. One word, no breakdown. */
export type SharingLevel='private'|'shared'|'team'|'public';
export async function sharingLevel(service:KanvasService,session:{id:string;publicAccess?:{enabled:boolean}}):Promise<SharingLevel>{
  if(session.publicAccess?.enabled===true)return 'public';
  if((await service.store.list<{role:string|null}>('session-group-grant',session.id)).some(grant=>grant.role==='viewer'||grant.role==='editor'))return 'team';
  const members=Number((await service.store.query<{n:string}>('SELECT count(*) AS n FROM members WHERE session_id=$1',[session.id])).rows[0]?.n??0);
  if(members>1)return 'shared';
  const now=Date.now(),open=(expiresAt?:string)=>!expiresAt||Date.parse(expiresAt)>now;
  if((await service.store.list<{status:string;expiresAt?:string}>('share',session.id)).some(share=>share.status==='active'&&open(share.expiresAt)))return 'shared';
  if((await service.store.list<{revokedAt?:string;acceptedAt?:string;expiresAt?:string}>('invitation',session.id)).some(invite=>!invite.revokedAt&&!invite.acceptedAt&&open(invite.expiresAt)))return 'shared';
  return 'private';
}

/** No thumbnail executes a renderer, loads media, or fetches remote content.
 * Only bounded scalar projections leave the server; full views stay in storage. */
/** No thumbnail executes a renderer, loads media, or fetches remote content.
 * Only bounded scalar projections leave the server; full views stay in storage. */
export async function accountOverview(service: KanvasService, p: AuthPrincipal, offset = 0) {
    await service.fullAccount(p);
    const entryIds = new Set((await service.store.list<{
        sessionId: string;
    }>('account-entry')).map(e => e.sessionId));
    const accessible = (await service.sessions(p)).filter(s => !s.endedAt && !entryIds.has(s.id));
    const activity = accessible.length ? (await service.store.query<{
        session_id: string;
        at: string;
    }>(`SELECT session_id,MAX(COALESCE(value::jsonb->>'updatedAt',value::jsonb->>'createdAt',value::jsonb->>'at')) AS at FROM documents WHERE kind IN ('display','interaction','audit-event') AND session_id=ANY($1::text[]) AND value::jsonb->>'archivedAt' IS NULL GROUP BY session_id`, [accessible.map(s => s.id)])).rows : [];
    const dates = new Map(activity.map(r => [r.session_id, r.at]));
    const sessions = accessible.map(s => ({ ...s, lastActivityAt: [s.updatedAt, dates.get(s.id) ?? ''].sort().at(-1)! })).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt) || a.id.localeCompare(b.id));
    // Which connected agent created each session: from the connection, not from what an agent says about itself.
    const creators = await service.agents.creators(p);
    const page = [];
    for (const s of sessions.slice(offset, offset + ACCOUNT_OVERVIEW_PAGE_SIZE)) {
        // LIMIT applies before JSON projection; at most eight current display previews per session.
        const rows = (await service.store.query<{
            id: string;
            name: string;
            revision: number;
            template: string | null;
            title: string | null;
            text: string | null;
            cells: (string | null)[][];
            nodes: {
                label: string | null;
                shape: string | null;
            }[];
            total: string;
        }>(`WITH displays AS (SELECT id,value::jsonb AS d,COUNT(*) OVER() AS total FROM documents WHERE kind='display' AND session_id=$1 AND value::jsonb->>'archivedAt' IS NULL ORDER BY value::jsonb->>'updatedAt' DESC,id LIMIT 8), leaves AS (SELECT *,CASE WHEN d->'view'->>'template'='presentation' THEN d->'view'->'data'->'slides'->COALESCE((d->'view'->'data'->>'index')::int,0) ELSE d->'view' END AS v FROM displays) SELECT id,LEFT(d->>'name',100) AS name,(d->>'revision')::int AS revision,total,LEFT(v->>'template',80) AS template,LEFT(v->>'title',160) AS title,LEFT(COALESCE(v->'data'->>'text',v->'data'->>'value',v->'data'->>'question',v->'data'->>'heading',v->'data'->>'content'),240) AS text,jsonb_build_array(jsonb_build_array(LEFT(v->'data'->'columns'->>0,40),LEFT(v->'data'->'columns'->>1,40),LEFT(v->'data'->'columns'->>2,40)),jsonb_build_array(LEFT(COALESCE(v->'data'->'rows'->0->>(v->'data'->'columns'->>0),v->'data'->'rows'->0->>0),40),LEFT(COALESCE(v->'data'->'rows'->0->>(v->'data'->'columns'->>1),v->'data'->'rows'->0->>1),40),LEFT(COALESCE(v->'data'->'rows'->0->>(v->'data'->'columns'->>2),v->'data'->'rows'->0->>2),40)),jsonb_build_array(LEFT(COALESCE(v->'data'->'rows'->1->>(v->'data'->'columns'->>0),v->'data'->'rows'->1->>0),40),LEFT(COALESCE(v->'data'->'rows'->1->>(v->'data'->'columns'->>1),v->'data'->'rows'->1->>1),40),LEFT(COALESCE(v->'data'->'rows'->1->>(v->'data'->'columns'->>2),v->'data'->'rows'->1->>2),40))) AS cells,jsonb_build_array(jsonb_build_object('label',LEFT(v->'data'->'nodes'->0->>'label',60),'shape',LEFT(v->'data'->'nodes'->0->>'shape',12)),jsonb_build_object('label',LEFT(v->'data'->'nodes'->1->>'label',60),'shape',LEFT(v->'data'->'nodes'->1->>'shape',12)),jsonb_build_object('label',LEFT(v->'data'->'nodes'->2->>'label',60),'shape',LEFT(v->'data'->'nodes'->2->>'shape',12))) AS nodes FROM leaves`, [s.id])).rows;
        const viewers = await service.experience.receiving.viewers(s.id), alias = await service.experience.existingAlias(s.id);
        page.push({ ...(alias ? { shortUrl: `${service.publicUrl}/s/${alias.id}` } : {}), id: s.id, name: s.name, sharing: await sharingLevel(service, s), ...(creators.has(s.id) ? { createdBy: creators.get(s.id)!.name } : {}), agentConnections: s.agentConnections, updatedAt: s.updatedAt, lastActivityAt: s.lastActivityAt, role: s.role, workspaceUrl: `${`${service.publicUrl}/console`}?session=${s.id}`, connectedDeviceCount: new Set(viewers.map(v => v.deviceId ?? v.id)).size, displayCount: Number(rows[0]?.total ?? 0), displays: rows.map(d => ({ id: d.id, name: d.name, viewerUrl: `${service.publicUrl}/view/${s.id}/${d.id}`, revision: d.revision, preview: d.template ? { template: d.template, title: d.title, text: d.text, ...(d.template === 'table' ? { cells: d.cells.map(row => row.slice(0, d.cells[0].filter(cell => cell !== null).length || 3)) } : {}), ...(['architecture', 'org-chart', 'flowchart', 'network'].includes(d.template) ? { nodes: d.nodes.filter(n => n.label) } : {}) } : null })) });
    }
    const token = p.tokenId ? await service.store.get<{
        sessionIds?: string[];
    }>('token', p.tokenId) : undefined;
    return { theme: (await service.experience.defaults(p.userId)).config.theme ?? 'system', ...(!token?.sessionIds ? { entry: await service.devices.existing(p) } : {}), canCreate: !p.scopedSessionId && !token?.sessionIds && (!p.scopes || p.scopes.includes('publish')), newSession: { tool: "kanvas.session.create" }, tier: await accountTier(service.store, p.userId), startUrl: `${service.publicUrl}/`, consoleUrl: `${service.publicUrl}/console`, adminUrl: `${service.publicUrl}/console`, sessions: page, total: sessions.length, ...(offset + ACCOUNT_OVERVIEW_PAGE_SIZE < sessions.length ? { nextOffset: offset + ACCOUNT_OVERVIEW_PAGE_SIZE } : {}), selection: 'Recent actual session, display, interaction or audit activity; receiver heartbeats do not reorder sessions. Previews are passive bounded text snapshots. Open a display or ask your agent to present it. No session is created.' };
}
