import { z } from 'zod';

/** Generic schedule planning (meetings, tasks, shifts, personal plans). The
 * planner display's view is the authoritative plan: Kanvas holds, versions,
 * shows and applies decisions. It never proposes, resolves or optimizes. */
export const PLANNER_LIMITS = { items: 200, proposals: 50, categories: 20 } as const;

export const plannerIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/);
const MOMENT = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
const dated = (value: string) => value.length === 10;
const instant = (value: string) => Date.parse(dated(value) ? `${value}T00:00:00Z` : value);
const moment = z.string().max(40).refine(value => MOMENT.test(value) && Number.isFinite(instant(value)), 'Use an ISO date-time with offset (2026-11-06T14:00:00+01:00), or a date (2026-11-06) for all-day items');
export const plannerDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(value => Number.isFinite(instant(value)), 'Use a real date');
const timeZone = z.string().min(1).max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; } }, 'Use an IANA time zone, such as Europe/Oslo');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use #rrggbb');

const itemObject = z.object({
  id: plannerIdSchema,
  title: z.string().min(1).max(120),
  start: moment,
  end: moment,
  allDay: z.boolean().optional().describe('start and end are dates; end is exclusive'),
  category: z.string().min(1).max(40).optional(),
  color: color.optional(),
  notes: z.string().max(500).optional(),
  constraints: z.object({
    notBefore: moment.optional(),
    deadline: moment.optional(),
    bufferAfterMinutes: z.number().int().min(1).max(1440).optional(),
    fixed: z.boolean().optional(),
  }).strict().optional().describe('Declared wishes; Kanvas only flags violations'),
}).strict();
export type PlannerItem = z.infer<typeof itemObject>;

/** Why an item's placement is invalid, if it is. */
export function plannerItemProblem(item: { start?: string; end?: string; allDay?: boolean }): { path: 'start' | 'end'; message: string } | undefined {
  if (typeof item.start !== 'string') return { path: 'start', message: 'start is required' };
  if (typeof item.end !== 'string') return { path: 'end', message: 'end is required' };
  const wrong = (value: string) => Boolean(item.allDay) !== dated(value);
  const format = item.allDay ? 'All-day items use dates (YYYY-MM-DD); end is exclusive' : 'Timed items need a date-time with offset; set allDay for whole days';
  if (wrong(item.start)) return { path: 'start', message: format };
  if (wrong(item.end)) return { path: 'end', message: format };
  const span = instant(item.end) - instant(item.start);
  if (!(span > 0)) return { path: 'end', message: 'end must be after start' };
  if (span > 62 * 86_400_000) return { path: 'end', message: 'An item can span at most 62 days' };
  return undefined;
}
export const plannerItemSchema = itemObject.superRefine((item, ctx) => {
  const problem = plannerItemProblem(item);
  if (problem) ctx.addIssue({ code: 'custom', path: [problem.path], message: problem.message });
});

/** A change for the user to accept or reject: move (changed fields), add (a
 * new item under a new itemId) or remove, always with a reason. */
export const plannerProposalSchema = z.object({
  id: plannerIdSchema,
  action: z.enum(['move', 'add', 'remove']),
  itemId: plannerIdSchema.describe('move/remove: an existing item; add: the new item id'),
  item: itemObject.pick({ title: true, start: true, end: true, allDay: true, category: true, notes: true }).partial().strict().optional().describe('move: changed fields; add: title, start, end and more'),
  reason: z.string().min(1).max(300),
}).strict().superRefine((proposal, ctx) => {
  const fields = Object.keys(proposal.item ?? {});
  const add = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (proposal.action === 'remove' && fields.length) add(['item'], 'remove takes no item fields');
  if (proposal.action === 'move' && !fields.length) add(['item'], 'move needs the changed fields, usually start and end');
  if (proposal.action === 'add') for (const key of ['title', 'start', 'end'] as const) if (proposal.item?.[key] === undefined) add(['item', key], `add needs item.${key}`);
});
export type PlannerProposal = z.infer<typeof plannerProposalSchema>;

export const plannerCategoriesSchema = z.array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(60), color: color.optional() }).strict()).max(PLANNER_LIMITS.categories);

/** The item before and after one proposal, without applying it. */
export function proposalImpact(items: readonly PlannerItem[], proposal: PlannerProposal): { before?: PlannerItem; after?: PlannerItem } {
  if (proposal.action === 'add') return { after: { ...proposal.item, id: proposal.itemId } as PlannerItem };
  const before = items.find(item => item.id === proposal.itemId);
  if (!before) return {};
  return proposal.action === 'remove' ? { before } : { before, after: { ...before, ...proposal.item, id: before.id } };
}

export interface PlannerProblem { path: (string | number)[]; message: string }
/** Cross-reference rules: unique ids, existing targets, a new id for add, one
 * pending proposal per item and a valid placement after each proposal. */
