/** Sequential async collection operations. In particular, never run savepoints
 * concurrently on one transaction's PostgreSQL connection. */
export async function asyncMap<T, R>(items: readonly T[], fn: (item: T, index: number, items: readonly T[]) => R | Promise<R>): Promise<Awaited<R>[]> {
  const results: Awaited<R>[] = [];
  for (let i = 0; i < items.length; i++) results.push(await fn(items[i], i, items));
  return results;
}
export async function asyncFilter<T>(items: readonly T[], fn: (item: T, index: number, items: readonly T[]) => unknown): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i++) if (await fn(items[i], i, items)) results.push(items[i]);
  return results;
}
export async function asyncFlatMap<T, R>(items: readonly T[], fn: (item: T, index: number, items: readonly T[]) => R | readonly R[] | Promise<R | readonly R[]>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i++) { const value = await fn(items[i], i, items); results.push(...(Array.isArray(value) ? value : [value]) as R[]); }
  return results;
}
export async function asyncSome<T>(items: readonly T[], fn: (item: T, index: number) => unknown): Promise<boolean> {
  for (let i = 0; i < items.length; i++) if (await fn(items[i], i)) return true;
  return false;
}
export async function asyncEvery<T>(items: readonly T[], fn: (item: T, index: number) => unknown): Promise<boolean> {
  for (let i = 0; i < items.length; i++) if (!await fn(items[i], i)) return false;
  return true;
}
export async function asyncFind<T>(items: readonly T[], fn: (item: T, index: number) => unknown): Promise<T | undefined> {
  for (let i = 0; i < items.length; i++) if (await fn(items[i], i)) return items[i];
}
export async function asyncFindIndex<T>(items: readonly T[], fn: (item: T, index: number) => unknown): Promise<number> {
  for (let i = 0; i < items.length; i++) if (await fn(items[i], i)) return i;
  return -1;
}
export async function asyncForEach<T>(items: readonly T[], fn: (item: T, index: number) => unknown): Promise<void> {
  for (let i = 0; i < items.length; i++) await fn(items[i], i);
}
export async function asyncReduce<T, R>(items: readonly T[], fn: (accumulator: R, item: T, index: number) => R | Promise<R>, initial: R): Promise<R> {
  let value = initial;
  for (let i = 0; i < items.length; i++) value = await fn(value, items[i], i);
  return value;
}
