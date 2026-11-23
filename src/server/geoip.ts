import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { open, type CityResponse, type Reader } from 'maxmind';

// The operator owns this external database and its update lifecycle. No download
// or lookup ever sends an IP address to a provider. Missing data is optional.
let cached: { path: string; stamp: string; reader: Reader<CityResponse> } | undefined;
let pending: Promise<Reader<CityResponse> | undefined> | undefined;
let checkedPath: string | undefined;
let nextCheck = 0;
const RECHECK_MS = 60_000;

export async function lookupLocation(ip: string): Promise<CityResponse | undefined> {
  const path = process.env.KANVAS_GEOLITE_CITY_PATH?.trim();
  if (!path || !isAbsolute(path)) return undefined;
  if (checkedPath !== path || Date.now() >= nextCheck) {
    // Share concurrent reloads; a new file is picked up without an app restart.
    if (!pending) {
      checkedPath = path;
      nextCheck = Date.now() + RECHECK_MS;
      pending = (async () => {
        try {
          const info = await stat(path);
          const stamp = String(info.mtimeMs) + ':' + info.size + ':' + info.ino;
          if (cached?.path !== path || cached.stamp !== stamp) {
            const reader = await open<CityResponse>(path);
            cached = { path, stamp, reader };
          }
          return cached.reader;
        } catch { cached = undefined; return undefined; }
      })().finally(() => { pending = undefined; });
    }
  }
  if (pending) await pending;
  const reader = cached?.path === path ? cached.reader : undefined;
  try { return reader?.get(ip) ?? undefined; } catch { return undefined; }
}
