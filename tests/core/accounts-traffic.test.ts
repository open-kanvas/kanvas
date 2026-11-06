import {afterEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Response} from 'express';
import {startHarness,type Harness} from './harness.js';

let h:Harness;
afterEach(async()=>{await h?.close();});
it('queries exact raw traffic ranges and weighted legacy hours without losing retained events',async()=>{
 h=await startHarness();const account=await h.account(),store=h.runtime.store,service=h.runtime.service;
 const browser=await h.runtime.auth.issueBrowser(account.user!.id,{cookie:()=>{}} as unknown as Response);
 const p={userId:account.user!.id,browserId:browser.id};service.accounts.serviceAdmins.add(p.userId);
 const insert=async(at:string,category:string,status:number,duration:number)=>store.query('INSERT INTO events(event_id,occurred_at,event_type,status,duration_ms,properties) VALUES($1,$2,\'http.request\',$3,$4,$5::jsonb)',[randomUUID(),at,String(status),duration,JSON.stringify({category})]);
 await insert('2090-01-02T12:29:59.999Z','api',500,999);
 await insert('2090-01-02T12:30:00.000Z','api',200,10);
 await insert('2090-01-02T12:30:00.500Z','account',404,20);
 await insert('2090-01-02T12:30:01.000Z','page',503,30);
 await insert('2090-01-02T12:30:01.001Z','agent',200,999);
 await store.query("INSERT INTO request_metrics(hour,category,status,requests,duration_ms) VALUES('2090-01-02T11:00:00.000Z','api',5,100,10000),('2090-01-02T12:00:00.000Z','agent',2,4,80),('2090-01-02T12:00:00.000Z','account',4,2,60),('2090-01-02T13:00:00.000Z','api',5,100,10000)");
 // A retained history dominated by out-of-range polling must not affect totals.
 await store.query("INSERT INTO events(event_id,occurred_at,event_type,status,duration_ms,properties) SELECT 'old-poll-'||n,'2089-01-01'::timestamptz+n*interval '1 second','http.request','200',1,'{\"category\":\"api\"}'::jsonb FROM generate_series(1,5000) n");
 const snapshot=async()=>({events:(await store.query('SELECT event_id,occurred_at,status,duration_ms,properties FROM events ORDER BY event_id')).rows,legacy:(await store.query('SELECT * FROM request_metrics ORDER BY hour,category,status')).rows});
 const before=await snapshot();
 const ranged=await service.accounts.analytics(p,{scope:'service',since:'2090-01-02T12:30:00.000Z',until:'2090-01-02T12:30:01.000Z'});
 expect(ranged.traffic).toMatchObject({requests:9,errors:4,averageDurationMs:22,retentionDays:null,byCategory:[{category:'agent',requests:4},{category:'account',requests:3},{category:'api',requests:1},{category:'page',requests:1}]});
 const empty=await service.accounts.analytics(p,{scope:'service',since:'2091-01-01T00:00:00.000Z'});
 expect(empty.traffic).toMatchObject({requests:0,errors:0,averageDurationMs:null});
 const full=await service.accounts.analytics(p,{scope:'service',since:'2090-01-02T00:00:00.000Z',until:'2090-01-02T23:59:59.999Z'});
 expect(full.traffic).toMatchObject({requests:211,errors:205,averageDurationMs:105});
 expect(await snapshot()).toEqual(before);
});
