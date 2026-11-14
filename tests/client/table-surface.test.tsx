import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableRenderer as CompatibleTableRenderer } from '../../src/client/renderers/Chart';
import { Renderer } from '../../src/client/renderers/Renderer';
import { TableRenderer, reconcileTableState, tablePage, tableSnapshot, type TableData, type TableState } from '../../src/client/renderers/Table';
import { validateView } from '../../src/shared/view-schemas';
import { tableForeground } from '../../src/shared/table-style';

const data: TableData = { columns: ['Tool', 'Description'], rows: Array.from({ length: 51 }, (_, index) => ({ Tool: `tool_${String(index + 1).padStart(2, '0')}`, Description: `Complete original description ${index + 1}` })) };
const state = (input: TableData, options: Partial<Omit<TableState, 'snapshot'>> = {}): TableState => ({ snapshot: tableSnapshot(input), controls: false, page: 0, query: '', sort: null, ...options });

describe('source-preserving table decoration',()=>{
  const styled={columns:['Domain','Status','Price'],rows:[{Domain:'first.example',Status:'Available',Price:'9007199254740993.0001'},{Domain:'second.example',Status:'',Price:'1.2300'}],rowStyles:[{row:0,background:'#aabbdd'}],cellStyles:[{row:0,column:'Status',background:'#123456',indicator:{kind:'dot',label:'Available',color:'#b68deb'}},{row:1,column:'Status',indicator:{kind:'icon',label:'Taken',name:'lock',color:'#42aabb'}}]};
  it('keeps exact values, arbitrary colours and indicator labels attached to original rows after agent sorting',()=>{
    const view=validateView({version:1,template:'table',data:styled,selection:{sort:[{field:'Domain',type:'text',direction:'desc'}]}}),before=structuredClone(view);
    const html=renderToStaticMarkup(<Renderer view={view}/>);
    expect(html.indexOf('second.example')).toBeLessThan(html.indexOf('first.example'));
    expect(html).toContain('data-source-row="1"');expect(html).toContain('aria-label="Taken"');expect(html).toContain('aria-label="Available"');
    expect(html).toContain('background-color:#123456;color:#ffffff');expect(html).toContain('background-color:#aabbdd;color:#000000');
    expect(html).toContain('9007199254740993.0001');expect(html).toContain('1.2300');expect(view).toEqual(before);
    expect(tableForeground('#000000')).toBe('#ffffff');expect(tableForeground('#ffffff')).toBe('#000000');
  });
  it('renders supplied logo URLs as images without converting the cell into markup',()=>{
    const view=validateView({version:1,template:'table',data:{...styled,cellStyles:[{row:0,column:'Domain',indicator:{kind:'image',label:'Publisher logo',url:'/api/assets/source-logo'}}]}});
    const html=renderToStaticMarkup(<Renderer view={view}/>);expect(html).toContain('src="/api/assets/source-logo"');expect(html).toContain('alt="Publisher logo"');expect(html).toContain('first.example');
  });
  it('rejects CSS/URL injection, invented rows/columns and ambiguous duplicate decorations',()=>{
    for(const override of [
      {rowStyles:[{row:0,background:'url(https://example.com/track)'}]},
      {rowStyles:[{row:2,background:'#123456'}]},
      {rowStyles:[{row:0,color:'#123456'},{row:0,color:'#654321'}]},
      {cellStyles:[{row:0,column:'missing',indicator:{kind:'dot',color:'#123456',label:'Unknown'}}]},
      {cellStyles:[{row:0,column:'Status',indicator:{kind:'image',url:'javascript:alert(1)',label:'Unsafe'}}]},
      {cellStyles:[{row:0,column:'Status',indicator:{kind:'icon',name:'made-up',label:'Missing'}}]},
    ])expect(()=>validateView({version:1,template:'table',data:{...styled,...override}})).toThrow();
  });
});

