import { describe, expect, it, vi } from 'vitest';
import {
  countdownDataSchema, countdownDownDataSchema, countdownUpDataSchema, MAX_TIMER_ELAPSED_SECONDS,
  TIMER_MAX_TIMESTAMP_MS, TIMER_MIN_TIMESTAMP_MS, timerDisplaySeconds, timerNextTickDelay,
  timerPausedSeconds, timerPhase, timerResumeTimestamp, timerSeconds,
} from '../../src/shared/timer.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { safeSchemaIssues } from '../../src/server/rendering/validation.js';
import { createInterpreter } from '../../src/server/rendering/interpreter.js';
import type { RenderingError } from '../../src/server/rendering/errors.js';
import { input } from '../rendering/helpers.js';

const startedAt = '2030-01-01T12:00:00.250Z', start = Date.parse(startedAt);
const up = countdownUpDataSchema.parse({ direction: 'up', startedAt, label: 'Time since launch' });

describe('one timer template with strict directional contracts', () => {
  it('keeps omitted direction and all original countdown defaults byte-for-byte compatible', () => {
    const original = { endsAt: startedAt, label: 'Break', pausedRemainingSeconds: 42.125 };
    expect(countdownDataSchema.parse(original)).toEqual({ ...original, completeText: 'Time is up' });
    expect(countdownDataSchema.parse({ ...original, direction: 'down' })).toEqual({ ...original, direction: 'down', completeText: 'Time is up' });
    expect(countdownDataSchema.parse(up)).toEqual(up);
    expect(up).not.toHaveProperty('endsAt'); expect(up).not.toHaveProperty('completeText');
  });

  it('preserves supplied starts, offsets, fractions, and elapsed periods longer than one year', () => {
    const data = { direction: 'up' as const, startedAt: '2026-10-25T02:30:00.125+02:00', pausedElapsedSeconds: 400 * 86400 + 42.125 };
    expect(countdownDataSchema.parse(data)).toEqual(data);
    expect(timerSeconds(countdownUpDataSchema.parse({ direction: 'up', startedAt: data.startedAt }), Date.parse('2026-10-25T02:30:00.250+01:00'))).toBe(3600.125);
    expect(countdownDataSchema.safeParse({ ...data, pausedElapsedSeconds: MAX_TIMER_ELAPSED_SECONDS }).success).toBe(true);
  });

  it.each([
    { data: { direction: 'up', endsAt: 'PRIVATE_INSTANT' }, field: 'startedAt', rule: 'ISO 8601' },
    { data: { direction: 'up', startedAt, endsAt: 'PRIVATE_INSTANT' }, field: 'endsAt', rule: 'remove endsAt' },
    { data: { direction: 'up', startedAt, completeText: 'PRIVATE_COMPLETION' }, field: 'completeText', rule: 'no completed state' },
    { data: { direction: 'up', startedAt, pausedRemainingSeconds: 42 }, field: 'pausedRemainingSeconds', rule: 'pausedElapsedSeconds' },
    { data: { endsAt: startedAt, startedAt: 'PRIVATE_INSTANT' }, field: 'startedAt', rule: 'requires direction "up"' },
    { data: { direction: 'down', endsAt: startedAt, pausedElapsedSeconds: 42 }, field: 'pausedElapsedSeconds', rule: 'pausedRemainingSeconds' },
    { data: { direction: 'PRIVATE_DIRECTION', startedAt }, field: 'direction', rule: 'Use direction "down"' },
    { data: { direction: 'up', startedAt: 'PRIVATE_AMBIGUOUS_TIME' }, field: 'startedAt', rule: 'explicit timezone' },
  ])('returns actionable safe paths for $field', ({ data, field, rule }) => {
    const parsed = countdownDataSchema.safeParse(data);
    expect(parsed.success).toBe(false); if (parsed.success) return;
    const publicIssues = validationIssues(parsed.error, 'data');
    const sourceIssues = safeSchemaIssues(parsed.error, ['data']);
    expect(publicIssues).toEqual(expect.arrayContaining([expect.objectContaining({ path: `data.${field}`, problem: expect.stringContaining(rule) })]));
    expect(sourceIssues).toEqual(expect.arrayContaining([expect.objectContaining({ path: `data.${field}`, rule: expect.stringContaining(rule) })]));
    expect(JSON.stringify([publicIssues, sourceIssues])).not.toContain('PRIVATE_');
  });

  it.each(['2030-02-31T12:00:00Z', '2030-01-01T12:00:00', '2030-01-01', ''])('never fabricates a start instant from %s', invalid => {
    expect(countdownDataSchema.safeParse({ direction: 'up', startedAt: invalid }).success).toBe(false);
  });

  it.each([-1, NaN, Infinity, MAX_TIMER_ELAPSED_SECONDS + 1])('rejects unsupported elapsed snapshots: %s', pausedElapsedSeconds => {
    expect(countdownDataSchema.safeParse({ ...up, pausedElapsedSeconds }).success).toBe(false);
  });
});

