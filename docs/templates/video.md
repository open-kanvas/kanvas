# Video display

**Status:** Implemented native and supported-provider playback. The older category notes below remain design context.

## Supported provider embeds — 0.3.0

The video template accepts a recognized single-video YouTube or Vimeo HTTPS URL. YouTube watch/short/shorts/live/embed URLs normalize to `www.youtube-nocookie.com/embed/...`; Vimeo numeric video URLs use `player.vimeo.com/video/...` with `dnt=1`. Explicit `embed:true` requires a recognized provider URL. `embed:false` retains native-video behavior. Other sources stay native media; arbitrary HTML pages are never promoted to an iframe or fetched through a server proxy. Private/password/unlisted provider flows are not granted by KANVAS.

`start`/`end` are absolute source seconds (`end > start`), `autoplay` is optional, and `muted`, `loop` and captions remain available. Browser/provider policy can deny autoplay or particular controls. Provider controls remain usable inside the full-size frame. A message bridge validates the exact provider origin, the actual iframe window and video identity; it does not execute a foreign player script in the KANVAS document. CSP is unchanged.

Iframe navigation alone is not readiness: the provider must confirm the matching, initialized video, a usable duration and the requested starting position. Runtime commands are acknowledged only after provider state confirms their effect. Preview/fallback instances are muted, paused and never execute live commands. Browser/provider refusal produces a bounded failure or local retry prompt, not a claimed playback success.

Native failures report finite `MEDIA_NETWORK`, `MEDIA_DECODE`, `MEDIA_UNSUPPORTED`, `MEDIA_TIMEOUT` or `MEDIA_SEGMENT` codes as appropriate. Provider failures use `EMBED_UNAVAILABLE`, `EMBED_BLOCKED` or `EMBED_TIMEOUT`. Read `kanvas_call with operationId:"kanvas.update.status" and arguments:{…}` → `delivery[displayId]` for code/message/status. The browser keeps the last good content and explains a failed replacement. It cannot usually read a cross-origin HTTP error: an unsupported-source code does not establish CORS, codec or remote status as the cause. Uploading an authorized supported clip is an alternative when its public host is unavailable; KANVAS cannot repair that host.

## Implemented runtime controls — 2026-09-09

The `video` view retains its URL, optional segment/poster/captions, explicit mute and loop settings. `kanvas_call` with `operationId:"kanvas.video.control"` and nested `arguments` additionally addresses the current `sessionId`, `displayId`, `expectedRevision` and idempotent `requestId` with a `command`:

| Action | Parameters and behavior |
| --- | --- |
| `play`, `pause` | Actual receiving media element operation |
| `seek` | `time`: absolute source-timeline seconds within the segment |
| `skip` | `value`: signed seconds relative to the current position; constrained to the segment |
| `restart` | Seek to segment start, then request playback |
| `mute`, `unmute` | Actual media mute state |
| `volume` | `value`: 0–1; browser/device support is checked |
| `rate` | `value`: 0.25–4; browser support is checked |
| `fullscreen` | `fullscreen`: optional desired state, defaults to entering |

The operation is lightweight and does not regenerate or republish the video. `kanvas_call` with `operationId:"kanvas.video.status"` and nested `arguments` reports pending, applied, blocked, failed, superseded or expired state. Commands are revision-bound and expire after 30 seconds; acceptance is not a browser acknowledgement.

The browser reports actual time, paused/muted/fullscreen state, volume and playback rate. Seek success requires a browser-seekable target and waits for a decoded frame at that time; a source that cannot seek must not report a snap back to the beginning as success. Protected uploaded videos use authenticated byte-range delivery. Play/fullscreen restrictions produce **blocked**, with a real receiving-device button; a persisted blocked command is not automatically replayed after reload. A successful click reports the new outcome for the same command ID. Unsupported operations fail visibly rather than inventing browser capabilities. A failed result upload can be retried without replaying the media operation.

Preview/retained fallback videos are explicitly muted and paused, do not loop, have no playback controls, and never receive runtime commands. A hidden second player must not unexpectedly produce audio.

See the [runtime schemas](../../src/shared/view-schemas.ts) for the source contract and [MCP integration](../README.md) for discovery/authorization.


See the [template index](README.md) and running `/docs/` reference for current fields and examples.
