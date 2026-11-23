import {HELP_PAGES} from '../../src/shared/help';
import {operationTable} from '../../src/server/mcp/operations';
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {it,expect} from 'vitest';
import {operationCatalog,parseDiscoveryInput,helpCatalog} from '../../src/server/mcp/discovery';
import {validateView} from '../../src/shared/view-schemas';
function markdown(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?markdown(join(path,e.name)):e.name.endsWith('.md')?[join(path,e.name)]:[]);}
const files=['README.md','CONTRIBUTING.md','SECURITY.md',...markdown('docs'),...markdown('public/brand'),...markdown('src/shared/geography')];
it('all repository documentation local links resolve and current executable operation references exist',()=>{
 // kanvas.discover is a reserved read-only wire fallback, not a domain operation.
 const ids=new Set([...operationCatalog().map(x=>x.id),'kanvas.discover']);
 expect(readFileSync('src/server/mcp/index.ts','utf8')).toContain("outer.operationId === 'kanvas.discover'");
 for(const file of files){const text=readFileSync(file,'utf8');for(const match of text.matchAll(/\]\(([^)]+)\)/g)){const target=match[1].split('#')[0];if(target&&!/^\w+:\/\/|^mailto:/.test(target))expect(existsSync(join(dirname(file),target)),`${file}: ${target}`).toBe(true);}
 if(/docs\/feedback-(?!oct29)/.test(file))continue;
 for(const match of text.matchAll(/operationId\s*["']?\s*:\s*["'](kanvas\.[a-z.-]+)/g))expect(ids.has(match[1]),`${file}: ${match[1]}`).toBe(true);
 }
});
it('all complete current documentation ViewSpec JSON examples satisfy the runtime contract',()=>{
 for(const file of files){if(/docs\/feedback-(?!oct29)/.test(file))continue;const text=readFileSync(file,'utf8');for(const match of text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)){let value:any;try{value=JSON.parse(match[1]);}catch{throw new Error(`${file}: invalid fenced JSON`);}if(value?.version===1&&typeof value.template==='string')expect(()=>validateView(value),file).not.toThrow();}}
});

it('reader references retain current API, privacy and storage boundaries',()=>{
 const text=(file:string)=>readFileSync(file,'utf8');
 const help=text('src/shared/help.ts');
 expect(help).not.toContain('existing local geoip-lite database');
 expect(help).toContain('optional operator-supplied local GeoLite2-City database');
 expect(help).toContain('never an external per-IP lookup');
 expect(text('docs/legal-review.md')).toContain('original browser tab may be closed');
 expect(text('docs/agent-guidance.md')).toContain('activeContext:{sessionId}');
 expect(text('docs/usage-limits.md')).not.toContain('Session limits count all owned sessions, including ended/archived sessions.');
 expect(text('docs/statistical-visuals.md')).toContain('preserves forward history');
 expect(text('docs/integration/signage.md')).toContain('Google Material Symbols');
 expect(text('docs/integration/signage.md')).not.toContain('type:"exit"');
 for(const file of files)expect(text(file),file).not.toMatch(/kanvas_publish|kanvas_inspect|kanvas_view_patch|kanvas_display_navigate|kanvas_satisfaction_read/);
 expect(text('CONTRIBUTING.md')).toContain('updated, checked unchanged, or deferred');
 expect(text('docs/zod-upgrade-review.md')).toContain('Keep timestamped metadata');
});

it('complete tool recipes satisfy their discovered input schemas',()=>{
 for(const file of files){const source=readFileSync(file,'utf8');
 for(const match of source.matchAll(/```json\s*\n([\s\S]*?)\n```/g)){
 const value=JSON.parse(match[1]); const name=value?.name??value?.tool;
 if(name==='kanvas_discover'||name==='kanvas_call')expect(()=>parseDiscoveryInput(name,value.arguments),file).not.toThrow();
 const call=name==='kanvas_call'?value.arguments:value;
 if(call?.operationId==='kanvas.discover'){expect(()=>parseDiscoveryInput('kanvas_discover',call.arguments),file).not.toThrow();continue;}
 if(typeof call?.operationId==='string'&&call.arguments){const op=operationTable().get(call.operationId);expect(op,file).toBeDefined();expect(()=>op!.schema.parse(call.arguments),file).not.toThrow();}
 }
 }
});


it('maintained help examples validate their inner views and retain truthful behavior descriptions',()=>{
 for(const [topic,page] of Object.entries(HELP_PAGES)){
  const visit=(value:unknown):void=>{if(!value||typeof value!=='object')return;const record=value as Record<string,unknown>;
   if(record.version===1&&typeof record.template==='string')expect(()=>validateView(record),topic).not.toThrow();
   for(const child of Object.values(record))visit(child);
  };visit(page.example);
 }
 const help=readFileSync('src/shared/help.ts','utf8');
 for(const stale of ['kanvas.display.observe','settings.update','expires after 14 days','up to 512 windows','Activity retention is 365 days','both current revisions remain required','Home and End choose first/last frame'])expect(help).not.toContain(stale);
 expect(help).toContain('retained indefinitely');
 expect(help).toContain('0.25 to 86400');
 expect(readFileSync('src/shared/reading.ts','utf8')).not.toContain('one window, not saved');
 expect(readFileSync('src/shared/template-concepts.ts','utf8')).toContain('Fixed Kanvas terminology');
 expect(readFileSync('src/shared/display-guidance.ts','utf8')).toContain('immediate-save');
});


it('help catalog recipes validate both operation envelopes and nested views',()=>{
 for(const item of helpCatalog()){
  const content=item.detail().content as {example?:{tool:string;arguments:{operationId:string;arguments:Record<string,unknown>}}};
  const example=content?.example;if(!example)continue;
  expect(()=>parseDiscoveryInput(example.tool,example.arguments),item.id).not.toThrow();
  if(example.tool==='kanvas_call'){
   const call=example.arguments,op=operationTable().get(call.operationId);
   expect(op,item.id).toBeDefined();expect(()=>op!.schema.parse(call.arguments),item.id).not.toThrow();
   if(call.arguments.view)expect(()=>validateView(call.arguments.view),item.id).not.toThrow();
  }
 }
});
