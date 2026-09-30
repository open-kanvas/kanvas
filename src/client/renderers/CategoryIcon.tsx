/** Explicit publisher-selected categories, never inferred from a description. */
const paths: Record<string, string> = {
  flight:'m3 12 7 2 2 7 2-1 1-7 6-6-1-3-7 6-7-1z',
  hotel:'M3 20V5h18v15M3 14h18M7 9h3m4 0h3M7 20v-6m10 6v-6',
  transit:'M5 3h14v15H5zM8 7h8M8 11h8M7 21l2-3m8 3-2-3',
  bus:'M5 4h14v14H5zM5 11h14M8 18v3m8-3v3M8 15h1m6 0h1',
  train:'M6 3h12v14H6zM6 10h12M8 21l2-4m6 4-2-4M9 14h1m4 0h1',
  boat:'M12 3v11M12 4l7 8h-7M3 15h18l-3 5H6z',
  food:'M6 3v7m-3-7v5q0 4 6 0V3M6 10v11M17 3q-4 8 0 9v9M17 3v9',
  sightseeing:'M3 9h18M5 9v11m5-11v11m4-11v11m5-11v11M3 21h18M12 3l9 6H3z',
  walk:'M13 3h.1M10 8l3-2 3 5 4 1M13 6l-2 8-5 7m5-7 5 7M10 8l-4 4',
  car:'M4 10l2-5h12l2 5v8H4zM4 10h16M7 14h1m8 0h1M6 18v3m12-3v3',
  meeting:'M8 6h.1m8 0h.1M3 14q5-9 10 0m-2 0q5-9 10 0M4 18h16',
  mix:'M3 12h18q-1 9-9 9t-9-9M8 3l8 13M13 3l-3 6',
  pour:'m5 3 10 4-4 10L1 13zM17 12l3 4q3 5-1 5t-2-5',
  add:'M3 14h18q-2 7-9 7t-9-7M12 2v8M8 6h8',
  heat:'M8 21q-7-6 1-14 0 6 3 6 4-4 1-10 12 14 3 18z',
  bake:'M3 4h18v17H3zM3 8h18M7 12h10v5H7zM6 6h.1m4 0h.1',
  fry:'M3 13h14q-1 7-7 7t-7-7m14 0 5-3M7 3q-3 3 0 6m6-6q-3 3 0 6',
  chill:'M12 2v20M3 7l18 10M3 17 21 7M9 4l3 3 3-3M9 20l3-3 3 3',
  cut:'m4 21 9-9M11 3l10 10-6 3L8 9zM3 17l4 4',
  serve:'M3 18h18M4 16a8 8 0 0 1 16 0M12 5v3',
  wait:'M12 3a9 9 0 1 1-.1 0M12 7v6l4 2',
};
export function CategoryIcon({ category, className = '' }: { category?: string; className?: string }) {
  if (!category || !paths[category]) return null;
  return <svg className={`category-icon ${className}`} role="img" aria-label={category} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[category]}/></svg>;
}
