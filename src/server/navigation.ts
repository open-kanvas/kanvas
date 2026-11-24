import {publishAckWaitMs} from './publish-delivery.js';
import {derivedViewLabel} from '../shared/view-label.js';
import {z} from 'zod';
import {readingDefaults} from '../shared/reading.js';
import type {Express,Request} from 'express';
import type {KanvasService} from './domain.js';
import {hash,type AuthPrincipal,type Token} from './auth.js';
import {AppError,id,now,required} from './store.js';
import {initialNavigation,navigate,navigationCapabilities,navigationLeaf,navigationInputSchema,navigationActionSchema,navigationReadSchema,pinSaveSchema,pinRecallSchema,pinRemoveSchema,type NavigationAction,type NavigationSnapshot,type NavigationState} from '../shared/navigation.js';
import type {ViewSpec} from '../shared/types.js';

const publicPage=<T extends {state:NavigationState;viewerIds?:string[]}>(p:T)=>{const {viewerIds:_targets,...position}=p;return {...position,state:{...p.state,pageIndex:p.state.page,page:p.state.page+1}};};
interface Position {action?:NavigationAction['action'];id:string;sessionId:string;displayId:string;revision:number;version:number;state:NavigationState;commandId:string;target?:string;viewerIds?:string[];requestId?:string;updatedAt:string}
interface Receipt {id:string;sessionId:string;digest:string;result:Position;createdAt:string}
interface Ack {id:string;sessionId:string;displayId:string;revision:number;commandId:string;viewerId:string;status:'applied'|'failed';code?:'NAVIGATION_UNSUPPORTED';matches?:number;scroll?:{x:number;y:number;maxX:number;maxY:number};at:string}
interface Viewport {id:string;sessionId:string;displayId:string;viewerId:string;revision:number;version:number;width:number;height:number;maxX:number;maxY:number;at:string}
interface Pin {title?:string;template?:string;id:string;sessionId:string;displayId:string;label:string;revision:number;view:ViewSpec;createdAt:string}
const tab=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const browserInput=z.object({tabId:tab,requestId:tab,expectedRevision:z.number().int().nonnegative(),navigation:navigationActionSchema}).strict();

/** Bounded navigation is not content editing. Each browser acknowledges its own
 * frame; a stored command never claims all screens have painted it. */