describe('quiet complete table surface', () => {
  it('keeps the established Chart.TableRenderer export', () => { expect(CompatibleTableRenderer).toBe(TableRenderer); });
  it('renders plain headers and complete-row navigation, without default utility controls', () => {
    const html = renderToStaticMarkup(<TableRenderer data={data} />);
    expect(html).toContain('data-table-total-rows="51"'); expect(html.match(/data-source-row=/gu)).toHaveLength(12);
    expect(html).toContain('aria-label="Table pagination"'); expect(html).toContain('1–12 of 51');
    expect(html).not.toContain('<input'); expect(html).not.toContain('aria-label="Sort by'); expect(html).not.toContain('table-toolbar'); expect(html).not.toContain('table-source-summary');
  });
  it('makes all 51 original rows reachable, exactly once, including the last row', () => {
    const original = structuredClone(data), pages = Array.from({ length: 5 }, (_, page) => tablePage(data, { page }));
    expect(pages.flatMap(page => page.rows.map(item => item.sourceIndex))).toEqual(Array.from({ length: 51 }, (_, index) => index));
    expect(pages.at(-1)?.rows.at(-1)?.row).toBe(data.rows[50]); expect(pages.at(-1)?.rows).toHaveLength(3);
    expect(data).toEqual(original);
  });
  it('honours the unchanged schema page-size range without imposing a smaller client cap', () => {
    const small = validateView({ version: 1, template: 'table', data: { ...data, pageSize: 1 } });
    const large = validateView({ version: 1, template: 'table', data: { ...data, pageSize: 100 } });
    expect(tablePage(small.data as unknown as TableData).rows).toHaveLength(1);
    expect(tablePage(large.data as unknown as TableData).rows).toHaveLength(51);
    expect(() => validateView({ version: 1, template: 'table', data: { ...data, pageSize: 101 } })).toThrow();
  });
  it('does not apply a hidden filter or sort when controls are disabled', () => {
    const result = tablePage(data, { query: 'tool_51', sort: { key: 'Tool', direction: 'descending' }, showControls: false });
    expect(result.matchingRows).toBe(51); expect(result.rows[0].row.Tool).toBe('tool_01');
  });
  it('keeps source-preserving projections without restoring retired on-screen utilities', () => {
    const before = structuredClone(data);
    const filtered = tablePage(data, { query: ' TOOL_51 ', showControls: true });
    expect(filtered.matchingRows).toBe(1); expect(filtered.rows[0].row).toBe(data.rows[50]);
    const sorted = tablePage(data, { sort: { key: 'Tool', direction: 'descending' }, showControls: true });
    expect(sorted.rows[0].row).toBe(data.rows[50]); expect(data).toEqual(before);
    const html = renderToStaticMarkup(<TableRenderer data={data} showControls />);
    expect(html).not.toContain('aria-label="Filter table"'); expect(html).not.toContain('aria-label="Sort by Tool"'); expect(html).not.toContain('table-toolbar');
  });
  it('has no source/info affordance and refuses the removed flag', () => {
    expect(() => validateView({ version: 1, template: 'table', showSource: true, data })).toThrow();
    const view = validateView({ version: 1, template: 'table', data });
    const html = renderToStaticMarkup(<Renderer view={view} />);
    expect(html).not.toContain('view-information'); expect(html).not.toContain('table-source-summary'); expect(html).not.toContain('About this view');
  });
  it('keeps a supplied dataset summary in the data and never draws it (0.38.0)', () => {
    const input = { ...data, summary: { sourceRows: 70, displayedRows: 51, excludedRows: 19, precisionNote: 'Original cells retained.' } };
    const quiet = renderToStaticMarkup(<TableRenderer data={input} />), explicit = renderToStaticMarkup(<TableRenderer data={input} showControls />);
    expect(quiet).not.toContain('70 source rows'); expect(explicit).not.toContain('70 source rows'); expect(explicit).not.toContain('table-source-summary'); expect(input.summary.sourceRows).toBe(70);
  });
});

