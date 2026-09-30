import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pg, { type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { databaseOptions, type DatabaseOptions } from './database-config.js';
import { migrateDatabase } from './database-migrations.js';
import { normalizeLegacyRecord } from './legacy-data.js';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = 'AppError'; }
}
export function required<T>(value: T | undefined | null, message = 'The requested item is unavailable.'): T {
  if (value === undefined || value === null) throw new AppError('NOT_FOUND', message, 404);
  return value;
}
type Row = Record<string, any>;
interface Transaction { client: PoolClient; callbacks: (() => unknown)[]; depth: number; active: boolean }

/** Bind placeholders; never interpolate user values or rewrite SQL semantics. */
export function parameters(sql: string): string {
  let index = 0, quoted = false, result = '';
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") { result += char; if (quoted && sql[i+1] === "'") result += sql[++i]; else quoted = !quoted; }
    else result += char === '?' && !quoted ? `$${++index}` : char;
  }
  return result;
}

/** PostgreSQL-only asynchronous storage. Each transaction has one pooled
 * connection, savepoint stack and after-commit queue, isolated by async context. */
export class Store {
  readonly pool: pg.Pool;
  readonly schema: string;
  readonly ready: Promise<void>;
  private readonly transactions = new AsyncLocalStorage<Transaction>();
  private lease?: PoolClient;
  private leaseLost = false;
  private closing = false;
  /** Per-process diagnostic, including writes later rolled back. */
  private writes = 0;
  get mutationCount(): number { return this.writes; }
  readonly db = {
    prepare: (sql: string) => ({
      get: async (...values: unknown[]): Promise<Row | undefined> => (await this.query(parameters(sql), values)).rows[0],
      all: async (...values: unknown[]): Promise<Row[]> => (await this.query(parameters(sql), values)).rows,
      run: async (...values: unknown[]) => ({ changes: (await this.query(parameters(sql), values)).rowCount ?? 0 }),
    }),
    exec: async (sql: string): Promise<void> => { await this.query(sql); },
  };
  constructor(options: DatabaseOptions = databaseOptions()) {
    this.schema = options.schema ?? 'public';
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(this.schema)) throw new Error('Invalid PostgreSQL schema name.');
    const { schema: _schema, ...connection } = options;
    this.pool = new pg.Pool({ ...connection, max: options.max ?? 8, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000,
      application_name: 'kanvas', statement_timeout: 15_000, options: `-c search_path=${this.schema},pg_catalog`,
      types: { getTypeParser: (oid: number, format?: string) => oid === 20 ? (value: string) => {
        const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error('Database integer exceeds the supported range.'); return n;
      } : pg.types.getTypeParser(oid, format as 'text') },
    });
    this.pool.on('error', () => { console.error('KANVAS PostgreSQL idle connection failed.'); });
    this.ready = this.initialize();
  }
  private async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try { await migrateDatabase(client, this.schema); } finally { client.release(); }
  }
  private context(): Transaction | undefined { const current = this.transactions.getStore(); return current?.active ? current : undefined; }
  async query<T extends QueryResultRow = Row>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    await this.ready;
    if (this.leaseLost) throw new AppError('DATABASE_UNAVAILABLE', 'The database connection was lost. Restart the application before accepting more work.', 503);
    const context = this.context();
    const mutating = /^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql);
    if (!context && mutating) return this.transaction(() => this.query<T>(sql, values));
    const result = await (context ? context.client.query<T>(sql, values) : this.pool.query<T>(sql, values));
    if (mutating) this.writes += result.rowCount ?? 0;
    return result;
  }
  async get<T>(kind: string, key: string): Promise<T | undefined> {
    const row = (await this.query<{value:string}>('SELECT value FROM documents WHERE kind=$1 AND id=$2', [kind,key])).rows[0];
    return row ? normalizeLegacyRecord(kind, JSON.parse(row.value)) as T : undefined;
  }
  async list<T>(kind: string, sessionId?: string): Promise<T[]> {
    const rows = (await this.query<{value:string}>(sessionId === undefined ? 'SELECT value FROM documents WHERE kind=$1 ORDER BY rowid' : 'SELECT value FROM documents WHERE kind=$1 AND session_id=$2 ORDER BY rowid', sessionId === undefined ? [kind] : [kind,sessionId])).rows;
    return rows.map(row => normalizeLegacyRecord(kind, JSON.parse(row.value)) as T);
  }
  async put<T extends {id: string; sessionId?: string}>(kind: string, value: T): Promise<void> {
    await this.query('INSERT INTO documents(kind,id,session_id,value) VALUES($1,$2,$3,$4) ON CONFLICT(kind,id) DO UPDATE SET session_id=excluded.session_id,value=excluded.value', [kind,value.id,value.sessionId ?? '',JSON.stringify(value)]);
  }
  async delete(kind: string, key: string): Promise<void> { await this.query('DELETE FROM documents WHERE kind=$1 AND id=$2',[kind,key]); }
  afterCommit(callback: () => unknown): void {
    const context = this.context(); if (context) context.callbacks.push(callback); else this.notify(callback);
  }
  private notify(callback: () => unknown): void {
    try { Promise.resolve(this.transactions.exit(callback)).catch(() => { console.error('KANVAS post-commit notification failed.'); }); }
    catch { console.error('KANVAS post-commit notification failed.'); }
  }
  /** A business operation joins its caller's transaction, or starts one before
   * reading revisions/permissions. Explicit transaction() still makes a savepoint. */
  async atomic<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.context() ? await fn() : this.transaction(fn);
  }
  /** Multi-query projections see one committed version, without blocking writers. */
  async snapshot<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.context() ? await fn() : this.transaction(fn, true);
  }
  async transaction<T>(fn: () => T | Promise<T>, readOnly = false): Promise<T> {
    await this.ready;
    const parent = this.context();
    if (parent) {
      const child: Transaction = { ...parent, depth: parent.depth + 1 }, mark = parent.callbacks.length, savepoint = `kanvas_${child.depth}`;
      await parent.client.query(`SAVEPOINT ${savepoint}`);
      try { const value = await this.transactions.run(child, fn); await parent.client.query(`RELEASE SAVEPOINT ${savepoint}`); return value; }
      catch (error) { parent.callbacks.length = mark; await parent.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); await parent.client.query(`RELEASE SAVEPOINT ${savepoint}`); throw error; }
      finally { child.active = false; }
    }
    const client = await this.pool.connect(), context: Transaction = { client, callbacks: [], depth: 0, active: true };
    let result: T;
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN'); await client.query("SET LOCAL lock_timeout='10s'");
      // Short write operations are serialized until a future multi-node design
      // replaces process-local realtime and job coordination.
      if (!readOnly) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`kanvas:write:${this.schema}`]);
      result = await this.transactions.run(context, fn);
      const committed = await client.query('COMMIT');
      // PostgreSQL reports ROLLBACK, without throwing, when application code
      // catches a SQL error inside an already-aborted transaction.
      if (committed.command !== 'COMMIT') throw new AppError('TRANSACTION_ABORTED', 'The operation was rolled back and was not saved.', 503);
    } catch (error) { context.callbacks.length = 0; await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { context.active = false; client.release(); }
    for (const callback of context.callbacks) this.notify(callback);
    return result;
  }
  /** PostgreSQL alone does not make the in-memory MCP/events/jobs multi-node. */
  async claimRuntime(): Promise<void> {
    await this.ready; const client = await this.pool.connect();
    try {
      const result = await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[`kanvas:runtime:${this.schema}`]);
      if (!result.rows[0].locked) throw new Error('Another KANVAS application instance owns this database.');
      this.lease = client;
      client.on('error', () => { this.leaseLost = true; console.error('KANVAS database ownership connection lost; restart required.'); });
    } catch (error) { client.release(); throw error; }
  }
  async close(): Promise<void> {
    if (this.closing) return; this.closing = true; await this.ready.catch(() => {});
    if (this.lease) { await this.lease.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`kanvas:runtime:${this.schema}`]).catch(() => {}); this.lease.release(this.leaseLost); this.lease = undefined; }
    await this.pool.end();
  }
}
