import { parseDiscoveryInput } from './discovery.js';
import { guidanceContext } from './active-context.js';
import { discoveryToolDefinitions, discoveryResult, isDiscoveryTool } from './discovery.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Express, type Request, type Response } from 'express';
import {
  createMcpHandler, isInitializeRequest, isLegacyRequest, ProtocolError, Server,
  validateHostHeader, type ServerEvent,
} from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport, toNodeHandler, toWebRequest } from '@modelcontextprotocol/node';
import { listToolDefinitions, resolveToolCall } from './catalog.js';
import {
  descriptors, pageResources, requireResourceUri, RESOURCE_TEMPLATES, SESSION_INDEX_URI, validResourceUri,
} from './resources.js';
import { resourceFailure, resourceText, safeError, toolFailure, toolSuccess } from './results.js';
import {
  AuthorizedEventBus, principalKey, resourceFingerprint, ScopedSubscription, type SubscriptionScope,
} from './subscriptions.js';
import type { McpMount, McpOptions, McpService, Principal } from './types.js';
import { profileDescription, profileInstructions, profileResourceData } from './profile-guidance.js';
import { READ_ONLY_CANONICAL, mcpProfile, profileScope, publicGuidanceText } from './operations.js';
import { inToolContext } from './call-context.js';
import { KANVAS_VERSION } from '../../shared/version.js';

export type { McpMount, McpOptions, McpService, Principal, McpResourceDescriptor } from './types.js';
export { MCP_TOOL_NAMES } from './catalog.js';

const SERVER_INFO = { name: 'kanvas', version: KANVAS_VERSION };
const LEGACY_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];

interface RequestContext extends SubscriptionScope {
  request: Request;
}

interface LegacySession {
  server: Server;
  transport: NodeStreamableHTTPServerTransport;
  scope: SubscriptionScope;
  subscription?: ScopedSubscription;
  lastSeen: number;
  closed: boolean;
  close(): Promise<void>;
}

function httpError(req: Request, res: Response, status: number, message: string, rpcCode = -32600): void {
  const id = req.body && !Array.isArray(req.body) && (typeof req.body.id === 'string' || typeof req.body.id === 'number') ? req.body.id : null;
  res.status(status).json({ jsonrpc: '2.0', id, error: { code: rpcCode, message } });
}

function metadataChallenge(value: unknown): string {
  if (typeof value === 'string') {
    try {
      const url = new URL(value);
      if (/^https?:$/.test(url.protocol) && !url.username && !url.password) {
        return `Bearer resource_metadata="${url.href}", scope="read publish"`;
      }
    } catch { /* absence of configured OAuth metadata does not bypass auth */ }
  }
  return 'Bearer realm="kanvas"';
}

function validOrigin(req: Request, allowedOrigins?: string[]): boolean {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) return false;
    return allowedOrigins ? allowedOrigins.includes(origin) : origin === `${req.protocol}://${req.get('host')}`;
  } catch {
    return false;
  }
}

function authorizationSnapshot(req: Request): Request {
  // Long-lived subscriptions must not retain req.body (potentially a large
  // dataset/asset), its response, or arbitrary cookie content. The service's
  // publisher authorization contract is bearer + request metadata only.
  const snapshot = Object.create(Object.getPrototypeOf(req)) as Request;
  snapshot.headers = {
    authorization: req.get('authorization'), host: req.get('host'), origin: req.get('origin'),
  };
  snapshot.method = req.method;
  snapshot.url = req.path;
  snapshot.originalUrl = req.path;
  for (const key of ['ip', 'protocol', 'hostname', 'secure'] as const) {
    Object.defineProperty(snapshot, key, { value: req[key], enumerable: true });
  }
  return snapshot;
}

