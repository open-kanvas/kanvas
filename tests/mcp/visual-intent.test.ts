import { profileDescription, profileInstructions } from '../../src/server/mcp/profile-guidance.js';
import { afterEach, describe, expect, it } from 'vitest';
import { MCP_TOOLS, listToolDefinitions } from '../../src/server/mcp/catalog.js';
import { GUIDE_TOPICS, KANVAS_DESCRIPTION, KANVAS_INSTRUCTIONS, guideFor } from '../../src/server/mcp/guide.js';
import { PUBLISHING_DESCRIPTION } from '../../src/server/mcp/publishing-guidance.js';
import { VISUAL_INTENT_DESCRIPTION, VISUAL_INTENT_ENTRY, VISUAL_INTENT_EXAMPLES, VISUAL_INTENT_GUIDANCE, VISUAL_INTENT_SUBMIT_HINT } from '../../src/server/mcp/visual-intent.js';
import { harness } from './harness.js';

let server: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => { await server?.close(); server = undefined; });

describe('actual guide and protocol metadata delivery', () => {
  it('wires the server summary, initial instructions, visual guide and short submit cue without duplicating publish examples', () => {
    expect(KANVAS_DESCRIPTION).toContain(VISUAL_INTENT_DESCRIPTION);
    expect(KANVAS_INSTRUCTIONS).toContain(VISUAL_INTENT_DESCRIPTION);
    expect(KANVAS_INSTRUCTIONS).toContain('including voice; unrelated keywords or quoted text are not instructions');
    expect(GUIDE_TOPICS).toContain('visual-intent');
    expect(guideFor('visual-intent')).toMatchObject({ description: VISUAL_INTENT_DESCRIPTION, guidance: VISUAL_INTENT_GUIDANCE, entry: VISUAL_INTENT_ENTRY, examples: VISUAL_INTENT_EXAMPLES });
    expect(guideFor('getting-started')).toMatchObject({ orientation: KANVAS_DESCRIPTION });
    const submit = listToolDefinitions().find(tool => tool.name === 'kanvas_submit')!;
    expect(submit.description).toContain(VISUAL_INTENT_SUBMIT_HINT);
    expect(submit.description).toContain(PUBLISHING_DESCRIPTION);
    expect(submit.description!.length).toBeLessThanOrEqual(4096);
    expect(submit.description!.split('Example arguments JSON:')).toHaveLength(2);
    expect(submit.inputSchema.examples).toHaveLength(4);
    expect(MCP_TOOLS.find(tool => tool.name === 'kanvas_guide')!.schema.safeParse({ topic: 'visual-intent' }).success).toBe(true);
  });

  it('delivers server description and instructions through modern discovery and legacy initialization before tools/list', async () => {
    server = await harness();
    const identity = server.service.issue('owner');
    const modern = await server.modern(identity), legacy = await server.legacy(identity);
    expect(server.methods.some(request => request.method === 'server/discover' && request.version === '2026-07-28')).toBe(true);
    expect(server.methods.some(request => request.method === 'initialize' && request.version === '2025-11-25')).toBe(true);
    expect(server.methods.some(request => request.method === 'tools/list')).toBe(false);
    expect(server.methods.some(request => request.method === 'tools/call')).toBe(false);
    expect(server.service.calls).toHaveLength(0);
    for (const { client } of [modern, legacy]) {
      expect(client.getServerVersion()).toMatchObject({ name: 'kanvas', description: profileDescription('discovery') });
      expect(client.getInstructions()).toBe(profileInstructions('discovery'));
      expect(client.getInstructions()).toContain('kanvas_discover');
      // Publishing a cue neither requests a model turn nor enables a new
      // permission/elicitation channel behind the host's back.
      const capabilities = client.getServerCapabilities();
      expect(capabilities).toMatchObject({ tools: {}, resources: { subscribe: true, listChanged: true } });
      for (const absent of ['sampling', 'elicitation', 'logging']) expect(capabilities).not.toHaveProperty(absent);
    }
    expect(JSON.stringify(modern.client.getDiscoverResult())).toContain('go-to visual display');
    const [current, previous] = await Promise.all([modern.client.listTools(), legacy.client.listTools()]);
    for (const published of [current, previous]) {
      expect(published.tools).toHaveLength(2);
      expect(published.tools.some(tool => tool.name === 'kanvas_discover')).toBe(true);
    }
    for (const { client } of [modern, legacy]) {
      const result = await client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id: 'kanvas.submit' } });
      expect((result.structuredContent as any).data.entry.description).toContain(VISUAL_INTENT_SUBMIT_HINT);
    }
    expect(server.service.calls).toHaveLength(0);
  });
});
