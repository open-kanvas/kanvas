import type {Express,Request} from 'express';
import {z} from 'zod';
import type {AuthPrincipal} from './auth.js';
import type {KanvasService} from './domain.js';
import {AppError,id,now} from './store.js';
import {validateMedia} from './rendering/media.js';

const slot = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const terminal = new Set(['complete', 'denied', 'unsupported', 'failed', 'expired']);
type Status = 'awaiting-user-gesture' | 'awaiting-permission' | 'complete' | 'denied' | 'unsupported' | 'failed' | 'expired';
interface Capture {
  id: string; sessionId: string; displayId: string; viewerId: string; requester: AuthPrincipal;
  status: Status; requestedAt: string; expiresAt: number; revision: number;
  assetId?: string; assetUrl?: string; width?: number; height?: number; receivedAt?: string;
}
const resultSchema = z.strictObject({
  tabId: slot, status: z.enum(['awaiting-permission', 'complete', 'denied', 'unsupported', 'failed']),
  base64: z.string().max(2_796_204).optional(),
  width: z.number().int().min(1).max(1920).optional(), height: z.number().int().min(1).max(1080).optional(),
});
/** One fixed, consented operation. No script, URL, selector or arbitrary command
 * is accepted. Ephemeral requests expire after two minutes (and on restart);
 * only the resulting normal session asset is durable. */
