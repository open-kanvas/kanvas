import { configPatchSchema } from './preferences.js';
import type { SessionConfig } from './types.js';
import { z } from 'zod';
import { STYLE_PRESETS } from './styles.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const appearanceSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  style: z.enum(STYLE_PRESETS.map(x=>x.id)).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict();
export const profileImageSchema = z.object({mimeType:z.enum(['image/png','image/jpeg','image/webp']),base64:z.string().min(4).max(350000)}).strict();
export const profileUpdateSchema = z.object({expectedRevision:revision.optional(),displayName:z.string().trim().min(1).max(80).optional(),avatar:profileImageSchema.nullable().optional()}).strict();
export const brandingSchema = z.object({palette:z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8).default([]),logo:profileImageSchema.nullable().optional()}).strict();
export const groupCreateSchema = z.object({kind:z.enum(['organization','team']),name:z.string().trim().min(1).max(100),description:z.string().max(1000).default(''),organizationIds:z.array(id).max(16).default([]),requestId:id}).strict();
export const groupUpdateSchema = z.object({groupId:id,expectedRevision:revision.optional(),name:z.string().trim().min(1).max(100).optional(),description:z.string().max(1000).optional(),organizationIds:z.array(id).max(16).optional(),defaults:z.object(configPatchSchema.shape).omit({syncMode:true,presenterViewerId:true}).strict().optional(),branding:brandingSchema.optional()}).strict();
export const groupMemberSchema = z.object({groupId:id,expectedRevision:revision.optional(),username:z.string().trim().min(1).max(254),role:z.enum(['admin','member']).nullable()}).strict();
export const groupGrantSchema = z.object({sessionId:id,groupId:id,expectedRevision:revision.optional(),role:z.enum(['editor','viewer']).nullable()}).strict();
export const sessionContextSchema = z.object({sessionId:id,expectedRevision:revision.optional(),organizationId:id.nullable().optional(),teamId:id.nullable().optional(),overrides:z.object(configPatchSchema.shape).strict().default({}),showBranding:z.boolean().default(true)}).strict();
export const activityQuerySchema = z.object({sessionId:id.optional(),groupId:id.optional(),since:z.string().datetime().optional(),until:z.string().datetime().optional(),type:z.string().regex(/^[a-z][a-z0-9_.-]{0,99}$/).optional(),afterId:id.optional(),limit:z.number().int().min(1).max(100).default(50)}).strict();
export const analyticsQuerySchema = activityQuerySchema.omit({afterId:true,limit:true}).extend({scope:z.enum(['account','group','service']).default('account')});
export const topologyQuerySchema = z.object({sessionId:id,includeOffline:z.boolean().default(true),includeLocation:z.boolean().default(false),expectedCountries:z.array(z.string().regex(/^[A-Z]{2}$/)).max(32).default([])}).strict();
export type Appearance = z.infer<typeof appearanceSchema>;
export interface Branding {palette:string[];logoUrl?:string;name?:string}
export interface AccountProfile {id:string;revision:number;avatarId?:string;updatedAt?:string}
export interface AccountGroup {id:string;kind:'organization'|'team';name:string;description:string;ownerId:string;revision:number;organizationIds:string[];defaults:Partial<SessionConfig>;branding:Branding;createdAt:string;updatedAt:string}
export interface GroupMember {id:string;groupId:string;userId:string;role:'owner'|'admin'|'member';joinedAt:string}
export interface SessionGroupGrant {id:string;sessionId:string;groupId:string;role:'editor'|'viewer'|null;revision:number;updatedAt:string}
export interface SessionContext {id:string;sessionId:string;organizationId?:string;teamId?:string;overrides:Partial<SessionConfig>;showBranding:boolean;revision:number}
export interface AuditEvent {id:string;at:string;type:string;actorId?:string;subjectId?:string;sessionId?:string;groupId?:string;displayId?:string;details:Record<string,string|number|boolean|null>}
export interface ApproximateLocation {country:string;region?:string;city?:string;lat?:number;lng?:number;accuracyKm?:number;source:'GeoIP';approximate:true}
export interface TopologyConnection {id:string;windowId?:string;windowName?:string;sessionId:string;displayId:string;personId:string;userId?:string;guest:boolean;name:string;deviceId:string;deviceName:string;deviceType:'phone'|'tablet'|'laptop'|'desktop'|'tv'|'unknown';browser:string;joinedAt:string;lastSeenAt:string;connected:boolean;width?:number;height?:number;location?:ApproximateLocation;avatarUrl?:string;groups?:{id:string;kind:string;name:string}[];outlier?:'outside-expected-countries'|'different-from-majority'}
export interface SessionTopology {sessionId:string;name:string;at:string;displays:{id:string;name:string;view?:{template:string;title?:string;label:string};connections:TopologyConnection[]}[];people:{id:string;name:string;guest:boolean;avatarUrl?:string;devices:{id:string;name:string;type:TopologyConnection['deviceType'];connections:TopologyConnection[]}[]}[];counts:{people:number;devices:number;windows:number;offline:number;located:number;unknownLocation:number;outliers:number};locationVisible:boolean;note:string}
