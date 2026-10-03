import { z } from 'zod';

/** Shift roster and coverage views. Kanvas visualises supplied rosters and
 * compares supplied staffing with supplied requirements. It never generates,
 * optimises, completes or judges the feasibility of a roster. */
export const ROSTER_SEGMENTS = ['morning', 'evening', 'night'] as const;
export type RosterSegment = typeof ROSTER_SEGMENTS[number];
export const ROSTER_LIMITS = { days: 371, teamDays: 62, people: 60, shifts: 24, assignments: 5000, roles: 24, requirements: 400, staffing: 5000 } as const;

const DAY_MS = 86_400_000;
const realDate = (value: string) => { const time = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value; };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date').refine(realDate, 'Use a real calendar date');
const identifier = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_.:-]+$/, 'Use letters, digits, _ . : or -');
const text = (max: number) => z.string().max(max).refine(value => value.trim().length > 0, 'Supply meaningful text');
const code = z.string().max(8).refine(value => value.trim().length > 0, 'Use a short code such as D, A, N or W14');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour');
const headcount = z.number().int().min(0).max(9999);

export const rosterDataSchema = z.object({
  mode: z.enum(['individual', 'coverage']).default('individual').describe('individual: one person (or people as rows) and their assigned shifts. coverage: whether supplied staffing meets supplied per-shift role requirements.'),
  start: day.describe('First date shown (YYYY-MM-DD).'),
  end: day.describe(`Last date shown; at most ${ROSTER_LIMITS.days} days from start (a week up to a year).`),
  person: z.string().max(120).optional().describe('Name of the person for a single-person roster.'),
  people: z.array(z.object({ id: identifier, name: text(120) }).strict()).min(1).max(ROSTER_LIMITS.people).optional().describe(`Several people as rows (team roster, up to ${ROSTER_LIMITS.teamDays} days). Each assignment then names its person.`),
  shifts: z.array(z.object({
    id: identifier,
    label: text(80).describe('Shift name for the legend, for example Day shift or Vacation.'),
    code: code.optional().describe('Free-text code shown in day cells, for example D, A, N or W14. Defaults to the first letter of label.'),
    segment: z.enum(ROSTER_SEGMENTS).optional().describe('Where in the day the shift falls: morning, evening (afternoon/evening) or night. Omit for whole-day types such as leave, a course or on-call.'),
    color: color.optional(),
    icon: z.enum(['sun', 'sunset', 'moon', 'none']).optional(),
  }).strict()).min(1).max(ROSTER_LIMITS.shifts).describe('Shift types: free-text codes, time-of-day segment and optional colour.'),
  assignments: z.array(z.object({
    date: day, shift: identifier, person: identifier.optional(),
    code: code.optional().describe('Per-day code override.'), note: z.string().max(200).optional(),
  }).strict()).max(ROSTER_LIMITS.assignments).default([]).describe('Individual mode: one entry per assigned shift. Days without an entry are free days.'),
  roles: z.array(z.object({ id: identifier, label: text(80), color: color.optional() }).strict()).min(1).max(ROSTER_LIMITS.roles).optional().describe('Coverage mode: open role names such as Doctor, Nurse, Support, DevOps or Product manager.'),
  requirements: z.array(z.object({
    shift: identifier,
    dates: z.array(day).min(1).max(ROSTER_LIMITS.days).optional().describe('Apply only on these dates (wins over weekday and general rules).'),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional().describe('ISO weekdays, 1 = Monday to 7 = Sunday (wins over a general rule).'),
    roles: z.array(z.object({ role: identifier, min: headcount, max: headcount.optional() }).strict()).max(ROSTER_LIMITS.roles).default([]),
    totalMin: headcount.optional().describe('Total staff floor across all roles.'), totalMax: headcount.optional(),
  }).strict()).min(1).max(ROSTER_LIMITS.requirements).optional().describe('Coverage mode: minimum/maximum headcount per role and a total floor per shift. Specific dates win over weekday rules, which win over general rules.'),
  staffing: z.array(z.object({
    date: day, shift: identifier, role: identifier, name: z.string().max(120).optional(),
    count: z.number().int().min(1).max(9999).optional().describe('Aggregated headcount; default 1 (one named person).'),
  }).strict()).max(ROSTER_LIMITS.staffing).default([]).describe('Coverage mode: who (or how many) is actually assigned per date, shift and role.'),
  appearance: z.enum(['session', 'light']).optional().describe('light forces the light roster palette on any session theme.'),
  showDayCounts:z.boolean().optional().describe('Team individual mode: show per-day counts for each supplied shift type beneath people rows.'),
  showTotals: z.boolean().optional().describe('Show per-shift totals and free days (default true).'),
}).strict().superRefine((data, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const span = Math.round((Date.parse(`${data.end}T00:00:00Z`) - Date.parse(`${data.start}T00:00:00Z`)) / DAY_MS) + 1;
  if (!(span >= 1)) { issue(['end'], 'end must be on or after start'); return; }
  if (span > ROSTER_LIMITS.days) issue(['end'], `Show at most ${ROSTER_LIMITS.days} days; split longer rosters.`);
  const inRange = (date: string) => date >= data.start && date <= data.end;
  const unique = (items: { id: string }[] | undefined, path: string) => {
    const seen = new Set<string>();
    items?.forEach((item, index) => { if (seen.has(item.id)) issue([path, index, 'id'], 'Use unique ids'); seen.add(item.id); });
    return seen;
  };
  const shifts = unique(data.shifts, 'shifts'), people = unique(data.people, 'people'), roles = unique(data.roles, 'roles');
  if (data.mode === 'individual') {
    if (data.requirements?.length || data.staffing.length) issue(['mode'], 'requirements and staffing are used with mode coverage');
    if (data.people && span > ROSTER_LIMITS.teamDays) issue(['end'], `A roster with people rows shows at most ${ROSTER_LIMITS.teamDays} days; show one person or split the period.`);
    const seen = new Set<string>();
    data.assignments.forEach((entry, index) => {
      if (!shifts.has(entry.shift)) issue(['assignments', index, 'shift'], 'Reference a shift id from shifts');
      if (!inRange(entry.date)) issue(['assignments', index, 'date'], 'Keep assignment dates between start and end');
      if (data.people) { if (!entry.person || !people.has(entry.person)) issue(['assignments', index, 'person'], 'Reference a person id from people'); }
      else if (entry.person) issue(['assignments', index, 'person'], 'Assignments name a person only when people are supplied');
      const key = `${entry.person ?? ''}\u0000${entry.date}\u0000${entry.shift}`;
      if (seen.has(key)) issue(['assignments', index], 'Duplicate assignment for this date and shift');
      seen.add(key);
    });
    return;
  }
  if (data.assignments.length) issue(['assignments'], 'Coverage mode uses staffing, not assignments');
  if (data.people) issue(['people'], 'Coverage mode uses staffing entries, not people rows');
  if (!data.requirements?.length) issue(['requirements'], 'Coverage mode needs at least one requirement');
  data.requirements?.forEach((rule, index) => {
    if (!shifts.has(rule.shift)) issue(['requirements', index, 'shift'], 'Reference a shift id from shifts');
    rule.dates?.forEach((date, j) => { if (!inRange(date)) issue(['requirements', index, 'dates', j], 'Keep requirement dates between start and end'); });
    if (!rule.roles.length && rule.totalMin === undefined && rule.totalMax === undefined) issue(['requirements', index], 'Give role minimums or a total');
    rule.roles.forEach((role, j) => {
      if (!roles.has(role.role)) issue(['requirements', index, 'roles', j, 'role'], 'Reference a role id from roles');
      if (role.max !== undefined && role.max < role.min) issue(['requirements', index, 'roles', j, 'max'], 'max must be at least min');
    });
    if (rule.totalMin !== undefined && rule.totalMax !== undefined && rule.totalMax < rule.totalMin) issue(['requirements', index, 'totalMax'], 'totalMax must be at least totalMin');
  });
  data.staffing.forEach((entry, index) => {
    if (!shifts.has(entry.shift)) issue(['staffing', index, 'shift'], 'Reference a shift id from shifts');
    if (!roles.has(entry.role)) issue(['staffing', index, 'role'], 'Reference a role id from roles');
    if (!inRange(entry.date)) issue(['staffing', index, 'date'], 'Keep staffing dates between start and end');
  });
});
export type RosterData = z.infer<typeof rosterDataSchema>;
export type RosterShift = RosterData['shifts'][number];
type Requirement = NonNullable<RosterData['requirements']>[number];

