import { CANONICAL_TOOLS as MCP_TOOLS } from '../../src/server/mcp/canonical.js';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical.js';
import { discoveryToolDefinitions } from '../../src/server/mcp/discovery.js';
import type { Tool } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import { toolDiscovery, TOOL_SELECTION_GUIDANCE, withToolDiscovery } from '../../src/server/mcp/tool-discovery.js';
import { validateMedia, type MediaInput } from '../../src/server/rendering/media.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { harness } from './harness.js';
const published = canonicalToolDefinitions();
let server: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => { await server?.close(); server = undefined; });
function inlineExamples(description: string): Record<string, unknown>[] {
    return description.split('\n').flatMap(line => {
        const match = /^(?:Example|Alternative) arguments JSON: (.+)$/.exec(line);
        return match ? [JSON.parse(match[1]) as Record<string, unknown>] : [];
    });
}
describe('legacy discovery compatibility and usable examples', () => {
    // Full per-operation schema/runtime parity is owned by twelve-schema.test.
    // Check legacy-specific inline delivery, plus materializable content; do not
    // repeat 57 tests comparing metadata with the constants that generated it.
    it('supplies usable legacy examples, including prepared source and reproduction prose', () => {
        for (const name of ["kanvas.submit", "kanvas.display.register", "kanvas.presentation.create", "kanvas.display.edit", "kanvas.pairing.decide", "kanvas.error.report", "kanvas.monitoring.start"]) {
            const tool = published.find(item => item.name === name)!, definition = MCP_TOOLS.find(item => item.name === name)!;
            const examples = inlineExamples(tool.description!);
            expect(examples.length).toBeGreaterThan(0);
            expect(tool.inputSchema.examples).toEqual(examples);
            expect(tool.description!.length).toBeLessThanOrEqual(4096);
            for (const example of examples) {
                expect(definition.schema.safeParse(example).success, name).toBe(true);
                if (example.view)
                    expect(() => validateView(example.view)).not.toThrow();
                if (Array.isArray(example.slides))
                    for (const slide of example.slides)
                        expect(() => validateView(slide)).not.toThrow();
                if (name === "kanvas.display.edit")
                    expect(() => validateView({ version: 1, template: 'transcription', data: example.data })).not.toThrow();
            }
        }
    });
    it('front-loads the publish/viewport/full-edit/field-patch distinctions with correct fact and transcript shapes', () => {
        for (const name of ["kanvas.submit", "kanvas.display.update", "kanvas.display.edit", "kanvas.view.patch"]) {
            const description = published.find(tool => tool.name === name)!.description!;
            expect(description.indexOf('Example arguments JSON:')).toBeLessThan(400);
        }
        expect(TOOL_SELECTION_GUIDANCE.publish).toContain('publishes/replaces');
        expect(TOOL_SELECTION_GUIDANCE.viewport).toContain('never view content');
        expect(TOOL_SELECTION_GUIDANCE.completeData).toContain('COMPLETE data');
        expect(TOOL_SELECTION_GUIDANCE.patch).toContain('expectedRevision');
        expect(toolDiscovery()["kanvas.display.update"].hint).toContain('NOT content');
        expect(toolDiscovery()["kanvas.display.edit"].hint).toContain('not a partial merge');
        const [first, continuation, explicit, transcription] = toolDiscovery()["kanvas.submit"].examples;
        expect(first).toMatchObject({ requestId: 'first-visual', templateHint: 'fact', data: { text: 'Exact supplied sentence.' } });
        expect(first).not.toHaveProperty('sessionId');
        expect(continuation).toMatchObject({ targetRef: 'returned-target-ref' });
        expect(explicit).toMatchObject({ sessionId: 'session-id', displayIds: ['display-id'] });
        const views = [explicit, transcription].map(example => validateView(example.view));
        expect(views.map(view => view.template)).toEqual(['fact', 'transcription']);
        expect(views[0].data).toMatchObject({ text: 'Exact supplied sentence.' });
        expect(views[1].data).toEqual({ segments: [{ id: 'segment-1', text: 'Exact supplied words.', speaker: 'Speaker A' }], status: 'live' });
        const patch = toolDiscovery()["kanvas.view.patch"].examples[0];
        expect(patch.operations).toEqual([{ op: 'appendText', path: '/data/segments/0/text', value: ' More supplied words.' }]);
    });
    it('marks access-grant and external polling examples as syntax, never owner consent', () => {
        expect(published.filter(tool => tool.annotations?.openWorldHint).map(tool => tool.name).sort()).toEqual(["kanvas.invite.send", "kanvas.monitoring.start", "kanvas.monitoring.update"]);
        for (const name of ["kanvas.invite.send", "kanvas.share.create", "kanvas.pairing.decide", "kanvas.member.add", "kanvas.member.remove", "kanvas.monitoring.start"]) {
            const tool = published.find(tool => tool.name === name)!;
            expect(toolDiscovery()[name].hint).toContain('NOT authorization');
            expect(tool.annotations?.readOnlyHint).toBe(false);
        }
        expect(toolDiscovery()["kanvas.pairing.decide"].hint).toContain('not real consent');
        expect(TOOL_SELECTION_GUIDANCE.access).toContain('owner request/confirmation');
        const approval = toolDiscovery()["kanvas.pairing.decide"].examples[0];
        expect(approval).toMatchObject({ pairingId: 'pairing-id', approve: true, confirm: true });
        for (const name of ["kanvas.monitoring.start", "kanvas.monitoring.update"]) {
            const config = toolDiscovery()[name].examples[0].config as {
                url: string;
            };
            expect(new URL(config.url).hostname).toBe('example.com');
        }
    });
    it('contains a complete usable image payload, not placeholder bytes that would fail after schema validation', () => {
        const example = toolDiscovery()["kanvas.asset.import"].examples[0];
        expect(() => validateMedia(example as unknown as MediaInput)).not.toThrow();
        expect(Buffer.from(String(example.base64), 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    });
    it('does not let a caller mutate shared examples or change unknown tool metadata', () => {
        const first = canonicalToolDefinitions().find(tool => tool.name === "kanvas.submit")!;
        const original = structuredClone(toolDiscovery()["kanvas.submit"].examples);
        const examples = first.inputSchema.examples as Record<string, unknown>[];
        (examples[0].data as {
            text: string;
        }).text = 'Caller changed this copy';
        examples.push({ unexpected: true });
        expect(toolDiscovery()["kanvas.submit"].examples).toEqual(original);
        expect(canonicalToolDefinitions().find(tool => tool.name === "kanvas.submit")!.inputSchema.examples).toEqual(original);
        const unknown: Tool = { name: 'future-tool', description: 'Unchanged metadata.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } };
        expect(withToolDiscovery(unknown)).toBe(unknown);
    });
    it('delivers the same complete descriptions, examples and annotations through modern and legacy MCP discovery', async () => {
        server = await harness();
        const credential = server.service.issue('owner');
        const [modern, legacy] = await Promise.all([server.modern(credential), server.legacy(credential)]);
        const [current, previous] = await Promise.all([modern.client.listTools(), legacy.client.listTools()]);
        for (const result of [current, previous]) {
            expect(result.tools.map(tool => tool.name)).toEqual(discoveryToolDefinitions().map(tool => tool.name));
            for (const tool of result.tools) {
                const expected = discoveryToolDefinitions().find(candidate => candidate.name === tool.name)!;
                expect(tool.description).toBe(expected.description);
                expect(tool.inputSchema).toEqual(expected.inputSchema);
                expect(tool.annotations).toEqual(expected.annotations);
            }
        }
        expect(server.service.calls).toEqual([]);
    });
});
