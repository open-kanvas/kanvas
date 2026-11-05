import { Icon } from '../icons';
import { cellEmphasis, type Emphasis } from '../../shared/emphasis';
import { useSelection } from './Selection';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Cell, DatasetBinding } from '../../shared/chart-contract';
import './table.css';
import { useNavigation } from './Navigation';
import { useRegional } from './Regional';
import { regionalNumber } from '../../shared/regional';
import { tableForeground,type TableRowStyle,type TableCellStyle,type TableIndicator } from '../../shared/table-style';
import { MediaImage } from './Image';

export interface TableSummary {
  datasetId?: string; sourceRows: number; displayedRows: number; aggregation?: string;
  downsampled?: boolean; precisionNote?: string; excludedRows?: number;
}
export interface TableData {
  showHeaders?: boolean; emphasis?: Emphasis; columns: string[]; rows: Record<string, Cell>[]; pageSize?: number; binding?: DatasetBinding; summary?: TableSummary;
  rowStyles?:TableRowStyle[];cellStyles?:TableCellStyle[];
}
function Indicator({indicator}:{indicator:TableIndicator}){
  if(indicator.kind==='image')return <span className="table-indicator-image"><MediaImage entry={{url:indicator.url,alt:indicator.label}}/></span>;
  return <span className={`table-indicator table-indicator-${indicator.kind}`} role="img" aria-label={indicator.label} title={indicator.label} style={{color:indicator.color,...(indicator.kind==='dot'?{backgroundColor:indicator.color}:{})}}>{indicator.kind==='icon'&&<Icon name={indicator.name} size={18}/>}</span>;
}
export interface TableSort { key: string; direction: 'ascending' | 'descending' }
export interface TableSnapshot { dataset: string; columns: string; cells: string; rowCount: number; pageSize: number }
export interface TableState { snapshot: TableSnapshot; controls: boolean; page: number; query: string; sort: TableSort | null }

export function tablePageSize(value?: number): number {
  return value === undefined || !Number.isFinite(value) ? 12 : Math.min(100, Math.max(1, Math.floor(value)));
}
const cellKind = (value: Cell | undefined) => value === undefined ? 'missing' : value === null ? 'null' : typeof value;
const cellText = (value: Cell | undefined) => value === undefined ? '' : value === null ? 'null' : Object.is(value, -0) ? '-0' : String(value);

/** Compare the displayed data, not object identity or unrelated view metadata. */
export function tableSnapshot(data: TableData): TableSnapshot {
  return {
    dataset: data.binding?.datasetId ?? data.summary?.datasetId ?? '', columns: JSON.stringify(data.columns),
    cells: JSON.stringify(data.rows.map(row => data.columns.map(column => [cellKind(row[column]), cellText(row[column])]))),
    rowCount: data.rows.length, pageSize: tablePageSize(data.pageSize),
  };
}
export function reconcileTableState(state: TableState, snapshot: TableSnapshot, controls: boolean): TableState {
  const newDataset = snapshot.dataset !== state.snapshot.dataset || snapshot.columns !== state.snapshot.columns;
  const changedCells = snapshot.cells !== state.snapshot.cells;
  const clearUtilities = newDataset || changedCells || !controls;
  const hadUtilities = Boolean(state.query.trim() || state.sort);
  const query = clearUtilities ? '' : state.query, sort = clearUtilities ? null : state.sort;
  // Keep the current reading position for ordinary refreshes. A new dataset or
  // clearing an active projection starts at its first row; shrinking data clamps.
  const requestedPage = newDataset || clearUtilities && hadUtilities ? 0 : Math.floor(state.page * state.snapshot.pageSize / snapshot.pageSize);
  const page = Math.max(0, Math.min(requestedPage, Math.ceil(snapshot.rowCount / snapshot.pageSize) - 1));
  if (!newDataset && !changedCells && snapshot.pageSize === state.snapshot.pageSize && state.controls === controls && state.page === page && state.query === query && state.sort === sort) return state;
  return { snapshot, controls, page, query, sort };
}

