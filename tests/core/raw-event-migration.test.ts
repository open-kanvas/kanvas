import {it,expect} from 'vitest';
import pg from 'pg';
import {Store} from '../../src/server/store.js';
import {testDatabase,removeTestDatabase} from '../postgres.js';

it('migrates a v1 schema without inventing historical timestamps and preserves exact source',async()=>{
 const options=testDatabase();let store:Store|undefined;
 const db=new pg.Client(options);await db.connect();
 try{
  store=new Store(options);await store.ready;await store.close();store=undefined;
  await db.query(`SET search_path TO "${options.schema}",pg_catalog`);
  // Recreate the exact preceding structural shape in this disposable schema.
  await db.query('DROP TABLE events; DROP FUNCTION reject_event_mutation(); DELETE FROM schema_migrations WHERE version=2');
  for(const [table,columns] of Object.entries({documents:['created_at'],users:['created_at','last_login_at','last_seen_at','is_internal'],members:['joined_at'],requests:['created_at']}))
   for(const column of columns)await db.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  const exact='{ "id":"old", "amount":"9007199254740993.00100", "text":"Old source" }';
  await db.query("INSERT INTO users VALUES('old','old-user','Old user','not-a-credential')");
  await db.query("INSERT INTO members VALUES('s','old','owner')");
  await db.query("INSERT INTO requests VALUES('s','user:old','r','d','old','submit')");
  await db.query("INSERT INTO documents(kind,id,session_id,value) VALUES('note','old','s',$1)",[exact]);
  store=new Store(options);await store.ready;
  expect((await store.query("SELECT value,created_at FROM documents WHERE id='old'")).rows[0]).toEqual({value:exact,created_at:null});
  expect((await store.query("SELECT created_at,last_login_at,last_seen_at FROM users WHERE id='old'")).rows[0]).toEqual({created_at:null,last_login_at:null,last_seen_at:null});
  expect((await store.query('SELECT joined_at FROM members')).rows[0].joined_at).toBeNull();
  expect((await store.query('SELECT created_at FROM requests')).rows[0].created_at).toBeNull();
  await store.put('note',{id:'new'});
  expect((await store.query("SELECT created_at FROM documents WHERE id='new'")).rows[0].created_at).toBeInstanceOf(Date);
  expect((await store.query('SELECT count(*)::int n FROM events')).rows[0].n).toBe(0);
  expect((await store.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r=>r.version)).toEqual([1,2]);
 }finally{await store?.close();await db.end();await removeTestDatabase(options);}
});
