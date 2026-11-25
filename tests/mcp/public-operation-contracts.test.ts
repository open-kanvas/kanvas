import { expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { operationTable } from '../../src/server/mcp/operations.js';
import { operationCatalog } from '../../src/server/mcp/discovery.js';
import { listToolDefinitions, resolveToolCall } from '../../src/server/mcp/catalog.js';
import type { McpService } from '../../src/server/mcp/types.js';

const registry = operationTable();
const catalog = new Map(operationCatalog().map(entry => [entry.id, entry]));
const json = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
it('advertises only the two wire tools and refuses obsolete callable names', () => {
  expect(listToolDefinitions().map(tool => tool.name)).toEqual(['kanvas_discover', 'kanvas_call']);
  expect([...registry.keys()].sort()).toEqual([...catalog.keys()].sort());
  for (const name of ['kanvas_submit', 'kanvas_inspect', 'kanvas_publish', 'kanvas_session', 'kanvas.publish']) {
    expect(resolveToolCall('discovery', name, {}).error?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'tool' })]));
  }
  expect(resolveToolCall('discovery', 'kanvas_call', { operationId: 'kanvas.not.registered', arguments: {} }).error?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'operationId' })]));
});

it.each([...registry.values()])('$id: discovery, validation and dispatch share the public contract', async operation => {
  const detail = catalog.get(operation.id)!.detail() as { operationId: string; inputSchema: object; annotations: object; examples: { tool: string; arguments: { operationId: string; arguments: Record<string, unknown> } }[] };
  expect(detail.operationId).toBe(operation.id);
  expect(detail.annotations).toEqual(operation.annotations);
  expect(operation.domain).toMatch(/^[a-z][a-z-]*$/);
  expect(operation.scopes).toEqual([expect.stringMatching(/^(read|publish)$/)]);
  expect(detail.examples.length).toBeGreaterThan(0);
  const accepts = json.compile(detail.inputSchema);
  for (const example of detail.examples) {
    expect(example.tool).toBe('kanvas_call');
    expect(example.arguments.operationId).toBe(operation.id);
    const raw = structuredClone(example.arguments.arguments);
    expect(accepts(raw), JSON.stringify(accepts.errors)).toBe(true);
    const resolved = resolveToolCall('discovery', 'kanvas_call', { operationId: operation.id, arguments: raw });
    expect(resolved.error).toBeUndefined();
    if (resolved.error) throw resolved.error;
    const principal = { userId: 'authorized-contract-account', scopes: [...operation.scopes] };
    const controller = new AbortController();
    const calls: unknown[][] = [];
    const service = { execute: async (...args: unknown[]) => { calls.push(args); return { operation: operation.id }; } } as unknown as McpService;
    await expect(resolved.operation.execute(service, resolved.args, principal, { signal: controller.signal })).resolves.toEqual({ operation: operation.id });
    expect(calls).toEqual([[operation.id, resolved.args, principal, { signal: controller.signal }]]);
    // The wire decoder and validation must not rewrite caller-owned source values.
    expect(raw).toEqual(example.arguments.arguments);
  }
});
