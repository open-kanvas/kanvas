import { asyncMap } from './async-collections.js';
import type { Express, Request } from 'express';
import { z } from 'zod';
import { invitationSchema } from '../shared/invitations.js';
import type { AccountGroup } from '../shared/accounts.js';
import type { AuthPrincipal, Token } from './auth.js';
import { hash } from './auth.js';
import type { KanvasService } from './domain.js';
import { AppError, id, now, required } from './store.js';

const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const invitationAcceptSchema=z.object({invitationId:identifier,confirm:z.literal(true)}).strict();
export const invitationRevokeSchema=z.object({invitationId:identifier}).strict();
interface Invitation {id:string;sessionId:string;ownerId:string;label:string;groupId?:string;createdAt:string;expiresAt:string;alias:string;acceptedBy?:string;acceptedAt?:string;revokedAt?:string}
export class Invitations {
  constructor(readonly service:KanvasService){}
  async create(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {
    const a=invitationSchema.parse(raw);(await this.service.fullAccount(p,'publish'));
    if(p.tokenId&&(await this.service.store.get<Token>('token',p.tokenId))?.sessionIds!==undefined)throw new AppError('FORBIDDEN','General and group invitations need account-level authority.',403);
    if(a.groupId)(await this.service.accounts.group(p,a.groupId,true));
    const key=hash(`invite:${p.userId}:${a.requestId}`),digest=hash(JSON.stringify(a)),receipt=(await this.service.store.get<{digest:string;invitationId:string}>('invite-receipt',key));
    if(receipt){if(receipt.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','Use a new request ID for a different invitation.',409);return (await this.artifact(required((await this.service.store.get<Invitation>('invitation',receipt.invitationId)))));}
    if((await this.service.store.list<Invitation>('invitation')).filter(x=>x.ownerId===p.userId&&!x.revokedAt&&!x.acceptedBy&&Date.parse(x.expiresAt)>Date.now()).length>=50)throw new AppError('LIMIT_REACHED','This account has reached 50 active invitations.',429);
    // Group invitations are single-use and addressed by their unguessable ID,
    // never by the four-character generic-onboarding alias.
    const record:Invitation={id:id(),sessionId:'',ownerId:p.userId,label:a.label,groupId:a.groupId,createdAt:now(),expiresAt:new Date(Date.now()+a.expiresInHours*3600_000).toISOString(),alias:a.groupId?'':(await this.service.experience.addresses.candidate())};
    (await this.service.store.transaction(async ()=>{
      (await this.service.store.put('invitation',record));
      if(record.alias)(await this.service.store.put('alias',{id:record.alias,sessionId:record.sessionId,inviteId:record.id,kind:'random',createdAt:now()}));
      (await this.service.store.put('invite-receipt',{id:key,sessionId:record.sessionId,digest,invitationId:record.id}));
      if(record.groupId)(await this.service.accounts.audit('group.invitation.created',{actorId:p.userId,groupId:record.groupId,details:{invitationId:record.id}}));
    }));return (await this.artifact(record));

    });
  }
  private async artifact(record:Invitation){
    const group=record.groupId?required((await this.service.store.get<AccountGroup>('group',record.groupId)),'This group is unavailable.'):undefined;
    const url=`${this.service.publicUrl}/${group?'welcome/'+record.id:'s/'+record.alias}`;
    const description=group?`Join ${group.name} on KANVAS as a member. Sign in or verify your own account, then explicitly accept this one-person invitation. Membership includes any session access the group has been granted.`:'KANVAS gives conversations a shared visual space for documents, charts, websites and more. Create your own account and connect your AI client to get started.';
    const status=record.revokedAt?'revoked':record.acceptedBy?'accepted':Date.parse(record.expiresAt)<=Date.now()?'expired':'active';
    return {id:record.id,label:record.label,url,description,shareText:`${record.label}\n\n${description}\n\n${url}`,expiresAt:record.expiresAt,...(group?{group:{id:group.id,name:group.name,kind:group.kind},groupRole:'member',singleUse:true}:{}),status,access:group?'Opening the link grants nothing. Explicit authenticated acceptance adds only membership in this group; linked organizations and teams are not joined.':'Opening this link does not grant session, device, or account access.',sent:false};
  }
  private async active(invitationId:string){
    const record=required((await this.service.store.get<Invitation>('invitation',invitationId)),'This invitation is unavailable.');
    if(record.revokedAt)throw new AppError('INVITATION_REVOKED','This invitation has been revoked.',410);
    if(Date.parse(record.expiresAt)<=Date.now())throw new AppError('INVITATION_EXPIRED','This invitation has expired.',410);
    return record;
  }
  async read(invitationId:string){return (await this.artifact((await this.active(invitationId))));}
  async listGroup(p:AuthPrincipal,groupId:string){(await this.service.accounts.group(p,groupId,true));return {invitations:(await asyncMap((await this.service.store.list<Invitation>('invitation')).filter(r=>r.groupId===groupId), async r=>(await this.artifact(r))))};}
  async accept(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {
    const a=invitationAcceptSchema.parse(raw);(await this.service.accounts.account(p,true));
    const r=(await this.active(a.invitationId));if(!r.groupId)throw new AppError('INVALID_INVITATION','Use the welcome flow for this invitation.');
    if(r.acceptedBy&&r.acceptedBy!==p.userId)throw new AppError('INVITATION_USED','This invitation has already been accepted.',409);
    const existing=(await this.service.accounts.member(r.groupId,p.userId));
    if(r.acceptedBy){if(!existing)throw new AppError('MEMBERSHIP_REVOKED','This membership was removed. A new invitation is required.',403);return {accepted:true,alreadyAccepted:true,group:(await this.artifact(r)).group,role:existing.role};}
    // Recheck current inviter authority, not the authority captured at creation.
    const inviter={userId:r.ownerId},group=(await this.service.accounts.group(inviter,r.groupId,true));
    const user=required((await this.service.auth.user(p.userId)));
    return (await this.service.store.transaction(async ()=>{
      if(!existing)(await this.service.accounts.setMember(inviter,{groupId:group.id,expectedRevision:group.revision,username:user.username,role:'member'}));
      r.acceptedBy=p.userId;r.acceptedAt=now();(await this.service.store.put('invitation',r));
      (await this.service.accounts.audit('group.invitation.accepted',{actorId:p.userId,subjectId:p.userId,groupId:group.id,details:{inviterId:r.ownerId,invitationId:r.id,role:existing?.role??'member'}}));
      return {accepted:true,alreadyMember:Boolean(existing),group:{id:group.id,name:group.name,kind:group.kind},role:existing?.role??'member'};
    }));

    });
  }
  async revoke(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {
    const a=invitationRevokeSchema.parse(raw);(await this.service.accounts.account(p,true));
    const r=required((await this.service.store.get<Invitation>('invitation',a.invitationId)),'This invitation is unavailable.');
    if(r.ownerId!==p.userId){if(!r.groupId)throw new AppError('NOT_FOUND','This invitation is unavailable.',404);(await this.service.accounts.group(p,r.groupId,true));}
    if(!r.revokedAt){r.revokedAt=now();(await this.service.store.transaction(async ()=>{(await this.service.store.put('invitation',r));if(r.groupId)(await this.service.accounts.audit('group.invitation.revoked',{actorId:p.userId,groupId:r.groupId,details:{invitationId:r.id}}));}));}
    return {revoked:true,invitationId:r.id,note:'Existing membership is unchanged. Remove a member separately to revoke their access.'};

    });
  }
}
export function mountInvitations(app:Express,invitations:Invitations,browser:(req:Request)=>Promise<Awaited<AuthPrincipal>>){
  app.get('/api/invitations/:id',async (req,res)=>res.json({data:(await invitations.read(String(req.params.id)))}));
  app.post('/api/invitations',async (req,res)=>res.json({data:(await invitations.create((await browser(req)),req.body))}));
  app.post('/api/invitations/:id/accept',async (req,res)=>res.json({data:(await invitations.accept((await browser(req)),{...req.body,invitationId:req.params.id}))}));
  app.post('/api/invitations/:id/revoke',async (req,res)=>res.json({data:(await invitations.revoke((await browser(req)),{...req.body,invitationId:req.params.id}))}));
  app.get('/api/groups/:groupId/invitations',async (req,res)=>res.json({data:(await invitations.listGroup((await browser(req)),String(req.params.groupId)))}));
}