/** A display projection only: returned rows retain their original cell values. */
export function tablePage(data: TableData, options: { page?: number; query?: string; sort?: TableSort | null; showControls?: boolean } = {}) {
  const pageSize = tablePageSize(data.pageSize), query = options.showControls ? options.query?.trim().toLocaleLowerCase() ?? '' : '';
  const sort = options.showControls && options.sort && data.columns.includes(options.sort.key) ? options.sort : null;
  const projected = data.rows.map((row, sourceIndex) => ({ row, sourceIndex })).filter(({ row }) => !query || data.columns.some(column => cellText(row[column]).toLocaleLowerCase().includes(query)));
  if (sort) {
    const collator = new Intl.Collator(undefined, { numeric: false });
    projected.sort((a, b) => {
      const av = a.row[sort.key], bv = b.row[sort.key], aMissing = av === null || av === undefined, bMissing = bv === null || bv === undefined;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (aMissing && bMissing) return a.sourceIndex - b.sourceIndex;
      // Numeric-looking strings remain strings. Never round precise decimals or
      // identifiers through Number() just to provide an optional sort control.
      const order = typeof av === 'number' && typeof bv === 'number' ? (av < bv ? -1 : av > bv ? 1 : 0)
        : typeof av === 'boolean' && typeof bv === 'boolean' ? Number(av) - Number(bv) : collator.compare(cellText(av), cellText(bv));
      return order * (sort.direction === 'ascending' ? 1 : -1) || a.sourceIndex - b.sourceIndex;
    });
  }
  const pageCount = Math.max(1, Math.ceil(projected.length / pageSize));
  const requestedPage = Number.isFinite(options.page) ? Math.floor(options.page!) : 0;
  const page = Math.min(pageCount - 1, Math.max(0, requestedPage));
  const start = page * pageSize, end = Math.min(projected.length, start + pageSize);
  return { rows: projected.slice(start, end), page, pageCount, pageSize, start, end, totalRows: data.rows.length, matchingRows: projected.length };
}
export function tableSummaryText(summary?: TableSummary): string | undefined {
  if (!summary || !Number.isFinite(summary.displayedRows) || !Number.isFinite(summary.sourceRows)) return undefined;
  return [`${summary.displayedRows.toLocaleString()} shown from ${summary.sourceRows.toLocaleString()} source rows`, summary.aggregation && summary.aggregation !== 'none' ? summary.aggregation : '', summary.downsampled ? 'downsampled' : '', summary.excludedRows ? `${summary.excludedRows} rows excluded` : '', summary.precisionNote ?? ''].filter(Boolean).join(' · ');
}

