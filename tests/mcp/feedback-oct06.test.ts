import { profileInstructions } from '../../src/server/mcp/profile-guidance.js';
import { FIRST_DISPLAY_LINK_GUIDANCE } from '../../src/server/mcp/viewer-link-guidance.js';
import { describe, it, expect } from 'vitest';
import { operationCatalog, templateCatalog, helpCatalog, discoveryCatalog, discoveryToolDefinitions } from '../../src/server/mcp/discovery.js';
import { workflowIds } from '../../src/server/mcp/workflow-guidance.js';
import { toolSuccess, toolFailure } from '../../src/server/mcp/results.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { InputError } from '../../src/server/input-errors.js';
const context={principal:{userId:'test-account',scopes:['read','publish']}};
describe('contextual discovery and first contact',()=>{
 it('all workflow links name real callable operations and templates surface complete planner/checklist/draft families',()=>{
  const ids=new Set(operationCatalog().map(x=>x.id));
  for(const template of ['planner','checklist','drafting','presentation','chat','progress','scoreboard','countdown']){
   for(const id of workflowIds(template))expect(ids.has(id),id).toBe(true);
   const detail=templateCatalog().find(x=>x.id===`kanvas.template.${template}`)!.detail();expect(detail.relatedOperations).toHaveLength(workflowIds(template).length);expect(detail.submitShape).toContain('displayIds');
  }
 });
 it('submit success proactively exposes targeted workflow operations and committed planner boundary',()=>{
  const result=toolSuccess({status:'prepared'},undefined,'kanvas_submit','discovery',{view:{version:1,template:'planner',data:{status:'committed'}}});
  expect(result.structuredContent).toMatchObject({workflow:{relatedOperations:expect.arrayContaining([{id:'kanvas.planner.review',description:expect.any(String)}])},commitmentBoundary:expect.stringContaining('No external calendar')});
  expect(toolSuccess({},undefined,'kanvas_planner_finalize','discovery').structuredContent).toHaveProperty('commitmentBoundary');
 });
 it('invalid submit returns an exact operation pointer and bounded usable shape without copying submitted private fields',()=>{
  const bad=resolveToolCall('discovery','kanvas_call',{operationId:'kanvas.submit',arguments:{displayId:'PRIVATE_SCREEN_SECRET',template:'table',data:{title:'PRIVATE_TITLE_SECRET'}}});
  const failed=toolFailure(bad.error,undefined,'discovery',bad.canonicalName);
  expect(failed.isError).toBe(true);expect(failed.structuredContent).toMatchObject({error:{schemaTool:'kanvas_discover',schemaArguments:{catalog:'tools',action:'get',id:'kanvas.submit'}}});expect(failed.structuredContent).toMatchObject({recovery:{operationId:'kanvas.submit',shape:expect.stringContaining('title belongs beside')}});
  expect(JSON.stringify(failed)).not.toMatch(/PRIVATE_SCREEN_SECRET|PRIVATE_TITLE_SECRET/);
  expect(toolFailure(new InputError([{path:'view.data',problem:'Unsupported fields'}],'table'),undefined,'discovery','kanvas_submit').structuredContent).toMatchObject({recovery:{template:{arguments:{id:'kanvas.template.table'}}}});
 });
 it('first-contact queries find front-door help and submit is the canonical topic identity',()=>{
  const ids=helpCatalog().map(x=>x.id);expect(ids).toContain('kanvas.help.about');expect(ids).toContain('kanvas.help.what-is-kanvas');expect(ids).toContain('kanvas.help.submit');expect(ids).not.toContain('kanvas.help.publish');
  for(const query of ['about kanvas','what is kanvas']){const out=discoveryCatalog.query('help','search',{query,limit:5},context);expect(JSON.stringify(out.results)).toMatch(/kanvas.help.(about|what-is-kanvas)/);}
  expect(JSON.stringify(helpCatalog().find(x=>x.id==='kanvas.help.getting-started.steps')!.detail())).toContain('Human-facing first instruction');
  expect(JSON.stringify(discoveryToolDefinitions())).toContain('kanvas.help.about');expect(profileInstructions('discovery')).toContain('kanvas.help.about');expect(FIRST_DISPLAY_LINK_GUIDANCE).toContain('prefer the returned shortUrl');expect(profileInstructions('discovery')).not.toContain('Show literal returned viewer URLs on first use');
 });
});