describe('elapsed time, tick boundaries and pure pause/resume arithmetic', () => {
  it('rounds elapsed down, remaining up, and never rounds the stored pause snapshot', () => {
    expect(timerSeconds(up, start + 999)).toBe(.999);
    expect(timerDisplaySeconds(up, start + 999)).toBe(0);
    expect(timerDisplaySeconds(up, start + 1000)).toBe(1);
    expect(timerDisplaySeconds(up, start + 1999)).toBe(1);
    const down = countdownDownDataSchema.parse({ endsAt: startedAt });
    expect(timerDisplaySeconds(down, start - 999)).toBe(1);
    expect(timerDisplaySeconds(down, start - 1001)).toBe(2);
    const paused = countdownUpDataSchema.parse({ ...up, pausedElapsedSeconds: 42.125 });
    expect(timerPausedSeconds(paused)).toBe(42.125);
    expect(timerDisplaySeconds(paused, start + 900000)).toBe(42);
    expect(timerSeconds(paused, NaN)).toBe(42.125);
    expect(timerPhase(paused, NaN)).toBe('paused');
    expect(paused.pausedElapsedSeconds).toBe(42.125);
  });

  it('distinguishes future starts and never completes an open-ended timer', () => {
    expect(timerPhase(up, start - 1)).toBe('scheduled');
    expect(timerSeconds(up, start - 1)).toBe(0);
    expect(Object.is(timerSeconds(up, start - 1), -0)).toBe(false);
    expect(timerPhase(up, start)).toBe('running');
    expect(timerPhase(up, start + 400 * 86400000)).toBe('running');
    expect(timerDisplaySeconds(up, start + 400 * 86400000)).toBe(400 * 86400);
    expect(timerPhase(countdownDownDataSchema.parse({ endsAt: startedAt }), start)).toBe('complete');
    expect(timerPhase(up, NaN)).toBeUndefined();
  });

  it('schedules in the correct direction and catches up from time rather than missed ticks', () => {
    const down = countdownDownDataSchema.parse({ endsAt: startedAt });
    expect(timerNextTickDelay(up, start)).toBe(1000);
    expect(timerNextTickDelay(up, start + 125)).toBe(875);
    expect(timerNextTickDelay(down, start - 125)).toBe(125);
    expect(timerNextTickDelay(down, start)).toBeUndefined();
    expect(timerNextTickDelay(up, start - 9999999)).toBe(1000);
    expect(timerNextTickDelay(countdownUpDataSchema.parse({ ...up, pausedElapsedSeconds: 0 }), start)).toBeUndefined();
    // No tick history is involved after a long background/suspension interval.
    expect(timerDisplaySeconds(up, start + 86400125)).toBe(86400);
    expect(timerNextTickDelay(up, start + 86400125)).toBe(875);
  });

  it('excludes paused wall time for both directions, preserving millisecond fractions on resume', () => {
    const frozenElapsed = timerSeconds(up, start + 42125), resumeAt = start + 86400000;
    const resumedStart = timerResumeTimestamp('up', frozenElapsed, resumeAt)!;
    const resumed = countdownUpDataSchema.parse({ ...up, startedAt: resumedStart });
    expect(timerSeconds(resumed, resumeAt)).toBe(42.125);
    expect(timerDisplaySeconds(resumed, resumeAt + 874)).toBe(42);
    expect(timerDisplaySeconds(resumed, resumeAt + 875)).toBe(43);
    expect(up.startedAt).toBe(startedAt);

    const resumedEnd = timerResumeTimestamp('down', 42.125, resumeAt)!;
    const down = countdownDownDataSchema.parse({ endsAt: resumedEnd });
    expect(timerSeconds(down, resumeAt)).toBe(42.125);
    expect(timerDisplaySeconds(down, resumeAt + 42124)).toBe(1);
    expect(timerDisplaySeconds(down, resumeAt + 42125)).toBe(0);
  });

  it('does not lose a subsecond stopwatch at zero or accumulate whole-second rounding across repeated pauses', () => {
    const resumedStart = timerResumeTimestamp('up', .001, start)!;
    const resumed = countdownUpDataSchema.parse({ direction: 'up', startedAt: resumedStart });
    expect(timerSeconds(resumed, start)).toBe(.001);
    expect(timerDisplaySeconds(resumed, start + 999)).toBe(1);
    let anchor = up;
    let nowMs = start;
    for (let turn = 1; turn <= 8; turn++) {
      nowMs += 125;
      const snapshot = timerSeconds(anchor, nowMs);
      expect(snapshot).toBe(turn * .125);
      nowMs += 3600000;
      anchor = countdownUpDataSchema.parse({ ...anchor, startedAt: timerResumeTimestamp('up', snapshot, nowMs) });
    }
    expect(timerSeconds(anchor, nowMs)).toBe(1);
  });

  it('refuses invalid/overflowing resume instants instead of switching direction or clamping to a fabricated timestamp', () => {
    expect(timerResumeTimestamp('up', 0, start)).toBe(startedAt);
    expect(timerResumeTimestamp('up', 1, TIMER_MIN_TIMESTAMP_MS)).toBeUndefined();
    expect(timerResumeTimestamp('down', 1, TIMER_MAX_TIMESTAMP_MS)).toBeUndefined();
    for (const seconds of [-1, NaN, Infinity, Number.MAX_VALUE]) expect(timerResumeTimestamp('up', seconds, start)).toBeUndefined();
    expect(timerResumeTimestamp('up', 1, NaN)).toBeUndefined();
    expect(timerResumeTimestamp('up', 1, TIMER_MAX_TIMESTAMP_MS + 1)).toBeUndefined();
  });
});

