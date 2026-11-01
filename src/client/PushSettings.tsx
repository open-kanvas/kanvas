import {useEffect,useState} from 'react';
import {api,errorMessage} from './api';
import {Button} from './components/ui';
export function PushSettings({compact=false}:{compact?:boolean}){
 const supported=typeof window!=='undefined'&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 const [state,setState]=useState<{configured:boolean;enabled:boolean;publicKey?:string}>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{void api<{configured:boolean;enabled:boolean;publicKey?:string}>('/api/push').then(setState).catch(()=>{});},[]);
 async function toggle(){if(!supported||!state)return;setBusy(true);setError('');try{
  if(state.enabled){await api('/api/push',{method:'DELETE'});const registration=await navigator.serviceWorker.getRegistration('/');await(await registration?.pushManager.getSubscription())?.unsubscribe();setState({...state,enabled:false});return;}
  const permission=await Notification.requestPermission();if(permission!=='granted'){setError('Notifications were not enabled. You can change permission in browser settings.');return;}
  const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;
  const key=state.publicKey!,bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  const json=subscription.toJSON();try{await api('/api/push',{method:'POST',body:{endpoint:subscription.endpoint,keys:json.keys}});}catch(e){await subscription.unsubscribe();throw e;}
  setState({...state,enabled:true});
 }catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 if(compact)return <section><Button variant="secondary" busy={busy} disabled={!supported||!state?.configured} title={!supported?'This browser does not support push notifications here.':state&&!state.configured?'Notifications are not configured on this installation.':undefined} onClick={()=>void toggle()}>{state?.enabled?'Disable notifications':'Enable notifications'}</Button>{error&&<p role="alert">{error}</p>}</section>;
 return <section><h3>New-session notifications</h3><p>Opt in on this device to be notified when your agent starts a new session while no Kanvas screen is connected. Notifications contain no session title or content. Signing out revokes this device’s subscription.</p>{!supported?<p>This browser does not support push notifications here. On iPhone or iPad, install Kanvas on your Home Screen first.</p>:state&&!state.configured?<p>Notifications are not configured on this installation.</p>:<Button variant="secondary" busy={busy} disabled={!state} onClick={()=>void toggle()}>{state?.enabled?'Disable notifications':'Enable notifications'}</Button>}{error&&<p role="alert">{error}</p>}</section>;
}
