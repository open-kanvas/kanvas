import { createHash, randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import pg from 'pg';
import type { DatabaseOptions } from '../src/server/database-config.js';

/** A disposable schema, never the configured application database. A test
 * connection must be explicitly supplied; production PG settings are ignored. */
export function testDatabase(seed?:string):DatabaseOptions {
  const host=process.env.KANVAS_TEST_PG_HOST;
  if(!host)throw new Error('Set KANVAS_TEST_PG_HOST to an isolated PostgreSQL test instance.');
  return {host,port:Number(process.env.KANVAS_TEST_PG_PORT??5432),user:process.env.KANVAS_TEST_PG_USER??userInfo().username,database:process.env.KANVAS_TEST_PG_DATABASE??'kanvas_test',max:4,
    schema:`test_${seed?createHash('sha256').update(seed).digest('hex').slice(0,32):randomUUID().replaceAll('-','')}`,ssl:false};
}
export async function removeTestDatabase(options:DatabaseOptions):Promise<void>{
  if(!options.schema?.startsWith('test_')||!/^test_[a-f0-9]{32}$/.test(options.schema))throw new Error('Only disposable test schemas may be removed.');
  const client=new pg.Client(options);await client.connect();
  try {
    const lock=await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[`kanvas:runtime:${options.schema}`]);
    if(lock.rows[0].locked)await client.query(`DROP SCHEMA IF EXISTS "${options.schema}" CASCADE`);
  }finally{await client.end();}
}
