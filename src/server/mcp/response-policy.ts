import {RHYTHM_NUDGE} from '../../shared/philosophy.js';

/** Which repeated blocks a response carries. State decides, never a guess
 * about how capable the client model is: first contact, a change, an error, a
 * missing target or a session without a connected display. Nothing here infers
 * or reacts to failure counts. */
export type GuidancePreference = 'concise' | 'full';
/** A connection that has been silent this long is greeted as a new contact. */
export const CONTACT_IDLE_MS = 30 * 60_000;
const MAX_CONTACTS = 5000;
interface Contact { seenAt: number; guidance?: string; rhythm: Set<string>; board?: number }
export interface ContactState { first: boolean; contact: Contact }
/** Process-local and bounded. A restart greets every connection once more. */
export class ContactLedger {
  private contacts = new Map<string, Contact>();
  observe(key: string, at = Date.now()): ContactState {
    const known = this.contacts.get(key), first = !known || at - known.seenAt > CONTACT_IDLE_MS;
    const contact = first ? { seenAt: at, rhythm: new Set<string>() } : known!;
    contact.seenAt = at; this.contacts.delete(key); this.contacts.set(key, contact);
    if (this.contacts.size > MAX_CONTACTS) this.contacts.delete(this.contacts.keys().next().value!);
    return { first, contact };
  }
  clear(): void { this.contacts.clear(); }
}
export interface ResponseContext {
  preference?: GuidancePreference;
  /** Explicit full opt-in retains complete orientation independently of the guidance default. */
  fullOrientation?: boolean;
  /** false when the targeted session has no connected display. */
  displayConnected?: boolean;
  displayNameHint?: string;
  manage?: unknown;
  /** What people pointed at since this connection's previous call; present only when there is something new. */
  pointing?: unknown;
  /** Opt-in message board notice: new public messages since the account last looked. */
  messageBoard?: { newMessages: number; note: string };
}
const guidanceSignature = (guidance: unknown): string => {
  const levels = guidance && typeof guidance === 'object' && Array.isArray((guidance as { levels?: unknown }).levels) ? (guidance as { levels: { scope?: string; id?: string; revision?: number }[] }).levels : [];
  return `${levels.map(level => `${level.scope}:${level.id ?? ''}:${level.revision ?? 0}`).join('|')}`;
};
const confirmed = (data: Record<string, unknown> | undefined): boolean => {
    const delivery = data?.delivery;
    if (!delivery || typeof delivery !== 'object') return false;
    const outcomes = Object.values(delivery);
    return outcomes.length > 0 && outcomes.every(value => value && typeof value === 'object' && value.status === 'applied');
};
/** Pure decision: returns the structured result to send. `structured` is the
 * tool's own result; it is never mutated. */
export function applyResponsePolicy(structured: Record<string, unknown> | undefined, input: {
    state: ContactState;
    context: ResponseContext;
    guidance: unknown;
    isError: boolean;
    operation?: string;
    sessionId?: string;
}): {
    structured?: Record<string, unknown>;
    extra?: Record<string, unknown>;
} {
    // Guidance repeats by default; only this connection can reduce repetition.
    const { state, context, guidance } = input, full = context.preference !== 'concise';
    const signature = guidanceSignature(guidance), changed = state.contact.guidance !== undefined && state.contact.guidance !== signature;
    const sendGuidance = full || state.first || changed;
    state.contact.guidance = signature;
    const additions: Record<string, unknown> = {};
    if (guidance)
        additions.agentGuidance = sendGuidance
            ? { ...(guidance as Record<string, unknown>), ...(changed && !state.first ? { changed: true } : {}) }
            : { unchanged: true, note: 'Same guidance as sent earlier on this connection.' };
    if (context.pointing && !input.isError)
        additions.pointing = context.pointing;
    // Opt-in only, and once per number: at the start of a conversation or when a session is created.
    if (context.messageBoard && !input.isError && (state.first || input.operation === "kanvas.session.create") && state.contact.board !== context.messageBoard.newMessages) {
        state.contact.board = context.messageBoard.newMessages;
        additions.messageBoard = context.messageBoard;
    }
    const data = structured?.data && typeof structured.data === 'object' ? structured.data as Record<string, unknown> : undefined;
    if (!input.isError && input.operation && input.sessionId && confirmed(data) && !state.contact.rhythm.has(input.sessionId)) {
        state.contact.rhythm.add(input.sessionId);
        additions.rhythm = RHYTHM_NUDGE;
    }
    if (!structured)
        return { extra: Object.keys(additions).length ? additions : undefined };
    let result: Record<string, unknown> = { ...structured };
    const orientation = structured.orientation && typeof structured.orientation === 'object' ? structured.orientation as Record<string, unknown> : undefined;
    if (orientation && !context.fullOrientation && !state.first && !input.isError) {
        const needsTarget = data?.status === 'needs_target' || data?.status === 'needs_template';
        const keepViewerLink = (needsTarget || context.displayConnected === false) && orientation.viewerLink !== undefined;
        result.orientation = { ...(orientation.guide !== undefined ? { guide: orientation.guide } : {}), help: 'kanvas.help.getting-started.steps', ...(keepViewerLink ? { viewerLink: orientation.viewerLink } : {}), ...(input.operation === "kanvas.session.create" && orientation.sessionContinuity !== undefined ? { sessionContinuity: orientation.sessionContinuity } : {}) };
    }
    result = { ...result, ...additions };
    return { structured: result };
}