export function plannerProblems(data: { items: readonly PlannerItem[]; proposals: readonly PlannerProposal[]; status?: string }): PlannerProblem[] {
  const problems: PlannerProblem[] = [], items = new Set<string>();
  data.items.forEach((item, index) => { if (items.has(item.id)) problems.push({ path: ['items', index, 'id'], message: `Item id ${item.id} is used twice` }); items.add(item.id); });
  const proposalIds = new Set<string>(), targets = new Set<string>();
  data.proposals.forEach((proposal, index) => {
    if (proposalIds.has(proposal.id)) problems.push({ path: ['proposals', index, 'id'], message: `Proposal id ${proposal.id} is used twice` });
    proposalIds.add(proposal.id);
    if (proposal.action === 'add' ? items.has(proposal.itemId) : !items.has(proposal.itemId)) {
      problems.push({ path: ['proposals', index, 'itemId'], message: proposal.action === 'add' ? `Item ${proposal.itemId} already exists; add needs a new itemId` : `There is no item ${proposal.itemId}` });
      return;
    }
    if (targets.has(proposal.itemId)) problems.push({ path: ['proposals', index, 'itemId'], message: `Item ${proposal.itemId} already has a pending proposal; reuse that proposal id to replace it, or decide it first` });
    targets.add(proposal.itemId);
    const { after } = proposalImpact(data.items, proposal), problem = after && plannerItemProblem(after);
    if (problem) problems.push({ path: ['proposals', index, 'item', problem.path], message: problem.message });
  });
  if (data.status === 'committed' && data.proposals.length) problems.push({ path: ['proposals'], message: 'A committed plan has no pending proposals' });
  return problems;
}

export const calendarViewSchema = z.enum(['day', 'three-day', 'week', 'month']);
export const hourlyWeatherSchema = z.array(z.object({
  time: moment.refine(value => !dated(value), 'Weather needs a date-time with offset'),
  condition: z.enum(['sun', 'partly-cloudy', 'cloudy', 'rain', 'snow', 'thunderstorm']),
  temperature: z.number().finite().min(-150).max(150),
  unit: z.enum(['C', 'F']).default('C'),
  precipitationChance: z.number().min(0).max(100).optional(),
  wind: z.object({ speed: z.number().min(0).max(500), unit: z.enum(['m/s','km/h','mph','kn']).default('m/s'), direction: z.string().max(16).optional() }).strict().optional(),
  sunrise: moment.refine(value => !dated(value), 'Use a date-time with offset').optional(),
  sunset: moment.refine(value => !dated(value), 'Use a date-time with offset').optional(),
}).strict()).max(72).describe('Agent-supplied hourly forecast; shown in day/three-day/week views; optional wind and sunrise/sunset belong to the same strip. No weather is fetched.');
const calendarFields = {
  view: calendarViewSchema.default('week'),
  anchorDate: plannerDaySchema.describe('First visible date for day/three-day; date inside week/month'),
  timeZone,
  categories: plannerCategoriesSchema.optional(),
  weather: hourlyWeatherSchema.optional(),
};
/** A display-only calendar. Deliberately excludes constraints and every planning field. */
export const calendarDataSchema = z.object({
  ...calendarFields,
  items: z.array(itemObject.omit({ constraints: true }).superRefine((item, ctx) => {
    const problem = plannerItemProblem(item);
    if (problem) ctx.addIssue({ code: 'custom', path: [problem.path], message: problem.message });
  })).max(PLANNER_LIMITS.items),
}).strict().superRefine((data, ctx) => {
  for (const problem of plannerProblems({ ...data, proposals: [] })) ctx.addIssue({ code: 'custom', path: problem.path, message: problem.message });
});
export type CalendarData = z.infer<typeof calendarDataSchema>;

export const plannerDataSchema = z.object({
  ...calendarFields,
  status: z.enum(['draft', 'committed']).default('draft'),
  categories: plannerCategoriesSchema.optional(),
  items: z.array(plannerItemSchema).max(PLANNER_LIMITS.items),
  proposals: z.array(plannerProposalSchema).max(PLANNER_LIMITS.proposals).default([]),
  committedAt: moment.optional(),
}).strict().superRefine((data, ctx) => {
  for (const problem of plannerProblems(data)) ctx.addIssue({ code: 'custom', path: problem.path, message: problem.message });
});
export type PlannerData = z.infer<typeof plannerDataSchema>;

