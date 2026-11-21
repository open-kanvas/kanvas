import {rawEvent} from './raw-events.js';
import {navigationActionSchema,navigate,initialNavigation} from '../shared/navigation.js';
import {asyncEvery,asyncFilter,asyncMap,asyncSome} from './async-collections.js';
import {EventEmitter} from 'node:events';
import {z} from 'zod';
import {hash,type AuthPrincipal} from './auth.js';
import type {EntryDevices,Device,DeviceCommand} from './entry-devices.js';
import {AppError,id,now} from './store.js';

const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const windowPresentSchema=z.object({deviceId:identifier,windowId:identifier,sessionId:identifier,displayId:identifier,expectedVersion:z.number().int().nonnegative().optional(),requestId:identifier}).strict();
export const windowOverviewSchema=windowPresentSchema.omit({sessionId:true,displayId:true});
type OverviewCommand=Omit<DeviceCommand,'sessionId'|'displayId'> & {destination:'overview';overviewUrl:string;sessionId?:never;displayId?:never};
export const windowViewportSchema=windowOverviewSchema.extend({navigation:z.union([navigationActionSchema.options[1],navigationActionSchema.options[3]])});
type ViewportCommand=Omit<OverviewCommand,'destination'> & {destination:'viewport';viewport:{scale:number;x?:number;y?:number;deltaX?:number;deltaY?:number}};
type WindowCommand=DeviceCommand|OverviewCommand|ViewportCommand;
export const connectionRedirectSchema = z.object({ connectionId: identifier.describe("Your connection: kanvas_call with operationId:\"kanvas.topology.read\" and arguments:{\u2026} connections[].id."), sessionId: identifier, displayId: identifier, requestId: identifier }).strict();
interface RegisteredWindow {
  clientVersion?:string;id:string;deviceId:string;ownerId:string;browserId:string;tabId:string;name:string;version:number;
  atOverview?:boolean;createdAt:string;lastSeenAt:string;sessionId?:string;displayId?:string;renderedRevision?:number;command?:WindowCommand;
}
interface LiveWindow {principal:AuthPrincipal;count:number}

/** A tab address selects a receiver, never grants access. Each tab has its own
 * command and paint receipt, even when all tabs share the same auth cookie. */
