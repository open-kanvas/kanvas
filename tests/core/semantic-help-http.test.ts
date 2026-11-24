import express from 'express';
import type {Server} from 'node:http';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {mountPublicDocs} from '../../src/server/public-docs.js';
import {HELP_PAGES,HELP_TOPICS} from '../../src/shared/help.js';

// Public documentation routes need no account, database, or live application.
describe('semantic help public documentation routes',()=>{
 let server:Server,base:string;
 beforeAll(async()=>{
  const app=express();mountPublicDocs(app,'https://docs.example.test');
  server=await new Promise<Server>(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});
  const address=server.address();if(!address||typeof address==='string')throw Error('Missing test address');
  base='http://127.0.0.1:'+address.port;
 });
 afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));});
 it('lists every semantic subject and serves its maintained prose without publication',async()=>{
  const index=await (await fetch(base+'/docs/index.json')).json();
  for(const topic of HELP_TOPICS.filter(x=>/^(navigation|templates)[.]/.test(x))){
   expect(index.topics.find((x:{topic:string})=>x.topic===topic)).toMatchObject({title:HELP_PAGES[topic].title});
   const md=await fetch(base+'/docs/'+topic+'.md');expect(md.status).toBe(200);
   const text=await md.text();expect(text).toContain('# '+HELP_PAGES[topic].title);
   const catalog=await fetch(base+'/docs/help/kanvas.help.'+topic+'.json');expect(catalog.status).toBe(200);
   expect(await catalog.json()).toMatchObject({id:'kanvas.help.'+topic,summary:HELP_PAGES[topic].description});
  }
 });
 it('rejects numbered compatibility names and makes the intentional alias discoverable',async()=>{
  for(const topic of ['navigation.2','templates.2']){
   expect((await fetch(base+'/docs/'+topic)).status).toBe(404);
   expect((await fetch(base+'/docs/help/kanvas.help.'+topic+'.json')).status).toBe(404);
  }
  const alias=await (await fetch(base+'/docs/what-is-kanvas.md')).text();
  expect(alias).toContain('Intentional alias of kanvas.help.about');
  expect(alias).toContain(HELP_PAGES.about.steps[0]);
 });
});
