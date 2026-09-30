import { afterEach, describe, expect, it } from 'vitest';
import { listToolDefinitions } from '../../src/server/mcp/catalog.js';
import { KANVAS_INSTRUCTIONS, guideFor, orientationFor } from '../../src/server/mcp/guide.js';
import { toolSuccess } from '../../src/server/mcp/results.js';
import { FIRST_DISPLAY_LINK_GUIDANCE, MAX_VIEWER_LINK_GUIDANCE_CHARACTERS, VIEWER_LINK_TOOL_GUIDANCE, viewerLinkGuidanceFor } from '../../src/server/mcp/viewer-link-guidance.js';
import { harness } from './harness.js';

const entryPoints = ['kanvas_session_create', 'kanvas_display_register', 'kanvas_submit', 'kanvas_address_get'] as const;
let server: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => { await server?.close(); server = undefined; });

interface Envelope { data: Record<string, unknown>; orientation?: { viewerLink?: string } }
function envelope(result: unknown): Envelope {
  if (!result || typeof result !== 'object') throw new Error('Expected an MCP tool result');
  const response = result as Record<string, unknown>;
  expect(response.isError).not.toBe(true);
  if (response.structuredContent) return response.structuredContent as Envelope;
  if (!Array.isArray(response.content)) throw new Error('Expected a direct MCP content result, not a task placeholder');
  const block = response.content.find(item => item && typeof item === 'object' && typeof item.text === 'string');
  if (!block) throw new Error('Expected an MCP text result');
  return JSON.parse(block.text) as Envelope;
}

