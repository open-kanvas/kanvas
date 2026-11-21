import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { listToolDefinitions, resolveToolCall } from '../../src/server/mcp/catalog.js';
import { canonicalToolDefinitions, parseCanonicalArguments } from '../../src/server/mcp/canonical.js';
import { operationTable } from '../../src/server/mcp/operations.js';
import { schemaTypes } from '../../src/server/mcp/schema-properties.js';

const definitions = new Map(canonicalToolDefinitions().map(tool => [tool.name, tool]));
const ajv = new Ajv2020({ strict: false, validateFormats: false });
const call = (operationId: string, args: Record<string, unknown>) => resolveToolCall('discovery', 'kanvas_call', { operationId, arguments: args });
describe('public argument-type recovery', () => {
  it('publishes strict operation schemas inside the fixed nested call envelope', () => {
    const wire = listToolDefinitions().find(tool => tool.name === 'kanvas_call')!;
    const validateWire = ajv.compile(wire.inputSchema);
    expect(wire.inputSchema.properties?.operationId).toMatchObject({ type: 'string' });
    expect(wire.inputSchema.properties?.arguments).toMatchObject({ type: 'object' });
    for (const operation of operationTable().values()) {
      const schema = definitions.get(operation.id)!.inputSchema;
      const validate = ajv.compile(schema);
      for (const example of operation.definition.discovery.examples) {
        expect(validateWire({ operationId: operation.id, arguments: example })).toBe(true);
        expect(validate(example), operation.id).toBe(true);
        expect(validate({ ...example, unrecognizedField: true }), operation.id).toBe(false);
      }
    }
    expect(definitions.get('kanvas.pairing.decide')!.inputSchema.properties?.approve).toMatchObject({ type: 'boolean' });
    expect(definitions.get('kanvas.pairing.decide')!.inputSchema.properties?.confirm).toMatchObject({ type: 'boolean', const: true });
    expect(definitions.get('kanvas.submit')!.inputSchema.properties?.displayIds).toMatchObject({ type: 'array', items: { type: 'string' } });
  });
  it('decodes exactly one host JSON layer in known non-text operation arguments', () => {
    for (const operation of operationTable().values()) for (const example of operation.definition.discovery.examples) {
      const properties = definitions.get(operation.id)!.inputSchema.properties!;
      const args = properties.requestId && !('requestId' in example) ? { ...example, requestId: 'recovery-test' } : example;
      const encoded = Object.fromEntries(Object.entries(args).map(([key, value]) => {
        const allowed = schemaTypes(properties[key]);
        return [key, allowed && !allowed.includes('string') ? JSON.stringify(value) : value];
      }));
      const actual = call(operation.id, encoded);
      expect(actual.error, operation.id).toBeUndefined();
      expect(actual.args).toEqual(call(operation.id, args).args);
    }
    expect(parseCanonicalArguments('kanvas.pairing.decide', { sessionId: 's', pairingId: 'p', approve: 'true', confirm: 'true' })).toBeUndefined();
  });
  it('never infers confirmation, truthiness or revisions from malformed or double-encoded values', () => {
    const pair = { sessionId: 's', pairingId: 'p', approve: 'true', confirm: 'true' };
    for (const confirm of [undefined, '', 'false', 'null', '1', 'yes', 'TRUE', '"true"', true as unknown]) {
      const result = call('kanvas.pairing.decide', { ...pair, confirm });
      if (confirm === true) expect(result.args).toMatchObject({ approve: true, confirm: true });
      else expect(result.error).toBeDefined();
    }
    expect(call('kanvas.pairing.decide', { ...pair, approve: 'false', interactive: 'false' }).args).toMatchObject({ approve: false, confirm: true, interactive: false });
    for (const expectedRevision of ['', 'null', 'false', 'NaN', '-1', '0.5', '"0"', '9007199254740993']) expect(call('kanvas.display.update', { sessionId: 's', displayId: 'd', held: 'false', expectedRevision }).error).toBeDefined();
    expect(call('kanvas.submit', { sessionId: 's', requestId: 'r', displayIds: '["d"]', view: '{broken}' }).error).toBeDefined();
  });
  it('preserves literal JSON/CSV/prose and scalar strings, rejecting lossy encoded numbers', () => {
    const json = '[{"value":9007199254740993,"decimal":1.2300}]';
    expect(call('kanvas.dataset.import', { sessionId: 's', name: 'Source', json }).args?.json).toBe(json);
    const prose = '["These are literal reproduction notes", "not a requested conversion"]';
    expect(call('kanvas.error.report', { sessionId: 's', requestId: 'r', title: 'Repro', description: 'Exact prose', steps: prose }).args?.steps).toBe(prose);
    const args = { sessionId: 's', requestId: 'r', displayIds: '["d"]' };
    const original = { version: 1, template: 'fact', data: { text: '{"value":1.2300,"large":9007199254740993}', subtitle: 'false' } };
    expect(call('kanvas.submit', { ...args, view: JSON.stringify(original) }).args?.view).toEqual(original);
    for (const value of ['9007199254740993', '1.234567890123456789', '1e999', '1e-999']) expect(call('kanvas.submit', { ...args, view: `{"version":1,"template":"number","data":{"value":${value}}}` }).error?.issues).toEqual([{ path: 'view', problem: expect.stringContaining('cannot be represented exactly') }]);
    expect(call('kanvas.submit', { ...args, view: JSON.stringify(JSON.stringify(original)) }).error).toBeDefined();
  });
});
