import { afterEach, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { Store } from '../../src/server/store.js';
import { importSqlite } from '../../scripts/migrate-sqlite.js';
import { backupPostgres, postgresEnvironment, runPostgresTool } from '../../scripts/backup-postgres.js';
import { testDatabase, removeTestDatabase } from '../postgres.js';
import type { DatabaseOptions } from '../../src/server/database-config.js';

const stores: Store[] = [], databases: DatabaseOptions[] = [], directories: string[] = [];
function database() { const options=testDatabase(); databases.push(options); return options; }
async function store(options=database()) { const s=new Store(options); stores.push(s); await s.ready; return s; }
async function directory() { const path=await mkdtemp(join(tmpdir(),'kanvas-pg-test-')); directories.push(path); return path; }
afterEach(async () => { for(const s of stores.splice(0)) await s.close(); for(const options of databases.splice(0)) await removeTestDatabase(options); for(const path of directories.splice(0)) await rm(path,{recursive:true,force:true}); });

async function legacy(invalidMember=false) {
  const path=join(await directory(),'legacy.sqlite'), db=new DatabaseSync(path);
  db.exec(`PRAGMA user_version=1;
    CREATE TABLE documents(kind TEXT NOT NULL,id TEXT NOT NULL,session_id TEXT NOT NULL DEFAULT '',value TEXT NOT NULL,PRIMARY KEY(kind,id));
    CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL);
    CREATE TABLE members(session_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(session_id,user_id));
    CREATE TABLE assets(id TEXT PRIMARY KEY,bytes BLOB NOT NULL);
    CREATE TABLE requests(session_id TEXT NOT NULL,principal TEXT NOT NULL,request_id TEXT NOT NULL,digest TEXT NOT NULL,result_id TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(session_id,principal,request_id));
    CREATE TABLE request_metrics(hour TEXT NOT NULL,category TEXT NOT NULL,status INTEGER NOT NULL,requests INTEGER NOT NULL,duration_ms INTEGER NOT NULL,PRIMARY KEY(hour,category,status));`);
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('u','migration-fixture','Alex fixture','fixture-only-unusable-hash');
  const exact='{ "id":"z", "text":"rå data 🌱", "amount":"12345678901234567890.00100", "negative":-0 }';
  db.prepare('INSERT INTO documents(rowid,kind,id,session_id,value) VALUES(?,?,?,?,?)').run(2,'note','z','s',exact);
  db.prepare('INSERT INTO documents(rowid,kind,id,session_id,value) VALUES(?,?,?,?,?)').run(8,'note','a','s',JSON.stringify({id:'a',values:[null,false,1.25]}));
  db.prepare('INSERT INTO members VALUES(?,?,?)').run('s',invalidMember?'missing':'u','owner');
  const bytes=Buffer.from([0,255,1,127,0,30]); db.prepare('INSERT INTO assets VALUES(?,?)').run('media',bytes);
  db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?)').run('s','u','same-request','same-digest','a','submit');
  db.prepare('INSERT INTO request_metrics(rowid,hour,category,status,requests,duration_ms) VALUES(?,?,?,?,?,?)').run(5,'2026-09-25T00:00:00Z','api',200,4,123);
  db.close(); await chmod(path,0o600); return {path,exact,bytes};
}