export const rosterAddDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
export function rosterDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (let date = start; date <= end && days.length <= ROSTER_LIMITS.days; date = rosterAddDays(date, 1)) days.push(date);
  return days;
}
export interface RosterMonth { month: string; weeks: (string | null)[][] }
/** Each month of the range as Monday-first week rows (months never share a
 * row, so a month label can span its rows). Dates outside the range are null. */
export function rosterMonths(start: string, end: string): RosterMonth[] {
  const months: RosterMonth[] = [];
  for (let first = `${start.slice(0, 7)}-01`; first <= end;) {
    const next = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 1)).toISOString().slice(0, 10);
    const cells: (string | null)[] = Array<null>(isoWeekday(first) - 1).fill(null);
    for (let date = first; date < next; date = rosterAddDays(date, 1)) cells.push(date >= start && date <= end ? date : null);
    while (cells.length % 7) cells.push(null);
    const weeks = Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7)).filter(week => week.some(Boolean));
    months.push({ month: first, weeks });
    first = next;
  }
  return months;
}
/** The free-text code exactly as supplied, else the label's first letter. */
export const shiftCode = (shift: Pick<RosterShift, 'code' | 'label'>) => shift.code?.trim() || Array.from(shift.label.trim())[0]?.toUpperCase() || '?';
export const segmentRank = (segment?: RosterSegment) => segment ? ROSTER_SEGMENTS.indexOf(segment) : ROSTER_SEGMENTS.length;
/** Assigned shift counts per shift id (optionally for one person) and free days. */
export function rosterTotals(data: RosterData, person?: string): { counts: Map<string, number>; free: number } {
  const counts = new Map<string, number>(), busy = new Set<string>();
  for (const entry of data.assignments) if (person === undefined || entry.person === person) { counts.set(entry.shift, (counts.get(entry.shift) ?? 0) + 1); busy.add(entry.date); }
  return { counts, free: rosterDays(data.start, data.end).length - busy.size };
}

