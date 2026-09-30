import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { countdownDataSchema, TIMER_MAX_TIMESTAMP_MS, TIMER_MIN_TIMESTAMP_MS, TIMER_RESUME_RANGE_RULE, timerPausedSeconds, timerPhase, timerResumeTimestamp, timerSeconds, type CountdownData } from '../shared/timer.js';
import type { UpdateRecord, ViewSpec } from '../shared/types.js';
import { assertJsonBudget, validateView } from '../shared/view-schemas.js';
import type { AuthPrincipal } from './auth.js';
import { displayedLeaf, replaceLeaf } from './engagement.js';
import { InputError, validationIssues } from './input-errors.js';
import { participationCompatible } from './participation.js';
import { AppError } from './store.js';
import type { ViewPatchDisplay, ViewPatchHost } from './view-patch.js';

export const timerControlInput = z.object({
  sessionId: z.string().min(1).max(128),
  displayId: z.string().min(1).max(128),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
    .describe('Current display revision from kanvas_display_current. A new action requires a fresh revision and request ID.'),
  requestId: z.string().min(1).max(128)
    .describe('Stable idempotency key. Retry the exact original action after a lost response; the stored receipt and duration are reused, even after a restart.'),
  action: z.enum(['pause', 'resume'])
    .describe('Pause the active running timer, or resume its stored paused duration. Supports both countdown directions and only the current presentation slide; changes no source text.'),
}).strict();
export type TimerControlInput = z.infer<typeof timerControlInput>;

/** Reuse the patch publication boundary, but never its derived-input identity. */
export interface TimerControlHost extends Pick<ViewPatchHost, 'transaction' | 'display' | 'verifyView'> {
  /** Durable principal/session/request dedupe with kind='timer-control' and the ORIGINAL input. */
  retry(principal: AuthPrincipal, input: TimerControlInput): Promise<Awaited<UpdateRecord | undefined>>;
  /**
   * Recheck authorization, held state, revision/generation and interaction epoch;
   * preserve metadata and compatible participation; atomically record history,
   * a prepared deterministic update, pending delivery and ORIGINAL-input dedupe.
   * Emit invalidations only after the outer transaction commits.
   */
  publish(principal: AuthPrincipal, input: TimerControlInput, before: ViewPatchDisplay, view: ViewSpec): Promise<Awaited<UpdateRecord>>;
  /** Authoritative server milliseconds, read once after authorization/retry/CAS. */
  now?(): number;
}

const inputFields = new Set(['sessionId', 'displayId', 'expectedRevision', 'requestId', 'action']);
function stateConflict(code: string, message: string): never { throw new AppError(code, message, 409); }
function rangeError(message = TIMER_RESUME_RANGE_RULE): never { throw new AppError('TIMER_RANGE', message, 400); }

function parseInput(raw: unknown): TimerControlInput {
  try { assertJsonBudget(raw, 4096, 64); }
  catch { throw new InputError([{ path: 'input', problem: 'Supply one plain JSON timer action within 4096 UTF-8 bytes. Reserved object keys and nonfinite numbers are not supported.' }]); }
  const parsed = timerControlInput.safeParse(raw);
  if (!parsed.success) throw new InputError(validationIssues(parsed.error).map(issue => ({
    ...issue, path: issue.path.split('.').map(part => inputFields.has(part) ? part : 'input').join('.'),
  })));
  return parsed.data;
}

function checkedView(value: unknown): ViewSpec {
  try { return validateView(value); }
  catch (error) {
    throw new InputError(error instanceof z.ZodError ? validationIssues(error, 'view') : [{ path: 'view', problem: 'The timer view exceeds its content or complexity limits.' }], value && typeof value === 'object' && 'template' in value && typeof value.template === 'string' ? value.template : undefined);
  }
}

