import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,denied,type Harness,type Browser} from './harness.js';
import {TEMPLATE_IDS,type TemplateId} from '../../src/shared/types.js';
import {SEARCH_PROBES,TEMPLATE_CONCEPTS} from '../../src/shared/template-concepts.js';
import {collapseViewSlots,discoveryCatalog,helpCatalog,minimalExample,operationCatalog,templateCatalog,VIEW_SLOT} from '../../src/server/mcp/discovery.js';
import {LocalSearch} from '../../src/server/mcp/local-search.js';
import {templateViewSchema,validateView} from '../../src/shared/view-schemas.js';
import {applyResponsePolicy,ContactLedger,CONTACT_IDLE_MS} from '../../src/server/mcp/response-policy.js';
import {deriveMode,AGENT_IDLE_MS} from '../../src/server/session-mode.js';
import {AGENT_CONDUCT,MISSION,MODE_GUIDANCE,RHYTHM_NUDGE} from '../../src/shared/philosophy.js';
import {safeError} from '../../src/server/mcp/results.js';
import {collapseRepeatedIssues} from '../../src/server/input-errors.js';
import {needsTemplate,FACT_CONTEXT_MAX} from '../../src/server/needs-template.js';
import {limitMessage} from '../../src/server/usage-limits.js';
import {derivedViewLabel} from '../../src/shared/view-label.js';
import {personLabel,safeLabel,displayNameUnset} from '../../src/shared/display-name.js';
import {CANONICAL_TOOLS} from '../../src/server/mcp/canonical.js';
import {profileInstructions} from '../../src/server/mcp/profile-guidance.js';
import {serverIcons,serverWebsiteUrl,DEFAULT_WEBSITE_URL} from '../../src/server/mcp/index.js';
import {mailSenderAddress} from '../../src/server/email-signin.js';
import {manageMap} from '../../src/server/mcp/manage-map.js';
import {HELP_PAGES} from '../../src/shared/help.js';
import {KANVAS_VERSION} from '../../src/shared/version.js';
import {fieldShape,problemClass} from '../../src/server/friction.js';
import {agentType} from '../../src/server/agents.js';
import type {ToastRecord,ViewerPresence} from '../../src/shared/viewer-experience.js';

const context={principal:{userId:'catalog-reader'}};
const search=(kind:'tool'|'template'|'help',query:string,limit=3)=>(discoveryCatalog.query(kind,'search',{query,limit},context).results as {id:string;description:string;example?:unknown}[]);

