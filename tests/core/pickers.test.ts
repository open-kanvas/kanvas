import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { samples } from '../../src/shared/template-examples.js';
import { projectTasks } from '../../src/shared/task-list.js';
import { STREAM_BURST } from '../../src/server/monitor-streams.js';
import { STREAM_EVENT_BYTES } from '../../src/server/monitor-streams.js';
import { STREAM_MAX_EVENTS } from '../../src/server/monitor-streams.js';
import { sanitizeSvg } from '../../src/server/pickers.js';
import { iconifyBase } from '../../src/server/pickers.js';
import { readCapped } from '../../src/server/pickers.js';
import { PICKER_CACHE_BYTES } from '../../src/server/pickers.js';
import { PICKER_ICON_BYTES } from '../../src/server/pickers.js';
import { PICKER_FONT_BYTES } from '../../src/server/pickers.js';
import { precachePickers } from '../../scripts/picker-precache.js';
import { mkdtemp } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FONT_FAMILIES } from '../../src/shared/pickers.js';
import { ICON_SETS } from '../../src/shared/pickers.js';
import { iconUrl } from '../../src/shared/pickers.js';
import { iconId } from '../../src/shared/pickers.js';
import { fontUrl } from '../../src/shared/pickers.js';
import { colourTokens } from '../../src/shared/colour.js';
import { contrastGrade } from '../../src/shared/colour.js';
import { contrastRatio } from '../../src/shared/colour.js';
import { harmonies } from '../../src/shared/colour.js';
import { hexToOklch } from '../../src/shared/colour.js';
import { namedColours } from '../../src/shared/colour.js';
import { NAMED_GROUPS } from '../../src/shared/colour.js';
import { oklchToHex } from '../../src/shared/colour.js';
import { resolveColour } from '../../src/shared/colour.js';
import { roleSteps } from '../../src/shared/colour.js';
import { seedTheme } from '../../src/shared/colour.js';
import { shadeGrid } from '../../src/shared/colour.js';
import { variations } from '../../src/shared/colour.js';
import { CSS_NAMED } from '../../src/shared/colour-palettes.js';
import { OPEN_COLOR } from '../../src/shared/colour-palettes.js';
import { RADIX_DARK } from '../../src/shared/colour-palettes.js';
import { RADIX_LIGHT } from '../../src/shared/colour-palettes.js';
import { TAILWIND } from '../../src/shared/colour-palettes.js';
import { jsonPathLine } from '../../src/shared/connection-views.js';
import { prettyJson } from '../../src/shared/connection-views.js';
import { jsonDataSchema } from '../../src/shared/connection-views.js';
import { HUMAN_INVITATION } from '../../src/shared/philosophy.js';
import { safeError } from '../../src/server/mcp/results.js';
import { recordHttpOperation } from '../../src/server/raw-events.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { z } from 'zod';
import { viewSchema } from '../../src/shared/view-schemas.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { NOT_A_SLIDE } from '../../src/shared/view-schemas.js';
import { compactSchemaReferences } from '../../src/shared/json-schema.js';
import { MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { publishInputSchema } from '../../src/shared/publish-input.js';
import { splitGrid } from '../../src/shared/split-screen.js';
import { splitLeaves } from '../../src/shared/split-screen.js';
import { splitDivider } from '../../src/shared/split-screen.js';
import { SPLIT_LIMITS } from '../../src/shared/split-screen.js';
import { redactStreamAddress } from '../../src/shared/monitor-stream-view.js';
import { streamRows } from '../../src/shared/monitor-stream-view.js';
import { formatDuration } from '../../src/shared/monitor-stream-view.js';
import type { StreamViewEvent } from '../../src/shared/monitor-stream-view.js';
import { boundStreamIds } from '../../src/server/monitor-streams.js';
import { STREAM_WAIT_MS } from '../../src/server/monitor-streams.js';
import { pointingSummary } from '../../src/shared/pointing.js';
import { POINTER_FADE_MS } from '../../src/shared/pointing.js';
import { POINTER_PIN_MS } from '../../src/shared/pointing.js';
import { POINTING_QUEUE } from '../../src/shared/pointing.js';
import { POINTING_BLOCK_EVENTS } from '../../src/shared/pointing.js';
import { applyResponsePolicy } from '../../src/server/mcp/response-policy.js';
import { ContactLedger } from '../../src/server/mcp/response-policy.js';
import { BOARD_DISCLOSURE } from '../../src/shared/message-board.js';
import { BOARD_LIMITS } from '../../src/shared/message-board.js';
import { parseIconId } from '../../src/shared/pickers.js';
import { isPickerIconUrl } from '../../src/shared/pickers.js';
import { iconPickerDataSchema } from '../../src/shared/pickers.js';
import { fontPickerDataSchema } from '../../src/shared/pickers.js';
import { taskCustomColumns } from '../../src/shared/task-list.js';
import { isBuiltinTaskColumn } from '../../src/shared/task-list.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { textScale } from '../../src/shared/reading.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
import { sharingLevel } from '../../src/server/account-overview.js';
import { HELP_PAGES as HELP } from '../../src/shared/help.js';
import { HELP_TOPICS } from '../../src/shared/help.js';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';

describe("pickers coverage 1", () => {
    describe('e011b35b pickers: allowlisted sources, sanitised, bounded, proxy can be off', () => {
        let h!: Harness, o: Browser, p: {
            userId: string;
        };
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z"/></svg>';
        const woff2 = Buffer.concat([Buffer.from('wOF2', 'latin1'), Buffer.alloc(64)]);
        beforeEach(async () => { h = await startHarness(); o = await h.account(); p = { userId: o.user!.id }; });
        afterEach(async () => { await h?.close(); });
        const respond = (body: string | Buffer, type: string) => new Response(body as never, { status: 200, headers: { 'content-type': type } });
        it('SVG is refused when it could run, load or reference anything', () => {
            expect(sanitizeSvg(`<!-- @license x -->\n${svg}`)).toBe(svg);
            for (const bad of ['<svg><script>alert(1)</script></svg>', '<svg onload="x()"><path d=""/></svg>', '<svg><a href="https://e.example"><path d=""/></a></svg>', '<svg><image href="https://e.example/x.png"/></svg>', '<svg><use href="#a"/></svg>', '<svg><style>@import url(x)</style></svg>', '<svg><path style="fill:url(https://e.example)" d=""/></svg>', '<svg><foreignObject><p>x</p></foreignObject></svg>', '<html></html>', '<svg><path d=""/>'])
                expect(sanitizeSvg(bad), bad).toBeUndefined();
        });
        it('every outbound address is built from the allowlist; invalid names never leave the server', async () => {
            const pickers = h.runtime.service.pickers, requested: string[] = [];
            pickers.fetcher = async (url) => { requested.push(url); return url.endsWith('package.json') ? respond(JSON.stringify({ license: 'OFL-1.1' }), 'application/json') : url.endsWith('.woff2') ? respond(woff2, 'font/woff2') : respond(svg, 'image/svg+xml'); };
            expect((await pickers.icon('lucide', 'outline', 'settings'))?.type).toMatch(/^image\/svg\+xml/);
            expect(requested).toEqual([`https://cdn.jsdelivr.net/npm/lucide-static@${ICON_SETS.lucide.version}/icons/settings.svg`]);
            await pickers.icon('lucide', 'outline', 'settings');
            expect(requested).toHaveLength(1);
            for (const [set, variant, name] of [['evil', 'outline', 'x'], ['lucide', 'outline', '../../etc/passwd'], ['lucide', 'outline', 'a/b'], ['lucide', 'nope', 'settings'], ['lucide', 'outline', 'http:example.com'], ['lucide', 'outline', 'x'.repeat(80)], ['lucide', 'outline', 'A%2e%2e']])
                expect(await pickers.icon(set, variant, name)).toBeUndefined();
            expect(requested).toHaveLength(1);
            expect((await pickers.font('inter', 400))?.type).toBe('font/woff2');
            expect(requested.slice(1)).toEqual(['https://cdn.jsdelivr.net/npm/@fontsource/inter@5/package.json', 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-400-normal.woff2']);
            for (const [family, weight] of [['../x', 400], ['inter', 450], ['Inter', 400], ['a.b', 400]] as const)
                expect(await pickers.font(family, weight)).toBeUndefined();
            expect(requested).toHaveLength(3);
            expect(requested.every(url => url.startsWith('https://cdn.jsdelivr.net/npm/'))).toBe(true);
            expect(iconUrl({ set: 'lucide', name: 'settings' })).toBe('/api/picker/icons/lucide/outline/settings.svg');
            expect(iconId({ set: 'phosphor', name: 'gear', variant: 'bold' })).toBe('phosphor:gear/bold');
            expect(fontUrl('lato', 700)).toBe('/api/picker/fonts/lato/700.woff2');
            expect(fontUrl('inter', 700)).toBe('/api/picker/fonts/inter/variable.woff2');
        });
        it('unsafe, oversized or mislabelled responses are not served; a closed licence is refused; the cache is bounded', async () => {
            const pickers = h.runtime.service.pickers;
            pickers.fetcher = async () => respond('<svg><script>1</script></svg>', 'image/svg+xml');
            expect(await pickers.icon('tabler', 'outline', 'settings')).toBeUndefined();
            pickers.fetcher = async () => respond('x'.repeat(200000), 'image/svg+xml');
            expect(await pickers.icon('tabler', 'outline', 'alarm')).toBeUndefined();
            pickers.fetcher = async (url) => url.endsWith('package.json') ? respond(JSON.stringify({ license: 'Proprietary' }), 'application/json') : respond(woff2, 'font/woff2');
            expect(await pickers.font('secret-sans', 400)).toBeUndefined();
            expect((await h.runtime.service.execute("kanvas.fonts.list", { family: 'secret-sans' }, p) as {
                available: boolean;
            }).available).toBe(false);
            pickers.fetcher = async (url) => url.endsWith('package.json') ? respond(JSON.stringify({ license: 'OFL-1.1' }), 'application/json') : respond('<html>not a font</html>', 'text/html');
            expect(await pickers.font('lato', 400)).toBeUndefined();
            pickers.fetcher = async () => { throw new Error('network down'); };
            expect(await pickers.icon('lucide', 'outline', 'wifi')).toBeUndefined();
            expect(PICKER_CACHE_BYTES).toBeLessThanOrEqual(64 * 1024 * 1024);
        });
        it('the size limit is enforced while the body arrives: an oversized chunked answer with no length is cancelled early and the rest is never read', async () => {
            // Parent review 2026-11-11: the limit used to be checked after the whole body had been buffered.
            const chunked = (chunks: number, chunkBytes: number, headers: Record<string, string> = {}, first?: Uint8Array) => {
                const state = { pulled: 0, cancelled: false };
                const body = new ReadableStream<Uint8Array>({ pull(controller) { if (state.pulled >= chunks) {
                        controller.close();
                        return;
                    } const chunk = state.pulled === 0 && first ? first : new Uint8Array(chunkBytes).fill(120); state.pulled++; controller.enqueue(chunk); }, cancel() { state.cancelled = true; } }, { highWaterMark: 0 });
                return { state, response: new Response(body, { status: 200, headers }) };
            };
            // 1000 chunks of 16 KiB (16 MB) against the 64 KiB icon limit, no Content-Length.
            const big = chunked(1000, 16 * 1024);
            expect(big.response.headers.get('content-length')).toBeNull();
            expect(await readCapped(big.response, PICKER_ICON_BYTES)).toBeUndefined();
            expect(big.state.cancelled).toBe(true);
            expect(big.state.pulled).toBeLessThanOrEqual(6);
            // A declared length that is untrue does not help either.
            const lying = chunked(1000, 16 * 1024, { 'content-length': '100' });
            expect(await readCapped(lying.response, PICKER_ICON_BYTES)).toBeUndefined();
            expect(lying.state.cancelled).toBe(true);
            expect(lying.state.pulled).toBeLessThanOrEqual(6);
            // A declared length above the limit is refused without reading anything.
            const declared = chunked(10, 1024, { 'content-length': String(PICKER_ICON_BYTES + 1) });
            expect(await readCapped(declared.response, PICKER_ICON_BYTES)).toBeUndefined();
            expect(declared.state.pulled).toBe(0);
            expect(declared.state.cancelled).toBe(true);
            // Under the limit, chunked and without a length, the exact bytes come back; exactly at the limit is still allowed.
            const small = chunked(3, 1000);
            const read = await readCapped(small.response, PICKER_ICON_BYTES);
            expect(read?.length).toBe(3000);
            expect(read!.every(byte => byte === 120)).toBe(true);
            expect(small.state.cancelled).toBe(false);
            expect((await readCapped(chunked(4, 16 * 1024).response, PICKER_ICON_BYTES))?.length).toBe(PICKER_ICON_BYTES);
            expect(await readCapped(chunked(5, 16 * 1024).response, PICKER_ICON_BYTES)).toBeUndefined();
            // Through the server's own fetch path: icon, font and catalogue requests all stop early, and a small chunked icon is served.
            const pickers = h.runtime.service.pickers as unknown as {
                iconify?: string;
                fetcher: (url: string, signal: AbortSignal) => Promise<Response>;
                icon: (set: string, variant: string, name: string) => Promise<{
                    bytes: number;
                } | undefined>;
                font: (family: string, weight: number) => Promise<unknown>;
            };
            let last = chunked(0, 0);
            pickers.fetcher = async (url) => { if (url.endsWith('package.json'))
                return respond(JSON.stringify({ license: 'OFL-1.1' }), 'application/json'); last = chunked(1000, 16 * 1024); return last.response; };
            expect(await pickers.icon('lucide', 'outline', 'huge')).toBeUndefined();
            expect(last.state.cancelled).toBe(true);
            expect(last.state.pulled).toBeLessThanOrEqual(6);
            expect(await pickers.font('lato', 400)).toBeUndefined();
            expect(last.state.cancelled).toBe(true);
            expect(last.state.pulled).toBeLessThanOrEqual(Math.ceil(PICKER_FONT_BYTES / (16 * 1024)) + 2);
            const encoded = new TextEncoder().encode(svg);
            pickers.fetcher = async () => { last = chunked(1, encoded.length, {}, encoded); return last.response; };
            expect((await pickers.icon('lucide', 'outline', 'small-chunked'))?.bytes).toBe(svg.length);
            expect(last.state.cancelled).toBe(false);
            // Redirects are still refused and the deadline still applies while a body trickles in.
            pickers.fetcher = async () => Object.defineProperty(respond(svg, 'image/svg+xml'), 'redirected', { value: true });
            expect(await pickers.icon('lucide', 'outline', 'redirected')).toBeUndefined();
            pickers.fetcher = async (_url, signal) => new Response(new ReadableStream<Uint8Array>({ start(controller) { signal.addEventListener('abort', () => controller.error(new Error('aborted'))); } }), { status: 200 });
            const controller = new AbortController();
            const stalled = readCapped(await pickers.fetcher('x', controller.signal), PICKER_ICON_BYTES);
            controller.abort();
            await expect(stalled).rejects.toBeTruthy();
        });
        it('with the proxy switched off nothing is fetched and the answer says why', async () => {
            const pickers = h.runtime.service.pickers as unknown as {
                proxy: boolean;
                fetcher: (url: string) => Promise<Response>;
            };
            let fetched = 0;
            pickers.proxy = false;
            pickers.fetcher = async () => { fetched++; return respond(svg, 'image/svg+xml'); };
            expect(await h.runtime.service.pickers.icon('lucide', 'outline', 'settings')).toBeUndefined();
            const result = await h.runtime.service.execute("kanvas.icons.search", { query: 'settings' }, p) as {
                icons: unknown[];
                unavailableSets: string[];
                unavailableReason: string;
            };
            expect(result.icons).toEqual([]);
            expect(result.unavailableSets).toHaveLength(5);
            expect(result.unavailableReason).toMatch(/disabled/);
            expect(fetched).toBe(0);
        });
        it('search returns exact set:name ids and a ready view; assets need a signed-in browser', async () => {
            const pickers = h.runtime.service.pickers;
            pickers.fetcher = async (url) => url.includes('data.jsdelivr.com') ? respond(JSON.stringify({ files: url.includes('lucide-static') ? [{ name: '/icons/settings.svg' }, { name: '/icons/settings-2.svg' }, { name: '/icons/sun.svg' }] : url.includes('heroicons') ? [{ name: '/24/outline/cog-6-tooth.svg' }, { name: '/24/solid/cog-6-tooth.svg' }] : url.includes('tabler') ? [{ name: '/icons/outline/settings.svg' }, { name: '/icons/filled/settings.svg' }] : [] }), 'application/json') : url.endsWith('tags.json') ? respond(JSON.stringify({ sun: ['brightness', 'weather'] }), 'application/json') : respond(svg, 'image/svg+xml');
            const result = await h.runtime.service.execute("kanvas.icons.search", { query: 'settings', limit: 6 }, p) as {
                icons: {
                    id: string;
                    variants: string[];
                    licence: string;
                    image: string;
                }[];
                view: {
                    template: string;
                };
            };
            expect(result.icons.map(icon => icon.id).sort()).toEqual(['lucide:settings', 'lucide:settings-2', 'tabler:settings']);
            expect(result.icons.find(icon => icon.id === 'tabler:settings')).toMatchObject({ variants: ['outline', 'filled'], licence: 'MIT', image: '/api/picker/icons/tabler/outline/settings.svg' });
            expect(validateView(result.view as never).template).toBe('icon-picker');
            expect((await h.runtime.service.execute("kanvas.icons.search", { query: 'weather', sets: ['lucide'] }, p) as {
                icons: {
                    id: string;
                }[];
            }).icons.map(icon => icon.id)).toEqual(['lucide:sun']);
            const anonymous = await h.browser().raw('/api/picker/icons/lucide/outline/settings.svg');
            expect(anonymous.status).toBe(401);
            const served = await o.raw('/api/picker/icons/lucide/outline/settings.svg');
            expect(served.status).toBe(200);
            expect(served.headers.get('content-type')).toMatch(/^image\/svg\+xml/);
            expect(served.headers.get('x-content-type-options')).toBe('nosniff');
            expect(served.headers.get('content-security-policy')).toMatch(/default-src 'none'/);
            expect((await o.raw('/api/picker/icons/lucide/outline/..%2f..%2fsecret.svg')).status).toBe(404);
            const fonts = await h.runtime.service.execute("kanvas.fonts.list", { category: 'mono' }, p) as {
                families: {
                    id: string;
                    variable: boolean;
                    weightRange?: number[];
                }[];
                view: unknown;
            };
            expect(fonts.families.map(f => f.id)).toEqual(['jetbrains-mono', 'fira-code', 'ibm-plex-mono', 'source-code-pro']);
            expect(validateView(fonts.view as never).template).toBe('font-picker');
            expect(fonts.families.map(f => f.variable)).toEqual([true, true, false, true]);
            expect(fonts.families[0].weightRange).toEqual([100, 800]);
        });
        it('variable fonts: one file per curated variable family from its own package; static families and unknown ids never get one', async () => {
            const pickers = h.runtime.service.pickers, requested: string[] = [];
            pickers.fetcher = async (url) => { requested.push(url); return url.endsWith('package.json') ? respond(JSON.stringify({ license: 'OFL-1.1' }), 'application/json') : respond(woff2, 'font/woff2'); };
            expect((await pickers.font('inter', 'variable'))?.type).toBe('font/woff2');
            expect(requested).toEqual(['https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5/package.json', 'https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5/files/inter-latin-wght-normal.woff2']);
            for (const family of ['lato', 'poppins', 'not-curated', '../x'])
                expect(await pickers.font(family, 'variable'), family).toBeUndefined();
            expect(requested).toHaveLength(2);
            expect((await o.raw('/api/picker/fonts/inter/variable.woff2')).status).toBe(200);
            expect((await o.raw('/api/picker/fonts/lato/variable.woff2')).status).toBe(404);
            expect((await o.raw('/api/picker/fonts/inter/variable.ttf')).status).toBe(404);
            expect((await h.browser().raw('/api/picker/fonts/inter/variable.woff2')).status).toBe(401);
            // 21 of the 28 curated families publish a variable edition; each range is whole hundreds inside 100 to 900.
            const variable = Object.values(FONT_FAMILIES).filter(font => font.variable);
            expect(variable).toHaveLength(21);
            expect(Object.keys(FONT_FAMILIES)).toHaveLength(28);
            for (const font of variable) {
                expect(font.variable![0]).toBeGreaterThanOrEqual(100);
                expect(font.variable![1]).toBeLessThanOrEqual(900);
                expect(font.weights).toEqual(Array.from({ length: (font.variable![1] - font.variable![0]) / 100 + 1 }, (_, i) => font.variable![0] + i * 100));
            }
        });
        it('the wider catalogue exists only where the operator configured an Iconify API; only permissive single-colour collections are listed or served', async () => {
            const pickers = h.runtime.service.pickers as unknown as {
                iconify?: string;
                fetcher: (url: string) => Promise<Response>;
            }, requested: string[] = [];
            const none = await h.runtime.service.execute("kanvas.icons.search", { query: 'settings', sets: ['iconify'] }, p) as {
                icons: unknown[];
                unavailableSets: string[];
                unavailableReason: string;
            };
            expect(none.icons).toEqual([]);
            expect(none.unavailableSets).toEqual(['iconify']);
            expect(none.unavailableReason).toMatch(/No Iconify API is configured/);
            expect((await o.raw('/api/picker/icons/iconify/mdi/cog.svg')).status).toBe(404);
            pickers.iconify = 'https://icons.internal.example';
            const collections = { mdi: { name: 'Material Design Icons', total: 7447, license: { spdx: 'Apache-2.0' }, palette: false }, carbon: { name: 'Carbon', total: 2000, license: { spdx: 'Apache-2.0' } }, 'fa6-solid': { name: 'Font Awesome', total: 1400, license: { spdx: 'CC-BY-4.0' } }, noto: { name: 'Noto Emoji', total: 3000, license: { spdx: 'Apache-2.0' }, palette: true }, 'gpl-set': { name: 'Copyleft', total: 10, license: { spdx: 'GPL-3.0' } }, lucide: { name: 'Lucide', total: 1600, license: { spdx: 'ISC' } }, unknown: { name: 'No licence', total: 5 } };
            pickers.fetcher = async (url) => { requested.push(url); return url.endsWith('/collections') ? respond(JSON.stringify(collections), 'application/json') : url.includes('/search?') ? respond(JSON.stringify({ icons: ['mdi:cog', 'fa6-solid:gear', 'noto:gear', 'mdi:cog-outline', 'gpl-set:cog', 'lucide:settings', 'unknown:cog', 'mdi:../../x', 'carbon:settings', 'mdi:a:b'], total: 10 }), 'application/json') : respond(svg, 'image/svg+xml'); };
            const result = await h.runtime.service.execute("kanvas.icons.search", { query: 'settings', sets: ['iconify'], limit: 10 }, p) as {
                icons: {
                    id: string;
                    set: string;
                    name: string;
                    collection: string;
                    licence: string;
                    image: string;
                }[];
                sets: Record<string, {
                    collections: Record<string, {
                        licence: string;
                    }>;
                }>;
                view: {
                    template: string;
                    data: {
                        icons: unknown[];
                    };
                };
            };
            expect(result.icons.map(icon => icon.id)).toEqual(['mdi:cog', 'mdi:cog-outline', 'carbon:settings']);
            expect(result.icons[0]).toMatchObject({ set: 'iconify', name: 'mdi:cog', collection: 'mdi', licence: 'Apache-2.0', image: '/api/picker/icons/iconify/mdi/cog.svg' });
            expect(Object.keys(result.sets.iconify.collections)).toEqual(['mdi', 'carbon']);
            expect(validateView(result.view as never).template).toBe('icon-picker');
            expect(result.view.data.icons[0]).toEqual({ set: 'iconify', name: 'mdi:cog' });
            expect(requested).toEqual(['https://icons.internal.example/collections', 'https://icons.internal.example/search?query=settings&limit=64']);
            const narrowed = await h.runtime.service.execute("kanvas.icons.search", { query: 'carbon,fa6-solid: two words' }, p) as {
                icons: {
                    id: string;
                }[];
            };
            expect(narrowed.icons.map(icon => icon.id)).toEqual(['carbon:settings']);
            expect(requested.at(-1)).toBe('https://icons.internal.example/search?query=two%20words&limit=64&prefixes=carbon');
            const before = requested.length;
            expect((await o.raw('/api/picker/icons/iconify/mdi/cog.svg')).status).toBe(200);
            expect(requested.slice(before)).toEqual(['https://icons.internal.example/mdi/cog.svg']);
            for (const refused of ['fa6-solid/gear', 'noto/gear', 'gpl-set/cog', 'lucide/settings', 'unknown/cog', 'nope/cog', 'mdi/..%2f..%2fx'])
                expect((await o.raw(`/api/picker/icons/iconify/${refused}.svg`)).status, refused).toBe(404);
            expect(requested.slice(before)).toHaveLength(1);
            expect((await h.browser().raw('/api/picker/icons/iconify/mdi/cog.svg')).status).toBe(401);
            pickers.fetcher = async (url) => url.endsWith('.svg') ? respond('<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="a"/></defs><path fill="url(#a)" d="M0 0"/></svg>', 'image/svg+xml') : respond(JSON.stringify(collections), 'application/json');
            expect((await o.raw('/api/picker/icons/iconify/mdi/gradient.svg')).status).toBe(404);
            for (const [value, expected] of [['https://icons.example/', 'https://icons.example'], ['http://127.0.0.1:3000/iconify/', 'http://127.0.0.1:3000/iconify'], ['ftp://icons.example', undefined], ['https://user:pw@icons.example', undefined], ['https://icons.example/?x=1', undefined], ['not a url', undefined], ['', undefined], [undefined, undefined]] as const)
                expect(iconifyBase(value), String(value)).toBe(expected);
        });
        it('offline: a directory filled by the pre-cache script serves fonts, icons and search with the proxy off and no request leaves the server', async () => {
            const directory = await mkdtemp(join(tmpdir(), 'kanvas-picker-precache-')), fetched: string[] = [];
            try {
                const report = await precachePickers({ directory, icons: ['lucide'], concurrency: 4, fetcher: async (url) => {
                        fetched.push(url);
                        if (url.includes('data.jsdelivr.com'))
                            return respond(JSON.stringify({ files: [{ name: '/icons/settings.svg' }, { name: '/icons/sun.svg' }, { name: '/icons/unsafe.svg' }, { name: '/package.json' }] }), 'application/json');
                        if (url.endsWith('tags.json'))
                            return respond(JSON.stringify({ sun: ['weather'] }), 'application/json');
                        if (url.endsWith('package.json'))
                            return respond(JSON.stringify({ license: url.includes('/lobster@') ? 'Proprietary' : 'OFL-1.1' }), 'application/json');
                        if (url.endsWith('.woff2'))
                            return url.includes('pacifico') ? respond('<html>missing</html>', 'text/html') : respond(woff2, 'font/woff2');
                        return url.endsWith('unsafe.svg') ? respond('<svg><script>1</script></svg>', 'image/svg+xml') : respond(svg, 'image/svg+xml');
                    } });
                expect(fetched.every(url => url.startsWith('https://cdn.jsdelivr.net/npm/') || url.startsWith('https://data.jsdelivr.com/v1/packages/npm/'))).toBe(true);
                expect(report.icons.lucide).toMatchObject({ files: 2, skipped: 1 });
                expect(report.fonts.families).toBe(26);
                expect(report.fonts.skipped.join('|')).toMatch(/lobster: no open licence declared/);
                expect(report.fonts.skipped.join('|')).toMatch(/pacifico 400/);
                expect(JSON.parse(await readFile(join(directory, 'icons/lucide/index.json'), 'utf8'))).toEqual(['icons/settings.svg', 'icons/sun.svg']);
                expect(await readdir(join(directory, 'fonts/inter'))).toEqual(['LICENCE.txt', 'inter-latin-wght-normal.woff2']);
                expect((await readdir(join(directory, 'fonts/lato'))).sort()).toEqual(['LICENCE.txt', 'lato-latin-100-normal.woff2', 'lato-latin-300-normal.woff2', 'lato-latin-400-normal.woff2', 'lato-latin-700-normal.woff2', 'lato-latin-900-normal.woff2']);
                const pickers = h.runtime.service.pickers as unknown as {
                    proxy: boolean;
                    precache?: string;
                    fetcher: (url: string) => Promise<Response>;
                };
                let outbound = 0;
                pickers.proxy = false;
                pickers.precache = directory;
                pickers.fetcher = async () => { outbound++; return respond(svg, 'image/svg+xml'); };
                expect((await o.raw('/api/picker/icons/lucide/outline/settings.svg')).status).toBe(200);
                expect((await o.raw('/api/picker/icons/lucide/outline/unsafe.svg')).status).toBe(404);
                expect((await o.raw('/api/picker/icons/tabler/outline/settings.svg')).status).toBe(404);
                expect((await o.raw('/api/picker/fonts/inter/variable.woff2')).status).toBe(200);
                expect((await o.raw('/api/picker/fonts/lato/700.woff2')).status).toBe(200);
                expect((await o.raw('/api/picker/fonts/lobster/400.woff2')).status).toBe(404);
                const search = await h.runtime.service.execute("kanvas.icons.search", { query: 'weather' }, p) as {
                    icons: {
                        id: string;
                    }[];
                    unavailableSets: string[];
                    unavailableReason: string;
                };
                expect(search.icons.map(icon => icon.id)).toEqual(['lucide:sun']);
                expect(search.unavailableSets.sort()).toEqual(['heroicons', 'material', 'phosphor', 'tabler']);
                expect(search.unavailableReason).toMatch(/disabled/);
                expect((await h.runtime.service.execute("kanvas.fonts.list", { family: 'inter' }, p) as {
                    available: boolean;
                    licence: string;
                    variable: boolean;
                }).available).toBe(true);
                expect(outbound).toBe(0);
            }
            finally {
                await rm(directory, { recursive: true, force: true });
            }
        });
    });
});

describe("pickers coverage 2", () => {

const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe("pickers contracts",()=>{
 it('5b62fba5: one icon reference format, the id that icons.search returns',()=>{
  expect(parseIconId('lucide:mail-dot')).toEqual({set:'lucide',name:'mail-dot'});
  expect(parseIconId('heroicons:envelope/solid')).toEqual({set:'heroicons',name:'envelope',variant:'solid'});
  expect(parseIconId('bubbles:send-email-envelope-outline')).toEqual({set:'iconify',name:'bubbles:send-email-envelope-outline'});
  for(const bad of ['mail-dot','lucide:','lucide:Mail','lucide:mail/unknownvariant','https://example.com/a.svg','a:b:c','bubbles:x/solid','../etc:passwd'])expect(parseIconId(bad),bad).toBeUndefined();
  expect(iconUrl(parseIconId('lucide:mail-dot')!)).toBe('/api/picker/icons/lucide/outline/mail-dot.svg');
  expect(isPickerIconUrl('/api/picker/icons/lucide/outline/mail-dot.svg')).toBe(true);
  expect(isPickerIconUrl('https://dev.kanvas.host/api/picker/icons/lucide/outline/mail-dot.svg','https://dev.kanvas.host')).toBe(true);
  expect(isPickerIconUrl('https://evil.example/api/picker/icons/lucide/outline/mail-dot.svg','https://dev.kanvas.host')).toBe(false);
  expect(isPickerIconUrl('https://example.com/logo.png','https://dev.kanvas.host')).toBe(false);
  const picker=iconPickerDataSchema.parse({icons:['lucide:mail-dot',{set:'lucide',name:'mail'}]});expect(picker.icons).toHaveLength(2);
  expect(iconPickerDataSchema.safeParse({icons:['https://example.com/x.svg']}).success).toBe(false);
 });});
});