describe('verbatim cells and stable source updates', () => {
  it('distinguishes null, zero, false, an empty string and precise strings without trimming whitespace', () => {
    const exact = '  9007199254740993.00000000000000001\n\t retained trailing spaces  ';
    const input: TableData = { columns: ['Value'], rows: [{ Value: null }, { Value: 0 }, { Value: false }, { Value: '' }, { Value: exact }] };
    const html = renderToStaticMarkup(<TableRenderer data={input} />);
    expect(html).toContain('data-cell-type="null"'); expect(html).toContain('aria-label="Null value">—</span>');
    expect(html).toContain('data-cell-type="number" class="numeric">0</td>'); expect(html).toContain('data-cell-type="boolean" class="">false</td>');
    expect(html).toContain('aria-label="Empty string"></td>'); expect(html).toContain(exact);
    expect(tablePage(input).rows.map(item => item.row.Value)).toEqual([null, 0, false, '', exact]);
  });
  it('renders apparent markup as text, not executable content', () => {
    const html = renderToStaticMarkup(<TableRenderer data={{ columns: ['<script>heading</script>'], rows: [{ '<script>heading</script>': '<img src=x onerror=alert(1)>' }] }} />);
    expect(html).toContain('&lt;script&gt;heading&lt;/script&gt;'); expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;'); expect(html).not.toContain('<script>'); expect(html).not.toContain('<img ');
  });
  it('keeps position and requested utilities for a semantically identical metadata/revision refresh', () => {
    const original = state(data, { controls: true, page: 2, query: 'tool_', sort: { key: 'Tool', direction: 'ascending' } });
    const refreshed: TableData = { ...structuredClone(data), rows: data.rows.map(row => ({ Description: row.Description, Tool: row.Tool })), summary: { sourceRows: 51, displayedRows: 51, precisionNote: 'Metadata-only refresh.' } };
    expect(reconcileTableState(original, tableSnapshot(refreshed), true)).toBe(original);
  });
  it('clamps a stale page on shorter data and never returns an empty out-of-range page', () => {
    const original = state(data, { page: 4 }), smaller = { ...data, rows: data.rows.slice(0, 13) };
    const updated = reconcileTableState(original, tableSnapshot(smaller), false);
    expect(updated.page).toBe(1); expect(tablePage(smaller, { page: updated.page }).rows.map(item => item.sourceIndex)).toEqual([12]);
    const empty = reconcileTableState(updated, tableSnapshot({ ...data, rows: [] }), false);
    expect(empty.page).toBe(0); expect(tablePage({ ...data, rows: [] }, { page: empty.page }).rows).toEqual([]);
  });
  it('clears a stale filter and sort when an agent supplies changed cells or a different dataset', () => {
    const original = state(data, { controls: true, query: 'tool_51', sort: { key: 'Tool', direction: 'descending' } });
    const changed = { ...data, rows: [{ Tool: 'new_tool', Description: 'New supplied data' }] };
    const updated = reconcileTableState(original, tableSnapshot(changed), true);
    expect(updated.query).toBe(''); expect(updated.sort).toBeNull(); expect(updated.page).toBe(0);
    expect(tablePage(changed, { ...updated, showControls: true }).rows[0].row.Tool).toBe('new_tool');
    const different = reconcileTableState(state(data, { page: 3 }), tableSnapshot({ ...data, summary: { datasetId: 'new-dataset', sourceRows: 51, displayedRows: 51 } }), false);
    expect(different.page).toBe(0);
  });
  it('keeps the current reading position for ordinary data refreshes and page-size changes', () => {
    const original = state(data, { page: 2 }), changed = { ...data, rows: data.rows.map(row => ({ ...row, Description: `${row.Description} (refreshed)` })) };
    expect(reconcileTableState(original, tableSnapshot(changed), false).page).toBe(2);
    const resized = reconcileTableState(original, tableSnapshot({ ...data, pageSize: 20 }), false);
    const page = tablePage({ ...data, pageSize: 20 }, { page: resized.page });
    expect(page.rows.some(item => item.sourceIndex === 24)).toBe(true);
  });
  it('clears utility state immediately when the display returns to its quiet default', () => {
    const original = state(data, { controls: true, page: 2, query: 'tool_', sort: { key: 'Tool', direction: 'descending' } });
    const updated = reconcileTableState(original, tableSnapshot(data), false);
    expect(updated).toMatchObject({ page: 0, query: '', sort: null, controls: false });
  });
});
