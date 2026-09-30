import { z } from 'zod';
import { isSafeUrl } from './urls.js';

const name = z.string().min(1).max(500).refine(value => Boolean(value.trim()), 'Supply a meaningful track or artist name');
const seconds = z.number().finite().max(Number.MAX_SAFE_INTEGER);

/** A source snapshot, not a player. Defaults must never invent playback state. */
export const nowPlayingDataSchema = z.object({
  track: name.describe('Exact supplied track, episode or audiobook title.'),
  artist: name.describe('Exact supplied artist, speaker or author name.'),
  album: z.string().max(500).optional(),
  artwork: z.object({
    url: z.string().min(1).max(2048).refine(isSafeUrl, 'Supply a safe artwork URL or a session asset URL'),
    alt: z.string().max(500).default(''),
  }).strict().optional().describe('Only genuinely supplied artwork. Omit when no artwork is available.'),
  state: z.enum(['playing', 'paused', 'stopped']).optional().describe('Only the state explicitly supplied by the source; never inferred.'),
  elapsedSeconds: seconds.nonnegative().optional().describe('Supplied elapsed seconds, including fractions. Never advanced using wall time.'),
  durationSeconds: seconds.positive().optional().describe('Supplied total seconds, including long-form audio. Both positions are required for a progress bar.'),
  observedAt: z.string().max(64).datetime({ offset: true }).optional().describe('Timezone-qualified source observation timestamp. Metadata only; never a clock anchor.'),
}).strict().superRefine((data, ctx) => {
  if (data.elapsedSeconds !== undefined && data.durationSeconds !== undefined && data.elapsedSeconds > data.durationSeconds) {
    ctx.addIssue({ code: 'custom', path: ['elapsedSeconds'], message: 'Elapsed seconds cannot exceed the supplied duration' });
  }
});

export type NowPlayingData = z.infer<typeof nowPlayingDataSchema>;

/** Preserve the supplied decimal fraction, without binary remainder artefacts.
 * Exceptionally tiny values keep their exact scientific seconds notation. */
export function formatPlaybackSeconds(value: number): string {
  const supplied = String(value);
  if (supplied.includes('e')) return `${supplied} s`;
  const whole = Math.floor(value), hours = Math.floor(whole / 3600), minutes = Math.floor(whole / 60) % 60;
  const fraction = supplied.includes('.') ? `.${supplied.split('.')[1]}` : '';
  const tail = `${String(whole % 60).padStart(2, '0')}${fraction}`;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
}
