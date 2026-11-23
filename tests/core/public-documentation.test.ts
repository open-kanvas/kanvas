import express from 'express';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {mountPublicDocs} from '../../src/server/public-docs.js';
import {operationCatalog} from '../../src/server/mcp/discovery.js';

describe('public documentation', () => {
  it('serves every operation alphabetically in HTML and markdown without authentication, without reordering discovery', async () => {
    const before = operationCatalog().map(entry => entry.id);
    const app = express(); mountPublicDocs(app, 'http://127.0.0.1');
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(done => server.once('listening', done));
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('No listener');
      const base = 'http://127.0.0.1:' + address.port;
      const markdown = await fetch(base + '/docs/reference.md');
      const html = await fetch(base + '/docs/reference');
      expect(markdown.status).toBe(200); expect(html.status).toBe(200);
      expect(markdown.headers.get('content-type')).toContain('text/markdown');
      expect(html.headers.get('content-type')).toContain('text/html');
      const ids = [...(await markdown.text()).matchAll(/^## (kanvas\.[^\n]+)$/gm)].map(match => match[1]);
      const htmlIds = [...(await html.text()).matchAll(/<h2 id="[^"]+">(kanvas\.[^<]+)<\/h2>/g)].map(match => match[1]);
      expect(ids).toEqual([...before].sort()); expect(htmlIds).toEqual(ids);
      expect(new Set(ids).size).toBe(before.length);
      expect(operationCatalog().map(entry => entry.id)).toEqual(before);
    } finally { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); }
  });
  it('keeps newcomer documentation links valid and removes the redundant mission copy', () => {
    for (const file of ['README.md','CONTRIBUTING.md','SECURITY.md','docs/README.md','docs/display/design-principles.md','docs/templates/README.md','docs/licenses/README.md','docs/operations/self-hosting.md']) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('mission.md');
      for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (!target || /^[a-z]+:/i.test(target) || target.startsWith('/')) continue;
        expect(existsSync(resolve(dirname(file), target)), file + ': ' + target).toBe(true);
      }
    }
    expect(existsSync('docs/mission.md')).toBe(false);
    const readme = readFileSync('README.md','utf8');
    expect(readme).toContain('free to try'); expect(readme).toContain('https://kanvas.host/docs/reference');
    expect(readme).not.toMatch(/while you speak|while you are still talking|~190|will not be merged/);
    expect(readFileSync('SECURITY.md','utf8')).toContain('mailto:kanvas@open-kanvas.ai');
  });
});
