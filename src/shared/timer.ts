import { z } from 'zod';

/** Public schema guidance, never an exception or supplied value. */
export const COUNTDOWN_ENDS_AT_RULE = 'Supply endsAt as an existing ISO 8601 timestamp with an explicit timezone (Z or +HH:MM / -HH:MM), for example 2030-01-01T12:00:00Z.';
export const COUNTUP_STARTED_AT_RULE = 'For direction "up", supply startedAt as an existing ISO 8601 timestamp with an explicit timezone (Z or +HH:MM / -HH:MM), for example 2030-01-01T12:00:00Z.';
export const TIMER_DIRECTION_RULE = 'Use direction "down" (the default) with endsAt, or direction "up" with startedAt. Do not mix fields from the two directions.';
export const COUNTDOWN_TARGET_TIME_RULE = `targetTime is not a supported countdown field. Use endsAt instead for direction "down", or startedAt for direction "up". ${COUNTDOWN_ENDS_AT_RULE}`;

// A stopwatch has no one-year limit or implicit completion deadline. The
// arithmetic bound is the entire range of the supported four-digit ISO years.
export const TIMER_MIN_TIMESTAMP_MS = Date.parse('0000-01-01T00:00:00Z');
export const TIMER_MAX_TIMESTAMP_MS = Date.parse('9999-12-31T23:59:59.999Z');
export const MAX_TIMER_ELAPSED_SECONDS = (TIMER_MAX_TIMESTAMP_MS - TIMER_MIN_TIMESTAMP_MS) / 1000;
export const TIMER_RESUME_RANGE_RULE = 'The resumed timer anchor must remain an existing ISO timestamp in years 0000–9999. Supply a finite, nonnegative paused duration and a valid server time.';

/** Match the original countdown contract, including real calendar dates. */
export function isTimerTimestamp(value: string): boolean {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return false;
  const calendarDay = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(calendarDay) && new Date(calendarDay).toISOString().slice(0, 10) === value.slice(0, 10) && Number.isFinite(Date.parse(value));
}

export const countdownDownDataSchema = z.object({
  direction: z.literal('down').optional().describe('Counts down to endsAt. Omitting direction preserves the original countdown behavior.'),
  endsAt: z.string().max(60).refine(isTimerTimestamp, COUNTDOWN_ENDS_AT_RULE).describe(COUNTDOWN_ENDS_AT_RULE),
  label: z.string().max(500).optional(),
  completeText: z.string().min(1).max(500).default('Time is up'),
  pausedRemainingSeconds: z.number().finite().min(0).max(31_536_000).optional(),
  startedAt: z.never().optional(),
  pausedElapsedSeconds: z.never().optional(),
}).strict();
export const countdownUpDataSchema = z.object({
  direction: z.literal('up'),
  startedAt: z.string().max(60).refine(isTimerTimestamp, COUNTUP_STARTED_AT_RULE).describe(COUNTUP_STARTED_AT_RULE),
  label: z.string().max(500).optional(),
  pausedElapsedSeconds: z.number().finite().min(0).max(MAX_TIMER_ELAPSED_SECONDS).optional().describe('Exact elapsed seconds frozen while paused; elapsed display rounds down, and resume excludes time spent paused.'),
  endsAt: z.never().optional(),
  completeText: z.never().optional(),
  pausedRemainingSeconds: z.never().optional(),
}).strict();
export const countdownDataSchema = z.discriminatedUnion('direction', [countdownDownDataSchema, countdownUpDataSchema]);
export type CountdownDownData = z.infer<typeof countdownDownDataSchema>;
export type CountdownUpData = z.infer<typeof countdownUpDataSchema>;
export type CountdownData = z.infer<typeof countdownDataSchema>;
export type TimerDirection = 'down' | 'up';
export type TimerPhase = 'scheduled' | 'running' | 'paused' | 'complete';