describe('PostgreSQL storage and SQLite migration', () => {
  it('serializes read/check/write across independent pools without losing updates',async () => {
    const options=database(),a=await store(options),b=await store(options);
    await a.put('counter',{id:'one',value:0});
    await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).atomic(async () => {
      const connection=i%2?a:b,record=(await connection.get<{id:string;value:number}>('counter','one'))!;
      await new Promise(resolve=>setImmediate(resolve)); await connection.put('counter',{...record,value:record.value+1});
    })));
    expect((await a.get<{value:number}>('counter','one'))?.value).toBe(12);
  });

  it('rolls back failed savepoints, suppresses their notifications, and isolates concurrent transactions',async () => {
    const s=await store(),events:string[]=[];
    await s.transaction(async () => {
      await s.put('item',{id:'outer'}); s.afterCommit(()=>events.push('outer'));
      await expect(s.transaction(async () => { await s.put('item',{id:'inner'});s.afterCommit(()=>events.push('inner'));throw new Error('abort inner'); })).rejects.toThrow('abort inner');
      expect(await s.get('item','inner')).toBeUndefined(); expect(events).toEqual([]);
      await s.put('item',{id:'later'});
    });
    expect(events).toEqual(['outer']); expect((await s.list<{id:string}>('item')).map(x=>x.id)).toEqual(['outer','later']);
    await expect(s.transaction(async () => { await s.put('item',{id:'rollback'});s.afterCommit(()=>events.push('bad'));throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(await s.get('item','rollback')).toBeUndefined();expect(events).toEqual(['outer']);
  });

  it('permits only one application owner and releases ownership on clean shutdown',async () => {
    const options=database(),a=await store(options),b=await store(options);
    await a.claimRuntime();await expect(b.claimRuntime()).rejects.toThrow('Another KANVAS');await a.close();await b.claimRuntime();
  });

  it('does not report success or emit notifications when a caught SQL error aborts the transaction',async () => {
    const s=await store(),events:string[]=[];
    await expect(s.transaction(async()=>{
      await s.put('item',{id:'must-rollback'});s.afterCommit(()=>events.push('not-committed'));
      try { await s.query('INSERT INTO assets(id,bytes) VALUES($1,$2),($1,$2)',['duplicate',Buffer.from([1])]); } catch { /* Simulate a domain-level error handler. */ }
      return {saved:true};
    })).rejects.toMatchObject({code:'TRANSACTION_ABORTED'});
    expect(await s.get('item','must-rollback')).toBeUndefined();expect(events).toEqual([]);
  });

  it('imports every table losslessly, retaining document order, raw JSON, assets and retry receipts',async () => {
    const source=await legacy(),options=database(),receipt=await importSqlite(source.path,options),target=await store(options);
    expect(receipt.verified).toBe(true);expect(Object.values(receipt.tables).every(t=>t.verified)).toBe(true);
    expect(receipt.tables.documents.rows).toBe(2);
    expect((await target.list<{id:string}>('note','s')).map(x=>x.id)).toEqual(['z','a']);
    expect((await target.query('SELECT value FROM documents WHERE id=$1',['z'])).rows[0].value).toBe(source.exact);
    expect((await target.query('SELECT bytes FROM assets WHERE id=$1',['media'])).rows[0].bytes).toEqual(source.bytes);
    expect((await target.query('SELECT result_id FROM requests WHERE request_id=$1',['same-request'])).rows[0].result_id).toBe('a');
    await target.put('note',{id:'after',sessionId:'s'});expect((await target.query('SELECT rowid FROM documents WHERE id=$1',['after'])).rows[0].rowid).toBeGreaterThan(8);
    expect((await target.query('SELECT password_hash FROM users WHERE id=$1',['u'])).rows[0].password_hash).toBe('fixture-only-unusable-hash');
  });

  it('refuses an occupied or running target without replacing existing data',async () => {
    const source=await legacy(),options=database(),target=await store(options);
    await target.claimRuntime();await expect(importSqlite(source.path,options)).rejects.toThrow('Stop the target');
    await target.close();const reopened=await store(options);await reopened.put('existing',{id:'keep'});
    await expect(importSqlite(source.path,options)).rejects.toThrow('not empty');
    expect(await reopened.get('existing','keep')).toEqual({id:'keep'});expect((await reopened.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(0);
  });

  it('rolls back the entire import when integrity validation fails partway',async () => {
    const source=await legacy(true),options=database();await expect(importSqlite(source.path,options)).rejects.toThrow();
    const target=await store(options);
    for(const table of ['users','documents','members','assets','requests','request_metrics'])expect((await target.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n).toBe(0);
  });

  it('rejects unknown source tables rather than silently dropping data',async () => {
    const source=await legacy(),db=new DatabaseSync(source.path);db.exec('CREATE TABLE unknown_feature(id TEXT)');db.close();
    await expect(importSqlite(source.path,database())).rejects.toThrow('unknown tables');
  });

  it('restores a private PostgreSQL archive into a new database and preserves identity sequences',async () => {
    const options=database(),s=await store(options);await s.put('report',{id:'one',sessionId:'s',text:'restore me'});
    await s.query('INSERT INTO assets(id,bytes) VALUES($1,$2)',['blob',Buffer.from([0,1,255])]);
    const path=join(await directory(),'backup.dump');await backupPostgres(options,path);
    expect((await stat(path)).mode&0o077).toBe(0);await expect(backupPostgres(options,path)).rejects.toThrow('already exists');
    const name=`restore_${randomUUID().replaceAll('-','')}`,admin=new pg.Client(options);await admin.connect();await admin.query(`CREATE DATABASE ${name}`);
    const restored={...options,database:name};let check:Store|undefined;
    try {
      const env=await postgresEnvironment(restored,await directory());
      await runPostgresTool('pg_restore',['--exit-on-error','--no-owner','--no-privileges','--dbname',name,path],env);
      check=new Store(restored);await check.ready;expect(await check.get('report','one')).toEqual({id:'one',sessionId:'s',text:'restore me'});
      expect((await check.query('SELECT bytes FROM assets WHERE id=$1',['blob'])).rows[0].bytes).toEqual(Buffer.from([0,1,255]));
      await check.put('report',{id:'two',sessionId:'s'});expect((await check.list<{id:string}>('report')).map(x=>x.id)).toEqual(['one','two']);
    } finally {await check?.close();await admin.query(`DROP DATABASE ${name}`);await admin.end();}
  });
});
