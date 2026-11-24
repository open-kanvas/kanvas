/** A render acknowledgement must follow animation frames in a visible tab.
 * A hidden tab or stalled compositor is not paint evidence. Resume when visible;
 * the server's bounded publish wait reports unconfirmed rather than guessing. */
export function afterPaint(callback: () => void): () => void {
  let first = 0, second = 0, done = false;
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const cancelFrames = () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  const schedule = () => {
    cancelFrames();
    if (done || !visible()) return;
    first = requestAnimationFrame(() => {
      if (done || !visible()) return;
      second = requestAnimationFrame(() => {
        if (done || !visible()) return;
        done = true;
        document.removeEventListener('visibilitychange', schedule);
        callback();
      });
    });
  };
  document.addEventListener('visibilitychange', schedule);
  schedule();
  return () => { done = true; cancelFrames(); document.removeEventListener('visibilitychange', schedule); };
}
