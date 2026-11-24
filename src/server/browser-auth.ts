import type {Definition} from './mcp/canonical.js';
import {z} from 'zod';
import {hash,fullBrowser,type AuthPrincipal,type BrowserSession,type Token} from './auth.js';
import type {KanvasService} from './domain.js';
import {AppError,now} from './store.js';
const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const browserListSchema=z.object({}).strict();
export const browserRevokeSchema=z.object({browserSessionId:identifier.optional(),all:z.literal(true).optional(),confirm:z.literal(true),requestId:identifier}).strict().refine(a=>Boolean(a.browserSessionId)!==Boolean(a.all),'Choose one browserSessionId or all:true.').meta({oneOf:[{required:['browserSessionId'],not:{required:['all']}},{required:['all'],not:{required:['browserSessionId']}}]});
export async function accountAuthority(service:KanvasService,p:AuthPrincipal,scope='publish'){
 await service.fullAccount(p,scope);
 if(p.pairingId||p.scopedDisplayId||p.captureOnly||p.tokenId&&(await service.store.get<Token>('token',p.tokenId))?.sessionIds!==undefined)throw new AppError('FORBIDDEN','Account-level authority is required.',403);
}
const full=fullBrowser;
const publicId=(b:BrowserSession)=>b.publicId!;
export class BrowserAuth {
 constructor(readonly service:KanvasService){}
 private async rows(userId:string):Promise<BrowserSession[]>{return (await this.service.store.db.prepare("SELECT value FROM documents WHERE kind='browser' AND value::jsonb->>'userId'=?").all(userId)).map(row=>JSON.parse(String(row.value)) as BrowserSession);}

 async list(p:AuthPrincipal,raw:unknown){
  browserListSchema.parse(raw);await accountAuthority(this.service,p);
  const rows:BrowserSession[]=[];
  for(const row of await this.rows(p.userId))if(full(row)&&row.expiresAt>Date.now()){
    const b=row.publicId?row:await this.service.auth.migrateBrowser(row.id);
    if(b&&b.expiresAt>Date.now())rows.push(b);
  }
  const devices=(await this.service.store.db.prepare("SELECT value FROM documents WHERE kind='registered-device' AND value::jsonb->>'ownerId'=?").all(p.userId)).map(row=>JSON.parse(String(row.value)) as {ownerId:string;browserId?:string;name:string;lastSeenAt:string});
  return {browsers:rows.map(b=>({id:publicId(b),createdAt:b.createdAt??null,lastActiveAt:b.lastActiveAt??b.createdAt??null,expiresAt:b.expiresAt,idleExpiresAt:b.idleExpiresAt,absoluteExpiresAt:b.absoluteExpiresAt,device:b.device??'Unknown device',browser:b.browser??'Browser',origin:b.origin??'unknown',current:b.id===p.browserId,devices:devices.filter(d=>d.ownerId===p.userId&&d.browserId===b.id).slice(0,10).map(d=>({name:d.name,lastSeenAt:d.lastSeenAt}))})),scope:'Full account browser cookies only; paired displays and independent OAuth/client grants are separate.',idleDays:this.service.auth.policy.idleMs/86400000,absoluteDays:this.service.auth.policy.absoluteMs/86400000,activityPrecisionHours:this.service.auth.policy.renewalMs/3600000};
 }
 async revoke(p:AuthPrincipal,raw:unknown){return this.service.store.atomic(async()=>{
  const a=browserRevokeSchema.parse(raw);await accountAuthority(this.service,p);
  const key=hash(`browser-revoke:${p.userId}:${a.requestId}`),digest=hash(JSON.stringify(a));
  const prior=await this.service.store.get<{digest:string;count:number}>('browser-revoke-receipt',key);
  if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','Use a new request ID for a different logout.',409);return {revoked:true,count:prior.count};}
  const rows=(await this.rows(p.userId)).filter(b=>b.userId===p.userId&&full(b)&&(a.all||publicId(b)===a.browserSessionId));
  if(a.all||rows.some(b=>b.id!==p.browserId))await this.service.auth.requireFresh(p);
  if(!a.all&&!rows.length)throw new AppError('NOT_FOUND','This account browser session is unavailable.',404);
  for(const b of rows)await this.service.auth.revokeBrowser(b.id,a.all?'revoke-all':'device-revoked');
  await this.service.store.put('browser-revoke-receipt',{id:key,digest,count:rows.length,createdAt:now()});
  return {revoked:true,count:rows.length};
 });}
}
export const browserAuthTools: readonly Definition[] = [
    {
        name: "kanvas.browser.auth.list", summary: "List full-account browser sign-ins when reviewing account access separately from guest pairings and OAuth clients.", description: 'List your actual full-account browser sign-ins (not view-only pairings or OAuth clients). Requires account-level publish authority. Returns management IDs, never cookies or CSRF secrets.', schema: browserListSchema, readOnly: true,
        domain: "account",
        requiredScope: "read" as const,
        discovery: {"group":"access","hint":"List full-account browser sign-ins; excludes view-only pairings and independent OAuth grants. Account publish authority required.","examples":[{}]},
        searchAliases: ["kanvas.browser.auth.list"]
    },
    {
        name: "kanvas.browser.auth.revoke", summary: "Log out selected or all full-account browser sessions when confirmed account sign-ins need their access revoked.", description: 'Explicitly log out one full-account browserSessionId or all:true, including the current browser. Requires account-level publish authority and confirm:true. A stable requestId deduplicates retries; omission generates a new ID each call. Does not revoke independent OAuth clients or view-only pairing grants.', schema: browserRevokeSchema, destructive: true, idempotent: true,
        domain: "account",
        requiredScope: "publish" as const,
        discovery: {"group":"access","hint":"Explicit logout of one management ID or all account browsers. OAuth/client grants and view-only pairings remain separate.","examples":[{"browserSessionId":"browser-management-id","confirm":true,"requestId":"logout-one"},{"all":true,"confirm":true,"requestId":"logout-all"}]},
        searchAliases: ["kanvas.browser.auth.revoke"]
    },
];
