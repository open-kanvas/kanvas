import type { ServerEvent, ServerEventBus } from '@modelcontextprotocol/server';
import type { Principal, SessionEvent } from '../../shared/types.js';
import { descriptors, eventResourceUris, SESSION_INDEX_URI } from './resources.js';
import type { McpService } from './types.js';

export function principalKey(principal: Principal): string {
  return JSON.stringify([
    principal.userId, principal.agentId ?? null, principal.tokenId ?? null,
    [...(principal.scopes ?? [])].sort(),
  ]);
}

export interface SubscriptionScope {
  principal: Principal;
  authorize(): Promise<Principal>;
  watchedUris: Set<string>;
  watchList: boolean;
  knownResources: string;
  disconnect(): void;
}

export async function resourceFingerprint(service: McpService, principal: Principal): Promise<string> {
  return descriptors(await service.listResources(principal)).map(item => item.uri).join('\n');
}

/**
 * Coalesce wakeups, not durable actions. State and interaction records live in
 * the domain. Only URI invalidations cross the wire, after a fresh ACL check.
 */
export class ScopedSubscription {
  private active = true;
  private scheduled = false;
  private readonly pending = new Set<string>();
  private listDirty = false;
  private indexDirty = false;
  private authCheck?: Promise<Principal | undefined>;
  private readonly unsubscribe: () => void;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly service: McpService,
    private readonly scope: SubscriptionScope,
    private readonly deliver: (event: ServerEvent) => void | Promise<void>,
    authRecheckMs: number,
  ) {
    this.unsubscribe = service.subscribe(scope.principal, event => this.onDomainEvent(event));
    this.timer = setInterval(() => { void this.reauthorize(); }, authRecheckMs);
    this.timer.unref();
  }

  private reauthorize(): Promise<Principal | undefined> {
    if (this.authCheck) return this.authCheck;
    this.authCheck = (async () => {
      try {
        const principal = await this.scope.authorize();
        if (!this.active) return undefined;
        if (principalKey(principal) !== principalKey(this.scope.principal)) throw new Error('Identity changed');
        return principal;
      } catch {
        if (this.active) {
          this.close();
          this.scope.disconnect();
        }
        return undefined;
      } finally {
        this.authCheck = undefined;
      }
    })();
    return this.authCheck;
  }

  private onDomainEvent(event: SessionEvent): void {
    if (!this.active) return;
    for (const uri of eventResourceUris(event)) {
      if (this.scope.watchedUris.has(uri)) this.pending.add(uri);
    }
    // A list delta is computed from this principal's own current resource list;
    // an event for an inaccessible session cannot announce its identity.
    if (event.type === 'membership' || event.type === 'ended' || event.type === 'config') {
      this.listDirty ||= this.scope.watchList;
      this.indexDirty ||= this.scope.watchedUris.has(SESSION_INDEX_URI);
    }
    this.schedule();
  }

  publish(event: ServerEvent): void {
    if (!this.active) return;
    if (event.kind === 'resource_updated' && this.scope.watchedUris.has(event.uri)) this.pending.add(event.uri);
    if (event.kind === 'resources_list_changed') {
      this.listDirty ||= this.scope.watchList;
      this.indexDirty ||= this.scope.watchedUris.has(SESSION_INDEX_URI);
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled || (!this.pending.size && !this.listDirty && !this.indexDirty)) return;
    this.scheduled = true;
    queueMicrotask(() => { void this.flush(); });
  }

  private async flush(): Promise<void> {
    try {
      while (this.active && (this.pending.size || this.listDirty || this.indexDirty)) {
        const principal = await this.reauthorize();
        if (!principal) return;
        const uris = [...this.pending];
        this.pending.clear();
        const checkList = this.listDirty || this.indexDirty;
        this.listDirty = false;
        this.indexDirty = false;
        if (checkList) {
          try {
            const next = await resourceFingerprint(this.service, principal);
            if (!this.active) return;
            if (!(await this.reauthorize())) return;
            if (next !== this.scope.knownResources) {
              this.scope.knownResources = next;
              if (this.scope.watchList) await this.deliver({ kind: 'resources_list_changed' });
              if (this.scope.watchedUris.has(SESSION_INDEX_URI)) uris.push(SESSION_INDEX_URI);
            }
          } catch {
            // No list or error details are exposed when authorization changes.
          }
        }
        for (const uri of new Set(uris)) {
          if (!this.active || !this.scope.watchedUris.has(uri)) continue;
          try {
            // Re-check authorization on the resource itself, even if the
            // domain event source was originally authorized or misfiltered.
            await this.service.readResource(uri, principal);
          } catch {
            continue;
          }
          if (!(await this.reauthorize())) return;
          if (this.active && this.scope.watchedUris.has(uri)) await this.deliver({ kind: 'resource_updated', uri });
        }
      }
    } catch {
      // Stream/send failures never become unhandled rejections or disclose
      // event payloads. The client must re-subscribe and read current state.
      if (this.active) {
        this.close();
        this.scope.disconnect();
      }
    } finally {
      this.scheduled = false;
      if (this.active) this.schedule();
    }
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.timer);
    this.pending.clear();
    try { this.unsubscribe(); } catch { /* cleanup is idempotent */ }
  }
}

/** SDK owns ACK-first, filter matching, ID stamping, and cancellation. */
export class AuthorizedEventBus implements ServerEventBus {
  private readonly subscriptions = new Set<ScopedSubscription>();

  constructor(
    private readonly service: McpService,
    private readonly currentScope: () => SubscriptionScope,
    private readonly authRecheckMs: number,
  ) {}

  subscribe(listener: (event: ServerEvent) => void): () => void {
    const subscription = new ScopedSubscription(this.service, this.currentScope(), listener, this.authRecheckMs);
    this.subscriptions.add(subscription);
    return () => {
      this.subscriptions.delete(subscription);
      subscription.close();
    };
  }

  publish(event: ServerEvent): void {
    for (const subscription of this.subscriptions) subscription.publish(event);
  }

  close(): void {
    for (const subscription of this.subscriptions) subscription.close();
    this.subscriptions.clear();
  }
}
