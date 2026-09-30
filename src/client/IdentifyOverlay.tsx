import { useEffect, useState, type CSSProperties } from 'react';

interface Identify { ordinal: number; total: number; name: string; durationMs: number; key: number }

/** Large transient screen number ("which screen is which"). It never changes
 * content, revision, history or delivery acknowledgements. */
export function IdentifyOverlay({ sessionId, displayId }: { sessionId: string; displayId: string }) {
  const [shown, setShown] = useState<Identify | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!detail || detail.sessionId !== sessionId || detail.displayId !== displayId || typeof detail.ordinal !== 'number') return;
      const durationMs = Math.min(5000, Math.max(1000, Number(detail.durationMs) || 2000));
      setShown({ ordinal: detail.ordinal, total: Number(detail.total) || detail.ordinal, name: typeof detail.name === 'string' ? detail.name.slice(0, 120) : '', durationMs, key: Date.now() });
      clearTimeout(timer); timer = setTimeout(() => setShown(null), durationMs);
    };
    window.addEventListener('kanvas:identify', receive);
    return () => { clearTimeout(timer); window.removeEventListener('kanvas:identify', receive); };
  }, [sessionId, displayId]);
  if (!shown) return null;
  return <div key={shown.key} className="identify-overlay" role="status" aria-live="assertive" style={{ '--identify-duration': `${shown.durationMs}ms` } as CSSProperties}>
    <strong>{shown.ordinal}</strong>{shown.name && <span>{shown.name}</span>}<small>Display {shown.ordinal} of {shown.total}</small>
  </div>;
}