/** Schema-owned diagnostics only. Never forward Zod text or received values. */
export function timerValidationRule(issue: z.core.$ZodIssue): string | undefined {
  const field = issue.path.at(-1);
  if (field === 'direction' && issue.code === 'invalid_union' && 'discriminator' in issue && issue.discriminator === 'direction') return TIMER_DIRECTION_RULE;
  if (issue.code === 'invalid_type' && issue.expected === 'never') {
    if (field === 'endsAt') return 'endsAt is only valid for direction "down". For an open-ended count-up use direction "up" with startedAt; remove endsAt.';
    if (field === 'completeText') return 'completeText is only valid for direction "down". Count-up has no completed state; remove completeText.';
    if (field === 'pausedRemainingSeconds') return 'pausedRemainingSeconds is only valid for direction "down". Use pausedElapsedSeconds with direction "up" instead.';
    if (field === 'startedAt') return 'startedAt requires direction "up". Set direction "up" and remove endsAt, or keep direction "down" and remove startedAt.';
    if (field === 'pausedElapsedSeconds') return 'pausedElapsedSeconds requires direction "up". Use pausedRemainingSeconds for a down-counting timer.';
  }
  if (['invalid_type', 'custom', 'invalid_format'].includes(issue.code)) {
    if (field === 'startedAt') return COUNTUP_STARTED_AT_RULE;
    if (field === 'endsAt') return COUNTDOWN_ENDS_AT_RULE;
  }
  return undefined;
}

export function timerPausedSeconds(data: CountdownData): number | undefined {
  return data.direction === 'up' ? data.pausedElapsedSeconds : data.pausedRemainingSeconds;
}

/** Exact duration for pause/control math; rounding belongs only to the display. */
export function timerSeconds(data: CountdownData, nowMs: number): number {
  const paused = timerPausedSeconds(data);
  return Math.max(0, paused ?? (data.direction === 'up' ? nowMs - Date.parse(data.startedAt) : Date.parse(data.endsAt) - nowMs) / 1000);
}

export function timerDisplaySeconds(data: CountdownData, nowMs: number): number {
  const seconds = timerSeconds(data, nowMs);
  return data.direction === 'up' ? Math.floor(seconds) : Math.ceil(seconds);
}

export function timerPhase(data: CountdownData, nowMs: number): TimerPhase | undefined {
  if (timerPausedSeconds(data) !== undefined) return 'paused';
  if (!Number.isFinite(nowMs)) return undefined;
  if (data.direction === 'up') return nowMs < Date.parse(data.startedAt) ? 'scheduled' : 'running';
  return nowMs >= Date.parse(data.endsAt) ? 'complete' : 'running';
}

/** Pure checked resume math, not a mutation or a command. The caller owns CAS. */
export function timerResumeTimestamp(direction: TimerDirection, seconds: number, nowMs: number): string | undefined {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(nowMs) || nowMs < TIMER_MIN_TIMESTAMP_MS || nowMs > TIMER_MAX_TIMESTAMP_MS) return undefined;
  const instant = Math.round(nowMs + (direction === 'up' ? -1 : 1) * seconds * 1000);
  if (!Number.isSafeInteger(instant) || instant < TIMER_MIN_TIMESTAMP_MS || instant > TIMER_MAX_TIMESTAMP_MS) return undefined;
  return new Date(instant).toISOString();
}

/** Wake/reflow checks always recompute from the clock; neither mode counts ticks. */
export function timerNextTickDelay(data: CountdownData, nowMs: number): number | undefined {
  if (timerPausedSeconds(data) !== undefined || !Number.isFinite(nowMs)) return undefined;
  const delta = data.direction === 'up' ? nowMs - Date.parse(data.startedAt) : Date.parse(data.endsAt) - nowMs;
  if (!Number.isFinite(delta) || data.direction !== 'up' && delta <= 0) return undefined;
  if (data.direction === 'up' && delta < 0) return Math.max(10, Math.min(1000, -delta));
  return Math.max(10, data.direction === 'up' ? 1000 - delta % 1000 : delta % 1000 || 1000);
}

/** Round up only for display, never discard a stored fractional remainder. */
export function countdownRemainingSeconds(data: Pick<CountdownDownData, 'endsAt' | 'pausedRemainingSeconds'>, now: number): number {
  return Math.max(0, Math.ceil(data.pausedRemainingSeconds ?? (Date.parse(data.endsAt) - now) / 1000));
}

export function countdownParts(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return { days: Math.floor(value / 86_400), hours: Math.floor(value % 86_400 / 3600), minutes: Math.floor(value % 3600 / 60), seconds: value % 60 };
}

export function formatCountdown(seconds: number): string {
  const parts = countdownParts(seconds);
  return `${parts.days ? `${parts.days}d ` : ''}${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}:${String(parts.seconds).padStart(2, '0')}`;
}
