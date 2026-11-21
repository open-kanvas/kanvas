import {ACCOUNT_GAPS,ACCOUNT_MANAGE,accountInventorySchema} from '../shared/account-inventory.js';
import type {AuthPrincipal} from './auth.js';
import type {KanvasService} from './domain.js';
import type {DisplayRecord} from '../shared/types.js';
import {AppError} from './store.js';
import {displayedLeaf} from './engagement.js';
import {templateNames} from '../shared/template-examples.js';

export { ACCOUNT_GAPS, ACCOUNT_MANAGE, accountInventorySchema };

interface Place { sessionId: string; displayId: string }
interface InventoryWindow { id: string; name: string; version: number; connected: boolean; current?: Place }
interface InventoryDevice { id: string; name: string; version: number; connected: boolean; lastSeenAt?: string; current?: Place; windows: InventoryWindow[] }
interface InventoryGroup { id: string; kind: string; name: string; role: string }
const place = (value: Place) => ({ sessionId: value.sessionId, displayId: value.displayId });

/** Everything the account can see in one bounded read, with the operations
 * that read or change each kind of resource. */
export class AccountInventory {
    constructor(private readonly service: KanvasService) { }
    async read(principal: AuthPrincipal, raw: unknown) {
        const input = accountInventorySchema.parse(raw);
        const all = (await this.service.sessions(principal));
        const listed = all.filter(session => input.includeEnded || !session.endedAt).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
        const sessions: object[] = [];
        for (const session of listed) {
            const viewers = (await this.service.experience.receiving.viewers(session.id));
            const online = new Set(viewers.filter(viewer => (viewer as {
                connected?: boolean;
            }).connected !== false).map(viewer => (viewer as {
                displayId?: string;
            }).displayId));
            const displays = (await this.service.store.list<DisplayRecord>('display', session.id)).map(display => {
                const leaf = displayedLeaf(display.view), title = typeof leaf?.title === 'string' ? leaf.title.trim().slice(0, 120) : '';
                return { id: display.id, name: display.name, online: online.has(display.id), ...(display.held ? { held: true } : {}), shows: leaf ? title || (templateNames as Record<string, string>)[leaf.template] || leaf.template : null };
            });
            sessions.push({ id: session.id, name: session.name, role: session.role ?? 'viewer', updatedAt: session.updatedAt, ...(session.endedAt ? { endedAt: session.endedAt } : {}), displays });
        }
        const unavailable = 'Needs an account-wide connection (not limited to one session).';
        const accountWide = async <T>(read: () => Promise<T>): Promise<T | string> => {
            try {
                return (await read());
            }
            catch (error) {
                const denied = error as {
                    status?: number;
                    statusCode?: number;
                };
                if (error instanceof AppError && (error.code === 'FORBIDDEN' || denied.status === 403 || denied.statusCode === 403))
                    return unavailable;
                throw error;
            }
        };
        const devices = (await accountWide(async () => ((await this.service.devices.list(principal)).devices as unknown as InventoryDevice[]).map(device => ({
            id: device.id, name: device.name, version: device.version, connected: device.connected, ...(device.lastSeenAt ? { lastSeenAt: device.lastSeenAt } : {}), ...(device.current ? { current: place(device.current) } : {}),
            windows: device.windows.map(window => ({ id: window.id, name: window.name, version: window.version, connected: window.connected, ...(window.current ? { current: place(window.current) } : {}) })),
        }))));
        const groups = (await accountWide(async () => ((await this.service.accounts.list(principal)).groups as unknown as InventoryGroup[]).map(group => ({ id: group.id, kind: group.kind, name: group.name, role: group.role }))));
        const result = (items: object[]) => ({
            sessions: items, sessionsListed: items.length, sessionsTotal: all.length,
            ...(input.includeEnded ? {} : { endedHidden: all.filter(session => session.endedAt).length }), ...(items.length < sessions.length ? { truncated: true } : {}),
            devices, groups, manage: ACCOUNT_MANAGE, notAvailable: ACCOUNT_GAPS,
            next: "Use manage to read or change each resource. kanvas_call with operationId:\"kanvas.connection.redirect\" and arguments:{\u2026} (a kanvas_call with operationId:\"kanvas.topology.read\" and arguments:{\u2026} connection) or kanvas_call with operationId:\"kanvas.window.present\" and arguments:{\u2026} (a devices window) moves a live browser window to any display you can open, in any session.",
        });
        let items = sessions;
        while (items.length > 1 && Buffer.byteLength(JSON.stringify(result(items))) > 40000)
            items = items.slice(0, Math.ceil(items.length / 2));
        return result(items);
    }
}
