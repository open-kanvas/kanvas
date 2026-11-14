import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetRecord, DatasetRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import { denied, fact, PNG, startHarness, success, type Harness } from './harness.js';

describe('persistent source data and protected media over HTTP', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await h?.close(); });

  it('preserves CSV source lexemes, nulls, dates and provenance through chart binding', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const source = { title: 'Synthetic daily revenue', locator: 'Table 1', timestamp: '2026-09-08T12:00:00Z' };
    const dataset = success(await owner.request<DatasetRecord>('POST', `/api/sessions/${session.id}/datasets`, {
      name: 'Revenue', csv: 'date,amount,id\n2026-09-01,1.2300,001\n2026-09-02,,002\n2026-09-03,2.4500,003', source,
    }));
    expect(dataset.rows).toEqual([
      { date: '2026-09-01', amount: '1.2300', id: '001' },
      { date: '2026-09-02', amount: null, id: '002' },
      { date: '2026-09-03', amount: '2.4500', id: '003' },
    ]);
    expect(dataset.source).toEqual(source);
    const view: ViewSpec = { version: 1, template: 'chart', data: {
      kind: 'line', unit: 'NOK', binding: { datasetId: dataset.id, x: 'date', y: ['amount'] },
      series: [{ name: 'Untrusted transcription', points: [{ x: 'wrong', y: 999999 }] }],
    } };
    const result = await owner.submit(session.id, [display.id], view);
    const rendered = result.detail.displays[0].view!;
    expect(rendered.data.unit).toBe('NOK');
    expect(rendered).not.toHaveProperty('source');
    expect(rendered.data.series).toEqual([{ name: 'amount', points: [
      { x: '2026-09-01', y: 1.23, rawX: '2026-09-01', rawY: '1.2300', sourceRows: [0] },
      { x: '2026-09-02', y: null, rawX: '2026-09-02', rawY: null, sourceRows: [1] },
      { x: '2026-09-03', y: 2.45, rawX: '2026-09-03', rawY: '2.4500', sourceRows: [2] },
    ] }]);
    expect(result.detail.datasets.find(item => item.id === dataset.id)).not.toHaveProperty('rows');
    const stored = success(await owner.request<DatasetRecord>('GET', `/api/sessions/${session.id}/datasets/${dataset.id}`));
    expect(stored.rows).toEqual(dataset.rows);
  });

  it('rejects invalid ingestion atomically rather than storing partial datasets', async () => {
    const owner = await h.account(), session = await owner.session();
    for (const body of [
      { name: 'Bad CSV', csv: 'value,value\n1,2' },
      { name: 'Nested cells', rows: [{ value: { secret: 'not a scalar' } }] },
      { name: 'Conflicting inputs', rows: [{ value: 1 }], csv: 'value\n1' },
      { name: 'Reserved key', csv: 'constructor\n1' },
    ]) denied(await owner.request('POST', `/api/sessions/${session.id}/datasets`, body), [400, 413, 422]);
    expect((await owner.detail(session.id)).datasets).toHaveLength(0);
  });

  it('prevents cross-session data/media references and scoped deletion even for an account owning both', async () => {
    const owner = await h.account(), a = await owner.session('A'), b = await owner.session('B'), display = await owner.display(a.id);
    const dataset = success(await owner.request<DatasetRecord>('POST', `/api/sessions/${b.id}/datasets`, { name: 'B only', rows: [{ value: 42 }] }));
    const asset = success(await owner.request<AssetRecord>('POST', `/api/sessions/${b.id}/assets`, { name: 'b.png', mimeType: 'image/png', base64: PNG }));
    for (const body of [
      { requestId: 'foreign-dataset', datasetId: dataset.id, templateHint: 'number' },
      { requestId: 'foreign-asset', assetIds: [asset.id], templateHint: 'image' },
    ]) denied(await owner.request('POST', `/api/sessions/${a.id}/submit`, { ...body, displayIds: [display.id] }), [400, 403, 404, 422]);
    denied(await owner.request('DELETE', `/api/sessions/${a.id}/datasets/${dataset.id}`));
    denied(await owner.request('DELETE', `/api/sessions/${a.id}/assets/${asset.id}`));
    const foreignView = await owner.request<UpdateRecord>('POST', `/api/sessions/${a.id}/submit`, { requestId: 'foreign-url', displayIds: [display.id], view: { version: 1, template: 'image', data: { images: [{ url: asset.url, alt: 'Foreign protected image' }] } } });
    if (foreignView.status < 300) {
      const failed = await owner.settle(a.id, 'foreign-url');
      expect(['failed', 'retained']).toContain(failed.update.status);
    } else denied(foreignView, [400, 403, 404, 422]);
    expect((await owner.detail(a.id)).displays[0].view).toBeNull();
    const untouched = await owner.detail(b.id);
    expect(untouched.datasets.some(item => item.id === dataset.id)).toBe(true);
    expect(untouched.assets.some(item => item.id === asset.id)).toBe(true);
  });

  it('protects original asset bytes, disables sniffing/caching and serves PDFs as attachments', async () => {
    const owner = await h.account(), session = await owner.session();
    const image = success(await owner.request<AssetRecord>('POST', `/api/sessions/${session.id}/assets`, { name: 'pixel.png', mimeType: 'image/png', base64: PNG }));
    const response = await owner.raw(image.url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^image\/png/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toMatch(/no-store/);
    expect(Buffer.from(await response.arrayBuffer()).toString('base64')).toBe(PNG);
    const pdfBody = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
    const pdf = success(await owner.request<AssetRecord>('POST', `/api/sessions/${session.id}/assets`, { name: 'source.pdf', mimeType: 'application/pdf', base64: pdfBody.toString('base64') }));
    const download = await owner.raw(pdf.url);
    expect(download.headers.get('content-disposition')).toMatch(/^attachment/i);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(pdfBody);
    success(await owner.request('DELETE', `/api/sessions/${session.id}/assets/${image.id}`));
    denied(await owner.request('GET', image.url), [404, 410]);
  });

  it('rejects active-content uploads and MIME spoofing without adding assets', async () => {
    const owner = await h.account(), session = await owner.session();
    for (const body of [
      { name: 'active.svg', mimeType: 'image/svg+xml', base64: Buffer.from('<svg onload="alert(1)"/>').toString('base64') },
      { name: 'pretend.png', mimeType: 'image/png', base64: Buffer.from('<html>active content</html>').toString('base64') },
      { name: '../escape.png', mimeType: 'image/png', base64: PNG },
    ]) denied(await owner.request('POST', `/api/sessions/${session.id}/assets`, body), [400, 413, 415, 422]);
    expect((await owner.detail(session.id)).assets).toHaveLength(0);
  });

  it('restores current display, source data and login authority after a service restart', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const source = success(await owner.request<DatasetRecord>('POST', `/api/sessions/${session.id}/datasets`, { name: 'Saved', rows: [{ id: '001', value: '1.2300' }] }));
    const prepared = await owner.submit(session.id, [display.id], fact('Persisted, not regenerated'));
    const cookies = new Map(owner.cookies), database = h.database;
    await h.shutdown();
    const restarted = await startHarness({ database });
    try {
      const browser = restarted.browser();
      for (const [name, value] of cookies) browser.cookies.set(name, value);
      success(await browser.request('GET', '/api/auth/me'));
      const restored = await browser.detail(session.id);
      expect(restored.displays[0].view).toEqual(prepared.detail.displays[0].view);
      expect(restored.displays[0].revision).toBe(prepared.detail.displays[0].revision);
      expect(restored.datasets.find(item => item.id === source.id)).not.toHaveProperty('rows');
      const restoredSource = success(await browser.request<DatasetRecord>('GET', `/api/sessions/${session.id}/datasets/${source.id}`));
      expect(restoredSource.rows).toEqual(source.rows);
      expect(restored.updates[0].status).toBe('prepared');
    } finally { await restarted.close(); }
  });
});