/** Apply accepted proposals and drop decided ones; everything else is unchanged. */
export function reviewPlanner(data: PlannerData, accept: ReadonlySet<string>, reject: ReadonlySet<string>): { data: PlannerData; accepted: string[]; rejected: string[] } {
  let items = [...data.items];
  const accepted: string[] = [], rejected: string[] = [];
  for (const proposal of data.proposals) {
    if (reject.has(proposal.id)) { rejected.push(proposal.id); continue; }
    if (!accept.has(proposal.id)) continue;
    accepted.push(proposal.id);
    const { after } = proposalImpact(items, proposal);
    if (proposal.action === 'remove') items = items.filter(item => item.id !== proposal.itemId);
    else if (proposal.action === 'add' && after) items.push(after);
    else if (after) items = items.map(item => item.id === proposal.itemId ? after : item);
  }
  return { data: { ...data, items, proposals: data.proposals.filter(proposal => !accept.has(proposal.id) && !reject.has(proposal.id)) }, accepted, rejected };
}

export interface PlannerConflict { kind: 'overlap' | 'buffer' | 'not-before' | 'deadline'; itemId: string; withItemId?: string; message: string }
/** Overlapping timed items and violated declared constraints. All-day items
 * never overlap. Kanvas only reports conflicts; it never resolves them. */
export function plannerConflicts(items: readonly PlannerItem[]): PlannerConflict[] {
  const timed = items.filter(item => !item.allDay).map(item => ({ item, start: instant(item.start), end: instant(item.end) })).sort((a, b) => a.start - b.start || a.end - b.end);
  const conflicts: PlannerConflict[] = [];
  timed.forEach((a, index) => {
    for (let next = index + 1; next < timed.length && timed[next]!.start < a.end; next++) conflicts.push({ kind: 'overlap', itemId: a.item.id, withItemId: timed[next]!.item.id, message: `${a.item.title} overlaps ${timed[next]!.item.title}` });
    const buffer = a.item.constraints?.bufferAfterMinutes, following = buffer ? timed.slice(index + 1).find(b => b.start >= a.end) : undefined;
    if (buffer && following && following.start - a.end < buffer * 60_000) conflicts.push({ kind: 'buffer', itemId: a.item.id, withItemId: following.item.id, message: `${a.item.title} wants ${buffer} free minutes before ${following.item.title}` });
  });
  for (const item of items) {
    const wishes = item.constraints;
    if (wishes?.notBefore && instant(item.start) < instant(wishes.notBefore)) conflicts.push({ kind: 'not-before', itemId: item.id, message: `${item.title} starts before ${wishes.notBefore}` });
    if (wishes?.deadline && instant(item.end) > instant(wishes.deadline)) conflicts.push({ kind: 'deadline', itemId: item.id, message: `${item.title} ends after its deadline ${wishes.deadline}` });
  }
  return conflicts.slice(0, 200);
}

/** What the user should know before deciding one proposal. */
export function proposalWarnings(data: Pick<PlannerData, 'items'>, proposal: PlannerProposal): string[] {
  const warnings: string[] = [], { before, after } = proposalImpact(data.items, proposal);
  if (before?.constraints?.fixed) warnings.push('Changes an item marked fixed');
  if (after) {
    const created = plannerConflicts([...data.items.filter(item => item.id !== proposal.itemId), after]).filter(conflict => conflict.itemId === after.id || conflict.withItemId === after.id);
    for (const conflict of created.slice(0, 3)) warnings.push(`Would conflict: ${conflict.message}`);
  }
  return warnings;
}

const encoder = new TextEncoder();
function fold(line: string): string {
  let out = '', size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 75) { out += '\r\n '; size = 1; }
    out += char; size += bytes;
  }
  return out;
}
const icsText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsStamp = (value: string) => new Date(instant(value)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Plain iCalendar text for handing a committed plan to a calendar tool.
 * Kanvas never writes to any external calendar itself. */
export function plannerIcs(data: Pick<PlannerData, 'items' | 'committedAt'>, uidScope: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KANVAS//Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const stamp = icsStamp(data.committedAt ?? new Date().toISOString());
  for (const item of data.items) {
    lines.push('BEGIN:VEVENT', `UID:${item.id}.${uidScope}@kanvas`, `DTSTAMP:${stamp}`,
      ...(item.allDay ? [`DTSTART;VALUE=DATE:${item.start.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${item.end.replace(/-/g, '')}`] : [`DTSTART:${icsStamp(item.start)}`, `DTEND:${icsStamp(item.end)}`]),
      `SUMMARY:${icsText(item.title)}`, ...(item.notes ? [`DESCRIPTION:${icsText(item.notes)}`] : []), ...(item.category ? [`CATEGORIES:${icsText(item.category)}`] : []), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

const localFormats = new Map<string, Intl.DateTimeFormat>();
/** Calendar date and minutes after midnight in the plan's time zone. */
export function plannerLocalTime(value: string, timeZone: string): { date: string; minutes: number } {
  if (dated(value)) return { date: value, minutes: 0 };
  let format = localFormats.get(timeZone);
  if (!format) { format = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); localFormats.set(timeZone, format); }
  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(new Date(instant(value)))) parts[part.type] = part.value;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}