export type CoverageStatus = 'met' | 'under' | 'over';
export interface CoverageRole { role: string; label: string; actual: number; min: number; max?: number; status: CoverageStatus }
export interface CoverageSlot { date: string; shift: RosterShift; roles: CoverageRole[]; actual: number; required: number; totalMax?: number; status: CoverageStatus; names: string[] }
/** The rule for one shift on one date: specific dates, then weekdays, then general; the last matching rule of a kind wins. */
export function coverageRequirement(data: RosterData, shift: string, date: string): Requirement | undefined {
  let general: Requirement | undefined, weekday: Requirement | undefined, specific: Requirement | undefined;
  const dayOfWeek = isoWeekday(date);
  for (const rule of data.requirements ?? []) {
    if (rule.shift !== shift) continue;
    if (rule.dates) { if (rule.dates.includes(date)) specific = rule; }
    else if (rule.weekdays) { if (rule.weekdays.includes(dayOfWeek)) weekday = rule; }
    else general = rule;
  }
  return specific ?? weekday ?? general;
}
const statusOf = (actual: number, min?: number, max?: number): CoverageStatus => min !== undefined && actual < min ? 'under' : max !== undefined && actual > max ? 'over' : 'met';
/** Compare supplied staffing with supplied requirements for every required slot, keyed by date. */
export function coverageSlots(data: RosterData): Map<string, CoverageSlot[]> {
  const counts = new Map<string, number>(), totals = new Map<string, number>(), names = new Map<string, string[]>();
  for (const entry of data.staffing) {
    const slot = `${entry.date}\u0000${entry.shift}`, amount = entry.count ?? 1;
    counts.set(`${slot}\u0000${entry.role}`, (counts.get(`${slot}\u0000${entry.role}`) ?? 0) + amount);
    totals.set(slot, (totals.get(slot) ?? 0) + amount);
    if (entry.name) { const list = names.get(slot); if (list) list.push(entry.name); else names.set(slot, [entry.name]); }
  }
  const roleLabel = new Map((data.roles ?? []).map(role => [role.id, role.label]));
  const shifts = [...data.shifts].sort((a, b) => segmentRank(a.segment) - segmentRank(b.segment));
  const result = new Map<string, CoverageSlot[]>();
  for (const date of rosterDays(data.start, data.end)) {
    const slots: CoverageSlot[] = [];
    for (const shift of shifts) {
      const rule = coverageRequirement(data, shift.id, date);
      if (!rule) continue;
      const key = `${date}\u0000${shift.id}`;
      const roles = rule.roles.map(role => { const actual = counts.get(`${key}\u0000${role.role}`) ?? 0; return { role: role.role, label: roleLabel.get(role.role) ?? role.role, actual, min: role.min, ...(role.max !== undefined ? { max: role.max } : {}), status: statusOf(actual, role.min, role.max) }; });
      const actual = totals.get(key) ?? 0, required = rule.totalMin ?? rule.roles.reduce((sum, role) => sum + role.min, 0);
      const statuses = [...roles.map(role => role.status), statusOf(actual, rule.totalMin, rule.totalMax)];
      slots.push({ date, shift, roles, actual, required, ...(rule.totalMax !== undefined ? { totalMax: rule.totalMax } : {}), status: statuses.includes('under') ? 'under' : statuses.includes('over') ? 'over' : 'met', names: names.get(key) ?? [] });
    }
    if (slots.length) result.set(date, slots);
  }
  return result;
}
