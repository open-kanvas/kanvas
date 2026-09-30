import { useEffect, useId, useRef, useState } from 'react';
import { videoEmbed, videoEmbedUrl } from '../../shared/video-embed';
import { MEDIA_FAILURES } from '../../shared/media-failures';
import type { VideoControlCommand, VideoControlResult } from '../../shared/types';
import type { VideoProps } from './Video';
import { useMediaResource } from './readiness';
import { EmbeddedPlayer } from './embedded-player';

export function EmbeddedVideo({ data, revision, command, serverNow, preview, onCommandResult }: VideoProps) {
  const frame = useRef<HTMLIFrameElement>(null), container = useRef<HTMLDivElement>(null), player = useRef<EmbeddedPlayer | null>(null);
  const identity = `kanvas-video-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const target = videoEmbed(data.url), { status, failure, ready, fail } = useMediaResource(target ? 'pending' : 'failed', 'EMBED_TIMEOUT');
  const [time, setTime] = useState(data.start ?? 0), [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<VideoControlCommand | null>(null), [unconfirmed, setUnconfirmed] = useState<{ id: string; result: VideoControlResult } | null>(null);
  const seen = useRef(new Set<string>()), callback = useRef(onCommandResult), latest = useRef(command), clock = useRef<{ source: string; ms: number; received: number } | null>(null);
  callback.current = onCommandResult; latest.current = command;
  if (serverNow && serverNow !== clock.current?.source && Number.isFinite(Date.parse(serverNow))) clock.current = { source: serverNow, ms: Date.parse(serverNow), received: performance.now() };
  const src = target && typeof window !== 'undefined' ? videoEmbedUrl(target, data, window.location.origin, Boolean(preview)) : undefined;
  useEffect(() => {
    if (!frame.current || !target) return;
    const instance = new EmbeddedPlayer(frame.current, target, data, { ready, failed: fail, state: setTime }, preview);
    player.current = instance;
    return () => { instance.dispose(); if (player.current === instance) player.current = null; };
  }, [src, ready, fail]);
  const acknowledge = async (id: string, result: VideoControlResult) => {
    try { await callback.current?.(id, result); setUnconfirmed(previous => previous?.id === id ? null : previous); }
    catch { setUnconfirmed({ id, result }); }
  };
  const run = async (next: VideoControlCommand) => {
    if (!player.current || !container.current) return;
    const invalid = next.expectedRevision !== undefined && next.expectedRevision !== revision || next.expiresAt && clock.current && Date.parse(next.expiresAt) <= clock.current.ms + performance.now() - clock.current.received;
    const result: VideoControlResult = invalid ? { status: 'failed', message: 'This control expired or belongs to an older view.', ...player.current.snapshot() } : await player.current.control(next, container.current);
    if (latest.current?.id === next.id) { setMessage(result.message ?? null); setBlocked(result.status === 'blocked' ? next : null); }
    await acknowledge(next.id, result);
  };
  useEffect(() => {
    if (!command) { setBlocked(null); return; }
    if (preview || status === 'pending' || seen.current.has(command.id) || !player.current) return;
    seen.current.add(command.id); if (seen.current.size > 128) seen.current.delete(seen.current.values().next().value!);
    if (command.status === 'blocked') { setBlocked(command); setMessage('Use the video player or tap to retry this control.'); }
    else void run(command);
  }, [command?.id, command?.status, revision, status, preview]);
  const captions = data.captions?.filter(c => c.start <= time && time < c.end) ?? [];
  return <div className="video-content" data-video-provider={target?.provider}>
    <div ref={container} className="video-frame video-embed-frame" hidden={status === 'failed'}>
      {src && <iframe id={identity} ref={frame} src={src} title={`${target!.provider === 'youtube' ? 'YouTube' : 'Vimeo'} video player`} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" tabIndex={preview ? -1 : 0} onError={() => fail('EMBED_UNAVAILABLE')} />}
      {!!captions.length && <div className="video-captions" aria-live="off">{captions.map((c, i) => <span key={i}>{c.text}</span>)}</div>}
    </div>
    {status === 'failed' && <div className="media-unavailable"><p>{MEDIA_FAILURES[failure]}</p>{target && <a href={data.url} target="_blank" rel="noopener noreferrer">Open video source</a>}</div>}
    {(message || blocked) && !preview && <div className="video-control-feedback" role="status"><span>{message}</span>{blocked && <button onClick={() => void run(blocked)}>{blocked.action === 'fullscreen' ? 'Enter fullscreen' : 'Retry playback'}</button>}</div>}
    {unconfirmed && !preview && <div className="video-control-feedback" role="status"><span>The control result has not reached the server.</span><button onClick={() => void acknowledge(unconfirmed.id, unconfirmed.result)}>Retry confirmation</button></div>}
  </div>;
}