function transition(data: CountdownData, action: TimerControlInput['action'], nowMs: number): CountdownData {
  if (!Number.isSafeInteger(nowMs) || nowMs < TIMER_MIN_TIMESTAMP_MS || nowMs > TIMER_MAX_TIMESTAMP_MS) rangeError();
  const direction = data.direction === 'up' ? 'up' : 'down';
  if (action === 'pause') {
    const phase = timerPhase(data, nowMs);
    if (phase === 'scheduled') stateConflict('TIMER_NOT_STARTED', 'This count-up has not started yet. Wait until startedAt before pausing; its future start has not been changed.');
    if (phase === 'complete') stateConflict('TIMER_COMPLETE', 'This countdown is already complete. Pausing cannot create remaining time. Publish an explicit new deadline to start a new timer.');
    // Store exact fractional seconds, never the rounded integer on the screen.
    const seconds = timerSeconds(data, nowMs);
    const next = direction === 'up' ? { ...data, pausedElapsedSeconds: seconds } : { ...data, pausedRemainingSeconds: seconds };
    const parsed = countdownDataSchema.safeParse(next);
    if (!parsed.success) rangeError('This duration cannot be stored as a paused timer. Down timers support at most 31,536,000 remaining seconds; count-up supports the duration range of ISO years 0000–9999. Use a supported timer duration.');
    return parsed.data;
  }
  const instant = timerResumeTimestamp(direction, timerPausedSeconds(data)!, nowMs);
  if (instant === undefined) rangeError();
  if (data.direction === 'up') {
    const next = { ...data, startedAt: instant };
    delete next.pausedElapsedSeconds;
    return next;
  }
  const next = { ...data, endsAt: instant };
  delete next.pausedRemainingSeconds;
  return next;
}

/** Atomic pause/resume of one existing timer; no interpreter or timer tick job. */
export class TimerControls {
  constructor(private readonly host: TimerControlHost) {}

  async control(principal: AuthPrincipal, raw: unknown): Promise<Awaited<UpdateRecord>> {
    const input = parseInput(raw);
    return (await this.host.transaction(async () => {
      // Authorization (including ended-session/display scopes) remains live on
      // every replay. Time and state checks MUST follow original-input dedupe.
      const before = (await this.host.display(principal, input.sessionId, input.displayId));
      const previous = (await this.host.retry(principal, input));
      if (previous) return previous;
      if (before.revision !== input.expectedRevision) stateConflict('REVISION_CONFLICT', 'This view changed. Read kanvas_display_current and retry the new timer action with its revision and a new request ID.');
      if (before.held) stateConflict('DISPLAY_HELD', 'This display is held. Release the display hold before changing its timer.');
      if (!before.view) throw new AppError('NOT_TIMER', 'There is no active timer. Publish a countdown or count-up view first.');
      if (before.revision === Number.MAX_SAFE_INTEGER || before.generation === Number.MAX_SAFE_INTEGER) rangeError('This display cannot accept another revision. Create a new display before continuing.');
      const original = checkedView(before.view), leaf = displayedLeaf(original);
      if (leaf?.template !== 'countdown') throw new AppError('NOT_TIMER', 'The active view is not a timer. Select a countdown/count-up view or its presentation slide first.');
      const data = countdownDataSchema.parse(leaf.data), paused = timerPausedSeconds(data) !== undefined;
      if (input.action === 'pause' && paused) stateConflict('TIMER_ALREADY_PAUSED', 'This timer is already paused. Use resume to continue, or retry the exact original pause request ID to retrieve its receipt.');
      if (input.action === 'resume' && !paused) stateConflict('TIMER_NOT_PAUSED', 'This timer has no paused duration to resume. Read its current state; pause it first if needed, or retry the exact original resume request ID.');
      const nextData = transition(data, input.action, this.host.now?.() ?? Date.now());
      const candidate = checkedView(replaceLeaf(original, nextData));
      const verified = checkedView((await this.host.verifyView(principal, input.sessionId, structuredClone(candidate))));
      if (!isDeepStrictEqual(candidate, verified) || !participationCompatible(original, verified)) {
        stateConflict('TIMER_SOURCE_CONFLICT', 'Source validation would change unrelated display data. Refresh the current view before controlling its timer.');
      }
      const current = (await this.host.display(principal, input.sessionId, input.displayId));
      if (current.revision !== before.revision || current.generation !== before.generation || current.interactionEpoch !== before.interactionEpoch) {
        stateConflict('REVISION_CONFLICT', 'The display changed while validating this timer action. Read its current revision and retry with a new request ID.');
      }
      if (current.held) stateConflict('DISPLAY_HELD', 'This display was held while validating the timer action. Release the hold before retrying.');
      return (await this.host.publish(principal, input, before, verified));
    }));
  }
}
