import {DistributionChart} from './DistributionChart';
import {ComposableChart} from './ComposableChart';
import { pointEmphasis } from '../../shared/emphasis';
import { useRegional } from './Regional';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AdvancedChartRenderer } from './AdvancedCharts';
import { isAdvancedChartKind } from '../../shared/chart-contract';
import type { ChartData, ChartPoint } from '../../shared/chart-contract';
import './responsive-chart.css';
import { categoricalColor, seriesColor } from './chart-palette';
export type { ChartData, ChartPoint } from '../../shared/chart-contract';

export type Scalar = string | number | boolean | null;
export interface DatasetSummary { datasetId?: string; sourceRows: number; displayedRows: number; aggregation?: string; downsampled?: boolean; precisionNote?: string; excludedRows?: number }
export function summaryText(summary?: DatasetSummary): string | undefined {
  if (!summary) return undefined;
  return [`${summary.displayedRows.toLocaleString()} shown from ${summary.sourceRows.toLocaleString()} source rows`, summary.aggregation && summary.aggregation !== 'none' ? summary.aggregation : '', summary.downsampled ? 'downsampled' : '', summary.excludedRows ? `${summary.excludedRows} rows excluded` : '', summary.precisionNote ?? ''].filter(Boolean).join(' · ');
}
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const unique = <T,>(items: T[]) => [...new Set(items)];
const format = (n: number) => new Intl.NumberFormat(undefined, { notation: Math.abs(n) >= 10000 ? 'compact' : 'standard', maximumSignificantDigits: 4 }).format(n);

