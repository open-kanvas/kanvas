import {useEffect,useRef,useState} from 'react';
import {api,errorMessage} from './api';
import {EmailRequest} from './EmailSignin';
import {Wordmark} from './icons';
import './device-login.css';
type Pending={code:string;phonetic:string[];status:string;expiresAt:string};
export function DeviceLogin(){
 const [request,setRequest]=useState<Pending>(),[error,setError]=useState(''),[email,setEmail]=useState(false),[time,setTime]=useState(Date.now()),start=useRef<Promise<Pending>|null>(null),claiming=useRef(false);
 useEffect(()=>{let live=true,busy=false;start.current??=api<Pending>('/api/login/request',{method:'POST',body:{}});void start.current.then(x=>{if(live)setRequest(x);}).catch(e=>{if(live)setError(errorMessage(e));});
 const poll=async()=>{if(busy||claiming.current)return;busy=true;try{const x=await api<Pending>('/api/login/status');if(!live)return;setRequest(x);setError('');if(x.status==='approved'){claiming.current=true;const result=await api<{viewerUrl:string}>('/api/login/claim',{method:'POST',body:{}});if(live)location.assign(result.viewerUrl);}}catch(e){claiming.current=false;if(live)setError(errorMessage(e));}finally{busy=false;}};
 const timer=setInterval(()=>{setTime(Date.now());void poll();},1000);return()=>{live=false;clearInterval(timer);};},[]);
 const remaining=Math.max(0,Math.ceil(((request?Date.parse(request.expiresAt):time)-time)/1000));
 return <main className="device-login"><Wordmark/><section aria-label="Account sign-in"><h1>Sign in on this screen</h1>{email?<><EmailRequest/><button className="login-email" onClick={()=>setEmail(false)}>Back to sign-in code</button></>:<><p>Say or type this code to your agent, then confirm the screen details.</p>{request&&<div className="login-letters" aria-label={`Sign-in code ${request.code}`}>{[...request.code].map((letter,i)=><div key={i}><strong>{letter}</strong><span>{request.phonetic[i]}</span></div>)}</div>}<p role="status">{request?.status==='pending'?`New code in ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:request?.status==='approved'?'Signing in…':request?`Request ${request.status}. Reload to start again.`:'Getting your code…'}</p><button className="login-email" onClick={()=>setEmail(true)}>Have a keyboard? Sign in with email instead</button></>}{error&&<p role="alert">{error}</p>}</section></main>;
}
