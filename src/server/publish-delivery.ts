import type {DisplayRecord, UpdateRecord} from '../shared/types.js';
import type {KanvasService} from './domain.js';
import {displayedLeaf} from './engagement.js';

/** One budget for the entire fan-out, never one timeout per screen. */
export const PUBLISH_ACK_WAIT_MS = 2000;
/** Optional operator tuning, bounded independently of untrusted tool input. */
export function publishAckWaitMs(): number {
    const raw = process.env.KANVAS_PUBLISH_ACK_WAIT_MS;
    if (!raw?.trim()) return PUBLISH_ACK_WAIT_MS;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(Math.round(value), 5000)) : PUBLISH_ACK_WAIT_MS;
}
type Receipt = NonNullable<UpdateRecord['delivery']>[string];

export async function deliveryForUpdate(service: KanvasService, update: UpdateRecord): Promise<NonNullable<UpdateRecord['delivery']>> {
    const entries = await Promise.all([...new Set([...update.displayIds, ...(update.heldDisplayIds ?? [])])].map(async displayId => {
        const display = await service.store.get<DisplayRecord>('display', displayId), revision = update.revisions[displayId];
        const base = {...(revision === undefined ? {} : {revision}), ...(display ? {displayName:display.name} : {})};
        let receipt: Receipt;
        if (update.status === 'failed') receipt = {...base, status:'failed', message:update.error ?? 'The view could not be prepared; previous content is retained.'};
        else if (update.status === 'held' || update.heldDisplayIds?.includes(displayId)) receipt = {...base, status:'held', message:update.heldDisplayIds?.includes(displayId) ? 'This request saved the list but skipped this held display; its content and revision were unchanged. Release hold and show the saved list with a new request to refresh it.' : 'Publication was held; no new view was applied. Release the display hold before publishing.'};
        else if (update.status === 'superseded' || !display || revision !== undefined && display.revision !== revision) receipt = {...base, status:'superseded', message:'A newer display revision replaced this request; this is not confirmation of the new content.'};
        else if (update.status === 'retained') receipt = {...base, status:'unconfirmed', message:'Previous content retained; no new view was published.'};
        else if (revision !== undefined && display.appliedRevision === revision) {
            const leaf = displayedLeaf(display.view);
            receipt = {...base, status:'applied', message: ['iframe','website'].includes(leaf?.template ?? '') || leaf?.template === 'web' && leaf.data.embed === true ? 'The KANVAS frame container is rendered; remote website content remains unverified.' : 'Browser acknowledged this display revision.'};
        } else if (revision !== undefined && display.delivery?.revision === revision && display.delivery.status === 'failed') receipt = {...base, status:'failed', message:display.delivery.message, ...(display.delivery.code ? {code:display.delivery.code} : {})};
        else if (!display.online) receipt = {...base, status:'offline', message:'No browser is connected to this display. The request is saved, not confirmed on screen.'};
        else if (Date.now() - Date.parse(update.completedAt ?? update.createdAt) >= 30000) receipt = {...base, status:'unconfirmed', message:'No browser acknowledgement has arrived within 30 seconds. Inspect the display; do not assume it is visible.'};
        else receipt = {...base, status:'pending', message:revision === undefined ? 'Preparing content; browser acknowledgement is not yet available.' : 'Awaiting browser acknowledgement.'};
        return [displayId, receipt] as const;
    }));
    return Object.fromEntries(entries);
}

/** Subscribe before reading and coalesce invalidations. No write transaction is
 * held while waiting. Timeout is an observation, never a durable failure. */
export async function waitForDelivery(service: KanvasService, initial: UpdateRecord, refresh = true, budgetMs = publishAckWaitMs()): Promise<UpdateRecord> {
    const started = performance.now(), deadline = started + Math.max(0, Math.min(budgetMs, 5000));
    let changed = false, wake: (() => void) | undefined;
    const unsubscribe = service.onEvent(event => { if (event.sessionId === initial.sessionId) { changed = true; wake?.(); } });
    try {
        while (true) {
            changed = false;
            const {update, delivery} = await service.store.snapshot(async () => {
                const update = refresh ? await service.store.get<UpdateRecord>('update', initial.id) ?? initial : initial;
                return {update, delivery:await deliveryForUpdate(service, update)};
            });
            const pending = Object.values(delivery).some(value => value.status === 'pending');
            const elapsed = Math.round(performance.now() - started);
            if (!pending || performance.now() >= deadline) {
                for (const receipt of Object.values(delivery)) {
                    receipt.waitedMs = receipt.status === 'held' ? 0 : elapsed;
                    if (receipt.status === 'pending') { receipt.status = 'unconfirmed'; receipt.message = 'Browser acknowledgement was not confirmed within the bounded wait. Use update.status or display.inspect for a later check; do not republish just to check.'; }
                }
                return {...update, delivery};
            }
            if (changed) continue;
            await new Promise<void>(resolve => {
                const timer = setTimeout(done, Math.max(0, deadline - performance.now()));
                function done() { clearTimeout(timer); wake = undefined; resolve(); }
                wake = done;
                if (changed) done();
            });
        }
    } finally { unsubscribe(); wake?.(); }
}
