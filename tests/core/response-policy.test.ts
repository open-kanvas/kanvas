import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import type { TemplateId } from '../../src/shared/types.js';
import { SEARCH_PROBES } from '../../src/shared/template-concepts.js';
import { TEMPLATE_CONCEPTS } from '../../src/shared/template-concepts.js';
import { collapseViewSlots } from '../../src/server/mcp/discovery.js';
import { discoveryCatalog } from '../../src/server/mcp/discovery.js';
import { helpCatalog } from '../../src/server/mcp/discovery.js';
import { minimalExample } from '../../src/server/mcp/discovery.js';
import { operationCatalog } from '../../src/server/mcp/discovery.js';
import { templateCatalog } from '../../src/server/mcp/discovery.js';
import { VIEW_SLOT } from '../../src/server/mcp/discovery.js';
import { LocalSearch } from '../../src/server/mcp/local-search.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { applyResponsePolicy } from '../../src/server/mcp/response-policy.js';
import { ContactLedger } from '../../src/server/mcp/response-policy.js';
import { CONTACT_IDLE_MS } from '../../src/server/mcp/response-policy.js';
import { deriveMode } from '../../src/server/session-mode.js';
import { AGENT_IDLE_MS } from '../../src/server/session-mode.js';
import { AGENT_CONDUCT } from '../../src/shared/philosophy.js';
import { MISSION } from '../../src/shared/philosophy.js';
import { MODE_GUIDANCE } from '../../src/shared/philosophy.js';
import { RHYTHM_NUDGE } from '../../src/shared/philosophy.js';
import { safeError } from '../../src/server/mcp/results.js';
import { collapseRepeatedIssues } from '../../src/server/input-errors.js';
import { needsTemplate } from '../../src/server/needs-template.js';
import { FACT_CONTEXT_MAX } from '../../src/server/needs-template.js';
import { limitMessage } from '../../src/server/usage-limits.js';
import { derivedViewLabel } from '../../src/shared/view-label.js';
import { personLabel } from '../../src/shared/display-name.js';
import { safeLabel } from '../../src/shared/display-name.js';
import { displayNameUnset } from '../../src/shared/display-name.js';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical.js';
import { profileInstructions } from '../../src/server/mcp/profile-guidance.js';
import { serverIcons } from '../../src/server/mcp/index.js';
import { serverWebsiteUrl } from '../../src/server/mcp/index.js';
import { DEFAULT_WEBSITE_URL } from '../../src/server/mcp/index.js';
import { mailSenderAddress } from '../../src/server/email-signin.js';
import { manageMap } from '../../src/server/mcp/manage-map.js';
import { HELP_PAGES } from '../../src/shared/help.js';
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { fieldShape } from '../../src/server/friction.js';
import { problemClass } from '../../src/server/friction.js';
import { agentType } from '../../src/server/agents.js';
import type { ToastRecord } from '../../src/shared/viewer-experience.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';

describe("response policy coverage 1", () => {


const context={principal:{userId:'catalog-reader'}};
const search=(kind:'tool'|'template'|'help',query:string,limit=3)=>(discoveryCatalog.query(kind,'search',{query,limit},context).results as {id:string;description:string;example?:unknown}[]);

describe('0875e953 response policy and session mode (pure rules)',()=>{
 const orientation={guide:{tool:'kanvas_guide'},viewerLink:'how to connect a receiver',toolSelection:'x',recovery:'y'};
 const guidance={boundary:'b',levels:[{scope:'user',id:'user:1',text:'be proactive',revision:3}]};
 const mode={current:'live',source:'default',guidance:MODE_GUIDANCE.live,set:'kanvas.session.settings.update'};
 const run=(ledger:ContactLedger,overrides:Partial<Parameters<typeof applyResponsePolicy>[1]>={},structured:Record<string,unknown>={data:{status:'accepted',sessionId:'s1'},orientation},key='conn',at=Date.now())=>applyResponsePolicy(structured,{state:ledger.observe(key,at),context:{mode,displayConnected:true},guidance,isError:false,operation:'kanvas_submit',sessionId:'s1',...overrides}).structured!;
 it('mode is derived from observable facts and the quieter one wins',()=>{
  expect(deriveMode({templates:['chart']})).toEqual({current:'live',source:'default'});
  expect(deriveMode({templates:['presentation','chart']})).toEqual({current:'presenting',source:'template'});
  expect(deriveMode({templates:['presentation','menu-board']})).toEqual({current:'signage',source:'template'});
  expect(deriveMode({templates:['presentation'],idle:'ambient'})).toEqual({current:'ambient',source:'agent-idle'});
  expect(deriveMode({templates:['opening-hours'],idle:'ambient'})).toEqual({current:'signage',source:'template'});
  expect(deriveMode({explicit:'live',templates:['signage'],idle:'ambient'})).toEqual({current:'live',source:'explicit'});
  expect(AGENT_IDLE_MS).toBe(30*60_000);
 });});

describe('server behaviour behind the exposure reports',()=>{
 let h!:Harness,o:Browser,s:string,d:string,p:{userId:string;agentId?:string;tokenId?:string};
 beforeEach(async()=>{delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT;h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT;await h?.close();});
 const call=(name:string,args:Record<string,unknown>={},principal=p)=>h.runtime.service.execute(name,args,principal) as Promise<any>;
 /** A real connection: its token exists, so account checks pass exactly as for an MCP client. */
 const agentPrincipal=async(name:string)=>{const {token}=await h.runtime.auth.issueToken(p.userId,name,['read','publish']);return {userId:p.userId,agentId:token.agentId,tokenId:token.id};};
 it('f7374ccd / 0875e953: session.state is light by default and carries mode and the manage map',async()=>{
  for(let i=0;i<8;i++)await o.submit(s,[d],{version:1,template:'fact',data:{text:`Fact ${i}`}} as never);
  const state=await call('kanvas_session_state',{sessionId:s});
  expect(state.updates).toHaveLength(5);expect(state.counts).toMatchObject({updates:8,displays:1});expect(state.mode).toMatchObject({current:'live',source:'default',guidance:MODE_GUIDANCE.live});expect(state.manage.displays.change).toContain('kanvas.display.register');
  expect((await call('kanvas_session_state',{sessionId:s,includeUpdates:'all'})).updates).toHaveLength(8);
  // Explicit mode, without touching settings; then the deterministic default again.
  const set=await call('kanvas_config_update',{sessionId:s,mode:'signage'});expect(set.mode).toMatchObject({current:'signage',source:'explicit'});
  expect((await call('kanvas_session_state',{sessionId:s})).mode.current).toBe('signage');
  expect((await call('kanvas_config_update',{sessionId:s,mode:'auto'})).mode).toMatchObject({current:'live',source:'default'});
  await o.submit(s,[d],{version:1,template:'opening-hours',data:(await import('../../src/shared/template-examples.js')).samples['opening-hours'].data} as never);
  expect((await call('kanvas_session_state',{sessionId:s})).mode).toMatchObject({current:'signage',source:'template'});
  const created=await call('kanvas_session_create',{name:'Wall board',mode:'ambient',initialDisplay:false});expect(created.mode).toMatchObject({current:'ambient',source:'explicit'});
 });});
});