describe('bounded first-use viewer handoff guidance', () => {
  it('covers exactly the four entry points with bounded static hints and no prototype-key fallback', () => {
    expect(Object.keys(VIEWER_LINK_TOOL_GUIDANCE)).toEqual(entryPoints);
    expect(Object.isFrozen(VIEWER_LINK_TOOL_GUIDANCE)).toBe(true);
    for (const tool of entryPoints) {
      const guidance = viewerLinkGuidanceFor(tool)!;
      expect(guidance.length).toBeLessThanOrEqual(MAX_VIEWER_LINK_GUIDANCE_CHARACTERS);
      expect(guidance).toContain(FIRST_DISPLAY_LINK_GUIDANCE); expect(guidance).toContain(VIEWER_LINK_TOOL_GUIDANCE[tool]);
      // Metadata describes where to find a locator; it contains no fabricated
      // live URL that could be mistaken for a returned display address.
      expect(guidance).not.toMatch(/https?:\/\//);
    }
    for (const tool of ['', 'kanvas_display_update', 'kanvas_view_patch', 'kanvas_share_create', 'submit', '__proto__', 'constructor', 'toString']) expect(viewerLinkGuidanceFor(tool)).toBeUndefined();
  });

  it('makes each entry point honest about locator fields and its actual lifecycle', () => {
    expect(VIEWER_LINK_TOOL_GUIDANCE.kanvas_session_create).toContain('no registered-screen viewerUrl');
    expect(VIEWER_LINK_TOOL_GUIDANCE.kanvas_session_create).toContain('neither registers a display nor publishes content');
    expect(VIEWER_LINK_TOOL_GUIDANCE.kanvas_display_register).toContain('returned viewerUrl');
    expect(VIEWER_LINK_TOOL_GUIDANCE.kanvas_display_register).toContain('does not publish content or prove');
    expect(VIEWER_LINK_TOOL_GUIDANCE.kanvas_submit).toContain('targets[].viewerUrl/shortUrl');
    expect(VIEWER_LINK_TOOL_GUIDANCE.kanvas_submit).toContain('Explicit sessionId+displayIds keeps the existing update-only result');
    expect(VIEWER_LINK_TOOL_GUIDANCE.kanvas_submit).toContain('Accepted/prepared is not browser-applied');
    expect(VIEWER_LINK_TOOL_GUIDANCE.kanvas_submit).toContain('needs_target is unresolved and has published nothing');
    expect(VIEWER_LINK_TOOL_GUIDANCE.kanvas_address_get).toContain('short locator in url');
    expect(VIEWER_LINK_TOOL_GUIDANCE.kanvas_address_get).toContain('Without displayId this is a session address, not a registered-screen URL');
    expect(FIRST_DISPLAY_LINK_GUIDANCE).toContain('not proof of receiving-browser paint'); expect(FIRST_DISPLAY_LINK_GUIDANCE).toContain('kanvas_update_status');
    expect(FIRST_DISPLAY_LINK_GUIDANCE).toContain('giving a link does not mean the content has been shown');
  });
});

describe('real guide, catalogue and MCP result integration', () => {
  it('makes the handoff discoverable in initialization, getting-started, each tool description and orientation', () => {
    expect(KANVAS_INSTRUCTIONS).toContain('literal, clickable viewerUrl/shortUrl');expect(KANVAS_INSTRUCTIONS).toContain('in voice mode also show the actual URL as text');
    expect(guideFor('getting-started')).toMatchObject({ viewerLink: FIRST_DISPLAY_LINK_GUIDANCE });
    const definitions = listToolDefinitions();
    for (const tool of entryPoints) {
      const description = definitions.find(definition => definition.name === tool)!.description!;
      expect(description).toContain(VIEWER_LINK_TOOL_GUIDANCE[tool]);
      expect(description).toContain('literal, clickable, copyable'); expect(description).toContain('voice mode'); expect(description).toContain('do not repeat');
      expect(orientationFor(tool)?.viewerLink).toBe(viewerLinkGuidanceFor(tool));
    }
    expect(orientationFor('kanvas_session_state')?.viewerLink).toBeUndefined();
    expect(orientationFor('kanvas_view_patch')).toBeUndefined();
  });

  it('keeps real returned URL text and lifecycle data separate from guidance without inventing missing fields', () => {
    // Synthetic source-returned locators, deliberately including exact path
    // spelling/escaping. The annotation layer must not normalize or derive them.
    const viewerUrl = 'https://kanvas.example/view/Source-Session/Screen_1?label=One%20Two', shortUrl = 'https://kanvas.example/s/Source-Original';
    const returned: Record<typeof entryPoints[number], Record<string, unknown>> = {
      kanvas_session_create: { id: 'source-session', name: 'Supplied session name' },
      kanvas_display_register: { id: 'source-display', viewerUrl, shortUrl, revision: 0 },
      kanvas_submit: { id: 'source-update', status: 'accepted', displayIds: ['source-display'] },
      kanvas_address_get: { alias: 'Source-Original', url: shortUrl, viewerUrl, access: 'locator-only' },
    };
    for (const tool of entryPoints) {
      const original = Object.freeze(returned[tool]), result = envelope(toolSuccess(original, 'source-session', tool));
      expect(result.data).toEqual(original); expect(result.orientation?.viewerLink).toBe(viewerLinkGuidanceFor(tool));
      expect(JSON.parse((toolSuccess(original, 'source-session', tool).content[0] as { text: string }).text).data).toEqual(original);
    }
    for (const status of ['accepted', 'prepared', 'applied', 'failed']) {
      const original = { id: 'source-update', status }, result = envelope(toolSuccess(original, 'source-session', 'kanvas_submit'));
      expect(result.data).toEqual(original); expect(result.data).not.toHaveProperty('viewerUrl'); expect(result.data).not.toHaveProperty('shortUrl'); expect(result.data).not.toHaveProperty('browserPainted');
    }
  });

  it('delivers all four handoff hints through both SDK protocol eras without automatic shares or fabricated delivery', async () => {
    server = await harness();
    const identity = server.service.issue('owner');
    const connections = await Promise.all([server.modern(identity), server.legacy(identity)]);
    for (const { client } of connections) {
      const listed = await client.listTools();
      for (const tool of entryPoints) expect(listed.tools.find(definition => definition.name === tool)!.description).toContain(VIEWER_LINK_TOOL_GUIDANCE[tool]);
      const created = envelope(await client.callTool({ name: 'kanvas_session_create', arguments: { name: 'First viewer handoff' } }));
      expect(created.orientation?.viewerLink).toBe(viewerLinkGuidanceFor('kanvas_session_create')); expect(created.data).not.toHaveProperty('viewerUrl');
      const sessionId = created.data.id;
      const registered = envelope(await client.callTool({ name: 'kanvas_display_register', arguments: { sessionId, name: 'Intended display', width: 443, height: 823 } }));
      expect(registered.orientation?.viewerLink).toBe(viewerLinkGuidanceFor('kanvas_display_register')); expect(registered.data.revision).toBe(0);
      for (const requestId of ['first-publication', 'next-revision']) {
        const submitted = envelope(await client.callTool({ name: 'kanvas_submit', arguments: { sessionId, displayIds: [registered.data.id], requestId, view: { version: 1, template: 'fact', data: { text: 'Exact supplied content.' } } } }));
        expect(submitted.orientation?.viewerLink).toBe(viewerLinkGuidanceFor('kanvas_submit')); expect(submitted.data.status).toBe('accepted');
        expect(submitted.data).not.toHaveProperty('viewerUrl'); expect(submitted.data).not.toHaveProperty('appliedRevision');
      }
      // This protocol fixture deliberately does not implement locator fields;
      // the adapter must still return the hint without inventing a live URL.
      for (const selected of [{ sessionId, displayId: registered.data.id }, { sessionId }]) {
        const addressed = envelope(await client.callTool({ name: 'kanvas_address_get', arguments: selected }));
        expect(addressed.orientation?.viewerLink).toBe(viewerLinkGuidanceFor('kanvas_address_get')); expect(addressed.data).not.toHaveProperty('viewerUrl');
      }
    }
    const operations = server.service.calls.map(call => call.name);
    expect(operations).not.toContain('kanvas_share_create'); expect(operations).not.toContain('kanvas_pairing_decide'); expect(operations).not.toContain('kanvas_member_add'); expect(operations).not.toContain('kanvas_config_update');
    expect(operations.filter(name => name === 'kanvas_submit')).toHaveLength(4);
  });
});
