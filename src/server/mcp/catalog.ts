import {operationSuggestions} from './discovery-recovery.js';
import type {Tool} from '@modelcontextprotocol/server';
import {InputError} from '../input-errors.js';
import {canonicalArgumentError,parseCanonicalArguments} from './canonical.js';
import {discoveryToolDefinitions,parseDiscoveryInput} from './discovery.js';
import {operationTable,type McpProfile,type Operation,type ToolReference} from './operations.js';
import {decodeWireArguments} from './wire-arguments.js';
export function listToolDefinitions(_profile: McpProfile = 'discovery'): Tool[] { return discoveryToolDefinitions(); }
interface ResolvedCall {
    canonicalName: string;
    args: Record<string, unknown>;
    operation: Operation;
    reference: ToolReference;
    error?: never;
}
interface RejectedCall {
    error: InputError;
    canonicalName?: string;
    reference?: ToolReference;
    args?: never;
    operation?: never;
}
/** One lookup and one validation path, shared by both MCP transports. */
export function resolveToolCall(_profile: McpProfile, name: string, raw: unknown): ResolvedCall | RejectedCall {
    if (name !== 'kanvas_call')
        return { error: new InputError([{ path: 'tool', problem: 'Unknown tool. This connection exposes only kanvas_discover and kanvas_call. Refresh tools/list and use kanvas_discover to find the operation.' }]) };
    let input: Record<string, unknown>;
    try {
        input = parseDiscoveryInput(name, raw);
    }
    catch (error) {
        if (error instanceof InputError)
            return { error };
        throw error;
    }
    const operation = operationTable().get(String(input.operationId));
    if (!operation)
        return { error: Object.assign(new InputError([{ path: 'operationId', problem: 'Unknown operation ID. Choose a suggested operation and inspect its schema; discovery also works through kanvas_call operationId kanvas.discover.' }]), { discoveryRecovery: { suggestions: operationSuggestions(String(input.operationId)), search: { tool: 'kanvas_call', arguments: { operationId: 'kanvas.discover', arguments: { catalog: 'operations', action: 'search', query: 'describe the intended action' } } } } }) };
    const canonicalName = operation.id, reference: ToolReference = { tool: 'kanvas_call', operation: operation.id };
    let args: unknown;
    try {
        args = decodeWireArguments(operation.id, input.arguments);
    }
    catch (error) {
        if (error instanceof InputError)
            return { error, canonicalName, reference };
        throw error;
    }
    const parsed = parseCanonicalArguments(operation.id, args);
    if (!parsed)
        return { error: canonicalArgumentError(operation.id, args) ?? new InputError([{ path: 'arguments', problem: 'The arguments do not match this operation schema.' }]), canonicalName, reference };
    return { canonicalName, args: parsed, operation, reference };
}
