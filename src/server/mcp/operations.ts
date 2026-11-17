import {CANONICAL_TOOLS,type Definition} from './canonical.js';
import type {Tool} from '@modelcontextprotocol/server';
import type {McpService,Principal} from './types.js';

/** The transport is independent of catalog grouping. There are exactly two tools. */
export type McpProfile = 'discovery';
export const DISCOVERY_TOOL_NAMES = Object.freeze(['kanvas_discover', 'kanvas_call'] as const);
export function mcpProfile(value: unknown = 'discovery'): McpProfile {
  // Previously accepted deployment settings already advertised these same two tools.
  // Accepting the setting does not install a callable alias or a second registry.
  if (!['discovery', 'domains', 'twelve', 'legacy'].includes(String(value))) throw new Error('KANVAS_MCP_PROFILE must be discovery.');
  return 'discovery';
}
export interface ToolReference { tool: 'kanvas_call'; operation: string }
export interface Operation {
  readonly id: string;
  readonly domain: string;
  readonly schema: Definition['schema'];
  readonly annotations: NonNullable<Tool['annotations']>;
  readonly scopes: readonly string[];
  readonly definition: Definition;
  execute(service: McpService, args: Record<string, unknown>, principal: Principal, context?: { signal?: AbortSignal }): Promise<unknown>;
}
const CATALOG_DEFINITIONS = new Set(['kanvas.help', 'kanvas.guide', 'kanvas.template.get']);
let registry: ReadonlyMap<string, Operation> | undefined;
/** Lazily assembled once to keep domain module initialization acyclic. Definitions
 * own IDs, schemas, discovery metadata and scopes; no generated name translation. */
export function operationTable(): ReadonlyMap<string, Operation> {
  if (registry) return registry;
  const entries = CANONICAL_TOOLS.filter(definition => !CATALOG_DEFINITIONS.has(definition.name)).map(definition => {
    const id = definition.name;
    const operation: Operation = Object.freeze({
      id, domain: definition.domain, schema: definition.schema, definition,
      annotations: Object.freeze({ readOnlyHint: definition.readOnly ?? false, destructiveHint: definition.destructive ?? false, idempotentHint: definition.idempotent ?? definition.readOnly ?? false, openWorldHint: definition.openWorld ?? false }),
      scopes: Object.freeze([definition.requiredScope]),
      execute: (service: McpService, args: Record<string, unknown>, principal: Principal, context?: { signal?: AbortSignal }) => service.execute(id, args, principal, context),
    });
    return [id, operation] as const;
  });
  if (new Set(entries.map(([id]) => id)).size !== entries.length || entries.some(([id, operation]) => !/^kanvas\.[a-z0-9]+(?:\.[a-z0-9]+)*$/.test(id) || !operation.domain || !operation.scopes.length)) throw new Error('Invalid or duplicate public operation definition.');
  return registry = new Map(entries);
}
export const operationId = (id: string): string => id;
export function publicReference(id: string, _profile?: McpProfile): ToolReference | undefined { return operationTable().has(id) ? { tool: 'kanvas_call', operation: id } : undefined; }
export function operationEntry(tool: string, operation: unknown): { canonical: string; tool: 'kanvas_call'; operation: string } | undefined {
  return tool === 'kanvas_call' && typeof operation === 'string' && operationTable().has(operation) ? { canonical: operation, tool, operation } : undefined;
}
export const isReadOnlyOperation = (id: string): boolean => operationTable().get(id)?.scopes[0] === 'read';
export const toolNames = (_profile?: McpProfile): readonly string[] => DISCOVERY_TOOL_NAMES;
export const operationEntries = (_profile?: McpProfile) => [...operationTable().values()].map(({ id }) => ({ canonical: id, operation: id, tool: 'kanvas_call' as const }));
/** Authored guidance already names the public interface. Never rewrite source data. */
export const publicGuidanceText = (text: string, _profile?: McpProfile): string => text;
export const discoveryGuidanceText = publicGuidanceText;
/** Format an authored operation recipe, not a legacy tool/profile adapter. */
export function discoveryExample<T>(example: T): T {
  if (!example || typeof example !== 'object' || Array.isArray(example)) return example;
  const input = example as Record<string, unknown>;
  if (input.tool === 'kanvas_call' || input.tool === 'kanvas_discover') return example;
  if (typeof input.tool !== 'string') return example;
  const args = input.arguments && typeof input.arguments === 'object' && !Array.isArray(input.arguments) ? input.arguments as Record<string, unknown> : Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'tool'));
  if (input.tool === 'kanvas.template.get') return { ...input, tool: 'kanvas_discover', arguments: { catalog: 'templates', action: 'get', id: `kanvas.template.${args.template}` } } as T;
  if (input.tool === 'kanvas.help' || input.tool === 'kanvas.guide') return { ...input, tool: 'kanvas_discover', arguments: { catalog: 'help', action: 'search', query: String(args.topic ?? 'getting started') } } as T;
  if (!operationTable().has(input.tool)) return example;
  return { ...input, tool: 'kanvas_call', arguments: { operationId: input.tool, arguments: args } } as T;
}
export const publicExample = <T>(example: T, _profile?: McpProfile): T => discoveryExample(example);