/** Mount one authenticated endpoint; the SDK classifies and serves each protocol era. */
export function mountMcp(app: Express, service: McpService, options: McpOptions = {}): McpMount {
  const path = options.path ?? '/mcp';
  mcpProfile(options.profile); // Validate historical settings; the wire contract is always discovery.
  const allowedHosts: string[] = options.allowedHosts ?? app.locals.mcpAllowedHosts ?? ['localhost', '127.0.0.1', '[::1]'];
  const allowedOrigins: string[] | undefined = options.allowedOrigins ?? app.locals.mcpAllowedOrigins;
  const metadataUrl=options.resourceMetadataUrl ?? app.locals.mcpResourceMetadataUrl;
  const challenge = metadataChallenge(metadataUrl);
  const icons=typeof metadataUrl==='string'?[{src:new URL('/icons/kanvas-192.png?v='+KANVAS_VERSION,metadataUrl).href,mimeType:'image/png',sizes:['192x192']},{src:new URL('/favicon.svg?v='+KANVAS_VERSION,metadataUrl).href,mimeType:'image/svg+xml',sizes:['any']}]:undefined;
  const maxLegacySessions = options.maxLegacySessions ?? 256;
  const maxPerPrincipal = options.maxSessionsPerPrincipal ?? 16;
  const idleMs = options.legacySessionIdleMs ?? 30 * 60 * 1000;
  const authRecheckMs = options.authRecheckMs ?? 30000;
  const requests = new AsyncLocalStorage<RequestContext>();
  const sessions = new Map<string, LegacySession>();
  const initializing = new Map<string, number>();
  const modernSubscriptions = new Map<string, number>();
  const toolDefinitions = discoveryToolDefinitions();
  let closing = false;

  const current = (): RequestContext => {
    const context = requests.getStore();
    if (!context) throw new ProtocolError(-32603, 'Missing authorized request context.');
    return context;
  };

  const makeServer = (legacy?: LegacySession): Server => {
    const server = new Server({ ...SERVER_INFO,title:'Kanvas',...(icons?{icons}:{}), description: profileDescription('discovery') }, {
      capabilities: { tools: {}, resources: { subscribe: true, listChanged: true } },
      instructions: profileInstructions('discovery'),
      supportedProtocolVersions: LEGACY_PROTOCOL_VERSIONS,
    });
    // Explicitly no logging/sampling/elicitation capability: this adapter does
    // not request model turns or place credentials into model-visible forms.
    server.onerror = () => {};
    server.setRequestHandler('tools/list', async () => ({ tools: toolDefinitions }));
    server.setRequestHandler('tools/call', async (request, extra) => {
      const outer=request.params.arguments??{};
      const guidanceArgs=guidanceContext(request.params.name,outer);
      const decorate=async<T extends {content:unknown[];structuredContent?:unknown}>(result:T):Promise<T>=>{
        let guidance:unknown;
        try{guidance=await service.agentGuidance?.(current().principal,guidanceArgs);}catch{/* Never replace the primary result. */}
        if(!guidance)return result;
        const structuredContent=result.structuredContent&&typeof result.structuredContent==='object'?{...result.structuredContent,agentGuidance:guidance}:undefined;
        let mirrored=false;
        const content=result.content.map(item=>{
          const block=item as {type?:string;text?:string};
          if(!mirrored&&structuredContent&&block.type==='text'&&typeof block.text==='string'){
            try{if(JSON.stringify(JSON.parse(block.text))===JSON.stringify(result.structuredContent)){mirrored=true;return {...block,text:JSON.stringify(structuredContent)};}}catch{/* Plain-text discovery remains plain text. */}
          }
          return item;
        });
        // Keep existing structured/text JSON mirrors consistent. Plain-text
        // catalog lists retain every original line and gain a separate block.
        if(!mirrored)content.push({type:'text',text:JSON.stringify({agentGuidance:guidance})});
        return {...result,content,...(structuredContent?{structuredContent}:{})};
      };

      if (isDiscoveryTool(request.params.name) && request.params.name !== 'kanvas_call') {
        return profileScope.run('discovery', async () => {
          const started=Date.now();let status:'completed'|'failed'='completed';
          try {
            if(outer.action==='resolve'){
              const input=parseDiscoveryInput('kanvas_discover',outer);
              if(!service.resolveIntent)throw new Error('Intent resolution unavailable.');
              const data=await service.resolveIntent(current().principal,input),result={data};
              return decorate({content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result});
            }
            return decorate(discoveryResult(request.params.name, request.params.arguments, { principal: current().principal, signal: extra.mcpReq.signal, privateTemplates:await service.customTemplateCatalog?.(current().principal) })); }
          catch (error) { status='failed';return decorate(toolFailure(error, undefined, 'discovery')); }
          finally{try{await service.recordToolCall?.(current().principal,{rawOnly:true,id:randomUUID(),tool:'kanvas_discover',operation:'discovery',timestamp:new Date(started).toISOString(),status,durationMs:Date.now()-started,clientContext:{userAgent:current().request.get('user-agent')?.slice(0,500),clientName:server.getClientVersion()?.name?.slice(0,240),clientVersion:server.getClientVersion()?.version?.slice(0,120),contextVerified:false}});}catch{/* Metadata failure never changes discovery. */}}
        });
      }
      const callProfile = 'discovery' as const;
      return profileScope.run(callProfile, async () => {
      const invocationId=randomUUID(),started=Date.now();
      const call = resolveToolCall(callProfile, request.params.name, request.params.arguments);
      const context = call.reference && call.canonicalName ? { ...call.reference, canonicalName: call.canonicalName,connectionId:current().request.get('mcp-session-id')??String(current().principal.agentId??current().principal.tokenId??'stateless'),inferred:{userAgent:current().request.get('user-agent')?.slice(0,500),clientName:server.getClientVersion()?.name?.slice(0,240),clientVersion:server.getClientVersion()?.version?.slice(0,120)} } : undefined;
      // A failed read is still read-only. Validation and execution errors must
      // not allocate diagnostic or lifecycle records in either profile.
      const mayRecordFailure = call.canonicalName !== undefined && !READ_ONLY_CANONICAL.has(call.canonicalName);
      const record=async(status:'completed'|'failed',result?:unknown,error?:unknown)=>{
        if(!call.canonicalName||!call.reference)return;
        const outer=request.params.arguments??{},raw=request.params.name==='kanvas_call'&&outer.arguments&&typeof outer.arguments==='object'?outer.arguments as Record<string,unknown>:outer,out=result as {id?:unknown;sessionId?:unknown;session?:{id?:unknown}}|undefined;
        const sessionId=typeof raw.sessionId==='string'?raw.sessionId:typeof out?.sessionId==='string'?out.sessionId:typeof out?.session?.id==='string'?out.session.id:call.canonicalName==='kanvas_session_create'&&typeof out?.id==='string'?out.id:undefined;
        try{await service.recordToolCall?.(current().principal,{rawOnly:status==='failed'&&READ_ONLY_CANONICAL.has(call.canonicalName),displayId:typeof raw.displayId==='string'?raw.displayId:undefined,errorCode:error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[A-Z_]{1,80}$/.test(error.code)?error.code:undefined,clientContext:{...context?.inferred,contextVerified:false},id:invocationId,tool:call.reference.tool,operation:call.reference.operation,sessionId,timestamp:new Date(started).toISOString(),status,durationMs:Date.now()-started});}catch{/* Instrumentation must never change the tool result. */}
      };
      if (call.error) {
        const raw = request.params.name === 'kanvas_call' ? (request.params.arguments?.arguments as Record<string, unknown> | undefined) ?? {} : request.params.arguments ?? {};
        let diagnosticId: string | undefined;
        try { if (mayRecordFailure) diagnosticId = await inToolContext(context, () => service.recordFailure?.(call.canonicalName!, raw, current().principal, call.error)); } catch { /* Preserve the original error. */ }
        await record('failed',undefined,call.error);
        let failure:unknown=call.error;try{if(call.canonicalName)failure=await service.argumentError?.(call.canonicalName,raw,current().principal,failure)??failure;}catch(error){failure=error;}
        return decorate(toolFailure(failure, diagnosticId, callProfile, call.canonicalName));
      }
      try {
        extra.mcpReq.signal.throwIfAborted();
        const result = await inToolContext(context, () => service.execute(call.canonicalName, call.args, current().principal, { signal: extra.mcpReq.signal }));
        await record('completed',result);
        return decorate(toolSuccess(result, call.args.sessionId, call.canonicalName, callProfile, call.args));
      } catch (error) {
        let diagnosticId: string | undefined;
        try { if (mayRecordFailure) diagnosticId = await inToolContext(context, () => service.recordFailure?.(call.canonicalName, call.args, current().principal, error)); } catch { /* Diagnostic failure must not replace this result. */ }
        await record('failed',undefined,error);
        return decorate(toolFailure(error, diagnosticId, callProfile, call.canonicalName));
      }
    });
    });
    server.setRequestHandler('resources/list', async request => {
      let resources;
      try { resources = descriptors(await service.listResources(current().principal)); }
      catch (error) { throw resourceFailure(error); }
      return pageResources(resources, request.params?.cursor);
    });
    server.setRequestHandler('resources/templates/list', async () => ({ resourceTemplates: RESOURCE_TEMPLATES.map(template => ({ ...template, ...(template.description ? { description: publicGuidanceText(template.description, 'discovery') } : {}) })) }));
    server.setRequestHandler('resources/read', async request => {
      const uri = requireResourceUri(request.params.uri);
      let value;
      try { value = await service.readResource(uri, current().principal); }
      catch (error) { throw resourceFailure(error); }
      return { contents: [{ uri, mimeType: 'application/json', text: profileScope.run('discovery', () => resourceText(profileResourceData(uri, value, 'discovery'), 'discovery')) }] };
    });
    server.setRequestHandler('resources/subscribe', async request => {
      if (!legacy) throw new ProtocolError(-32601, 'Use subscriptions/listen for this protocol revision.');
      const uri = requireResourceUri(request.params.uri);
      try { await service.readResource(uri, current().principal); }
      catch (error) { throw resourceFailure(error); }
      if (legacy.scope.watchedUris.size >= 64 && !legacy.scope.watchedUris.has(uri)) {
        throw new ProtocolError(-32602, 'Resource subscription limit reached.');
      }
      legacy.scope.watchedUris.add(uri);
      return {};
    });
    server.setRequestHandler('resources/unsubscribe', async request => {
      if (!legacy) throw new ProtocolError(-32601, 'Cancel the subscriptions/listen stream for this protocol revision.');
      legacy.scope.watchedUris.delete(requireResourceUri(request.params.uri));
      return {};
    });
    return server;
  };

  const eventBus = new AuthorizedEventBus(service, current, authRecheckMs);
  const modern = createMcpHandler(() => makeServer(), {
    legacy: 'reject', bus: eventBus, maxSubscriptions: options.maxSubscriptions ?? 256,
    onerror: () => {},
  });
  const handleModern = toNodeHandler(modern, { onerror: () => {} });

  const newLegacySession = async (context: RequestContext): Promise<LegacySession> => {
    const scope: SubscriptionScope = {
      principal: context.principal,
      authorize: context.authorize,
      watchedUris: new Set(), watchList: true,
      knownResources: await resourceFingerprint(service, context.principal),
      disconnect: () => { void entry.close(); },
    };
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: id => { sessions.set(id, entry); },
      onsessionclosed: () => { void entry.close(); },
      enableJsonResponse: true,
      supportedProtocolVersions: LEGACY_PROTOCOL_VERSIONS,
    });
    const entry: LegacySession = {
      server: undefined as unknown as Server,
      transport, scope, lastSeen: Date.now(), closed: false,
      close: async () => {
        if (entry.closed) return;
        entry.closed = true;
        if (transport.sessionId) sessions.delete(transport.sessionId);
        entry.subscription?.close();
        await entry.server.close().catch(() => {});
      },
    };
    entry.server = makeServer(entry);
    entry.server.onclose = () => {
      entry.closed = true;
      if (transport.sessionId) sessions.delete(transport.sessionId);
      entry.subscription?.close();
    };
    await entry.server.connect(transport);
    const deliver = async (event: ServerEvent): Promise<void> => {
      if (entry.closed) return;
      if (event.kind === 'resource_updated') await entry.server.notification({ method: 'notifications/resources/updated', params: { uri: event.uri } });
      if (event.kind === 'resources_list_changed') await entry.server.notification({ method: 'notifications/resources/list_changed' });
    };
    entry.subscription = new ScopedSubscription(service, scope, deliver, authRecheckMs);
    return entry;
  };

  const expiryTimer = setInterval(() => {
    const now = Date.now();
    for (const entry of sessions.values()) {
      if (now - entry.lastSeen >= idleMs) void entry.close();
    }
  }, Math.min(idleMs, 60000));
  expiryTimer.unref();

  // A bounded local parser also works when mounted before a global parser.
  // If the parent has parsed the body already, Express leaves it intact.
  app.use(path, express.json({ limit: '12mb' }));
  app.all(path, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    if (closing) return httpError(req, res, 503, 'KANVAS MCP is shutting down.');
    if (!validateHostHeader(req.get('host'), allowedHosts).ok || !validOrigin(req, allowedOrigins)) {
      return httpError(req, res, 403, 'Origin or host is not allowed.');
    }
    const origin = req.get('origin');
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      res.set('Access-Control-Expose-Headers', 'MCP-Session-Id, MCP-Protocol-Version, WWW-Authenticate');
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID');
      res.status(204).end();
      return;
    }
    let principal: Principal;
    try {
      // Never accept browser cookies, a query credential, or an MCP session ID
      // as a publisher credential. Root verifies the bearer and its scopes.
      if (!/^Bearer\s+\S+$/i.test(req.get('authorization') ?? '')) throw { status: 401 };
      principal = await service.authorize(req);
      if (!principal?.userId) throw { status: 401 };
    } catch (error) {
      const forbidden = safeError(error).code === 'FORBIDDEN';
      if (!forbidden) res.set('WWW-Authenticate', challenge);
      return httpError(req, res, forbidden ? 403 : 401, forbidden ? 'Publisher access denied.' : 'Publisher authorization required.');
    }
    const authRequest = authorizationSnapshot(req);
    const context: RequestContext = {
      request: req, principal,
      authorize: () => service.authorize(authRequest),
      watchedUris: new Set(), watchList: false, knownResources: '',
      disconnect: () => { res.destroy(); },
    };
    await profileScope.run('discovery', () => requests.run(context, async () => {
      try {
        const request = await toWebRequest(req, req.body);
        if (!(await isLegacyRequest(request, req.body))) {
          // URI-level authorization is an application concern; the SDK owns
          // the version ladder and the full listen filter/protocol validation.
          if (req.body?.method === 'subscriptions/listen') {
            const identity = principalKey(principal);
            const count = modernSubscriptions.get(identity) ?? 0;
            if (count >= maxPerPrincipal) return httpError(req, res, 429, 'MCP subscription limit reached.');
            modernSubscriptions.set(identity, count + 1);
            try {
              const filter = req.body?.params?.notifications;
              const uris: unknown = filter?.resourceSubscriptions;
              if (Array.isArray(uris)) {
                if (uris.length > 64 || uris.some(uri => !validResourceUri(uri))) {
                  return httpError(req, res, 400, 'Invalid resource subscription filter.', -32602);
                }
                for (const uri of uris as string[]) {
                  try { await service.readResource(uri, principal); }
                  catch { return httpError(req, res, 403, 'A requested resource is unavailable to this publisher.', -32602); }
                  context.watchedUris.add(uri);
                }
              }
              context.watchList = filter?.resourcesListChanged === true;
              if (context.watchList || context.watchedUris.has(SESSION_INDEX_URI)) {
                context.knownResources = await resourceFingerprint(service, principal);
              }
              return await handleModern(req, res, req.body);
            } finally {
              const remaining = (modernSubscriptions.get(identity) ?? 1) - 1;
              if (remaining > 0) modernSubscriptions.set(identity, remaining);
              else modernSubscriptions.delete(identity);
            }
          }
          return await handleModern(req, res, req.body);
        }

        const sessionId = req.get('mcp-session-id');
        if (sessionId) {
          const entry = sessions.get(sessionId);
          if (!entry || entry.closed || principalKey(entry.scope.principal) !== principalKey(principal)) {
            return httpError(req, res, 404, 'MCP session is unavailable. Reinitialize with the authorized identity.');
          }
          entry.lastSeen = Date.now();
          Object.assign(entry.scope.principal, principal);
          entry.scope.authorize = context.authorize;
          return await entry.transport.handleRequest(req, res, req.body);
        }
        if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
          return httpError(req, res, 400, 'Initialize the legacy MCP connection first.');
        }
        const identity = principalKey(principal);
        const owned = [...sessions.values()].filter(entry => principalKey(entry.scope.principal) === identity).length;
        const pending = [...initializing.values()].reduce((total, count) => total + count, 0);
        const ownedPending = initializing.get(identity) ?? 0;
        if (sessions.size + pending >= maxLegacySessions || owned + ownedPending >= maxPerPrincipal) {
          return httpError(req, res, 429, 'MCP connection limit reached.');
        }
        // Reserve before the first await: concurrent initialize requests must
        // not race past the capacity check.
        initializing.set(identity, ownedPending + 1);
        let entry: LegacySession | undefined;
        try {
          entry = await newLegacySession(context);
          await entry.transport.handleRequest(req, res, req.body);
        } finally {
          const remaining = (initializing.get(identity) ?? 1) - 1;
          if (remaining > 0) initializing.set(identity, remaining);
          else initializing.delete(identity);
          if (entry && (!entry.transport.sessionId || res.statusCode >= 400)) await entry.close();
        }
      } catch {
        if (!res.headersSent) httpError(req, res, 500, 'KANVAS MCP could not complete this request.', -32603);
        else res.destroy();
      }
    }));
  });

  const parserError: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error && typeof error === 'object' && error.status === 413 ? 413 : 400;
    httpError(req, res, status, status === 413 ? 'MCP request body exceeds the size limit.' : 'Malformed MCP request body.', status === 413 ? -32600 : -32700);
  };
  app.use(path, parserError);

  return {
    close: async () => {
      if (closing) return;
      closing = true;
      clearInterval(expiryTimer);
      await modern.close();
      eventBus.close();
      await Promise.all([...sessions.values()].map(entry => entry.close()));
      sessions.clear();
    },
  };
}
