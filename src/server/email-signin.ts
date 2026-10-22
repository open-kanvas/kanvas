import {LEGAL_DOCUMENT_HASH} from './legal.js';
import {LEGAL_VERSION} from '../shared/legal.js';
import { authEmail } from './auth-email.js';
import { randomBytes, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Express } from 'express';
import { z } from 'zod';
import { Auth, hash, opaque } from './auth.js';
import { AppError, id, now } from './store.js';
import { profileImageSchema, type AccountProfile } from '../shared/accounts.js';
import { saveAccountImage } from './account-images.js';

export type SigninMailer = (email:string,link:string,signup?:boolean)=>Promise<void>;
export function resendSigninMailer(credentialFile:string,from:string):SigninMailer {
  return async(email,link,signup)=>{
    const credential=(await readFile(credentialFile,'utf8')).trim();
    if(!credential)throw new Error('Mail delivery is not configured.');
    const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[email],...authEmail(link,signup)})});
    if(!response.ok)throw new Error('Sign-in email could not be sent.');
    // No provider response, email link or credential is logged.
    await response.body?.cancel();
  };
}
interface Challenge {id:string;email:string;returnTo:string;expiresAt:number;createdAt:string;pendingId?:string}
interface PendingSignin {id:string;code:string;device:string;createdAt:string;expiresAt:number;status:'pending'|'approved'|'denied'|'transferred';userId?:string;returnTo?:string}
function requestingDevice(ua:string){const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Browser';const device=/Tesla/i.test(ua)?'Tesla display':/iPhone/i.test(ua)?'iPhone':/iPad/i.test(ua)?'iPad':/Android/i.test(ua)?'Android device':/Windows/i.test(ua)?'Windows device':/Macintosh/i.test(ua)?'Mac':/Linux/i.test(ua)?'Linux device':'Unknown device';return `${device} · ${browser}`;}
const emailSchema=z.string().trim().toLowerCase().email().max(254);
function returnPath(value:string){
  if(!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/';
  const url=new URL(value,'https://return.invalid');
  if(url.origin!=='https://return.invalid'||url.hash||!/^\/(?:start|console|admin|connect|(?:session|welcome|play)\/[A-Za-z0-9_-]+|view\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?)?$/.test(url.pathname))return '/';
  const allowed=new Set(['authorize','session','account','tab']);
  for(const [key,val] of url.searchParams)if(!allowed.has(key)||!/^[-A-Za-z0-9_]{1,128}$/.test(val))return url.pathname;
  return url.pathname+url.search;
}
export function mountEmailSignin(app:Express,auth:Auth,origin:string,mailer?:SigninMailer,onCreated?:(userId:string)=>unknown,onSignedIn?:(userId:string)=>unknown){
  const pendingCookie=auth.secure?'__Host-kanvas-email-origin':'kanvas-email-origin';
  const cookieOptions={httpOnly:true,secure:auth.secure,sameSite:'strict' as const,path:'/',maxAge:10*60000};
  const pendingKey=(req:import('express').Request)=>typeof req.cookies?.[pendingCookie]==='string'?hash(req.cookies[pendingCookie]):undefined;
  const buckets=new Map<string,{count:number;expiresAt:number}>();
  const limit=(key:string,max:number)=>{const time=Date.now();for(const [k,v] of buckets)if(v.expiresAt<time)buckets.delete(k);if(buckets.size>10000)throw new AppError('RATE_LIMIT','Sign-in is busy. Try again later.',429);const b=buckets.get(key)??{count:0,expiresAt:time+15*60000};b.count++;buckets.set(key,b);if(b.count>max)throw new AppError('RATE_LIMIT','Too many sign-in attempts. Try again later.',429);};
  app.get('/api/auth/options',(_req,res)=>res.json({data:{emailSignin:Boolean(mailer),allowRegistration:auth.allowRegistration,passwordSignin:false}}));
  const requestLink=async(raw:unknown,rateKey:string,linkOrigin=origin,pendingId?:string)=>{
    if(!mailer)throw new AppError('EMAIL_UNAVAILABLE','Email sign-in is not configured on this installation.',503);
    const a=z.object({email:emailSchema,returnTo:z.string().max(300).default('/start'),authorizationRequestId:z.string().regex(/^[A-Za-z0-9_-]+$/).max(128).optional()}).strict().parse(raw);
    let returnTo=returnPath(a.returnTo);
    if(a.authorizationRequestId){const consent=(await auth.store.get<{status:string;expiresAt:string}>('oauth-consent',a.authorizationRequestId));if(!consent||consent.status!=='pending'||Date.parse(consent.expiresAt)<=Date.now())throw new AppError('SIGNIN_CONNECTION_EXPIRED','This connector request expired. Restart its OAuth connection.',410);returnTo=`/?authorize=${a.authorizationRequestId}`;}
    limit(`ip:${rateKey}`,20);limit(`mail:${hash(a.email)}`,5);
    for(const x of (await auth.store.list<Challenge>('email-challenge')))if(x.expiresAt<Date.now())(await auth.store.delete('email-challenge',x.id));
    const user=(await auth.store.db.prepare('SELECT id FROM users WHERE username=?').get(a.email));
    if(user||auth.allowRegistration){
      const token=opaque(),challenge:Challenge={id:hash(token),email:a.email,returnTo,expiresAt:Date.now()+10*60000,createdAt:now(),...(pendingId?{pendingId}:{})};(await auth.store.put('email-challenge',challenge));
      try{await mailer(a.email,`${linkOrigin}/#email-signin=${token}`,!user);}catch{(await auth.store.delete('email-challenge',challenge.id));throw new AppError('EMAIL_DELIVERY','Email delivery is temporarily unavailable. Try again later.',503);}
    }
    return {requested:true,authenticated:false,message:'If this address is eligible, a verification email is on its way. Confirm the email and explicitly approve the connector if offered. No credential is returned here.',startUrl:`${origin}/start`,mcpUrl:`${origin}/mcp`};
  };
  app.post('/api/auth/email/request',async(req,res)=>{
    const secret=opaque(),key=hash(secret),pending:PendingSignin={id:key,code:String(randomInt(100000,1000000)),device:requestingDevice(req.get('user-agent')??''),createdAt:now(),expiresAt:Date.now()+10*60000,status:'pending'};
    // Cookie binds completion to the requesting browser. It is never returned in JSON.
    const result=await requestLink(req.body,req.ip??'unknown',origin,key);
    const previous=pendingKey(req);
    await auth.store.transaction(async()=>{
      for(const old of await auth.store.list<PendingSignin>('email-pending'))if(old.expiresAt<=Date.now()||old.id===previous){await auth.store.delete('email-pending',old.id);for(const challenge of await auth.store.list<Challenge>('email-challenge'))if(challenge.pendingId===old.id)await auth.store.delete('email-challenge',challenge.id);}
      await auth.store.put('email-pending',pending);
    });
    res.cookie(pendingCookie,secret,cookieOptions);res.json({data:{...result,code:pending.code,device:pending.device,expiresAt:pending.expiresAt}});
  });
  app.get('/api/auth/email/status',async(req,res)=>{
    const key=pendingKey(req),pending=key?await auth.store.get<PendingSignin>('email-pending',key):undefined;
    if(!pending||pending.expiresAt<=Date.now())return res.json({data:{status:'expired'}});
    res.json({data:{status:pending.status}});
  });
  app.post('/api/auth/email/complete',async(req,res)=>{
    const key=pendingKey(req);if(!key)throw new AppError('SIGNIN_EXPIRED','Request a new sign-in link.',410);
    const data=await auth.store.transaction(async()=>{
      const pending=await auth.store.get<PendingSignin>('email-pending',key);
      if(!pending||pending.expiresAt<=Date.now()||pending.status!=='approved'||!pending.userId)throw new AppError('SIGNIN_NOT_APPROVED','This device has not been approved, or the request expired.',410);
      await auth.store.delete('email-pending',key);
      await auth.logout(req,res,'replaced');const session=await auth.issueBrowser(pending.userId,res,undefined,req);
      return {user:await auth.user(pending.userId),csrfToken:session.csrf,returnTo:pending.returnTo??'/start'};
    });
    res.clearCookie(pendingCookie,cookieOptions);res.json({data});
  });
  app.post('/api/auth/email/deny',async(req,res)=>{
    limit(`deny:${req.ip}`,30);const a=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(req.body);
    await auth.store.transaction(async()=>{
      const challenge=await auth.store.get<Challenge>('email-challenge',hash(a.token));if(!challenge||challenge.expiresAt<=Date.now())throw new AppError('SIGNIN_EXPIRED','This request expired or was used.',410);
      await auth.store.delete('email-challenge',challenge.id);
      if(challenge.pendingId){const pending=await auth.store.get<PendingSignin>('email-pending',challenge.pendingId);if(pending){pending.status='denied';await auth.store.put('email-pending',pending);}}
    });res.json({data:{denied:true}});
  });
  app.post('/api/auth/email/inspect',async (req,res)=>{
    limit(`inspect:${req.ip}`,30);const a=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(req.body),challenge=(await auth.store.get<Challenge>('email-challenge',hash(a.token)));
    if(!challenge||challenge.expiresAt<=Date.now())throw new AppError('SIGNIN_EXPIRED','This sign-in link expired or was used. Request another.',410);
    const requestId=/^\/\?authorize=([A-Za-z0-9_-]+)$/.exec(challenge.returnTo)?.[1],consent=requestId?(await auth.store.get<{status:string;clientId:string;scopes:string[];expiresAt:string;deviceCode?:string}>('oauth-consent',requestId)):undefined,client=consent?(await auth.store.get<{clientName:string}>('oauth-client',consent.clientId)):undefined;
    const pending=challenge.pendingId?await auth.store.get<PendingSignin>('email-pending',challenge.pendingId):undefined;
    res.json({data:{email:challenge.email,...(pending&&pending.status==='pending'&&pending.expiresAt>Date.now()?{originatingDevice:{code:pending.code,device:pending.device,createdAt:pending.createdAt,expiresAt:pending.expiresAt}}:{}),...(client&&consent?.status==='pending'&&Date.parse(consent.expiresAt)>Date.now()?{connection:{requestId,clientName:client.clientName,scopes:consent.scopes,...(consent.deviceCode?{device:true}:{})}}:{})}});
  });
  app.post('/api/auth/email/consume',async (req,res)=>{
    limit(`consume:${req.ip}`,30);
    const a=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),confirm:z.literal(true),acceptedLegalVersion:z.literal(LEGAL_VERSION),target:z.enum(['current','origin']).default('current'),matchesCode:z.literal(true).optional(),displayName:z.string().trim().min(1).max(80).optional(),avatar:profileImageSchema.optional()}).strict().parse(req.body);
    const key=hash(a.token),challenge=(await auth.store.get<Challenge>('email-challenge',key));
    if(!challenge||challenge.expiresAt<=Date.now())throw new AppError('SIGNIN_EXPIRED','This sign-in link expired or was already used. Request another.',410);
    let userId:string;
    (await auth.store.transaction(async ()=>{
      const current=(await auth.store.get<Challenge>('email-challenge',key));if(!current||current.expiresAt<=Date.now())throw new AppError('SIGNIN_EXPIRED','This sign-in link is no longer valid.',410);
      const pending=current.pendingId?await auth.store.get<PendingSignin>('email-pending',current.pendingId):undefined;
      if(a.target==='origin'&&(!a.matchesCode||!pending||pending.status!=='pending'||pending.expiresAt<=Date.now()))throw new AppError('SIGNIN_CONFIRM_DEVICE','Compare the code on the requesting device and explicitly confirm it before approving.',400);
      const existing=(await auth.store.db.prepare('SELECT id FROM users WHERE username=?').get(current.email)) as {id:string}|undefined;
      if(!existing&&!auth.allowRegistration)throw new AppError('REGISTRATION_CLOSED','This installation is not accepting new accounts.',403);
      userId=existing?.id??id();
      if(!existing)(await auth.store.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(userId,current.email,current.email,`${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`));
      if(!existing)await onCreated?.(userId);
      // Optional profile changes happen only after deliberate email confirmation,
      // in the same transaction. Invalid image bytes cannot consume the link.
      if(a.displayName)(await auth.store.db.prepare('UPDATE users SET display_name=? WHERE id=?').run(a.displayName,userId));
      if(a.avatar){
        const profile=(await auth.store.get<AccountProfile>('profile',userId))??{id:userId,revision:0};
        profile.avatarId=(await saveAccountImage(auth.store,userId,a.avatar,profile.avatarId));profile.revision++;profile.updatedAt=now();(await auth.store.put('profile',profile));
      }
      if(!await auth.store.get('legal-acceptance',`${userId}:${LEGAL_VERSION}`))await auth.store.put('legal-acceptance',{id:`${userId}:${LEGAL_VERSION}`,userId,version:LEGAL_VERSION,documentHash:LEGAL_DOCUMENT_HASH,acceptedAt:now(),method:'email-confirmation'});
      (await auth.store.put('verified-email',{id:userId!,email:current.email,verifiedAt:now()}));
      await onSignedIn?.(userId);
      await auth.store.delete('email-challenge',current.id);
      if(pending){pending.status=a.target==='origin'?'approved':'transferred';if(a.target==='origin'){pending.userId=userId;pending.returnTo=current.returnTo;}await auth.store.put('email-pending',pending);}
    }));
    if(a.target==='origin'){res.json({data:{approved:true}});return;}
    (await auth.logout(req,res,'replaced'));const session=(await auth.issueBrowser(userId!,res,undefined,req));res.json({data:{user:(await auth.user(userId!)),csrfToken:session.csrf,returnTo:challenge.returnTo}});
  });
  return {requestLink};
}
