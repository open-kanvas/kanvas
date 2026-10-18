import type { Request } from 'express';
import type { Principal, SessionEvent } from '../../shared/types.js';
import type { McpProfile } from './operations.js';

export type { Principal } from '../../shared/types.js';

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ToolInvocation {id:string;tool:string;operation?:string;sessionId?:string;timestamp:string;status:'completed'|'failed';durationMs:number}
/** The domain owns account, role, scope, revision, and session checks. */
export interface McpService {
  argumentError?(name:string,args:Record<string,unknown>,principal:Principal,error:unknown):Promise<unknown>;
  customTemplateCatalog?(principal:Principal):Promise<import('./discovery.js').CatalogItem[]>;
  agentGuidance?(principal:Principal,args?:unknown):Promise<unknown>;
  authorize(request: Request): Promise<Principal>;
  execute(name: string, args: Record<string, unknown>, principal: Principal, context?: { signal?: AbortSignal }): Promise<unknown>;
  /** Optional content-free correlation record; never receives an unauthenticated call. */
  recordFailure?(name: string, args: Record<string, unknown>, principal: Principal, error: unknown): string | undefined | Promise<string | undefined>;
  recordToolCall?(principal:Principal,event:ToolInvocation):void | Promise<void>;
  readResource(uri: string, principal: Principal): Promise<unknown>;
  listResources(principal: Principal): Promise<McpResourceDescriptor[]>;
  subscribe(principal: Principal, listener: (event: SessionEvent) => void): () => void;
}

export interface McpOptions {
  /** Immutable deployment setting; transport protocol and OAuth scope are independent. */
  profile?: McpProfile;
  path?: string;
  /** Hostnames, not URLs; ports do not grant a separate hostname. */
  allowedHosts?: string[];
  /** Exact origins, including scheme and port. Absent means same-origin only. */
  allowedOrigins?: string[];
  resourceMetadataUrl?: string;
  maxLegacySessions?: number;
  maxSessionsPerPrincipal?: number;
  maxSubscriptions?: number;
  legacySessionIdleMs?: number;
  authRecheckMs?: number;
}

export interface McpMount {
  /** Stops subscription streams and frees retained legacy transports. */
  close(): Promise<void>;
}
