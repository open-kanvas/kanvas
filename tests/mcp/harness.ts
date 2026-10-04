import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Request } from 'express';
import { mountMcp, type McpOptions, type McpService, type Principal } from '../../src/server/mcp/index.js';
import type { SessionEvent } from '../../src/shared/types.js';

type Json = Record<string, unknown>;
interface TestSession {
  id: string;
  name: string;
  members: Set<string>;
  config: Json;
  revision: number;
  displays: Json[];
  interactions: Json[];
}

export class DomainFixture implements McpService {
  recordToolCall?: McpService['recordToolCall'];
  recordFailure?: McpService['recordFailure'];
  readonly tokens = new Map<string, Principal>();
  readonly listeners = new Set<(event: SessionEvent) => void>();
  readonly calls: { name: string; args: Json; userId: string }[] = [];
  readonly sessions = new Map<string, TestSession>();
  readonly updates = new Map<string, Json>();
  readonly privateErrorMarker = randomBytes(32).toString('hex');
  failWithPrivateError = false;
  oversizedResult = false;
  authorizeCount = 0;

  constructor() {
    this.createSession('alpha', 'owner');
    this.createSession('beta', 'other');
  }

  issue(userId: string, agentId = 'agent-a', scopes = ['read', 'publish']): string {
    const bearer = randomBytes(32).toString('base64url');
    this.tokens.set(bearer, { userId, agentId, scopes, tokenId: randomUUID() });
    return bearer;
  }

  async authorize(request: Request): Promise<Principal> {
    this.authorizeCount++;
    const bearer = request.get('authorization')?.replace(/^Bearer\s+/i, '');
    const principal = bearer ? this.tokens.get(bearer) : undefined;
    if (!principal) throw Object.assign(new Error(this.privateErrorMarker), { status: 401 });
    return principal;
  }

