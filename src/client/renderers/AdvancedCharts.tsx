import { geographyPoints } from '../../shared/geography/points';
import boundaries from '../../shared/geography/boundaries.json';
import { geographyCodes } from '../../shared/geography/codes';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { chartTopologicalOrder, isAdvancedChartKind, type Cell, type ChartData, type ChartGeometry, type ChartLink, type ChartNode, type ChartPoint, type ChartSummary } from '../../shared/chart-contract';
import './advanced-charts.css';
import { CATEGORICAL_PALETTE, seriesColor } from './chart-palette';
import { regionalDate, regionalNumber, type RegionalPreferences } from '../../shared/regional';
import { useRegional } from './Regional';

const colors = CATEGORICAL_PALETTE;
const rising = 'var(--chart-teal, #71c5b1)', falling = 'var(--chart-rose, #e98d9d)';
const maximumBubbleRadius = 27;
const color = (index: number) => colors[index % colors.length];
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const exact = (value: unknown): string => value === null || value === undefined ? 'Missing' : String(value);
const axisNumber = (value: number, preferences: RegionalPreferences): string => {
  const scientific = value !== 0 && (Math.abs(value) >= 1e15 || Math.abs(value) < .0001);
  if (scientific && !preferences.numberLocale) return value.toExponential(3);
  return new Intl.NumberFormat(preferences.numberLocale || undefined, { maximumSignificantDigits: 4, notation: scientific ? 'scientific' : Math.abs(value) >= 10000 ? 'compact' : 'standard' }).format(value);
};
function useAxisNumber() { const preferences = useRegional(); return (value: number) => axisNumber(value, preferences); }
type Inspect = (text: string | null) => void;
interface PlotProps { data: ChartData; width: number; height: number; inspect: Inspect; uid: string; details: boolean }
function rawPoint(point: ChartPoint, key: 'x' | 'y' | 'value' | 'open' | 'high' | 'low' | 'close' | 'size' | 'total'): Cell | undefined {
  if (key === 'x') return point.rawX !== undefined ? point.rawX : point.x;
  if (key === 'y') return point.rawY !== undefined ? point.rawY : point.y;
  return point.raw?.[key] !== undefined ? point.raw[key] : point[key];
}
function pointText(name: string, point: ChartPoint, data: ChartData): string {
  const label = `${name}: ${exact(rawPoint(point, 'x'))}`;
  if (data.kind === 'candlestick' || data.kind === 'ohlc') return `${label}; open ${exact(rawPoint(point, 'open'))}, high ${exact(rawPoint(point, 'high'))}, low ${exact(rawPoint(point, 'low'))}, close ${exact(rawPoint(point, 'close'))}${data.unit ? ` ${data.unit}` : ''}`;
  return `${label}; ${point.total ? 'total ' : ''}${exact(rawPoint(point, 'y'))}${data.unit ? ` ${data.unit}` : ''}${point.size !== undefined ? `; size ${exact(rawPoint(point, 'size'))} (circle area)` : ''}`;
}
function mark(label: string, inspect: Inspect, kind: string) {
  return { tabIndex: 0, role: 'img' as const, 'aria-label': label, 'data-chart-mark': kind, onMouseEnter: () => inspect(label), onMouseLeave: () => inspect(null), onFocus: () => inspect(label), onBlur: () => inspect(null) };
}
function pointMark(name: string, point: ChartPoint, data: ChartData, inspect: Inspect, kind = data.kind) {
  return { ...mark(pointText(name, point, data), inspect, kind), 'data-chart-series': name, 'data-chart-x': exact(rawPoint(point, 'x')), 'data-chart-y': exact(rawPoint(point, 'y')) };
}
function sourceSummary(summary?: ChartSummary): string | undefined {
  return summary ? [`${summary.displayedRows.toLocaleString()} shown from ${summary.sourceRows.toLocaleString()} source rows`, summary.aggregation && summary.aggregation !== 'none' ? summary.aggregation : '', summary.downsampled ? 'downsampled' : '', summary.excludedRows ? `${summary.excludedRows} rows excluded` : '', summary.precisionNote].filter(Boolean).join(' · ') : undefined;
}

/** Wrapping changes layout, never stored labels; complete originals remain accessible. */
export function wrapChartLabel(text: string, characters: number): string[] {
  const limit = Math.max(3, Math.floor(characters)), result: string[] = [];
  let line = '';
  for (const token of text.split(/\s+/)) {
    const parts = Array.from(token);
    if (line && Array.from(line).length + parts.length + 1 > limit) { result.push(line); line = ''; }
    while (parts.length > limit) { result.push(parts.splice(0, limit).join('')); }
    if (parts.length) line += `${line ? ' ' : ''}${parts.join('')}`;
  }
  if (line || !result.length) result.push(line);
  return result;
}
function SvgLabel({ text, x, y, characters, anchor = 'middle', className = '' }: { text: string; x: number; y: number; characters: number; anchor?: 'start' | 'middle' | 'end'; className?: string }) {
  return <text className={`advanced-label ${className}`} x={x} y={y} textAnchor={anchor} aria-label={text}><title>{text}</title>{wrapChartLabel(text, characters).map((line, index) => <tspan key={index} x={x} dy={index ? 19 : 0}>{line}</tspan>)}</text>;
}
function Svg({ width, height, title, children }: { width: number; height: number; title: string; children: ReactNode }) {
  return <svg className="chart-svg advanced-chart-svg" width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}><title>{title}</title>{children}</svg>;
}
function quantile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction, left = Math.floor(position), right = Math.ceil(position);
  return sorted[left] + (sorted[right] - sorted[left]) * (position - left);
}

export interface ViolinEstimate { bandwidth: number; low: number; high: number; median: number; q1: number; q3: number; density: { value: number; density: number }[] }
/** Gaussian KDE, not invented observations. Widths are normalized within each distribution. */
export function violinDensity(samples: number[], suppliedBandwidth?: number): ViolinEstimate {
  const sorted = [...samples].sort((a, b) => a - b), low = sorted[0], high = sorted.at(-1)!, span = high - low;
  const q1 = quantile(sorted, .25), median = quantile(sorted, .5), q3 = quantile(sorted, .75);
  let bandwidth = suppliedBandwidth ?? 0;
  if (!bandwidth && span > 0) {
    const scaled = samples.map(value => (value - low) / span), mean = scaled.reduce((sum, value) => sum + value, 0) / scaled.length;
    const deviation = Math.sqrt(scaled.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (scaled.length - 1));
    const spread = (q3 - q1) / span / 1.34;
    bandwidth = .9 * (spread > 0 ? Math.min(deviation, spread) : deviation) * Math.pow(samples.length, -.2) * span;
  }
  if (!(bandwidth > 0) || !Number.isFinite(bandwidth)) return { bandwidth: 0, low, high, q1, median, q3, density: [{ value: low, density: 0 }] };
  let from = Math.max(-Number.MAX_VALUE, low - 3 * bandwidth), to = Math.min(Number.MAX_VALUE, high + 3 * bandwidth);
  if (!Number.isFinite(to - from)) { from = low; to = high; }
  const density = Array.from({ length: 65 }, (_, index) => {
    const value = from + (to - from) * (index / 64);
    let weight = 0;
    for (const sample of samples) { const normalized = (value - sample) / bandwidth; weight += Math.exp(-.5 * normalized * normalized); }
    return { value, density: weight / samples.length };
  });
  const peak = Math.max(...density.map(point => point.density));
  return { bandwidth, low, high, q1, median, q3, density: density.map(point => ({ value: point.value, density: peak ? point.density / peak : 0 })) };
}
export function waterfallSteps(points: ChartPoint[]): { point: ChartPoint; start: number; end: number }[] {
  let running = 0;
  return points.map(point => { const start = point.total ? 0 : running, end = point.total ? Number(point.y) : running + Number(point.y); running = end; return { point, start, end }; });
}

