/** Finite browser observations, not arbitrary URLs, exception text or a claim
 * that JavaScript can inspect a cross-origin HTTP response. */
export const MEDIA_FAILURES = {
  VIEW_RENDER_FAILED: 'The browser could not render this view.',
  MEDIA_UNAVAILABLE: 'A media resource could not be displayed.',
  MEDIA_ABORTED: 'The browser interrupted this media load.',
  MEDIA_NETWORK: 'The browser reported a network failure while loading video.',
  MEDIA_DECODE: 'The browser received media but could not decode it.',
  MEDIA_UNSUPPORTED: 'The browser rejected this video source. It may be unavailable, blocked, or not a supported video response; the browser does not expose the HTTP cause here.',
  MEDIA_TIMEOUT: 'The media did not provide a ready frame before the loading deadline.',
  MEDIA_SEGMENT: 'The requested video segment could not provide its starting frame. Check the source duration and seek support.',
  EMBED_UNAVAILABLE: 'The video provider reported an unavailable or invalid video.',
  EMBED_BLOCKED: 'The video provider refused embedded playback for this video or browser.',
  EMBED_TIMEOUT: 'The embedded player did not confirm a ready video. It may be blocked or unavailable; loading an iframe alone is not playback confirmation.',
} as const;
export type MediaFailureCode = keyof typeof MEDIA_FAILURES;
export const MEDIA_FAILURE_CODES = Object.keys(MEDIA_FAILURES) as [MediaFailureCode, ...MediaFailureCode[]];
export function mediaFailureCode(value: unknown): MediaFailureCode { return typeof value === 'string' && Object.hasOwn(MEDIA_FAILURES, value) ? value as MediaFailureCode : 'MEDIA_UNAVAILABLE'; }
export function nativeVideoFailure(error: Pick<MediaError, 'code'> | null | undefined): MediaFailureCode {
  return error?.code === 1 ? 'MEDIA_ABORTED' : error?.code === 2 ? 'MEDIA_NETWORK' : error?.code === 3 ? 'MEDIA_DECODE' : error?.code === 4 ? 'MEDIA_UNSUPPORTED' : 'MEDIA_UNAVAILABLE';
}
