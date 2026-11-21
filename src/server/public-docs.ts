import {operationCatalog,helpCatalog,templateCatalog,discoveryToolDefinitions} from './mcp/discovery.js';
import type {Express} from 'express';
import {HELP_PAGES,HELP_TOPICS,type HelpTopic} from '../shared/help.js';
import {KANVAS_VERSION} from '../shared/version.js';
import {TEMPLATE_IDS} from '../shared/types.js';
import {templateNames} from '../shared/template-examples.js';
import {publicExample,publicGuidanceText,type McpProfile} from './mcp/operations.js';
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** Only authored product guidance and public schemas are served. No repository
 * filesystem route, reports, environment, session data or deployment records. */
export function mountPublicDocs(app: Express, publicUrl: string, _profile: McpProfile = 'discovery', docsUrl?: string) {
    const grouped: McpProfile = 'discovery', tools = discoveryToolDefinitions();
    if (docsUrl) {
        const address = new URL(docsUrl);
        if (address.protocol !== 'https:' || address.username || address.password || address.pathname !== '/' || address.search || address.hash)
            throw new Error('The documentation URL must be a credential-free HTTPS origin.');
    }
    const base = `${(docsUrl ?? publicUrl).replace(/\/$/, '')}/docs/`;
    const entries = HELP_TOPICS.map(topic => ({ topic, title: HELP_PAGES[topic].title, description: HELP_PAGES[topic].description, version: KANVAS_VERSION, url: `${base}${topic}`, markdown: `${base}${topic}.md` }));
    app.get('/docs/index.json', (_req, res) => res.json({ title: 'Kanvas Help and public documentation', version: KANVAS_VERSION, primary: base, topics: entries, reference: { url: `${base}reference`, markdown: `${base}reference.md` }, profile: grouped, help: helpCatalog().map(item => ({ id: item.id, description: item.summary, url: `${base}help/${item.id}.json` })), tools: tools.map(x => ({ name: x.name, url: `${base}operations/${x.name}.json` })), templates: TEMPLATE_IDS.map(template => ({ template, title: templateNames[template], url: `${base}templates/${template}.json` })) }));
    app.get('/docs/operations/:name.json', (req, res) => { const definition = tools.find(x => x.name === req.params.name) ?? operationCatalog().find(x => x.id === req.params.name)?.detail(); if (!definition) {
        res.status(404).json({ error: 'Unknown public tool' });
        return;
    } res.json({ version: KANVAS_VERSION, ...definition }); });
    app.get('/docs/templates/:name.json', (req, res) => { const item = templateCatalog().find(item => item.id === `kanvas.template.${req.params.name}`); if (!item) {
        res.status(404).json({ error: 'Unknown public template' });
        return;
    } res.json({ version: KANVAS_VERSION, ...item.detail() }); });
    app.get('/docs/help/:id.json', (req, res) => { const item = helpCatalog().find(item => item.id === req.params.id); if (!item) {
        res.status(404).json({ error: 'Unknown public help topic' });
        return;
    } res.json({ version: KANVAS_VERSION, ...item.detail() }); });
    const reference = () => `# Operation reference\n\nVersion ${KANVAS_VERSION}. Exactly two public MCP tools: kanvas_discover and kanvas_call. Discover uses catalog tools|templates|help and action list|search|get. list returns every visible entry as concise plain text without default pagination. search returns ranked summaries only (default five); get returns the full schema/examples or content of an exact ID. Then call the operation with kanvas_call {operationId, arguments}. Follow explicit response-size safety continuation when present. Previous callable names are rejected; refresh the connector tool list.\n\n${operationCatalog().map(entry => `## ${entry.id}\n\n${entry.summary}\n\n[Full operation contract](${base}operations/${entry.id}.json)\n`).join('\n')}`;
    const prose = (text: string) => publicGuidanceText(text, 'discovery');
    const markdown = (topic: HelpTopic) => { const page = HELP_PAGES[topic]; return `# ${page.title}\n\nVersion ${KANVAS_VERSION}. ${prose(page.description)}\n\n${page.steps.map((x, i) => `${i + 1}. ${prose(x)}`).join('\n\n')}${page.example ? `\n\n## Example\n\n\`\`\`json\n${JSON.stringify(publicExample(page.example, grouped), null, 2)}\n\`\`\`` : ''}\n\n## Related tasks\n\n${entries.filter(x => x.topic !== topic).map(x => `- [${x.title}](${x.url}) — ${x.description}`).join('\n')}\n\n[Operation reference](${base}reference) · [Machine-readable index](${base}index.json)\n`; };
    const html = (md: string, title: string, url = base) => { let code = false; const body = md.split('\n').map(line => { if (line.startsWith('```')) {
        code = !code;
        return code ? '<pre><code>' : '</code></pre>';
    } if (code)
        return `${escape(line)}\n`; if (!line)
        return ''; const escaped = escape(line).replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+|http:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>').replace(/`([^`]+)`/g, '<code>$1</code>'); const anchor = escape(line.replace(/^#+ /, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); if (line.startsWith('## '))
        return `<h2 id="${anchor}">${escaped.slice(3)}</h2>`; if (line.startsWith('# '))
        return `<h1 id="${anchor}">${escaped.slice(2)}</h1>`; return `<p>${escaped}</p>`; }).join('\n'); return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · KANVAS</title><link rel="icon" type="image/svg+xml" href="${escape(publicUrl)}/favicon.svg"><link rel="canonical" href="${escape(url)}"><link rel="alternate" type="application/json" href="${escape(base)}index.json"><style>body{font:18px/1.65 system-ui,sans-serif;max-width:960px;margin:36px auto;padding:0 24px;color:#21252b;background:#fafafa}a{color:#1858a1}h1,h2{line-height:1.2;margin-top:1.7em}pre{background:#e9eef4;padding:20px;overflow:auto}code{font-size:.9em;overflow-wrap:anywhere}nav{display:flex;gap:20px;flex-wrap:wrap}p{overflow-wrap:anywhere}</style></head><body><a href="${escape(base)}" aria-label="Kanvas Help"><img src="${escape(publicUrl)}/brand/kanvas-logo-black.svg" alt="Kanvas" width="170" style="display:block;width:170px;max-width:100%;height:auto;margin-bottom:28px"></a><nav><a href="${escape(base)}">Kanvas Help</a><a href="${escape(base)}index.json">Topic index (JSON)</a><a href="${escape(base)}reference">Operations</a></nav><main>${body}</main></body></html>`; };
    app.get(['/docs', '/docs/'], (_req, res) => res.type('html').send(html(markdown('orientation'), 'Kanvas Help')));
    app.get('/docs/:topic', (req, res) => { const isMarkdown = String(req.params.topic).endsWith('.md'), requestedTopic = String(req.params.topic).replace(/\.md$/, ''), topic = requestedTopic === 'publish' ? 'submit' : requestedTopic; if (topic !== 'reference' && !HELP_TOPICS.includes(topic as HelpTopic)) {
        res.status(404).type('text').send('Documentation topic not found. See /docs/index.json.');
        return;
    } const md = topic === 'reference' ? reference() : markdown(topic as HelpTopic); res.type(isMarkdown ? 'text/markdown' : 'html').send(isMarkdown ? md : html(md, topic === 'reference' ? 'Operation reference' : HELP_PAGES[topic as HelpTopic].title, `${base}${topic}`)); });
}
