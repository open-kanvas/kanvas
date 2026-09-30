import type { CSSProperties } from 'react';

const paths = {
  plus: 'M12 5v14M5 12h14',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3a18 18 0 0 0 0 18M12 3a18 18 0 0 1 0 18M5 7h14M5 17h14',
  close: 'm6 6 12 12M6 18 18 6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  info: 'M12 8h.01M11 12h1v5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
  warning: 'm12 3 10 18H2zM12 9v5m0 3h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v5l3 2',
  screen: 'M3 4h18v13H3zM8 21h8m-4-4v4',
  layers: 'm12 3 10 5-10 5L2 8zm-9 9 9 5 9-5M3 16l9 5 9-5',
  send: 'm3 3 19 9-19 9 4-9zm4 9h15',
  folder: 'M3 6h7l2 3h9v11H3zM3 6V4h7l2 2h9v3',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 2h6l1 4 4 1 2 5-3 3 1 4-5 3-3-3-4 1-4-4 2-4-3-3 2-5 4-1z',
  activity: 'M2 12h4l3-8 6 16 3-8h4',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  pause: 'M7 5v14M17 5v14',
  play: 'm7 4 14 8-14 8z',
  trash: 'M3 6h18M5 6l1 15h12l1-15M9 6V3h6v3M9 10v7m6-7v7',
  copy: 'M8 8h13v13H8zM16 8V3H3v13h5',
  fullscreen: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  logout: 'M9 3H3v18h6M8 12h13m-5-5 5 5-5 5',
  key: 'M8 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12m4-2 9 9m-4-4 3-3m-6 0 3-3',
  upload: 'M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6',
  bell: 'M18 8a6 6 0 0 0-12 0v6l-3 4h18l-3-4zm-8 13h4',
  offline: 'M3 3l18 18M2 8a16 16 0 0 1 3-2m4-1a16 16 0 0 1 13 3M5 12a11 11 0 0 1 4-2m5 0a11 11 0 0 1 5 2M8 16a6 6 0 0 1 8 0m-4 4h.01',
  refresh: 'M21 12a9 9 0 1 1-3-6M21 3v6h-6',
  lock: 'M5 10h14v11H5zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2',
  image: 'M3 3h18v18H3zm0 14 6-7 5 5 3-3 4 5M16 7h.01',
  file: 'M14 2H4v20h16V8zm0 0v6h6M8 13h8m-8 4h5',
  pencil: 'm16 3 5 5L8 21H3v-5zm-2 2 5 5',
  hand: 'M8 12V4a2 2 0 0 1 4 0v8-9a2 2 0 0 1 4 0v9-7a2 2 0 0 1 4 0v12l-4 5H9l-6-7a2 2 0 0 1 3-3l2 2',
  cursor: 'm4 3 7 18 2-8 8-2z',
  rectangle: 'M3 4h18v16H3z',
  circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
  text: 'M4 4h16M12 4v17M8 21h8',
  undo: 'M3 10h11a7 7 0 0 1 0 14M3 10l5-5m-5 5 5 5',
  redo: 'M21 10H10a7 7 0 0 0 0 14m11-14-5-5m5 5-5 5',
  eraser: 'm14 3 8 8L11 22H6L1 17zm-8 9 8 8M11 22h11',
  minus: 'M5 12h14',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
} satisfies Record<string, string>;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}><path d={paths[name]} /></svg>;
}
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return <span className="wordmark"><svg aria-hidden="true" width="27" height="30" viewBox="0 0 27 30"><path d="M3 2v26M24 2 9 15l15 13" stroke="currentColor" strokeWidth="4.5" fill="none" /></svg>{!compact && <span>KANVAS</span>}</span>;
}
