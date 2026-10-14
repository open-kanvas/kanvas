import { z } from 'zod';
import { isSafeUrl } from './urls.js';

// Source contracts, not executable dashboards. Free-form statuses and fields
// preserve the vocabulary of the connected system instead of inventing states.
const text=z.string().max(4000), label=z.string().min(1).max(300), id=z.string().min(1).max(200);
const url=z.string().max(2048).refine(isSafeUrl,'Supply a public HTTP(S) or protected asset URL.');
const value=z.union([z.string().max(8000),z.number().finite(),z.boolean(),z.null()]);
const fields=z.record(z.string().min(1).max(100).refine(k=>!['__proto__','constructor','prototype'].includes(k)),value).refine(v=>Object.keys(v).length<=30,'At most 30 fields per record.');
const stamp=z.string().max(100); // Preserve the source's displayed timestamp and timezone.
const unique=<T extends {id:string}>(v:T[])=>new Set(v.map(x=>x.id)).size===v.length;
export const emailMessageSchema=z.object({id,from:label,to:z.array(label).max(100).default([]),cc:z.array(label).max(100).default([]),subject:z.string().max(1000),timestamp:stamp.optional(),body:z.string().max(100_000),snippet:z.boolean().default(false)}).strict();
export const emailDataSchema=z.object({messages:z.array(emailMessageSchema).min(1).max(100).refine(unique,'Message IDs must be unique.')}).strict();
export const inboxDataSchema=z.object({items:z.array(z.object({id,from:label.describe('Sender display name or email. Prefer the name; check full/raw From headers when summaries omit it, then fall back to the address.'),subject:z.string().max(1000),snippet:text.optional(),timestamp:stamp.optional(),unread:z.boolean().default(false)}).strict()).max(1000).refine(unique,'Message IDs must be unique.'),pageSize:z.number().int().min(1).max(1000).default(1000).describe('Display-only list. Page or scroll through supplied summaries; publish email separately to read a fetched message.')}).strict();
export const chatMessageSchema=z.object({id,sender:label,timestamp:stamp.optional(),text:z.string().min(1).max(20_000)}).strict();
export const chatDataSchema=z.object({style:z.enum(['lines','bubbles']).default('lines').describe('Additive visual style; bubbles for informal messaging, lines for work conversations.'),selfSender:label.optional().describe('Explicit sender name to align on the trailing side in bubble mode; never inferred.'),channel:label.optional().describe('Legacy conversation label; prefer contextLabel and conversationLabel.'),contextLabel:label.optional().describe('Optional broad context: Slack workspace, Discord server, WhatsApp/app name, or omit for a DM. Free text, not a platform-specific hierarchy.'),conversationLabel:label.optional().describe('Specific conversation: Slack/Discord channel, WhatsApp group, or the other person in a DM. Adapt to the source platform.'),participants:z.array(label).max(200).optional().describe('Optional supplied participant names, for any messaging platform; do not infer membership.'),messages:z.array(chatMessageSchema).max(1000).refine(unique,'Message IDs must be unique.'),followLatest:z.boolean().default(true)}).strict();
export const cardsDataSchema=z.object({items:z.array(z.object({id,title:label,description:text.optional(),status:label.optional(),statusColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),labels:z.array(label).max(20).optional(),assignees:z.array(label).max(20).optional(),fields:fields.optional(),url:url.optional()}).strict()).max(1000).refine(unique,'Card IDs must be unique.')}).strict();
export const recordDetailDataSchema=z.object({
  id,title:label,status:label.optional(),statusColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),assignees:z.array(label).max(20).optional(),
  description:z.string().max(100_000).optional(),fields:fields.optional(),url:url.optional(),
  activity:z.array(z.object({id,author:label,timestamp:stamp.optional(),text:z.string().min(1).max(20_000)}).strict()).max(200).refine(unique,'Activity IDs must be unique.').optional(),
  related:z.array(z.object({id,type:label,title:label,url:url.optional()}).strict()).max(100).optional(),
}).strict();
export type RecordDetailData=z.infer<typeof recordDetailDataSchema>;
export const bookmarksDataSchema=z.object({items:z.array(z.object({id,title:label,url,category:label.optional(),favicon:url.optional()}).strict()).max(500).refine(unique,'Bookmark IDs must be unique.')}).strict();
const parameter=z.object({name:label,type:label,required:z.boolean(),description:text.optional()}).strict();
export const toolDetailDataSchema=z.object({name:label,integration:label.optional(),description:text.optional(),parameters:z.array(parameter).max(200),returns:text.optional()}).strict();
export const toolInventoryDataSchema=z.object({activeGroup:label.optional().describe('Initially selected integration name. The left index remains visible; navigation.control page steps between integrations.'),groups:z.array(z.object({name:label,description:text.optional(),tools:z.array(z.object({name:label,description:text.optional(),detail:toolDetailDataSchema.optional()}).strict()).max(500)}).strict()).max(50)}).strict().refine(v=>!v.activeGroup||v.groups.some(g=>g.name===v.activeGroup),'activeGroup must name a supplied integration.');
const statusItem=z.object({id,name:label,status:label.optional(),detail:text.optional(),fields:fields.optional()}).strict();
export const developerDataSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('pull-request'),title:label,description:z.string().max(20_000).optional(),status:label.optional(),author:label.optional(),base:label.optional(),head:label.optional(),files:z.array(z.object({path:label,status:label.optional(),additions:value.optional(),deletions:value.optional()}).strict()).max(1000),checks:z.array(statusItem).max(100).default([]),approvals:z.array(statusItem).max(100).default([])}).strict(),
  z.object({kind:z.literal('pipeline'),name:label.optional(),stages:z.array(statusItem.extend({jobs:z.array(statusItem).max(100).optional()})).max(100)}).strict(),
  z.object({kind:z.literal('commits'),commits:z.array(z.object({id,message:label,author:label.optional(),timestamp:stamp.optional(),branch:label.optional(),parents:z.array(id).max(8).default([])}).strict()).max(1000).refine(unique,'Commit IDs must be unique.')}).strict(),
  z.object({kind:z.literal('review'),path:label,code:z.string().max(100_000).optional(),startLine:z.number().int().positive().default(1),threads:z.array(z.object({id,line:z.number().int().positive(),status:label.optional(),comments:z.array(chatMessageSchema).min(1).max(100)}).strict()).max(200)}).strict(),
]);
export const operationsDataSchema=z.object({kind:z.enum(['environments','alerts','access','cost','rollout']),title:label.optional(),period:label.optional(),items:z.array(statusItem).max(1000).refine(unique,'Record IDs must be unique.'),stages:z.array(statusItem).max(100).optional()}).strict();
export const WORK_TEMPLATE_IDS=['email','inbox','chat','cards','record-detail','bookmarks','tool-inventory','tool-detail','developer','operations','code-workspace'] as const;
export const workSchemas={email:emailDataSchema,inbox:inboxDataSchema,chat:chatDataSchema,cards:cardsDataSchema,'record-detail':recordDetailDataSchema,bookmarks:bookmarksDataSchema,'tool-inventory':toolInventoryDataSchema,'tool-detail':toolDetailDataSchema,developer:developerDataSchema,operations:operationsDataSchema};
export type EmailData=z.infer<typeof emailDataSchema>;
export type InboxData=z.infer<typeof inboxDataSchema>;
export type ChatData=z.infer<typeof chatDataSchema>;
export type CardsData=z.infer<typeof cardsDataSchema>;
export type BookmarksData=z.infer<typeof bookmarksDataSchema>;
export type ToolInventoryData=z.infer<typeof toolInventoryDataSchema>;
export type ToolDetailData=z.infer<typeof toolDetailDataSchema>;
export type DeveloperData=z.infer<typeof developerDataSchema>;
export type OperationsData=z.infer<typeof operationsDataSchema>;