function CartesianPlot({ data, width, height, inspect }: PlotProps) {
  const pretty = useAxisNumber(), regional = useRegional();
  const entries = data.series.flatMap((series, si) => series.points.map((point, pi) => ({ series, point, si, pi })));
  const estimates = useMemo(() => new Map(data.series.flatMap((series, si) => series.points.flatMap((point, pi) => point.samples?.length ? [[`${si}:${pi}`, violinDensity(point.samples, point.bandwidth)] as const] : []))), [data]);
  if (!entries.length) return <p className="content-empty">No observations supplied.</p>;
  const sequential = ['candlestick', 'ohlc', 'waterfall'].includes(data.kind);
  const labels = sequential ? entries.map(entry => entry.point.x) : [...new Map(entries.map(entry => [JSON.stringify(entry.point.x), entry.point.x])).values()];
  const dateX = data.kind === 'area' && entries.every(({ point }) => typeof point.x === 'string' && /^\d{4}-\d\d-\d\d/.test(point.x) && Number.isFinite(Date.parse(point.x)));
  const continuous = data.kind === 'bubble' || data.kind === 'area' && (dateX || entries.every(({ point }) => typeof point.x === 'number'));
  const asX = (point: ChartPoint) => dateX ? Date.parse(String(point.x)) : Number(point.x);
  const steps = data.kind === 'waterfall' ? waterfallSteps(data.series[0].points) : [];
  let lo = Infinity, hi = -Infinity;
  const extent = (value: unknown) => { if (number(value)) { lo = Math.min(lo, value); hi = Math.max(hi, value); } };
  for (const { point, si, pi } of entries) {
    if (data.kind === 'candlestick' || data.kind === 'ohlc') { extent(point.low); extent(point.high); }
    else if (data.kind === 'violin') estimates.get(`${si}:${pi}`)?.density.forEach(point => extent(point.value));
    else extent(point.y);
  }
  if (data.kind === 'waterfall') steps.forEach(step => { extent(step.start); extent(step.end); });
  if (data.kind === 'area' || data.kind === 'waterfall') extent(0);
  if (lo === Infinity) return <p className="content-empty">No numeric observations supplied.</p>;
  if (!Number.isFinite(hi - lo)) return <ExactDataTable data={data} />;
  const yTicks = lo === hi ? [lo] : Array.from({ length: 5 }, (_, i) => lo + (hi - lo) * (i / 4));
  const left = Math.max(65, ...yTicks.map(value => pretty(value).length * 8.5 + 12)) + (data.yLabel || data.unit ? 27 : 0), right = data.kind === 'bubble' ? 34 : 22, top = 28;
  // Label length affects wrapping, not bar width. Only genuinely dense charts
  // need horizontal scrolling; thirteen monthly categories fit a desktop.
  const slot = data.kind === 'waterfall' ? 52 : 68;
  const plotWidth = continuous ? Math.max(180, width - left - right) : Math.max(width - left - right, labels.length * slot);
  const actualWidth = left + plotWidth + right, categoryWidth = plotWidth / labels.length;
  const labelLines = continuous ? 3 : Math.max(...labels.map(label => wrapChartLabel(String(label), (categoryWidth - 12) / 8).length));
  const bottomMargin = Math.max(65, labelLines * 19 + 30 + (data.xLabel ? 28 : 0));
  const plotHeight = Math.max(140, height - top - bottomMargin), bottom = top + plotHeight, actualHeight = bottom + bottomMargin;
  // Radius is in real CSS pixels. Reserve its full extent at every data edge,
  // including an extremal observation whose size is the largest in the set.
  const bubbleInset = data.kind === 'bubble' ? maximumBubbleRadius + 2 : 0;
  const y = (value: number) => lo === hi ? top + plotHeight / 2 : bottom - bubbleInset - (value - lo) / (hi - lo) * (plotHeight - bubbleInset * 2);
  let xLo = Infinity, xHi = -Infinity;
  if (continuous) for (const { point } of entries) { xLo = Math.min(xLo, asX(point)); xHi = Math.max(xHi, asX(point)); }
  const continuousX = (value: number) => xLo === xHi ? left + plotWidth / 2 : left + bubbleInset + (value - xLo) / (xHi - xLo) * (plotWidth - bubbleInset * 2);
  const x = (point: ChartPoint, index: number) => continuous ? continuousX(asX(point)) : left + ((sequential ? index : labels.indexOf(point.x)) + .5) * categoryWidth;
  const xTicks = continuous ? Array.from({ length: xLo === xHi ? 1 : Math.max(2, Math.min(5, Math.floor(plotWidth / (dateX ? 135 : 90)))) }, (_, index) => index) : [];
  const ticks = xTicks.map((_, index) => { const value = xLo + (xHi - xLo) * (xTicks.length === 1 ? .5 : index / (xTicks.length - 1)); return { value, label: dateX ? regionalDate(value, regional, 'UTC', () => new Date(value).toISOString().slice(0, 10)) : pretty(value) }; });
  const bubbleMaximum = Math.max(1e-300, ...entries.map(entry => entry.point.size ?? 0));
  const content = data.series.map((series, si) => {
    const ink = seriesColor(si, data.series.length);
    if (data.kind === 'area') {
      const runs: ChartPoint[][] = []; let current: ChartPoint[] = [];
      for (const point of series.points) { if (number(point.y)) current.push(point); else if (current.length) { runs.push(current); current = []; } }
      if (current.length) runs.push(current);
      return <g key={si}>{runs.map((run, index) => {
        const stroke = run.map((point, i) => `${i ? 'L' : 'M'}${x(point, series.points.indexOf(point))},${y(point.y as number)}`).join(' '), first = run[0], last = run.at(-1)!;
        return <g key={index}><path data-chart-mark="area-fill" d={`${stroke} L${x(last, series.points.indexOf(last))},${y(0)} L${x(first, series.points.indexOf(first))},${y(0)} Z`} fill={ink} fillOpacity=".24" /><path d={stroke} fill="none" stroke={ink} strokeWidth="2.5" /></g>;
      })}{series.points.map((point, index) => number(point.y) ? <circle key={index} cx={x(point, index)} cy={y(point.y)} r={series.points.length > 120 ? 2 : 4} fill={ink} {...pointMark(series.name, point, data, inspect)}><title>{pointText(series.name, point, data)}</title></circle> : null)}</g>;
    }
    if (data.kind === 'bubble') return <g key={si}>{series.points.map((point, index) => {
      const radius = maximumBubbleRadius * Math.sqrt(point.size!) / Math.sqrt(bubbleMaximum);
      return <g key={index} {...pointMark(series.name, point, data, inspect)}><circle cx={x(point, index)} cy={y(point.y as number)} r={radius} fill={ink} fillOpacity=".46" stroke={ink} data-chart-size={exact(rawPoint(point, 'size'))} /><circle cx={x(point, index)} cy={y(point.y as number)} r={Math.max(9, radius)} fill="transparent" stroke="none" /><title>{pointText(series.name, point, data)}</title></g>;
    })}</g>;
    if (data.kind === 'candlestick' || data.kind === 'ohlc') return <g key={si}>{series.points.map((point, index) => {
      const cx = x(point, index), half = Math.min(19, categoryWidth * .31), ink = point.close! >= point.open! ? rising : falling;
      return <g key={index} stroke={ink} fill={ink} strokeWidth="2" {...pointMark(series.name, point, data, inspect)}><title>{pointText(series.name, point, data)}</title>
        <line x1={cx} x2={cx} y1={y(point.low!)} y2={y(point.high!)} data-chart-part="high-low" />
        {data.kind === 'ohlc' ? <><line x1={cx - half} x2={cx} y1={y(point.open!)} y2={y(point.open!)} data-chart-part="open" /><line x1={cx} x2={cx + half} y1={y(point.close!)} y2={y(point.close!)} data-chart-part="close" /></> : point.open === point.close ? <line x1={cx - half} x2={cx + half} y1={y(point.open!)} y2={y(point.open!)} data-chart-part="doji" /> : <rect x={cx - half} y={Math.min(y(point.open!), y(point.close!))} width={half * 2} height={Math.abs(y(point.open!) - y(point.close!))} fillOpacity={point.close! >= point.open! ? '.22' : '.9'} data-chart-part="open-close-body" />}
      </g>;
    })}</g>;
    if (data.kind === 'waterfall') return <g key={si}>{steps.map((step, index) => {
      const cx = x(step.point, index), half = categoryWidth * .33, ink = step.point.total ? 'var(--accent)' : Number(step.point.y) >= 0 ? rising : falling;
      return <g key={index} {...pointMark(series.name, step.point, data, inspect)} data-chart-start={step.start} data-chart-end={step.end}><title>{pointText(series.name, step.point, data)}</title>
        {index > 0 && <line x1={x(steps[index - 1].point, index - 1) + half} x2={cx - half} y1={y(steps[index - 1].end)} y2={y(steps[index - 1].end)} stroke="var(--muted)" strokeDasharray="3 4" />}
        {step.start === step.end ? <line x1={cx - half} x2={cx + half} y1={y(step.start)} y2={y(step.start)} stroke={ink} strokeWidth="3" /> : <rect x={cx - half} y={Math.min(y(step.start), y(step.end))} width={half * 2} height={Math.abs(y(step.start) - y(step.end))} fill={ink} fillOpacity=".82" rx="2" />}
      </g>;
    })}</g>;
    if (data.kind === 'violin') return <g key={si}>{series.points.map((point, index) => {
      const estimate = estimates.get(`${si}:${index}`); if (!estimate) return null;
      const half = categoryWidth * .4 / data.series.length, cx = x(point, index) + (si - (data.series.length - 1) / 2) * half * 2;
      const outline = [...estimate.density.map(p => [cx - p.density * half, y(p.value)]), ...[...estimate.density].reverse().map(p => [cx + p.density * half, y(p.value)])];
      const raw = point.rawSamples ?? point.samples!, detail = `${series.name}: ${point.x}; Gaussian density estimate from ${raw.length} actual samples; median ${estimate.median}; bandwidth ${estimate.bandwidth}; supplied samples ${raw.slice(0, 6).map(exact).join(', ')}${raw.length > 6 ? '; all samples available in Data' : ''}`;
      const tone = data.series.length === 1 ? color(index) : ink; return <g key={index} {...mark(detail, inspect, 'violin')} data-chart-x={String(point.x)} data-chart-samples={raw.length}><title>{detail}</title><path d={`${outline.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ')} Z`} fill={tone} fillOpacity=".34" stroke={tone} strokeWidth="2" /><line x1={cx} x2={cx} y1={y(estimate.q1)} y2={y(estimate.q3)} stroke={tone} strokeWidth="6" /><circle cx={cx} cy={y(estimate.median)} r="4" fill="var(--text)" /></g>;
    })}</g>;
    return null;
  });
  return <Svg width={actualWidth} height={actualHeight} title={`${data.kind} chart${data.yLabel ? ` of ${data.yLabel}` : ''}`}>
    {yTicks.map((value, i) => <g key={i} className="advanced-axis"><line x1={left} x2={actualWidth - right} y1={y(value)} y2={y(value)} /><text x={left - 10} y={y(value) + 5} textAnchor="end">{pretty(value)}</text></g>)}
    {continuous ? ticks.map((tick, i) => <SvgLabel key={i} text={tick.label} x={continuousX(tick.value)} y={bottom + 27} characters={dateX ? 10 : 12} anchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'} />) : labels.map((label, index) => <SvgLabel key={index} text={String(label)} x={left + (index + .5) * categoryWidth} y={bottom + 28} characters={(categoryWidth - 12) / 8} />)}
    {(data.yLabel || data.unit) && <text className="advanced-label" x="17" y={top + plotHeight / 2} transform={`rotate(-90 17 ${top + plotHeight / 2})`} textAnchor="middle">{[data.yLabel, data.unit].filter(Boolean).join(' · ')}</text>}
    {data.xLabel && <text className="advanced-label" x={left + plotWidth / 2} y={actualHeight - 9} textAnchor="middle">{data.xLabel}</text>}
    {content}
  </Svg>;
}

interface KeyItem { id: string; label: string; value?: string; color?: string; index?: number; detail?: string }
function ChartKey({ items, inspect, className = '', values = true }: { items: KeyItem[]; inspect: Inspect; className?: string; values?: boolean }) {
  return <ul className={`${values ? "advanced-chart-key" : "advanced-chart-legend"} ${className}`} aria-label={values ? "Chart labels and values" : "Chart legend"}>{items.map(item => <li key={item.id} {...mark(item.detail ?? [item.label, item.value].filter(Boolean).join(': '), inspect, 'key')}>
    <i aria-hidden="true" className={item.color ? 'advanced-key-swatch' : undefined} style={item.color ? { background: item.color } : undefined}>{item.index}</i><span>{item.label}</span>{values && item.value !== undefined && <strong>{item.value}</strong>}
  </li>)}</ul>;
}
function polar(cx: number, cy: number, radius: number, angle: number): [number, number] { return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]; }
export function pieArc(cx: number, cy: number, radius: number, inner: number, start: number, end: number): string {
  const a = polar(cx, cy, radius, start), b = polar(cx, cy, radius, end), mid = polar(cx, cy, radius, (start + end) / 2);
  const full = end - start > Math.PI * 2 - 1e-10;
  const outer = full ? `M${a} A${radius},${radius} 0 0 1 ${mid} A${radius},${radius} 0 0 1 ${b}` : `M${a} A${radius},${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${b}`;
  if (!inner) return `${outer} L${cx},${cy} Z`;
  const c = polar(cx, cy, inner, end), d = polar(cx, cy, inner, start), im = polar(cx, cy, inner, (start + end) / 2);
  return full ? `${outer} L${c} A${inner},${inner} 0 0 0 ${im} A${inner},${inner} 0 0 0 ${d} Z` : `${outer} L${c} A${inner},${inner} 0 ${end - start > Math.PI ? 1 : 0} 0 ${d} Z`;
}
function ProportionPlot({ data, width, height, inspect, details }: PlotProps) {
  const pretty = useAxisNumber();
  const series = data.series[0], points = series?.points ?? [], total = points.reduce((sum, point) => sum + Number(point.y), 0);
  if (!(total > 0)) return <p className="content-empty">No positive proportion supplied.</p>;
  const size = Math.max(260, Math.min(width < 650 ? width : width * .56, height, 670)), radius = size * .44, inner = data.kind === 'donut' ? radius * .58 : 0;
  let angle = -Math.PI / 2;
  return <div className="advanced-plot-with-key"><Svg width={size} height={size} title={`${data.kind} chart of ${series.name}`}>
    {points.map((point, index) => {
      const start = angle; angle += Number(point.y) / total * Math.PI * 2;
      return Number(point.y) > 0 ? <path key={index} d={pieArc(size / 2, size / 2, radius, inner, start, angle)} fill={color(index)} stroke="var(--surface)" strokeWidth="1.5" {...pointMark(series.name, point, data, inspect)} data-chart-proportion={Number(point.y) / total}><title>{pointText(series.name, point, data)}</title></path> : null;
    })}
    {inner > 0 && <><text x={size / 2} y={size / 2 - 6} textAnchor="middle" className="advanced-donut-total">≈ {pretty(total)}</text><text x={size / 2} y={size / 2 + 22} textAnchor="middle" className="advanced-label">Total{data.unit ? ` · ${data.unit}` : ''}</text></>}
  </Svg><ChartKey values={details} inspect={inspect} items={points.map((point, index) => ({ id: String(index), label: exact(rawPoint(point, 'x')), value: `${exact(rawPoint(point, 'y'))}${data.unit ? ` ${data.unit}` : ''}`, color: color(index), detail: `${pointText(series.name, point, data)}; ${pretty(Number(point.y) / total * 100)}%` }))} /></div>;
}

function RadarPlot({ data, width, height, inspect, details }: PlotProps) {
  const axes = data.radarAxes ?? [], size = Math.max(280, Math.min(width < 700 ? width : width * .6, height, 640)), cx = size / 2, cy = size / 2, radius = size * .36;
  if (!axes.length) return <p className="content-empty">No attribute scales supplied.</p>;
  const at = (index: number, proportion: number) => polar(cx, cy, radius * proportion, -Math.PI / 2 + Math.PI * 2 * index / axes.length);
  return <div className="advanced-plot-with-key"><Svg width={size} height={size} title="Radar comparison on explicitly supplied attribute ranges">
    {[.25, .5, .75, 1].map(level => <polygon key={level} points={axes.map((_, index) => at(index, level).join(',')).join(' ')} className="advanced-radar-ring" />)}
    {axes.map((axis, index) => { const [x, y] = at(index, 1), [tx, ty] = at(index, 1.15); return <g key={axis.key}><line x1={cx} y1={cy} x2={x} y2={y} className="advanced-radar-spoke" /><text x={tx} y={ty + 5} textAnchor="middle" className="advanced-label">{index + 1}</text></g>; })}
    {data.series.map((series, si) => <g key={si}><polygon points={axes.map((axis, index) => { const point = series.points.find(point => point.x === axis.key)!; return at(index, (Number(point?.y) - axis.min) / (axis.max - axis.min)).join(','); }).join(' ')} fill={seriesColor(si, data.series.length)} fillOpacity=".18" stroke={seriesColor(si, data.series.length)} strokeWidth="2.5" data-chart-mark="radar-polygon" />
      {axes.map((axis, index) => { const point = series.points.find(point => point.x === axis.key); if (!point) return null; const [x, y] = at(index, (Number(point.y) - axis.min) / (axis.max - axis.min)); return <circle key={axis.key} cx={x} cy={y} r="5" fill={seriesColor(si, data.series.length)} {...pointMark(series.name, point, { ...data, unit: axis.unit ?? data.unit }, inspect)}><title>{pointText(series.name, point, data)}</title></circle>; })}
    </g>)}
  </Svg><ChartKey values={details} inspect={inspect} className="advanced-radar-key" items={axes.map((axis, index) => ({ id: axis.key, index: index + 1, label: axis.label ?? axis.key, value: `${exact(axis.min)}–${exact(axis.max)}${axis.unit ?? data.unit ? ` ${axis.unit ?? data.unit}` : ''}`, detail: `${axis.label ?? axis.key}; range ${axis.min} to ${axis.max}${axis.unit ?? data.unit ? ` ${axis.unit ?? data.unit}` : ''}` }))} /></div>;
}

function NetworkPlot({ data, width, height, inspect, uid, details }: PlotProps) {
  const nodes = data.nodes ?? [], links = data.links ?? [], size = Math.max(290, Math.min(width < 700 ? width : width * .62, height, 720)), center = size / 2, radius = size * .36;
  const xs = nodes.map(node => node.x ?? 0), ys = nodes.map(node => node.y ?? 0), xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
  const positions = new Map(nodes.map((node, index) => [node.id, node.x !== undefined && node.y !== undefined ? [xMin === xMax ? center : 45 + (node.x - xMin) / (xMax - xMin) * (size - 90), yMin === yMax ? center : 45 + (node.y - yMin) / (yMax - yMin) * (size - 90)] : nodes.length === 1 ? [center, center] : polar(center, center, radius, index / nodes.length * Math.PI * 2 - Math.PI / 2)]));
  const maxWeight = Math.max(1e-300, ...links.map(link => link.value ?? 0));
  const label = (id: string) => nodes.find(node => node.id === id)?.label ?? id;
  return <div className="advanced-plot-with-key"><Svg width={size} height={size} title={`${data.directed ? 'Directed n' : 'N'}etwork of supplied entities and connections`}>
    {data.directed && <defs><marker id={`${uid}-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L7,3.5 L0,7 Z" fill="var(--muted)" /></marker></defs>}
    {links.map((link, index) => {
      const a = positions.get(link.source), b = positions.get(link.target); if (!a || !b) return null;
      const description = `${label(link.source)} ${data.directed ? 'to' : 'connected to'} ${label(link.target)}${link.value !== undefined ? `; weight ${exact(link.raw?.value ?? link.value)}${data.unit ? ` ${data.unit}` : ''}` : ''}`;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = length ? (b[0] - a[0]) / length : 0, uy = length ? (b[1] - a[1]) / length : 0;
      const path = link.source === link.target ? `M${a[0] - 7},${a[1] - 8} C${a[0] - 32},${a[1] - 44} ${a[0] + 32},${a[1] - 44} ${a[0] + 7},${a[1] - 8}` : `M${a[0] + ux * 13},${a[1] + uy * 13} L${b[0] - ux * 15},${b[1] - uy * 15}`;
      return <g key={index} {...mark(description, inspect, 'network-link')}><path d={path} fill="none" stroke="var(--muted)" strokeOpacity=".64" strokeWidth={link.value === undefined ? 2 : 9 * link.value / maxWeight} markerEnd={data.directed ? `url(#${uid}-arrow)` : undefined} /><path d={path} fill="none" stroke="transparent" strokeWidth="12" /><title>{description}</title></g>;
    })}
    {nodes.map((node, index) => { const [x, y] = positions.get(node.id)!; return <g key={node.id} {...mark(`${node.label ?? node.id}${node.value !== undefined ? `; value ${exact(node.raw?.value ?? node.value)}` : ''}`, inspect, 'network-node')} data-chart-node={node.id}><circle cx={x} cy={y} r="13" fill={color(index)} /><text x={x} y={y + 5} className="advanced-node-index" textAnchor="middle">{index + 1}</text>{!details && <text x={x} y={y+32} className="advanced-label" textAnchor="middle">{node.label ?? node.id}</text>}<title>{node.label ?? node.id}</title></g>; })}
  </Svg>{details && <ChartKey inspect={inspect} items={nodes.map((node, index) => ({ id: node.id, index: index + 1, color: color(index), label: node.label ?? node.id, ...(node.value !== undefined ? { value: exact(node.raw?.value ?? node.value) } : {}) }))} />}</div>;
}

export interface TreemapRectangle { node: ChartNode; x: number; y: number; width: number; height: number; value: number; depth: number; group: number }
/** Hierarchical slice-and-dice treemap. Leaf area is proportional within its parent. */
export function treemapLayout(nodes: ChartNode[], width: number, height: number): TreemapRectangle[] {
  const children = new Map<string | undefined, ChartNode[]>();
  for (const node of nodes) children.set(node.parent, [...(children.get(node.parent) ?? []), node]);
  const totals = new Map<string, number>();
  const total = (node: ChartNode, seen = new Set<string>()): number => { if (totals.has(node.id)) return totals.get(node.id)!; if (seen.has(node.id)) return 0; seen.add(node.id); const nested = children.get(node.id); const value = nested?.length ? nested.reduce((sum, child) => sum + total(child, new Set(seen)), 0) : node.value ?? 0; totals.set(node.id, value); return value; };
  nodes.forEach(node => total(node));
  const result: TreemapRectangle[] = [];
  const divide = (siblings: ChartNode[], x: number, y: number, w: number, h: number, depth: number, rootGroup?: number): void => {
    const sum = siblings.reduce((sum, node) => sum + total(node), 0); if (!(sum > 0) || depth > 12) return;
    const vertical = w >= h; let used = 0;
    siblings.forEach((node, index) => {
      const value = total(node), extent = (vertical ? w : h) * (value / sum), group = rootGroup ?? index;
      const box = { node, value, depth, group, x: x + (vertical ? used : 0), y: y + (vertical ? 0 : used), width: vertical ? extent : w, height: vertical ? h : extent }; used += extent; result.push(box);
      const nested = children.get(node.id); if (nested?.length) divide(nested, box.x + 3, box.y + Math.min(26, box.height * .2), Math.max(0, box.width - 6), Math.max(0, box.height - Math.min(26, box.height * .2) - 3), depth + 1, depth === 0 && siblings.length === 1 ? undefined : group);
    });
  };
  divide(children.get(undefined) ?? [], 0, 0, width, height, 0);
  return result;
}
function TreemapPlot({ data, width, height, inspect, details }: PlotProps) {
  const pretty = useAxisNumber();
  const plotHeight = Math.max(180, height), rectangles = useMemo(() => treemapLayout(data.nodes ?? [], Math.max(240, width), plotHeight), [data.nodes, width, plotHeight]);
  const childIds = new Set(data.nodes?.flatMap(node => node.parent ? [node.parent] : []) ?? []);
  return <div className="advanced-hierarchy"><Svg width={Math.max(240, width)} height={plotHeight} title="Treemap of supplied hierarchy and part-to-whole values">
    {rectangles.map(box => <g key={box.node.id} {...mark(`${box.node.label ?? box.node.id}; ${box.node.value === undefined ? 'sum of children ' : ''}${exact(box.node.raw?.value !== null && box.node.raw?.value !== undefined ? box.node.raw.value : box.value)}`, inspect, 'treemap-node')} data-chart-node={box.node.id} data-chart-value={box.value} data-chart-depth={box.depth}>
      <rect x={box.x} y={box.y} width={box.width} height={box.height} fill={color(box.group)} fillOpacity={childIds.has(box.node.id) ? '.2' : '.64'} stroke="var(--surface)" strokeWidth="2" />
      {box.width > 74 && box.height > 44 && !childIds.has(box.node.id) && wrapChartLabel(box.node.label ?? box.node.id, (box.width - 12) / 8).length * 20 + 32 < box.height && <foreignObject x={box.x + 6} y={box.y + 6} width={box.width - 12} height={box.height - 12}><div className="advanced-treemap-label">{box.node.label ?? box.node.id}<strong>{pretty(box.value)}</strong></div></foreignObject>}
      {childIds.has(box.node.id) && box.width > Math.max(80, Array.from(box.node.label ?? box.node.id).length * 9 + 14) && box.height > 50 && <text x={box.x + 7} y={box.y + 18} className="advanced-label">{box.node.label ?? box.node.id}</text>}
      <title>{`${box.node.label ?? box.node.id}: ${box.value}`}</title>
    </g>)}
  </Svg>{details && <ChartKey inspect={inspect} className="advanced-key-grid" items={rectangles.map(box => ({ id: box.node.id, label: box.node.label ?? box.node.id, value: `${exact(box.node.value !== undefined ? box.node.raw?.value ?? box.node.value : box.value)}${data.unit ? ` ${data.unit}` : ''}`, color: color(box.group), detail: `${box.node.label ?? box.node.id}; ${box.node.value === undefined ? 'sum of children ' : ''}${box.value}` }))} />}</div>;
}

export interface SankeyNodeLayout { node: ChartNode; x: number; y: number; width: number; height: number; incoming: number; outgoing: number }
export interface SankeyLinkLayout { link: ChartLink; path: string; thickness: number }
export function sankeyLayout(nodes: ChartNode[], links: ChartLink[], requestedWidth: number, requestedHeight: number): { nodes: SankeyNodeLayout[]; links: SankeyLinkLayout[]; width: number; height: number } {
  const order = chartTopologicalOrder(nodes, links); if (!order) return { nodes: [], links: [], width: requestedWidth, height: requestedHeight };
  const levels = new Map(order.map(id => [id, 0]));
  for (const id of order) for (const link of links.filter(link => link.source === id)) levels.set(link.target, Math.max(levels.get(link.target)!, levels.get(id)! + 1));
  const last = Math.max(0, ...levels.values()), columns = Array.from({ length: last + 1 }, (_, level) => nodes.filter(node => levels.get(node.id) === level));
  const width = Math.max(requestedWidth, (last + 1) * 145 + 24), height = Math.max(requestedHeight, ...columns.map(column => column.length * 31 + 35));
  const incoming = (id: string) => links.filter(link => link.target === id).reduce((sum, link) => sum + (link.value ?? 0), 0), outgoing = (id: string) => links.filter(link => link.source === id).reduce((sum, link) => sum + (link.value ?? 0), 0);
  const throughput = new Map(nodes.map(node => [node.id, Math.max(incoming(node.id), outgoing(node.id))]));
  const maximum = Math.max(1e-300, ...throughput.values()), gap = 16, pad = 24, nodeWidth = 17;
  const scale = Math.min(...columns.filter(column => column.length).map(column => (height - pad * 2 - (column.length - 1) * gap) / column.reduce((sum, node) => sum + throughput.get(node.id)! / maximum, 0)));
  const placed = new Map<string, SankeyNodeLayout>();
  columns.forEach((column, level) => {
    const size = column.reduce((sum, node) => sum + throughput.get(node.id)! / maximum * scale, 0) + (column.length - 1) * gap; let y = (height - size) / 2;
    column.forEach(node => { const h = throughput.get(node.id)! / maximum * scale; placed.set(node.id, { node, x: pad + (last ? level / last : .5) * (width - pad * 2 - nodeWidth), y, width: nodeWidth, height: h, incoming: incoming(node.id), outgoing: outgoing(node.id) }); y += h + gap; });
  });
  const from = new Map(nodes.map(node => [node.id, placed.get(node.id)!.y + (throughput.get(node.id)! - outgoing(node.id)) / maximum * scale / 2]));
  const to = new Map(nodes.map(node => [node.id, placed.get(node.id)!.y + (throughput.get(node.id)! - incoming(node.id)) / maximum * scale / 2]));
  const paths = links.map(link => {
    const source = placed.get(link.source)!, target = placed.get(link.target)!, sy = from.get(link.source)!, ty = to.get(link.target)!, thickness = (link.value ?? 0) / maximum * scale, sx = source.x + nodeWidth, tx = target.x, middle = (sx + tx) / 2;
    from.set(link.source, sy + thickness); to.set(link.target, ty + thickness);
    return { link, thickness, path: `M${sx},${sy} C${middle},${sy} ${middle},${ty} ${tx},${ty} L${tx},${ty + thickness} C${middle},${ty + thickness} ${middle},${sy + thickness} ${sx},${sy + thickness} Z` };
  });
  return { nodes: nodes.map(node => placed.get(node.id)!), links: paths, width, height };
}
function SankeyPlot({ data, width, height, inspect, details }: PlotProps) {
  const pretty = useAxisNumber();
  const nodes = data.nodes ?? [], layout = useMemo(() => sankeyLayout(nodes, data.links ?? [], width, Math.max(320, Math.min(height, 670))), [data.nodes, data.links, width, height]);
  const label = (id: string) => nodes.find(node => node.id === id)?.label ?? id;
  return <div className="advanced-hierarchy"><Svg width={layout.width} height={layout.height} title="Sankey flow diagram with proportional supplied weights">
    {layout.links.map(({ link, path, thickness }, index) => { const description = `${label(link.source)} to ${label(link.target)}: ${exact(link.raw?.value ?? link.value)}${data.unit ? ` ${data.unit}` : ''}`; return <path key={index} d={path} fill={color(nodes.findIndex(node => node.id === link.source))} fillOpacity=".42" {...mark(description, inspect, 'sankey-flow')} data-chart-weight={link.value} data-chart-thickness={thickness}><title>{description}</title></path>; })}
    {layout.nodes.map((placed, index) => <g key={placed.node.id} {...mark(`${placed.node.label ?? placed.node.id}; incoming ${placed.incoming}, outgoing ${placed.outgoing}`, inspect, 'sankey-node')} data-chart-node={placed.node.id}>
      <rect x={placed.x} y={placed.y} width={placed.width} height={placed.height} fill={color(index)} /><text x={placed.x + (placed.x > layout.width / 2 ? -6 : placed.width + 6)} y={placed.y + placed.height / 2 + 5} textAnchor={placed.x > layout.width / 2 ? 'end' : 'start'} className="advanced-label">{details ? index + 1 : placed.node.label ?? placed.node.id}</text><title>{placed.node.label ?? placed.node.id}</title>
    </g>)}
  </Svg>{details && <ChartKey inspect={inspect} className="advanced-key-grid" items={layout.nodes.map((placed, index) => ({ id: placed.node.id, index: index + 1, color: color(index), label: placed.node.label ?? placed.node.id, value: `${pretty(placed.incoming)} in · ${pretty(placed.outgoing)} out${data.unit ? ` ${data.unit}` : ''}` }))} />}</div>;
}

export function regionGeometry(region: NonNullable<ChartData['regions']>[number]):ChartGeometry { return region.geometry ?? (boundaries as unknown as Record<string,{geometry:ChartGeometry}>)[geographyCodes[region.countryCode!.toUpperCase()]]?.geometry ?? {type:'Polygon',coordinates:[]}; }
function geometryRings(geometry: ChartGeometry): [number, number][][] { return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat(); }
export function choroplethPaths(data: ChartData, width: number, height: number): { id: string; path: string }[] {
  const entries=(data.regions??[]).map(region=>({region,rings:geometryRings(regionGeometry(region)),point:region.geometry?undefined:geographyPoints[geographyCodes[region.countryCode!.toUpperCase()]]}));
  const coordinates=entries.flatMap(e=>e.point?[e.point]:e.rings.flat());if(!coordinates.length)return [];
  const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]),xMin=Math.min(...xs),xMax=Math.max(...xs),yMin=Math.min(...ys),yMax=Math.max(...ys);
  const scale=Math.min((width-36)/(xMax-xMin||1),(height-36)/(yMax-yMin||1)),ox=(width-(xMax-xMin)*scale)/2,oy=(height-(yMax-yMin)*scale)/2;
  const project=([x,y]:[number,number])=>[ox+(x-xMin)*scale,oy+(yMax-y)*scale];
  return entries.filter(e=>e.point||e.rings.length).map(({region,rings,point})=>{if(point){const [x,y]=project(point);return {id:region.id,path:`M${x-5},${y}a5,5 0 1,0 10,0a5,5 0 1,0 -10,0`};}return {id:region.id,path:rings.map(ring=>`${ring.map((p,i)=>`${i?'L':'M'}${project(p).join(',')}`).join(' ')} Z`).join(' ')};});
}

