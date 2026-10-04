import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MEDIA_FAILURES, mediaFailureCode, type MediaFailureCode } from '../../shared/media-failures';

type ResourceStatus = 'pending' | 'ready' | 'failed' | 'unverified';
interface ResourceRegistry {
  register: (id: string, status: ResourceStatus) => () => void;
  report: (id: string, status: ResourceStatus, code?: MediaFailureCode) => void;
}
const MediaReadiness = createContext<ResourceRegistry | null>(null);
export const MEDIA_LOAD_TIMEOUT_MS = 15_000;

/** Remounted for each submitted visual, not for viewport/presence refreshes. */
export function MediaReadyGate({ children, onReady, onError }: { children: ReactNode; onReady?: () => void; onError?: (code?: MediaFailureCode) => void }) {
  const resources = useRef(new Map<string, ResourceStatus>());
  const failures = useRef(new Map<string, MediaFailureCode>());
  const active = useRef(false), readySent = useRef(false), failureSent = useRef(false);
  const callbacks = useRef({ onReady, onError }); callbacks.current = { onReady, onError };
  const [status, setStatus] = useState<ResourceStatus>('pending');
  const [failure, setFailure] = useState<MediaFailureCode>('MEDIA_UNAVAILABLE');
  const registry = useMemo<ResourceRegistry>(() => {
    const inspect = () => {
      if (!active.current) return;
      const states = [...resources.current.values()];
      const next = states.includes('failed') ? 'failed' : states.includes('unverified') ? 'unverified' : states.includes('pending') ? 'pending' : 'ready';
      setStatus(next);
      if ((next === 'failed' || next === 'unverified') && !failureSent.current) {
        failureSent.current = true;
        const code = [...failures.current.values()][0] ?? 'MEDIA_UNAVAILABLE';
        setFailure(code); callbacks.current.onError?.(code);
      } else if (next === 'ready' && !readySent.current && !failureSent.current) {
        readySent.current = true;
        callbacks.current.onReady?.();
      }
    };
    return {
      register(id, initial) {
        resources.current.set(id, initial); inspect();
        // Removing a resource is not evidence that it loaded successfully.
        return () => { resources.current.delete(id); failures.current.delete(id); };
      },
      report(id, next, code) { if (resources.current.has(id)) { resources.current.set(id, next); if (code) failures.current.set(id, code); } inspect(); },
    };
  }, []);
  useEffect(() => {
    active.current = true;
    // Child layout effects have registered every image/video/frame before this check.
    registry.report('', 'ready');
    return () => { active.current = false; };
  }, [registry]);
  return <MediaReadiness.Provider value={registry}>
    {children}
    {status === 'pending' && <span className="media-readiness" role="status">Loading media…</span>}
    {status === 'failed' && <span className="media-readiness media-readiness-error" role="alert">{MEDIA_FAILURES[failure]} Open the original or refresh this display to try again.</span>}
    {status === 'unverified' && <span className="media-readiness" role="status">If the embedded content stays blank, open the original.</span>}
  </MediaReadiness.Provider>;
}

/** Failed images may finish as an explicit placeholder; video readiness still requires a real frame. */
export function useMediaResource(initial: ResourceStatus = 'pending', timeoutCode: MediaFailureCode = 'MEDIA_TIMEOUT', timeoutMs=MEDIA_LOAD_TIMEOUT_MS, degradedImage=false) {
  const registry = useContext(MediaReadiness), id = useId();
  const current = useRef<ResourceStatus>(initial);
  const [status, setStatus] = useState<ResourceStatus>(initial);
  const [failure, setFailure] = useState<MediaFailureCode>('MEDIA_UNAVAILABLE');
  const report = useCallback((next: ResourceStatus, code?: MediaFailureCode) => {
    if (current.current === 'failed' || current.current === 'unverified' || current.current === next) return;
    current.current = next; setStatus(next); if (code) setFailure(code); registry?.report(id, degradedImage && next === 'failed' ? 'ready' : next, code);
  }, [id, registry, degradedImage]);
  useLayoutEffect(() => registry?.register(id, degradedImage && current.current === 'failed' ? 'ready' : current.current), [id, registry, degradedImage]);
  useEffect(() => {
    if (status !== 'pending') return;
    const timer = setTimeout(() => report('failed', timeoutCode), timeoutMs);
    return () => clearTimeout(timer);
  }, [status, report, timeoutCode, timeoutMs]);
  return { status, failure, ready: useCallback(() => report('ready'), [report]), fail: useCallback((reason?: unknown) => report('failed', mediaFailureCode(reason)), [report]) };
}