export class ClientCapture {
    private requests = new Map<string, Capture>();
    constructor(readonly service: KanvasService) { }
    private cleanup() {
        for (const [key, item] of this.requests) {
            if (Date.now() >= item.expiresAt && !terminal.has(item.status))
                item.status = 'expired';
            if (Date.now() >= item.expiresAt + 600000)
                this.requests.delete(key);
        }
    }
    private result(item: Capture) {
        const { requester: _private, revision: requestedRevision, ...result } = item;
        return { ...result, requestedRevision, captureId: item.id, source: 'consented-client-screen',
            note: "A remote request cannot open the browser share picker. Ask the person to click once inside the existing Kanvas viewer, then choose a tab/window/screen in the native browser picker. The selected surface may differ from the Kanvas tab. No new Kanvas button or screen is added; no arbitrary scripts execute. Request expires after two minutes. Complete images are ordinary session-protected assets; use kanvas_call with operationId:\"kanvas.asset.export\" and arguments:{\u2026} for bytes." };
    }
    async request(p: AuthPrincipal, a: {
        sessionId: string;
        displayId: string;
        viewerId?: string;
    }) {
        return this.service.store.atomic(async () => {
            await this.service.fullAccount(p, 'publish');
            const display = await this.service.display(p, a.sessionId, a.displayId, 'editor');
            this.cleanup();
            const viewers = (await this.service.experience.receiving.viewers(a.sessionId, a.displayId))
                .filter(v => v.connected && v.participantId === p.userId && (!a.viewerId || v.id === a.viewerId));
            if (!viewers.length)
                throw new AppError('CAPTURE_NO_VIEWER', 'No connected, signed-in browser belonging to your account is on this display. Paired guest/public screens cannot be captured.', 409);
            if (viewers.length > 1)
                throw new AppError('CAPTURE_CHOOSE_VIEWER', 'Multiple account browsers are connected. Read viewers and supply exactly one viewerId.', 409);
            const active = [...this.requests.values()];
            if (active.some(x => x.viewerId === viewers[0].id && !terminal.has(x.status)))
                throw new AppError('CAPTURE_PENDING', 'This viewer already has a pending request. Read its status or wait for expiry.', 409);
            if (this.requests.size >= 256 || active.filter(x => x.requester.userId === p.userId && Date.parse(x.requestedAt) > Date.now() - 60000).length >= 6)
                throw new AppError('CAPTURE_BUSY', 'Client capture limit reached; retry shortly.', 429);
            const capture: Capture = { id: id(), sessionId: a.sessionId, displayId: a.displayId, viewerId: viewers[0].id,
                requester: { ...p }, requestedAt: now(), expiresAt: Date.now() + 120000, revision: display.revision, status: 'awaiting-user-gesture' };
            this.requests.set(capture.id, capture);
            this.service.emit({ type: 'display', sessionId: a.sessionId, displayId: a.displayId, data: { clientCapture: true } });
            return this.result(capture);
        });
    }
    async status(p: AuthPrincipal, a: {
        sessionId: string;
        displayId: string;
        captureId: string;
    }) {
        await this.service.fullAccount(p);
        await this.service.display(p, a.sessionId, a.displayId);
        this.cleanup();
        const item = this.requests.get(a.captureId);
        if (!item || item.sessionId !== a.sessionId || item.displayId !== a.displayId || item.requester.userId !== p.userId)
            throw new AppError('NOT_FOUND', 'Capture request unavailable or expired from retention.', 404);
        return this.result(item);
    }
    private async viewer(p: AuthPrincipal, sessionId: string, displayId: string, tabId: string) {
        await this.service.fullAccount(p);
        await this.service.display(p, sessionId, displayId);
        return this.service.experience.viewerId(p, tabId);
    }
    async pending(p: AuthPrincipal, sessionId: string, displayId: string, tabId: string) {
        const viewerId = await this.viewer(p, sessionId, displayId, slot.parse(tabId));
        this.cleanup();
        const item = [...this.requests.values()].find(x => x.sessionId === sessionId && x.displayId === displayId && x.viewerId === viewerId && x.requester.userId === p.userId && x.status === 'awaiting-user-gesture');
        if (!item)
            return null;
        // Revalidate the requesting token/session too, not just the receiving browser.
        try {
            await this.service.display(item.requester, sessionId, displayId, 'editor');
        }
        catch {
            item.status = 'failed';
            return null;
        }
        return { captureId: item.id, expiresAt: item.expiresAt };
    }
    async receive(p: AuthPrincipal, sessionId: string, displayId: string, captureId: string, raw: unknown) {
        const a = resultSchema.parse(raw);
        return this.service.store.atomic(async () => {
            const viewerId = await this.viewer(p, sessionId, displayId, a.tabId);
            this.cleanup();
            const item = this.requests.get(captureId);
            if (!item || item.sessionId !== sessionId || item.displayId !== displayId || item.viewerId !== viewerId || item.requester.userId !== p.userId)
                throw new AppError('NOT_FOUND', 'Capture request unavailable.', 404);
            await this.service.display(item.requester, sessionId, displayId, 'editor');
            if (terminal.has(item.status))
                throw new AppError('CAPTURE_FINISHED', 'Capture has already completed or expired.', 409);
            if (a.status === 'complete') {
                if (item.status !== 'awaiting-permission' || !a.base64 || !a.width || !a.height)
                    throw new AppError('INVALID_CAPTURE', 'An active browser capture and image dimensions are required.');
                const bytes = Buffer.from(a.base64, 'base64');
                if (bytes.length > 2 * 1024 * 1024 || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9)
                    throw new AppError('INVALID_CAPTURE', 'Only a JPEG frame up to 2 MiB is accepted.');
                if ((await this.service.store.list('capture-asset', sessionId)).length >= 100)
                    throw new AppError('LIMIT_REACHED', 'Remove unused captures before saving more; maximum 100 per session.', 429);
                const input = { name: 'Consented client screen capture.jpg', mimeType: 'image/jpeg', base64: a.base64 };
                const media = validateMedia(input);
                if (media.width !== a.width || media.height !== a.height)
                    throw new AppError('INVALID_CAPTURE', 'The encoded JPEG dimensions do not match the bounded capture frame.');
                const asset = await this.service.importAsset(item.requester, sessionId, input);
                item.assetId = asset.id;
                item.assetUrl = new URL(asset.url, this.service.publicUrl).href;
                item.width = a.width;
                item.height = a.height;
                item.receivedAt = now();
                await this.service.store.put('capture-asset', { id: asset.id, sessionId, displayId, createdAt: now(), source: 'consented-client-screen' });
            }
            else if (a.base64 !== undefined || a.width !== undefined || a.height !== undefined)
                throw new AppError('INVALID_CAPTURE', 'Only completed captures accept image data.');
            item.status = a.status;
            return this.result(item);
        });
    }
}

export function mountClientCapture(app: Express, capture: ClientCapture, browser: (req: Request) => Promise<AuthPrincipal>) {
  const path = '/api/sessions/:id/displays/:displayId/client-capture';
  app.get(path, async (req, res) => {
    const query = z.strictObject({tabId: slot}).parse(req.query);
    res.json({data: await capture.pending(await browser(req), String(req.params.id), String(req.params.displayId), query.tabId)});
  });
  app.post(`${path}/:captureId`, async (req, res) => {
    res.json({data: await capture.receive(await browser(req), String(req.params.id), String(req.params.displayId), String(req.params.captureId), req.body)});
  });
}
