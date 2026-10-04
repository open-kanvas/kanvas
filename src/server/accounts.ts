import { asyncFilter, asyncFlatMap, asyncMap, asyncReduce, asyncSome } from './async-collections.js';
import type { Express, Request } from 'express';
import { z } from 'zod';
import { activityQuerySchema, analyticsQuerySchema, groupCreateSchema, groupUpdateSchema, groupMemberSchema, groupGrantSchema, sessionContextSchema, profileUpdateSchema, type AccountGroup, type AccountProfile, type AuditEvent, type GroupMember, type SessionGroupGrant, type SessionContext, type Appearance } from '../shared/accounts.js';
import type { Role, SessionConfig, SessionRecord } from '../shared/types.js';
import type { AuthPrincipal, Token } from './auth.js';
import { hash } from './auth.js';
import type { KanvasService } from './domain.js';
import { AppError, id, now, required } from './store.js';
import { avatarUrl, removeAccountImage, saveAccountImage } from './account-images.js';
import { displayedLeaf } from './engagement.js';
import { mergeConfig } from '../shared/preferences.js';

const rank:Record<Role,number>={viewer:0,editor:1,owner:2};
const appearanceKeys=['theme','style','accent'] as const;
const appearance=(value:Partial<SessionConfig>):Appearance=>Object.fromEntries(appearanceKeys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
interface RequestMetric {at:string;category:string;status:number;requests:number;durationMs:number}

/** Account/group policy is evaluated at use time: inherited access is never
 * copied into the individual member table, and OAuth restrictions still apply. */
export class Accounts {
  serviceAdmins=new Set<string>();
  private pruneAt=0;
  constructor(readonly service:KanvasService){}
  get store(){return this.service.store;}
  async account(p:AuthPrincipal,write=false){
    (await this.service.fullAccount(p,write?'publish':'read'));
    if(p.captureOnly||p.tokenId&&(await this.store.get<Token>('token',p.tokenId))?.sessionIds)throw new AppError('FORBIDDEN','This operation requires an account-wide connection.',403);
  }
  async isServiceAdmin(p:AuthPrincipal){return this.serviceAdmins.has(p.userId)||this.serviceAdmins.has((await this.service.auth.user(p.userId))?.username??'');}
  async audit(type:string,input:Omit<AuditEvent,'id'|'at'|'type'|'details'> & {details?:AuditEvent['details']}={}){
    return this.store.atomic(async () => {
    const event:AuditEvent={id:id(),at:now(),type,...input,details:input.details??{}};(await this.store.put('audit-event',event));
    if(Date.now()>this.pruneAt){this.pruneAt=Date.now()+3600000;(await this.store.db.prepare("DELETE FROM documents WHERE kind='audit-event' AND ((value::jsonb->>'at')<? OR rowid IN (SELECT rowid FROM documents WHERE kind='audit-event' ORDER BY rowid DESC OFFSET 100000))").run(new Date(Date.now()-365*86400000).toISOString()));}
    return event;

    });
  }
  async recordRequest(category:'agent'|'account'|'api'|'page',status:number,durationMs:number){
    return this.store.atomic(async () => {
    // Fixed buckets, not URLs, query strings, cookies, IPs, or per-user trackers.
    // Transport telemetry is separate from application documents and activity.
    // Even malformed/read-only requests may be counted without changing any
    // session, receipt, history, diagnostic, permission or audit-event record.
    const at=now().slice(0,13)+':00:00.000Z',statusClass=Math.floor(status/100);
    const count=(await this.store.db.prepare('INSERT INTO request_metrics(hour,category,status,requests,duration_ms) VALUES(?,?,?,1,?) ON CONFLICT(hour,category,status) DO UPDATE SET requests=request_metrics.requests+1,duration_ms=request_metrics.duration_ms+excluded.duration_ms RETURNING requests').get(at,category,statusClass,Math.max(0,Math.round(durationMs))))!;
    if(count.requests===1)(await this.store.db.prepare('DELETE FROM request_metrics WHERE hour<? OR rowid IN (SELECT rowid FROM request_metrics ORDER BY hour DESC OFFSET 20000)').run(new Date(Date.now()-90*86400000).toISOString()));

    });
  }
  private async traffic(since?:string,until?:string){
    const rows=((await this.store.db.prepare('SELECT hour AS at,category,status,requests,duration_ms AS "durationMs" FROM request_metrics ORDER BY hour').all()) as unknown as RequestMetric[]).filter(r=>(!since||r.at>=since.slice(0,13)+':00:00.000Z')&&(!until||r.at<=until));
    const requests=rows.reduce((n,r)=>n+r.requests,0),duration=rows.reduce((n,r)=>n+r.durationMs,0);
    return {requests,averageDurationMs:requests?Math.round(duration/requests):null,errors:rows.filter(r=>r.status>=4).reduce((n,r)=>n+r.requests,0),byCategory:['agent','account','api','page'].map(category=>({category,requests:rows.filter(r=>r.category===category).reduce((n,r)=>n+r.requests,0)})),retentionDays:90,granularity:'hour',note:'HTTP totals include automated polling, not unique visitors. No cookies or IP identifiers are used.'};
  }
  async member(groupId:string,userId:string){return (await this.store.get<GroupMember>('group-member',hash(`${groupId}:${userId}`)));}
  async group(p:AuthPrincipal,groupId:string,admin=false){
    (await this.account(p,admin));const group=required((await this.store.get<AccountGroup>('group',groupId))),member=(await this.member(groupId,p.userId));
    if(!member||admin&&member.role==='member')throw new AppError('NOT_FOUND','This group is unavailable for that operation.',404);
    return group;
  }
  async groupsFor(userId:string){return (await asyncFlatMap((await this.store.list<GroupMember>('group-member')).filter(m=>m.userId===userId), async m=>{const g=(await this.store.get<AccountGroup>('group',m.groupId));return g?[{...g,role:m.role}]:[];}));}
  async list(p:AuthPrincipal){(await this.account(p));return {groups:(await this.groupsFor(p.userId)),note:'Teams are independent groups and can link multiple organizations. Membership and session grants are explicit; links alone grant no access.'};}
  async read(p:AuthPrincipal,groupId:string){const group=(await this.group(p,groupId));return {...group,role:(await this.member(groupId,p.userId))!.role,members:(await asyncMap((await this.store.list<GroupMember>('group-member')).filter(m=>m.groupId===groupId), async m=>({...m,user:(await this.service.auth.user(m.userId))})))};}
  private async organizations(p:AuthPrincipal,kind:AccountGroup['kind'],ids:string[]){
    if(new Set(ids).size!==ids.length||kind==='organization'&&ids.length)throw new AppError('INVALID_ORGANIZATIONS','Only teams can link distinct organizations.');
    for(const groupId of ids)if((await this.group(p,groupId,true)).kind!=='organization')throw new AppError('INVALID_ORGANIZATION','Choose an organization.');
  }
  async create(p:AuthPrincipal,raw:unknown){
    return this.store.atomic(async () => {
    (await this.account(p,true));const a=groupCreateSchema.parse(raw),key=hash(`${p.userId}:group:${a.requestId}`),digest=hash(JSON.stringify(a));
    const prior=(await this.store.get<{digest:string;groupId:string}>('account-receipt',key));
    if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','This request was used for another group.',409);return (await this.read(p,prior.groupId));}
    (await this.organizations(p,a.kind,a.organizationIds));
    if((await this.store.list<AccountGroup>('group')).filter(g=>g.ownerId===p.userId).length>=100)throw new AppError('LIMIT_REACHED','This account has reached its group limit.',429);
    return (await this.store.transaction(async ()=>{
      const stamp=now(),group:AccountGroup={id:id(),kind:a.kind,name:a.name,description:a.description,ownerId:p.userId,revision:0,organizationIds:a.organizationIds,defaults:{},branding:{palette:[]},createdAt:stamp,updatedAt:stamp};
      (await this.store.put('group',group));(await this.store.put('group-member',{id:hash(`${group.id}:${p.userId}`),groupId:group.id,userId:p.userId,role:'owner',joinedAt:stamp}));
      (await this.store.put('account-receipt',{id:key,digest,groupId:group.id}));(await this.audit('group.created',{actorId:p.userId,groupId:group.id,details:{kind:a.kind}}));return (await this.read(p,group.id));
    }));

    });
  }
  async update(p:AuthPrincipal,raw:unknown){
    return this.store.atomic(async () => {
    const a=groupUpdateSchema.parse(raw),g=(await this.group(p,a.groupId,true));this.service.assertRevision(a.expectedRevision,g.revision);
    if(a.organizationIds){
      if(g.kind==='organization'&&a.organizationIds.length||new Set(a.organizationIds).size!==a.organizationIds.length)throw new AppError('INVALID_ORGANIZATIONS','Only teams can link distinct organizations.');
      (await this.organizations(p,g.kind,a.organizationIds.filter(x=>!g.organizationIds.includes(x))));
    }
    return (await this.store.transaction(async ()=>{
      if(a.name!==undefined)g.name=a.name;if(a.description!==undefined)g.description=a.description;if(a.organizationIds)g.organizationIds=a.organizationIds;if(a.defaults)g.defaults=a.defaults;
      if(a.branding){const previous=g.branding.logoUrl?.split('/').at(-1);g.branding.palette=a.branding.palette;
        if(a.branding.logo===null){if(previous)(await removeAccountImage(this.store,g.id,previous));delete g.branding.logoUrl;}
        else if(a.branding.logo)g.branding.logoUrl=`/api/account-images/${(await saveAccountImage(this.store,g.id,a.branding.logo,previous))}`;
      }
      g.revision++;g.updatedAt=now();(await this.store.put('group',g));(await this.audit('group.settings.changed',{actorId:p.userId,groupId:g.id,details:{revision:g.revision}}));(await this.invalidate(g.id));return (await this.read(p,g.id));
    }));

    });
  }
  async setMember(p:AuthPrincipal,raw:unknown){
    return this.store.atomic(async () => {
    const a=groupMemberSchema.parse(raw),g=(await this.group(p,a.groupId,true));this.service.assertRevision(a.expectedRevision,g.revision);
    const row=(await this.store.db.prepare('SELECT id FROM users WHERE username=?').get(a.username.toLowerCase())) as {id:string}|undefined;
    const user=required(row&&(await this.service.auth.user(row.id)),'That registered account is unavailable.');
    if(user.id===g.ownerId)throw new AppError('OWNER_ROLE','The group owner cannot be removed or demoted.');
    const key=hash(`${g.id}:${user.id}`),previous=(await this.member(g.id,user.id));
    if((await this.member(g.id,p.userId))?.role!=='owner'&&(previous?.role==='admin'||a.role==='admin'))throw new AppError('FORBIDDEN','Only the group owner manages administrators.',403);
    return (await this.store.transaction(async ()=>{
      if(a.role)(await this.store.put('group-member',{id:key,groupId:g.id,userId:user.id,role:a.role,joinedAt:previous?.joinedAt??now()}));else (await this.store.delete('group-member',key));
      g.revision++;g.updatedAt=now();(await this.store.put('group',g));(await this.audit(a.role?'group.member.changed':'group.member.removed',{actorId:p.userId,subjectId:user.id,groupId:g.id,details:{before:previous?.role??null,after:a.role}}));(await this.invalidate(g.id));return (await this.read(p,g.id));
    }));

    });
  }
  async effectiveRole(userId:string,sessionId:string):Promise<Awaited<Role|undefined>>{
    const row=(await this.store.db.prepare('SELECT role FROM members WHERE session_id=? AND user_id=?').get(sessionId,userId)) as {role:Role}|undefined;
    let role=row?.role;
    for(const grant of (await this.store.list<SessionGroupGrant>('session-group-grant',sessionId)))if(grant.role&&(await this.member(grant.groupId,userId))&&(await this.store.get('group',grant.groupId))&&(!role||rank[grant.role]>rank[role]))role=grant.role;
    return role;
  }
  async grants(p:AuthPrincipal,sessionId:string){(await this.service.fullAccount(p));(await this.service.access(p,sessionId,'owner'));return {grants:(await asyncMap((await this.store.list<SessionGroupGrant>('session-group-grant',sessionId)), async g=>({...g,group:(await this.store.get<AccountGroup>('group',g.groupId))?.name})))};}
  async grant(p:AuthPrincipal,raw:unknown){
    return this.store.atomic(async () => {
    const a=groupGrantSchema.parse(raw);(await this.service.fullAccount(p,'publish'));(await this.service.access(p,a.sessionId,'owner'));
    const key=hash(`${a.sessionId}:${a.groupId}`),previous=(await this.store.get<SessionGroupGrant>('session-group-grant',key));
    // Owners can always revoke an existing grant even after leaving the group.
    if(a.role||!previous)(await this.group(p,a.groupId));
    this.service.assertRevision(a.expectedRevision,previous?.revision??0);
    return (await this.store.transaction(async ()=>{
      const grant:SessionGroupGrant={id:key,sessionId:a.sessionId,groupId:a.groupId,role:a.role,revision:(previous?.revision??0)+1,updatedAt:now()};(await this.store.put('session-group-grant',grant));
      (await this.audit(a.role?'session.group-access.changed':'session.group-access.revoked',{actorId:p.userId,sessionId:a.sessionId,groupId:a.groupId,details:{before:previous?.role??null,after:a.role}}));
      this.service.emit({type:'membership',sessionId:a.sessionId});return grant;
    }));

    });
  }
  private async invalidate(groupId:string){
    const sessions=new Set((await this.store.list<SessionGroupGrant>('session-group-grant')).filter(g=>g.groupId===groupId).map(g=>g.sessionId));
    for(const c of (await this.store.list<SessionContext>('session-context')))if(c.organizationId===groupId||c.teamId===groupId)sessions.add(c.sessionId);
    for(const sessionId of sessions)this.service.emit({type:'membership',sessionId});
  }
  async context(p:AuthPrincipal,sessionId:string){(await this.service.fullAccount(p));const s=(await this.service.access(p,sessionId));return {context:(await this.store.get<SessionContext>('session-context',sessionId))??{id:sessionId,sessionId,revision:0,overrides:{},showBranding:true},effective:s.config,precedence:'Installation → organization → team → personal appearance → explicit session overrides. Branding is optional, organization then team; personal theme does not remove branding. Existing unlinked sessions retain their settings.'};}
  async setContext(p:AuthPrincipal,raw:unknown){
    return this.store.atomic(async () => {
    const a=sessionContextSchema.parse(raw);(await this.service.fullAccount(p,'publish'));(await this.service.access(p,a.sessionId,'owner'));const current=(await this.store.get<SessionContext>('session-context',a.sessionId));
    this.service.assertRevision(a.expectedRevision,current?.revision??0);
    const organizationId=a.organizationId===undefined?current?.organizationId:a.organizationId??undefined,teamId=a.teamId===undefined?current?.teamId:a.teamId??undefined;
    if(organizationId&&(await this.group(p,organizationId)).kind!=='organization'||teamId&&(await this.group(p,teamId)).kind!=='team')throw new AppError('INVALID_GROUP','Choose the matching organization or team.');
    return (await this.store.transaction(async ()=>{
      const c:SessionContext={id:a.sessionId,sessionId:a.sessionId,organizationId,teamId,overrides:a.overrides,showBranding:a.showBranding,revision:(current?.revision??0)+1};(await this.store.put('session-context',c));
      (await this.audit('session.context.changed',{actorId:p.userId,sessionId:a.sessionId,details:{organizationId:organizationId??null,teamId:teamId??null,revision:c.revision}}));this.service.emit({type:'config',sessionId:a.sessionId});return (await this.context(p,a.sessionId));
    }));

    });
  }
  async effectiveConfig(session:SessionRecord,userId:string):Promise<Awaited<SessionConfig>>{
    const c=(await this.store.get<SessionContext>('session-context',session.id));if(!c)return session.config;
    const org=c.organizationId?(await this.store.get<AccountGroup>('group',c.organizationId)):undefined,team=c.teamId?(await this.store.get<AccountGroup>('group',c.teamId)):undefined;
    const preferences=(await this.store.get<{config:SessionConfig;appearanceOverrides?:Appearance;configOverrides?:Partial<SessionConfig>}>('preferences',userId)),personal=preferences?.configOverrides??preferences?.appearanceOverrides??(preferences?appearance(preferences.config):undefined);
    const brand=team&&(team.branding.logoUrl||team.branding.palette.length)?team:org;
    let config={...session.config};
    for(const layer of [org?.defaults,team?.defaults,personal,c.overrides])if(layer)config=mergeConfig(config,layer);
    return {...config,...(c.showBranding&&brand?{branding:{...brand.branding,name:brand.name}}:{branding:undefined})};
  }
  async configChanged(sessionId:string,patch:Partial<SessionConfig>){
    return this.store.atomic(async () => {const c=(await this.store.get<SessionContext>('session-context',sessionId));if(c){c.overrides={...c.overrides,...patch};c.revision++;(await this.store.put('session-context',c));}
    });
  }
  async profile(p:AuthPrincipal){(await this.account(p));const details=await this.service.accountDetails(p);return {email:details.email,emailVerified:details.emailVerified,tier:details.tier,quotaExempt:details.quotaExempt,limits:details.limits,...((await this.store.get<AccountProfile>('profile',p.userId))??{id:p.userId,revision:0}),user:(await this.service.auth.user(p.userId)),avatarUrl:(await avatarUrl(this.store,p.userId)),serviceAdmin:(await this.isServiceAdmin(p))};}
  async updateProfile(p:AuthPrincipal,raw:unknown){
    return this.store.atomic(async () => {
    (await this.account(p,true));const a=profileUpdateSchema.parse(raw),profile=(await this.store.get<AccountProfile>('profile',p.userId))??{id:p.userId,revision:0};this.service.assertRevision(a.expectedRevision,profile.revision);
    return (await this.store.transaction(async ()=>{
      if(a.avatar===null){if(profile.avatarId)(await removeAccountImage(this.store,p.userId,profile.avatarId));delete profile.avatarId;}
      else if(a.avatar)profile.avatarId=(await saveAccountImage(this.store,p.userId,a.avatar,profile.avatarId));
      if(a.displayName)(await this.store.db.prepare('UPDATE users SET display_name=? WHERE id=?').run(a.displayName,p.userId));
      profile.revision++;profile.updatedAt=now();(await this.store.put('profile',profile));(await this.audit('account.profile.changed',{actorId:p.userId,subjectId:p.userId,details:{avatar:Boolean(profile.avatarId)}}));return (await this.profile(p));
    }));

    });
  }
  private async readableSessions(p:AuthPrincipal){
    const set=new Set<string>();for(const session of (await this.store.list<SessionRecord>('session'))){try{(await this.service.auth.assertCurrent(p,'read',session.id));if((await this.effectiveRole(p.userId,session.id)))set.add(session.id);}catch{/* Current grants apply to history, including ended sessions. */}}return set;
  }
  private async filtered(p:AuthPrincipal,a:z.infer<typeof activityQuerySchema>,serviceWide=false){
    (await this.service.fullAccount(p));if(p.captureOnly)throw new AppError('FORBIDDEN','Captures do not have account history.',403);
    const sessions=(await this.readableSessions(p)),token=p.tokenId?(await this.store.get<Token>('token',p.tokenId)):undefined,accountWide=!token?.sessionIds;
    if(a.sessionId&&!serviceWide&&!sessions.has(a.sessionId))throw new AppError('NOT_FOUND','This session history is unavailable.',404);
    if(a.groupId&&!serviceWide)(await this.group(p,a.groupId,true));
    if(a.since&&a.until&&a.since>a.until)throw new AppError('INVALID_RANGE','The start date must precede the end date.');
    return (await asyncFilter((await this.store.list<AuditEvent>('audit-event',a.sessionId)), async e=>{
      if(a.since&&e.at<a.since||a.until&&e.at>a.until||a.type&&e.type!==a.type)return false;
      if(a.groupId&&e.groupId!==a.groupId&&(!e.sessionId||!(await this.store.get<SessionContext>('session-context',e.sessionId))||![(await this.store.get<SessionContext>('session-context',e.sessionId))?.organizationId,(await this.store.get<SessionContext>('session-context',e.sessionId))?.teamId].includes(a.groupId)))return false;
      if(serviceWide)return true;
      if(e.sessionId)return sessions.has(e.sessionId);
      if(!accountWide)return false;
      return e.actorId===p.userId||e.subjectId===p.userId||Boolean(e.groupId&&(await this.member(e.groupId,p.userId))&&(await this.member(e.groupId,p.userId))!.role!=='member');
    })).reverse();
  }
  async activity(p:AuthPrincipal,raw:unknown){
    const a=activityQuerySchema.parse(raw),all=(await this.filtered(p,a));let offset=0;
    if(a.afterId){const index=all.findIndex(e=>e.id===a.afterId);if(index<0)throw new AppError('INVALID_CURSOR','Read history again without the expired or inaccessible cursor.');offset=index+1;}
    const entries=(await asyncMap(all.slice(offset,offset+a.limit), async e=>({...e,actorName:e.actorId?(await this.service.auth.user(e.actorId))?.displayName:undefined,subjectName:e.subjectId?(await this.service.auth.user(e.subjectId))?.displayName:undefined,sessionName:e.sessionId?(await this.store.get<SessionRecord>('session',e.sessionId))?.name:undefined,groupName:e.groupId?(await this.store.get<AccountGroup>('group',e.groupId))?.name:undefined})));
    return {entries,...(offset+entries.length<all.length?{nextCursor:entries.at(-1)!.id}:{}),retention:{days:365,maximumServiceEvents:100000},coverage:'Activity is recorded from this feature’s deployment onward. Earlier saved lifecycle logs remain available through session.log; no historical events are fabricated.'};
  }
  async analytics(p:AuthPrincipal,raw:unknown){
    const a=analyticsQuerySchema.parse(raw);if(a.scope==='service'){(await this.account(p));if(!(await this.isServiceAdmin(p)))throw new AppError('FORBIDDEN','Service analytics are restricted to configured service administrators.',403);}
    if(a.scope==='group'&&!a.groupId)throw new AppError('GROUP_REQUIRED','Choose a group for group analytics.');
    const entries=(await this.filtered(p,{...a,limit:100},a.scope==='service')),daily=new Map<string,number>(),types=new Map<string,number>();
    for(const e of entries){daily.set(e.at.slice(0,10),(daily.get(e.at.slice(0,10))??0)+1);types.set(e.type,(types.get(e.type)??0)+1);}
    return {scope:a.scope,total:entries.length,sessions:new Set(entries.flatMap(e=>e.sessionId?[e.sessionId]:[])).size,actors:new Set(entries.flatMap(e=>e.actorId?[e.actorId]:[])).size,daily:[...daily].sort().map(([date,events])=>({date,events})),byType:[...types].sort().map(([type,events])=>({type,events})),chart:daily.size?{version:1,template:'chart',data:{kind:'bar',series:[{name:'Activity',points:[...daily.keys()].sort().map(day=>({x:day,y:daily.get(day)!}))}]}}:null,...(a.scope==='service'?{traffic:(await this.traffic(a.since,a.until)),service:{accounts:Number((await this.store.db.prepare('SELECT count(*) AS n FROM users').get())!.n),organizations:(await this.store.list<AccountGroup>('group')).filter(g=>g.kind==='organization').length,teams:(await this.store.list<AccountGroup>('group')).filter(g=>g.kind==='team').length,sessions:(await this.store.list('session')).length,displays:(await this.store.list('display')).length,liveWindows:(await asyncReduce((await this.store.list<SessionRecord>('session')), async (sum,s)=>sum+(await this.service.experience.receiving.viewers(s.id)).length,0))}}:{}),note:'Counts reflect recorded activity, not unique physical humans or billable usage. IP addresses, credentials, source content and message bodies are not recorded.'};
  }
  async image(p:AuthPrincipal,imageId:string,sessionId?:string,displayId?:string){
    const image=required((await this.store.get<{ownerId:string;mimeType:string}>('account-image',imageId)));
    if(p.scopedSessionId){
      if(!sessionId||!displayId)throw new AppError('FORBIDDEN','This screen can only load images shown in its current topology or branding.',403);
      const d=(await this.service.display(p,sessionId,displayId)),config=(await this.service.access(p,sessionId)).config;
      const branded=config.branding?.logoUrl===`/api/account-images/${imageId}`;
      const topology=displayedLeaf(d.view)?.template==='session-topology'&&(await this.service.topology.snapshot(p,{sessionId,includeOffline:true,includeLocation:false,expectedCountries:[]},displayId)).people.some(person=>person.avatarUrl===`/api/account-images/${imageId}`);
      if(!branded&&!topology)throw new AppError('NOT_FOUND','This image is unavailable.',404);
    }else{
      (await this.service.fullAccount(p));const own=image.ownerId===p.userId,group=(await this.store.get<AccountGroup>('group',image.ownerId));
      const shared=(await asyncSome((await this.service.sessions(p)), async s=>group?(await this.store.get<SessionContext>('session-context',s.id))?.organizationId===group.id||(await this.store.get<SessionContext>('session-context',s.id))?.teamId===group.id:Boolean((await this.effectiveRole(image.ownerId,s.id)))));
      const accountWide=!p.tokenId||!(await this.store.get<Token>('token',p.tokenId))?.sessionIds;
      const sharedGroup=accountWide&&(await asyncSome((await this.groupsFor(p.userId)), async g=>(await this.member(g.id,image.ownerId))));
      if(!own&&!(accountWide&&(await this.member(image.ownerId,p.userId)))&&!shared&&!sharedGroup)throw new AppError('NOT_FOUND','This image is unavailable.',404);
    }
    const row=required((await this.store.db.prepare('SELECT bytes FROM assets WHERE id=?').get(imageId)));return {mimeType:image.mimeType,bytes:Buffer.from(row.bytes as Uint8Array)};
  }
}

export function mountAccounts(app:Express,accounts:Accounts,browser:(req:Request)=>Promise<Awaited<AuthPrincipal>>){
  app.get('/api/profile',async (req,res)=>res.json({data:(await accounts.profile((await browser(req))))}));
  app.patch('/api/profile',async (req,res)=>res.json({data:(await accounts.updateProfile((await browser(req)),req.body))}));
  app.get('/api/groups',async (req,res)=>res.json({data:(await accounts.list((await browser(req))))}));
  app.post('/api/groups',async (req,res)=>res.status(201).json({data:(await accounts.create((await browser(req)),req.body))}));
  app.get('/api/groups/:groupId',async (req,res)=>res.json({data:(await accounts.read((await browser(req)),identifier.parse(req.params.groupId)))}));
  app.patch('/api/groups/:groupId',async (req,res)=>res.json({data:(await accounts.update((await browser(req)),{...req.body,groupId:req.params.groupId}))}));
  app.post('/api/groups/:groupId/members',async (req,res)=>res.json({data:(await accounts.setMember((await browser(req)),{...req.body,groupId:req.params.groupId}))}));
  app.get('/api/sessions/:id/group-access',async (req,res)=>res.json({data:(await accounts.grants((await browser(req)),identifier.parse(req.params.id)))}));
  app.post('/api/sessions/:id/group-access',async (req,res)=>res.json({data:(await accounts.grant((await browser(req)),{...req.body,sessionId:req.params.id}))}));
  app.get('/api/sessions/:id/context',async (req,res)=>res.json({data:(await accounts.context((await browser(req)),identifier.parse(req.params.id)))}));
  app.post('/api/sessions/:id/context',async (req,res)=>res.json({data:(await accounts.setContext((await browser(req)),{...req.body,sessionId:req.params.id}))}));
  const query=(req:Request)=>({...req.query,...(req.query.limit?{limit:Number(req.query.limit)}:{})});
  app.get('/api/activity',async (req,res)=>res.json({data:(await accounts.activity((await browser(req)),query(req)))}));
  app.get('/api/analytics',async (req,res)=>res.json({data:(await accounts.analytics((await browser(req)),req.query))}));
  app.get('/api/account-images/:imageId',async (req,res)=>{const a=z.object({sessionId:identifier.optional(),displayId:identifier.optional()}).strict().parse(req.query),image=(await accounts.image((await browser(req)),identifier.parse(req.params.imageId),a.sessionId,a.displayId));res.type(image.mimeType).send(image.bytes);});
}
