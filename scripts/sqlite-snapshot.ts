#!/usr/bin/env node
import { constants } from 'node:fs';
import { chmod, link, lstat, mkdir, mkdtemp, open, realpath, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

export interface BackupOptions { databasePath: string; destinationPath: string }
export interface BackupReceipt {
  destination: string;
  createdAt: string;
  bytes: number;
  pages: number;
  schemaVersion: number;
  integrity: 'ok';
}

class BackupError extends Error {}

function hasCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code;
}

/**
 * Copy SQLite's committed state, including WAL data, through its online backup
 * API. Work in a private staging directory; only publish a verified snapshot.
 * link() is atomic and fails if the output exists, including dangling symlinks.
 */
export async function createBackup(options: BackupOptions): Promise<BackupReceipt> {
  if (!options.databasePath || !options.destinationPath || options.databasePath === ':memory:' ||
      options.databasePath.includes('\0') || options.destinationPath.includes('\0')) {
    throw new BackupError('Provide a file-backed source database and a new destination path.');
  }
  const sourcePath = resolve(options.databasePath);
  const destination = resolve(options.destinationPath);
  if (sourcePath === destination) throw new BackupError('The backup destination must differ from its source.');

  let staging: string | undefined;
  let source: DatabaseSync | undefined;
  let published = false;
  try {
    const sourceInfo = await lstat(sourcePath);
    if (!sourceInfo.isFile()) throw new BackupError('The source must be an existing regular database file, not a symlink.');
    // Resolve parent aliases before comparing; the source itself must not be a symlink.
    const canonicalSource = await realpath(sourcePath);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const parent = await realpath(dirname(destination));
    if (join(parent, basename(destination)) === canonicalSource) {
      throw new BackupError('The backup destination must differ from its source.');
    }
    try {
      await lstat(destination);
      throw new BackupError('The backup destination already exists; choose a new filename.');
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error;
    }

    staging = await mkdtemp(join(parent, '.kanvas-backup-'));
    await chmod(staging, 0o700);
    const snapshot = join(staging, 'snapshot.sqlite');
    const placeholder = await open(snapshot, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    await placeholder.close();

    source = new DatabaseSync(canonicalSource, { readOnly: true, timeout: 5000 });
    const pages = await backup(source, snapshot, { rate: 100 });
    source.close();
    source = undefined;

    const verification = new DatabaseSync(snapshot, { timeout: 5000 });
    let schemaVersion: number;
    try {
      // A portable backup must not depend on sidecar WAL/SHM files.
      verification.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      const journal = verification.prepare('PRAGMA journal_mode=DELETE').get();
      if (journal?.journal_mode !== 'delete') throw new BackupError('The snapshot could not be made self-contained.');
      const integrity = verification.prepare('PRAGMA integrity_check').all();
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
        throw new BackupError('Snapshot integrity verification failed; no backup was published.');
      }
      if (verification.prepare('PRAGMA foreign_key_check').get()) {
        throw new BackupError('Snapshot foreign-key verification failed; no backup was published.');
      }
      schemaVersion = Number(verification.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    } finally {
      verification.close();
    }
    await chmod(snapshot, 0o600);
    const durableFile = await open(snapshot, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { await durableFile.sync(); } finally { await durableFile.close(); }
    const { size: bytes } = await stat(snapshot);

    await link(snapshot, destination);
    published = true;
    const durableDirectory = await open(parent, constants.O_RDONLY | constants.O_DIRECTORY);
    try { await durableDirectory.sync(); } finally { await durableDirectory.close(); }
    return { destination, createdAt: new Date().toISOString(), bytes, pages, schemaVersion, integrity: 'ok' };
  } catch (error) {
    if (published) throw new BackupError('A verified backup was created, but filesystem durability confirmation failed; inspect it before retrying. No existing file was replaced.');
    if (error instanceof BackupError) throw error;
    if (hasCode(error, 'EEXIST')) throw new BackupError('The backup destination already exists; choose a new filename.');
    // SQLite/OS diagnostics may contain data, SQL or paths: never print raw errors.
    throw new BackupError('Backup failed. Check the source database, directory permissions and available disk space. No existing backup was replaced.');
  } finally {
    try { source?.close(); }
    finally { if (staging) await rm(staging, { recursive: true, force: true }); }
  }
}