describe('6d119fd6 / aa19719e / ffc47785 / f7374ccd: the catalog exposes the shape and the right entry',()=>{
 it('every template says when a colleague would reach for it and carries everyday concepts',()=>{
  for(const template of TEMPLATE_IDS){const concept=TEMPLATE_CONCEPTS[template];expect(concept,template).toBeTruthy();expect(concept.when.length,template).toBeGreaterThan(40);expect(concept.also.split(' ').length,template).toBeGreaterThanOrEqual(3);}
  expect(TEMPLATE_CONCEPTS.math.when).toMatch(/splitting a bill/);expect(TEMPLATE_CONCEPTS.math.when).toMatch(/Kanvas only displays/);
  expect(TEMPLATE_CONCEPTS['seat-map'].when).toMatch(/Who sits where/);
 });
 it('probe set: the right template is within the top three for everyday phrasings (no embeddings)',()=>{
  const engine=new LocalSearch(templateCatalog()),misses:string[]=[];
  for(const [query,expected] of SEARCH_PROBES){const top=engine.search(query).slice(0,3).map(row=>row.document.id.slice('kanvas.template.'.length));if(!expected.some(template=>top.includes(template)))misses.push(`${query} -> ${top.join(', ')}`);}
  // Decision rule from the report: more than 3 misses of 20 would justify a local embedding model.
  expect(SEARCH_PROBES).toHaveLength(20);expect(misses,misses.join(' | ')).toHaveLength(0);
 });
 it('search hits carry a minimal example that validates on the first try',()=>{
  const hits=search('template','ordered list of things to buy',5);expect(hits.length).toBeGreaterThan(0);
  for(const hit of hits){expect(hit.example,hit.id).toBeTruthy();expect(templateViewSchema(hit.id.slice('kanvas.template.'.length) as TemplateId).safeParse(hit.example).success,hit.id).toBe(true);}
  for(const template of TEMPLATE_IDS){const example=minimalExample(template);expect(templateViewSchema(template).safeParse(example).success,template).toBe(true);}
  const list=minimalExample('list') as {data:{items:unknown[]}};expect(JSON.stringify(list).length).toBeLessThan(500);
  const tool=search('tool','tick one checklist item',5).find(hit=>hit.id==='kanvas.checklist.update');expect(tool?.example).toMatchObject({operationId:'kanvas.checklist.update'});
 });
 it('get returns a template\'s own shape; nested view slots are a reference unless expand is full',{timeout:120_000},()=>{
  const own=discoveryCatalog.query('template','get',{id:'kanvas.template.split-screen'},context).entry as Record<string,unknown>;
  const full=discoveryCatalog.query('template','get',{id:'kanvas.template.split-screen',expand:'full'},context).entry as Record<string,unknown>;
  const ownBytes=JSON.stringify(own).length,fullBytes=JSON.stringify(full).length;
  expect(ownBytes).toBeLessThan(16_000);expect(fullBytes).toBeGreaterThan(ownBytes*4);
  expect(JSON.stringify(own.schema)).toContain(VIEW_SLOT.properties.template.description);expect(own.nestedViews).toBeTruthy();
  expect(Object.keys(own).indexOf('example')).toBeLessThan(Object.keys(own).indexOf('schema'));
  expect(JSON.stringify(discoveryCatalog.query('template','get',{id:'kanvas.template.presentation'},context).entry).length).toBeLessThan(20_000);
  // A template without nested views is unchanged by collapsing.
  const fact=discoveryCatalog.query('template','get',{id:'kanvas.template.fact'},context).entry as {schema:unknown;nestedViews?:unknown};expect(fact.nestedViews).toBeUndefined();
  expect(collapseViewSlots({type:'object',properties:{a:{type:'string'}}})).toEqual({type:'object',properties:{a:{type:'string'}}});
 });
 it('register is findable as create, add, new and second screen; list filters by prefix',()=>{
  for(const query of ['display create','add a second display to the session','new display','another screen','put this on a second screen'])expect(search('tool',query,3).map(hit=>hit.id),query).toContain('kanvas.display.register');
  const listed=discoveryCatalog.query('tool','list',{prefix:'kanvas.display.'},context).results as {id:string}[];
  expect(listed.map(x=>x.id)).toContain('kanvas.display.register');expect(listed.every(x=>x.id.startsWith('kanvas.display.'))).toBe(true);
  expect(search('help','multiple displays',3)[0].id).toBe('kanvas.help.displays');expect(search('help','two screens',3).map(hit=>hit.id)).toContain('kanvas.help.displays');
  expect(manageMap().displays.change).toContain('kanvas.display.register');
 });
 it('what is kanvas / how do I use this / philosophy / design land on the philosophy entries',()=>{
  for(const query of ['what is kanvas','how do I use this','what can you show','philosophy'])expect(search('help',query,2)[0].id,query).toBe('kanvas.help.philosophy');
  for(const query of ['design principles for custom html','style look theme css'])expect(search('help',query,3).map(hit=>hit.id),query).toContain('kanvas.help.design-philosophy');
  expect(HELP_PAGES.philosophy.steps[0]).toBe(MISSION[0]);expect(MISSION[0].startsWith('Kanvas is your agent\'s screen.')).toBe(true);expect(MISSION[2]).toContain('with the shortest time to clarity.');
  expect(HELP_PAGES['design-philosophy'].steps.join(' ')).toMatch(/never navigation chrome/);expect(HELP_PAGES['design-philosophy'].steps.join(' ')).toMatch(/never override an explicit request/);
  expect(profileInstructions('discovery').startsWith(AGENT_CONDUCT)).toBe(true);
  expect(helpCatalog().some(item=>item.id==='kanvas.help.manage')).toBe(true);
 });
 it('7dcd018f: no description or help text offers a feedback category',()=>{
  const feedback=CANONICAL_TOOLS.find(tool=>tool.name==='kanvas_feedback_submit')!;
  expect(feedback.description).not.toMatch(/Category:/);expect(feedback.description).not.toMatch(/usability, feature, quality/);expect(feedback.description).toMatch(/Bugs are filed with/);
  const everything=[...operationCatalog(),...helpCatalog()].map(item=>`${item.summary} ${item.text??''}`).join(' ');expect(everything).not.toMatch(/Category: usability/);
 });
 it('error text names the expected format or the allowed values, and collapses repeats',async()=>{
  let planner:unknown;try{validateView({template:'planner',data:{view:'day',date:'2026-11-10',timeZone:'Europe/Oslo',items:Array.from({length:9},(_,i)=>({id:`i${i}`,title:`Item ${i}`,start:'09:00',end:'10:00'}))}});}catch(error){planner=error;}
  const issues=safeError(planner).issues??[];
  expect(issues.length).toBeLessThan(9);const first=issues.find(issue=>/ISO date-time with offset/.test(issue.problem));expect(first,JSON.stringify(issues).slice(0,600)).toBeTruthy();expect(first!.problem).toMatch(/fields share this problem; first: /);expect(first!.count).toBeGreaterThanOrEqual(9);
  expect(collapseRepeatedIssues([{path:'a',problem:'P'},{path:'b',problem:'P'}])).toHaveLength(2);
  expect(collapseRepeatedIssues(Array.from({length:27},(_,i)=>({path:`items[${i}].start`,problem:'Expected ISO.'})))).toEqual([expect.objectContaining({path:'items[0].start',count:27})]);
 });
});

