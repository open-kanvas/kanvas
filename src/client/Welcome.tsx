import { useEffect, useState } from 'react';
import { api, errorMessage, requestId } from './api';
import { useAuth, useTask } from './hooks';
import { AuthScreen } from './Auth';
import { Wordmark } from './icons';
import './welcome.css';

export function Welcome({invitationId}:{invitationId:string}){
  const auth=useAuth(),task=useTask(),[signingIn,setSigningIn]=useState(false),[joined,setJoined]=useState(false),[invitation,setInvitation]=useState<{label:string;description:string;expiresAt:string;group?:{id:string;name:string;kind:string}}|null>(null),[error,setError]=useState('');
  useEffect(()=>{let live=true;void api<typeof invitation>(`/api/invitations/${invitationId}`).then(x=>{if(live)setInvitation(x);}).catch(e=>{if(live)setError(errorMessage(e));});return()=>{live=false;};},[invitationId]);
  if(signingIn&&!auth.user)return <AuthScreen/>;
  return <main className="kanvas-welcome"><Wordmark/><span className="content-eyebrow">You’re invited</span><h1>{invitation?.label??'Welcome to KANVAS'}</h1><p>{invitation?.description}</p>{!invitation&&!error&&<p>Opening your invitation…</p>}{error&&<p role="alert">{error}</p>}{invitation&&<>
    {!auth.user?<button onClick={()=>setSigningIn(true)}>Create an account or sign in</button>:auth.viewOnly?<p>Sign in with your own account to join. A paired display is not a personal account.</p>:invitation.group?.id?(joined?<><p role="status">You’re now a member of {invitation.group?.name}.</p><a className="button button-primary" href="/admin?account=groups">Open your account</a></>:<button disabled={task.busy} onClick={()=>void task.run(async()=>{await api(`/api/invitations/${invitationId}/accept`,{method:'POST',body:{confirm:true}});setJoined(true);})}>Join {invitation.group?.name}</button>):<a className="button button-primary" href="/">Open your workspace</a>}
    <p className="welcome-access">{invitation.group?.id?`Joining adds your account to this ${invitation.group?.kind??'group'} as a member, including sessions explicitly shared with the group. It does not authorize an agent or add you to linked groups.`:'This invitation does not grant access to anyone’s private workspace or display.'}</p><p><a href="/docs/">Explore Kanvas Help</a></p><small>Invitation expires {new Date(invitation.expiresAt).toLocaleString()}.</small>{task.error&&<p role="alert">{task.error}</p>}
  </>}</main>;
}
