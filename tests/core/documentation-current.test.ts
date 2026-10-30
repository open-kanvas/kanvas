import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {it,expect} from 'vitest';
import {operationCatalog} from '../../src/server/mcp/discovery';
import {validateView} from '../../src/shared/view-schemas';
function markdown(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?markdown(join(path,e.name)):e.name.endsWith('.md')?[join(path,e.name)]:[]);}
const files=['README.md','CONTRIBUTING.md','SECURITY.md',...markdown('docs'),...markdown('public/brand'),...markdown('src/shared/geography')];
it('all repository documentation local links resolve and current executable operation references exist',()=>{
 const ids=new Set(operationCatalog().map(x=>x.id));
 for(const file of files){const text=readFileSync(file,'utf8');for(const match of text.matchAll(/\]\(([^)]+)\)/g)){const target=match[1].split('#')[0];if(target&&!/^\w+:\/\/|^mailto:/.test(target))expect(existsSync(join(dirname(file),target)),`${file}: ${target}`).toBe(true);}
 if(/docs\/feedback-(?!oct29)/.test(file))continue;
 for(const match of text.matchAll(/operationId\s*["']?\s*:\s*["'](kanvas\.[a-z.-]+)/g))expect(ids.has(match[1]),`${file}: ${match[1]}`).toBe(true);
 }
});
it('all complete current documentation ViewSpec JSON examples satisfy the runtime contract',()=>{
 for(const file of files){if(/docs\/feedback-(?!oct29)/.test(file))continue;const text=readFileSync(file,'utf8');for(const match of text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)){let value:any;try{value=JSON.parse(match[1]);}catch{throw new Error(`${file}: invalid fenced JSON`);}if(value?.version===1&&typeof value.template==='string')expect(()=>validateView(value),file).not.toThrow();}}
});
