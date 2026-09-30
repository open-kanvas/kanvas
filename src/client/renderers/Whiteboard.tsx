import { safeUrl } from '../api';
import type { z } from 'zod';
import type { boardBackgroundSchema } from '../../shared/image-gallery';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { getStroke } from 'perfect-freehand';
import { ApiError, downloadJson, errorMessage, requestId } from '../api';
import { Icon, type IconName } from '../icons';

interface Point { x: number; y: number }
export interface BoardElement {
  id: string; type: 'draw' | 'rect' | 'ellipse' | 'arrow' | 'text'; x: number; y: number;
  width?: number; height?: number; points?: Point[]; text?: string; color?: string; lineWidth?: number; fill?: string;
}
export interface WhiteboardData { elements: BoardElement[]; background?:z.infer<typeof boardBackgroundSchema> }
interface DraftBase { revision: number; data: WhiteboardData }
type Tool = 'select' | 'hand' | 'draw' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'erase';
const tools: { id: Tool; label: string; icon: IconName; key: string }[] = [
  { id: 'select', label: 'Select', icon: 'cursor', key: 'V' }, { id: 'hand', label: 'Pan', icon: 'hand', key: 'H' },
  { id: 'draw', label: 'Draw', icon: 'pencil', key: 'P' }, { id: 'rect', label: 'Rectangle', icon: 'rectangle', key: 'R' },
  { id: 'ellipse', label: 'Ellipse', icon: 'circle', key: 'O' }, { id: 'arrow', label: 'Connect / arrow', icon: 'arrow', key: 'A' },
  { id: 'text', label: 'Text / note', icon: 'text', key: 'T' }, { id: 'erase', label: 'Erase', icon: 'eraser', key: 'E' },
];
const colors = ['#b9ed87', '#72b4e4', '#edb77e', '#c9a3eb', '#ef91a1', '#f2f2eb', '#25332b'];
function pathFromStroke(points: number[][]) {
  if (!points.length) return '';
  const [first, ...rest] = points;
  return `M ${first[0]} ${first[1]} Q ${rest.map((p, i) => {
    const next = rest[(i + 1) % rest.length] ?? first;
    return `${p[0]} ${p[1]} ${(p[0] + next[0]) / 2} ${(p[1] + next[1]) / 2}`;
  }).join(' ')} Z`;
}
function luminance(color: string) {
  const rgb = color.match(/[0-9a-f]{2}/gi)?.map(value => parseInt(value, 16) / 255) ?? [0, 0, 0];
  const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}