export function ChartRenderer(props: { data: ChartData; showControls?: boolean }) {
  if(props.data.distribution)return <DistributionChart data={props.data}/>;
  if(['bar','line','area'].includes(props.data.kind)&&(props.data.stacking||props.data.orientation||props.data.showValues!==undefined||props.data.showTotals!==undefined||props.data.legend!==undefined||props.data.numberFormat||props.data.yMin!==undefined||props.data.yMax!==undefined||props.data.series.some(s=>s.stackGroup||s.kind||s.axis||s.color||s.lineWidth||s.dashed)))return <ComposableChart data={props.data}/>;
  return isAdvancedChartKind(props.data.kind) ? <AdvancedChartRenderer {...props} /> : <LegacyChartRenderer {...props} />;
}
export type ChartTextMeasure = (text: string) => number;
/** Wrap by measured glyph width, including identifiers with no spaces. Source text stays in the accessible label. */
export function wrapChartTick(label: string, width: number, measure: ChartTextMeasure): string[] {
  const lines: string[] = [];
  let line = '';
  const words = label.trim().split(/\s+/u);
  for (const word of words) {
    if (!word) continue;
    const joined = line ? `${line} ${word}` : word;
    if (measure(joined) <= width) { line = joined; continue; }
    if (line) { lines.push(line); line = ''; }
    if (measure(word) <= width) { line = word; continue; }
    const glyphs = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word), part => part.segment)
      : Array.from(word);
    for (const glyph of glyphs) {
      while (line && measure(line + glyph) > width) {
        const boundary = Math.max(line.lastIndexOf('-'), line.lastIndexOf('–'), line.lastIndexOf('/')) + 1;
        if (boundary && boundary < line.length) { lines.push(line.slice(0, boundary)); line = line.slice(boundary); }
        else { lines.push(line); line = ''; }
      }
      line += glyph;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
export interface ChartTickLayout {
  index: number; label: string; lines: string[]; x: number; width: number; left: number; right: number; rotation?: number;
}
/** Fit tick text to disjoint midpoint-bounded slots; reducing ticks never removes observations. */
export function layoutChartTicks(labels: string[], positions: number[], left: number, right: number, measure: ChartTextMeasure, maxLines = 4, gap = 8): { ticks: ChartTickLayout[]; usesKey: boolean; indexed: boolean } {
  if (!labels.length) return { ticks: [], usesKey: false, indexed: false };
  const ordered = labels.map((_, index) => index).sort((a, b) => positions[a] - positions[b]);
  const fit = (indices: number[], indexed: boolean): ChartTickLayout[] | undefined => {
    const ticks: ChartTickLayout[] = [];
    for (const [slot, index] of indices.entries()) {
      const start = (slot ? (positions[indices[slot - 1]] + positions[index]) / 2 : left) + gap / 2;
      const end = (slot < indices.length - 1 ? (positions[index] + positions[indices[slot + 1]]) / 2 : right) - gap / 2;
      const available = Math.max(0, end - start);
      const lines = wrapChartTick(indexed ? String(index + 1) : labels[index], available, measure);
      const width = Math.max(...lines.map(measure));
      if (lines.length > maxLines || width > end - start + .1) return undefined;
      ticks.push({ index, label: labels[index], lines, width, left: start, right: end, x: Math.max(start + width / 2, Math.min(end - width / 2, positions[index])) });
    }
    return ticks;
  };
  for (const indexed of [false, true]) {
    let stride = 1;
    for (;;) {
      const indices = ordered.filter((_, i) => i % stride === 0 || i === ordered.length - 1);
      const ticks = fit(indices, indexed);
      if (ticks) return { ticks, usesKey: indexed || ticks.length < labels.length, indexed };
      if (stride >= Math.max(1, ordered.length - 1)) break;
      stride = Math.min(ordered.length - 1, Math.max(stride + 1, Math.ceil(stride * 1.5)));
    }
  }
  // A sub-glyph viewport still exposes every complete label in the readable key.
  return { ticks: [], usesKey: true, indexed: true };
}
/** Dense categorical/time ticks rotate; thinning changes labels, never observations.
 * Leave the complete value on each mark's accessible label and tooltip. */
export function layoutXAxisTicks(labels: string[], positions: number[], left: number, right: number, measure: ChartTextMeasure) {
  const spacing = Math.min(right - left, ...positions.slice(1).map((x, i) => Math.abs(x - positions[i])));
  const rotated = labels.some(label => measure(label) + 8 > spacing);
  const stride = Math.max(1, Math.ceil((rotated ? 24 : Math.max(0, ...labels.map(measure)) + 8) / Math.max(1, spacing)));
  const ticks: ChartTickLayout[] = [];
  for (let index = 0; index < labels.length; index += stride) {
    const label = labels[index], width = measure(label);
    // Anchor the tick at its actual observation; the plot reserves a left margin.
    const x = rotated ? positions[index] : Math.max(left + width / 2, Math.min(right - width / 2, positions[index]));
    if (ticks.length && x - ticks[ticks.length - 1].x < (rotated ? 24 : width + 8)) continue;
    const display = width > 180 && rotated ? Array.from(label).slice(0, Math.max(1, Math.floor(label.length * 160 / width))).join('') + '…' : label;
    ticks.push({ index, label, lines: [display], x, width: measure(display), left, right, rotation: rotated ? -45 : 0 });
  }
  return { ticks, usesKey: false, indexed: false };
}
function chartMeasure(fontSize: number, fontFamily: string): ChartTextMeasure {
  if (typeof document !== 'undefined') {
    const context = document.createElement('canvas').getContext('2d');
    if (context) { context.font = `400 ${fontSize}px ${fontFamily}`; return text => context.measureText(text).width + (text ? 1 : 0); }
  }
  return text => Array.from(text).reduce((width, glyph) => width + (/\s/u.test(glyph) ? .3 : /[ilI.,'!|]/u.test(glyph) ? .3 : /[MW@]/u.test(glyph) ? .9 : /[^\x00-\xff]/u.test(glyph) ? 1 : .6), 0) * fontSize;
}
const sourceX = (point: ChartPoint) => point.rawX !== undefined ? point.rawX : point.x;
const sourceY = (point: ChartPoint) => point.rawY !== undefined ? point.rawY : point.y;
const scalarText = (value: Scalar | undefined) => value === null || value === undefined ? 'Missing' : String(value);
const sourceField = (point: ChartPoint, key: 'low' | 'q1' | 'median' | 'q3' | 'high' | 'value') => point.raw?.[key] !== undefined ? point.raw[key] : point[key];
function chartPointDescription(kind: ChartData['kind'], name: string, point: ChartPoint, unit?: string): string {
  const value = kind === 'box'
    ? `min ${scalarText(sourceField(point, 'low'))}, Q1 ${scalarText(sourceField(point, 'q1'))}, median ${scalarText(sourceField(point, 'median'))}, Q3 ${scalarText(sourceField(point, 'q3'))}, max ${scalarText(sourceField(point, 'high'))}`
    : kind === 'heatmap' ? `${scalarText(sourceY(point))}: ${scalarText(sourceField(point, 'value') !== undefined ? sourceField(point, 'value') : sourceY(point))}` : scalarText(sourceY(point));
  return `${name}: ${scalarText(sourceX(point))}, ${value}${unit ? ` ${unit}` : ''}`;
}
function ChartTick({ tick, baseline, lineHeight, fontSize, axis = 'x' }: { tick: ChartTickLayout; baseline: number; lineHeight: number; fontSize: number; axis?: 'x' | 'y' }) {
  return <text className="chart-tick" data-chart-axis={axis} data-chart-tick-index={tick.index} data-chart-tick-label={tick.label} aria-label={tick.label} style={{ fontSize }} textAnchor={tick.rotation ? "end" : "middle"} transform={tick.rotation ? `rotate(${tick.rotation} ${tick.x} ${baseline})` : undefined} x={tick.x} y={baseline}>
    <title>{tick.label}</title>{tick.lines.map((line, i) => <tspan key={i} x={tick.x} dy={i ? lineHeight : 0}>{line}</tspan>)}
  </text>;
}
function AxisCaption({ label, lines, x, baseline, lineHeight, fontSize, anchor = 'middle', axis }: { label: string; lines: string[]; x: number; baseline: number; lineHeight: number; fontSize: number; anchor?: 'start' | 'middle'; axis: 'x' | 'y' }) {
  return <text className="chart-axis-label" data-chart-axis-title={axis} aria-label={label} style={{ fontSize }} x={x} y={baseline} textAnchor={anchor}>
    <title>{label}</title>{lines.map((line, index) => <tspan key={index} x={x} dy={index ? lineHeight : 0}>{line}</tspan>)}
  </text>;
}
function LegacyChartRenderer({ data, showControls = false }: { data: ChartData; showControls?: boolean }) {
  const regional=useRegional();
  const format=(n:number)=>new Intl.NumberFormat(regional.numberLocale||undefined,{notation:Math.abs(n)>=10000?'compact':'standard',maximumSignificantDigits:4}).format(n);
  const [selected, setSelected] = useState<{ series: string; point: ChartPoint } | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const hasPoints = data.series.some(series => series.points.length > 0);
  const [viewport, setViewport] = useState({ width: 1000, height: 570, fontSize: 16, fontFamily: 'sans-serif', fontRevision: 0 });
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    let disposed = false;
    const measure = (fontsChanged = false) => {
      if (disposed || !element.clientWidth || !element.clientHeight) return;
      const fontFamily = getComputedStyle(element).fontFamily;
      const fontSize = element.closest('.is-preview') ? 7 : 16;
      setViewport(old => {
        const next = { width: element.clientWidth, height: element.clientHeight, fontFamily, fontSize, fontRevision: old.fontRevision + Number(fontsChanged) };
        return Object.keys(next).every(key => next[key as keyof typeof next] === old[key as keyof typeof old]) ? old : next;
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => measure());
    observer?.observe(element);
    const resize = () => measure();
    const fontsChanged = () => measure(true);
    window.addEventListener('resize', resize);
    document.fonts?.addEventListener('loadingdone', fontsChanged);
    void document.fonts?.ready.then(fontsChanged);
    measure();
    return () => { disposed = true; observer?.disconnect(); window.removeEventListener('resize', resize); document.fonts?.removeEventListener('loadingdone', fontsChanged); };
  }, [showControls, data.kind, hasPoints]);
  useEffect(() => { setSelected(null); }, [data]);
  const measure = useMemo(() => chartMeasure(viewport.fontSize, viewport.fontFamily), [viewport.fontSize, viewport.fontFamily, viewport.fontRevision]);
  const all = data.series.flatMap(series => series.points);
  const firstPoints = new Map<string | number, ChartPoint>();
  for (const point of all) if (!firstPoints.has(point.x)) firstPoints.set(point.x, point);
  const labels = [...firstPoints.keys()], labelIndices = new Map(labels.map((label, index) => [label, index]));
  const labelText = labels.map(label => scalarText(sourceX(firstPoints.get(label)!)));
  const compact = viewport.width < 600;
  const fontSize = viewport.fontSize, lineHeight = fontSize * 1.25;
  const W = Math.max(fontSize === 7 ? 120 : 240, viewport.width);
  const yValues = [...(data.referenceLines??[]).map(l=>l.value),...all.flatMap(point => data.kind === 'box' ? [point.low, point.q1, point.median, point.q3, point.high].filter(numeric) : numeric(point.y) ? [point.y] : [])];
  const xNumbers = labels.map(value => typeof value === 'number' ? value : /^\d{4}-\d{2}-\d{2}/u.test(value) ? Date.parse(value) : NaN);
  const xMin = Math.min(...xNumbers), xMax = Math.max(...xNumbers);
  const continuous = (data.kind === 'line' || data.kind === 'scatter') && xNumbers.every(Number.isFinite) && xMax > xMin;
  let lo = Math.min(...yValues), hi = Math.max(...yValues);
  if (data.kind === 'bar' || data.kind === 'histogram') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = 1;
  if (lo === hi) { const pad = Math.abs(lo) * .1 || 1; lo -= pad; hi += pad; }
  const pad = data.kind === 'bar' || data.kind === 'histogram' ? 0 : (hi - lo) * .05;
  lo -= pad; hi += pad;
  const stepPower = 10 ** Math.floor(Math.log10((hi - lo) / 5));
  const normalizedStep = (hi - lo) / 5 / stepPower;
  const step = (normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 2.5 ? 2.5 : normalizedStep <= 5 ? 5 : 10) * stepPower;
  if (step > 0 && Number.isFinite(step)) { lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; }
  const yTicks = Number.isFinite(step) && step > 0 ? Array.from({ length: Math.min(12, Math.round((hi - lo) / step) + 1) }, (_, i) => lo + step * i) : [];
  const labelReserve = labelText.some(label => measure(label) + 8 > (W - 80) / Math.max(1, labels.length)) ? Math.min(180, Math.max(0, ...labelText.map(measure))) * .71 + 8 : 0;
  const left = Math.max(labelReserve, fontSize * 2, ...yTicks.map(value => measure(format(value)) + 12));
  const right = 12, pw = Math.max(1, W - left - right);
  const x = (value: string | number) => continuous ? left + ((typeof value === 'number' ? value : Date.parse(value)) - xMin) / (xMax - xMin) * pw : left + (labelIndices.get(value)! + .5) / Math.max(1, labels.length) * pw;
  const ticks = layoutXAxisTicks(labelText, labels.map(x), left, W - right, measure);
  const xCaption = data.xLabel ? wrapChartTick(data.xLabel, pw - 8, measure) : [];
  const yLabel = [data.yLabel, data.unit].filter(Boolean).join(' · ');
  const yCaption = yLabel ? wrapChartTick(yLabel, pw - 8, measure) : [];
  const top = Math.max(fontSize * 1.25, yCaption.length * lineHeight + 14);
  const tickHeight = Math.max(lineHeight, ...ticks.ticks.map(tick => tick.rotation ? tick.width * .71 + lineHeight : lineHeight));
  const bottomMargin = 12 + tickHeight + (xCaption.length ? xCaption.length * lineHeight + 12 : 0) + 8;
  const H = Math.max(viewport.height, top + bottomMargin + fontSize * 7);
  const bottom = H - bottomMargin, ph = bottom - top;
  const y = (value: number) => bottom - (value - lo) / (hi - lo) * ph;
  const yStride = Math.max(1, Math.ceil(lineHeight * 1.5 / (ph / Math.max(1, yTicks.length - 1))));
  const visibleYTicks = yTicks.filter((_, index) => index % yStride === 0 || index === yTicks.length - 1 && (yTicks.length - 1) % yStride >= yStride / 2);
  const pointIndices = new Map(data.series.flatMap(series=>series.points.map((point,index)=>[point,index] as const)));
  const pointEvents = (name: string, point: ChartPoint) => { const emphasis=pointEmphasis(data.emphasis,name,pointIndices.get(point)??-1); return {
    'data-emphasis':Boolean(emphasis)||undefined,
    style:emphasis?{stroke:emphasis.color??'var(--text)',strokeWidth:4,filter:'drop-shadow(0 0 3px var(--accent))'}:undefined,
    'data-chart-series': name, 'data-chart-x': scalarText(sourceX(point)), 'data-chart-y': scalarText(sourceY(point)),
    onMouseEnter: () => setSelected({ series: name, point }), onFocus: () => setSelected({ series: name, point }), onClick: () => setSelected({ series: name, point }),
    onMouseLeave: () => setSelected(null), onBlur: () => setSelected(null), tabIndex: 0, role: 'img' as const,
    'aria-label': [chartPointDescription(data.kind, name, point, data.unit),emphasis?.label].filter(Boolean).join(' · '),
  }; };
  if (!all.length) return <div className="content-empty">No observations supplied.</div>;
  if ((data.kind !== 'heatmap' && !Number.isFinite(hi - lo)) || (continuous && !Number.isFinite(xMax - xMin))) return <p className="content-summary">These values exceed the chart’s numeric range.</p>;
  return <div className={`chart-content legacy-chart ${compact ? 'chart-portrait' : ''}`} data-chart-kind={data.kind}>
    {data.series.length > 1 && <div className="chart-legend">{data.series.map((series, i) => <span key={`${series.name}-${i}`}><i style={{ background: seriesColor(i, data.series.length) }} />{series.name}</span>)}</div>}
    <>
      <div className="legacy-chart-plot" ref={plot}>
        {data.kind === 'heatmap' ? <Heatmap data={data} select={setSelected} viewport={viewport} measure={measure} /> : <svg className="chart-svg" width={W} height={H} style={{ width: W, height: H }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${data.kind} chart of ${data.yLabel ?? data.unit ?? 'values'} by ${data.xLabel ?? 'observation'}`}>
          <title>{`${data.kind} chart`}</title>
          {yCaption.length > 0 && <AxisCaption label={yLabel} lines={yCaption} x={left + 4} baseline={fontSize} lineHeight={lineHeight} fontSize={fontSize} anchor="start" axis="y" />}
          {visibleYTicks.map((value, i) => <g key={i} className="chart-axis"><line x1={left} x2={W - right} y1={y(value)} y2={y(value)} /><text data-chart-axis="y" style={{ fontSize }} x={left - 10} y={y(value) + fontSize * .35} textAnchor="end">{format(value)}</text></g>)}
          {ticks.ticks.map(tick => <ChartTick key={tick.index} tick={tick} baseline={bottom + 12 + fontSize} lineHeight={lineHeight} fontSize={fontSize} />)}
          {xCaption.length > 0 && <AxisCaption label={data.xLabel!} lines={xCaption} x={left + pw / 2} baseline={bottom + 12 + tickHeight + 12 + fontSize} lineHeight={lineHeight} fontSize={fontSize} axis="x" />}
          {data.referenceLines?.map((line,i)=><g key={`reference-${i}`} className="chart-reference"><line x1={left} x2={W-right} y1={y(line.value)} y2={y(line.value)} stroke={line.color??'var(--text)'} strokeWidth={2} strokeDasharray="6 4"/><text x={W-right-4} y={y(line.value)-6} textAnchor="end" fill={line.color??'var(--text)'}>{line.label??format(line.value)}</text></g>)}
          {data.series.map((series, si) => {
            const color = seriesColor(si, data.series.length), valid = series.points.filter(point => numeric(point.y));
            const groupWidth = pw / Math.max(1, labels.length) * .76, barWidth = groupWidth / data.series.length;
            const title = (point: ChartPoint) => [chartPointDescription(data.kind, series.name, point, data.unit),pointEmphasis(data.emphasis,series.name,pointIndices.get(point)??-1)?.label].filter(Boolean).join(' · ');
            if (data.kind === 'line') {
              let started = false;
              const path = series.points.map(point => { if (!numeric(point.y)) { started = false; return ''; } const command = started ? 'L' : 'M'; started = true; return `${command}${x(point.x)},${y(point.y)}`; }).join(' ');
              return <g key={si}><path data-chart-line={series.name} d={path} fill="none" stroke={color} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />{valid.map((point, pi) => <circle key={pi} cx={x(point.x)} cy={y(point.y as number)} r={valid.length > 80 ? 3 : 5} fill={color} className="chart-point" {...pointEvents(series.name, point)}><title>{title(point)}</title></circle>)}</g>;
            }
            if (data.kind === 'scatter') return <g key={si}>{valid.map((point, pi) => <circle key={pi} cx={x(point.x)} cy={y(point.y as number)} r="6.5" fill={color} fillOpacity=".75" stroke={color} className="chart-point" {...pointEvents(series.name, point)}><title>{title(point)}</title></circle>)}</g>;
            if (data.kind === 'box') return <g key={si}>{series.points.map((point, pi) => {
              if (![point.low, point.q1, point.median, point.q3, point.high].every(numeric)) return null;
              const cx = x(point.x) - groupWidth / 2 + barWidth * (si + .5), bw = Math.max(1, barWidth * .75);
              const tone = data.series.length === 1 ? categoricalColor(pi) : color; return <g key={pi} className="chart-point" stroke={tone} strokeWidth="2" {...pointEvents(series.name, point)}><title>{title(point)}</title><line x1={cx} x2={cx} y1={y(point.high!)} y2={y(point.low!)} /><line x1={cx - bw / 3} x2={cx + bw / 3} y1={y(point.high!)} y2={y(point.high!)} /><line x1={cx - bw / 3} x2={cx + bw / 3} y1={y(point.low!)} y2={y(point.low!)} /><rect x={cx - bw / 2} y={y(point.q3!)} width={bw} height={Math.max(1, y(point.q1!) - y(point.q3!))} fill={tone} fillOpacity=".24" /><line x1={cx - bw / 2} x2={cx + bw / 2} y1={y(point.median!)} y2={y(point.median!)} strokeWidth="4" /></g>;
            })}</g>;
            return <g key={si}>{valid.map((point, pi) => <rect key={pi} x={x(point.x) - groupWidth / 2 + si * barWidth} y={Math.min(y(point.y as number), y(0))} width={Math.max(1, barWidth - (data.kind === 'histogram' ? 1 : 4))} height={Math.max(1, Math.abs(y(point.y as number) - y(0)))} rx={data.kind === 'histogram' ? 0 : 3} fill={color} opacity=".9" className="chart-point" {...pointEvents(series.name, point)}><title>{title(point)}</title></rect>)}</g>;
          })}
        </svg>}
      </div>
    </>
    {selected && <div className="chart-readout chart-point-detail" aria-live="polite">{chartPointDescription(data.kind, selected.series, selected.point, data.unit)}</div>}
  </div>;
}

function Heatmap({ data, select, viewport, measure }: { data: ChartData; select: (value: { series: string; point: ChartPoint } | null) => void; viewport: { width: number; height: number; fontSize: number }; measure: ChartTextMeasure }) {
  const points = data.series.flatMap(series => series.points.map((point,pointIndex) => ({ point, name: series.name, pointIndex })));
  const xs = unique(points.map(({ point }) => point.x)), ys = unique(points.map(({ point }) => point.y));
  const xLabels = xs.map(value => scalarText(sourceX(points.find(({ point }) => point.x === value)!.point)));
  const yLabels = ys.map(value => scalarText(sourceY(points.find(({ point }) => point.y === value)!.point)));
  const values = points.map(({ point }) => point.value ?? (numeric(point.y) ? point.y : 0));
  const min = Math.min(...values), max = Math.max(...values), magnitude = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const fontSize = viewport.fontSize, lineHeight = fontSize * 1.25, W = Math.max(fontSize === 7 ? 120 : 240, viewport.width);
  const left = Math.min(W * .25, Math.max(fontSize * 4, ...yLabels.map(label => measure(label) + 16))), right = 12, pw = W - left - right;
  const cw = pw / xs.length;
  // Heatmap row captions already take a column. Use the whole cell for x text;
  // measured glyphs include a safety pixel and never cross midpoint boundaries.
  const ticks = layoutXAxisTicks(xLabels, xs.map((_, index) => left + (index + .5) * cw), left, W - right, measure);
  const yLines = yLabels.map(label => wrapChartTick(label, left - 16, measure));
  const xCaption = data.xLabel ? wrapChartTick(data.xLabel, pw - 8, measure) : [];
  const yLabel = [data.yLabel, data.unit].filter(Boolean).join(' · '), yCaption = yLabel ? wrapChartTick(yLabel, W - 16, measure) : [];
  const top = Math.max(12, yCaption.length * lineHeight + 12);
  const tickHeight = Math.max(lineHeight, ...ticks.ticks.map(tick => tick.rotation ? tick.width * .71 + lineHeight : lineHeight));
  const bottomMargin = 12 + tickHeight + (xCaption.length ? xCaption.length * lineHeight + 12 : 0) + 8;
  const ch = Math.max(fontSize * 2.5, ...yLines.map(lines => lines.length * lineHeight + 12), (viewport.height - top - bottomMargin) / ys.length);
  const bottom = top + ys.length * ch, H = bottom + bottomMargin;
  return <>
    <svg className="chart-svg heatmap" width={W} height={H} style={{ width: W, height: H }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Heatmap">
      <title>Heatmap</title>
      {yCaption.length > 0 && <AxisCaption label={yLabel} lines={yCaption} x={8} baseline={fontSize} lineHeight={lineHeight} fontSize={fontSize} anchor="start" axis="y" />}
      {yLabels.map((label, index) => <text key={index} className="chart-tick" data-chart-axis="y" data-chart-tick-label={label} aria-label={label} style={{ fontSize }} x={left - 10} y={top + (index + .5) * ch - (yLines[index].length - 1) * lineHeight / 2 + fontSize * .35} textAnchor="end"><title>{label}</title>{yLines[index].map((line, i) => <tspan key={i} x={left - 10} dy={i ? lineHeight : 0}>{line}</tspan>)}</text>)}
      {ticks.ticks.map(tick => <ChartTick key={tick.index} tick={tick} baseline={bottom + 12 + fontSize} lineHeight={lineHeight} fontSize={fontSize} />)}
      {points.map(({ point, name, pointIndex }, index) => {
        const value = values[index], weight = (value / magnitude - min / magnitude) / (max / magnitude - min / magnitude || 1);
        const description = chartPointDescription('heatmap', name, point, data.unit);
        const cellLabel = format(value), emphasis=pointEmphasis(data.emphasis,name,pointIndex);
        return <g key={index} className="chart-point" data-emphasis={Boolean(emphasis)||undefined} style={emphasis?{stroke:emphasis.color??'var(--text)',strokeWidth:3}:undefined} data-chart-series={name} data-chart-x={scalarText(sourceX(point))} data-chart-y={scalarText(sourceY(point))} tabIndex={0} role="img" aria-label={description} onMouseEnter={() => select({ series: name, point })} onMouseLeave={() => select(null)} onFocus={() => select({ series: name, point })} onBlur={() => select(null)} onClick={() => select({ series: name, point })}>
          <rect x={left + xs.indexOf(point.x) * cw} y={top + ys.indexOf(point.y) * ch} width={Math.max(1, cw - 3)} height={Math.max(1, ch - 3)} rx="3" fill="var(--accent)" fillOpacity={.12 + weight * .88} />
          {measure(cellLabel) + 10 <= cw && <text className="chart-cell-value" x={left + (xs.indexOf(point.x) + .5) * cw} y={top + (ys.indexOf(point.y) + .5) * ch + fontSize * .35} textAnchor="middle" style={{ fontSize }} fill={weight > .55 ? 'var(--accent-ink)' : 'var(--text)'}>{cellLabel}</text>}
          <title>{description}</title>
        </g>;
      })}
      {xCaption.length > 0 && <AxisCaption label={data.xLabel!} lines={xCaption} x={left + pw / 2} baseline={bottom + 12 + tickHeight + 12 + fontSize} lineHeight={lineHeight} fontSize={fontSize} axis="x" />}
    </svg>
  </>;
}

import { TableRenderer } from './Table';
export { TableRenderer } from './Table';
export type { TableData } from './Table';