describe('0875e953 response policy and session mode (pure rules)',()=>{
 const orientation={guide:{tool:'kanvas_guide'},viewerLink:'how to connect a receiver',toolSelection:'x',recovery:'y'};
 const guidance={boundary:'b',levels:[{scope:'user',id:'user:1',text:'be proactive',revision:3}]};
 const mode={current:'live',source:'default',guidance:MODE_GUIDANCE.live,set:'kanvas.session.settings.update'};
 const run=(ledger:ContactLedger,overrides:Partial<Parameters<typeof applyResponsePolicy>[1]>={},structured:Record<string,unknown>={data:{status:'accepted',sessionId:'s1'},orientation},key='conn',at=Date.now())=>applyResponsePolicy(structured,{state:ledger.observe(key,at),context:{mode,displayConnected:true},guidance,isError:false,operation:'kanvas_submit',sessionId:'s1',...overrides}).structured!;
 it('first contact carries the purpose, full guidance and full orientation; later calls carry a pointer',()=>{
  const ledger=new ContactLedger(),first=run(ledger);
  expect(first.firstContact).toMatchObject({purpose:AGENT_CONDUCT,rules:expect.any(Array),help:expect.objectContaining({philosophy:'kanvas.help.philosophy'})});
  expect((first.agentGuidance as {levels:unknown[]}).levels).toHaveLength(1);expect(first.orientation).toEqual(orientation);expect(first.rhythm).toBe(RHYTHM_NUDGE);
  const second=run(ledger);
  expect(second.firstContact).toBeUndefined();expect(second.agentGuidance).toMatchObject({unchanged:true,mode:'live'});expect(second.orientation).toEqual({guide:orientation.guide,help:'kanvas.help.getting-started.steps'});expect(second.rhythm).toBeUndefined();
  expect(JSON.stringify(second).length).toBeLessThan(JSON.stringify(first).length/2);
  // The rhythm line is said once per session, again for another session.
  expect(run(ledger,{sessionId:'s2'},{data:{status:'accepted',sessionId:'s2'},orientation}).rhythm).toBe(RHYTHM_NUDGE);
 });
 it('guidance returns in full when its revision or the mode changes, and never in between',()=>{
  const ledger=new ContactLedger();run(ledger);expect(run(ledger).agentGuidance).toMatchObject({unchanged:true});
  const revised=run(ledger,{guidance:{...guidance,levels:[{...guidance.levels[0],revision:4}]}});expect(revised.agentGuidance).toMatchObject({changed:true});expect((revised.agentGuidance as {levels:unknown[]}).levels).toHaveLength(1);
  const quieter=run(ledger,{guidance:{...guidance,levels:[{...guidance.levels[0],revision:4}]},context:{mode:{...mode,current:'signage',guidance:MODE_GUIDANCE.signage},displayConnected:true}});
  expect(quieter.agentGuidance).toMatchObject({changed:true,mode:{current:'signage'}});
 });
 it('orientation returns on errors, a missing target and a session with no connected display',()=>{
  const ledger=new ContactLedger();run(ledger);
  expect(run(ledger,{isError:true},{error:{code:'INVALID_ARGUMENT'},orientation}).orientation).toEqual(orientation);
  expect(run(ledger,{},{data:{status:'needs_target'},orientation}).orientation).toMatchObject({viewerLink:orientation.viewerLink});
  expect(run(ledger,{context:{mode,displayConnected:false}}).orientation).toMatchObject({viewerLink:orientation.viewerLink});
  expect(run(ledger).orientation).not.toHaveProperty('viewerLink');
 });
 it('a declared full preference keeps every block; a long silence is a new contact; the ledger is bounded',()=>{
  const ledger=new ContactLedger();run(ledger,{context:{mode,displayConnected:true,preference:'full'}});
  const again=run(ledger,{context:{mode,displayConnected:true,preference:'full'}});expect(again.orientation).toEqual(orientation);expect((again.agentGuidance as {levels:unknown[]}).levels).toHaveLength(1);
  const start=Date.now(),idle=new ContactLedger();run(idle,{},undefined,'k',start);expect(run(idle,{},undefined,'k',start+CONTACT_IDLE_MS+1).firstContact).toBeTruthy();
  for(let i=0;i<5200;i++)idle.observe(`k${i}`);expect(idle.observe('k0').first).toBe(true);
 });
 it('mode is derived from observable facts and the quieter one wins',()=>{
  expect(deriveMode({templates:['chart']})).toEqual({current:'live',source:'default'});
  expect(deriveMode({templates:['presentation','chart']})).toEqual({current:'presenting',source:'template'});
  expect(deriveMode({templates:['presentation','menu-board']})).toEqual({current:'signage',source:'template'});
  expect(deriveMode({templates:['presentation'],idle:'ambient'})).toEqual({current:'ambient',source:'agent-idle'});
  expect(deriveMode({templates:['opening-hours'],idle:'ambient'})).toEqual({current:'signage',source:'template'});
  expect(deriveMode({explicit:'live',templates:['signage'],idle:'ambient'})).toEqual({current:'live',source:'explicit'});
  expect(AGENT_IDLE_MS).toBe(30*60_000);
 });
});

