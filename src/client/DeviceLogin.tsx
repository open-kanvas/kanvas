import {useEffect,useRef,useState} from 'react';
import {api,errorMessage,ApiError} from './api';
import {EmailRequest} from './EmailSignin';
import {Wordmark} from './icons';
import './device-login.css';
type Pending={code:string;phonetic:string[];status:string;expiresAt:string};
export function DeviceLogin(){
 const [request,setRequest]=useState<Pending>(),[error,setError]=useState(''),[email,setEmail]=useState(false),[time,setTime]=useState(Date.now()),start=useRef<Promise<Pending>|null>(null),claiming=useRef(false);
 useEffect(()=>{let live=true,busy=false,initializing=true;start.current??=api<Pending>('/api/login/request',{method:'POST',body:{}});void start.current.then(x=>{if(live)setRequest(x);}).catch(e=>{if(live)setError(errorMessage(e));}).finally(()=>{initializing=false;});
 const poll=async()=>{if(initializing||busy||claiming.current)return;busy=true;try{const x=await api<Pending>('/api/login/status');if(!live)return;setRequest(x);setError('');if(x.status==='approved'){claiming.current=true;const result=await api<{viewerUrl:string}>('/api/login/claim',{method:'POST',body:{}});if(live)location.assign(result.viewerUrl);}}catch(e){claiming.current=false;if(live){if(e instanceof ApiError&&e.status===401){try{const fresh=await api<Pending>('/api/login/request',{method:'POST',body:{}});if(live){setRequest(fresh);setError('');}}catch(retry){if(live)setError(errorMessage(retry));}}else setError(errorMessage(e));}}finally{busy=false;}};
 const timer=setInterval(()=>{setTime(Date.now());void poll();},1000);return()=>{live=false;clearInterval(timer);};},[]);
 const remaining=Math.max(0,Math.ceil(((request?Date.parse(request.expiresAt):time)-time)/1000));
 return <main className="device-login"><Wordmark/><section aria-label="Account sign-in"><h1>Sign in on this screen</h1>{email?<><EmailRequest/><button className="login-email" onClick={()=>setEmail(false)}>Back to sign-in code</button></>:<><p>Say or type this code to your agent, then confirm the screen details.</p>{request&&<div className="login-letters" aria-label={`Sign-in code ${request.code}`}>{[...request.code].map((letter,i)=><div key={i}><strong>{letter}</strong><span>{request.phonetic[i]}</span></div>)}</div>}{request&&<CopyCode code={request.code}/>}<p role="status">{request?.status==='pending'?`New code in ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:request?.status==='approved'?'Signing in…':request?`Request ${request.status}. Reload to start again.`:'Getting your code…'}</p><button className="login-email" onClick={()=>setEmail(true)}>Have a keyboard? Sign in with email instead</button></>}{error&&<p role="alert">{error}</p>}<p className="login-getting-started">New to Kanvas? <a href="https://open-kanvas.ai/#getting-started" target="_blank" rel="noopener noreferrer">Connect your AI agent first.</a></p></section></main>;
}

/** The code as one selectable run of text with an understated one-tap copy,
 * so it can be pasted into a text chat instead of being memorised. */
export function CopyCode({code}:{code:string}){
 const [copied,setCopied]=useState(false);
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),1800);return()=>clearTimeout(timer);},[copied]);
 useEffect(()=>setCopied(false),[code]);
 const copy=async()=>{
  try{await navigator.clipboard.writeText(code);setCopied(true);return;}catch{/* Older or insecure contexts: fall back to a selection copy. */}
  try{const field=document.createElement('textarea');field.value=code;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();const done=document.execCommand('copy');field.remove();if(done)setCopied(true);}catch{/* The text itself stays selectable. */}
 };
 return <div className="login-code-copy"><code className="login-code-text" aria-label="Sign-in code as text">{code}</code><button type="button" className="login-code-copy-button" onClick={()=>void copy()} aria-label={copied?'Code copied':'Copy code'} data-copied={copied||undefined}>
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{copied?<path d="m5 12.5 4.5 4.5L19 7.5"/>:<><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></>}</svg>
  <span aria-live="polite">{copied?'Copied':''}</span></button></div>;
}
