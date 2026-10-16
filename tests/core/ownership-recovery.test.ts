import { afterEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { Store } from '../../src/server/postgres-store.js';
import { createShutdown } from '../../src/server/shutdown.js';
import { testDatabase, removeTestDatabase } from '../postgres.js';
import type { DatabaseOptions } from '../../src/server/database-config.js';
import { spawn } from 'node:child_process';

const stores: Store[] = [], databases: DatabaseOptions[] = [];
afterEach(async () => { vi.useRealTimers(); for (const s of stores.splice(0)) await s.close(); for (const d of databases.splice(0)) await removeTestDatabase(d); });
async function owner(onLost = vi.fn()) {
  const d = testDatabase(); databases.push(d);
  const s = new Store(d, onLost); stores.push(s); await s.ready; await s.claimRuntime();
  return { s, d, onLost };
}
describe('runtime ownership loss', () => {
  it('fences reads and transactions, notifies once, and lets a new owner reacquire after backend termination', async () => {
    const {s,d,onLost} = await owner();
    await s.put('recovery', {id:'keep',value:42});
    const admin = new pg.Client(d); await admin.connect();
    try {
      const lease = (s as any).lease;
      const pid = (await lease.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await admin.query('SELECT pg_terminate_backend($1)', [pid]);
      await vi.waitFor(() => expect(onLost).toHaveBeenCalledTimes(1));
      await expect(s.query('SELECT 1')).rejects.toMatchObject({code:'DATABASE_UNAVAILABLE'});
      const work = vi.fn(); await expect(s.transaction(work)).rejects.toMatchObject({code:'DATABASE_UNAVAILABLE'}); expect(work).not.toHaveBeenCalled();
      lease.emit('error',new Error('duplicate')); lease.emit('end'); expect(onLost).toHaveBeenCalledTimes(1);
      const next = new Store(d); stores.push(next); await next.ready; await next.claimRuntime();
      expect(await next.get('recovery','keep')).toEqual({id:'keep',value:42});
    } finally { await admin.end(); }
  });
  it('unexpected end alone fences ownership but intentional close and idle pool errors do not', async () => {
    const {s,onLost} = await owner(); s.pool.emit('error', new Error('idle pool error')); expect(onLost).not.toHaveBeenCalled();
    const lease = (s as any).lease; lease.emit('end'); expect(onLost).toHaveBeenCalledTimes(1);
    await expect(s.query('SELECT 1')).rejects.toMatchObject({status:503}); await s.close();
    const clean = await owner(); await clean.s.close(); expect(clean.onLost).not.toHaveBeenCalled();
  });
  it('handles loss during lock acquisition before startup can serve', async () => {
    const d=testDatabase();databases.push(d);const onLost=vi.fn(),s=new Store(d,onLost);stores.push(s);await s.ready;
    const client=await s.pool.connect();const query=client.query.bind(client);
    vi.spyOn(s.pool,'connect').mockResolvedValueOnce(client as never);
    (client as any).query=async(...args:any[])=>{const result=await (query as any)(...args);client.emit('end');return result;};
    await expect(s.claimRuntime()).rejects.toMatchObject({code:'DATABASE_UNAVAILABLE'});expect(onLost).toHaveBeenCalledTimes(1);
  });
  it('rolls back a transaction whose ownership is lost before commit', async () => {
    const {s,d}=await owner();
    await expect(s.transaction(async()=>{await s.put('recovery',{id:'rollback'}); (s as any).lease.emit('end');})).rejects.toMatchObject({code:'DATABASE_UNAVAILABLE'});
    await s.close();const next=new Store(d);stores.push(next);await next.ready;await next.claimRuntime();expect(await next.get('recovery','rollback')).toBeUndefined();
  });
});
describe('bounded shutdown', () => {
  it('stops accepting synchronously, cleans once, and retains fatal status across duplicate calls', async () => {
    const exit=vi.fn(),stop=vi.fn();let finish!:()=>void;const cleanup=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
    const shutdown=createShutdown({stopAccepting:stop,cleanup,exit});shutdown();shutdown(1);shutdown();
    expect(stop).toHaveBeenCalledTimes(1);expect(cleanup).toHaveBeenCalledTimes(1);finish();await vi.waitFor(()=>expect(exit).toHaveBeenCalledWith(1));
  });
  it('clean intentional shutdown exits successfully; failed cleanup exits nonzero', async () => {
    for(const failed of [false,true]) {const exit=vi.fn();createShutdown({stopAccepting:()=>{},cleanup:async()=>{if(failed)throw Error();},exit})();await vi.waitFor(()=>expect(exit).toHaveBeenCalledWith(failed?1:0));}
  });
  it('really terminates a process with stuck cleanup and a persistent handle', async () => {
    const started=Date.now();
    const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',`import {createShutdown} from './src/server/shutdown.ts';setInterval(()=>{},1000);createShutdown({stopAccepting:()=>{},cleanup:()=>new Promise(()=>{}),deadlineMs:150})(1);`],{cwd:process.cwd(),stdio:'ignore'});
    const code=await new Promise<number|null>((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(Error('shutdown did not terminate'));},5000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);resolve(code);});});
    expect(code).toBe(1);expect(Date.now()-started).toBeLessThan(5000);
  });
});
