import { asyncFilter } from './async-collections.js';
import { randomInt } from 'node:crypto';
import type { SessionRecord, DisplayRecord } from '../shared/types.js';
import type { AuthPrincipal } from './auth.js';
import type { KanvasService } from './domain.js';
import { AppError, now, required } from './store.js';
import { shareForAdmission } from './sharing.js';

export const SHORT_ALPHABET='abcdefghjkmnpqrstuvwxyz23456789';
export interface ShortAddress {id:string;sessionId:string;displayId?:string;shareId?:string;inviteId?:string;ownerId?:string;kind?:'random'|'custom';createdAt:string;expiresAt?:number}
const day=86400_000;
export class ShortAddresses {
  constructor(readonly service:KanvasService){}
  private async entitled(userId:string){const entitlement=(await this.service.store.get<{customAddresses:boolean;expiresAt:number}>('address-entitlement',userId));return entitlement?.customAddresses===true&&entitlement.expiresAt>Date.now();}
  private async active(a:ShortAddress){return (!a.expiresAt||a.expiresAt>Date.now())&&(a.kind!=='custom'||Boolean(a.ownerId&&(await this.entitled(a.ownerId))));}
  async existing(sessionId:string,displayId?:string,shareId?:string){return (await asyncFilter((await this.service.store.list<ShortAddress>('alias',sessionId)), async x=>!x.inviteId&&x.displayId===displayId&&x.shareId===shareId&&(await this.active(x)))).sort((a,b)=>Number(b.kind==='custom')-Number(a.kind==='custom'))[0];}
  private async reclaim(){
    const s=this.service.store;
    for(const a of (await s.list<ShortAddress>('alias'))){
      // Issued pre-migration addresses are permanent compatibility locators.
      if(!a.kind)continue;
      if(a.kind==='custom'){if(!(await this.active(a)))(await s.delete('alias',a.id));continue;}
      if(a.inviteId){const invite=(await s.get<{expiresAt:string}>('invitation',a.inviteId));if(!invite||Date.parse(invite.expiresAt)+day<Date.now())(await s.delete('alias',a.id));continue;}
      const session=(await s.get<SessionRecord>('session',a.sessionId));
      if(!session){(await s.delete('alias',a.id));continue;}
      const latest=Math.max(Date.parse(a.createdAt),Date.parse(session.updatedAt),...(await s.list<DisplayRecord>('display',session.id)).map(d=>Date.parse(d.updatedAt)),...(await s.list<{observedAt:string}>('viewer',session.id)).map(v=>Date.parse(v.observedAt)));
      if(session.endedAt?Date.parse(session.endedAt)+7*day<Date.now():latest+90*day<Date.now())(await s.delete('alias',a.id));
    }
  }
  async candidate(){(await this.reclaim());for(let attempt=0;attempt<128;attempt++){let value='';for(let i=0;i<4;i++)value+=SHORT_ALPHABET[randomInt(SHORT_ALPHABET.length)];if(!(await this.service.store.get('alias',value)))return value;}throw new AppError('ALIAS_CAPACITY','Short address capacity is busy. The canonical URL still works.',503);}
  async reserve(sessionId:string,displayId?:string,shareId?:string):Promise<Awaited<ShortAddress>> {
    return this.service.store.atomic(async () => {
    const old=(await this.existing(sessionId,displayId,shareId));if(old)return old;
    const a:ShortAddress={id:(await this.candidate()),sessionId,displayId,shareId,kind:'random',createdAt:now()};(await this.service.store.put('alias',a));return a;

    });
  }
  async customize(p:AuthPrincipal,a:{sessionId:string;displayId?:string;alias:string|null}){
    return this.service.store.atomic(async () => {
    (await this.service.fullAccount(p,'publish'));const session=(await this.service.access(p,a.sessionId,'owner'));if(a.displayId)(await this.service.display(p,a.sessionId,a.displayId));
    if(a.alias!==null&&!(await this.entitled(p.userId)))throw new AppError('FEATURE_UNAVAILABLE','Custom addresses require an active custom-address entitlement from this installation. Random short addresses remain available.',403);
    if(a.alias!==null&&(!/^[a-z][a-z0-9]{4,31}$/.test(a.alias)||['admin','login','oauth','support','billing','kanvas','welcome'].includes(a.alias)))throw new AppError('INVALID_ALIAS','Choose 5–32 lowercase letters and numbers, starting with a letter. Reserved names are unavailable.');
    return (await this.service.store.transaction(async ()=>{
      const existing=a.alias?(await this.service.store.get<ShortAddress>('alias',a.alias)):undefined;
      if(existing&&(existing.kind!=='custom'||existing.ownerId!==p.userId||existing.sessionId!==a.sessionId||existing.displayId!==a.displayId)&&(await this.active(existing)))throw new AppError('ALIAS_UNAVAILABLE','That custom address is already reserved.',409);
      for(const old of (await this.service.store.list<ShortAddress>('alias',a.sessionId)))if(old.kind==='custom'&&old.displayId===a.displayId&&!old.shareId)(await this.service.store.delete('alias',old.id));
      if(a.alias)(await this.service.store.put('alias',{id:a.alias,sessionId:session.id,displayId:a.displayId,ownerId:p.userId,kind:'custom',createdAt:now(),expiresAt:Date.now()+90*day}));
      const result=(await this.reserve(a.sessionId,a.displayId));return {alias:result.id,url:`${this.service.publicUrl}/s/${result.id}`,expiresAt:result.expiresAt,access:'locator-only',note:'Custom leases last 90 days; repeat this explicit operation to renew while entitled. Canonical IDs and access controls are unchanged.'};
    }));

    });
  }
  async resolve(value:string){
    const a=required((await this.service.store.get<ShortAddress>('alias',value)),'This short address is unavailable.');
    if(!(await this.active(a)))throw new AppError('NOT_FOUND','This short address has expired.',404);
    if(a.inviteId){const invite=(await this.service.store.get<{expiresAt:string}>('invitation',a.inviteId));if(!invite||Date.parse(invite.expiresAt)<=Date.now())throw new AppError('NOT_FOUND','This invitation has expired.',404);return `/welcome/${a.inviteId}`;}
    const session=(await this.service.store.get<SessionRecord>('session',a.sessionId));if(!session||session.endedAt)throw new AppError('NOT_FOUND','This short address is unavailable.',404);
    if(a.shareId){(await shareForAdmission(this.service.store,a.shareId));return `/join/${a.shareId}`;}
    return a.displayId?`/view/${a.sessionId}/${a.displayId}`:`/session/${a.sessionId}`;
  }
}
