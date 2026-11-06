import {randomBytes,randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import {afterEach,describe,expect,it} from 'vitest';
import {createApp} from '../../src/server/app.js';
import {parseJsonTree} from '../../src/shared/connection-views.js';
import {validateView} from '../../src/shared/view-schemas.js';
import type {AccountGroup,SessionTopology} from '../../src/shared/accounts.js';
import {hash} from '../../src/server/auth.js';
import {startHarness,success,denied,PNG,fact,type Harness,type Browser} from './harness.js';

let h:Harness;
afterEach(async()=>{await h?.close();});
const photo={mimeType:'image/png',base64:PNG};
const principal=async (a:Browser)=>{const s=(await h.runtime.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response));return {userId:a.user!.id,browserId:s.id};};
async function group(a:Browser,kind:'organization'|'team'='team',organizationIds:string[]=[]){
  return success(await a.request<any>('POST','/api/groups',{kind,name:kind+' '+randomUUID().slice(0,6),organizationIds,requestId:randomUUID()}));
}
async function member(a:Browser,g:AccountGroup,b:Browser,role:'member'|'admin'|null){
  return success(await a.request<any>('POST','/api/groups/'+g.id+'/members',{expectedRevision:g.revision,username:b.user!.username,role}));
}
async function grant(a:Browser,sessionId:string,groupId:string,role:'viewer'|'editor'|null,expectedRevision=0){
  return success(await a.request<any>('POST','/api/sessions/'+sessionId+'/group-access',{groupId,role,expectedRevision}));
}