describe('retained presentation playback', () => {
  it('prepares once and cues supplied slides without interpreting source again, with isolated targets and retry semantics', async () => {
    const interpret = vi.fn(async () => { throw new Error('Prepared playback must not invoke source preparation.'); });
    const h = await startHarness({ interpreter: { interpret } });
    try {
      const owner = await h.account(), session = await owner.session(), screen = await owner.display(session.id), other = await owner.display(session.id, 'Untargeted');
      const slides = [fact('Opening'), fact('Evidence'), fact('Conclusion')];
      const deck = success(await owner.request<{ id: string }>('POST', `/api/sessions/${session.id}/presentations`, { name: 'Prepared talk', slides }));
      const cue = { index: 1, displayIds: [screen.id], requestId: 'cue-evidence' };
      const first = success(await owner.request<UpdateRecord>('POST', `/api/sessions/${session.id}/presentations/${deck.id}/cue`, cue));
      const prepared = await owner.settle(session.id, cue.requestId);
      const replay = success(await owner.request<UpdateRecord>('POST', `/api/sessions/${session.id}/presentations/${deck.id}/cue`, cue));
      expect(replay.id).toBe(first.id);
      denied(await owner.request('POST', `/api/sessions/${session.id}/presentations/${deck.id}/cue`, { ...cue, index: 2 }), [409]);
      const selected = prepared.detail.displays.find(item => item.id === screen.id)!.view!;
      // Either a selected retained ViewSpec or the documented presentation shell is valid.
      if (selected.template === 'presentation') {
        expect(selected.data.index).toBe(1);
        expect((selected.data.slides as ViewSpec[])[1].data.text).toBe('Evidence');
      } else expect(selected.data.text).toBe('Evidence');
      expect(prepared.detail.displays.find(item => item.id === other.id)!.view).toBeNull();
      expect(interpret).not.toHaveBeenCalled();
    } finally { await h.close(); }
  });
});