  createSession(id: string, userId: string, name = id): TestSession {
    const session: TestSession = {
      id, name, members: new Set([userId]), config: { theme: 'dark', },
      revision: 0, displays: [], interactions: [],
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(sessionId: unknown, principal: Principal): TestSession {
    const session = this.sessions.get(String(sessionId));
    if (!session || !session.members.has(principal.userId)) throw Object.assign(new Error(this.privateErrorMarker), { status: 404 });
    return session;
  }

  private inbox(session: TestSession, principal: Principal): Json[] {
    return session.interactions.filter(item => !item.targetAgentId || item.targetAgentId === principal.agentId);
  }

  async execute(name: string, args: Json, principal: Principal, _context?: { signal?: AbortSignal }): Promise<unknown> {
    this.calls.push({ name, args, userId: principal.userId });
    if (this.failWithPrivateError) throw new Error(`Provider diagnostic ${this.privateErrorMarker}`);
    if (this.oversizedResult) return { id: 'accepted-result', rows: Array.from({ length: 3000 }, (_, n) => ({ n, body: 'x'.repeat(1000) })) };
    if (name === 'kanvas_sessions_list') return [...this.sessions.values()].filter(s => s.members.has(principal.userId)).map(s => ({ id: s.id, name: s.name }));
    if (name === 'kanvas_session_create') {
      if (!principal.scopes?.includes('publish')) throw { status: 403 };
      const session = this.createSession(randomUUID(), principal.userId, String(args.name));
      this.emit({ type: 'config', sessionId: session.id });
      return { id: session.id, name: session.name };
    }
    const session = this.getSession(args.sessionId, principal);
    const readOnly = ['kanvas_session_state', 'kanvas_update_status', 'kanvas_interactions_read', 'kanvas_presentations_list'];
    if (!readOnly.includes(name) && !principal.scopes?.includes('publish')) throw { status: 403 };
    if (name === 'kanvas_session_state') return this.readResource(`kanvas://sessions/${session.id}/state`, principal);
    if (name === 'kanvas_display_register') {
      const display = { id: randomUUID(), sessionId: session.id, name: args.name, width: args.width, height: args.height, pixelRatio: args.pixelRatio ?? 1, revision: 0 };
      session.displays.push(display);
      this.emit({ type: 'display', sessionId: session.id, displayId: String(display.id) });
      return display;
    }
    if (name === 'kanvas_config_update') {
      if (args.expectedRevision !== session.revision) throw { status: 409, code: 'REVISION_CONFLICT' };
      session.config = { ...session.config, ...args.config as Json };
      session.revision++;
      this.emit({ type: 'config', sessionId: session.id, revision: session.revision });
      return { config: session.config, revision: session.revision };
    }
    if (name === 'kanvas_submit') {
      const target = args.displayIds as string[];
      if (target.some(id => !session.displays.some(d => d.id === id))) throw { status: 404 };
      const existing = [...this.updates.values()].find(update => update.requestId === args.requestId && update.sessionId === session.id);
      if (existing) return existing;
      const update = { id: randomUUID(), requestId: args.requestId, sessionId: session.id, displayIds: target, status: 'accepted' };
      this.updates.set(update.id, update);
      return update;
    }
    if (name === 'kanvas_update_status') {
      const update = args.updateId ? this.updates.get(String(args.updateId)) : [...this.updates.values()].find(u => u.requestId === args.requestId && u.sessionId === session.id);
      if (!update || update.sessionId !== session.id) throw { status: 404 };
      return update;
    }
    if (name === 'kanvas_interactions_read') {
      const all = this.inbox(session, principal);
      const after = args.afterId ? all.findIndex(item => item.id === args.afterId) + 1 : 0;
      const items = all.slice(after).filter(item => args.status === 'all' || item.status === (args.status ?? 'pending'));
      return { interactions: items.slice(0, Number(args.limit ?? 25)) };
    }
    if (name === 'kanvas_interaction_ack') {
      const item = this.inbox(session, principal).find(item => item.id === args.interactionId);
      if (!item) throw { status: 404 };
      item.status = 'acknowledged';
      this.emit({ type: 'interaction', sessionId: session.id });
      return item;
    }
    return { accepted: true, operation: name, sessionId: session.id };
  }

  async readResource(uri: string, principal: Principal): Promise<unknown> {
    if (uri === 'kanvas://sessions') return this.execute('kanvas_sessions_list', {}, principal);
    const match = /^kanvas:\/\/sessions\/([^/]+)\/(state|config|interactions)$/.exec(uri);
    if (!match) throw { status: 404 };
    const session = this.getSession(match[1], principal);
    if (match[2] === 'config') return { sessionId: session.id, config: session.config, revision: session.revision };
    if (match[2] === 'interactions') return { sessionId: session.id, interactions: this.inbox(session, principal).filter(item => item.status === 'pending') };
    return { session: { id: session.id, name: session.name, config: session.config }, displays: session.displays, revision: session.revision };
  }

  async listResources(principal: Principal) {
    return [
      { uri: 'kanvas://sessions', name: 'Accessible sessions' },
      ...[...this.sessions.values()].filter(s => s.members.has(principal.userId)).flatMap(session => ['state', 'config', 'interactions'].map(kind => ({ uri: `kanvas://sessions/${session.id}/${kind}`, name: `${session.name} ${kind}` }))),
    ];
  }

  subscribe(_principal: Principal, listener: (event: SessionEvent) => void): () => void {
    // Deliberately unfiltered source: tests require the adapter's own fresh
    // resource authorization to prevent cross-session notification leakage.
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  emit(event: SessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  interact(sessionId: string, targetAgentId = 'agent-a'): string {
    const id = randomUUID();
    this.sessions.get(sessionId)!.interactions.push({ id, actionId: 'choice', status: 'pending', targetAgentId, value: 'yes', revision: 1 });
    this.emit({ type: 'interaction', sessionId });
    return id;
  }
}

export interface WireItem { method?: string; uri?: string; subscriptionId?: string | number; resultType?: string }

function observedFetch(wire: WireItem[]): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) return response;
    let buffer = '';
    const decoder = new TextDecoder();
    const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const message = JSON.parse(line.slice(6));
              wire.push({ method: message.method, uri: message.params?.uri, subscriptionId: message.params?._meta?.['io.modelcontextprotocol/subscriptionId'], resultType: message.result?.resultType });
            } catch { /* legacy priming frame may be empty */ }
          }
        }
        controller.enqueue(chunk);
      },
    }));
    return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

export async function harness(options: McpOptions = {}) {
  const service = new DomainFixture();
  const app = express();
  const methods: { method?: string; version?: string }[] = [];
  app.use(express.json({ limit: '12mb' }));
  app.use('/mcp', (req, _res, next) => {
    methods.push({ method: req.body?.method, version: req.body?.params?._meta?.['io.modelcontextprotocol/protocolVersion'] ?? req.body?.params?.protocolVersion });
    next();
  });
  app.locals.mcpResourceMetadataUrl = 'https://kanvas.example/.well-known/oauth-protected-resource/mcp';
  const mounted = mountMcp(app, service, { profile: 'legacy', authRecheckMs: 100, ...options });
  const server: HttpServer = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const clients: Array<Client | LegacyClient> = [];

  return {
    service, app, server, methods, url,
    headers(bearer: string): Record<string, string> { return { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }; },
    async modern(bearer: string, mode: 'auto' | 'pin' | 'legacy' = 'pin') {
      const wire: WireItem[] = [];
      const client = new Client({ name: 'kanvas-modern-protocol-test', version: '1' }, {
        versionNegotiation: { mode: mode === 'pin' ? { pin: '2026-07-28' } : mode },
      });
      client.onerror = () => {};
      const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${bearer}` } }, fetch: observedFetch(wire) });
      clients.push(client);
      await client.connect(transport);
      return { client, transport, wire };
    },
    async legacy(bearer: string) {
      const client = new LegacyClient({ name: 'kanvas-legacy-protocol-test', version: '1' });
      client.onerror = () => {};
      const transport = new LegacyTransport(url, { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } });
      clients.push(client);
      await client.connect(transport);
      return { client, transport };
    },
    async close() {
      await Promise.allSettled(clients.map(client => client.close()));
      await mounted.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
