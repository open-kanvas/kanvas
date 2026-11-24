import {asyncFilter,asyncMap} from './async-collections.js';
import type {Express,Request} from 'express';
import {z} from 'zod';
import type {AuthPrincipal} from './auth.js';
import {hash} from './auth.js';
import type {KanvasService} from './domain.js';
import {AppError,now} from './store.js';
import {topologyQuerySchema,type SessionTopology,type TopologyConnection} from '../shared/accounts.js';
import {topologyDataSchema} from '../shared/connection-views.js';
import {templateNames} from '../shared/template-examples.js';
import type {RequestContext} from '../shared/recognition.js';
import type {DisplayRecord,SessionRecord} from '../shared/types.js';
import {displayedLeaf} from './engagement.js';
import {avatarUrl} from './account-images.js';

function deviceType(context:RequestContext,name:string,width?:number):TopologyConnection['deviceType']{
  if(/\btv\b|television|smart.?tv|large screen/i.test(`${context.device} ${name}`))return 'tv';
  if(/tablet|ipad/i.test(context.device))return 'tablet';
  if(/phone|android/i.test(context.device))return 'phone';
  if(/laptop|macbook|notebook/i.test(name))return 'laptop';
  if(/computer|mac|linux|windows/i.test(context.device))return width&&width<1500?'laptop':'desktop';
  return width&&width<600?'phone':'unknown';
}
export class Topology {
    constructor(readonly service: KanvasService) { }
    private key(sessionId: string, connectionId: string) { return hash(`${sessionId}:${connectionId}`); }
    async connected(p: AuthPrincipal, input: {
        id: string;
        sessionId: string;
        displayId: string;
        joinedAt: string;
        name: string;
        context: RequestContext;
    }, fresh = false) {
        return this.service.store.atomic(async () => {
            const d = (await this.service.devices.forBrowser(p)), guest = Boolean(p.pairingId), key = this.key(input.sessionId, input.id), old = (await this.service.store.get<{
                connection: TopologyConnection;
            }>('connection-history', key))?.connection;
            const connection: TopologyConnection = { id: input.id, sessionId: input.sessionId, displayId: input.displayId, personId: p.participantId ?? p.userId, ...(!guest ? { userId: p.userId } : {}), guest, name: input.name, deviceId: d?.id ?? `browser-${hash(`${input.sessionId}:${p.browserId}`).slice(0, 24)}`, deviceName: d?.name ?? input.context.device, deviceLocation: d?.location, deviceRole: d?.role, deviceType: deviceType(input.context, d?.name ?? '', old?.width), browser: input.context.browser, joinedAt: input.joinedAt, lastSeenAt: now(), connected: true, location: input.context.location, width: old?.width, height: old?.height };
            (await this.service.store.put('connection-history', { id: key, sessionId: input.sessionId, connection }));
            if (fresh || !old?.connected || old.displayId !== input.displayId)
                (await this.service.accounts.audit('viewer.joined', { actorId: guest ? undefined : p.userId, subjectId: connection.personId, sessionId: input.sessionId, displayId: input.displayId, details: { guest, device: connection.deviceType, browser: connection.browser, ...(connection.location ? { country: connection.location.country } : {}) } }));
            const records = (await this.service.store.list<{
                id: string;
                connection: TopologyConnection;
            }>('connection-history', input.sessionId)).sort((a, b) => b.connection.lastSeenAt.localeCompare(a.connection.lastSeenAt));
        });
    }
    async observed(sessionId: string, connectionId: string, width: number, height: number) {
        return this.service.store.atomic(async () => {
            const row = (await this.service.store.get<{
                id: string;
                sessionId: string;
                connection: TopologyConnection;
            }>('connection-history', this.key(sessionId, connectionId)));
            if (row) {
                row.connection.width = width;
                row.connection.height = height;
                if (['desktop', 'laptop'].includes(row.connection.deviceType) && !/laptop|macbook|notebook/i.test(row.connection.deviceName))
                    row.connection.deviceType = width < 1500 ? 'laptop' : 'desktop';
                row.connection.lastSeenAt = now();
                (await this.service.store.put('connection-history', row));
            }
        });
    }
    async disconnected(sessionId: string, connectionId: string) {
        return this.service.store.atomic(async () => {
            const row = (await this.service.store.get<{
                id: string;
                sessionId: string;
                connection: TopologyConnection;
            }>('connection-history', this.key(sessionId, connectionId)));
            if (!row?.connection.connected)
                return;
            row.connection.connected = false;
            row.connection.lastSeenAt = now();
            (await this.service.store.put('connection-history', row));
            (await this.service.accounts.audit('viewer.left', { actorId: row.connection.userId, subjectId: row.connection.personId, sessionId, displayId: row.connection.displayId, details: { guest: row.connection.guest } }));
        });
    }
    async snapshot(p: AuthPrincipal, raw: unknown, displayId?: string): Promise<Awaited<SessionTopology>> {
        const a = topologyQuerySchema.parse(raw), session = (await this.service.access(p, a.sessionId));
        let locationVisible = a.includeLocation && session.ownerId === p.userId;
        if (displayId) {
            const d = (await this.service.display(p, a.sessionId, displayId)), leaf = displayedLeaf(d.view);
            if (leaf?.template !== 'session-topology')
                throw new AppError('INVALID_VIEW', 'This display is not showing session topology.', 409);
            const config = topologyDataSchema.parse(leaf.data);
            a.includeOffline = config.includeOffline;
            a.expectedCountries = config.expectedCountries;
            locationVisible = config.includeLocation;
        }
        else
            (await this.service.fullAccount(p));
        return (await this.project(a, session, locationVisible, p.userId));
    }
    async acrossSessions(p: AuthPrincipal, raw: unknown) {
        const a = topologyQuerySchema.extend({ sessionId: topologyQuerySchema.shape.sessionId.optional() }).parse(raw);
        if (a.sessionId)
            return this.snapshot(p, a);
        await this.service.fullAccount(p);
        const sessions = await this.service.sessions(p), results = [];
        for (const session of sessions.filter(s => !s.endedAt))
            results.push(await this.snapshot(p, { ...a, sessionId: session.id, includeOffline: false }));
        const devices = await this.service.devices.list(p).catch(error => { if (error instanceof AppError && error.code === 'FORBIDDEN')
            return { devices: [] }; throw error; });
        const availableWindows = devices.devices.flatMap(d => d.windows.filter(w => a.includeOffline || w.connected).map(w => ({ deviceId: d.id, deviceName: d.name, windowId: w.id, name: w.name, connected: w.connected, version: w.version, current: w.current ?? null })));
        return { sessions: results.filter(s => s.counts.windows > 0), availableWindows, windowTargeting: "Signed-in root/console windows also receive commands. Use kanvas_call with operationId:\"kanvas.account.begin\" and arguments:{\u2026} or kanvas_call with operationId:\"kanvas.window.present\" and arguments:{\u2026} with deviceId/windowId/version; no session needs to be joined first.", note: "Live displays across all sessions this connection may access. Use kanvas_call with operationId:\"kanvas.connection.redirect\" and arguments:{\u2026} with the source sessionId and connectionId to move your own existing window to a target session/display; do not ask the user to open another URL." };
    }
    /** Anonymous access projects only this explicitly published topology view. */
    async publicDisplay(sessionId: string, displayId: string): Promise<Awaited<SessionTopology>> {
        const session = (await this.service.store.get<SessionRecord>('session', sessionId)), d = (await this.service.store.get<DisplayRecord>('display', displayId)), leaf = displayedLeaf(d?.view ?? null);
        if (!session?.publicAccess?.enabled || session.endedAt || d?.sessionId !== sessionId || leaf?.template !== 'session-topology')
            throw new AppError('NOT_FOUND', 'This public connection view is unavailable.', 404);
        const config = topologyDataSchema.parse(leaf.data);
        return (await this.project(topologyQuerySchema.parse({ sessionId, includeOffline: config.includeOffline, expectedCountries: config.expectedCountries }), session, config.includeLocation));
    }
    private async project(a: z.infer<typeof topologyQuerySchema>, session: SessionRecord, locationVisible: boolean, viewerId?: string): Promise<Awaited<SessionTopology>> {
        const live = new Map((await this.service.experience.receiving.viewers(a.sessionId)).map(v => [v.id, v]));
        const cutoff = Date.now() - 30 * 86400000;
        const connections = (await asyncMap((await this.service.store.list<{
            connection: TopologyConnection;
        }>('connection-history', a.sessionId)).map(r => r.connection).filter(c => Date.parse(c.lastSeenAt) > cutoff), async (c) => {
            const v = live.get(c.id), user = c.userId ? (await this.service.auth.user(c.userId)) : undefined, window = (await this.service.devices.windows.forConnection(c.userId, c.id));
            const registered = viewerId && c.userId === viewerId ? await this.service.store.get<import('./entry-devices.js').Device>('registered-device', window?.deviceId ?? c.deviceId) : undefined;
            const connection: TopologyConnection = { ...c, deviceLocation: registered?.location, deviceRole: registered?.role, ...(window ? { windowId: window.id, windowName: window.name, deviceId: window.deviceId, deviceName: window.deviceName } : {}), name: user?.displayName ?? c.name, connected: Boolean(v && v.displayId === c.displayId), lastSeenAt: v?.lastActiveAt ?? c.lastSeenAt, width: c.width ?? v?.width, height: c.height ?? v?.height, avatarUrl: viewerId && c.userId ? (await avatarUrl(this.service.store, c.userId)) : undefined, ...(viewerId && c.userId ? { groups: (await asyncFilter((await this.service.accounts.groupsFor(c.userId)), async (g) => (await this.service.accounts.member(g.id, viewerId)) || (await this.service.store.get<{
                        organizationId?: string;
                        teamId?: string;
                    }>('session-context', a.sessionId))?.organizationId === g.id || (await this.service.store.get<{
                        teamId?: string;
                    }>('session-context', a.sessionId))?.teamId === g.id)).map(g => ({ id: g.id, kind: g.kind, name: g.name })) } : {}) };
            if (!locationVisible)
                delete connection.location;
            if (!viewerId) {
                // Stable within this public session; never reveal account/device/window
                // identifiers that address private management APIs or profile images.
                const opaque = (value: string) => hash(`${session.id}:public:${value}`).slice(0, 32);
                connection.id = opaque(connection.id);
                connection.personId = opaque(connection.personId);
                connection.deviceId = opaque(connection.deviceId);
                delete connection.deviceLocation;
                delete connection.deviceRole;
                delete connection.userId;
                delete connection.windowId;
                delete connection.avatarUrl;
                delete connection.groups;
            }
            return connection;
        })).filter(c => a.includeOffline || c.connected).sort((x, y) => Number(y.connected) - Number(x.connected) || y.lastSeenAt.localeCompare(x.lastSeenAt));
        const countries = new Map<string, number>();
        for (const c of connections.filter(c => c.connected && c.location))
            countries.set(c.location!.country, (countries.get(c.location!.country) ?? 0) + 1);
        const majority = [...countries].sort((x, y) => y[1] - x[1]), majorityCountry = majority.length && majority[0][1] > (majority[1]?.[1] ?? 0) ? majority[0][0] : undefined;
        for (const c of connections)
            if (c.location) {
                if (a.expectedCountries.length && !a.expectedCountries.includes(c.location.country))
                    c.outlier = 'outside-expected-countries';
                else if (!a.expectedCountries.length && majorityCountry && c.location.country !== majorityCountry)
                    c.outlier = 'different-from-majority';
            }
        // Each display node names what it currently shows (title, else template label).
        const displays = (await this.service.store.list<DisplayRecord>('display', a.sessionId)).map(d => { const leaf = displayedLeaf(d.view), title = typeof leaf?.title === 'string' ? leaf.title.trim().slice(0, 160) : ''; return { id: d.id, name: d.name, ...(leaf ? { view: { template: leaf.template, ...(title ? { title } : {}), label: title || (templateNames as Record<string, string>)[leaf.template] || leaf.template } } : {}), connections: connections.filter(c => c.displayId === d.id) }; });
        const persons = new Map<string, SessionTopology['people'][number]>();
        for (const c of connections) {
            let person = persons.get(c.personId);
            if (!person) {
                person = { id: c.personId, name: c.name, guest: c.guest, avatarUrl: c.avatarUrl, devices: [] };
                persons.set(c.personId, person);
            }
            let device = person.devices.find(d => d.id === c.deviceId);
            if (!device) {
                device = { id: c.deviceId, name: c.deviceName, type: c.deviceType, connections: [] };
                person.devices.push(device);
            }
            device.connections.push(c);
        }
        const connected = connections.filter(c => c.connected);
        return { sessionId: a.sessionId, name: session.name, at: now(), displays, people: [...persons.values()], counts: { people: new Set(connected.map(c => c.personId)).size, devices: new Set(connected.map(c => c.deviceId)).size, windows: connected.length, offline: connections.length - connected.length, located: connected.filter(c => c.location?.lat !== undefined).length, unknownLocation: connected.filter(c => c.location?.lat === undefined).length, outliers: connected.filter(c => c.outlier).length }, locationVisible, note: 'Live windows are authenticated receiving connections; the offline projection includes connection records seen within the last 30 days. This query window is not a deletion guarantee; no fixed window-count storage cap is applied. Device form factor is an estimate. IP location is approximate and may identify a VPN or network exit; outliers are review hints, never a threat verdict. No raw IP addresses or GPS are collected by this view.' };
    }
}
export function mountTopology(app:Express,topology:Topology,browser:(req:Request)=>Promise<Awaited<AuthPrincipal>>){
  app.get('/api/sessions/:id/topology',async (req,res)=>{
    const q=z.object({displayId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),includeOffline:z.enum(['true','false']).optional(),includeLocation:z.enum(['true','false']).optional()}).strict().parse(req.query);
    res.json({data:(await topology.snapshot((await browser(req)),{sessionId:req.params.id,includeOffline:q.includeOffline!=='false',includeLocation:q.includeLocation==='true'},q.displayId))});
  });
}
