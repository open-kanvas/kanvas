import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PoolConfig } from 'pg';

export interface DatabaseOptions extends Pick<PoolConfig, 'host' | 'port' | 'user' | 'database' | 'ssl' | 'password'> {
  schema?: string;
  max?: number;
}

/** Only file paths and non-secret connection settings belong in environment
 * configuration. Password material is supplied by the service credential owner. */
export function databaseOptions(): DatabaseOptions {
  if (process.env.KANVAS_DB) throw new Error('KANVAS_DB is SQLite-only. Import the database and configure PostgreSQL before starting this release.');
  const port = Number(process.env.KANVAS_PG_PORT ?? 5432);
  const max = Number(process.env.KANVAS_PG_POOL_SIZE ?? 8);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(max) || max < 2 || max > 50) throw new Error('Invalid PostgreSQL port or pool size.');
  const servicePassword = process.env.CREDENTIALS_DIRECTORY ? join(process.env.CREDENTIALS_DIRECTORY, 'kanvas-database-password') : undefined;
  const passwordFile = process.env.KANVAS_PG_PASSWORD_FILE || (servicePassword && existsSync(servicePassword) ? servicePassword : undefined);
  let password: string | undefined;
  if (passwordFile) {
    const info = lstatSync(passwordFile);
    if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error('The PostgreSQL password file must be a private regular file.');
    password = readFileSync(passwordFile, 'utf8').trimEnd();
    if (!password || password.includes('\0')) throw new Error('The PostgreSQL password file is invalid.');
  }
  const host = process.env.KANVAS_PG_HOST ?? '/var/run/postgresql';
  const sslMode = process.env.KANVAS_PG_SSL ?? (host.startsWith('/') || ['localhost','127.0.0.1','::1','postgres'].includes(host) ? 'disable' : 'verify-full');
  if (!['disable', 'verify-full'].includes(sslMode)) throw new Error('KANVAS_PG_SSL must be disable (local/private network) or verify-full.');
  return { host, port, database: process.env.KANVAS_PG_DATABASE ?? 'kanvas', user: process.env.KANVAS_PG_USER ?? 'kanvas', schema: process.env.KANVAS_PG_SCHEMA ?? 'public', max,
    ...(password ? { password } : {}),
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: true, ...(process.env.KANVAS_PG_CA_FILE ? { ca: readFileSync(process.env.KANVAS_PG_CA_FILE, 'utf8') } : {}) },
  };
}
