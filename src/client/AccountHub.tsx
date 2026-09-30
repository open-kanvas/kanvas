import { useCallback, useEffect, useState } from 'react';
import type { AccountGroup, Appearance, AccountProfile, AuditEvent, GroupMember, SessionContext, SessionGroupGrant } from '../shared/accounts';
import type { SessionConfig, ViewSpec } from '../shared/types';
import { STYLE_PRESETS } from '../shared/styles';
import { DEFAULT_CONFIG } from '../shared/preferences';
import { api, errorMessage, requestId, sessionPath, type User } from './api';
import { useAuth, useTask } from './hooks';
import { Badge, Button, ErrorNotice, Field, Loading } from './components/ui';
import { ProfileImageInput, type ProfileImage } from './ProfileImageInput';
import { Renderer } from './renderers/Renderer';
import './account-hub.css';
import { GroupInvitations } from './Invitations';

type GroupSummary=AccountGroup & {role:GroupMember['role']};
type GroupDetail=GroupSummary & {members:(GroupMember & {user?:User})[]};
type Profile=AccountProfile & {user:User;avatarUrl?:string;serviceAdmin:boolean};
const groupPath=(id:string)=>'/api/groups/'+encodeURIComponent(id);

export function AccountHub(){
  const [profile,setProfile]=useState<Profile>(),[tab,setTab]=useState(()=>new URLSearchParams(window.location.search).get('account')==='groups'?'groups':'profile'),[error,setError]=useState('');
  const load=useCallback(async()=>{setProfile(await api<Profile>('/api/profile'));},[]);
  useEffect(()=>{void load().catch(e=>setError(errorMessage(e)));},[load]);
  return <section className="account-hub"><ErrorNotice message={error}/><nav className="account-tabs" aria-label="Account sections">
    {[['profile','Profile'],['groups','Organizations & teams'],['history','Activity history'],...(profile?.serviceAdmin?[['service','Service analytics']]:[])].map(([id,name])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}>{name}</button>)}
  </nav>{!profile?<Loading label="Loading account"/>:tab==='profile'?<><ProfilePanel key={profile.revision} profile={profile} reload={load}/><PersonalAppearance/></>:tab==='groups'?<GroupsPanel/>:tab==='service'?<HistoryPanel service/>:<HistoryPanel/>}</section>;
}
function ProfilePanel({profile,reload}:{profile:Profile;reload:()=>Promise<void>}){
  const auth=useAuth(),task=useTask(),[name,setName]=useState(profile.user.displayName),[avatar,setAvatar]=useState<ProfileImage|null|undefined>(),[saved,setSaved]=useState(false);
  return <form className="account-form" onSubmit={e=>{e.preventDefault();void task.run(async()=>{await api('/api/profile',{method:'PATCH',body:{expectedRevision:profile.revision,displayName:name,...(avatar!==undefined?{avatar}:{})}});await auth.refresh();await reload();setSaved(true);});}}>
    <h2>Your profile</h2><p>A photo is optional. Without one, KANVAS uses a neutral person icon.</p>
    {profile.avatarUrl&&avatar!==null&&<img className="profile-image-preview" src={profile.avatarUrl} alt="Current profile"/>}
    <Field label="Display name"><input value={name} onChange={e=>setName(e.target.value)} required maxLength={80} autoComplete="name"/></Field>
    <ProfileImageInput onChange={setAvatar}/>{profile.avatarUrl&&<Button type="button" variant="secondary" onClick={()=>setAvatar(null)}>{avatar===null?'Photo will be removed':'Remove photo'}</Button>}
    <ErrorNotice message={task.error}/><Button type="submit" busy={task.busy}>Save profile</Button>{saved&&<p role="status">Profile saved.</p>}
  </form>;
}
function GroupsPanel(){
  const task=useTask(),[groups,setGroups]=useState<GroupSummary[]>([]),[detail,setDetail]=useState<GroupDetail>(),[selected,setSelected]=useState(''),[name,setName]=useState(''),[kind,setKind]=useState<'organization'|'team'>('organization'),[loading,setLoading]=useState(true);
  const load=useCallback(async(id?:string)=>{
    const result=await api<{groups:GroupSummary[]}>('/api/groups');setGroups(result.groups);
    if(id)setDetail(await api<GroupDetail>(groupPath(id)));setLoading(false);
  },[]);
  useEffect(()=>{void task.run(()=>load());},[load]);
  useEffect(()=>{setDetail(undefined);if(selected)void task.run(()=>load(selected));},[selected,load]);
  return <div><h2>Organizations & teams</h2><p>Teams stand on their own and can span multiple organizations. Linking groups does not grant access; members and session permissions are managed separately.</p>
    <form className="account-inline-form" onSubmit={e=>{e.preventDefault();void task.run(async()=>{const g=await api<GroupDetail>('/api/groups',{method:'POST',body:{kind,name,requestId:requestId()}});setName('');setSelected(g.id);await load(g.id);});}}>
      <Field label="Group kind"><select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="organization">Organization</option><option value="team">Team</option></select></Field>
      <Field label="New group name"><input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required/></Field><Button type="submit" busy={task.busy}>Create group</Button>
    </form><ErrorNotice message={task.error}/>{loading?<Loading label="Loading groups"/>:<div className="account-groups-layout"><nav aria-label="Your groups" className="account-group-list">{groups.map(g=><button key={g.id} aria-current={selected===g.id?'page':undefined} onClick={()=>setSelected(g.id)}><strong>{g.name}</strong><span>{g.kind} · {g.role}</span></button>)}{!groups.length&&<p>No organizations or teams yet.</p>}</nav>
      {detail?<GroupEditor key={detail.id+':'+detail.revision} group={detail} groups={groups} reload={()=>load(detail.id)}/>:<p>{selected?'Opening group…':'Choose a group to manage its members, appearance and history.'}</p>}</div>}
  </div>;
}
function PersonalAppearance(){
  const task=useTask(),[preferences,setPreferences]=useState<{revision:number;config:SessionConfig}>(),[dirty,setDirty]=useState<Appearance>({}),[saved,setSaved]=useState(false);
  useEffect(()=>{void task.run(async()=>setPreferences(await api('/api/preferences')));},[]);
  if(!preferences)return <ErrorNotice message={task.error}/>;
  const config={...preferences.config,...dirty},set=(patch:Appearance)=>{setDirty({...dirty,...patch});setSaved(false);};
  return <form className="account-form personal-appearance" onSubmit={e=>{e.preventDefault();void task.run(async()=>{setPreferences(await api('/api/preferences',{method:'PATCH',body:{expectedRevision:preferences.revision,config:dirty}}));setDirty({});setSaved(true);});}}>
    <h2>Your appearance defaults</h2><p>Used for new sessions and your view of group-inherited sessions. Explicit session overrides take priority. Existing standalone sessions keep their own settings.</p>
    <div className="account-field-grid"><Field label="Personal theme"><select value={config.theme} onChange={e=>set({theme:e.target.value as Appearance['theme']})}><option value="system">Follow device</option><option value="dark">Dark</option><option value="light">Light</option></select></Field>
      <Field label="Personal style"><select value={config.style??'ocean'} onChange={e=>{const s=STYLE_PRESETS.find(x=>x.id===e.target.value)!;set({style:s.id,accent:s.accent});}}>{STYLE_PRESETS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Personal accent"><input type="color" value={config.accent} onChange={e=>set({accent:e.target.value})}/></Field>
      <Field label="Personal density"><select value={config.density} onChange={e=>set({density:e.target.value as Appearance['density']})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></Field></div>
    <ErrorNotice message={task.error}/><Button type="submit" busy={task.busy} disabled={!Object.keys(dirty).length}>Save personal appearance</Button>{saved&&<p role="status">Personal appearance saved.</p>}
  </form>;
}
function AppearanceFields({value,onChange}:{value:Appearance;onChange:(next:Appearance)=>void}){
  const set=(key:keyof Appearance,val:string)=>{const next={...value};if(val)Object.assign(next,{[key]:val});else delete next[key];onChange(next);};
  return <div className="account-field-grid">
    <Field label="Default theme"><select value={value.theme??''} onChange={e=>set('theme',e.target.value)}><option value="">Inherit theme</option><option value="system">Follow device</option><option value="light">Light</option><option value="dark">Dark</option></select></Field>
    <Field label="Default style"><select value={value.style??''} onChange={e=>set('style',e.target.value)}><option value="">Inherit style</option>{STYLE_PRESETS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
    <Field label="Default accent" hint="Leave blank to inherit."><input value={value.accent??''} onChange={e=>set('accent',e.target.value)} placeholder="#b9ed87" pattern="#[0-9a-fA-F]{6}" maxLength={7}/></Field>
    <Field label="Default density"><select value={value.density??''} onChange={e=>set('density',e.target.value)}><option value="">Inherit density</option><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></Field>
  </div>;
}
function GroupEditor({group,groups,reload}:{group:GroupDetail;groups:GroupSummary[];reload:()=>Promise<void>}){
  const task=useTask(),admin=group.role!=='member',owner=group.role==='owner';
  const [name,setName]=useState(group.name),[description,setDescription]=useState(group.description),[organizations,setOrganizations]=useState(group.organizationIds),[defaults,setDefaults]=useState(group.defaults),[palette,setPalette]=useState(group.branding.palette.join(', ')),[logo,setLogo]=useState<ProfileImage|null|undefined>();
  const [username,setUsername]=useState(''),[role,setRole]=useState<'admin'|'member'>('member');
  const member=(user:string,next:'admin'|'member'|null)=>task.run(async()=>{await api(groupPath(group.id)+'/members',{method:'POST',body:{expectedRevision:group.revision,username:user,role:next}});await reload();});
  return <section className="account-group-detail"><header><h3>{group.name}</h3><Badge>{group.kind} · {group.role}</Badge></header>
    <form onSubmit={e=>{e.preventDefault();void task.run(async()=>{const colors=palette.split(',').map(s=>s.trim()).filter(Boolean);await api(groupPath(group.id),{method:'PATCH',body:{expectedRevision:group.revision,name,description,organizationIds:organizations,defaults,branding:{palette:colors,...(logo!==undefined?{logo}:{})}}});await reload();});}}>
      <fieldset disabled={!admin||task.busy}><legend>Group appearance</legend><Field label="Group name"><input value={name} onChange={e=>setName(e.target.value)} required maxLength={100}/></Field><Field label="Description"><textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={1000}/></Field>
        {group.kind==='team'&&<Field label="Linked organizations" hint="A team can span organizations. No membership is implied."><select multiple value={organizations} onChange={e=>setOrganizations([...e.target.selectedOptions].map(x=>x.value))}>{groups.filter(g=>g.kind==='organization'&&g.role!=='member').map(g=><option key={g.id} value={g.id}>{g.name}</option>)}{organizations.filter(id=>!groups.some(g=>g.id===id&&g.role!=='member')).map(id=><option key={id} value={id}>{groups.find(g=>g.id===id)?.name??'Linked organization'}</option>)}</select></Field>}
        <AppearanceFields value={defaults} onChange={setDefaults}/><Field label="Brand palette (optional)" hint="Up to eight comma-separated hex colors."><input value={palette} onChange={e=>setPalette(e.target.value)} placeholder="#176d72, #ead3b0" maxLength={80}/></Field>
        {group.branding.logoUrl&&logo!==null&&<img className="profile-image-preview" src={group.branding.logoUrl} alt={group.name+' logo'}/>}<ProfileImageInput label="Brand logo (optional)" onChange={setLogo} disabled={!admin}/>
        {group.branding.logoUrl&&<Button type="button" variant="secondary" onClick={()=>setLogo(null)}>{logo===null?'Logo will be removed':'Remove logo'}</Button>}
        {admin&&<Button type="submit" busy={task.busy}>Save group settings</Button>}
      </fieldset>
    </form><h4>Members</h4><div className="account-member-list">{group.members.map(m=><article key={m.userId}><div>{m.user?.avatarUrl&&<img src={m.user.avatarUrl} alt="" className="account-small-avatar"/>}<strong>{m.user?.displayName??'Registered member'}</strong><small>{m.user?.username}</small></div>
      {admin&&m.role!=='owner'&&(owner||m.role!=='admin')?<><select aria-label={'Role for '+m.user?.username} value={m.role} disabled={task.busy} onChange={e=>void member(m.user!.username,e.target.value as 'admin'|'member')}><option value="member">Member</option>{owner&&<option value="admin">Administrator</option>}</select><Button type="button" variant="secondary" disabled={task.busy} onClick={()=>void member(m.user!.username,null)}>Remove member</Button></>:<Badge>{m.role}</Badge>}
    </article>)}</div>{admin&&<form className="account-inline-form" onSubmit={e=>{e.preventDefault();void member(username,role).then(()=>setUsername(''));}}><Field label="Member email or username"><input value={username} onChange={e=>setUsername(e.target.value)} required maxLength={254}/></Field><Field label="Group role"><select value={role} onChange={e=>setRole(e.target.value as typeof role)}><option value="member">Member</option>{owner&&<option value="admin">Administrator</option>}</select></Field><Button type="submit" busy={task.busy}>Add member</Button></form>}
    {admin&&<GroupInvitations group={group}/>}<ErrorNotice message={task.error}/>{admin&&<details className="account-history-details"><summary>Group access and activity history</summary><HistoryPanel groupId={group.id}/></details>}
  </section>;
}

type NamedEvent=AuditEvent & {actorName?:string;subjectName?:string;sessionName?:string;groupName?:string};
interface ActivityPage {entries:NamedEvent[];nextCursor?:string;coverage:string}
interface Analytics {traffic?:{requests:number;averageDurationMs:number|null;errors:number;note:string};total:number;sessions:number;actors:number;chart:ViewSpec|null;note:string;service?:{accounts:number;organizations:number;teams:number;sessions:number;displays:number;liveWindows:number}}
export function HistoryPanel({sessionId,groupId,service=false}:{sessionId?:string;groupId?:string;service?:boolean}){
  const task=useTask(),[page,setPage]=useState<ActivityPage>(),[stats,setStats]=useState<Analytics>(),[from,setFrom]=useState(''),[until,setUntil]=useState(''),[type,setType]=useState(''),[query,setQuery]=useState('');
  const queryFor=useCallback(()=>{const q=new URLSearchParams();if(sessionId)q.set('sessionId',sessionId);if(groupId)q.set('groupId',groupId);return q;},[sessionId,groupId]);
  const load=useCallback(async(q:string,append=false)=>{
    const params=new URLSearchParams(q);params.set('scope',service?'service':groupId?'group':'account');
    const result=await api<Analytics>('/api/analytics?'+params.toString());setStats(result);
    if(!service){const items=await api<ActivityPage>('/api/activity?'+q);setPage(old=>append&&old?{...items,entries:[...old.entries,...items.entries]}:items);}
  },[service,groupId]);
  useEffect(()=>{const q=queryFor().toString();setQuery(q);setPage(undefined);setStats(undefined);void task.run(()=>load(q));},[load,queryFor]);
  return <section className="account-history"><h2>{service?'Service analytics':sessionId?'Session history':'Activity history'}</h2><p>{service?'Installation-wide aggregate activity, available only to configured service administrators.':'Recorded activity and access changes within your current permissions. Earlier activity is not reconstructed.'}</p>
    <form className="account-inline-form" onSubmit={e=>{e.preventDefault();const q=queryFor();if(from)q.set('since',new Date(from+'T00:00:00Z').toISOString());if(until)q.set('until',new Date(until+'T23:59:59.999Z').toISOString());if(type.trim())q.set('type',type.trim());setQuery(q.toString());void task.run(()=>load(q.toString()));}}>
      <Field label="From date (UTC)"><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></Field><Field label="Through date (UTC)"><input type="date" value={until} onChange={e=>setUntil(e.target.value)}/></Field>
      <Field label="Event type" hint="Leave blank for all events."><input value={type} onChange={e=>setType(e.target.value)} list="account-event-types" maxLength={100} placeholder="session.group-access.changed"/></Field>
      <datalist id="account-event-types">{['viewer.joined','viewer.left','session.created','session.ended','session.member.changed','session.member.removed','session.group-access.changed','session.group-access.revoked','group.member.changed','group.member.removed','publication.render.prepared'].map(t=><option key={t} value={t}/>)}</datalist>
      <Button type="submit" busy={task.busy}>Apply history filters</Button>
    </form><ErrorNotice message={task.error}/>
    {stats&&<><div className="account-metrics"><div><strong>{stats.total}</strong><span>recorded events</span></div><div><strong>{stats.sessions}</strong><span>sessions in range</span></div><div><strong>{stats.actors}</strong><span>account actors</span></div></div>
      {stats.service&&<div className="account-metrics">{Object.entries(stats.service).map(([label,value])=><div key={label}><strong>{value}</strong><span>{label.replace('liveWindows','live windows')}</span></div>)}</div>}
      {stats.traffic&&<><div className="account-metrics"><div><strong>{stats.traffic.requests}</strong><span>HTTP requests</span></div><div><strong>{stats.traffic.errors}</strong><span>HTTP errors</span></div><div><strong>{stats.traffic.averageDurationMs??'—'}</strong><span>average response ms</span></div></div><p className="account-history-note">{stats.traffic.note}</p></>}{stats.chart&&stats.total>0&&<div className="account-history-chart"><Renderer view={stats.chart} config={{...DEFAULT_CONFIG,theme:'light'}} preview/></div>}<p className="account-history-note">{stats.note}</p></>}
    {!service&&page&&<><ol className="account-event-list">{page.entries.map(e=><li key={e.id}><div><strong>{e.type.replaceAll('.',' · ')}</strong><time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time></div><p>{e.actorName??(e.actorId?'Account':'System or guest')}{e.subjectName?' → '+e.subjectName:''}{e.sessionName?' · '+e.sessionName:''}{e.groupName?' · '+e.groupName:''}</p>
      {Object.keys(e.details).length>0&&<dl>{Object.entries(e.details).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value===null?'none':String(value)}</dd></div>)}</dl>}</li>)}</ol>
      {!page.entries.length&&<p>No recorded activity matches these filters.</p>}{page.nextCursor&&<Button variant="secondary" busy={task.busy} onClick={()=>void task.run(async()=>{const q=new URLSearchParams(query);q.set('afterId',page.nextCursor!);const next=await api<ActivityPage>('/api/activity?'+q.toString());setPage(old=>old?{...next,entries:[...old.entries,...next.entries]}:next);})}>Load earlier activity</Button>}<p className="account-history-note">{page.coverage}</p></>}
  </section>;
}
export function SessionGroupAccess({sessionId,reload}:{sessionId:string;reload:()=>Promise<void>}){
  const task=useTask(),[groups,setGroups]=useState<GroupSummary[]>([]),[grants,setGrants]=useState<(SessionGroupGrant & {group?:string})[]>([]),[selected,setSelected]=useState(''),[role,setRole]=useState<'viewer'|'editor'>('viewer');
  const load=useCallback(async()=>{const [g,a]=await Promise.all([api<{groups:GroupSummary[]}>('/api/groups'),api<{grants:typeof grants}>(sessionPath(sessionId)+'/group-access')]);setGroups(g.groups);setGrants(a.grants);},[sessionId]);
  useEffect(()=>{void task.run(load);},[load]);
  const change=(groupId:string,next:'editor'|'viewer'|null)=>task.run(async()=>{await api(sessionPath(sessionId)+'/group-access',{method:'POST',body:{groupId,role:next,expectedRevision:grants.find(g=>g.groupId===groupId)?.revision??0}});await load();await reload();});
  return <section className="session-group-access"><h3>Default group access</h3><p>Every current member inherits this role. Removing the grant removes only this route of access; individual and other group permissions remain.</p>
    <div className="account-member-list">{grants.filter(g=>g.role).map(g=><article key={g.id}><strong>{g.group??'Group'}</strong><select aria-label={'Access for '+g.group} value={g.role!} disabled={task.busy} onChange={e=>void change(g.groupId,e.target.value as typeof role)}><option value="viewer">Viewer</option><option value="editor">Editor</option></select><Button variant="secondary" disabled={task.busy} onClick={()=>void change(g.groupId,null)}>Revoke group access</Button></article>)}</div>
    <form className="account-inline-form" onSubmit={e=>{e.preventDefault();void change(selected,role);}}><Field label="Group to grant access"><select value={selected} onChange={e=>setSelected(e.target.value)} required><option value="">Choose a group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name} · {g.kind}</option>)}</select></Field><Field label="Default session role"><select value={role} onChange={e=>setRole(e.target.value as typeof role)}><option value="viewer">Viewer</option><option value="editor">Editor</option></select></Field><Button type="submit" busy={task.busy} disabled={!selected}>Grant group access</Button></form><ErrorNotice message={task.error}/>
  </section>;
}
export function SessionGroupContext({sessionId,reload}:{sessionId:string;reload:()=>Promise<void>}){
  const task=useTask(),[groups,setGroups]=useState<GroupSummary[]>([]),[context,setContext]=useState<SessionContext>(),[precedence,setPrecedence]=useState(''),[saved,setSaved]=useState(false);
  useEffect(()=>{void task.run(async()=>{const [g,c]=await Promise.all([api<{groups:GroupSummary[]}>('/api/groups'),api<{context:SessionContext;precedence:string}>(sessionPath(sessionId)+'/context')]);setGroups(g.groups);setContext(c.context);setPrecedence(c.precedence);});},[sessionId]);
  if(!context)return <ErrorNotice message={task.error}/>;
  return <section className="session-group-context"><h3>Inherited appearance & branding</h3><p>{precedence}</p><p>Association changes appearance only. Grant group access separately in People & access.</p>
    <form onSubmit={e=>{e.preventDefault();void task.run(async()=>{const r=await api<{context:SessionContext}>(sessionPath(sessionId)+'/context',{method:'POST',body:{expectedRevision:context.revision,organizationId:context.organizationId??null,teamId:context.teamId??null,overrides:context.overrides,showBranding:context.showBranding}});setContext(r.context);setSaved(true);await reload();});}}>
      <div className="account-field-grid">{(['organization','team'] as const).map(kind=><Field key={kind} label={kind==='organization'?'Session organization':'Session team'}><select value={kind==='organization'?context.organizationId??'':context.teamId??''} onChange={e=>{setContext({...context,[kind==='organization'?'organizationId':'teamId']:e.target.value||undefined});setSaved(false);}}><option value="">None</option>{groups.filter(g=>g.kind===kind).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>)}</div>
      <h4>Explicit session overrides</h4><AppearanceFields value={context.overrides} onChange={overrides=>{setContext({...context,overrides});setSaved(false);}}/>
      <label className="account-checkbox"><input type="checkbox" checked={context.showBranding} onChange={e=>setContext({...context,showBranding:e.target.checked})}/>Show group branding</label><ErrorNotice message={task.error}/><Button type="submit" busy={task.busy}>Save inheritance</Button>{saved&&<p role="status">Session inheritance saved.</p>}
    </form>
  </section>;
}
