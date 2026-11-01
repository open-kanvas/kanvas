import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {startHarness,type Harness} from './harness';
import {visualHelp} from '../../src/server/visual-help';
import {parseCanonicalArguments,canonicalToolDefinitions} from '../../src/server/mcp/canonical';
import {KEYBOARD_SHORTCUTS} from '../../src/shared/keyboard-shortcuts';
let h:Harness;afterEach(async()=>{await h?.close();});
it('publishes one complete maintained hotkey template, not fourteen fact pages',()=>{
 const help=visualHelp({topic:'keyboard-shortcuts'});expect(help.pageCount).toBe(1);expect(help.view.template).toBe('keyboard-shortcuts');expect(KEYBOARD_SHORTCUTS).toHaveLength(13);expect(()=>visualHelp({topic:'keyboard-shortcuts',page:1})).toThrow();
});
it('describes document-only reading settings and current-view zoom in discoverable schemas',()=>{
 const tools=canonicalToolDefinitions();const config=tools.find(t=>t.name==='kanvas_config_update')!;expect(config.description).toContain('only to documents');for(const field of ['readingFontSize','readingWpm','readingZoom']){const serialized=JSON.stringify(config.inputSchema);expect(serialized).toContain(field);expect(serialized).toContain('only documents using the reading layout');}expect(tools.find(t=>t.name==='kanvas_navigation_control')!.description).toContain('enlarge the current view');
});
it('retains each mirror direction and private cues, including legacy booleans, without widening deck access',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),s=await owner.session(),d=await owner.display(s.id),service=h.runtime.service,p={userId:owner.user!.id};
 for(const mirrored of [false,true,'vertical','horizontal','both'] as const){const args=parseCanonicalArguments('kanvas_presentation_create',{sessionId:s.id,name:'Mirror',mirrored,instructions:'Private deck cue',cardInstructions:['Private card cue'],slides:[{version:1,template:'fact',data:{text:'Visible card'}}]})!;const deck:any=await service.execute('kanvas_presentation_create',args,p);expect(deck.mirrored).toBe(mirrored);const requestId='mirror-'+mirrored;await service.cue(p,s.id,deck.id,0,[d.id],requestId);const {detail}=await owner.settle(s.id,requestId);const view=detail.displays.find(x=>x.id===d.id)!.view!;expect(view.data.mirrored).toBe(mirrored||undefined);expect(JSON.stringify(view)).not.toContain('Private');await expect(service.decks({userId:other.user!.id},s.id)).rejects.toThrow();}
 expect(parseCanonicalArguments('kanvas_presentation_create',{sessionId:s.id,name:'Invalid',mirrored:'diagonal',slides:[{version:1,template:'fact',data:{text:'x'}}]})).toBeUndefined();
});
function worker(clients:any){const events:Record<string,Function>={};const registration={showNotification:vi.fn()};runInNewContext(readFileSync('public/sw.js','utf8'),{URL,self:{location:{origin:'https://kanvas.test'},clients,registration,addEventListener:(name:string,fn:Function)=>events[name]=fn}});return {events,registration};}
it.each(['closed','root','exact'])('notification click opens exact target when PWA is %s',async(mode)=>{
 const url='https://kanvas.test/view/session/display',focus=vi.fn(),navigate=vi.fn(async()=>({focus})),window={url:mode==='root'?'https://kanvas.test/':url,navigate,focus};const clients={matchAll:vi.fn(async()=>mode==='exact'?[window]:[]),openWindow:vi.fn(async()=>window)};const {events}=worker(clients);let pending:Promise<void>|undefined;events.notificationclick({notification:{data:{url:'/view/session/display'},close:vi.fn()},waitUntil:(p:Promise<void>)=>pending=p});await pending;expect(focus).toHaveBeenCalledOnce();if(mode==='root')expect(navigate).toHaveBeenCalledWith(url);if(mode==='exact')expect(clients.openWindow).not.toHaveBeenCalled();else expect(clients.openWindow).toHaveBeenCalledWith(url);
});
it('service worker preserves payload target and rejects external/malformed click paths',async()=>{
 const clients={matchAll:vi.fn(async()=>[]),openWindow:vi.fn()},{events,registration}=worker(clients);let pending:Promise<void>|undefined;events.push({data:{json:()=>({url:'/view/session/display',title:'Private title'})},waitUntil:(p:Promise<void>)=>pending=p});await pending;expect(registration.showNotification).toHaveBeenCalledWith('Kanvas is ready',expect.objectContaining({data:{url:'/view/session/display'}}));expect(JSON.stringify(registration.showNotification.mock.calls)).not.toContain('Private title');for(const url of ['https://evil.test/view/a/b','//evil.test/view/a/b','/view/a/b?redirect=x','/'])events.notificationclick({notification:{data:{url},close:vi.fn()},waitUntil:vi.fn()});expect(clients.openWindow).not.toHaveBeenCalled();
});