describe('independent account groups and live session grants',()=>{
  it('supports cross-organization teams, explicit membership, retry-safe creation and owner/admin boundaries',async()=>{
    h=await startHarness();const owner=await h.account(),admin=await h.account(),person=await h.account(),outsider=await h.account();
    const org1=await group(owner,'organization'),org2=await group(owner,'organization'),requestId=randomUUID();
    let team=success(await owner.request<any>('POST','/api/groups',{kind:'team',name:'Cross-org research',organizationIds:[org1.id,org2.id],requestId}));
    const replay=success(await owner.request<any>('POST','/api/groups',{kind:'team',name:'Cross-org research',organizationIds:[org1.id,org2.id],requestId}));expect(replay.id).toBe(team.id);
    expect((await owner.request('POST','/api/groups',{kind:'team',name:'Different request',requestId})).status).toBe(409);
    team=await member(owner,team,admin,'admin');team=await member(admin,team,person,'member');
    expect(team.members).toHaveLength(3);expect(success(await person.request<any>('GET','/api/groups')).groups.map((x:any)=>x.id)).toEqual([team.id]);
    denied(await person.request('PATCH','/api/groups/'+team.id,{expectedRevision:team.revision,name:'Not authorized'}));
    denied(await outsider.request('GET','/api/groups/'+team.id));
    denied(await admin.request('POST','/api/groups/'+team.id+'/members',{expectedRevision:team.revision,username:person.user!.username,role:'admin'}));
    expect((await owner.request('POST','/api/groups/'+team.id+'/members',{expectedRevision:team.revision,username:owner.user!.username,role:null})).status).toBe(400);
    const changed=success(await admin.request<any>('PATCH','/api/groups/'+team.id,{expectedRevision:team.revision,organizationIds:[org1.id,org2.id],description:'Existing links can be preserved by the team administrator.'}));
    expect(changed.organizationIds).toEqual([org1.id,org2.id]);
    denied(await admin.request('POST','/api/groups',{kind:'team',name:'Unapproved link',organizationIds:[org1.id],requestId:randomUUID()}));
  });
  it('evaluates inherited roles on every use and does not copy group members into session membership',async()=>{
    h=await startHarness();const owner=await h.account(),person=await h.account(),s=await owner.session(),d=await owner.display(s.id);let team=await group(owner);
    team=await member(owner,team,person,'member');denied(await person.request('GET','/api/sessions/'+s.id));
    const inherited=await grant(owner,s.id,team.id,'viewer');expect((await person.detail(s.id)).session.role).toBe('viewer');
    denied(await person.request('POST','/api/sessions/'+s.id+'/displays',{name:'No editor access',width:800,height:600}));
    expect((await h.runtime.store.db.prepare('SELECT * FROM members WHERE session_id=? AND user_id=?').get(s.id,person.user!.id))).toBeUndefined();
    const changed=await grant(owner,s.id,team.id,'editor',inherited.revision);const published=await person.submit(s.id,[d.id],fact('Inherited editor is authorized'));expect(published.update.status).toBe('prepared');
    await member(owner,team,person,null);denied(await person.request('GET','/api/sessions/'+s.id));
    const trail=success(await owner.request<any>('GET','/api/activity?sessionId='+s.id)).entries;
    expect(trail.filter((e:any)=>e.type==='session.group-access.changed').map((e:any)=>e.details.after)).toEqual(['editor','viewer']);
    expect(trail.find((e:any)=>e.type==='session.group-access.changed')).toMatchObject({actorId:owner.user!.id,actorName:owner.user!.displayName,groupId:team.id});
    await grant(owner,s.id,team.id,null,changed.revision);
    expect((await owner.request('POST','/api/sessions/'+s.id+'/group-access',{groupId:team.id,role:'viewer',expectedRevision:0})).status).toBe(409);
  });
  it('retains separately granted individual access after a group revocation and respects session-limited OAuth',async()=>{
    h=await startHarness();const owner=await h.account(),person=await h.account(),s=await owner.session(),other=await owner.session();let team=await group(owner);team=await member(owner,team,person,'member');
    await grant(owner,other.id,team.id,'viewer');const g=await grant(owner,s.id,team.id,'editor');
    success(await owner.request('POST','/api/sessions/'+s.id+'/members',{username:person.user!.username,role:'viewer'}));
    const token=(await h.runtime.auth.issueToken(person.user!.id,'Selected history',['read','publish'],[s.id]));
    const p=(await h.runtime.auth.authorize({get:()=> 'Bearer '+token.value} as unknown as Request));
    expect((await h.runtime.service.sessions(p)).map(x=>x.id)).toEqual([s.id]);
    (await expect((async ()=>(await h.runtime.service.accounts.list(p)))()).rejects.toThrow(/account-wide/));
    (await expect((async ()=>(await h.runtime.service.accounts.activity(p,{sessionId:other.id})))()).rejects.toThrow(/unavailable/));
    expect((await h.runtime.service.accounts.activity(p,{})).entries.every(e=>e.sessionId===s.id)).toBe(true);
    await grant(owner,s.id,team.id,null,g.revision);expect((await h.runtime.service.access(p,s.id)).role).toBe('viewer');
    (await expect((async ()=>(await h.runtime.service.accounts.grant(p,{sessionId:s.id,groupId:team.id,expectedRevision:2,role:'editor'})))()).rejects.toThrow());
    success(await owner.request('DELETE','/api/sessions/'+s.id+'/members/'+person.user!.id));
    expect((await h.runtime.service.accounts.activity(p,{})).entries).toEqual([]);
  });
  it('layers organization, team, personal and session settings without turning appearance into an access grant',async()=>{
    h=await startHarness();const owner=await h.account(),person=await h.account(),s=await owner.session();let org=await group(owner,'organization'),team=await group(owner);
    team=await member(owner,team,person,'member');
    org=success(await owner.request<any>('PATCH','/api/groups/'+org.id,{expectedRevision:org.revision,defaults:{theme:'light',accent:'#112233'},branding:{palette:['#112233'],logo:photo}}));
    team=success(await owner.request<any>('PATCH','/api/groups/'+team.id,{expectedRevision:team.revision,defaults:{readingFontSize:28},branding:{palette:['#445566']}}));
    const c=success(await owner.request<any>('POST','/api/sessions/'+s.id+'/context',{expectedRevision:0,organizationId:org.id,teamId:team.id,overrides:{},showBranding:true}));
    denied(await person.request('GET','/api/sessions/'+s.id));expect(c.effective).toMatchObject({theme:'light',readingFontSize:28,accent:'#112233',branding:{name:team.name}});
    success(await owner.request('PATCH','/api/preferences',{expectedRevision:0,config:{theme:'dark'}}));
    const effective=(await owner.detail(s.id)).session.config;expect(effective).toMatchObject({theme:'dark',readingFontSize:28,accent:'#112233'});
    success(await owner.request('POST','/api/sessions/'+s.id+'/context',{expectedRevision:1,overrides:{theme:'system'},showBranding:false}));
    const after=(await owner.detail(s.id)).session;expect(after.config.theme).toBe('system');expect(after.config.branding).toBeUndefined();
    const raw=(await h.runtime.store.get<any>('session',s.id)).config;
    (await h.runtime.service.renameSession((await principal(owner)),s.id,after.configRevision,'No inherited config copied'));
    expect((await h.runtime.store.get<any>('session',s.id)).config).toEqual(raw);
    await grant(owner,s.id,team.id,'viewer');expect((await person.detail(s.id)).session.config.theme).toBe('system');
    (await h.runtime.service.end((await principal(owner)),s.id));expect((await h.runtime.store.get<any>('session',s.id)).config).toEqual(raw);
    expect(success(await owner.request<any>('GET','/api/activity?sessionId='+s.id)).entries.some((e:any)=>e.type==='session.ended')).toBe(true);
  });
});

