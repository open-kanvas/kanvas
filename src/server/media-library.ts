import {z} from 'zod';
import {validateMedia} from './rendering/media.js';
import {AppError,id,now,required} from './store.js';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import type {Definition} from './mcp/canonical.js';
const key=z.string().min(1).max(128);
export const mediaUploadSchema=z.object({name:z.string().min(1).max(200),mimeType:z.enum(['image/png','image/jpeg','image/webp','image/gif']),base64:z.string().max(14000000),tags:z.array(z.string().max(80)).max(20).default([])}).strict();
export interface LibraryMedia {id:string;sessionId:string;ownerId:string;name:string;mimeType:string;size:number;tags:string[];url:string;createdAt:string}
export const mediaTools: Definition[] = [
    {
        name: "kanvas.media.import", schema: z.object({ sessionId: key, assetId: key, tags: z.array(z.string().max(80)).max(20).default([]) }).strict(), description: 'Save an existing authorized session image asset as a separate private reusable account-library item. Full account publishing access required. Supports PNG/JPEG/WebP/GIF; session asset remains unchanged. Returns a new mediaId and stable /api/media/ID URL; reuse it across future sessions. Browser upload: /admin?account=media.',
        domain: "import",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Save a session image to your reusable private account library.","examples":[{"sessionId":"session-id","assetId":"asset-id","tags":["lunch"]}]},
        searchAliases: ["kanvas.media.import"]
    },
    {
        name: "kanvas.media.list", schema: z.object({ query: z.string().max(200).optional(), tag: z.string().max(80).optional(), offset: z.number().int().min(0).max(200).default(0), limit: z.number().int().min(1).max(50).default(50) }).strict(), readOnly: true, description: "List/search your private reusable uploaded image library by filename or tag. User uploads using file/photo/camera picker in Account \u2192 Media library at /admin?account=media; no agent file tool required. Session kanvas_call with operationId:\"kanvas.asset.import\" and arguments:{\u2026} is separate: copy an existing asset with kanvas_call with operationId:\"kanvas.media.import\" and arguments:{\u2026} to make it account-reusable. The returned stable /api/media/ID URL works in every image URL field. Publication grants viewing of that image only to the selected session; listing stays private.",
        domain: "account",
        requiredScope: "read",
        discovery: {"group":"content","hint":"Use the discovered schema for this account-scoped or live state operation.","examples":[{"query":"lunch"}]},
        searchAliases: ["kanvas.media.list"]
    },
    {
        name: "kanvas.media.get", schema: z.object({ mediaId: key }).strict(), readOnly: true, description: 'Get one of your uploaded media items and its stable protected image URL.',
        domain: "account",
        requiredScope: "read",
        discovery: {"group":"content","hint":"Use the discovered schema for this account-scoped or live state operation.","examples":[{"mediaId":"media-id"}]},
        searchAliases: ["kanvas.media.get"]
    },
];
export class MediaLibrary{
 constructor(private s:KanvasService){}
 async importAsset(p:AuthPrincipal,sessionId:string,assetId:string,tags:string[]=[]){await this.s.fullAccount(p,'publish');await this.s.accounts.account(p,true);const asset=await this.s.asset(p,assetId,sessionId);const row=required(await this.s.store.db.prepare('SELECT bytes FROM assets WHERE id=?').get(assetId)) as {bytes:Uint8Array};return this.upload(p,{name:asset.name,mimeType:asset.mimeType,base64:Buffer.from(row.bytes).toString('base64'),tags});}
 async list(p:AuthPrincipal,query='',tag?:string){await this.s.accounts.account(p);return (await this.s.store.list<LibraryMedia>('library-media',p.userId)).filter(m=>m.ownerId===p.userId&&(!query||m.name.toLowerCase().includes(query.toLowerCase())||m.tags.some(t=>t.toLowerCase().includes(query.toLowerCase())))&&(!tag||m.tags.includes(tag)));}
 async own(p:AuthPrincipal,key:string){await this.s.accounts.account(p);const m=await this.s.store.get<LibraryMedia>('library-media',key);if(!m||m.ownerId!==p.userId)throw new AppError('NOT_FOUND','Media unavailable.',404);return m;}
 async upload(p:AuthPrincipal,raw:unknown){await this.s.accounts.account(p,true);const input=mediaUploadSchema.parse(raw),media=validateMedia(input);return this.s.store.atomic(async()=>{const list=await this.list(p);if(list.length>=200||list.reduce((n,m)=>n+m.size,0)+media.size>200*1024*1024)throw new AppError('LIMIT_REACHED','Library limit: 200 images / 200 MiB.',429);const mediaId=id(),record:LibraryMedia={id:mediaId,sessionId:p.userId,ownerId:p.userId,name:input.name,mimeType:media.mimeType,size:media.size,tags:input.tags,url:'/api/media/'+mediaId,createdAt:now()};await this.s.store.db.prepare('INSERT INTO assets(id,bytes) VALUES(?,?)').run(mediaId,media.bytes);await this.s.store.put('library-media',record);return record;});}
 async read(p:AuthPrincipal,key:string){const m=required(await this.s.store.get<LibraryMedia>('library-media',key));if(m.ownerId===p.userId&&!p.scopedSessionId){try{await this.s.accounts.account(p);return m;}catch(error){if(!(error instanceof AppError)||error.code!=='FORBIDDEN')throw error;}}const grants=await this.s.store.list<{sessionId:string;mediaId:string}>('library-media-grant');for(const g of grants.filter(g=>g.mediaId===key)){try{await this.s.access(p,g.sessionId);return m;}catch{}}throw new AppError('NOT_FOUND','Media unavailable.',404);}
 async authorizeReferences(p:AuthPrincipal,sessionId:string,value:unknown):Promise<void>{
  const urls=new Set<string>();const scan=(v:unknown)=>{if(typeof v==='string'&&/^\/api\/media\/[A-Za-z0-9_-]+$/.test(v))urls.add(v);else if(v&&typeof v==='object')Object.values(v).forEach(scan);};scan(value);
  for(const url of urls){const key=url.slice('/api/media/'.length);const m=await this.s.store.get<LibraryMedia>('library-media',key);if(!m)throw new AppError('NOT_FOUND','Media unavailable.',404);const existing=await this.s.store.get('library-media-grant',key+':'+sessionId);if(m.ownerId===p.userId&&!existing)await this.s.accounts.account(p,true);if(m.ownerId!==p.userId){const grant=await this.s.store.get<{sessionId:string}>('library-media-grant',key+':'+sessionId);if(!grant)throw new AppError('NOT_FOUND','Media is not authorized for this session.',404);await this.s.access(p,sessionId);}}
 }
 async grantReferences(sessionId:string,value:unknown){const urls=new Set<string>();const scan=(v:unknown)=>{if(typeof v==='string'&&/^\/api\/media\/[A-Za-z0-9_-]+$/.test(v))urls.add(v);else if(v&&typeof v==='object')Object.values(v).forEach(scan);};scan(value);for(const url of urls){const mediaId=url.slice('/api/media/'.length);await this.s.store.put('library-media-grant',{id:mediaId+':'+sessionId,sessionId,mediaId});}}

}
