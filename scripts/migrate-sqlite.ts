import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtemp, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBackup } from './sqlite-snapshot.js';
import { Store } from '../src/server/postgres-store.js';
import { databaseOptions, type DatabaseOptions } from '../src/server/database-config.js';

export const importTables = [
  { name:'users', columns:['id','username','display_name','password_hash'], keys:['id'] },
  { name:'documents', columns:['rowid','kind','id','session_id','value'], keys:['rowid'] },
  { name:'members', columns:['session_id','user_id','role'], keys:['session_id','user_id'] },
  { name:'assets', columns:['id','bytes'], keys:['id'] },
  { name:'requests', columns:['session_id','principal','request_id','digest','result_id','kind'], keys:['session_id','principal','request_id'] },
  { name:'request_metrics', columns:['rowid','hour','category','status','requests','duration_ms'], keys:['rowid'] },
] as const;
export interface ImportReceipt { format:1; sourceSchemaVersion:1; targetSchemaVersion:1; tables: Record<string,{rows:number;verified:boolean}>; verified:boolean; importedAt:string }

function fingerprint(rows: Record<string,unknown>[], columns: readonly string[]): string {
  const digest=createHash('sha256');
  for(const row of rows)for(const column of columns){const value=row[column];const bytes=value instanceof Uint8Array?Buffer.from(value):Buffer.from(JSON.stringify(value));digest.update(`${bytes.length}:`);digest.update(bytes);}
  return digest.digest('hex');
}

/** A consistent SQLite snapshot is the import source. All target writes,
 * validation and sequence restoration commit together, or none do. */
export async function importSqlite(sourcePath:string, options:DatabaseOptions):Promise<ImportReceipt> {
  const source=resolve(sourcePath),info=await lstat(source);
  if(!info.isFile())throw new Error('Import source must be a regular SQLite file, not a symlink.');
  const temporary=await mkdtemp(join(tmpdir(),'kanvas-sqlite-import-'));
  let sqlite:DatabaseSync|undefined,store:Store|undefined;
  try {
    const snapshot=join(temporary,'source.sqlite');
    const backup=await createBackup({databasePath:source,destinationPath:snapshot});
    if(backup.schemaVersion!==1)throw new Error('Only the known SQLite schema version 1 can be imported.');
    sqlite=new DatabaseSync(snapshot,{readOnly:true});
    const names=sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>String(row.name));
    if(JSON.stringify(names)!==JSON.stringify(importTables.map(t=>t.name).sort()))throw new Error('SQLite has missing or unknown tables; refusing a partial import.');
    for(const table of importTables){
      const columns=sqlite.prepare(`PRAGMA table_info(${table.name})`).all().map(row=>String(row.name));
      const expected=table.columns.filter(c=>c!=='rowid');
      if(JSON.stringify(columns)!==JSON.stringify(expected))throw new Error('SQLite table shape differs from the supported source schema.');
    }
    store=new Store(options);await store.ready;
    const target=store,db=sqlite;
    const receipt:ImportReceipt={format:1,sourceSchemaVersion:1,targetSchemaVersion:1,tables:{},verified:false,importedAt:new Date().toISOString()};
    await target.transaction(async()=>{
      const lock=await target.query<{locked:boolean}>('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',[`kanvas:runtime:${target.schema}`]);
      if(!lock.rows[0].locked)throw new Error('Stop the target application before importing.');
      await target.query(`LOCK TABLE ${importTables.map(t=>t.name).join(',')} IN ACCESS EXCLUSIVE MODE`);
      for(const table of importTables)if(Number((await target.query(`SELECT count(*) AS n FROM ${table.name}`)).rows[0].n)!==0)throw new Error('Target database is not empty; import refused without changing it.');
      for(const table of importTables){
        const order=table.keys.map(k=>k==='rowid'?'rowid':`${k} COLLATE BINARY`).join(',');
        const rows=db.prepare(`SELECT ${table.columns.join(',')} FROM ${table.name} ORDER BY ${order}`).all() as Record<string,unknown>[];
        // Bound each statement by row count and approximate size, including media.
        let offset=0;
        while(offset<rows.length){
          const batch:Record<string,unknown>[]=[];let size=0;
          while(offset<rows.length&&batch.length<100){const row=rows[offset++];batch.push(row);size+=table.columns.reduce((n,c)=>n+(row[c] instanceof Uint8Array?(row[c] as Uint8Array).byteLength:Buffer.byteLength(JSON.stringify(row[c]))),0);if(size>=4*1024*1024)break;}
          const values=batch.flatMap(row=>table.columns.map(c=>row[c] instanceof Uint8Array?Buffer.from(row[c] as Uint8Array):row[c]));
          const tuples=batch.map((_,i)=>`(${table.columns.map((_,j)=>`$${i*table.columns.length+j+1}`).join(',')})`).join(',');
          await target.query(`INSERT INTO ${table.name}(${table.columns.join(',')}) VALUES ${tuples}`,values);
        }
        const pgOrder=table.keys.map(k=>k==='rowid'?'rowid':`${k} COLLATE "C"`).join(',');
        const restored=(await target.query(`SELECT ${table.columns.join(',')} FROM ${table.name} ORDER BY ${pgOrder}`)).rows;
        const verified=rows.length===restored.length&&fingerprint(rows,table.columns)===fingerprint(restored,table.columns);
        if(!verified)throw new Error('PostgreSQL import verification failed; target changes will be rolled back.');
        receipt.tables[table.name]={rows:rows.length,verified};
      }
      for(const table of ['documents','request_metrics'])await target.query(`SELECT setval(pg_get_serial_sequence('${table}','rowid'), COALESCE((SELECT max(rowid) FROM ${table}),1), EXISTS(SELECT 1 FROM ${table}))`);
      await target.query('DELETE FROM data_migrations WHERE version=1');
      receipt.verified=true;
    });
    return receipt;
  } finally {sqlite?.close();await store?.close();await rm(temporary,{recursive:true,force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  process.umask(0o077);
  if(process.argv.length!==4||process.argv[2]!=='--from'){
    console.error('Usage: migrate-sqlite --from SNAPSHOT.sqlite (target: KANVAS_PG_* settings). Target must be empty and offline.');process.exitCode=1;
  }else try{console.log(JSON.stringify(await importSqlite(process.argv[3],databaseOptions()),null,2));}
  catch{console.error('KANVAS SQLite import failed. Check source schema, target emptiness/access and PostgreSQL availability. No partial target data is committed.');process.exitCode=1;}
}
