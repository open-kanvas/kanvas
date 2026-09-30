import type { AssetRecord, ViewSpec } from '../shared/types.js';
import type { AuthPrincipal, Token } from './auth.js';
import { type KanvasService, referencedAssets } from './domain.js';
import { Monitoring, type MonitoringJob, type MonitoringOwner, type MonitoringOptions, MONITORING_DOCUMENT } from './monitoring.js';
import { validateMedia } from './rendering/media.js';
import { participationCompatible } from './participation.js';
import { AppError, id, now } from './store.js';

/** A persisted monitor is bound to the durable grant, not a rotating OAuth access credential. */
export async function monitoringPrincipal(service: KanvasService, owner: MonitoringOwner, sessionId: string): Promise<Awaited<AuthPrincipal>> {
  if (!(await service.auth.user(owner.userId))) throw new AppError('UNAUTHORIZED', 'The monitoring owner is no longer available.', 401);
  if (owner.tokenId) {
    const grant = (await service.store.get<Token>('token', owner.tokenId));
    const expiry = grant?.resource && grant.refreshExpiresAt !== undefined
      ? Math.min(grant.refreshExpiresAt, grant.refreshIdleExpiresAt ?? 0)
      : grant?.expiresAt ?? 0;
    if (!grant || grant.revoked || expiry <= Date.now() || grant.userId !== owner.userId || grant.agentId !== owner.agentId ||
      grant.resource && (grant.resource !== service.auth.oauthResource || !grant.clientId || !(await service.store.get('oauth-client', grant.clientId)))) {
      throw new AppError('UNAUTHORIZED', 'The monitoring grant expired or was revoked.', 401);
    }
    if (!grant.scopes.includes('publish') || grant.sessionIds && !grant.sessionIds.includes(sessionId)) throw new AppError('FORBIDDEN', 'The monitoring grant no longer permits this session.', 403);
  }
  const principal: AuthPrincipal = { userId: owner.userId, ...(owner.agentId ? { agentId: owner.agentId } : {}) };
  (await service.access(principal, sessionId, 'editor'));
  return principal;
}

/** Attach bounded polling to the same ACL, source, history and delivery boundary as MCP. */
export function connectMonitoring(service: KanvasService, options?: MonitoringOptions): Monitoring {
  const store = service.store;
  const inspect = async (owner: MonitoringOwner, sessionId: string, displayId: string) => {
    const principal = (await monitoringPrincipal(service, owner, sessionId));
    const display = (await service.display(principal, sessionId, displayId, 'editor'));
    return { generation: display.generation, revision: display.revision, configRevision: (await service.access(principal, sessionId, 'editor')).configRevision, held: display.held };
  };
  const releaseImage = async (job: MonitoringJob, assetId: string) => {
    const marker = (await store.get<{ id: string; sessionId: string; jobId: string }>('monitoring-asset', assetId));
    if (!marker || marker.jobId !== job.id || marker.sessionId !== job.sessionId) return;
    // A snapshot remains usable while a retained view or deck references it.
    for (const kind of ['display', 'display-history', 'deck']) if ((await store.list<unknown>(kind, job.sessionId)).some(record => referencedAssets(record).has(assetId))) return;
    (await store.delete('monitoring-asset', assetId)); (await store.delete('asset', assetId));
    (await store.db.prepare('DELETE FROM assets WHERE id=?').run(assetId));
  };
  return new Monitoring(store, {
    authorize: async (principal, sessionId, displayId, write) => {
      (await service.fullAccount(principal, write ? 'publish' : 'read'));
      (await service.access(principal, sessionId, write ? 'editor' : 'viewer'));
      if (displayId) (await service.display(principal, sessionId, displayId, write ? 'editor' : 'viewer'));
    },
    inspect,
    validate: async (owner, sessionId, view) => (await service.verifyView((await monitoringPrincipal(service, owner, sessionId)), sessionId, view)),
    publish: async (job, view, health, claimGeneration = false) => {
      const lease = (await inspect(job.owner, job.sessionId, job.displayId));
      if (lease.generation !== job.lease.generation || lease.revision !== job.lease.revision || lease.configRevision !== job.lease.configRevision || lease.held !== job.lease.held) return null;
      const principal = (await monitoringPrincipal(service, job.owner, job.sessionId));
      const display = (await service.display(principal, job.sessionId, job.displayId, 'editor'));
      if (claimGeneration) {
        if (display.held || display.generation >= Number.MAX_SAFE_INTEGER) return null;
        // Starting a monitor is newer intent even before its first sample arrives.
        // Retain the last visible view/revision, but supersede older accepted rendering.
        display.generation++; display.updatedAt = now();
      }
      if (view) {
        if (display.held || display.revision >= Number.MAX_SAFE_INTEGER || display.generation >= Number.MAX_SAFE_INTEGER) return null;
        const verified: ViewSpec = (await service.verifyView(principal, job.sessionId, view));
        (await service.history.ensure(display));
        if (!participationCompatible(display.view, verified)) display.interactionEpoch = id();
        display.view = verified; display.revision++; display.generation++; display.updatedAt = now();
        display.targetAgentId = job.owner.agentId;
        display.delivery = { revision: display.revision, status: 'pending', updatedAt: now() };
        (await store.put('display', display)); (await service.history.record(display, 'monitoring'));
      }
      display.monitoring = health; (await store.put('display', display));
      // The timeline is bounded; reclaim only no-longer-referenced derivatives.
      for (const marker of (await store.list<{id:string;sessionId:string;jobId:string}>('monitoring-asset', job.sessionId))) { const ownerJob = (await store.get<MonitoringJob>(MONITORING_DOCUMENT, marker.jobId)); if (ownerJob) (await releaseImage(ownerJob, marker.id)); }
      return { generation: display.generation, revision: display.revision, configRevision: lease.configRevision, held: display.held };
    },
    changed: async (sessionId, displayId) => store.atomic(async () => {
      const display = (await store.get<Awaited<ReturnType<KanvasService['display']>>>('display', displayId));
      const tracked = display?.monitoring && (await store.get<MonitoringJob>(MONITORING_DOCUMENT, display.monitoring.jobId));
      if (display && tracked?.status === 'stopped') {
        if (display.revision === tracked.lease.revision && display.generation === tracked.lease.generation) display.monitoring = tracked.health;
        else delete display.monitoring;
        (await store.put('display', display));
      }
      service.emit({ type: 'display', sessionId, displayId, data: { monitoring: true } });
    }),
    storeImage: async (job, image) => {
      (await monitoringPrincipal(service, job.owner, job.sessionId));
      const media = validateMedia({ name: `Monitoring snapshot ${job.id}`, mimeType: image.mimeType, base64: image.bytes.toString('base64') });
      if ((await store.list<AssetRecord>('asset', job.sessionId)).reduce((total, asset) => total + asset.size, 0) + media.size > 200 * 1024 * 1024) throw new AppError('LIMIT_REACHED', 'The session media storage limit was reached.', 429);
      const asset: AssetRecord = { id: id(), sessionId: job.sessionId, name: media.name, mimeType: media.mimeType, size: media.size, url: '', createdAt: now() };
      asset.url = `/api/assets/${asset.id}`;
      (await store.put('asset', asset)); (await store.put('monitoring-asset', { id: asset.id, sessionId: job.sessionId, jobId: job.id }));
      (await store.db.prepare('INSERT INTO assets VALUES(?,?)').run(asset.id, media.bytes));
      return { id: asset.id, url: asset.url };
    },
    releaseImage,
  }, options);
}
