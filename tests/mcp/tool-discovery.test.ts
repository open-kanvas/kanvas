import { discoveryToolDefinitions } from '../../src/server/mcp/discovery.js';
import type { Tool } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import { MCP_TOOLS, listToolDefinitions } from '../../src/server/mcp/catalog.js';
import { TOOL_DISCOVERY, TOOL_SELECTION_GUIDANCE, withToolDiscovery } from '../../src/server/mcp/tool-discovery.js';
import { validateMedia, type MediaInput } from '../../src/server/rendering/media.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { harness } from './harness.js';

const published = listToolDefinitions();
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
    for (const name of ['kanvas_submit', 'kanvas_display_register', 'kanvas_presentation_create', 'kanvas_display_edit', 'kanvas_pairing_decide', 'kanvas_error_report', 'kanvas_monitoring_start']) {
      const tool = published.find(item => item.name === name)!, definition = MCP_TOOLS.find(item => item.name === name)!;
      const examples = inlineExamples(tool.description!);
      expect(examples.length).toBeGreaterThan(0);
      expect(tool.inputSchema.examples).toEqual(examples);
      expect(tool.description!.length).toBeLessThanOrEqual(4096);
      for (const example of examples) {
        expect(definition.schema.safeParse(example).success, name).toBe(true);
        if (example.view) expect(() => validateView(example.view)).not.toThrow();
        if (Array.isArray(example.slides)) for (const slide of example.slides) expect(() => validateView(slide)).not.toThrow();
        if (name === 'kanvas_display_edit') expect(() => validateView({ version: 1, template: 'transcription', data: example.data })).not.toThrow();
      }
    }
  });

  it('front-loads the publish/viewport/full-edit/field-patch distinctions with correct fact and transcript shapes', () => {
    for (const name of ['kanvas_submit', 'kanvas_display_update', 'kanvas_display_edit', 'kanvas_view_patch']) {
      const description = published.find(tool => tool.name === name)!.description!;
      expect(description.indexOf('Example arguments JSON:')).toBeLessThan(400);
    }
    expect(TOOL_SELECTION_GUIDANCE.publish).toContain('publishes/replaces');
    expect(TOOL_SELECTION_GUIDANCE.viewport).toContain('never view content');
    expect(TOOL_SELECTION_GUIDANCE.completeData).toContain('COMPLETE data');
    expect(TOOL_SELECTION_GUIDANCE.patch).toContain('expectedRevision');
    expect(TOOL_DISCOVERY.kanvas_display_update.hint).toContain('NOT content');
    expect(TOOL_DISCOVERY.kanvas_display_edit.hint).toContain('not a partial merge');
    const [first, continuation, explicit, transcription] = TOOL_DISCOVERY.kanvas_submit.examples;
    expect(first).toMatchObject({ requestId: 'first-visual', templateHint: 'fact', data: { text: 'Exact supplied sentence.' } });
    expect(first).not.toHaveProperty('sessionId');
    expect(continuation).toMatchObject({ targetRef: 'returned-target-ref' });
    expect(explicit).toMatchObject({ sessionId: 'session-id', displayIds: ['display-id'] });
    const views = [explicit, transcription].map(example => validateView(example.view));
    expect(views.map(view => view.template)).toEqual(['fact', 'transcription']);
    expect(views[0].data).toMatchObject({ text: 'Exact supplied sentence.' });
    expect(views[1].data).toEqual({ segments: [{ id: 'segment-1', text: 'Exact supplied words.', speaker: 'Speaker A' }], status: 'live' });
    const patch = TOOL_DISCOVERY.kanvas_view_patch.examples[0];
    expect(patch.operations).toEqual([{ op: 'appendText', path: '/data/segments/0/text', value: ' More supplied words.' }]);
  });

  it('marks access-grant and external polling examples as syntax, never owner consent', () => {
    expect(published.filter(tool => tool.annotations?.openWorldHint).map(tool => tool.name).sort()).toEqual(['kanvas_invite_send', 'kanvas_monitoring_start', 'kanvas_monitoring_update']);
    for (const name of ['kanvas_invite_send', 'kanvas_share_create', 'kanvas_pairing_decide', 'kanvas_member_add', 'kanvas_member_remove', 'kanvas_monitoring_start']) {
      const tool = published.find(tool => tool.name === name)!;
      expect(TOOL_DISCOVERY[name].hint).toContain('NOT authorization');
      expect(tool.annotations?.readOnlyHint).toBe(false);
    }
    expect(TOOL_DISCOVERY.kanvas_pairing_decide.hint).toContain('not real consent');
    expect(TOOL_SELECTION_GUIDANCE.access).toContain('owner request/confirmation');
    const approval = TOOL_DISCOVERY.kanvas_pairing_decide.examples[0];
    expect(approval).toMatchObject({ pairingId: 'pairing-id', approve: true, confirm: true });
    for (const name of ['kanvas_monitoring_start', 'kanvas_monitoring_update']) {
      const config = TOOL_DISCOVERY[name].examples[0].config as { url: string };
      expect(new URL(config.url).hostname).toBe('example.com');
    }
  });

  it('contains a complete usable image payload, not placeholder bytes that would fail after schema validation', () => {
    const example = TOOL_DISCOVERY.kanvas_asset_import.examples[0];
    expect(() => validateMedia(example as unknown as MediaInput)).not.toThrow();
    expect(Buffer.from(String(example.base64), 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('does not let a caller mutate shared examples or change unknown tool metadata', () => {
    const first = listToolDefinitions().find(tool => tool.name === 'kanvas_submit')!;
    const original = structuredClone(TOOL_DISCOVERY.kanvas_submit.examples);
    const examples = first.inputSchema.examples as Record<string, unknown>[];
    (examples[0].data as { text: string }).text = 'Caller changed this copy';
    examples.push({ unexpected: true });
    expect(TOOL_DISCOVERY.kanvas_submit.examples).toEqual(original);
    expect(listToolDefinitions().find(tool => tool.name === 'kanvas_submit')!.inputSchema.examples).toEqual(original);
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
