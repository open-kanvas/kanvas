import {afterEach,expect,it} from 'vitest';
import {z} from 'zod';
import {CANONICAL_TOOLS} from '../../src/server/mcp/canonical';
import {ACTIVE_CONTEXT_HELP,guidanceContext} from '../../src/server/mcp/active-context';
import {discoveryToolDefinitions,parseDiscoveryInput} from '../../src/server/mcp/discovery';
import {startHarness,success,type Harness} from './harness';

let h:Harness|undefined;
afterEach(async()=>{await h?.close();h=undefined;});
it('concurrency prose names only actual guards and their schema optionality',()=>{
 let checked=0;const seen=new Set<string>();
 for(const tool of CANONICAL_TOOLS){
  const shape=tool.schema instanceof z.ZodObject?tool.schema.shape:undefined;
  const guards=shape?Object.keys(shape).filter(key=>/^expected(?:.*Revision(?:s)?|Version)$/.test(key)):[];
  const suffix=tool.description.split(' Concurrency: ')[1];
  if(!guards.length){expect(suffix,tool.name).toBeUndefined();continue;}
  checked++;expect(suffix,tool.name).toBeDefined();
  expect([...new Set(suffix!.match(/expected[A-Z][a-zA-Z]*/g))].sort(),tool.name).toEqual([...guards].sort());
  for(const key of guards){seen.add(key);const group=guards.filter(g=>shape![g].isOptional()===shape![key].isOptional());expect(suffix,tool.name).toContain(group.join(', ')+(group.length===1?' is ':' are ')+(shape![key].isOptional()?'OPTIONAL':'REQUIRED'));}
  expect(suffix).not.toContain('Conflicts return currentRevision');
  expect(suffix).toContain('operation-specific error');
 }
 expect(checked).toBeGreaterThan(30);
 for(const key of ['expectedRevision','expectedVersion','expectedRevisions','expectedDraftRevision','expectedDeckRevision'])expect(seen.has(key),key).toBe(true);
});
it('ordinary guidance context and read-only resolver proposals are distinguished without filling arguments',()=>{
 expect(ACTIVE_CONTEXT_HELP).toContain('For ordinary calls, context only scopes guidance');
 expect(ACTIVE_CONTEXT_HELP).toContain('Resolve may use explicitly supplied authorized context to propose session arguments');
 const input={operationId:'kanvas.display.current',arguments:{},activeContext:{sessionId:'context-session'}};
 expect(guidanceContext('kanvas_call',input)).toEqual({sessionId:'context-session'});
 expect(parseDiscoveryInput('kanvas_call',input).arguments).toEqual({});
 expect(input.arguments).toEqual({});
 const description=discoveryToolDefinitions().find(t=>t.name==='kanvas_discover')!.description!;
 expect(description).toContain('Service-scoped analytics includes recorded HTTP average duration');
 expect(description).toContain('account activity analytics counts events');
 expect(description).not.toContain('Activity and analytics operations expose recorded latency');
});
it('activity and topology responses describe indefinite storage versus the bounded read projection',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),session=await owner.session(),display=await owner.display(session.id);
 const store=h.runtime.store;
 const oldEvent={id:'old-audit-metadata',at:'2000-01-01T00:00:00.000Z',type:'test.old',actorId:owner.user!.id,sessionId:session.id,details:{}};
 await store.put('audit-event',oldEvent);
 const connection={id:'old-window',sessionId:session.id,displayId:display.id,personId:owner.user!.id,userId:owner.user!.id,guest:false,name:'Synthetic old window',deviceId:'old-device',deviceName:'Synthetic device',deviceType:'unknown',browser:'Unknown',joinedAt:'2000-01-01T00:00:00.000Z',lastSeenAt:'2000-01-01T00:00:00.000Z',connected:false};
 await store.put('connection-history',{id:'old-topology-metadata',sessionId:session.id,connection});
 const activity=success(await owner.request<any>('GET','/api/activity?sessionId='+session.id));
 expect(activity.retention).toMatchObject({days:null,maximumServiceEvents:null,mode:'indefinite'});
 expect(activity.retention.note).toContain('no automatic age or event-count pruning');
 expect(activity.entries.some((e:any)=>e.id===oldEvent.id)).toBe(true);
 const topology=success(await owner.request<any>('GET','/api/sessions/'+session.id+'/topology'));
 expect(topology.note).toContain('last 30 days');expect(topology.note).toContain('not a deletion guarantee');expect(topology.note).not.toContain('512');
 expect(topology.counts.offline).toBe(0);
 expect(await store.get('audit-event',oldEvent.id)).toEqual(oldEvent);
 expect(await store.get('connection-history','old-topology-metadata')).toEqual({id:'old-topology-metadata',sessionId:session.id,connection});
 expect((await other.request('GET','/api/activity?sessionId='+session.id)).status).not.toBe(200);
});