/** Shape color is a stroke, not a guarantee that matching text is visible on its fill. */
export function boardLabelColor(stroke: string, fill?: string) {
  if (!fill || fill === 'transparent') return stroke;
  const background = luminance(fill), foreground = luminance(stroke);
  if ((Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05) >= 4.5) return stroke;
  return (background + .05) / .05 >= 1.05 / (background + .05) ? '#000000' : '#ffffff';
}
export function wrapBoardText(text: string, maxChars: number) {
  maxChars = Math.max(1, Math.floor(maxChars));
  return text.split('\n').flatMap(line => {
    const characters = Array.from(line), lines: string[] = [];
    while (characters.length > maxChars) {
      const chunk = characters.slice(0, maxChars), space = chunk.lastIndexOf(' ');
      const length = space > maxChars / 2 ? space + 1 : maxChars;
      lines.push(characters.splice(0, length).join(''));
    }
    lines.push(characters.join('')); return lines;
  });
}
function BoardLabel({ element, freeText = false }: { element: BoardElement; freeText?: boolean }) {
  if (!element.text) return null;
  const arrow = element.type === 'arrow', width = Math.max(20, Math.abs(element.width ?? 260) - (freeText ? 0 : 24));
  let fontSize = 22;
  let lines = wrapBoardText(element.text, Math.max(2, Math.floor(width / (fontSize * .58))));
  // Respect the supplied shape dimensions, while preserving every source character.
  if (!freeText && !arrow && lines.length * fontSize * 1.35 > (element.height ?? 80) - 20) {
    fontSize = Math.max(12, Math.min(22, Math.sqrt(width * Math.max(20, (element.height ?? 80) - 20) / Math.max(1, element.text.length) / .8)));
    lines = wrapBoardText(element.text, Math.max(2, Math.floor(width / (fontSize * .58))));
  }
  const x = element.x + Math.min(0, element.width ?? 0) + (freeText ? 0 : 12);
  const y = freeText ? element.y + fontSize : arrow ? element.y + (element.height ?? 0) / 2 - 12 - (lines.length - 1) * fontSize * 1.35 : element.y + Math.max(12, ((element.height ?? 80) - lines.length * fontSize * 1.35) / 2) + fontSize;
  return <text className="board-shape-text" x={x} y={y} fill={boardLabelColor(element.color ?? '#b9ed87', element.fill)} fontSize={fontSize} fontFamily="inherit" xmlSpace="preserve" aria-label={element.text}>
    {lines.map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : fontSize * 1.35}>{line || ' '}</tspan>)}
  </text>;
}
export function elementBounds(element: BoardElement) {
  if (element.points?.length) {
    const xs = element.points.map(p => p.x), ys = element.points.map(p => p.y);
    return { x: element.x + Math.min(...xs), y: element.y + Math.min(...ys), width: Math.max(8, Math.max(...xs) - Math.min(...xs)), height: Math.max(8, Math.max(...ys) - Math.min(...ys)) };
  }
  return { x: element.x, y: element.y, width: element.width ?? (element.type === 'text' ? 240 : 10), height: element.height ?? (element.type === 'text' ? 75 : 10) };
}
export function fitBoardCamera(elements: BoardElement[], viewport: { width: number; height: number },background?:WhiteboardData['background']) {
  if(background)elements=[...elements,{id:'background',type:'rect',...background}];
  const ratio = viewport.width > 0 && viewport.height > 0 ? viewport.height / viewport.width : .6;
  if (!elements.length) return { x: 0, y: 0, width: 1000, height: 1000 * ratio };
  const bounds = elements.map(elementBounds);
  const minX = Math.min(...bounds.map(b => Math.min(b.x, b.x + b.width))) - 40;
  const minY = Math.min(...bounds.map(b => Math.min(b.y, b.y + b.height))) - 40;
  const w = Math.max(...bounds.map(b => Math.max(b.x, b.x + b.width))) - minX + 40;
  const h = Math.max(...bounds.map(b => Math.max(b.y, b.y + b.height))) - minY + 40;
  const width = Math.max(250, w, h / ratio), height = width * ratio;
  return { x: minX - (width - w) / 2, y: minY - (height - h) / 2, width, height };
}
function BoardShape({ element }: { element: BoardElement }) {
  const e = element, stroke = e.color ?? '#b9ed87', width = e.width ?? 0, height = e.height ?? 0;
  const common = { stroke, strokeWidth: e.lineWidth ?? 3, fill: e.fill ?? 'transparent', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (e.type === 'draw') {
    const points = e.points?.map(p => [p.x, p.y]) ?? [[0, 0]];
    return <path transform={`translate(${e.x} ${e.y})`} d={pathFromStroke(getStroke(points, { size: (e.lineWidth ?? 3) * 2, thinning: .35, smoothing: .5, streamline: .4, simulatePressure: true }))} fill={stroke} />;
  }
  if (e.type === 'rect') return <g><rect x={e.x} y={e.y} width={width} height={height} rx="5" {...common} /><BoardLabel element={e} /></g>;
  if (e.type === 'ellipse') return <g><ellipse cx={e.x + width / 2} cy={e.y + height / 2} rx={Math.max(1, width / 2)} ry={Math.max(1, height / 2)} {...common} /><BoardLabel element={e} /></g>;
  if (e.type === 'arrow') {
    const points = e.points ?? [{ x: 0, y: 0 }, { x: width, y: height }];
    const start = points[0] ?? { x: 0, y: 0 }, end = points.at(-1) ?? { x: width, y: height };
    const theta = Math.atan2(end.y - start.y, end.x - start.x), size = Math.max(12, (e.lineWidth ?? 3) * 4);
    return <g><g transform={`translate(${e.x} ${e.y})`} {...common}><path d={`M${start.x},${start.y} L${end.x},${end.y}`} /><path d={`M${end.x - Math.cos(theta - .45) * size},${end.y - Math.sin(theta - .45) * size} L${end.x},${end.y} L${end.x - Math.cos(theta + .45) * size},${end.y - Math.sin(theta + .45) * size}`} /></g><BoardLabel element={e} /></g>;
  }
  const lines = wrapBoardText(e.text ?? '', Math.max(2, Math.floor((e.width ?? 260) / (22 * .58))));
  return <g><rect x={e.x - 8} y={e.y - 8} width={e.width ?? 260} height={Math.max(e.height ?? 40, lines.length * 30 + 12)} rx="5" fill={e.fill ?? 'transparent'} /><BoardLabel element={e} freeText /></g>;
}

export default function WhiteboardRenderer({ data, editable = false, showControls = false, revision, onEdit, onReady,onError }: { data: WhiteboardData; editable?: boolean; showControls?: boolean; revision?: number; onEdit?: (data: Record<string, unknown>, expectedRevision: number) => Promise<number>; onReady?: () => void;onError?:(code?:import('../../shared/media-failures').MediaFailureCode)=>void }) {
  const backgroundUrl=data.background?safeUrl(data.background.url,true):undefined;
  const [loadedBackground,setLoadedBackground]=useState<string>();
  const [elements, setElements] = useState(data.elements);
  const elementsRef = useRef(elements); elementsRef.current = elements;
  const [tool, setTool] = useState<Tool>('draw');
  const [color, setColor] = useState('#b9ed87');
  const [width, setWidth] = useState(3);
  const [selected, setSelected] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, width: 1000, height: 600 });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false), [conflict, setConflict] = useState(false), [gestureActive, setGestureActive] = useState(false);
  const base = useRef<DraftBase>({ revision: revision ?? 0, data }), draft = useRef<DraftBase | null>(null), busyRef = useRef(false);
  const readyCallback = useRef(onReady); readyCallback.current = onReady;
  const readyRevision = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<BoardElement[][]>([]);
  const [future, setFuture] = useState<BoardElement[][]>([]);
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; text: string; id?: string; base: DraftBase; before: BoardElement[]; wasDirty: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const cameraInitialized = useRef(false);
  const gesture = useRef<{ start: Point; client: Point; before: BoardElement[]; elementId?: string; mode: Tool; camera: typeof camera; base?: DraftBase; wasDirty: boolean } | null>(null);
  const canEdit = editable && Boolean(onEdit) && revision !== undefined;
  // Frame the first supplied diagram, not an arbitrary origin. Never reframe a
  // user's gesture or a subsequent collaborative update; Fit remains explicit.
  useLayoutEffect(() => {
    const rect = svg.current?.getBoundingClientRect();
    if (cameraInitialized.current || !data.elements.length&&!data.background || !rect?.width || !rect.height) return;
    cameraInitialized.current = true;
    setCamera(fitBoardCamera(data.elements, rect,data.background));
  }, [data.elements,data.background]);
  const replaceElements = (next: BoardElement[]) => { elementsRef.current = next; setElements(next); };
  const beginDraft = (): DraftBase => {
    if (!draft.current) draft.current = { ...base.current };
    setDirty(true); return draft.current;
  };
  useEffect(() => {
    if (gesture.current || textEditor || busy || dirty) {
      if (dirty && !busy && revision !== undefined && revision !== base.current.revision) {
        setConflict(true); setError('The shared board changed while you were editing.');
      }
      return;
    }
    // A successful save may precede its SSE refresh. Do not roll it back to an older snapshot.
    if (revision !== undefined && revision < base.current.revision) return;
    if (JSON.stringify(elementsRef.current) !== JSON.stringify(data.elements)) {
      setHistory([]); setFuture([]); setSelected(null);
    }
    base.current = { revision: revision ?? 0, data };
    replaceElements(data.elements);
    if ((!backgroundUrl||loadedBackground===backgroundUrl)&&revision !== undefined && readyRevision.current !== revision) {
      readyRevision.current = revision; readyCallback.current?.();
    }
  }, [data, revision, busy, dirty, textEditor, gestureActive,backgroundUrl,loadedBackground]);
  const save = async (next: BoardElement[], before = elementsRef.current, record = true, capturedBase = beginDraft()) => {
    if (busyRef.current) return;
    draft.current = capturedBase; replaceElements(next); setDirty(true);
    if (record) { setHistory(old => [...old.slice(-29), before]); setFuture([]); }
    if (!canEdit || !onEdit) { setError('Editing is unavailable. Your local work has not been sent.'); return; }
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const savedRevision = await onEdit({ ...capturedBase.data, elements: next }, capturedBase.revision);
      base.current = { revision: savedRevision, data: { ...capturedBase.data, elements: next } };
      draft.current = null; setDirty(false); setConflict(false);
    } catch (e) {
      const changed = e instanceof ApiError && e.status === 409;
      if (changed) setConflict(true);
      setError(changed ? 'The shared board changed while you were editing.' : errorMessage(e));
    } finally { busyRef.current = false; setBusy(false); }
  };
  const cancelDraft = (before: BoardElement[], wasDirty: boolean) => {
    replaceElements(before);
    if (!wasDirty) { draft.current = null; setDirty(false); setConflict(false); setError(null); }
  };
  const point = (event: ReactPointerEvent): Point => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: event.clientX, y: event.clientY };
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); return { x: p.x, y: p.y };
  };
  const zoom = (factor: number) => { cameraInitialized.current = true; setCamera(c => {
    const newWidth = Math.max(250, Math.min(5000, c.width * factor)), newHeight = newWidth * c.height / c.width;
    return { x: c.x + (c.width - newWidth) / 2, y: c.y + (c.height - newHeight) / 2, width: newWidth, height: newHeight };
  }); };
  const start = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || busyRef.current || textEditor) return;
    cameraInitialized.current = true;
    const p = point(event), mode = canEdit ? tool : 'hand';
    const targetId = (event.target as Element).closest('[data-element-id]')?.getAttribute('data-element-id') ?? undefined;
    svg.current?.focus();
    if (mode === 'text') { setTextEditor({ ...p, text: '', base: beginDraft(), before: [...elementsRef.current], wasDirty: dirty }); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    const g = { start: p, client: { x: event.clientX, y: event.clientY }, before: [...elementsRef.current], elementId: targetId, mode, camera, ...(mode !== 'hand' && (mode !== 'select' || targetId) ? { base: beginDraft() } : {}), wasDirty: dirty };
    gesture.current = g; setGestureActive(true);
    if (mode === 'select') { setSelected(targetId ?? null); return; }
    if (mode === 'hand') return;
    if (mode === 'erase') { if (targetId) replaceElements(elementsRef.current.filter(e => e.id !== targetId)); return; }
    const element: BoardElement = { id: requestId(), type: mode, x: p.x, y: p.y, color, lineWidth: width, fill: 'transparent', width: 0, height: 0, ...(mode === 'draw' || mode === 'arrow' ? { points: [{ x: 0, y: 0 }, { x: .01, y: .01 }] } : {}) };
    gesture.current.elementId = element.id;
    replaceElements([...elementsRef.current, element]);
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current; if (!g) return;
    if (g.mode === 'hand') {
      const rect = svg.current!.getBoundingClientRect(), scale = Math.max(g.camera.width / rect.width, g.camera.height / rect.height);
      setCamera({ ...g.camera, x: g.camera.x - (event.clientX - g.client.x) * scale, y: g.camera.y - (event.clientY - g.client.y) * scale }); return;
    }
    const p = point(event), dx = p.x - g.start.x, dy = p.y - g.start.y;
    if (g.mode === 'erase') {
      const targetId = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-element-id]')?.getAttribute('data-element-id');
      if (targetId) replaceElements(elementsRef.current.filter(e => e.id !== targetId)); return;
    }
    replaceElements(elementsRef.current.map(e => {
      if (e.id !== g.elementId) return e;
      if (g.mode === 'select') { const original = g.before.find(b => b.id === e.id)!; return { ...e, x: original.x + dx, y: original.y + dy }; }
      if (g.mode === 'draw') { const points = e.points ?? []; return { ...e, points: [...(points.length >= 1999 ? points.filter((_, i) => i % 2 === 0) : points), { x: dx, y: dy }] }; }
      if (g.mode === 'arrow') return { ...e, width: dx, height: dy, points: [{ x: 0, y: 0 }, { x: dx, y: dy }] };
      return { ...e, x: Math.min(p.x, g.start.x), y: Math.min(p.y, g.start.y), width: Math.abs(dx), height: Math.abs(dy) };
    }));
  };
  const finish = () => {
    const g = gesture.current; gesture.current = null; setGestureActive(false);
    if (g && !g.wasDirty && JSON.stringify(g.before) === JSON.stringify(elementsRef.current)) cancelDraft(g.before, false);
    if (!g || g.mode === 'hand' || JSON.stringify(g.before) === JSON.stringify(elementsRef.current)) return;
    const next = elementsRef.current.filter(e => (e.type !== 'rect' && e.type !== 'ellipse') || ((e.width ?? 0) > 2 && (e.height ?? 0) > 2));
    void save(next, g.before, true, g.base);
  };
  const undo = () => { const previous = history.at(-1); if (!previous || busyRef.current) return; setHistory(history.slice(0, -1)); setFuture([...future, elements]); void save(previous, elements, false); };
  const redo = () => { const next = future.at(-1); if (!next || busyRef.current) return; setFuture(future.slice(0, -1)); setHistory([...history, elements]); void save(next, elements, false); };
  const fit = () => {
    cameraInitialized.current = true;
    setCamera(fitBoardCamera(elements, svg.current?.getBoundingClientRect() ?? { width: 1000, height: 600 },data.background));
  };
  const selectedElement = elements.find(e => e.id === selected), bounds = selectedElement && elementBounds(selectedElement);
  return <div className={`whiteboard-content ${canEdit ? 'is-editable' : ''}`}>
    {canEdit && <div className="board-toolbar" role="toolbar" aria-label="Whiteboard tools">{tools.map(t => <button key={t.id} disabled={busy || Boolean(textEditor)} className={tool === t.id ? 'active' : ''} onClick={() => setTool(t.id)} aria-label={`${t.label} (${t.key})`} title={`${t.label} (${t.key})`} aria-pressed={tool === t.id}><Icon name={t.icon} size={19} /></button>)}<i className="toolbar-divider" /><button onClick={undo} disabled={!history.length || busy || Boolean(textEditor)} aria-label="Undo" title="Undo"><Icon name="undo" size={18} /></button><button onClick={redo} disabled={!future.length || busy || Boolean(textEditor)} aria-label="Redo" title="Redo"><Icon name="redo" size={18} /></button></div>}
    <svg ref={svg} className={`board-surface tool-${canEdit ? tool : 'hand'}`} viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`} tabIndex={0} aria-label={canEdit ? 'Collaborative whiteboard. Select a drawing tool; drag to draw. V selects, P draws, H pans. Delete removes selected objects.' : 'Whiteboard. Drag to pan.'} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { const g = gesture.current; gesture.current = null; setGestureActive(false); if (g) cancelDraft(g.before, g.wasDirty); }} onDoubleClick={event => {
      if (!canEdit || busyRef.current || textEditor) return; const id = (event.target as Element).closest('[data-element-id]')?.getAttribute('data-element-id'); const e = elements.find(item => item.id === id);
      if (e?.type === 'text') setTextEditor({ x: e.x, y: e.y, text: e.text ?? '', id: e.id, base: beginDraft(), before: [...elementsRef.current], wasDirty: dirty });
    }} onKeyDown={event => {
      if ((event.key === '+' || event.key === '=') && !event.metaKey && !event.ctrlKey) { event.preventDefault(); zoom(.8); return; }
      if (event.key === '-') { event.preventDefault(); zoom(1.25); return; }
      if (!canEdit || busyRef.current || textEditor) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { if (selected) { event.preventDefault(); void save(elements.filter(e => e.id !== selected)); setSelected(null); } return; }
      if (selected && event.key.startsWith('Arrow')) { event.preventDefault(); const amount = event.shiftKey ? 10 : 1; void save(elements.map(e => e.id === selected ? { ...e, x: e.x + (event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0), y: e.y + (event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0) } : e)); return; }
      const target = tools.find(t => t.key.toLowerCase() === event.key.toLowerCase()); if (target) { event.stopPropagation(); setTool(target.id); }
    }}>
      <defs><pattern id="board-grid" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="currentColor" opacity=".13" /></pattern></defs>
      <rect x={camera.x} y={camera.y} width={camera.width} height={camera.height} fill="url(#board-grid)" />
      {data.background&&backgroundUrl&&<image key={backgroundUrl} href={backgroundUrl} x={data.background.x} y={data.background.y} width={data.background.width} height={data.background.height} preserveAspectRatio="xMidYMid meet" aria-label={data.background.alt??'Whiteboard background'} onLoad={()=>setLoadedBackground(backgroundUrl)} onError={()=>onError?.('MEDIA_UNAVAILABLE')} />}
      {elements.map(e => <g key={e.id} data-element-id={e.id} aria-label={e.text ?? e.type}><BoardShape element={e} /></g>)}
      {bounds && tool === 'select' && <rect x={bounds.x - 7} y={bounds.y - 7} width={bounds.width + 14} height={bounds.height + 14} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="5 4" pointerEvents="none" />}
    </svg>
    {!elements.length && !data.background && <div className="board-empty">{canEdit ? 'A little space to think.' : 'The board is ready.'}<span>{canEdit ? 'Draw, add a note, or connect an idea.' : 'New ideas will appear here.'}</span></div>}
    {canEdit && <div className="board-style" role="toolbar" aria-label="Drawing style">{colors.map(c => <button key={c} disabled={busy || Boolean(textEditor)} aria-label={`Color ${c}`} aria-pressed={color === c} className={color === c ? 'active' : ''} style={{ '--swatch': c } as React.CSSProperties} onClick={() => {
      setColor(c); if (selectedElement && tool === 'select' && !busyRef.current && !textEditor) void save(elements.map(e => e.id === selected ? { ...e, color: c } : e));
    }} />)}<label title="Stroke width"><input type="range" min="1" max="10" step="1" value={width} onChange={e => setWidth(Number(e.target.value))} aria-label="Stroke width" /></label></div>}
    {showControls && <div className="board-zoom"><button type="button" onClick={() => zoom(1.25)} aria-label="Zoom out"><Icon name="minus" size={16} /></button><span>{Math.round(1000 / camera.width * 100)}%</span><button type="button" onClick={() => zoom(.8)} aria-label="Zoom in"><Icon name="plus" size={16} /></button><button type="button" onClick={fit} aria-label="Fit board to screen" title="Fit board"><Icon name="fullscreen" size={16} /></button></div>}
    {(busy || dirty || canEdit && showControls) && <span className={`board-save-status ${dirty && !busy ? 'unsaved' : ''}`} role="status">{busy ? 'Saving…' : dirty ? 'Not saved' : 'Changes saved'}</span>}
    {error && <div className="board-error" role="alert"><span>{error} Your drawing is kept here.</span><div><button onClick={() => { draft.current = null; base.current = { revision: revision ?? 0, data }; replaceElements(data.elements); setDirty(false); setConflict(false); setTextEditor(null); setError(null); setHistory([]); setFuture([]); }}>Use shared version</button><button onClick={() => downloadJson('kanvas-whiteboard', { ...(draft.current?.data ?? base.current.data), elements })}>Save a copy</button>{!conflict && <button disabled={busy || Boolean(textEditor)} onClick={() => void save(elementsRef.current, elementsRef.current, false, draft.current ?? base.current)}>Retry save</button>}</div></div>}
    {textEditor && <form className="board-note-editor" onSubmit={event => {
      event.preventDefault(); if (!textEditor.text.trim()) { cancelDraft(textEditor.before, textEditor.wasDirty); setTextEditor(null); return; }
      const updated = textEditor.id ? textEditor.before.map(e => e.id === textEditor.id ? { ...e, text: textEditor.text } : e) : [...textEditor.before, { id: requestId(), type: 'text' as const, x: textEditor.x, y: textEditor.y, text: textEditor.text, color, width: 280, height: 70, fill: 'transparent' }];
      setTextEditor(null); void save(updated, textEditor.before, true, textEditor.base);
    }}><label>Add your thought<textarea autoFocus value={textEditor.text} maxLength={2000} onChange={e => setTextEditor({ ...textEditor, text: e.target.value })} placeholder="An idea, a label, a question…" /></label><div><button type="button" onClick={() => { cancelDraft(textEditor.before, textEditor.wasDirty); setTextEditor(null); }}>Cancel</button><button type="submit">{textEditor.id ? 'Save note' : 'Add note'} <Icon name="check" size={16} /></button></div></form>}
  </div>;
}