describe('server behaviour behind the exposure reports',()=>{
 let h:Harness,o:Browser,s:string,d:string,p:{userId:string;agentId?:string;tokenId?:string};
 beforeEach(async()=>{delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT;h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT;await h?.close();});
 const call=(name:string,args:Record<string,unknown>={},principal=p)=>h.runtime.service.execute(name,args,principal) as Promise<any>;
 /** A real connection: its token exists, so account checks pass exactly as for an MCP client. */
 const agentPrincipal=async(name:string)=>{const {token}=await h.runtime.auth.issueToken(p.userId,name,['read','publish']);return {userId:p.userId,agentId:token.agentId,tokenId:token.id};};
 it('6d119fd6: long prose without a template returns needs_template and publishes nothing; a short sentence is still a fact',async()=>{
  const prose='Show the four phases of how an agent uses Kanvas as a flow, left to right. First the agent discovers the templates. Then it publishes a view. Then the person reacts. Finally the agent patches the view in place.';
  expect(prose.length).toBeGreaterThan(FACT_CONTEXT_MAX);expect(needsTemplate({context:prose})).toBe(true);expect(needsTemplate({context:prose,templateHint:'fact'})).toBe(false);expect(needsTemplate({context:'Short sentence.'})).toBe(false);
  const before=(await o.detail(s)).displays[0].revision;
  const result=await call('kanvas_submit',{requestId:randomUUID(),sessionId:s,displayIds:[d],intent:'four phases as a left to right flow diagram',context:prose});
  expect(result).toMatchObject({status:'needs_template',published:false});expect(result.candidates).toHaveLength(3);expect(result.candidates.map((c:{template:string})=>c.template)).toContain('flowchart');
  for(const candidate of result.candidates)expect(templateViewSchema(candidate.template).safeParse(candidate.example).success,candidate.template).toBe(true);
  const after=(await o.detail(s)).displays[0];expect(after.revision).toBe(before);expect(after.view).toBeNull();
  const short=await call('kanvas_submit',{requestId:randomUUID(),sessionId:s,displayIds:[d],context:'Kanvas is your agent\'s screen.'});expect(short.status).not.toBe('needs_template');
 });
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
 });
 it('0875e953: an agent absent for longer than the idle window finds the session in ambient mode',async()=>{
  const agent=await agentPrincipal('Idle agent');
  expect((await h.runtime.service.responseContext(agent,{sessionId:s},'conn-a')).mode).toMatchObject({current:'live'});
  const record=(await h.runtime.store.get<{agentSeenAt:string}>('session-mode',s))!;
  await h.runtime.store.put('session-mode',{...record,agentSeenAt:new Date(Date.now()-AGENT_IDLE_MS-60_000).toISOString()} as never);
  // Nobody is watching: the absence alone changes nothing.
  expect((await h.runtime.service.responseContext(agent,{sessionId:s},'conn-a')).mode).toMatchObject({current:'live'});
  await h.runtime.store.put('session-mode',{...record,agentSeenAt:new Date(Date.now()-AGENT_IDLE_MS-60_000).toISOString()} as never);
  const controller=new AbortController();const stream=await o.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=wall`,{}, {signal:controller.signal});expect(stream.status).toBe(200);
  const context=await h.runtime.service.responseContext(agent,{sessionId:s},'conn-a');
  expect(context.mode).toMatchObject({current:'ambient',source:'agent-idle'});expect(context.displayConnected).toBe(true);expect(context.preference).toBe('concise');
  // It stays ambient for the next call too, until someone says otherwise.
  expect((await h.runtime.service.responseContext(agent,{sessionId:s},'conn-a')).mode?.current).toBe('ambient');
  await h.runtime.service.execute('kanvas_client_context_update',{sessionId:s,clientDetails:{guidance:'full'}},agent);
  controller.abort();
 });
 it('43bcc861: limit errors name the limit, the usage and what can be done, from the enforcing values',async()=>{
  const usage=await h.runtime.service.sessionUsage(p.userId);expect(usage.limit).toBe(10);
  process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT=String(usage.active+1);
  const extra=await h.runtime.service.createSession(p,'Fills the last slot');
  let refused:unknown;try{await h.runtime.service.createSession(p,'One too many');}catch(error){refused=error;}
  const error=safeError(refused),limit=usage.active+1;
  expect(error.code).toBe('SESSION_LIMIT_REACHED');expect(error.limit).toMatchObject({limit,used:limit,resource:'sessions',paidPlans:false,contact:'kanvas@open-kanvas.ai'});
  expect(error.message).toBe(`You've reached the free limit of ${limit} sessions on this account, so a new session can't be created. You can keep using your existing sessions, or archive one you no longer need to free up a slot. Need more? Paid plans aren't available yet. Email kanvas@open-kanvas.ai to request a higher limit.`);
  expect(limitMessage('SESSION_LIMIT_REACHED',20)).toContain('free limit of 20 sessions');expect(limitMessage('VIEW_LIMIT_REACHED',1000)).toMatch(/free limit of 1000 views in this session/);
  // Archiving really frees the slot the message promises; restoring takes one again.
  await call('kanvas_archive_manage',{action:'archive',resource:'session',sessionId:extra.id});
  const replacement=await h.runtime.service.createSession(p,'Fits after archiving');expect(replacement.id).toBeTruthy();
  let restore:unknown;try{await call('kanvas_archive_manage',{action:'restore',resource:'session',sessionId:extra.id});}catch(error){restore=error;}expect(safeError(restore).code).toBe('SESSION_LIMIT_REACHED');
  // REST callers get the same structured answer.
  const rest=await o.request('POST','/api/sessions',{name:'Browser attempt',initialDisplay:false});expect(rest.status).toBe(429);expect((rest.error as {limit?:{used:number}}).limit?.used).toBe(limit);
 });
 it('43bcc861: the automatically created Home session does not use a slot (the "limit at 9" report)',async()=>{
  const before=await h.runtime.service.sessionUsage(p.userId);
  const entries=await h.runtime.store.list<{sessionId?:string}>('account-entry');
  const visible=(await h.runtime.service.sessions(p)).filter(session=>session.ownerId===p.userId).length;
  expect(before.active).toBe(visible-entries.filter(e=>e.sessionId).length);
 });
 it('684bd79e: a person is shown by name or the part before the @, never by email, and a profile change shows at once',async()=>{
  expect(personLabel({displayName:'oystein.sandvik@example.org',username:'oystein.sandvik@example.org'})).toBe('oystein.sandvik');expect(personLabel({displayName:'Øystein',username:'o@example.org'})).toBe('Øystein');
  expect(safeLabel('someone@example.org')).toBe('someone');expect(displayNameUnset({displayName:'a@b.no',username:'a@b.no'})).toBe(true);expect(displayNameUnset({displayName:'Anna',username:'a@b.no'})).toBe(false);
  await h.runtime.store.db.prepare('UPDATE users SET username=?,display_name=? WHERE id=?').run('new.person@example.org','new.person@example.org',o.user!.id);
  expect(await h.runtime.auth.user(o.user!.id)).toMatchObject({displayName:'new.person'});expect(await h.runtime.auth.displayNameSet(o.user!.id)).toBe(false);
  expect((await h.runtime.service.responseContext(p,{},'c')).displayNameHint).toMatch(/no display name yet/);
  const controller=new AbortController();await o.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=tv`,{}, {signal:controller.signal});
  const names=async()=>success(await o.request<ViewerPresence[]>('GET',`/api/sessions/${s}/viewers`)).map(v=>v.name);
  expect(await names()).toEqual(['new.person']);
  const notices=success(await o.request<ToastRecord[]>('GET','/api/account/notices'));expect(JSON.stringify(notices)).not.toContain('@example.org');expect(notices.some(n=>n.text.startsWith('new.person connected'))).toBe(true);
  await call('kanvas_profile_update',{displayName:'Øystein'});
  // Same connection, no reconnect: the name is resolved at read time.
  expect(await names()).toEqual(['Øystein']);expect((await h.runtime.service.responseContext(p,{},'c')).displayNameHint).toBeUndefined();
  controller.abort();
 });
 it('1668dad7: the agent\'s own procedure control is not pending viewer input; untitled entries get a label',async()=>{
  await o.submit(s,[d],{version:1,template:'procedure',data:{name:'Setup',steps:['Unpack','Plug in','Switch on']}} as never);
  await call('kanvas_procedure_control',{sessionId:s,displayId:d,action:'start',requestId:randomUUID()});
  await call('kanvas_procedure_control',{sessionId:s,displayId:d,action:'next',requestId:randomUUID()});
  expect((await call('kanvas_interactions_read',{sessionId:s})).interactions).toEqual([]);
  const all=(await call('kanvas_interactions_read',{sessionId:s,status:'all'})).interactions;expect(all.length).toBeGreaterThanOrEqual(2);expect(all.every((i:{source?:string;status:string})=>i.source==='agent'&&i.status==='acknowledged')).toBe(true);
  expect(derivedViewLabel({template:'poll',data:{question:'Which tempo matters most to you this quarter?',options:[]}} as never)).toBe('poll: Which tempo matters most to you this qu…');
  expect(derivedViewLabel({template:'quote',data:{text:'Make room for the idea.'}} as never)).toBe('quote: Make room for the idea.');
  expect(derivedViewLabel({template:'drafting',data:{text:'Dear team,\nSecond line'}} as never)).toBe('drafting: Dear team,');
  expect(derivedViewLabel({template:'quote',title:'Already titled',data:{text:'x'}} as never)).toBeUndefined();
  await o.submit(s,[d],{version:1,template:'quote',data:{text:'Make room for the idea.',attribution:'Kanvas'}} as never);
  const history=await call('kanvas_display_history',{sessionId:s,displayId:d});expect(history.entries.at(-1).title).toBe('quote: Make room for the idea.');expect(history.entries.every((e:{title?:string|null;template:string|null})=>!e.template||e.title)).toBe(true);
  const pin=await call('kanvas_pin_save',{sessionId:s,displayId:d,label:'keep',requestId:randomUUID()});expect(pin.title).toBe('quote: Make room for the idea.');
  expect((await call('kanvas_pins_read',{sessionId:s,displayId:d}))[0]).toMatchObject({title:'quote: Make room for the idea.',template:'quote'});
 });
 it('843a384e: friction is counted as shapes only and read by service administrators',async()=>{
  expect(fieldShape('items[3].start')).toBe('items[].start');expect(problemClass('Unsupported field.')).toBe('unsupported-field');expect(problemClass('Required string; received missing.',{received:'missing'})).toBe('missing-required');expect(problemClass('Expected ISO 8601 date-time with a UTC offset, e.g. x.')).toBe('format');expect(problemClass('op must be one of: set, remove.')).toBe('enum-mismatch');
  const friction=h.runtime.service.friction,client={name:'Anthropic/ClaudeAI',version:'1.0.0'},secret='PRIVATE-VALUE-7731';
  friction.record({operation:'kanvas_submit',template:'list',client,connection:'c1',ok:false,issues:[{path:'view.data.items[0].title',problem:'Unsupported field.'},{path:'view.data.items[1].title',problem:'Unsupported field.'}],status:'INVALID_ARGUMENT',responseBytes:900});
  friction.record({operation:'kanvas_discover',client,connection:'c1',ok:true,discovery:'search'});friction.record({operation:'kanvas_discover',client,connection:'c1',ok:true,discovery:'get'});
  friction.record({operation:'kanvas_submit',template:'list',client,connection:'c1',ok:true,status:'accepted',responseBytes:70_000});
  friction.record({client,connection:'c1',ok:true,discovery:'resolve',resolveStatus:'unsupported'});
  friction.record({operation:`kanvas_${secret}`,template:secret,client:{name:secret},connection:'c2',ok:false,issues:[{path:`items[0].${secret}`,problem:secret}]});
  await expect(call('kanvas_friction_read',{kind:'validation'})).rejects.toMatchObject({code:'FORBIDDEN'});
  h.runtime.service.accounts.serviceAdmins.add(p.userId);
  const validation=await call('kanvas_friction_read',{kind:'validation',days:1});
  expect(validation.entries[0]).toMatchObject({subject:'template:list',fieldPath:'view.data.items[].title',problem:'unsupported-field',count:2,clients:{'Anthropic/ClaudeAI 1.0.0':2}});
  expect((await call('kanvas_friction_read',{kind:'retries',days:1})).entries[0]).toMatchObject({subject:'template:list',median:2,max:2});
  expect((await call('kanvas_friction_read',{kind:'discovery',days:1})).entries[0]).toMatchObject({subject:'template:list',median:2});
  expect((await call('kanvas_friction_read',{kind:'resolve',days:1})).entries[0]).toMatchObject({outcome:'unsupported',count:1});
  const weight=(await call('kanvas_friction_read',{kind:'weight',days:1})).entries.find((e:{subject:string})=>e.subject==='operation:kanvas_submit');expect(weight.p95Bytes).toBe(131072);expect(weight.maxBytes).toBe(70_000);
  // Only names, classes and numbers are stored: day, kind, subject, detail, client, count, sum, max.
  const stored=await h.runtime.store.list<Record<string,unknown>>('friction-day');expect(stored.length).toBeGreaterThan(4);
  for(const row of stored)expect(Object.keys(row).sort()).toEqual(['client','count','day','detail','id','kind','max','subject','sum']);
  expect(JSON.stringify(stored)).not.toContain(p.userId);expect(JSON.stringify(stored)).not.toContain(s);
 });
 it('d630abcc: agents are recognised from connection data, scoped to the account, and can be revoked by another agent',async()=>{
  expect(agentType('Anthropic/ClaudeAI','Claude-User')).toBe('Claude.ai');expect(agentType('openai-mcp','openai-mcp/1.0.0')).toBe('ChatGPT');expect(agentType('openai-mcp (Codex)','')).toBe('Codex');expect(agentType('connectors-manager','grok-connectors-manager/0.1.0')).toBe('Grok');expect(agentType('claude-code','claude-cli/2.1.319')).toBe('Claude Code');expect(agentType('my-tool','curl/8')).toBe('Custom agent');
  await h.runtime.auth.issueToken(p.userId,'Phone agent',['read','publish']);
  const stored=(await h.runtime.store.list<{id:string;agentId:string;userId:string;name:string}>('token')).find(token=>token.userId===p.userId&&token.name==='Phone agent')!;
  const claude=await agentPrincipal('Claude agent'),codex={userId:p.userId,agentId:stored.agentId,tokenId:stored.id};
  const invoke=(principal:typeof claude,canonical:string,clientName:string,userAgent:string,sessionId?:string,createdSession?:boolean)=>h.runtime.service.recordToolCall(principal,{id:randomUUID(),tool:'kanvas_call',operation:canonical,canonical,sessionId,...(createdSession?{createdSession}:{}),timestamp:new Date().toISOString(),status:'completed',durationMs:5,clientContext:{clientName,clientVersion:'1.0.0',userAgent}});
  await invoke(claude,'kanvas_session_create','Anthropic/ClaudeAI','Claude-User',s);await invoke(claude,'kanvas_submit','Anthropic/ClaudeAI','Claude-User',s);
  await invoke(codex,'kanvas_submit','openai-mcp (Codex)','openai-mcp/1.0.0',s);
  const list=await call('kanvas_agents_read',{},claude);
  expect(list.agents.map((a:{name:string})=>a.name).sort()).toEqual(['Claude.ai','Codex']);
  const mine=list.agents.find((a:{thisConnection?:boolean})=>a.thisConnection);expect(mine).toMatchObject({name:'Claude.ai',connectedNow:true,sessionCount:1,lastSession:'Acceptance session'});
  expect(validateView(list.view).template).toBe('agents');
  const detail=await call('kanvas_agents_read',{agentId:mine.agentId},claude);expect(detail.agent.sessions[0]).toMatchObject({sessionId:s,created:true});expect(detail.agent.log.map((l:{kind:string})=>l.kind)).toEqual(['published a view','created a session']);
  // Session overview names the creating agent from the connection. Another agent that merely publishes into the
  // session moments later did not create it; a first publish whose result says it made the session did.
  const {accountOverview}=await import('../../src/server/account-overview.js');
  const overview=async(id:string)=>(await accountOverview(h.runtime.service,p)).sessions.find((x:{id:string})=>x.id===id) as {createdBy?:string};
  expect(await overview(s)).toMatchObject({createdBy:'Claude.ai'});
  const byHand=(await o.session()).id;
  await invoke(codex,'kanvas_submit','openai-mcp (Codex)','openai-mcp/1.0.0',byHand);
  expect((await overview(byHand)).createdBy).toBeUndefined();
  const implicit=(await o.session()).id;
  await invoke(codex,'kanvas_submit','openai-mcp (Codex)','openai-mcp/1.0.0',implicit,true);
  expect(await overview(implicit)).toMatchObject({createdBy:'Codex'});
  // Another account sees none of this.
  const other=await h.account();expect((await call('kanvas_agents_read',{}, {userId:other.user!.id})).agents).toEqual([]);
  await expect(call('kanvas_agents_read',{agentId:mine.agentId},{userId:other.user!.id})).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(call('kanvas_agents_revoke',{agentId:mine.agentId,confirm:true},claude)).rejects.toMatchObject({status:409});
  const target=list.agents.find((a:{name:string})=>a.name==='Codex');
  await expect(call('kanvas_agents_revoke',{agentId:target.agentId,confirm:true},{userId:other.user!.id})).rejects.toMatchObject({code:'NOT_FOUND'});
  expect(await call('kanvas_agents_revoke',{agentId:target.agentId,confirm:true},claude)).toMatchObject({revoked:true});
  expect((await h.runtime.store.get<{revoked?:boolean}>('token',stored.id))?.revoked).toBe(true);
  expect((await call('kanvas_agents_read',{},claude)).agents.find((a:{name:string})=>a.name==='Codex')).toMatchObject({access:'revoked-or-expired',connectedNow:false});
 });
 it('8f4962dc / e2573eca / aef9fccb: connector identity and sender address come from configuration',()=>{
  const icons=serverIcons('https://kanvas.example');
  expect(icons.map(icon=>icon.sizes[0])).toEqual(['48x48','192x192','512x512','any']);expect(icons.every(icon=>icon.src.startsWith('https://kanvas.example/')&&icon.src.endsWith(`?v=${KANVAS_VERSION}`))).toBe(true);expect(icons.filter(icon=>icon.mimeType==='image/png')).toHaveLength(3);
  expect(serverWebsiteUrl(undefined)).toBe(DEFAULT_WEBSITE_URL);expect(serverWebsiteUrl('https://example.org/')).toBe('https://example.org');expect(serverWebsiteUrl('')).toBeUndefined();expect(serverWebsiteUrl(false)).toBeUndefined();expect(serverWebsiteUrl('http://insecure.example')).toBeUndefined();expect(serverWebsiteUrl('javascript:alert(1)')).toBeUndefined();
  expect(KANVAS_VERSION).toBe('0.38.0');
  expect(mailSenderAddress('KANVAS <noreply@example.com>')).toBe('noreply@example.com');expect(mailSenderAddress('kanvas@open-kanvas.ai')).toBe('kanvas@open-kanvas.ai');expect(mailSenderAddress('not an address')).toBeUndefined();expect(mailSenderAddress(undefined)).toBeUndefined();
 });
});
