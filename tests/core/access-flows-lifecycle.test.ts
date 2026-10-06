import { expect, it, vi } from 'vitest';
import { startHarness } from './harness.js';

it('drains a pending access expiry sweep before closing its database pool', async () => {
  const h = await startHarness();
  const original = h.runtime.store.list.bind(h.runtime.store);
  let began!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let blocked = false;
  const list = vi.spyOn(h.runtime.store, 'list').mockImplementation(async <T>(kind: string, sessionId?: string, includeArchived = false): Promise<T[]> => {
    if (kind === 'pairing' && !blocked) { blocked = true; began(); await gate; }
    return original<T>(kind, sessionId, includeArchived);
  });
  const close = vi.spyOn(h.runtime.store, 'close');
  try {
    await started;
    const shutdown = h.shutdown();
    // Give the asynchronous listener close a turn to enter access cleanup.
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(close).not.toHaveBeenCalled();
    release();
    await shutdown;
    expect(close).toHaveBeenCalledOnce();
  } finally { release(); list.mockRestore(); close.mockRestore(); await h.close(); }
}, 12000);
