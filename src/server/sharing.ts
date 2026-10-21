import { asyncMap } from './async-collections.js';
import type { Express, Request } from 'express';
import { z } from 'zod';
import type { DisplayRecord, SessionRecord } from '../shared/types.js';
import type { AccessFlowOptions, PairingRecord } from './access-flows.js';
import type { AuthPrincipal } from './auth.js';
import { AppError, id, now, required, Store } from './store.js';

export const SHARE_LIMITS = Object.freeze({ maxHours: 7 * 24, defaultHours: 24, maxActivePerSession: 32, maxPendingPerSession: 64 });
export interface ShareRecord {
  id: string;
  sessionId: string;
  displayId: string;
  ownerId: string;
  label: string;
  allowInteraction: boolean;
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
  expiresAt: string;
  closedAt?: string;
}

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const createSchema = z.strictObject({
  displayId: identifier,
  label: z.string().trim().min(1).max(80).default('Shared display'),
  allowInteraction: z.boolean().default(false),
  expiresInHours: z.number().int().min(1).max(SHARE_LIMITS.maxHours).default(SHARE_LIMITS.defaultHours),
});

/** A share ID locates an invitation, never session content or a bearer grant. */
export async function shareForAdmission(store: Store, shareId: string): Promise<Awaited<ShareRecord>> {
  const share = required((await store.get<ShareRecord>('share', identifier.parse(shareId))), 'This display invitation is unavailable.');
  const session = (await store.get<SessionRecord>('session', share.sessionId)), display = (await store.get<DisplayRecord>('display', share.displayId));
  if (share.status !== 'active' || Date.parse(share.expiresAt) <= Date.now() || !session || session.endedAt ||
      session.ownerId !== share.ownerId || !display || display.sessionId !== share.sessionId ||
      !(await store.db.prepare('SELECT id FROM users WHERE id=?').get(share.ownerId))) {
    throw new AppError('SHARE_CLOSED', 'This display invitation has expired or was revoked. Ask the owner for a new invitation.', 410);
  }
  return share;
}

export function mountSharing(app: Express, options: AccessFlowOptions): void {
  const { auth, store, browser, access, emit } = options;
  const origin = new URL(options.publicUrl).origin;
  const account = async (request: Request): Promise<AuthPrincipal> => {
    const principal = await browser(request);
    if (!principal.browserId || principal.scopedSessionId || principal.scopedDisplayId || principal.pairingId || principal.captureOnly || principal.tokenId) {
      throw new AppError('FORBIDDEN', 'Sign in with the owning account to manage invitations.', 403);
    }
    return principal;
  };
  const metadata = (share: ShareRecord) => ({
    id: share.id, sessionId: share.sessionId, displayId: share.displayId, label: share.label, allowInteraction: share.allowInteraction,
    status: share.status, createdAt: share.createdAt, expiresAt: share.expiresAt, closedAt: share.closedAt,
    joinUrl: `${origin}/join/${encodeURIComponent(share.id)}`,
  });
  const close = async (share: ShareRecord, status: 'expired' | 'revoked') => {
    const affected: PairingRecord[] = [];
    (await store.transaction(async () => {
      share.status = status; share.closedAt = now(); (await store.put('share', share));
      for (const pair of (await store.list<PairingRecord>('pairing', share.sessionId))) {
        if (pair.shareId !== share.id || !['approved', 'pending'].includes(pair.status)) continue;
        pair.status = status; pair.decidedAt = now(); (await store.put('pairing', pair));
        if (pair.browserSessionId) (await store.delete('browser', pair.browserSessionId));
        affected.push(pair);
      }
    }));
    for (const pair of affected) emit({ type: 'membership', sessionId: pair.sessionId, displayId: pair.displayId });
  };
  const expire = async (share: ShareRecord) => {
    if (share.status === 'active' && Date.parse(share.expiresAt) <= Date.now()) (await close(share, 'expired'));
    return share;
  };

  app.get('/api/sessions/:sessionId/shares', async (request, response) => {
    const principal = (await account(request)), sessionId = identifier.parse(request.params.sessionId);
    await access(principal, sessionId, 'owner');
    response.json({ data: (await asyncMap((await store.list<ShareRecord>('share', sessionId)), expire)).map(metadata) });
  });
  app.post('/api/sessions/:sessionId/shares', async (request, response) => {
    const result=await store.atomic(async()=>{
    const principal = (await account(request)), sessionId = identifier.parse(request.params.sessionId), body = createSchema.parse(request.body);
    await auth.requireFresh(principal);
    await access(principal, sessionId, 'owner');
    const display = required((await store.get<DisplayRecord>('display', body.displayId)), 'This display is unavailable.');
    if (display.sessionId !== sessionId) throw new AppError('NOT_FOUND', 'This display is unavailable.', 404);
    if ((await asyncMap((await store.list<ShareRecord>('share', sessionId)), expire)).filter(item => item.status === 'active').length >= SHARE_LIMITS.maxActivePerSession) {
      throw new AppError('LIMIT_REACHED', 'Revoke an unused invitation before creating another.', 429);
    }
    const share: ShareRecord = {
      id: id(), sessionId, displayId: display.id, ownerId: principal.userId, label: body.label, allowInteraction: body.allowInteraction,
      status: 'active', createdAt: now(), expiresAt: new Date(Date.now() + body.expiresInHours * 3600_000).toISOString(),
    };
    (await store.put('share', share));
    return metadata(share);
    });
    response.status(201).json({data:result});
  });
  app.delete('/api/shares/:id', async (request, response) => {
    const principal = (await account(request)), share = required((await store.get<ShareRecord>('share', identifier.parse(request.params.id))), 'This invitation is unavailable.');
    const session = await access(principal, share.sessionId, 'owner');
    if (share.ownerId !== principal.userId || session.ownerId !== share.ownerId) throw new AppError('NOT_FOUND', 'This invitation is unavailable.', 404);
    if (share.status !== 'revoked') (await close(share, 'revoked'));
    response.json({ data: metadata(share) });
  });
  app.get('/api/shares/:id', async (request, response) => {
    const shareId = identifier.parse(request.params.id), stored = (await store.get<ShareRecord>('share', shareId));
    if (stored) (await expire(stored));
    const share = (await shareForAdmission(store, shareId));
    let viewerPath: string | undefined;
    // Existing account/display permission may open the viewer directly. This
    // never adds membership or replaces that browser's authenticated identity.
    try {
      const { principal } = (await auth.browser(request));
      await access(principal, share.sessionId);
      if (!principal.scopedDisplayId || principal.scopedDisplayId === share.displayId) viewerPath = `/view/${encodeURIComponent(share.sessionId)}/${encodeURIComponent(share.displayId)}`;
    } catch { /* Public invitation metadata grants no access. */ }
    response.json({ data: {
      id: share.id, label: share.label, allowInteraction: share.allowInteraction, expiresAt: share.expiresAt, status: share.status,
      ...(viewerPath ? { viewerPath } : {}),
    } });
  });
}