export function TableRenderer({ data, showControls = false, showSource = false }: { data: TableData; showControls?: boolean; showSource?: boolean }) {
  const navigation=useNavigation(),regional=useRegional();
  const snapshot = useMemo(() => tableSnapshot(data), [data.columns, data.rows, data.pageSize, data.binding?.datasetId, data.summary?.datasetId]);
  const [state, setState] = useState<TableState>(() => ({ snapshot, controls: showControls, page: 0, query: '', sort: null }));
  const current = reconcileTableState(state, snapshot, showControls);
  // Reconcile before committing the new rows so an old filter/page is never
  // briefly shown over a newly supplied dataset. Metadata-only renders are inert.
  if (current !== state) setState(current);
  const page = useMemo(() => tablePage(data, { page: navigation?.hasPosition?navigation.state.page:current.page, query: navigation?.hasPosition?navigation.state.query:current.query, sort: current.sort, showControls:showControls||Boolean(navigation?.state.query) }), [data.columns, data.rows, data.pageSize, current.page, current.query, current.sort, showControls,navigation?.state.page,navigation?.state.query,navigation?.hasPosition]);
  const scroll = useRef<HTMLDivElement>(null);
  if(navigation&&!navigation.hasPosition)navigation.seedPage(page.page);
  useEffect(()=>{if(navigation?.hasPosition)setState(old=>old.page===page.page?old:{...old,page:page.page});},[navigation?.hasPosition,page.page]);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [page.page, page.pageSize, current.query, current.sort]);
  const summary = showSource ? tableSummaryText(data.summary) : undefined;
  const selection=useSelection();
  const rowStyles=useMemo(()=>new Map(data.rowStyles?.map(s=>[s.row,s])),[data.rowStyles]);
  const cellStyles=useMemo(()=>new Map(data.cellStyles?.map(s=>[JSON.stringify([s.row,s.column]),s])),[data.cellStyles]);
  return <div className="table-content table-surface" data-table-total-rows={page.totalRows} data-table-matching-rows={page.matchingRows}>
    <div className="table-scroll" ref={scroll} tabIndex={0} role="region" aria-label="Scrollable data table">
      <table aria-label="Data table" style={{ '--table-columns': Math.max(1, data.columns.length) } as CSSProperties}>
        {data.showHeaders !== false && <thead><tr>{data.columns.map(column => <th key={column} scope="col" >
          <span>{column}</span>
        </th>)}</tr></thead>}
        <tbody>{page.rows.map(({ row, sourceIndex }) => <tr key={sourceIndex} data-source-row={selection.indices?.[sourceIndex]??sourceIndex} className={selection.highlights.includes(sourceIndex)?'agent-highlight':undefined}>{data.columns.map(column => {
          const value = row[column];
          const originalIndex=selection.indices?.[sourceIndex]??sourceIndex,rowStyle=rowStyles.get(originalIndex),cellStyle=cellStyles.get(JSON.stringify([originalIndex,column]));
          const emphasis=cellEmphasis(data.emphasis, originalIndex, column);
          const backgroundColor=cellStyle?.background??rowStyle?.background,color=cellStyle?.color??(cellStyle?.background?tableForeground(cellStyle.background):rowStyle?.color??(backgroundColor?tableForeground(backgroundColor):undefined));
          return <td key={column} data-cell-type={cellKind(value)} data-emphasis={Boolean(emphasis) || undefined} title={emphasis?.label} className={`${typeof value === 'number' ? 'numeric' : ''}${emphasis ? ' cell-emphasis' : ''}`} aria-label={value === ''&&!cellStyle?.indicator ? 'Empty string' : undefined} style={backgroundColor||color||emphasis?{backgroundColor,color,...(emphasis?{boxShadow:`inset 0 0 0 2px ${emphasis.color??'var(--accent)'}`}:{})}:undefined}>
            {cellStyle?.indicator&&<Indicator indicator={cellStyle.indicator}/>}
            {value === null || value === undefined ? <span className="muted table-null" aria-label={value === null ? 'Null value' : 'No supplied value'}>—</span> : typeof value==='number'?regionalNumber(value,regional):cellText(value)}
          </td>;
        })}</tr>)}</tbody>
      </table>
      {!page.matchingRows && <p className="table-empty" role="status">{(navigation?.hasPosition?navigation.state.query:current.query).trim() ? 'No matching rows.' : 'No rows supplied.'}</p>}
    </div>
    {page.pageCount > 1 && <nav className="table-pages" aria-label="Table pagination">
      <button type="button" disabled={page.page === 0||navigation?.canNavigate===false} onClick={() => {setState(old=>({...old,page:page.page-1}));navigation?.send({action:'page',page:page.page});}}>← Previous</button>
      <span aria-live="polite" aria-atomic="true"><span className="sr-only">Rows </span>{page.start + 1}–{page.end} of {page.matchingRows}<span className="sr-only"> · Page {page.page + 1} of {page.pageCount}</span></span>
      <button type="button" disabled={page.page === page.pageCount - 1||navigation?.canNavigate===false} onClick={() => {setState(old=>({...old,page:page.page+1}));navigation?.send({action:'page',page:page.page+2});}}>Next →</button>
    </nav>}
    {summary && <p className="content-summary table-source-summary">{summary}</p>}
  </div>;
}
