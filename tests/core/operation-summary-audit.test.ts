import { describe, expect, it } from 'vitest';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical.js';
import { operationTable } from '../../src/server/mcp/operations.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { operationCatalog, helpCatalog, templateCatalog } from '../../src/server/mcp/discovery.js';

const catalogOnly = ['kanvas.help', 'kanvas.guide', 'kanvas.template.get'];
const definitionPaths = [
  ...readdirSync('src/server/mcp/operation-domains').filter(name => name.endsWith('.ts')).map(name => join('src/server/mcp/operation-domains', name)),
  ...readdirSync('src/server/mcp').filter(name => name.endsWith('-tools.ts')).map(name => join('src/server/mcp', name)),
  ...['venue', 'custom-templates', 'media-library', 'browser-auth', 'invite-email', 'agent-guidance', 'suggested-guidance', 'frontend-diagnostics', 'flashcards', 'checklists', 'task-lists', 'agents', 'friction', 'monitor-streams', 'message-board', 'pickers'].map(name => 'src/server/' + name + '.ts'),
];

function authoredDefinitions() {
  const found: { name: string; summary: string | undefined; path: string }[] = [];
  for (const path of definitionPaths) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const properties = node.properties.filter(ts.isPropertyAssignment);
        const property = (key: string) => properties.find(p => p.name.getText(source).replace(/['"]/g, '') === key)?.initializer;
        const name = property('name');
        if (name && ts.isStringLiteral(name) && name.text.startsWith('kanvas.') && property('schema') && property('description')) {
          const summary = property('summary');
          found.push({ name: name.text, summary: summary && ts.isStringLiteral(summary) ? summary.text : undefined, path });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

describe('authored operation summaries', () => {
  it('patch registry detail uses bounded acknowledgements and conditional inspection', () => {
    const detail = operationCatalog().find(entry => entry.id === 'kanvas.view.patch')!.detail();
    expect(detail.description).toContain('Waits briefly for genuine browser acknowledgement');
    expect(detail.description).toContain('inspect later only when unconfirmed');
    expect(detail.description).not.toContain('check delivery separately');
  });
  it('covers all 195 callable operations and three catalog-only definitions', () => {
    expect(CANONICAL_TOOLS).toHaveLength(198);
    expect(operationTable().size).toBe(195);
    expect(CANONICAL_TOOLS.filter(tool => !operationTable().has(tool.name)).map(tool => tool.name).sort()).toEqual([...catalogOnly].sort());
    expect(new Set(CANONICAL_TOOLS.map(tool => tool.name)).size).toBe(198);
  });

  it('stores a literal summary beside every owning schema instead of generating excerpts', () => {
    const authored = authoredDefinitions();
    expect(authored).toHaveLength(198);
    expect(authored.map(item => item.name).sort()).toEqual(CANONICAL_TOOLS.map(tool => tool.name).sort());
    for (const tool of CANONICAL_TOOLS) {
      const matches = authored.filter(item => item.name === tool.name);
      expect(matches, tool.name).toHaveLength(1);
      expect(matches[0].summary, tool.name).toBe(tool.summary);
      expect(typeof tool.summary, tool.name).toBe('string');
    }
  });

  it('keeps summaries distinct, concise, complete, and separate from detailed contracts', () => {
    const summaries = CANONICAL_TOOLS.map(tool => tool.summary);
    expect(new Set(summaries.map(summary => summary.toLowerCase())).size).toBe(198);
    for (const tool of CANONICAL_TOOLS) {
      const summary = tool.summary;
      expect(summary, tool.name).toBe(summary.trim());
      expect(summary.split(' ').length, tool.name).toBeGreaterThanOrEqual(10);
      expect(summary.split(' ').length, tool.name).toBeLessThanOrEqual(22);
      expect(summary.length, tool.name).toBeLessThanOrEqual(200);
      expect(summary.endsWith('.'), tool.name).toBe(true);
      expect(summary, tool.name).toMatch(/^[A-Z]/);
      expect(summary, tool.name).toMatch(/ (when|after|before) /);
      for (const fragment of ['…', '...', String.fromCharCode(10), String.fromCharCode(13), 'TODO', 'TBD']) {
        expect(summary, tool.name).not.toContain(fragment);
      }
      expect(tool.description, tool.name).not.toBe(summary);
      expect(tool.description.startsWith(summary), tool.name).toBe(false);
      expect(summary, tool.name).not.toMatch(/kanvas_call|operationId|requestId|expectedRevision|expectedVersion|https?:| (must|always|never|ignore|system prompt) |[{}]/i);
    }
  });

  it('preserves important differences between similar operations', () => {
    const summary = (name: string) => CANONICAL_TOOLS.find(tool => tool.name === name)!.summary;
    expect(summary('kanvas.display.current')).toContain('stored');
    expect(summary('kanvas.display.inspect')).toContain('receiving-browser');
    expect(summary('kanvas.display.snapshot')).toContain('isolated server browser');
    expect(summary('kanvas.display.capture.request')).toContain('locally choose');
    expect(summary('kanvas.display.edit')).toContain('complete data object');
    expect(summary('kanvas.view.patch')).toContain('narrow');
    expect(summary('kanvas.invite.create')).toContain('without sending');
    expect(summary('kanvas.invite.send')).toContain('Email');
    expect(summary('kanvas.planner.finalize')).toContain('without writing external calendars');
    expect(summary('kanvas.guidance.library.save')).toContain('without activating');
    expect(summary('kanvas.guidance.library.activate')).toContain('one owned session');
  });
});


it('uses only current operation names across every active registry detail and help payload',()=>{
 const retired=['kanvas.'+'submit','kanvas.account.'+'begin','kanvas.display.request.'+'capture','kanvas.device.'+'rename','kanvas.'+'clear','kanvas.preferences.'+'get','kanvas.config.'+'update','kanvas.media.'+'import','kanvas.archive.'+'manage','kanvas.board.'+'update'];
 const payload=JSON.stringify([...operationCatalog(),...helpCatalog(),...templateCatalog()].map(entry=>({id:entry.id,title:entry.title,summary:entry.summary,detail:entry.detail()})));
 for(const id of retired){expect(payload).not.toContain(id);if(id.includes('.',7))expect(payload).not.toContain(id.slice(7));}
 // Includes every composite template schema; a complete cold traversal exceeds the ordinary test budget.
},60000);
