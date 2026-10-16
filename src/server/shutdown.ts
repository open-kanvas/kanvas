/** One-shot bounded shutdown. Keep the timer referenced: stuck cleanup must not
 * leave an unavailable process alive. Fatal status cannot be downgraded. */
export function createShutdown(options: {
  stopAccepting: () => void;
  cleanup: () => Promise<void>;
  exit?: (code: number) => void;
  deadlineMs?: number;
}) {
  let stopping = false, status = 0;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  return (code = 0): void => {
    status = Math.max(status, code);
    if (stopping) return;
    stopping = true;
    const force = setTimeout(() => {
      console.error('KANVAS shutdown deadline exceeded; forcing process exit.');
      exit(1);
    }, options.deadlineMs ?? 10_000);
    void (async () => {
      try { options.stopAccepting(); await options.cleanup(); }
      catch { status = 1; console.error('KANVAS shutdown cleanup failed.'); }
      finally { clearTimeout(force); exit(status); }
    })();
  };
}
