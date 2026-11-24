import type {Definition} from './mcp/canonical.js';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {hash,type AuthPrincipal} from './auth.js';
import {accountAuthority} from './browser-auth.js';
import type {KanvasService} from './domain.js';
import {AppError,now} from './store.js';
import {shareForAdmission} from './sharing.js';
const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const inviteSendSchema=z.object({requestId:identifier,invitationId:identifier.optional(),shareId:identifier.optional(),email:z.string().trim().toLowerCase().email().max(254).refine(v=>!/[\r\n]/.test(v)),confirm:z.literal(true)}).strict().refine(a=>Boolean(a.invitationId)!==Boolean(a.shareId),'Choose invitationId or shareId.').meta({oneOf:[{required:['invitationId'],not:{required:['shareId']}},{required:['shareId'],not:{required:['invitationId']}}]});
export interface InviteMessage {subject:string;text:string}
export type InviteMailer=(email:string,message:InviteMessage,idempotencyKey:string)=>Promise<void>;
export function resendInviteMailer(credentialFile:string,from:string):InviteMailer{return async(email,message,idempotencyKey)=>{
 const credential=(await readFile(credentialFile,'utf8')).trim();if(!credential)throw new Error('Mail delivery is not configured.');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from,to:[email],...message})});
 await response.body?.cancel();if(!response.ok)throw new Error('Invitation email could not be sent.');
};}
interface Dispatch {id:string;ownerId:string;recipientHash:string;digest:string;createdAt:string;status:'queued'|'sending'|'sent'|'failed';}
/** Explicit, at-most-one attempt outbox. Committed receipt precedes external I/O.
 * Never automatically retry an uncertain send, including across a process crash. */
export class InviteEmail {
 mailer?:InviteMailer;
 constructor(readonly service:KanvasService){}
 private async message(p:AuthPrincipal,a:z.infer<typeof inviteSendSchema>):Promise<InviteMessage>{
  await accountAuthority(this.service,p);
  if(a.invitationId){const invite=await this.service.invitations.forEmail(p,a.invitationId);return {subject:'Invitation to KANVAS',text:`You have been invited to KANVAS.\n\n${invite.group?'Sign in or verify your own account, then explicitly accept this one-person group membership invitation.':'KANVAS gives conversations a shared visual space. Sign in or create your own account to get started.'}\n\n${invite.url}\n\nExpires: ${invite.expiresAt}\nOpening this link does not sign you in or approve a browser. If unexpected, ignore this email.`};}
  const share=await shareForAdmission(this.service.store,a.shareId!);await this.service.access(p,share.sessionId,'owner');
  if(share.ownerId!==p.userId)throw new AppError('NOT_FOUND','This invitation is unavailable.',404);
  return {subject:'KANVAS display invitation',text:`You have been invited to a shared KANVAS display.\n\n${this.service.publicUrl}/join/${share.id}\n\nExpires: ${share.expiresAt}\nOpening the invitation requests access; owner approval is required. It does not grant account or session membership. If unexpected, ignore this email.`};
 }
 private result(r:Dispatch){return {requestAccepted:true,dispatchId:r.id,status:r.status,sent:r.status==='sent',note:'Delivery is attempted at most once for this request ID. Reuse the exact request to check status; queued/sending after a restart is uncertain, not permission to resend. Recipient account existence is never looked up.'};}
 async send(p:AuthPrincipal,raw:unknown){return this.service.store.atomic(async()=>{
  const a=inviteSendSchema.parse(raw);await accountAuthority(this.service,p);
  if(!this.mailer)throw new AppError('INVITE_EMAIL_UNAVAILABLE','Invitation email is not enabled on this installation. Share the invitation link instead.',503);
  const key=hash(`invite-email:${p.userId}:${a.requestId}`),digest=hash(JSON.stringify(a));
  const prior=await this.service.store.get<Dispatch>('invite-email-dispatch',key);
  if(prior){if(prior.ownerId!==p.userId||prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','Use a new request ID for a different invitation email.',409);return this.result(prior);}
  await this.message(p,a);
  const recipientHash=hash(a.email),time=Date.now(),hour=new Date(time-3600000).toISOString(),day=new Date(time-86400000).toISOString();
  // Aggregate bounded rate counters in PostgreSQL; historical receipt payloads
  // never materialize in application memory. Receipts remain for exact retries.
  const counts=await this.service.store.db.prepare(`SELECT
    COUNT(*) FILTER (WHERE value::jsonb->>'ownerId'=? AND value::jsonb->>'createdAt'>?) AS owner_hour,
    COUNT(*) FILTER (WHERE value::jsonb->>'ownerId'=?) AS owner_day,
    COUNT(*) FILTER (WHERE value::jsonb->>'recipientHash'=?) AS recipient_day,
    COUNT(*) FILTER (WHERE value::jsonb->>'createdAt'>?) AS total_hour
    FROM documents WHERE kind='invite-email-dispatch' AND value::jsonb->>'createdAt'>?`).get(p.userId,hour,p.userId,recipientHash,hour,day);
  if(Number(counts?.owner_hour)>=10||Number(counts?.owner_day)>=50||Number(counts?.recipient_day)>=3||Number(counts?.total_hour)>=100)throw new AppError('RATE_LIMIT','Invitation email limit reached. Try again later.',429);
  const record:Dispatch={id:key,ownerId:p.userId,recipientHash,digest,createdAt:now(),status:'queued'};
  await this.service.store.put('invite-email-dispatch',record);
  // Address/content live only in this process closure, never in an outbox row.
  // Recheck current inviter/grant authority after commit, before claiming dispatch.
  this.service.store.afterCommit(async()=>{
   try{
    const message=await this.service.store.atomic(async()=>{
     const row=await this.service.store.get<Dispatch>('invite-email-dispatch',key);if(!row||row.status!=='queued')return;
     const message=await this.message(p,a);row.status='sending';await this.service.store.put('invite-email-dispatch',row);return message;
    });
    if(!message)return;
    await this.mailer!(a.email,message,key);
    await this.finish(key,'sent');
   }catch{await this.finish(key,'failed');}
  });
  return this.result(record);
 });}
 private async finish(key:string,status:'sent'|'failed'){await this.service.store.atomic(async()=>{const row=await this.service.store.get<Dispatch>('invite-email-dispatch',key);if(row){row.status=status;await this.service.store.put('invite-email-dispatch',row);}});}
}
export const inviteEmailTools: readonly Definition[] = [{
        name: "kanvas.invite.send", description: 'Explicitly send one invitation email to email using an existing onboarding/group invitationId OR session display shareId. Requires account-level publish authority, current owner/admin permission and confirm:true. A stable requestId deduplicates retries; omission generates a new ID each call. Never sent by invite.create/share.create. Bounded at-most-once dispatch; exact retries check status, not resend. Opening a link never signs in or grants account access.', schema: inviteSendSchema, idempotent: true, openWorld: true,
        domain: "members",
        requiredScope: "publish" as const,
        discovery: {"group":"access","hint":"Examples are syntax, NOT authorization. Explicit email dispatch only. Create an onboarding invitation or session display share first. Exact retries check dispatch status without resending.","examples":[{"invitationId":"invitation-id","email":"recipient@example.com","confirm":true,"requestId":"send-onboarding"},{"shareId":"share-id","email":"recipient@example.com","confirm":true,"requestId":"send-display"}]},
        searchAliases: ["kanvas.invite.send"]
    }];
