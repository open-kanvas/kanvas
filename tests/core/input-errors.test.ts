import { describe, expect, it } from 'vitest';
import { canonicalArgumentError, parseCanonicalArguments } from '../../src/server/mcp/canonical.js';
import { toolFailure } from '../../src/server/mcp/results.js';

const report = { sessionId: 'session-id', requestId: 'report-1', title: 'Observed failure', description: 'The requested behavior did not complete.' };

describe('repairable, content-free input errors', () => {
    it('names actual pairing requirements without converting strings or examples into consent', () => {
        const args = { sessionId: 'session-id', pairingId: 'pairing-id' };
        const error = canonicalArgumentError("kanvas.pairing.decide", args)!;
        expect(error.issues).toEqual([
            { path: 'approve', problem: 'Required boolean (true or false); received missing.', expected: 'boolean', received: 'missing' },
            { path: 'confirm', problem: 'Must be true only after the owner confirms the intended browser.' },
        ]);
        const result = toolFailure(error, undefined, 'discovery');
        expect(result.structuredContent).toMatchObject({ error: { schemaTool: 'kanvas_discover', schemaArguments: { catalog: 'help', action: 'get', id: 'kanvas.help.tools.discovery' }, topic: 'tools' } });
        for (const value of [{ approve: 'true', confirm: true }, { approve: true, confirm: false }, { approve: true, confirm: 'true' }]) {
            expect(parseCanonicalArguments("kanvas.pairing.decide", { ...args, ...value })).toBeUndefined();
        }
        const unknown = 'private-unrecognized-field';
        const rejected = canonicalArgumentError("kanvas.pairing.decide", { ...args, [unknown]: 'private input' })!;
        expect(JSON.stringify(toolFailure(rejected, undefined, 'discovery'))).not.toMatch(/private-unrecognized-field|private input/);
    });
    it('reports the expected type instead of applying an array size limit to a string', () => {
        const error = canonicalArgumentError("kanvas.submit", { sessionId: 'session-id', requestId: 'show-1', displayIds: 'private display source'.repeat(8) })!;
        expect(error.issues).toEqual([{ path: 'displayIds', problem: 'Expected array; received string.', expected: 'array', received: 'string' }]);
        expect(JSON.stringify(error.issues)).not.toContain('private');
        expect(error.guidance).toEqual({ schemaTool: "kanvas.guide", topic: 'tools' });
    });
    it('keeps reproduction prose and list bounds distinct, including repeated boundary validation', () => {
        const prose = '1. Open the display.\n2. Confirm the intended screen.\n'.repeat(12);
        const parsed = parseCanonicalArguments("kanvas.error.report", { ...report, steps: prose })!;
        expect(parsed.steps).toBe(prose.trim());
        expect(parseCanonicalArguments("kanvas.error.report", parsed)).toEqual(parsed);
        expect(canonicalArgumentError("kanvas.error.report", { ...report, steps: 'x'.repeat(3201) })?.issues)
            .toEqual([{ path: 'steps', problem: 'Maximum 3200 characters; submitted 3201.', maximum: 3200, actual: 3201, unit: 'characters' }]);
        expect(canonicalArgumentError("kanvas.error.report", { ...report, steps: Array(9).fill('Valid step') })?.issues)
            .toEqual([{ path: 'steps', problem: 'Maximum 8 items; submitted 9.', maximum: 8, actual: 9, unit: 'items' }]);
        expect(canonicalArgumentError("kanvas.error.report", { ...report, steps: ['x'.repeat(401)] })?.issues)
            .toEqual([{ path: 'steps[0]', problem: 'Maximum 400 characters; submitted 401.', maximum: 400, actual: 401, unit: 'characters' }]);
        expect(canonicalArgumentError("kanvas.error.report", { ...report, steps: 3 })?.issues)
            .toEqual([{ path: 'steps', problem: 'Expected array or string.' }]);
    });
});
