import { useEffect, useRef, useState } from 'react';
import type { ToastRecord } from '../shared/viewer-experience';
import { toastVisibleUntil } from '../shared/viewer-experience';
import { api, requestId } from './api';
import { useTask } from './hooks';
import { Button, ErrorNotice, Field, Modal } from './components/ui';
import './invitations.css';

export function InvitationModal({onClose,group,onCreated}:{onClose:()=>void;group?:{id:string;name:string;kind:string};onCreated?:()=>void}) {
  const task=useTask(),[label,setLabel]=useState(group?`Join ${group.name}`.slice(0,120):'Join me on KANVAS'),[text,setText]=useState('');
  const retry=useRef<{label:string;id:string}|undefined>(undefined);
  return <Modal title={group?`Invite a member to ${group.name}`:'Invite someone to KANVAS'} onClose={onClose}>
    <p className="modal-description">{group?`Share this single-use invitation with one person. After verifying or signing in to their own account and accepting, they join this ${group.kind} as a member, including its existing session access.`:'Create a welcome link and a short introduction to share yourself. This does not give access to any private session or display.'}</p>
    <form onSubmit={e=>{e.preventDefault();void task.run(async()=>{
      if(retry.current?.label!==label)retry.current={label,id:requestId()};
      const result=await api<{shareText:string}>('/api/invitations',{method:'POST',body:{label,requestId:retry.current.id,...(group?{groupId:group.id}:{})}});
      setText(result.shareText);onCreated?.();
    });}}>
      <Field label="Welcome message"><input value={label} onChange={e=>setLabel(e.target.value)} required maxLength={120}/></Field>
      <Button type="submit" busy={task.busy}>Create invitation</Button>
    </form>
    {text&&<><Field label="Invitation to share"><textarea className="invitation-intro" readOnly value={text} onFocus={e=>e.target.select()}/></Field><Button variant="secondary" onClick={()=>void task.run(()=>navigator.clipboard.writeText(text))}>Copy invitation</Button><p>Nothing has been sent. The welcome link expires in seven days.{group?' You can revoke an unused invitation from this group.':''}</p></>}
    <ErrorNotice message={task.error}/>
  </Modal>;
}

export function GroupInvitations({group}:{group:{id:string;name:string;kind:string}}){
  const task=useTask(),[open,setOpen]=useState(false),[generation,setGeneration]=useState(0),[items,setItems]=useState<{id:string;label:string;status:string;expiresAt:string}[]>([]);
  useEffect(()=>{let live=true;void task.run(async()=>{const result=await api<{invitations:typeof items}>('/api/groups/'+encodeURIComponent(group.id)+'/invitations');if(live)setItems(result.invitations);});return()=>{live=false;};},[group.id,generation]);
  return <section className="group-invitations"><h4>Invite new members</h4><p>The recipient can create their account after receiving the invitation. Membership starts only when they accept.</p><Button variant="secondary" onClick={()=>setOpen(true)}>Invite a new member</Button>
    {items.length>0&&<ul>{items.slice(0,50).map(item=><li key={item.id}><strong>{item.label}</strong> · {item.status}{item.status==='active'&&<Button variant="ghost" disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/api/invitations/'+item.id+'/revoke',{method:'POST',body:{}});setGeneration(x=>x+1);})}>Revoke invitation</Button>}</li>)}</ul>}
    <ErrorNotice message={task.error}/>{open&&<InvitationModal group={group} onClose={()=>setOpen(false)} onCreated={()=>setGeneration(x=>x+1)}/>}
  </section>;
}

/** Owner lifecycle events are independent of the currently open workspace tab. */
export function OwnerNotices(){
  const [notices,setNotices]=useState<ToastRecord[]>([]),[dismissed,setDismissed]=useState<string[]>([]);
  useEffect(()=>{let alive=true,busy=false;const read=async()=>{if(busy)return;busy=true;try{const result=await api<ToastRecord[]>('/api/account/notices');if(alive)setNotices(result);}catch{if(alive)setNotices([]);}finally{busy=false;}};
    void read();const timer=setInterval(()=>void read(),4000);return()=>{alive=false;clearInterval(timer);};},[]);
  const visible=notices.filter(n=>!dismissed.includes(n.id)&&toastVisibleUntil(n)>Date.now()).slice(-3);
  return <aside className="owner-notices" aria-label="Connection notifications" aria-live="polite" aria-relevant="additions">{visible.map(n=><article key={n.id}><p>{n.text}</p><a href={`/?session=${n.sessionId}`}>Open session</a><time>{new Date(n.createdAt).toLocaleTimeString()}</time><button aria-label={`Dismiss notification: ${n.text}`} onClick={()=>setDismissed(x=>[...x.slice(-99),n.id])}>×</button></article>)}</aside>;
}
