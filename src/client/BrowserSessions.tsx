import {useCallback,useEffect,useState} from 'react';
import {api,errorMessage,requestId} from './api';
import {useAuth,useTask} from './hooks';
import {Button,ErrorNotice,Loading,Modal} from './components/ui';
import {EmailRequest} from './EmailSignin';
interface BrowserSession {id:string;current:boolean;createdAt:string;lastActiveAt:string;expiresAt:number;absoluteExpiresAt:number;device:string;browser:string;origin:string;devices:{name:string}[]}
export function BrowserSessions(){
  const auth=useAuth(),task=useTask(),[sessions,setSessions]=useState<BrowserSession[]>(),[policy,setPolicy]=useState({idleDays:90,absoluteDays:365,activityPrecisionHours:24}),[error,setError]=useState(''),[confirm,setConfirm]=useState<BrowserSession|'all'>();
  const load=useCallback(async()=>{try{const result=await api<{browsers:BrowserSession[];idleDays:number;absoluteDays:number;activityPrecisionHours:number}>('/api/auth/sessions');setSessions(result.browsers);setPolicy(result);setError('');}catch(e){setError(errorMessage(e));}},[]);
  useEffect(()=>{void load();},[load]);
  const revoke=()=>void task.run(async()=>{
    if(!confirm)return;
    await api('/api/auth/sessions/revoke',{method:'POST',body:{...(confirm==='all'?{all:true}:{browserSessionId:confirm.id}),confirm:true,requestId:requestId()}});
    const current=confirm==='all'||confirm.current;setConfirm(undefined);
    if(current)await auth.refresh();else await load();
  });
  const date=(value:string|number)=>new Date(value).toLocaleString();
  return <section className="account-form browser-sessions"><h2>Signed-in browsers</h2><p>Manage your account sign-ins. Paired displays and agent connections have separate access.</p><p>Activity is recorded at most once every {policy.activityPrecisionHours} hours by foreground interaction, not background display updates. Sign-ins expire after {policy.idleDays} days without activity and at most {policy.absoluteDays} days after sign-in.</p><ErrorNotice message={error||task.error}/><div><Button variant="secondary" onClick={()=>void load()}>Refresh browsers</Button> <Button variant="danger" disabled={!sessions?.length} onClick={()=>setConfirm('all')}>Sign out all browsers</Button></div>{!sessions&&!error?<Loading label="Loading signed-in browsers"/>:sessions?.map(session=><article className="browser-session" key={session.id}><h3>{session.device} · {session.browser}{session.current?' · This browser':''}</h3>{session.devices.length>0&&<p>{session.devices.map(d=>d.name).join(', ')}</p>}<dl><dt>Origin</dt><dd>{session.origin}</dd><dt>Signed in</dt><dd>{date(session.createdAt)}</dd><dt>Last active</dt><dd>{date(session.lastActiveAt)}</dd><dt>Current expiry</dt><dd>{date(session.expiresAt)}</dd><dt>Maximum expiry</dt><dd>{date(session.absoluteExpiresAt)}</dd></dl><Button variant="secondary" onClick={()=>setConfirm(session)}>Sign out {session.current?'this browser':'device'}</Button></article>)}{confirm&&<Modal title={confirm==='all'?'Sign out all browsers?':'Sign out this device?'} onClose={()=>setConfirm(undefined)}><p>{confirm==='all'?'Every full-account browser, including this one, will need to sign in again.':`${confirm.device} · ${confirm.browser} will need to sign in again.`} Paired displays and agent connections are unchanged.</p><ErrorNotice message={task.error}/><Button variant="danger" busy={task.busy} onClick={revoke}>Confirm sign out</Button></Modal>}</section>;
}
export function ReauthenticationPrompt(){
  const auth=useAuth(),[open,setOpen]=useState(false);
  useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('kanvas:reauth-required',show);return()=>window.removeEventListener('kanvas:reauth-required',show);},[]);
  useEffect(()=>setOpen(false),[auth.user?.id]);
  if(!open||!auth.user)return null;
  return <Modal title="Confirm it's you" onClose={()=>setOpen(false)}><p>Changing account access needs a recent sign-in. Your workspace is still open, and the action has not been applied.</p><p>Confirm the email link on this device, or approve this browser using the matching code. You will return here to review and try the action again. Unsaved form edits may need to be entered again after sign-in.</p><EmailRequest accountEmail={auth.user.username}/><Button variant="secondary" onClick={()=>setOpen(false)}>Keep working without changing access</Button></Modal>;
}
