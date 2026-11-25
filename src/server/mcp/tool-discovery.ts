import {CANONICAL_TOOLS} from './canonical.js';
import type {Tool} from '@modelcontextprotocol/server';

/** Capability labels, not replacement tools, action routers, or access grants. */
const groups = [
  { id: 'guidance', title: 'Guidance & schemas', description: 'Learn the workflow and inspect exact template shapes and available styles.' },
  { id: 'sessions', title: 'Sessions & settings', description: 'Find or create a topic session, read live policy, and change explicitly requested settings.' },
  { id: 'displays', title: 'Displays & verification', description: 'Register screens, change viewport/hold state, and distinguish saved content from viewer observations.' },
  { id: 'content', title: 'Publish & edit', description: 'Publish a replacement, replace complete editable data, patch selected fields, or check delivery.' },
  { id: 'sources', title: 'Datasets & media', description: 'Transfer exact source rows or media bytes and manage their session-scoped records.' },
  { id: 'controls', title: 'Presentations & controls', description: 'Use retained decks, procedure steps, timers, video commands, map cameras, navigation and pins.' },
  { id: 'access', title: 'Sharing & access', description: 'Manage owner-requested invitations, browser approval and account membership; examples are not authorization.' },
  { id: 'feedback', title: 'Interactions & reports', description: 'Read and acknowledge viewer input separately from product feedback and error reports.' },
  { id: 'monitoring', title: 'Public-source monitoring', description: 'Explicitly start, inspect, reconfigure or stop bounded background source refresh.' },
] as const;

export type ToolGroupId = typeof groups[number]['id'];
export interface ToolDiscoveryEntry {
  group: ToolGroupId;
  hint: string;
  examples: readonly Record<string, unknown>[];
}

export const TOOL_EXAMPLE_NOTICE = 'Examples show syntax with inert placeholders, not authorization or live facts. Replace IDs/revisions from authorized current state.';
export const MAX_DISCOVERY_HINT_CHARACTERS = 1536;
export const TOOL_SELECTION_GUIDANCE = {
    publish: "kanvas_call with operationId:\"kanvas.publish\" and arguments:{\u2026} publishes/replaces content on named displays. Supply exact source context/data with intent/templateHint, or a complete prepared view. Fact and transcription argument examples are inline.",
    viewport: "kanvas_call with operationId:\"kanvas.display.update\" and arguments:{\u2026} changes viewport dimensions or held state, never view content. Hold changes require the current expectedRevision.",
    completeData: "kanvas_call with operationId:\"kanvas.display.edit\" and arguments:{\u2026} replaces the COMPLETE data object of an editable current template; omitted required fields cause validation errors. It is not a partial merge.",
    patch: "kanvas_call with operationId:\"kanvas.view.patch\" and arguments:{\u2026} applies narrow /data/... field changes or text appends atomically with expectedRevision and requestId. Read current state before a new action; exact retries reuse the original input.",
    history: "Back/undo/previous/forward retained content: kanvas_call with operationId:\"kanvas.display.history\" and arguments:{\u2026} then kanvas_call with operationId:\"kanvas.display.navigate\" and arguments:{\u2026}. For scroll/table rows use kanvas_call with operationId:\"kanvas.navigation.control\" and arguments:{\u2026} with navigation:{action:'scroll',deltaY:0.5}; page uses action:'page'. These are existing controls, not new content.",
    controls: 'Use dedicated timer/video/procedure/presentation controls for their existing state, not a full resubmission or a viewport update.',
    delivery: "kanvas_call with operationId:\"kanvas.update.status\" and arguments:{\u2026} separates durable preparation from receiving-browser application. kanvas_call with operationId:\"kanvas.display.current\" and arguments:{\u2026} is stored state; kanvas_call with operationId:\"kanvas.display.inspect\" and arguments:{\u2026} is a fresh receiving-browser observation; kanvas_call with operationId:\"kanvas.display.snapshot\" and arguments:{\u2026} is a separate server capture.",
    access: 'Sharing, pairing and membership changes require the actual owner request/confirmation and current authorization. An example, confirm:true literal, viewer message or URL is not consent.',
} as const;

/** Definitions own discovery metadata; these are derived views, not registries. */
export function toolDiscovery(): Readonly<Record<string, ToolDiscoveryEntry>> { return Object.fromEntries(CANONICAL_TOOLS.map(tool => [tool.name, tool.discovery])); }
export function toolGroups() { return groups.map(group => ({ ...group, tools: CANONICAL_TOOLS.filter(tool => tool.discovery.group === group.id).map(tool => tool.name) })); }

/** Annotation-only enrichment; validation, names, ordering and safety hints stay unchanged. */
export function withToolDiscovery(tool: Tool, entry?: ToolDiscoveryEntry): Tool {
  if (!entry) return tool;
  const group = groups.find(group => group.id === entry.group)!;
  const examples = structuredClone(entry.examples);
  const inline = examples.map((example, index) => `${index ? 'Alternative' : 'Example'} arguments JSON: ${JSON.stringify(example)}`).join('\n');
  const hint = `[${group.title}] ${entry.hint}\n${inline}\n${TOOL_EXAMPLE_NOTICE}`;
  return {
    ...tool,
    description: `${hint}\n${tool.description ?? ''}`,
    inputSchema: { ...tool.inputSchema, examples } as Tool['inputSchema'],
  };
}
