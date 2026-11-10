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

export interface ToolInvocation {/** Canonical operation name, for account bookkeeping only; never stored in the tool log. */canonical?:string;rawOnly?:boolean;displayId?:string;errorCode?:string;clientContext?:Record<string,unknown>;id:string;tool:string;operation?:string;sessionId?:string;timestamp:string;status:'completed'|'failed';durationMs:number}
/** The domain owns account, role, scope, revision, and session checks. */
export interface McpService {
  argumentError?(name:string,args:Record<string,unknown>,principal:Principal,error:unknown):Promise<unknown>;
  customTemplateCatalog?(principal:Principal):Promise<import('./discovery.js').CatalogItem[]>;
  resolveIntent?(principal:Principal,args:unknown):Promise<unknown>;
  agentGuidance?(principal:Principal,args?:unknown):Promise<unknown>;
  /** One finished call as names, classes and numbers; never content. */
  recordFriction?(call:import('../friction.js').FrictionCall):void;
  /** Observable state that decides which repeated blocks a response carries. */
  responseContext?(principal:Principal,args:unknown,connectionId:string,failed?:boolean):Promise<import('./response-policy.js').ResponseContext>;
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
  /** Product website published in MCP server information; false or '' omits it. Defaults to KANVAS_WEBSITE_URL, then the project site. */
  websiteUrl?: string | false;
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
