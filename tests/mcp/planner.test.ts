import { profileInstructions } from '../../src/server/mcp/profile-guidance.js';
import { FIRST_DISPLAY_LINK_GUIDANCE } from '../../src/server/mcp/viewer-link-guidance.js';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { operationCatalog } from '../../src/server/mcp/discovery.js';
import { templateCatalog } from '../../src/server/mcp/discovery.js';
import { helpCatalog } from '../../src/server/mcp/discovery.js';
import { discoveryCatalog } from '../../src/server/mcp/discovery.js';
import { discoveryToolDefinitions } from '../../src/server/mcp/discovery.js';
import { workflowIds } from '../../src/server/mcp/workflow-guidance.js';
import { toolSuccess } from '../../src/server/mcp/results.js';
import { toolFailure } from '../../src/server/mcp/results.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { InputError } from '../../src/server/input-errors.js';

describe("planner coverage 1", () => {

const context={principal:{userId:'test-account',scopes:['read','publish']}};
describe('contextual discovery and first contact',()=>{
 for(const template of ['planner','checklist','drafting','presentation','chat','progress','scoreboard','countdown'])it(`${template} workflow links name real callable operations and surface the complete family`,()=>{
  const ids=new Set(operationCatalog().map(x=>x.id));
   for(const id of workflowIds(template))expect(ids.has(id),id).toBe(true);
   const detail=templateCatalog().find(x=>x.id===`kanvas.template.${template}`)!.detail();expect(detail.relatedOperations).toHaveLength(workflowIds(template).length);expect(detail.submitShape).toContain('displayIds');
 // Presentation builds the full composite catalog (10.101s with two workers).
 // Keep every workflow assertion and leave ordinary template budgets unchanged.
 },template==='presentation'?30_000:10_000);
 it('submit success proactively exposes targeted workflow operations and committed planner boundary',()=>{
  const result=toolSuccess({status:'prepared'},undefined,'kanvas_submit','discovery',{view:{version:1,template:'planner',data:{status:'committed'}}});
  expect(result.structuredContent).toMatchObject({workflow:{relatedOperations:expect.arrayContaining([{id:'kanvas.planner.review',description:expect.any(String)}])},commitmentBoundary:expect.stringContaining('No external calendar')});
  expect(toolSuccess({},undefined,'kanvas_planner_finalize','discovery').structuredContent).toHaveProperty('commitmentBoundary');
 });});
});