export class Navigation {
    constructor(readonly service: KanvasService) { }
    private key(displayId: string, viewerId?: string) { return hash(`${displayId}:${viewerId ?? 'shared'}`); }
    private async position(sessionId: string, displayId: string, viewerId?: string, shared = false) {
        const d = required(await this.service.store.get<{
            revision: number;
            navigationRoot?: number;
            view: ViewSpec | null;
        }>('display', displayId));
        const global = await this.service.store.get<Position>('navigation', this.key(displayId));
        const local = viewerId ? await this.service.store.get<Position>('navigation', this.key(displayId, viewerId)) : undefined;
        const root = d.navigationRoot ?? d.revision;
        const found = local && (!shared || local.action === 'zoom') && local.revision >= root && (!global || global.revision < root || local.version > global.version) ? local : global;
        const zoom = viewerId ? await this.service.store.get<{
            scale: number;
        }>('window-zoom', viewerId) : undefined;
        const state = found && found.revision >= root ? structuredClone(found.state) : initialNavigation(navigationLeaf(d.view));
        // Legacy display/content zoom is deliberately not migrated into new windows.
        state.scale = zoom?.scale ?? 1;
        state.page = Math.min(state.page, Math.max(0, navigationCapabilities(d.view, state).pageCount - 1));
        if (found?.revision !== d.revision && state.reading)
            state.reading.playing = false;
        return found && found.revision >= root ? { ...found, revision: d.revision, state, ...(found.revision !== d.revision ? { version: 0, commandId: '', action: undefined } : {}) } : { id: this.key(displayId, viewerId), sessionId, displayId, revision: d.revision, version: 0, state, commandId: '', updatedAt: now() };
    }
    /** Anonymous publication includes broadcast position only, never a tab target. */
    async publicPosition(sessionId: string, displayId: string) {
        const d = required((await this.service.store.get<{
            sessionId: string;
            revision: number;
            view: ViewSpec | null;
        }>('display', displayId)));
        if (d.sessionId !== sessionId)
            throw new AppError('NOT_FOUND', 'This display is unavailable.', 404);
        const p = (await this.position(sessionId, displayId));
        return { revision: d.revision, version: p.version, state: structuredClone(p.state) };
    }
    private async withReading(p: AuthPrincipal, sessionId: string, position: Position): Promise<Awaited<Position>> {
        if (position.state.reading)
            return position;
        const session = (await this.service.access(p, sessionId)), config = !p.scopedDisplayId && (!p.tokenId || (await this.service.store.get<Token>('token', p.tokenId))?.sessionIds === undefined) ? (await this.service.experience.defaults(p.userId)).config : session.config;
        return { ...position, state: { ...position.state, reading: readingDefaults(config) } };
    }
    private async liveViewer(p: AuthPrincipal, sessionId: string, displayId: string, viewerId: string) {
        const viewer = (await this.service.experience.viewers(p, sessionId, displayId)).find(x => x.id === viewerId);
        if (!viewer)
            throw new AppError('VIEWER_UNAVAILABLE', "Select a currently connected viewer using kanvas_call with operationId:\"kanvas.viewers.read\" and arguments:{\u2026}.", 409);
    }
    async read(p: AuthPrincipal, raw: unknown) {
        const a = navigationReadSchema.parse(raw), d = (await this.service.display(p, a.sessionId, a.displayId)), s = (await this.service.access(p, a.sessionId)), position = (await this.position(a.sessionId, d.id, a.viewerId, (s.config.syncMode ?? 'independent') !== 'independent'));
        (await this.service.fullAccount(p));
        const acks = (await this.service.store.list<Ack>('navigation-ack', a.sessionId)).filter(x => x.displayId === d.id && x.revision === d.revision);
        const measured = (await this.service.store.list<Viewport>('navigation-viewport', a.sessionId)).filter(x => x.displayId === d.id && x.revision === d.revision && Date.now() - Date.parse(x.at) < 15000);
        const viewers = await Promise.all((await this.service.experience.viewers(p, a.sessionId, d.id)).filter(v => !a.viewerId || v.id === a.viewerId).map(async (v) => { const current = await this.position(a.sessionId, d.id, v.id, (s.config.syncMode ?? 'independent') !== 'independent'); const viewport = measured.find(x => x.viewerId === v.id && x.version === current.version); return { viewerId: v.id, scale: current.state.scale ?? 1, commandId: current.commandId || undefined, viewport: viewport ? { width: viewport.width, height: viewport.height, maxX: viewport.maxX, maxY: viewport.maxY, contentOverflowsViewport: viewport.maxX > 1 || viewport.maxY > 1, measuredAt: viewport.at } : null, status: acks.find(x => x.viewerId === v.id && x.commandId === current.commandId)?.status ?? (v.connected ? 'unconfirmed' : 'offline'), matches: acks.find(x => x.viewerId === v.id && x.commandId === current.commandId)?.matches, scroll: acks.find(x => x.viewerId === v.id && x.commandId === current.commandId)?.scroll }; }));
        return { ...publicPage(await this.withReading(p, a.sessionId, position)), capabilities: navigationCapabilities(d.view, position.state), mode: s.config.syncMode ?? 'independent', presenterViewerId: s.config.presenterViewerId || undefined, viewers, note: 'pageCount/matchingItems are logical pagination, NOT visible rows. viewport is measured per receiving browser; null means unknown or stale. Execute explicit scroll/navigation requests even on one logical page. Per-viewer receipts only. Offline or unconfirmed viewers are not assumed to have applied this position. Source revision/history are unchanged.' };
    }
    async browserRead(p: AuthPrincipal, sessionId: string, displayId: string, tabId: string): Promise<Awaited<NavigationSnapshot>> {
        tab.parse(tabId);
        const d = (await this.service.display(p, sessionId, displayId)), s = (await this.service.access(p, sessionId)), viewerId = this.service.experience.viewerId(p, tabId), mode = s.config.syncMode ?? 'independent';
        const position = (await this.withReading(p, sessionId, (await this.position(sessionId, displayId, viewerId, mode !== 'independent'))));
        return { canSaveReadingDefaults: !p.scopedDisplayId && !p.tokenId, ...(!p.scopedDisplayId && !p.tokenId ? { readingDefaults: readingDefaults((await this.service.experience.defaults(p.userId)).config) } : {}), action: position.action, revision: d.revision, version: position.version, commandId: position.commandId || undefined, state: position.state, mode, viewerId, canNavigate: mode !== 'presenter' || s.config.presenterViewerId === viewerId, capabilities: navigationCapabilities(d.view, position.state) };
    }
    async control(p: AuthPrincipal, raw: unknown) {
        const a = navigationInputSchema.parse(raw);
        await this.service.display(p, a.sessionId, a.displayId, 'editor');
        const replay = await this.service.store.get<Receipt>('navigation-receipt', hash(`${p.tokenId ?? p.browserId ?? p.userId}:${a.sessionId}:${a.requestId}`));
        if (replay) {
            const target = a.viewerId ?? (a.navigation.action === 'zoom' ? replay.result.target : undefined);
            return this.confirm(p, await this.write(p, { ...a, ...(target ? { viewerId: target } : {}) }, target));
        }
        if (a.navigation.action === 'zoom' && !a.viewerId) {
            const viewers = await this.service.experience.viewers(p, a.sessionId, a.displayId);
            if (viewers.length !== 1)
                throw new AppError('VIEWER_REQUIRED', "Zoom belongs to one device window. Select viewerId from kanvas_call with operationId:\"kanvas.viewers.read\" and arguments:{\u2026} (exactly one connected viewer may be inferred).", 409);
            a.viewerId = viewers[0].id;
        }
        if (a.viewerId) {
            if (a.navigation.action !== 'zoom' && ((await this.service.access(p, a.sessionId)).config.syncMode ?? 'independent') !== 'independent')
                throw new AppError('NAVIGATION_UNAVAILABLE', 'A single viewer navigation target requires independent mode.', 409);
            await this.liveViewer(p, a.sessionId, a.displayId, a.viewerId);
        }
        return this.confirm(p, await this.write(p, a, a.viewerId));
    }
    /** Observe exactly the viewers selected when the command committed. Joining later
     * cannot turn a historical offline request into fabricated confirmation. */
    private async confirm(p: AuthPrincipal, command: Position) {
        const started = performance.now(), deadline = started + publishAckWaitMs();
        let changed = false, wake: (() => void) | undefined;
        const stop = this.service.onEvent(e => { if(e.sessionId === command.sessionId) { changed = true; wake?.(); } });
        try {
            while (true) {
                changed = false;
                const result = await this.service.store.snapshot(async () => {
                    const display = await this.service.display(p, command.sessionId, command.displayId, 'editor');
                    const session = await this.service.access(p, command.sessionId);
                    const live = await this.service.experience.viewers(p, command.sessionId, command.displayId);
                    const acks = await this.service.store.list<Ack>('navigation-ack', command.sessionId);
                    const viewers = await Promise.all((command.viewerIds ?? []).map(async viewerId => {
                        const ack = acks.find(x => x.displayId === command.displayId && x.viewerId === viewerId && x.commandId === command.commandId && x.revision === command.revision);
                        const current = await this.position(command.sessionId, command.displayId, viewerId, (session.config.syncMode ?? 'independent') !== 'independent');
                        const base = {viewerId, commandId:command.commandId, revision:command.revision};
                        if(display.revision !== command.revision || current.commandId !== command.commandId) return {...base,status:'superseded' as const};
                        if(ack) return {...base,status:ack.status,...(ack.code?{code:ack.code}:{}),matches:ack.matches,scroll:ack.scroll};
                        if(!live.some(v => v.id === viewerId && v.connected)) return {...base,status:'offline' as const};
                        return {...base,status:'pending' as const};
                    }));
                    return viewers;
                });
                if(!result.some(v => v.status === 'pending') || performance.now() >= deadline) {
                    const waitedMs = Math.round(performance.now()-started);
                    const viewers = result.map(v => ({...v,status:v.status === 'pending' ? 'unconfirmed' as const : v.status,waitedMs}));
                    // Current access is checked after the wait, including offline/no-viewer results.
                    await this.service.display(p, command.sessionId, command.displayId, 'editor');
                    return {...publicPage(command),delivery:Object.fromEntries(viewers.map(v=>[v.viewerId,v])),viewers,
                        deliveryStatus:!viewers.length?'offline':viewers.every(v=>v.status===viewers[0].status)?viewers[0].status:'unconfirmed',waitedMs,
                        note:!viewers.length?'No receiving browser was connected; navigation is saved, not confirmed on screen.':'Per-viewer browser receipts for this command. Read navigation.read if unconfirmed; do not resend to check. No source data or history changed.'};
                }
                if(changed) continue;
                await new Promise<void>(resolve => {
                    const timer=setTimeout(done,Math.max(0,deadline-performance.now()));
                    function done(){clearTimeout(timer);wake=undefined;resolve();}
                    wake=done;if(changed)done();
                });
            }
        } finally {stop();wake?.();}
    }
    async browserControl(p: AuthPrincipal, sessionId: string, displayId: string, raw: unknown) {
        const a = browserInput.parse(raw), snapshot = (await this.browserRead(p, sessionId, displayId, a.tabId));
        if (!snapshot.canNavigate && a.navigation.action !== 'zoom')
            throw new AppError('PRESENTER_ONLY', 'This session follows its selected presenter. Ask the owner to change navigation mode.', 403);
        (await this.write(p, { ...a, sessionId, displayId }, snapshot.mode === 'independent' || a.navigation.action === 'zoom' ? snapshot.viewerId : undefined));
        return (await this.browserRead(p, sessionId, displayId, a.tabId));
    }
    private async write(p: AuthPrincipal, a: z.infer<typeof navigationInputSchema>, target?: string) {
        return this.service.store.atomic(async () => {
            const s = this.service, d = (await s.display(p, a.sessionId, a.displayId)), key = hash(`${p.tokenId ?? p.browserId ?? p.userId}:${a.sessionId}:${a.requestId}`), digest = hash(JSON.stringify({ a, target }));
            const prior = (await s.store.get<Receipt>('navigation-receipt', key));
            if (prior) {
                if (prior.digest !== digest)
                    throw new AppError('REQUEST_ID_CONFLICT', 'This navigation request ID was already used with different arguments.', 409);
                return { ...prior.result, replayed: true, superseded: prior.result.revision !== d.revision || (await this.position(a.sessionId, d.id, target)).commandId !== prior.result.commandId };
            }
            s.assertRevision(a.expectedRevision, d.revision);
            const shared = ((await s.access(p, a.sessionId)).config.syncMode ?? 'independent') !== 'independent';
            const before = (await this.withReading(p, a.sessionId, (await this.position(a.sessionId, d.id, target, shared))));
            let state: NavigationState;
            try {
                state = navigate(d.view, before.state, a.navigation);
            }
            catch (error) {
                throw new AppError('NAVIGATION_UNAVAILABLE', error instanceof Error ? error.message : 'This navigation is unavailable.', 409);
            }
            const all = (await s.store.list<Position>('navigation', a.sessionId)).filter(x => x.displayId === d.id);
            const viewerIds = (await s.experience.receiving.viewers(a.sessionId, d.id)).filter(v => v.connected && (!target || v.id === target)).map(v => v.id);
            const result: Position = { requestId:a.requestId, viewerIds, action: a.navigation.action, id: this.key(d.id, target), sessionId: a.sessionId, displayId: d.id, revision: d.revision, version: Math.max(0, ...all.map(x => x.version)) + 1, state, commandId: id(), target, updatedAt: now() };
            (await s.store.transaction(async () => {
                if (a.navigation.action === 'reading' && a.navigation.saveDefaults) {
                    const current = (await s.experience.preferences(p)), r = state.reading!, patch: Record<string, number> = {};
                    if (a.navigation.fontSize !== undefined)
                        patch.readingFontSize = r.fontSize;
                    if (a.navigation.zoom !== undefined)
                        patch.readingZoom = r.zoom;
                    if (a.navigation.wpm !== undefined || ['slower', 'faster'].includes(a.navigation.command))
                        patch.readingWpm = r.wpm;
                    if (!Object.keys(patch).length)
                        Object.assign(patch, { readingFontSize: r.fontSize, readingWpm: r.wpm, readingZoom: r.zoom });
                    (await s.experience.preferences(p, { expectedRevision: current.revision, config: patch }));
                }
                if (target && a.navigation.action === 'zoom')
                    await s.store.put('window-zoom', { id: target, scale: state.scale ?? 1, updatedAt: now() });
                (await s.store.put('navigation', result));
                (await s.store.put('navigation-receipt', { id: key, sessionId: a.sessionId, digest, result, createdAt: now() }));
            }));
            s.emit({ type: 'display', sessionId: a.sessionId, displayId: d.id, revision: d.revision });
            return { ...result, note: "Accepted navigation; read kanvas_call with operationId:\"kanvas.navigation.read\" and arguments:{\u2026} for per-viewer application. No source data or history changed." };
        });
    }
    async measure(p: AuthPrincipal, sessionId: string, displayId: string, raw: unknown) {
        const extent = z.number().finite().nonnegative().max(100000000);
        const a = z.object({ tabId: tab, revision: z.number().int().nonnegative(), version: z.number().int().nonnegative(), width: extent, height: extent, maxX: extent, maxY: extent }).strict().parse(raw);
        const snapshot = await this.browserRead(p, sessionId, displayId, a.tabId);
        if (snapshot.revision !== a.revision || snapshot.version !== a.version)
            return { ignored: true };
        const record: Viewport = { id: hash(`${displayId}:${snapshot.viewerId}`), sessionId, displayId, viewerId: snapshot.viewerId!, revision: a.revision, version: a.version, width: a.width, height: a.height, maxX: a.maxX, maxY: a.maxY, at: now() };
        await this.service.store.put('navigation-viewport', record);
        return { ignored: false };
    }
    async acknowledge(p: AuthPrincipal, sessionId: string, displayId: string, raw: unknown) {
        return this.service.store.atomic(async () => {
            const a = z.object({ tabId: tab, revision: z.number().int().nonnegative(), commandId: tab, status: z.enum(['applied', 'failed']), code:z.literal('NAVIGATION_UNSUPPORTED').optional(), matches: z.number().int().min(0).max(100000).optional(), scroll: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), maxX: z.number().nonnegative().max(100000000), maxY: z.number().nonnegative().max(100000000) }).strict().optional() }).strict().parse(raw);
            const snapshot = (await this.browserRead(p, sessionId, displayId, a.tabId));
            if (snapshot.revision !== a.revision || snapshot.commandId !== a.commandId)
                return { ignored: true };
            const viewerId = snapshot.viewerId!, record: Ack = { id: hash([displayId,viewerId,a.commandId].join(':')), sessionId, displayId, revision: a.revision, commandId: a.commandId, viewerId, status: a.status, code:a.code, matches: a.matches, scroll: a.scroll, at: now() };
            const prior=await this.service.store.get<Ack>('navigation-ack',record.id);
            if(prior?.status === 'applied') return {ignored:false};
            await this.service.store.put('navigation-ack', record);
            this.service.emit({type:'update',sessionId,displayId,revision:a.revision});
            return { ignored: false };
        });
    }
    async pins(p: AuthPrincipal, sessionId: string, displayId: string) { (await this.service.display(p, sessionId, displayId)); return (await this.service.store.list<Pin>('view-pin', sessionId)).filter(x => x.displayId === displayId).map(({ view, ...x }) => ({ ...x, template: x.template ?? view.template, ...(x.title ?? view.title ?? derivedViewLabel(view) ? { title: x.title ?? view.title ?? derivedViewLabel(view) } : {}) })); }
    async savePin(p: AuthPrincipal, raw: unknown) {
        return this.service.store.atomic(async () => {
            const a = pinSaveSchema.parse(raw), s = this.service, d = (await s.display(p, a.sessionId, a.displayId, 'editor')), key = hash(`${p.tokenId ?? p.userId}:${a.sessionId}:${a.requestId}`), digest = hash(JSON.stringify(a));
            const prior = (await s.store.get<{
                digest: string;
                result: Omit<Pin, 'view'>;
            }>('pin-receipt', key));
            if (prior) {
                if (prior.digest !== digest)
                    throw new AppError('REQUEST_ID_CONFLICT', 'This pin request was used for a different label or revision.', 409);
                return prior.result;
            }
            const revision = a.revision ?? d.revision, view = revision === d.revision ? d.view : (await s.history.target(d, undefined, revision)).entry.view;
            if (!view)
                throw new AppError('EMPTY_VIEW', 'Publish content before pinning it.');
            const pins = (await s.store.list<Pin>('view-pin', a.sessionId));
            if (pins.length >= 40 || pins.reduce((n, x) => n + JSON.stringify(x.view).length, 0) + JSON.stringify(view).length > 6 * 1024 * 1024)
                throw new AppError('LIMIT_REACHED', 'Remove a pin before saving more (40 pins / 6 MB per session).', 429);
            const pinTitle = view.title ?? derivedViewLabel(view), record: Pin = { id: id(), sessionId: a.sessionId, displayId: d.id, label: a.label, revision, template: view.template, ...(pinTitle ? { title: pinTitle } : {}), view: structuredClone(view), createdAt: now() }, { view: _view, ...result } = record;
            (await s.store.transaction(async () => { (await s.store.put('view-pin', record)); (await s.store.put('pin-receipt', { id: key, sessionId: a.sessionId, digest, result })); }));
            return result;
        });
    }
    async recallPin(p: AuthPrincipal, raw: unknown) {
        const a = pinRecallSchema.parse(raw), s = this.service;
        return (await s.recallPinnedView(p, a, async () => { const pin = required((await s.store.get<Pin>('view-pin', a.pinId))); if (pin.sessionId !== a.sessionId || pin.displayId !== a.displayId)
            throw new AppError('NOT_FOUND', 'This pin is unavailable for this display.', 404); return pin.view; }));
    }
    async removePin(p: AuthPrincipal, raw: unknown) {
        return this.service.store.atomic(async () => {
            const a = pinRemoveSchema.parse(raw);
            (await this.service.display(p, a.sessionId, a.displayId, 'editor'));
            const pin = (await this.service.store.get<Pin>('view-pin', a.pinId));
            if (pin && (pin.sessionId !== a.sessionId || pin.displayId !== a.displayId))
                throw new AppError('NOT_FOUND', 'This pin is unavailable.', 404);
            (await this.service.store.delete('view-pin', a.pinId));
            return { removed: true, pinId: a.pinId };
        });
    }
}
export function mountNavigation(app:Express,navigation:Navigation,browser:(req:Request)=>Promise<Awaited<AuthPrincipal>>){
  const path='/api/sessions/:id/displays/:displayId/navigation', ids=(req:Request)=>[String(req.params.id),String(req.params.displayId)] as const;
  app.get(path,async (req,res)=>res.json({data:(await navigation.browserRead((await browser(req)),...ids(req),tab.parse(req.query.tabId)))}));
  app.post(path,async (req,res)=>res.json({data:(await navigation.browserControl((await browser(req)),...ids(req),req.body))}));
  app.post(`${path}/viewport`,async (req,res)=>res.json({data:await navigation.measure(await browser(req),...ids(req),req.body)}));
  app.post(`${path}/ack`,async (req,res)=>res.json({data:(await navigation.acknowledge((await browser(req)),...ids(req),req.body))}));
}
