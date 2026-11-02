import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function worker(clients:any,brokenStorage=false){
 const events:Record<string,Function>={},records=new Map<string,any>(),registration={showNotification:vi.fn(async()=>{})};
 const cache={put:vi.fn(async(key:string,value:Response)=>{records.set(key,await value.json());})};
 runInNewContext(readFileSync('public/sw.js','utf8'),{URL,Response,caches:{open:async()=>{if(brokenStorage)throw new Error('quota');return cache;}},self:{location:{origin:'https://kanvas.test'},clients,registration,addEventListener:(name:string,fn:Function)=>events[name]=fn}});
 return {events,records,registration};
}
const url='https://kanvas.test/view/session/display';
function click(events:Record<string,Function>,path='/view/session/display'){
 let pending:Promise<void>|undefined;const close=vi.fn();
 events.notificationclick({notification:{data:{url:path},close},waitUntil:(p:Promise<void>)=>pending=p});
 return {pending,close};
}
it('calls openWindow synchronously before any enumeration/storage await',async()=>{
 const target={url,focus:vi.fn(async()=>{})},clients={openWindow:vi.fn(async()=>target),matchAll:vi.fn()};
 const {events,records}=worker(clients);const {pending,close}=click(events);
 expect(close).toHaveBeenCalledOnce();expect(clients.openWindow).toHaveBeenCalledWith(url);expect(clients.matchAll).not.toHaveBeenCalled();
 await pending;expect(target.focus).toHaveBeenCalledOnce();
 expect(records.get('/__kanvas_push_diagnostics__/click').steps.map((s:any)=>s.stage)).toEqual(['click-received','open-requested','open-returned-client','focus-requested','focused']);
});
it.each(['rejection','null','throw'])('recovers an existing root window after openWindow %s',async(mode)=>{
 const focus=vi.fn(async()=>{}),navigate=vi.fn(async()=>({url,focus})),root={url:'https://kanvas.test/',navigate};
 const clients={openWindow:vi.fn(()=>{if(mode==='throw')throw new DOMException('private exception','InvalidAccessError');return mode==='null'?Promise.resolve(null):Promise.reject(new Error('private exception'));}),matchAll:vi.fn(async()=>[root])};
 const {events,records}=worker(clients);await click(events).pending;
 expect(navigate).toHaveBeenCalledWith(url);expect(focus).toHaveBeenCalledOnce();
 const record=records.get('/__kanvas_push_diagnostics__/click');
 expect(record.steps.map((s:any)=>s.stage)).toContain('fallback-client');expect(JSON.stringify(record)).not.toContain('private exception');expect(JSON.stringify(record)).not.toContain('/view/');
});
it('navigates reused root returned by Chrome before focus',async()=>{
 const focus=vi.fn(async()=>{}),navigate=vi.fn(async()=>({url,focus}));
 const clients={openWindow:vi.fn(async()=>({url:'https://kanvas.test/',navigate})),matchAll:vi.fn()};
 const {events}=worker(clients);await click(events).pending;expect(navigate).toHaveBeenCalledWith(url);expect(focus).toHaveBeenCalledOnce();
});
it.each(['enumeration','navigation','focus'])('records %s failure without an unhandled event rejection',async(mode)=>{
 const fail=()=>Promise.reject(new DOMException('secret details','SecurityError'));
 const target={url:mode==='navigation'?'https://kanvas.test/':url,navigate:fail,focus:fail};
 const clients={openWindow:vi.fn(async()=>mode==='enumeration'?null:target),matchAll:fail};
 const {events,records}=worker(clients);await expect(click(events).pending).resolves.toBeUndefined();
 expect(records.get('/__kanvas_push_diagnostics__/click').steps.at(-1)).toMatchObject({stage:'activation-failed',error:'SecurityError'});
 expect(JSON.stringify([...records.values()])).not.toContain('secret details');
});
it('does not hijack external, OAuth or consent windows when launch returns no client',async()=>{
 const navigate=vi.fn(),clients={openWindow:vi.fn(async()=>null),matchAll:vi.fn(async()=>[
 {url:'https://other.test/',navigate},{url:'https://kanvas.test/connect',navigate},{url:'https://kanvas.test/?authorize=private',navigate}
 ])};
 // A root URL with OAuth query is not an ordinary app window.
 const {events,records}=worker(clients);await click(events).pending;expect(navigate).not.toHaveBeenCalled();
 expect(records.get('/__kanvas_push_diagnostics__/click').steps.at(-1).stage).toBe('no-window-client');
});
it('diagnostic storage failures cannot prevent launch/focus',async()=>{
 const focus=vi.fn(async()=>{}),clients={openWindow:vi.fn(async()=>({url,focus})),matchAll:vi.fn()};
 const {events}=worker(clients,true);await expect(click(events).pending).resolves.toBeUndefined();expect(focus).toHaveBeenCalledOnce();
});
it('retains only last push/click metadata, without payload, URLs or body text',async()=>{
 const clients={openWindow:vi.fn(async()=>null),matchAll:vi.fn(async()=>[])},{events,records,registration}=worker(clients);
 for(let n=0;n<3;n++){
 let pending:Promise<void>|undefined;events.push({data:{json:()=>({url:'/view/session/display',body:'PRIVATE CONTENT'})},waitUntil:(p:Promise<void>)=>pending=p});await pending;await click(events).pending;
 }
 expect(records.size).toBe(2);expect(registration.showNotification).toHaveBeenCalledTimes(3);
 expect(JSON.stringify([...records.values()])).not.toMatch(/PRIVATE|session|display|https:/);
 expect(records.get('/__kanvas_push_diagnostics__/push').steps.at(-1).stage).toBe('notification-shown');
});
it('rejects malformed/external click destinations before invoking launch',()=>{
 const clients={openWindow:vi.fn(),matchAll:vi.fn()},{events}=worker(clients);
 for(const path of ['https://evil.test/view/a/b','//evil.test/view/a/b','/view/a/b?redirect=x','/view/a/b#x','/'])expect(click(events,path).pending).toBeUndefined();
 expect(clients.openWindow).not.toHaveBeenCalled();
});