export class WindowReceivers {
    private live = new Map<string, LiveWindow>();
    private events = new EventEmitter();
    constructor(readonly devices: EntryDevices) { this.events.setMaxListeners(1024); }
    private get service() { return this.devices.service; }
    private async rows(deviceId: string) { return (await this.service.store.list<RegisteredWindow>('registered-window')).filter(w => w.deviceId === deviceId); }
    private async window(p: AuthPrincipal, deviceId: string, windowId: string, write = false, receive = false) {
        const d = receive ? (await this.devices.receiverDevice(p, deviceId)) : (await this.devices.ownedDevice(p, deviceId, write));
        const w = (await this.service.store.get<RegisteredWindow>('registered-window', windowId));
        if (!w || w.deviceId !== d.id || w.ownerId !== p.userId || w.browserId !== d.browserId)
            throw new AppError('NOT_FOUND', 'This browser window is unavailable.', 404);
        return w;
    }
    private async online(w: RegisteredWindow) {
        const state = this.live.get(w.id);
        if (!state?.count || state.principal.browserId !== w.browserId)
            return false;
        try {
            (await this.devices.receiverDevice(state.principal, w.deviceId));
            return true;
        }
        catch {
            return false;
        }
    }
    private async scale(w: RegisteredWindow) { return (await this.service.store.get<{
        scale: number;
    }>('window-zoom', hash(`${w.browserId}:${w.tabId}`).slice(0, 32)))?.scale ?? 1; }
    private async public(w: RegisteredWindow) {
        const command = w.command ? { ...w.command, status: w.command.status === 'pending' && w.command.expiresAt <= Date.now() ? 'expired' : w.command.status } : undefined;
        return { id: w.id, name: w.name, clientVersion: w.clientVersion, version: w.version, connected: (await this.online(w)), lastSeenAt: w.lastSeenAt, overviewScale: await this.scale(w), location: w.atOverview ? 'overview' : w.sessionId ? 'display' : 'unknown',
            ...(w.sessionId && w.displayId ? { current: { sessionId: w.sessionId, displayId: w.displayId, viewerUrl: `${this.service.publicUrl}/view/${w.sessionId}/${w.displayId}` }, renderedRevision: w.renderedRevision } : {}), command };
    }
    async listForDevice(d: Device) { return (await asyncMap((await this.rows(d.id)).filter(w => w.browserId === d.browserId), async (w) => (await this.public(w)))); }
    async hasOnline(d: Device) { return (await asyncSome((await this.rows(d.id)), async (w) => w.browserId === d.browserId && (await this.online(w)))); }
    async register(p: AuthPrincipal, deviceId: string, tabId: string, clientVersion?: string) {
        return this.service.store.atomic(async () => {
            identifier.parse(tabId);
            const d = (await this.devices.receiverDevice(p, deviceId)), key = hash(`${d.id}:${tabId}`), old = (await this.service.store.get<RegisteredWindow>('registered-window', key));
            if (old) {
                if (old.browserId !== p.browserId) {
                    old.browserId = p.browserId!;
                    old.command = undefined;
                    old.version++;
                }
                old.clientVersion = clientVersion;
                old.lastSeenAt = now();
                (await this.service.store.put('registered-window', old));
                return (await this.public(old));
            }
            for (const stale of (await this.rows(d.id)))
                if (!(await this.online(stale)) && Date.parse(stale.lastSeenAt) < Date.now() - 30 * 86400000)
                    (await this.service.store.delete('registered-window', stale.id));
            const rows = (await this.rows(d.id));
            if (rows.length >= 128)
                throw new AppError('LIMIT_REACHED', 'This device has reached its 128-window retention limit.', 429);
            const stamp = now(), w: RegisteredWindow = { clientVersion, id: key, deviceId: d.id, ownerId: p.userId, browserId: p.browserId!, tabId, name: `${d.context.browser} window ${rows.length + 1}`, version: 0, createdAt: stamp, lastSeenAt: stamp };
            (await this.service.store.put('registered-window', w));
            return (await this.public(w));
        });
    }
    async forTab(p: AuthPrincipal, tabId?: string) {
        if (!p.browserId || !tabId || p.scopedSessionId)
            return;
        const w = (await this.service.store.list<RegisteredWindow>('registered-window')).find(w => w.ownerId === p.userId && w.browserId === p.browserId && w.tabId === tabId);
        if (!w)
            return;
        try {
            (await this.devices.receiverDevice(p, w.deviceId));
            return { id: w.id, name: w.name, deviceId: w.deviceId };
        }
        catch {
            return;
        }
    }
    async forConnection(userId: string | undefined, connectionId: string) {
        if (!userId)
            return;
        const w = (await this.service.store.list<RegisteredWindow>('registered-window')).find(w => w.ownerId === userId && hash(`${w.browserId}:${w.tabId}`).slice(0, 32) === connectionId);
        if (!w)
            return;
        const d = (await this.service.store.get<Device>('registered-device', w.deviceId));
        return d?.browserId === w.browserId ? { id: w.id, name: w.name, deviceId: d.id, deviceName: d.name } : undefined;
    }
    async broadcast(p: AuthPrincipal, deviceId: string, command: DeviceCommand) {
        return this.service.store.atomic(async () => {
            (await this.devices.ownedDevice(p, deviceId, true));
            const windows = (await asyncFilter((await this.rows(deviceId)), async (w) => (await this.online(w))));
            for (const w of windows) {
                w.command = { ...command };
                w.version++;
                (await this.service.store.put('registered-window', w));
            }
            return windows.map(w => w.id);
        });
    }
    async changed(deviceId: string) { for (const w of (await this.rows(deviceId)))
        this.events.emit(w.id); }
    async commandComplete(command: DeviceCommand) { return Boolean(command.windowIds?.length) && (await asyncEvery(command.windowIds!, async (windowId) => { const w = (await this.service.store.get<RegisteredWindow>('registered-window', windowId)); return w?.command?.id === command.id && w.command.status === 'applied'; })); }
    async commandSuperseded(command: DeviceCommand) { return Boolean((await asyncSome(command.windowIds ?? [], async (windowId) => (await this.service.store.get<RegisteredWindow>('registered-window', windowId))?.command?.id !== command.id))); }
    async present(p: AuthPrincipal, raw: unknown) {
        return this.service.store.atomic(async () => {
            const a = windowPresentSchema.parse(raw), w = (await this.window(p, a.deviceId, a.windowId, true));
            (await this.service.display(p, a.sessionId, a.displayId));
            const key = hash(`${p.userId}:window:${a.requestId}`), digest = hash(JSON.stringify(a)), prior = (await this.service.store.get<{
                digest: string;
                commandId: string;
            }>('device-request', key));
            if (prior) {
                if (prior.digest !== digest)
                    throw new AppError('REQUEST_ID_CONFLICT', 'This request ID was used for a different window command.', 409);
                return { window: (await this.public(w)), commandId: prior.commandId, superseded: w.command?.id !== prior.commandId };
            }
            this.service.assertRevision(a.expectedVersion, w.version);
            if (!(await this.online(w)))
                throw new AppError('WINDOW_OFFLINE', 'Open this browser window before targeting it.', 409);
            const command: DeviceCommand = { id: id(), sessionId: a.sessionId, displayId: a.displayId, issuedAt: now(), expiresAt: Date.now() + 180000, status: 'pending' };
            w.command = command;
            w.version++;
            (await this.service.store.transaction(async () => { (await this.service.store.put('registered-window', w)); (await this.service.store.put('device-request', { id: key, digest, deviceId: w.deviceId, windowId: w.id, commandId: command.id, userId: p.userId, sessionId: a.sessionId, displayId: a.displayId, operation: 'window.present', status: 'pending' })); }));
            this.events.emit(w.id);
            return { window: (await this.public(w)), commandId: command.id };
        });
    }
    async overview(p: AuthPrincipal, raw: unknown) {
        return this.service.store.atomic(async () => {
            const a = windowOverviewSchema.parse(raw), w = await this.window(p, a.deviceId, a.windowId, true);
            const key = hash(`${p.userId}:window:${a.requestId}`), digest = hash(JSON.stringify({ destination: 'overview', ...a })), prior = await this.service.store.get<{
                digest: string;
                commandId: string;
            }>('device-request', key);
            if (prior) {
                if (prior.digest !== digest)
                    throw new AppError('REQUEST_ID_CONFLICT', 'This request ID was used for a different window command.', 409);
                return { window: await this.public(w), commandId: prior.commandId, superseded: w.command?.id !== prior.commandId };
            }
            this.service.assertRevision(a.expectedVersion, w.version);
            if (!await this.online(w))
                throw new AppError('WINDOW_OFFLINE', 'Open this browser window before targeting it.', 409);
            const command: OverviewCommand = { id: id(), destination: 'overview', overviewUrl: `${this.service.publicUrl}/`, issuedAt: now(), expiresAt: Date.now() + 180000, status: 'pending' };
            w.command = command;
            w.version++;
            await this.service.store.transaction(async () => { await this.service.store.put('registered-window', w); await this.service.store.put('device-request', { id: key, digest, deviceId: w.deviceId, windowId: w.id, commandId: command.id, userId: p.userId, operation: 'window.overview', status: 'pending' }); });
            this.events.emit(w.id);
            return { window: await this.public(w), commandId: command.id, note: 'Pending until this window paints the account overview. No session is created.' };
        });
    }
    async viewport(p: AuthPrincipal, raw: unknown) {
        return this.service.store.atomic(async () => {
            const a = windowViewportSchema.parse(raw), w = await this.window(p, a.deviceId, a.windowId, true);
            const key = hash(`${p.userId}:window:${a.requestId}`), digest = hash(JSON.stringify({ destination: 'viewport', ...a })), prior = await this.service.store.get<{
                digest: string;
                commandId: string;
            }>('device-request', key);
            if (prior) {
                if (prior.digest !== digest)
                    throw new AppError('REQUEST_ID_CONFLICT', 'This request ID was used for a different window command.', 409);
                return { window: await this.public(w), commandId: prior.commandId, superseded: w.command?.id !== prior.commandId };
            }
            this.service.assertRevision(a.expectedVersion, w.version);
            if (!await this.online(w))
                throw new AppError('WINDOW_OFFLINE', 'Open this browser window before targeting it.', 409);
            if (!w.atOverview || w.sessionId || w.command?.status === 'pending' && w.command.expiresAt > Date.now())
                throw new AppError('VIEWPORT_UNAVAILABLE', "Return this window to overview and await its receipt first. For session content use kanvas_call with operationId:\"kanvas.navigation.control\" and arguments:{\u2026} with viewerId.", 409);
            const n = a.navigation;
            if (n.action !== 'zoom' && n.action !== 'scroll')
                throw new AppError('VIEWPORT_UNAVAILABLE', 'Use zoom or scroll.', 409);
            const previousScale = await this.scale(w);
            const scale = n.action === 'zoom' ? navigate({ version: 1, template: 'fact', data: { text: 'Overview' } }, { ...initialNavigation(), scale: previousScale }, n).scale ?? 1 : previousScale;
            const command: ViewportCommand = { id: id(), destination: 'viewport', overviewUrl: `${this.service.publicUrl}/`, viewport: { scale, ...(n.action === 'scroll' ? { x: n.x, y: n.y, deltaX: n.deltaX, deltaY: n.deltaY } : {}) }, issuedAt: now(), expiresAt: Date.now() + 180000, status: 'pending' };
            w.command = command;
            w.version++;
            await this.service.store.transaction(async () => { await this.service.store.put('window-zoom', { id: hash(`${w.browserId}:${w.tabId}`).slice(0, 32), scale, updatedAt: now() }); await this.service.store.put('registered-window', w); await this.service.store.put('device-request', { id: key, digest, deviceId: w.deviceId, windowId: w.id, commandId: command.id, userId: p.userId, operation: 'window.viewport', status: 'pending' }); });
            this.events.emit(w.id);
            return { window: await this.public(w), commandId: command.id, note: 'Pending until the owned overview window applies the viewport and reports paint.' };
        });
    }
    /** connection.redirect: move one of the caller's own live windows, found by
     * its topology connection id, to any display the caller can open, in any session. */
    async redirect(p: AuthPrincipal, raw: unknown) {
        return this.service.store.atomic(async () => {
            const a = connectionRedirectSchema.parse(raw), own = (await this.forConnection(p.userId, a.connectionId));
            if (!own)
                throw new AppError('NOT_FOUND', "This connection is not one of your registered browser windows. Read kanvas_call with operationId:\"kanvas.topology.read\" and arguments:{\u2026} for your own connections (they carry windowId), or use kanvas_call with operationId:\"kanvas.window.present\" and arguments:{\u2026} with kanvas_call with operationId:\"kanvas.devices.read\" and arguments:{\u2026}.", 404);
            const w = (await this.window(p, own.deviceId, own.id, true));
            (await this.service.display(p, a.sessionId, a.displayId));
            const key = hash(`${p.userId}:redirect:${a.requestId}`), digest = hash(JSON.stringify(a)), prior = (await this.service.store.get<{
                digest: string;
                commandId: string;
            }>('device-request', key));
            if (prior) {
                if (prior.digest !== digest)
                    throw new AppError('REQUEST_ID_CONFLICT', 'This request ID was used for a different redirect.', 409);
                return { window: (await this.public(w)), commandId: prior.commandId, superseded: w.command?.id !== prior.commandId };
            }
            if (!(await this.online(w)))
                throw new AppError('WINDOW_OFFLINE', 'This browser window is not open right now. Open it, then retry.', 409);
            const from = w.sessionId && w.displayId ? { sessionId: w.sessionId, displayId: w.displayId } : undefined;
            const command: DeviceCommand = { id: id(), sessionId: a.sessionId, displayId: a.displayId, issuedAt: now(), expiresAt: Date.now() + 180000, status: 'pending' };
            w.command = command;
            w.version++;
            (await this.service.store.transaction(async () => { (await this.service.store.put('registered-window', w)); (await this.service.store.put('device-request', { id: key, digest, deviceId: w.deviceId, windowId: w.id, commandId: command.id, userId: p.userId, sessionId: a.sessionId, displayId: a.displayId, operation: 'connection.redirect', status: 'pending' })); }));
            this.events.emit(w.id);
            return { window: (await this.public(w)), commandId: command.id, ...(from ? { from } : {}), note: "Pending until the window paints the target display; its command status in kanvas_call with operationId:\"kanvas.devices.read\" and arguments:{\u2026} becomes applied." };
        });
    }
    async report(p: AuthPrincipal, deviceId: string, windowId: string, raw: unknown) {
        return this.service.store.atomic(async () => {
            const overview = z.object({ destination: z.enum(['overview', 'viewport']), commandId: identifier.optional() }).strict().safeParse(raw);
            if (overview.success) {
                const w = await this.window(p, deviceId, windowId, false, true), a = overview.data;
                if (a.commandId) {
                    const c = w.command;
                    if (!c || c.id !== a.commandId || !('destination' in c) || c.destination !== a.destination || c.expiresAt <= Date.now())
                        throw new AppError('STALE_COMMAND', 'This window command is no longer current.', 409);
                    if (c.status !== 'applied')
                        await rawEvent(this.service.store, 'window.command', { userId: p.userId, operation: 'window.' + a.destination, status: 'applied', properties: { deviceId, windowId, commandId: c.id } });
                    c.status = 'applied';
                    c.appliedAt = now();
                }
                w.atOverview = true;
                delete w.sessionId;
                delete w.displayId;
                delete w.renderedRevision;
                w.lastSeenAt = now();
                await this.service.store.put('registered-window', w);
                return { recorded: true, windowId: w.id, command: w.command ? { id: w.command.id, status: w.command.status } : undefined };
            }
            const a = z.object({ sessionId: identifier, displayId: identifier, renderedRevision: z.number().int().nonnegative(), commandId: identifier.optional() }).strict().parse(raw);
            const w = (await this.window(p, deviceId, windowId, false, true)), display = (await this.service.display(p, a.sessionId, a.displayId));
            if (display.revision !== a.renderedRevision)
                throw new AppError('STALE_OBSERVATION', 'The display changed before this paint report.', 409);
            if (a.commandId) {
                const c = w.command;
                if (!c || c.id !== a.commandId || c.expiresAt <= Date.now() || c.sessionId !== a.sessionId || c.displayId !== a.displayId)
                    throw new AppError('STALE_COMMAND', 'This window command is no longer current.', 409);
                if (c.status !== 'applied')
                    await rawEvent(this.service.store, 'window.command', { userId: p.userId, sessionId: a.sessionId, displayId: a.displayId, operation: 'window.present', status: 'applied', properties: { deviceId, windowId, commandId: c.id } });
                c.status = 'applied';
                c.appliedAt = now();
                c.renderedRevision = a.renderedRevision;
            }
            w.atOverview = false;
            w.sessionId = a.sessionId;
            w.displayId = a.displayId;
            w.renderedRevision = a.renderedRevision;
            w.lastSeenAt = now();
            (await this.service.store.transaction(async () => { (await this.service.store.put('registered-window', w)); (await this.devices.recordWindowPaint(p, deviceId, a)); }));
            return { recorded: true, windowId: w.id, command: w.command ? { id: w.command.id, status: w.command.status } : undefined };
        });
    }
    async stream(p: AuthPrincipal, deviceId: string, windowId: string, send: (value: unknown) => void) {
        const w = (await this.window(p, deviceId, windowId, false, true));
        let done = false;
        const previous = this.live.get(w.id), state = previous && previous.principal.browserId === p.browserId ? previous : { principal: p, count: 0 };
        state.count++;
        this.live.set(w.id, state);
        const push = async () => this.service.store.atomic(async () => {
            const current = (await this.window(p, deviceId, windowId, false, true));
            current.lastSeenAt = now();
            (await this.service.store.put('registered-window', current));
            let command = current.command;
            if (command?.status !== 'pending' || command.expiresAt <= Date.now())
                command = undefined;
            if (command && !('destination' in command))
                (await this.service.display(p, command.sessionId, command.displayId));
            send({ deviceId, windowId, connected: true, overviewScale: await this.scale(current), command });
        });
        const changed = async () => { try {
            (await push());
        }
        catch {
            send({ unavailable: true });
        } };
        this.events.on(windowId, changed);
        return { push, close: () => { if (done)
                return; done = true; this.events.off(windowId, changed); state.count--; if (!state.count && this.live.get(windowId) === state)
                this.live.delete(windowId); } };
    }
    close() { this.live.clear(); this.events.removeAllListeners(); }
}
