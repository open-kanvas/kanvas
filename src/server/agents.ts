import {z} from 'zod';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal,Token} from './auth.js';
import {hash} from './auth.js';
import {AppError,now} from './store.js';
import type {Definition} from './mcp/canonical.js';
import type {ToolInvocation} from './mcp/types.js';
import type {AgentConnection} from '../shared/agent-context.js';
import type {SessionRecord} from '../shared/types.js';

/** Connected agents, per account. An agent is one client connection (its
 * stable token), recognised from what the connection itself shows: the MCP
 * client name and version from the handshake and the HTTP User-Agent. What an
 * agent says about itself (model, harness) is enrichment only and never the
 * basis for identity. Everything is scoped to the owning account. */
export const AGENT_ACTIVE_MS=5*60_000;
const MAX_SESSIONS=200,MAX_LOG=40,TOUCH_MS=30_000;
export interface AgentSession {sessionId:string;firstAt:string;lastAt:string;created?:boolean}
export interface AgentLogEntry {at:string;kind:string;sessionId?:string}
export interface AgentRecord {
 id:string;userId:string;tokenId?:string;type:string;name:string;clientName?:string;clientVersion?:string;userAgent?:string;
 firstSeenAt:string;lastSeenAt:string;sessions:AgentSession[];sessionsTotal:number;lastSessionId?:string;model?:string;log:AgentLogEntry[];revokedAt?:string;
}
/** Deterministic product label from connection-level data only. */
export function agentType(clientName?:string,userAgent?:string):string{
 const name=(clientName??'').toLowerCase(),ua=(userAgent??'').toLowerCase();
 if(name.includes('claude-code')||ua.includes('claude-code')||ua.includes('claude-cli'))return 'Claude Code';
 if(name.includes('codex'))return 'Codex';
 if(name.includes('claudeai')||name.includes('anthropic')||ua.startsWith('claude-user'))return 'Claude.ai';
 if(name.includes('openai-mcp')||ua.includes('openai-mcp'))return 'ChatGPT';
 if(name.includes('connectors-manager')||ua.includes('grok'))return 'Grok';
 if(name.includes('gemini'))return 'Gemini';
 if(name.includes('cursor'))return 'Cursor';
 return 'Custom agent';
}
/** Activity worth a line in an agent's log. Names only, no content. */
/** Activity worth a line in an agent's log. Names only, no content. */
const NOTABLE: Record<string, string> = { "kanvas.submit": 'published a view', "kanvas.session.create": 'created a session', "kanvas.login.decide": 'decided a device sign-in', "kanvas.pairing.decide": 'decided a browser request', "kanvas.screen.decide": 'decided a screen enrollment', "kanvas.feedback.submit": 'filed feedback', "kanvas.error.report": 'filed an error report', "kanvas.member.add": 'added a member', "kanvas.share.create": 'created a share link', "kanvas.session.end": 'ended a session', "kanvas.agents.revoke": 'revoked an agent', "kanvas.monitor.stream.create": 'created a monitor stream', "kanvas.device.lock": 'locked a device', "kanvas.device.unlock": 'unlocked a device' };
const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const agentsReadSchema=z.strictObject({agentId:identifier.optional(),limit:z.number().int().min(1).max(100).default(50)});
export const agentsRevokeSchema=z.strictObject({agentId:identifier,confirm:z.literal(true)});
export const agentTools: Definition[] = [
    {
        name: "kanvas.agents.read", schema: agentsReadSchema, readOnly: true, description: 'List this account\'s agents, recognised from the MCP client name and User-Agent: active now, last seen, sessions. agentId returns one agent\'s sessions and log.',
        domain: "connections",
        requiredScope: "read",
        discovery: {"group":"access","hint":"Which agents are connected to this account, active now, last seen and on how many sessions; add agentId for one agent in full.","examples":[{}]},
        searchAliases: ["kanvas.agents.read"]
    },
    {
        name: "kanvas.agents.revoke", schema: agentsRevokeSchema, description: 'Revoke one agent\'s access after the owner confirms it; not the connection making this call.',
        domain: "connections",
        requiredScope: "publish",
        discovery: {"group":"access","hint":"Remove one agent's access after the owner confirms it is not recognised.","examples":[{"agentId":"agent-id","confirm":true}]},
        searchAliases: ["kanvas.agents.revoke"]
    },
];
export class Agents {
    private touched = new Map<string, number>();
    constructor(private service: KanvasService) { }
    private get store() { return this.service.store; }
    private key(p: {
        userId: string;
        agentId?: string;
        tokenId?: string;
    }) { const connection = p.agentId ?? p.tokenId; return connection ? hash(`agent:${p.userId}:${connection}`).slice(0, 32) : undefined; }
    /** Called for every MCP call. Cheap: at most one write per agent per 30 s unless something notable happened. */
    async observe(p: AuthPrincipal, call: ToolInvocation, canonical?: string) {
        const key = this.key(p);
        if (!key)
            return;
        const stamp = Date.now(), notable = call.status === 'completed' && canonical ? NOTABLE[canonical] : undefined, last = this.touched.get(key);
        const context = call.clientContext as {
            clientName?: string;
            clientVersion?: string;
            userAgent?: string;
        } | undefined;
        if (!notable && last && stamp - last < TOUCH_MS && !call.sessionId)
            return;
        try {
            await this.store.atomic(async () => {
                const saved = await this.store.get<AgentRecord>('account-agent', key), at = new Date(stamp).toISOString();
                if (saved && !notable && last && stamp - last < TOUCH_MS && (!call.sessionId || saved.lastSessionId === call.sessionId))
                    return;
                const clientName = context?.clientName?.slice(0, 240) ?? saved?.clientName, userAgent = context?.userAgent?.slice(0, 500) ?? saved?.userAgent, type = agentType(clientName, userAgent);
                const record: AgentRecord = saved ? { ...saved } : { id: key, userId: p.userId, tokenId: p.tokenId, type, name: type, firstSeenAt: at, lastSeenAt: at, sessions: [], sessionsTotal: 0, log: [] };
                record.type = type;
                record.name = type === 'Custom agent' && clientName ? clientName.slice(0, 80) : type;
                record.clientName = clientName;
                record.clientVersion = context?.clientVersion?.slice(0, 120) ?? saved?.clientVersion;
                record.userAgent = userAgent;
                record.lastSeenAt = at;
                record.tokenId = p.tokenId ?? record.tokenId;
                let sessionId = call.sessionId;
                // A first publish with no session makes one: the publish result says so, and that connection created it too.
                const made = canonical === "kanvas.session.create" || call.createdSession === true;
                if (sessionId) {
                    try {
                        await this.service.access(p, sessionId);
                    }
                    catch {
                        sessionId = undefined;
                    }
                }
                if (sessionId) {
                    const known = record.sessions.find(s => s.sessionId === sessionId);
                    if (known)
                        known.lastAt = at;
                    else {
                        record.sessions.push({ sessionId, firstAt: at, lastAt: at, ...(made ? { created: true } : {}) });
                        record.sessionsTotal++;
                    }
                    if (known && made)
                        known.created = true;
                    record.sessions = record.sessions.sort((a, b) => a.lastAt.localeCompare(b.lastAt)).slice(-MAX_SESSIONS);
                    record.lastSessionId = sessionId;
                    const reported = (await this.store.list<AgentConnection>('agent-connection', sessionId)).filter(c => c.userId === p.userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.selfReported.model;
                    if (reported)
                        record.model = reported.slice(0, 120);
                }
                if (notable)
                    record.log = [...record.log, { at, kind: notable, ...(sessionId ? { sessionId } : {}) }].slice(-MAX_LOG);
                await this.store.put('account-agent', record);
            });
            this.touched.set(key, stamp);
            if (this.touched.size > 5000)
                this.touched.delete(this.touched.keys().next().value!);
        }
        catch { /* Bookkeeping never fails the call it describes. */ }
    }
    private async usable(record: AgentRecord) {
        if (record.revokedAt || !record.tokenId)
            return !record.revokedAt;
        const token = await this.store.get<Token>('token', record.tokenId);
        return Boolean(token && !token.revoked && token.expiresAt > Date.now());
    }
    private async sessionNames(p: AuthPrincipal, ids: readonly string[]) {
        const names = new Map<string, string>();
        for (const sessionId of new Set(ids)) {
            try {
                names.set(sessionId, (await this.service.access(p, sessionId) as SessionRecord).name);
            }
            catch { /* Ended or no longer accessible: listed by id only. */ }
        }
        return names;
    }
    async read(p: AuthPrincipal, raw: unknown) {
        const a = agentsReadSchema.parse(raw);
        await this.service.fullAccount(p);
        await this.service.accounts.account(p);
        const own = (await this.store.list<AgentRecord>('account-agent')).filter(record => record.userId === p.userId).sort((x, y) => y.lastSeenAt.localeCompare(x.lastSeenAt));
        const current = this.key(p);
        if (a.agentId) {
            const record = own.find(x => x.id === a.agentId);
            if (!record)
                throw new AppError('NOT_FOUND', 'This agent is not connected to your account.', 404);
            const names = await this.sessionNames(p, record.sessions.map(s => s.sessionId)), access = await this.usable(record);
            return { agent: { agentId: record.id, type: record.type, name: record.name, clientName: record.clientName, clientVersion: record.clientVersion, userAgent: record.userAgent, model: record.model, connectedNow: access && Date.now() - Date.parse(record.lastSeenAt) < AGENT_ACTIVE_MS, access: access ? 'active' : 'revoked-or-expired', thisConnection: record.id === current, firstSeenAt: record.firstSeenAt, lastSeenAt: record.lastSeenAt, sessionCount: record.sessionsTotal,
                    sessions: [...record.sessions].reverse().map(s => ({ ...s, ...(names.has(s.sessionId) ? { name: names.get(s.sessionId) } : { available: false }) })), log: [...record.log].reverse() },
                note: 'Identity comes from the connection (MCP client name, version, User-Agent), not from what the agent says about itself. model is self-reported and unverified.' };
        }
        const names = await this.sessionNames(p, own.flatMap(r => r.lastSessionId ? [r.lastSessionId] : []));
        const agents = [];
        for (const record of own.slice(0, a.limit)) {
            const access = await this.usable(record);
            agents.push({ agentId: record.id, type: record.type, name: record.name, clientVersion: record.clientVersion, connectedNow: access && Date.now() - Date.parse(record.lastSeenAt) < AGENT_ACTIVE_MS, access: access ? 'active' : 'revoked-or-expired', ...(record.id === current ? { thisConnection: true } : {}), lastSeenAt: record.lastSeenAt, firstSeenAt: record.firstSeenAt, sessionCount: record.sessionsTotal, ...(record.lastSessionId ? { lastSession: names.get(record.lastSessionId) ?? '(ended session)' } : {}), ...(record.model ? { model: record.model } : {}) });
        }
        return { agents, total: own.length, connectedNowMeans: `Used within the last ${AGENT_ACTIVE_MS / 60000} minutes with access that is still valid. MCP is request and response, so there is no permanently open connection to observe.`,
            view: { version: 1, template: 'agents', data: { agents: agents.map(({ agentId, name, connectedNow, lastSeenAt, sessionCount, lastSession, model, access }) => ({ id: agentId, name, connectedNow, lastSeenAt, sessionCount, ...(lastSession ? { lastSession } : {}), ...(model ? { model } : {}), ...(access !== 'active' ? { revoked: true } : {}) })) } },
            next: 'Publish view to show the overview. Read one agentId for its full session list and log. kanvas.agents.revoke removes an agent the owner does not recognise.' };
    }
    async revoke(p: AuthPrincipal, raw: unknown) {
        const a = agentsRevokeSchema.parse(raw);
        await this.service.fullAccount(p, 'publish');
        await this.service.accounts.account(p, true);
        return this.store.atomic(async () => {
            const record = await this.store.get<AgentRecord>('account-agent', a.agentId);
            if (!record || record.userId !== p.userId)
                throw new AppError('NOT_FOUND', 'This agent is not connected to your account.', 404);
            if (record.id === this.key(p))
                throw new AppError('INVALID_ARGUMENT', 'This is the connection making this call. Disconnect it in that client, or revoke it from another agent or the account page.', 409);
            if (record.tokenId) {
                const token = await this.store.get<Token>('token', record.tokenId);
                if (token && token.userId === p.userId && !token.revoked)
                    await this.service.auth.revokeToken(p.userId, record.tokenId);
            }
            record.revokedAt = now();
            record.log = [...record.log, { at: record.revokedAt, kind: 'access revoked' }].slice(-MAX_LOG);
            await this.store.put('account-agent', record);
            return { agentId: record.id, name: record.name, revoked: true, revokedAt: record.revokedAt, note: 'That client must sign in and be approved again to reconnect. Sessions and their content are unchanged.' };
        });
    }
    /** Which agent created each session, for session overviews. Account-scoped:
     * only this account's own agent records are read, so a shared session shows
     * a creator only to the account whose agent made it. */
    async creators(p: AuthPrincipal): Promise<Map<string, {
        agentId: string;
        name: string;
    }>> {
        const out = new Map<string, {
            agentId: string;
            name: string;
            at: string;
        }>();
        for (const record of (await this.store.list<AgentRecord>('account-agent')).filter(r => r.userId === p.userId))
            for (const s of record.sessions) {
                const prior = out.get(s.sessionId);
                if (s.created && (!prior || s.firstAt < prior.at))
                    out.set(s.sessionId, { agentId: record.id, name: record.name, at: s.firstAt });
            }
        return out;
    }
}