describe('count-up source integrity without a live provider or database', () => {
  it.each([true])('materializes exact count-up source, explicit template hint: %s', async hint => {
    const interpreter = createInterpreter();
    const data = { direction: 'up' as const, startedAt, label: 'Supplied launch', pausedElapsedSeconds: 42.125 };
    const request = input({ submission: { requestId: 'countup', sessionId: 'session', displayIds: ['display'], data, ...(hint ? { templateHint: 'countdown' as const } : {}) } });
    const original = structuredClone(request);
    const result = await interpreter.interpret(request);
    expect(result.view).toMatchObject({ template: 'countdown', data });
    expect(validateView(result.view).data).toEqual(data);
    expect(request).toEqual(original);
  });

  it('requires an explicit timer selection for unhinted structured data', async () => {
    await expect(createInterpreter().interpret(input({submission:{sessionId:'session',displayIds:['display'],requestId:'unhinted',data:{direction:'up',startedAt}}}))).rejects.toMatchObject({code:'PREPARED_VIEW_REQUIRED'});
  });

  it('rejects absent/fabricated count-up anchors and mixed state before rendering, with safe source diagnostics', async () => {
    const interpreter = createInterpreter();
    for (const data of [{ direction: 'up', label: 'PRIVATE_TIMER_CONTEXT' }, { direction: 'up', startedAt, completeText: 'PRIVATE_COMPLETION' }]) {
      const request = input({ submission: { requestId: 'invalid-countup', sessionId: 'session', displayIds: ['display'], templateHint: 'countdown', data, context: 'Start counting from now.' } });
      const error = await interpreter.interpret(request).catch(error => error) as RenderingError;
      expect(error.code).toBe('MISSING_TIME_SOURCE');
      expect(error.issues?.some(issue => issue.path === 'data.startedAt' || issue.path === 'data.completeText')).toBe(true);
      expect(error.issues?.every(issue => Boolean(issue.rule))).toBe(true);
      expect(JSON.stringify(error.issues)).not.toContain('PRIVATE_');
    }
  });
});