describe('profile images, scoped history and protected service analytics',()=>{
  it('keeps profile images private until shared, validates raster bytes and removes replaced assets',async()=>{
    h=await startHarness();const a=await h.account(),b=await h.account(),s=await a.session();const initial=success(await a.request<any>('GET','/api/profile'));
    const saved=success(await a.request<any>('PATCH','/api/profile',{expectedRevision:initial.revision,displayName:'Photo owner',avatar:photo}));
    expect(saved.user.displayName).toBe('Photo owner');expect((await a.raw(saved.avatarUrl)).status).toBe(200);denied(await b.request('GET',saved.avatarUrl));
    let team=await group(a);team=await member(a,team,b,'member');expect((await b.raw(saved.avatarUrl)).status).toBe(200);
    const selected=(await h.runtime.auth.issueToken(b.user!.id,'Unrelated session',['read'],[(await b.session()).id])),p=(await h.runtime.auth.authorize({get:()=> 'Bearer '+selected.value} as unknown as Request));
    (await expect((async ()=>(await h.runtime.service.accounts.image(p,saved.avatarUrl.split('/').at(-1))))()).rejects.toThrow(/unavailable/));
    const invalid=await a.request('PATCH','/api/profile',{expectedRevision:saved.revision,avatar:{mimeType:'image/png',base64:Buffer.from('<svg onload="alert(1)"/>').toString('base64')}});
    expect(invalid.status).toBe(400);expect(success(await a.request<any>('GET','/api/profile')).avatarUrl).toBe(saved.avatarUrl);
    success(await a.request('PATCH','/api/profile',{expectedRevision:saved.revision,avatar:null}));expect((await a.raw(saved.avatarUrl)).status).toBe(404);
    expect(JSON.stringify(success(await a.request('GET','/api/activity')))).not.toContain(PNG);
    expect((await h.browser().raw('/api/profile')).status).toBe(401);expect((await h.runtime.store.get('session',s.id))).toBeDefined();
  });
  it('accepts optional registration photos and rolls invalid ones back without creating an account',async()=>{
    h=await startHarness();const a=h.browser(),password=randomBytes(20).toString('hex'),username='photo_'+randomUUID().slice(0,8);
    const before=Number((await h.runtime.store.db.prepare('SELECT count(*) AS n FROM users').get())!.n);
    const bad=await a.request('POST','/api/auth/register',{username,password,avatar:{mimeType:'image/png',base64:'YWJjZA=='}});
    expect(bad.status).toBe(400);expect(Number((await h.runtime.store.db.prepare('SELECT count(*) AS n FROM users').get())!.n)).toBe(before);
    const created=success(await a.request<any>('POST','/api/auth/register',{username,password,displayName:'Optional avatar',avatar:photo}));
    expect(created.user.avatarUrl).toMatch(/^\/api\/account-images\//);
  });
  it('applies email-confirmation profile details transactionally without authorizing a connector',async()=>{
    const mails:string[]=[];h=await startHarness({signinMailer:async(_email,link)=>{mails.push(link);}});const b=h.browser();
    success(await b.request('POST','/api/auth/email/request',{email:'optional-profile@example.com'}));const token=new URL(mails[0]).hash.slice('#email-signin='.length);
    expect((await b.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',avatar:{mimeType:'image/png',base64:'YWJjZA=='}})).status).toBe(400);
    const created=success(await b.request<any>('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',displayName:'Email photo',avatar:photo}));
    expect(created.user.displayName).toBe('Email photo');expect(created.user.avatarUrl).toMatch(/^\/api\/account-images\//);expect((await h.runtime.store.list('oauth-grant'))).toEqual([]);
    expect((await b.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'})).status).toBe(410);
  });
  it('exposes real filtered historical charts, not another account’s events or service totals',async()=>{
    h=await startHarness();const a=await h.account(),b=await h.account(),s=await a.session('Private historical session'),other=await b.session('Other private session'),p=(await principal(a));
    const service=h.runtime.service;(await service.accounts.audit('test.retained',{actorId:a.user!.id,sessionId:s.id,details:{before:'viewer',after:'editor'}}));
    const read=success(await a.request<any>('GET','/api/activity?limit=1'));expect(read.entries).toHaveLength(1);expect(read.nextCursor).toEqual(expect.any(String));
    const next=success(await a.request<any>('GET','/api/activity?limit=1&afterId='+read.nextCursor));expect(next.entries[0].id).not.toBe(read.entries[0].id);
    const all=(await service.accounts.activity(p,{}));expect(all.entries.some(e=>e.sessionId===other.id)).toBe(false);
    const chart=(await service.accounts.analytics(p,{sessionId:s.id}));expect(validateView(chart.chart).template).toBe('chart');expect(chart.byDateAndType.reduce((sum,cell)=>sum+cell.events,0)).toBe(chart.total);for(const day of chart.daily)expect(chart.byDateAndType.filter(cell=>cell.date===day.date).reduce((sum,cell)=>sum+cell.events,0)).toBe(day.events);for(const type of chart.byType)expect(chart.byDateAndType.filter(cell=>cell.type===type.type).reduce((sum,cell)=>sum+cell.events,0)).toBe(type.events);
    expect((await service.accounts.analytics(p,{since:'2099-01-01T00:00:00Z'})).chart).toBeNull();
    denied(await a.request('GET','/api/analytics?scope=service'));
    service.accounts.serviceAdmins.add(a.user!.id);const admin=success(await a.request<any>('GET','/api/analytics?scope=service'));
    expect(admin.service.accounts).toBe(2);expect(admin.service.sessions).toBeGreaterThanOrEqual(2);expect(admin.traffic.requests).toBeGreaterThan(0);
    expect(JSON.stringify(admin)).not.toContain(b.user!.username);
    const metrics=(await h.runtime.store.db.prepare('SELECT * FROM request_metrics').all());expect(metrics).toEqual([]);
    const events=(await h.runtime.store.query("SELECT * FROM events WHERE event_type='http.request'")).rows;expect(events.length).toBeGreaterThan(0);expect(events.some(e=>e.user_id===a.user!.id)).toBe(true);expect(events.every(e=>e.occurred_at instanceof Date)).toBe(true);
    expect((await h.runtime.store.list('request-metric'))).toEqual([]);
    const restricted=(await h.runtime.auth.issueToken(a.user!.id,'Scoped admin is not service admin',['read'],[s.id])),limited=(await h.runtime.auth.authorize({get:()=> 'Bearer '+restricted.value} as unknown as Request));
    (await expect((async ()=>(await service.accounts.analytics(limited,{scope:'service'})))()).rejects.toThrow(/account-wide/));
  });
});

describe('topology evidence, approximate maps and exact JSON',()=>{
  it('groups people, separate devices and browser windows from live evidence, then persists them honestly offline',async()=>{
    h=await startHarness();const owner=await h.account(),outsider=await h.account(),s=await owner.session(),d=await owner.display(s.id),d2=await owner.display(s.id,'Other screen'),service=h.runtime.service,p=(await principal(owner)),p2=(await principal(owner));
    (await service.devices.register(p,{installationId:'pc',name:'Research laptop'},'Chrome'));(await service.devices.register(p2,{installationId:'tv',name:'Meeting TV'},'Safari'));
    const geo={device:'Windows computer',browser:'Chrome',location:{country:'NO',city:'Oslo',lat:59.9,lng:10.7,accuracyKm:50,source:'GeoIP' as const,approximate:true as const}};
    const one=(await service.experience.receiving.connect(p,s.id,d.id,'one','Chrome',undefined,geo)),two=(await service.experience.receiving.connect(p,s.id,d2.id,'two','Chrome',undefined,geo)),tv=(await service.experience.receiving.connect(p2,s.id,d.id,'tv','Safari',undefined,{device:'TV',browser:'Safari'}));
    const id=hash(p.browserId+':one').slice(0,32);(await service.topology.observed(s.id,id,1366,768));
    const snapshot=(await service.topology.snapshot(p,{sessionId:s.id,includeLocation:true,expectedCountries:['NO']}));
    expect(snapshot.people).toHaveLength(1);expect(snapshot.people[0].devices).toHaveLength(2);expect(snapshot.counts).toMatchObject({people:1,devices:2,windows:3,located:2,unknownLocation:1,outliers:0});
    expect(snapshot.displays[0].connections.find(c=>c.id===id)).toMatchObject({width:1366,height:768,location:{city:'Oslo',accuracyKm:50}});
    expect(snapshot.people[0].devices.map(d=>d.type)).toContain('tv');(await expect((async ()=>(await service.topology.snapshot((await principal(outsider)),{sessionId:s.id})))()).rejects.toThrow());
    one.disconnect();two.disconnect();tv.disconnect();await h.shutdown();const reopened=await createApp({database:h.database});try{const after=(await reopened.service.topology.snapshot(p,{sessionId:s.id,includeLocation:true}));expect(after.counts.windows).toBe(0);expect(after.counts.offline).toBe(3);expect(after.people[0].devices).toHaveLength(2);}finally{await reopened.close();}
  });
  it('labels country outliers and unknown location, requires owner publication for sharing geolocation, and never includes GPS or IP',async()=>{
    h=await startHarness();const owner=await h.account(),member=await h.account(),s=await owner.session(),d=await owner.display(s.id),p=(await principal(owner)),q=(await principal(member)),service=h.runtime.service;
    success(await owner.request('POST','/api/sessions/'+s.id+'/members',{username:member.user!.username,role:'editor'}));
    const first=(await service.experience.receiving.connect(p,s.id,d.id,'normal','',undefined,{device:'Computer',browser:'Chrome',location:{country:'NO',city:'Oslo',lat:59.9,lng:10.7,source:'GeoIP',approximate:true}}));
    const second=(await service.experience.receiving.connect(q,s.id,d.id,'unexpected','',undefined,{device:'Phone',browser:'Firefox',location:{country:'US',city:'New York',lat:40.7,lng:-74,source:'GeoIP',approximate:true}}));
    const own=(await service.topology.snapshot(p,{sessionId:s.id,includeLocation:true,expectedCountries:['NO']}));expect(own.counts.outliers).toBe(1);
    const ordinary=(await service.topology.snapshot(q,{sessionId:s.id,includeLocation:true}));expect(ordinary.locationVisible).toBe(false);expect(ordinary.displays.flatMap(x=>x.connections).every(c=>!c.location)).toBe(true);
    const view={version:1,template:'session-topology',data:{layout:'map',includeLocation:true,expectedCountries:['NO']}};(await expect((async ()=>(await service.verifyView(q,s.id,validateView(view))))()).rejects.toThrow());
    await owner.submit(s.id,[d.id],validateView(view));expect((await service.topology.snapshot(q,{sessionId:s.id},d.id)).locationVisible).toBe(true);
    const record=JSON.stringify((await h.runtime.store.list('connection-history')));expect(record).not.toMatch(/rawIp|ipAddress|latitude|longitude/);
    await owner.submit(s.id,[d.id],fact('Location publication withdrawn'));(await expect((async ()=>(await service.topology.snapshot(q,{sessionId:s.id},d.id)))()).rejects.toThrow(/not showing/));
    first.disconnect();second.disconnect();
  });
  it('keeps arbitrary JSON values, duplicates and reserved keys intact without rounding or evaluation',()=>{
    const source='{"count":9007199254740993,"decimal":1.2300,"__proto__":{"safe":true},"same":1,"same":2,"items":[null,"<img src=x onerror=alert(1)>"]}';
    const root=parseJsonTree(source);expect(root.raw).toBe(source);expect(root.children?.map(c=>c.key)).toEqual(['count','decimal','__proto__','same','same','items']);
    expect(root.children?.slice(0,2).map(c=>c.raw)).toEqual(['9007199254740993','1.2300']);expect(({} as any).safe).toBeUndefined();
    expect(validateView({version:1,template:'json',data:{json:source}}).data.json).toBe(source);
    for(const invalid of ['[1,]','{"a":1,}','01','{"a":"unclosed}','true false','['.repeat(66)+'0'+']'.repeat(66)])expect(()=>parseJsonTree(invalid)).toThrow();
    expect(()=>parseJsonTree('['+Array(12001).fill('0').join(',')+']')).toThrow(/nodes/);
  });
});
