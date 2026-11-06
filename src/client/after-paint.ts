/** Run after the next painted frame. Background tabs pause animation frames,
 * which previously left a rendered revision unacknowledged indefinitely. */
export function afterPaint(callback: () => void): () => void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    const timer = setTimeout(callback, 0);
    return () => clearTimeout(timer);
  }
  let second = 0, done = false;
  const fallback = setTimeout(() => { if (!done) { done = true; cancelAnimationFrame(first); cancelAnimationFrame(second); callback(); } }, 1000);
  const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => { if (!done) { done = true; clearTimeout(fallback); callback(); } }); });
  return () => { done = true; clearTimeout(fallback); cancelAnimationFrame(first); cancelAnimationFrame(second); };
}

