import { z } from 'zod';
import type { DisplayRecord, VideoControlCommand, VideoControlResult } from '../shared/types.js';
import { AppError, id, now, Store } from './store.js';

export const videoControlInput = z.object({
  action: z.enum(['play', 'pause', 'seek', 'restart', 'mute', 'unmute', 'volume', 'rate', 'skip', 'fullscreen']),
  time: z.number().finite().min(0).max(86400).optional(), value: z.number().finite().min(-86400).max(86400).optional(), fullscreen: z.boolean().optional(),
}).strict().superRefine((v, ctx) => {
  if (v.action === 'seek' && v.time === undefined) ctx.addIssue({ code: 'custom', path: ['time'], message: 'Seek needs an absolute time in seconds.' });
  if (['volume', 'rate', 'skip'].includes(v.action) && v.value === undefined) ctx.addIssue({ code: 'custom', path: ['value'], message: 'This operation requires a numeric value.' });
  if (v.action === 'volume' && (v.value! < 0 || v.value! > 1)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Volume must be between zero and one.' });
  if (v.action === 'rate' && (v.value! < 0.25 || v.value! > 4)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Playback rate must be between 0.25 and 4.' });
}).meta({ allOf: [
  { if: { properties: { action: { const: 'seek' } }, required: ['action'] }, then: { required: ['time'] } },
  { if: { properties: { action: { enum: ['volume', 'rate', 'skip'] } }, required: ['action'] }, then: { required: ['value'] } },
  { if: { properties: { action: { const: 'volume' } }, required: ['action'] }, then: { properties: { value: { minimum: 0, maximum: 1 } } } },
  { if: { properties: { action: { const: 'rate' } }, required: ['action'] }, then: { properties: { value: { minimum: 0.25, maximum: 4 } } } },
] });
export const videoResultSchema = z.object({ status: z.enum(['applied', 'blocked', 'failed']), message: z.string().max(400).optional(), currentTime: z.number().finite().nonnegative(), paused: z.boolean(), muted: z.boolean(), fullscreen: z.boolean(), volume: z.number().min(0).max(1), playbackRate: z.number().finite().min(-16).max(16) }).strict();
export interface VideoCommandRecord extends Omit<VideoControlCommand, 'status'> { sessionId: string; displayId: string; requestId: string; status: 'pending'|'applied'|'blocked'|'failed'|'superseded'|'expired'; createdAt: string; result?: VideoControlResult; acknowledgedAt?: string }
export class VideoControls {
  constructor(private readonly store: Store) {}
  private video(view: DisplayRecord['view']): boolean {
    if (view?.template === 'video') return true;
    if (view?.template === 'presentation') { const slides = view.data.slides as DisplayRecord['view'][]; return slides[Number(view.data.index) || 0]?.template === 'video'; }
    return false;
  }
  async create(display: DisplayRecord, requestId: string, raw: unknown): Promise<Awaited<VideoCommandRecord>> {
    return this.store.atomic(async () => {
    if (!this.video(display.view)) throw new AppError('NOT_VIDEO', 'This display does not currently show a video.', 400);
    const input = videoControlInput.parse(raw);
    for (const previous of (await this.store.list<VideoCommandRecord>('video-command', display.sessionId))) if (previous.displayId === display.id && ['pending', 'blocked'].includes(previous.status)) (await this.store.put('video-command', { ...previous, status: 'superseded' }));
    const command: VideoCommandRecord = { ...input, id: id(), sessionId: display.sessionId, displayId: display.id, requestId, expectedRevision: display.revision, status: 'pending', createdAt: now(), expiresAt: new Date(Date.now() + 30_000).toISOString() };
    (await this.store.put('video-command', command));
    const old = (await this.store.list<VideoCommandRecord>('video-command', display.sessionId)).filter(c => c.displayId === display.id);
    for (const row of old.slice(0, Math.max(0, old.length - 100))) (await this.store.delete('video-command', row.id));
    return command;

    });
  }
  async get(display: DisplayRecord, commandId?: string): Promise<Awaited<VideoCommandRecord | undefined>> {
    let command = commandId ? (await this.store.get<VideoCommandRecord>('video-command', commandId)) : (await this.store.list<VideoCommandRecord>('video-command', display.sessionId)).filter(c => c.displayId === display.id).at(-1);
    if (!command || command.sessionId !== display.sessionId || command.displayId !== display.id) return;
    if (command.status === 'pending' || command.status === 'blocked') {
      if (command.expectedRevision !== display.revision) command = { ...command, status: 'superseded' };
      else if (Date.parse(command.expiresAt!) <= Date.now()) command = { ...command, status: 'expired' };
    }
    return command;
  }
  async pending(display: DisplayRecord): Promise<Awaited<VideoControlCommand | undefined>> {
    const command = (await this.get(display)); if (!command || !['pending', 'blocked'].includes(command.status)) return;
    const { id, action, time, value, fullscreen, expectedRevision, expiresAt } = command;
    return { id, action, time, value, fullscreen, expectedRevision, expiresAt, status: command.status as 'pending'|'blocked' };
  }
  async acknowledge(display: DisplayRecord, commandId: string, raw: unknown): Promise<Awaited<VideoCommandRecord>> {
    return this.store.atomic(async () => {
    const command = (await this.get(display, commandId));
    if (!command) throw new AppError('NOT_FOUND', 'This playback command is unavailable.', 404);
    if (!['pending', 'blocked'].includes(command.status)) return command;
    const parsed = videoResultSchema.parse(raw);
    // Browser exception messages are not accepted as trusted diagnostics.
    const result: VideoControlResult = { ...parsed, message: parsed.status === 'blocked' ? 'The receiving browser requires a local click for this operation.' : parsed.status === 'failed' ? 'The receiving browser could not apply this playback command.' : undefined };
    const changed = { ...command, status: result.status, result, acknowledgedAt: now() }; (await this.store.put('video-command', changed)); return changed;

    });
  }
}