function ChoroplethPlot({ data, width, height, inspect, uid, details }: PlotProps) {
  const pretty = useAxisNumber();
  const excluded=(data.regions??[]).filter(r=>!r.geometry&&!geographyCodes[r.countryCode!.toUpperCase()]), regions=(data.regions??[]).filter(r=>!excluded.includes(r)), plotHeight = Math.max(310, Math.min(height - 55, 640)), paths = useMemo(() => choroplethPaths(data, width, plotHeight), [data, width, plotHeight]);
  const values = regions.flatMap(region => number(region.value) ? [region.value] : []), min = Math.min(...values), max = Math.max(...values), magnitude = Math.max(Math.abs(min), Math.abs(max));
  const fill = (value: number) => min < 0 && max > 0 ? value < 0 ? falling : 'var(--accent)' : 'var(--accent)';
  const opacity = (value: number) => min < 0 && max > 0 ? .22 + .73 * Math.abs(value) / magnitude : min === max ? .76 : .2 + .75 * ((value - min) / (max - min));
  return <div className="advanced-hierarchy">{!!excluded.length&&<p role="status" className="choropleth-warning">Not mapped (unsupported codes): {excluded.map(r=>`${r.label??r.id} (${r.countryCode})`).join(', ')}. Supply GeoJSON to include these regions.</p>}{regions.some(r=>!r.geometry&&geographyPoints[geographyCodes[r.countryCode!.toUpperCase()]])&&<small>Dots mark approximate small-territory locations, not area or boundaries.</small>}<Svg width={width} height={plotHeight} title="Choropleth of supplied region boundaries; unobserved regions remain no data">
    <defs><pattern id={`${uid}-missing`} patternUnits="userSpaceOnUse" width="8" height="8"><path d="M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6" stroke="var(--muted)" strokeOpacity=".4" strokeWidth="1" /></pattern></defs>
    {regions.map((region, index) => { const description = `${region.label ?? region.id}: ${region.value === null || region.value === undefined ? 'No data' : exact(region.raw?.value ?? region.value)}${number(region.value) && data.unit ? ` ${data.unit}` : ''}`; return <path key={region.id} d={paths.find(p=>p.id===region.id)?.path} fill={number(region.value) ? fill(region.value) : `url(#${uid}-missing)`} fillOpacity={number(region.value) ? opacity(region.value) : 1} fillRule="evenodd" stroke="var(--text)" strokeOpacity=".65" strokeWidth="1.2" vectorEffect="non-scaling-stroke" {...mark(description, inspect, 'choropleth-region')} data-chart-region={region.id} data-chart-value={region.value ?? 'no-data'}><title>{description}</title></path>; })}
  </Svg>{values.length > 0 && <div className="advanced-color-scale" aria-label={`Color scale ${min} to ${max}${data.unit ? ` ${data.unit}` : ''}`}><span>{pretty(min)}</span><i style={{ background: min < 0 && max > 0 ? `linear-gradient(90deg, ${falling}, var(--surface), var(--accent))` : 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 20%, var(--surface)), var(--accent))' }} /><span>{pretty(max)}{data.unit ? ` ${data.unit}` : ''}</span></div>}
  {details && <ChartKey inspect={inspect} className="advanced-key-grid" items={regions.map(region => ({ id: region.id, label: region.label ?? region.id, value: number(region.value) ? exact(region.raw?.value ?? region.value) : 'No data', ...(number(region.value) ? { color: fill(region.value) } : {}) }))} />}</div>;
}

function GaugePlot({ data, width, height, inspect, details }: PlotProps) {
  const pretty = useAxisNumber();
  const gauge = data.gauge, point = data.series[0]?.points[0]; if (!gauge || !point || !number(point.y)) return <p className="content-empty">No supplied gauge value and range.</p>;
  const valueFont = Math.max(24, Math.min(72, height * .14, width * .09));
  const valueHeight = valueFont * 1.3 + (data.unit ? 26 : 0) + Math.max(24, Math.ceil(String(point.x).length / Math.max(12, width / 10)) * 24) + 16;
  const w = Math.max(240, Math.min(width, 900)), h = Math.max(130, Math.min(height - valueHeight, w * .65)), cx = w / 2, cy = h - 45, radius = Math.min(w * .38, cy - 26), fraction = (point.y - gauge.min) / (gauge.max - gauge.min), theta = Math.PI * (1 - fraction);
  const position = (value: number, r: number) => [cx + Math.cos(Math.PI * (1 - (value - gauge.min) / (gauge.max - gauge.min))) * r, cy - Math.sin(Math.PI * (1 - (value - gauge.min) / (gauge.max - gauge.min))) * r];
  const needle = [cx + Math.cos(theta) * radius * .85, cy - Math.sin(theta) * radius * .85], end = position(point.y, radius);
  return <div className="advanced-gauge"><Svg width={w} height={h} title={`Gauge: ${pointText(data.series[0].name, point, data)}; range ${gauge.min} to ${gauge.max}`}>
    <path d={`M${cx - radius},${cy} A${radius},${radius} 0 0 1 ${cx + radius},${cy}`} fill="none" stroke="var(--line)" strokeWidth="23" strokeLinecap="round" />
    {fraction > 0 && <path d={`M${cx - radius},${cy} A${radius},${radius} 0 0 1 ${end}`} fill="none" stroke="var(--accent)" strokeWidth="23" strokeLinecap="round" data-chart-mark="gauge-arc" />}
    {(gauge.thresholds ?? []).map((threshold, index) => { const a = position(threshold.value, radius - 18), b = position(threshold.value, radius + 18); return <line key={index} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={threshold.color ?? 'var(--text)'} strokeWidth="3" {...mark(`${threshold.label ?? 'Threshold'}: ${threshold.value}`, inspect, 'gauge-threshold')} />; })}
    <g {...pointMark(data.series[0].name, point, data, inspect)} data-chart-fraction={fraction}><line x1={cx} y1={cy} x2={needle[0]} y2={needle[1]} stroke="var(--text)" strokeWidth="4" strokeLinecap="round" /><circle cx={cx} cy={cy} r="8" fill="var(--text)" /></g>
    <text x={cx - radius} y={cy + 39} textAnchor="middle" className="advanced-label">{pretty(gauge.min)}</text><text x={cx + radius} y={cy + 39} textAnchor="middle" className="advanced-label">{pretty(gauge.max)}</text>
  </Svg><div className="advanced-gauge-value"><strong style={{fontSize:valueFont}}>{exact(rawPoint(point, 'y'))}</strong>{data.unit && <span>{data.unit}</span>}<p>{exact(rawPoint(point, 'x'))}</p></div>
  {details && gauge.thresholds?.length ? <ChartKey inspect={inspect} items={gauge.thresholds.map((threshold, index) => ({ id: String(index), label: threshold.label ?? 'Threshold', value: exact(threshold.value), color: threshold.color }))} /> : null}</div>;
}

function FunnelPlot({ data, width, height, inspect }: PlotProps) {
  const series = data.series[0], points = series?.points ?? [], maximum = Number(points[0]?.y);
  if (!(maximum > 0)) return <p className="content-empty">No positive funnel stages supplied.</p>;
  const w = Math.max(300, width), labelWidth = Math.min(265, w * .39), valueWidth = Math.max(60, Math.min(125, w * .2)), gap = 15, available = w - labelWidth - valueWidth - gap * 2, center = labelWidth + gap + available / 2;
  const headerHeight = data.unit ? wrapChartLabel(data.unit, valueWidth / 8).length * 19 + 12 : 10;
  const minimums = points.map(point => Math.max(40, wrapChartLabel(exact(rawPoint(point, 'x')), (labelWidth - 8) / 8).length * 19 + 18, wrapChartLabel(exact(rawPoint(point, 'y')), valueWidth / 8).length * 19 + 18));
  const extra = Math.max(0, height - headerHeight - 10 - minimums.reduce((sum, value) => sum + value, 0)) / points.length;
  const heights = minimums.map(value => value + extra), totalHeight = heights.reduce((sum, value) => sum + value, 0) + headerHeight + 10;
  let y = headerHeight;
  return <Svg width={w} height={totalHeight} title={`Funnel of ${series.name}; stage widths encode supplied non-increasing values`}>
    {data.unit && <SvgLabel text={data.unit} x={w - 3} y={18} anchor="end" characters={valueWidth / 8} />}
    {points.map((point, index) => { const top = y, h = heights[index]; y += h; const half = Number(point.y) / maximum * available / 2, next = Number(points[index + 1]?.y ?? point.y) / maximum * available / 2;
      return <g key={index} {...pointMark(series.name, point, data, inspect)} data-chart-stage-width={half * 2}><title>{pointText(series.name, point, data)}</title>
        <SvgLabel text={exact(rawPoint(point, 'x'))} x={0} y={top + 22} anchor="start" characters={(labelWidth - 8) / 8} />
        <path d={`M${center - half},${top + 4} L${center + half},${top + 4} L${center + next},${top + h - 4} L${center - next},${top + h - 4} Z`} fill={color(index)} fillOpacity=".76" />
        <SvgLabel text={exact(rawPoint(point, 'y'))} x={w - 3} y={top + 24} anchor="end" characters={valueWidth / 8} />
      </g>;
    })}
  </Svg>;
}

/** The opt-in data alternative retains raw decimals, source indexes, and supplied geometry. */
export function advancedChartRows(data: ChartData): { columns: string[]; rows: Record<string, Cell>[] } {
  const rows: Record<string, Cell>[] = [];
  const indexes = (value?: number[]) => value?.join(', ') ?? '';
  for (const series of data.series) for (const point of series.points) {
    if (point.samples) {
      point.samples.forEach((sample, index) => rows.push({ Series: series.name, Distribution: point.x, Value: point.rawSamples?.[index] ?? sample, 'Source row': point.sourceRows?.[index] ?? null })); continue;
    }
    const base: Record<string, Cell> = { Series: series.name, X: rawPoint(point, 'x') ?? null, Y: rawPoint(point, 'y') ?? null };
    for (const key of ['open', 'high', 'low', 'close', 'size', 'total'] as const) if (point[key] !== undefined) base[key[0].toUpperCase() + key.slice(1)] = rawPoint(point, key) ?? null;
    if (point.rawValues) point.rawValues.forEach((value, index) => rows.push({ ...base, 'Source value': value, 'Source row': point.sourceRows?.[index] ?? null }));
    else rows.push({ ...base, 'Source rows': indexes(point.sourceRows) });
  }
  for (const node of data.nodes ?? []) rows.push({ Record: 'Node', ID: node.raw?.id ?? node.id, Label: node.raw?.label ?? node.label ?? node.id, Parent: node.raw?.parent ?? node.parent ?? null, Value: node.raw?.value ?? node.value ?? null, ...(node.x !== undefined ? { X: node.x, Y: node.y ?? null } : {}), 'Source rows': indexes(node.sourceRows) });
  for (const link of data.links ?? []) {
    const base: Record<string, Cell> = { Record: 'Link', Source: link.raw?.source ?? link.source, Target: link.raw?.target ?? link.target, Value: link.raw?.value ?? link.value ?? null };
    if (link.rawValues) link.rawValues.forEach((value, index) => rows.push({ ...base, 'Source value': value, 'Source row': link.sourceRows?.[index] ?? null })); else rows.push({ ...base, 'Source rows': indexes(link.sourceRows) });
  }
  for (const region of data.regions ?? []) {
    const base: Record<string, Cell> = { Region: region.raw?.id ?? region.id, Label: region.label ?? region.id, Value: region.raw?.value !== undefined ? region.raw.value : region.value ?? null, Geometry: JSON.stringify(region.geometry) };
    if (region.rawValues?.length) region.rawValues.forEach((value, index) => rows.push({ ...base, 'Source value': value, 'Source row': region.sourceRows?.[index] ?? null })); else rows.push({ ...base, 'Source rows': indexes(region.sourceRows) });
  }
  return { columns: [...new Set(rows.flatMap(row => Object.keys(row)))], rows };
}
function ExactDataTable({ data }: { data: ChartData }) {
  const regional = useRegional(), exact = (value: unknown) => typeof value === 'number' ? regionalNumber(value, regional) : value == null ? 'Missing' : String(value);
  const table = useMemo(() => advancedChartRows(data), [data]);
  return <div className="advanced-data-table" tabIndex={0} aria-label="Exact supplied chart data"><table><thead><tr>{table.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{table.rows.map((row, index) => <tr key={index}>{table.columns.map(column => <td key={column}>{row[column] === null || row[column] === undefined ? '—' : String(row[column])}</td>)}</tr>)}</tbody></table></div>;
}

export function AdvancedChartRenderer({ data, showControls = false, showSource = false }: { data: ChartData; showControls?: boolean; showSource?: boolean }) {
  const root = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const [viewport, setViewport] = useState({ width: 960, height: 530, preview: false }), [selected, setSelected] = useState<string | null>(null), [showData, setShowData] = useState(false);
  useEffect(() => { setSelected(null); setShowData(false); }, [data]);
  useEffect(() => {
    if (!body.current || typeof ResizeObserver === 'undefined') return;
    // The contained body is sized by its parent, never by its own SVG. Use its
    // content box, after toolbar/source layout, rather than guessed deductions.
    const measure = () => { const element = body.current, preview = Boolean(root.current?.closest('.is-preview')); if (element?.clientWidth && element.clientHeight) { const width = element.clientWidth, height = element.clientHeight; setViewport(old => old.width === width && old.height === height && old.preview === preview ? old : {width,height,preview}); } };
    const observer = new ResizeObserver(measure); observer.observe(body.current); measure(); return () => observer.disconnect();
  }, []);
  const props: PlotProps = { data, width: viewport.preview ? 960 : Math.max(240, viewport.width), height: viewport.preview ? 530 : Math.max(180, viewport.height), inspect: setSelected, uid, details: showControls };
  let plot: ReactNode;
  if (['candlestick', 'ohlc', 'area', 'violin', 'bubble', 'waterfall'].includes(data.kind)) plot = <CartesianPlot {...props} />;
  else if (data.kind === 'pie' || data.kind === 'donut') plot = <ProportionPlot {...props} />;
  else if (data.kind === 'radar') plot = <RadarPlot {...props} />;
  else if (data.kind === 'network') plot = <NetworkPlot {...props} />;
  else if (data.kind === 'treemap') plot = <TreemapPlot {...props} />;
  else if (data.kind === 'sankey') plot = <SankeyPlot {...props} />;
  else if (data.kind === 'choropleth') plot = <><ChoroplethPlot {...props}/>{data.regions?.some(r=>r.countryCode)&&<small className="geography-attribution">Natural Earth · 1:110m generalized boundaries · public domain</small>}</>;
  else if (data.kind === 'gauge') plot = <GaugePlot {...props} />;
  else if (data.kind === 'funnel') plot = <FunnelPlot {...props} />;
  else plot = <p className="content-empty">No advanced chart selected.</p>;
  return <div className={`chart-content advanced-chart advanced-chart-${data.kind}`} data-chart-kind={data.kind} ref={root} style={{ '--advanced-frame-width': `${props.width}px` } as CSSProperties}>
    {(showControls || data.series.length > 1) && <div className="advanced-chart-toolbar">{data.series.length > 1 && <div className="advanced-series-key">{data.series.map((series, index) => <span key={index}><i style={{ background: seriesColor(index, data.series.length) }} />{series.name}</span>)}</div>}{showControls && <button type="button" className="advanced-data-control" aria-expanded={showData} onClick={() => { setSelected(null); setShowData(value => !value); }}>{showData ? 'Chart' : 'Data'}</button>}</div>}
    <div ref={body} className="advanced-chart-body" data-navigation-scroll tabIndex={0} aria-label={showData ? 'Scrollable exact source data' : `Scrollable ${data.kind} chart`}>{viewport.preview ? <div className="advanced-preview-canvas" style={{ width: 960, height: 530, transform: `scale(${Math.min(viewport.width / 960, viewport.height / 530)})` }}>{plot}</div> : showData ? <ExactDataTable data={data} /> : plot}</div>
    {selected && <div className="advanced-chart-readout" role="status" aria-live="polite">{selected}</div>}
    {showSource && data.summary && <p className="advanced-source-summary">{sourceSummary(data.summary)}</p>}
    {isAdvancedChartKind(data.kind) && <span className="sr-only">One source-backed visual. Focus a mark for its supplied values.{showControls ? ' Data opens the exact source values.' : ''}</span>}
  </div>;
}
