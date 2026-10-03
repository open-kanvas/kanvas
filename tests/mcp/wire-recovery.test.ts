import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { listToolDefinitions, resolveToolCall } from '../../src/server/mcp/catalog.js';
import { canonicalToolDefinitions, parseCanonicalArguments } from '../../src/server/mcp/canonical.js';
import { OPERATION_ENTRIES } from '../../src/server/mcp/operations.js';
import { TOOL_DISCOVERY } from '../../src/server/mcp/tool-discovery.js';
import { schemaTypes } from '../../src/server/mcp/schema-properties.js';

const tools = new Map(listToolDefinitions('twelve').map(tool => [tool.name, tool]));
const canonical = new Map(canonicalToolDefinitions().map(tool => [tool.name, tool]));
const ajv = new Ajv2020({ strict: false, validateFormats: false });

describe('host argument-type recovery', () => {
  it('exposes every operation argument at the root and preserves strict branches for a root-only host', () => {
    for (const tool of tools.values()) {
      const validate = ajv.compile(tool.inputSchema);
      for (const entry of OPERATION_ENTRIES.filter(entry => entry.tool === tool.name)) {
        for (const [key, schema] of Object.entries(canonical.get(entry.canonical)!.inputSchema.properties!)) {
          expect(Object.hasOwn(tool.inputSchema.properties!, key), `${entry.tool}/${entry.operation}/${key}`).toBe(true);
          const allowed = schemaTypes(schema), advertised = schemaTypes(tool.inputSchema.properties![key]);
          if (allowed && advertised) for (const type of allowed) expect(advertised).toContain(type);
          // A default for one operation must not inject an extra field into another.
          expect(tool.inputSchema.properties![key]).not.toHaveProperty('default');
        }
        for (const example of TOOL_DISCOVERY[entry.canonical].examples) {
          // Compare recovery with an explicit retry ID; omitted IDs intentionally generate independent effects.
          const args = canonical.get(entry.canonical)!.inputSchema.properties?.requestId && !('requestId' in example) ? {...example,requestId:'recovery-test'} : example;
          const input = { operation: entry.operation, ...args };
          expect(validate(input), `${entry.tool}/${entry.operation}`).toBe(true);
          expect(validate({ ...input, unrecognizedField: true })).toBe(false);
          // A host with root-only field discovery now retains native types.
          const projected = Object.fromEntries(Object.entries(input).map(([key, value]) => [key,
            !Object.hasOwn(tool.inputSchema.properties!, key) && typeof value !== 'string' ? JSON.stringify(value) : value]));
          expect(resolveToolCall('twelve', tool.name, projected).args).toEqual(resolveToolCall('twelve', tool.name, input).args);
        }
      }
    }
    expect(tools.get('kanvas_access')!.inputSchema.properties!.approve).toMatchObject({ type: 'boolean' });
    expect(tools.get('kanvas_access')!.inputSchema.properties!.confirm).toMatchObject({ type: 'boolean', const: true });
    expect(tools.get('kanvas_publish')!.inputSchema.properties!.displayIds).toMatchObject({ type: 'array', items: { type: 'string' } });
    const command = tools.get('kanvas_control')!.inputSchema.properties!.command as Record<string, unknown>;
    expect(command).toMatchObject({ type: 'object', properties: { action: { type: 'string' }, time: { type: 'number' } } });
  });

  it('decodes exactly one cached-host JSON layer for non-text arguments across the canonical operations', () => {
    for (const entry of OPERATION_ENTRIES) for (const example of TOOL_DISCOVERY[entry.canonical].examples) {
          // Compare recovery with an explicit retry ID; omitted IDs intentionally generate independent effects.
          const args = canonical.get(entry.canonical)!.inputSchema.properties?.requestId && !('requestId' in example) ? {...example,requestId:'recovery-test'} : example;
      const properties = canonical.get(entry.canonical)!.inputSchema.properties!;
      const encoded = Object.fromEntries(Object.entries(args).map(([key, value]) => {
        const allowed = schemaTypes(properties[key]);
        return [key, allowed && !allowed.includes('string') ? JSON.stringify(value) : value];
      }));
      const expected = resolveToolCall('twelve', entry.tool, { operation: entry.operation, ...args });
      const actual = resolveToolCall('twelve', entry.tool, { operation: entry.operation, ...encoded });
      expect(actual.error, `${entry.tool}/${entry.operation}`).toBeUndefined();
      expect(actual.args).toEqual(expected.args);
    }
    // The domain/REST validator remains strict; compatibility is a wire boundary.
    expect(parseCanonicalArguments('kanvas_pairing_decide', { sessionId: 's', pairingId: 'p', approve: 'true', confirm: 'true' })).toBeUndefined();
  });

  it('never infers confirmation, truthiness or a numeric revision from malformed or double-encoded values', () => {
    const pair = { operation: 'pairing.decide', sessionId: 's', pairingId: 'p', approve: 'true', confirm: 'true' };
    for (const confirm of [undefined, '', 'false', 'null', '1', 'yes', 'TRUE', '"true"', true as unknown]) {
      const result = resolveToolCall('twelve', 'kanvas_access', { ...pair, confirm });
      if (confirm === true) expect(result.args).toMatchObject({ approve: true, confirm: true });
      else expect(result.error).toBeDefined();
    }
    expect(resolveToolCall('twelve', 'kanvas_access', { ...pair, approve: 'false', interactive: 'false' }).args).toMatchObject({ approve: false, confirm: true, interactive: false });
    for (const expectedRevision of ['', 'null', 'false', 'NaN', '-1', '0.5', '"0"', '9007199254740993']) {
      expect(resolveToolCall('twelve', 'kanvas_control', { operation: 'display.update', sessionId: 's', displayId: 'd', held: 'false', expectedRevision }).error).toBeDefined();
    }
    expect(resolveToolCall('twelve', 'kanvas_publish', { operation: 'show', sessionId: 's', requestId: 'r', displayIds: '["d"]', view: '{broken}' }).error).toBeDefined();
  });

  it('preserves opaque JSON/CSV/prose and exact scalar strings, rejecting lossy encoded numeric input', () => {
    const json = '[{"value":9007199254740993,"decimal":1.2300}]';
    const imported = resolveToolCall('twelve', 'kanvas_import', { operation: 'dataset.import', sessionId: 's', name: 'Source', json });
    expect(imported.args?.json).toBe(json);
    const prose = '["These are literal reproduction notes", "not a requested conversion"]';
    expect(resolveToolCall('twelve', 'kanvas_feedback', { operation: 'error.report', sessionId: 's', requestId: 'r', title: 'Repro', description: 'Exact prose', steps: prose }).args?.steps).toBe(prose);
    const args = { operation: 'show', sessionId: 's', requestId: 'r', displayIds: '["d"]' };
    const original = { version: 1, template: 'fact', data: { text: '{"value":1.2300,"large":9007199254740993}', subtitle: 'false' } };
    expect(resolveToolCall('twelve', 'kanvas_publish', { ...args, view: JSON.stringify(original) }).args?.view).toEqual(original);
    for (const value of ['9007199254740993', '1.234567890123456789', '1e999', '1e-999']) {
      const result = resolveToolCall('twelve', 'kanvas_publish', { ...args, view: `{"version":1,"template":"number","data":{"value":${value}}}` });
      expect(result.error?.issues).toEqual([{ path: 'view', problem: expect.stringContaining('cannot be represented exactly') }]);
    }
    const double = JSON.stringify(JSON.stringify(original));
    expect(resolveToolCall('twelve', 'kanvas_publish', { ...args, view: double }).error).toBeDefined();
  });
});
