import { useEffect, useRef, useState } from 'react';
import type { VideoControlCommand, VideoControlResult } from '../../shared/types';
import { safeUrl } from '../api';
import { Icon } from '../icons';
import { useMediaResource } from './readiness';
import './video-surface.css';
import { MEDIA_FAILURES, nativeVideoFailure } from '../../shared/media-failures';
import { EmbeddedVideo } from './EmbeddedVideo';
import { videoEmbed } from '../../shared/video-embed';

export interface VideoData { url: string; start?: number; end?: number; captions?: { start: number; end: number; text: string }[]; poster?: string; muted?: boolean; loop?: boolean; autoplay?: boolean; embed?: boolean }
export interface VideoProps { showControls?: boolean; data: VideoData; revision?: number; command?: VideoControlCommand; serverNow?: string; preview?: boolean; onCommandResult?: (id: string, result: VideoControlResult) => Promise<unknown> }
class ControlError extends Error {
  constructor(message: string, readonly status: 'blocked' | 'failed' = 'failed') { super(message); }
}
function snapshot(video: HTMLVideoElement, frame: HTMLElement): Omit<VideoControlResult, 'status'> {
  return { currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0, paused: video.paused, muted: video.muted, volume: video.volume, playbackRate: video.playbackRate, fullscreen: Boolean(frame.ownerDocument.fullscreenElement?.contains(video)) };
}
function seekFrame(video: HTMLVideoElement, target: number) {
  const atRequestedTime = () => Math.abs(video.currentTime - target) <= .01;
  // Only skip a genuinely identical request. The completion tolerance must not
  // turn a nearby explicit seek into a no-op at the previous playback position.
  if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - target) < .000001) return Promise.resolve();
  const canSeek = Array.from({ length: video.seekable.length }, (_, index) => target >= video.seekable.start(index) && target <= video.seekable.end(index)).some(Boolean);
  if (!canSeek) return Promise.reject(new ControlError('The browser has not made that playback time seekable.'));
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => { clearTimeout(timer); video.removeEventListener('seeked', inspect); video.removeEventListener('loadeddata', inspect); video.removeEventListener('error', fail); };
    const fail = () => { cleanup(); reject(new ControlError('The video could not show the requested frame.')); };
    const inspect = () => {
      // Playback may advance after seeking, but a snap to an earlier frame is
      // not success (especially for short clips or non-range HTTP sources).
      const reached = video.paused ? atRequestedTime() : video.currentTime >= target - .01 && video.currentTime <= target + .25;
      if (!video.seeking && video.readyState >= 2 && reached) { cleanup(); resolve(); }
    };
    video.addEventListener('seeked', inspect); video.addEventListener('loadeddata', inspect); video.addEventListener('error', fail);
    timer = setTimeout(fail, 8000);
    try { video.currentTime = target; inspect(); } catch { fail(); }
  });
}
async function play(video: HTMLVideoElement) {
  try { await video.play(); }
  catch (error) {
    const blocked = error instanceof DOMException && error.name === 'NotAllowedError';
    throw new ControlError(blocked ? 'Playback needs a tap on this display.' : 'This video could not start playing.', blocked ? 'blocked' : 'failed');
  }
}

/** Uses actual media/fullscreen APIs and their results, never predicted browser capabilities. */
export async function executeVideoControl(video: HTMLVideoElement, frame: HTMLElement, command: VideoControlCommand, data: VideoData): Promise<VideoControlResult> {
  try {
    if (video.error) throw new ControlError('The video is unavailable on this display.');
    const start = data.start ?? 0, end = Math.min(data.end ?? Infinity, Number.isFinite(video.duration) ? video.duration : Infinity);
    switch (command.action) {
      case 'play': await play(video); break;
      case 'pause': video.pause(); break;
      case 'seek':
      case 'skip': {
        const requested = command.action === 'skip' ? video.currentTime + (command.value ?? NaN) : command.time ?? NaN;
        if (!Number.isFinite(requested)) throw new ControlError('A finite playback time is required.');
        if (command.action === 'seek' && (requested < start || requested > end)) throw new ControlError('The requested time is outside this video segment.');
        await seekFrame(video, Math.max(start, Math.min(end, requested))); break;
      }
      case 'restart': await seekFrame(video, start); await play(video); break;
      case 'mute': video.muted = true; break;
      case 'unmute': video.muted = false; break;
      case 'volume': {
        if (command.value === undefined || !Number.isFinite(command.value) || command.value < 0 || command.value > 1) throw new ControlError('Volume must be between 0 and 1.');
        video.volume = command.value;
        if (Math.abs(video.volume - command.value) > .01) throw new ControlError('Use the device volume controls; this browser did not change the video volume.');
        break;
      }
      case 'rate': {
        if (command.value === undefined || !Number.isFinite(command.value) || command.value < .25 || command.value > 4) throw new ControlError('Playback speed must be between 0.25 and 4.');
        video.playbackRate = command.value;
        if (Math.abs(video.playbackRate - command.value) > .01) throw new ControlError('This browser did not change the playback speed.');
        break;
      }
      case 'fullscreen': {
        const doc = frame.ownerDocument, enter = command.fullscreen !== false, isFullscreen = Boolean(doc.fullscreenElement?.contains(video));
        if (enter && !isFullscreen) {
          if (!frame.requestFullscreen || !doc.fullscreenEnabled) throw new ControlError('Fullscreen is unavailable in this browser.');
          try { await frame.requestFullscreen(); } catch { throw new ControlError('Fullscreen needs a tap on this display.', 'blocked'); }
          if (!doc.fullscreenElement?.contains(video)) throw new ControlError('The browser did not enter fullscreen.');
        } else if (!enter && isFullscreen) {
          try { await doc.exitFullscreen(); } catch { throw new ControlError('The browser could not leave fullscreen.'); }
        }
        break;
      }
      default: throw new ControlError('Unknown playback control.');
    }
    return { status: 'applied', ...snapshot(video, frame) };
  } catch (error) {
    return { status: error instanceof ControlError ? error.status : 'failed', message: error instanceof ControlError ? error.message : 'The browser could not apply this playback control.', ...snapshot(video, frame) };
  }
}

export function VideoRenderer(props: VideoProps) {
  if (props.data.embed || props.data.embed === undefined && videoEmbed(props.data.url)) return <EmbeddedVideo key={`${props.data.url}:${props.data.start ?? 0}`} {...props} />;
  return <VideoResource key={`${props.data.url}:${props.data.start ?? 0}`} {...props} />;
}
function VideoResource({ data, revision, command, serverNow, preview, onCommandResult, showControls = false }: VideoProps) {
  const ref = useRef<HTMLVideoElement>(null), frame = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(data.start ?? 0), [captions, setCaptions] = useState(true);
  const [controlMessage, setControlMessage] = useState<string | null>(null), [blocked, setBlocked] = useState<VideoControlCommand | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<{ id: string; result: VideoControlResult } | null>(null);
  const callback = useRef(onCommandResult); callback.current = onCommandResult;
  const currentCommand = useRef(command); currentCommand.current = command;
  const seen = useRef(new Set<string>()), operating = useRef(false);
  const serverClock = useRef<{ source: string; ms: number; receivedAt: number } | null>(null);
  if (serverNow && Number.isFinite(Date.parse(serverNow)) && serverNow !== serverClock.current?.source) serverClock.current = { source: serverNow, ms: Date.parse(serverNow), receivedAt: performance.now() };
  const url = safeUrl(data.url, true), poster = safeUrl(data.poster, true);
  const { status, failure, ready, fail } = useMediaResource(url ? 'pending' : 'failed');
  const start = data.start ?? 0;
  const frameReady = () => {
    const video = ref.current;
    if (video?.error) { fail(nativeVideoFailure(video.error)); return; }
    if (video && video.readyState >= 2 && !video.seeking) {
      if (video.currentTime >= start - .01) ready();
      else fail('MEDIA_SEGMENT');
    }
  };
  useEffect(frameReady, [ready, fail, start]);
  useEffect(() => {
    if (!preview) return;
    if (ref.current) { ref.current.muted = true; ref.current.pause(); }
    setBlocked(null); setControlMessage(null);
  }, [preview]);
  const acknowledge = async (id: string, result: VideoControlResult) => {
    try { await callback.current?.(id, result); setUnconfirmed(previous => previous?.id === id ? null : previous); }
    catch { setUnconfirmed({ id, result }); }
  };
  const invalidCommand = (next: VideoControlCommand) => {
    if (next.expectedRevision !== undefined && next.expectedRevision !== revision) return 'The display changed before this control could run.';
    const clock = serverClock.current;
    if (next.expiresAt && clock && Date.parse(next.expiresAt) <= clock.ms + performance.now() - clock.receivedAt) return 'This playback control has expired.';
    return undefined;
  };
  useEffect(() => {
    const video = ref.current, target = frame.current;
    if (!command && blocked) { setBlocked(null); setControlMessage('This playback request is no longer active.'); }
    if (preview || !command || seen.current.has(command.id) || !video || !target) return;
    const invalid = invalidCommand(command);
    if (!invalid && command.status !== 'blocked' && status === 'pending' && ['play', 'seek', 'skip', 'restart'].includes(command.action)) return;
    seen.current.add(command.id);
    if (seen.current.size > 128) seen.current.delete(seen.current.values().next().value!);
    setBlocked(null); setControlMessage(null);
    if (!invalid && command.status === 'blocked') {
      setBlocked(command);
      setControlMessage(command.action === 'fullscreen' ? 'Fullscreen needs a tap on this display.' : 'Playback needs a tap on this display.');
      return;
    }
    const operation = invalid ? Promise.resolve({ status: 'failed' as const, message: invalid, ...snapshot(video, target) }) : executeVideoControl(video, target, command, data);
    void operation.then(result => {
      if (currentCommand.current?.id === command.id) {
        setControlMessage(result.status === 'applied' ? null : result.message ?? 'The playback control failed.');
        if (result.status === 'blocked') setBlocked(command);
      }
      void acknowledge(command.id, result);
    });
  }, [command?.id, command?.status, revision, status, preview]);
  const retryBlocked = async () => {
    const video = ref.current, target = frame.current;
    if (preview || !blocked || !video || !target || operating.current || currentCommand.current?.id !== blocked.id) return;
    const invalid = invalidCommand(blocked);
    operating.current = true;
    const result = invalid ? { status: 'failed' as const, message: invalid, ...snapshot(video, target) } : await executeVideoControl(video, target, { ...blocked, action: blocked.action === 'fullscreen' ? 'fullscreen' : 'play' }, data);
    operating.current = false;
    setControlMessage(result.status === 'applied' ? null : result.message ?? 'The playback control failed.');
    if (result.status !== 'blocked') setBlocked(null);
    await acknowledge(blocked.id, result);
  };
  const playLocally = async () => {
    const video = ref.current; if (!video || preview) return;
    try { await play(video); setControlMessage(null); } catch (error) { setControlMessage(error instanceof ControlError ? error.message : 'The video could not start playing.'); }
  };
  const update = () => {
    const video = ref.current; if (!video) return;
    if (video.currentTime < start - .15) video.currentTime = start;
    if (data.end !== undefined && video.currentTime >= data.end) {
      if (data.loop) { video.currentTime = start; void playLocally(); }
      else { video.pause(); if (video.currentTime > data.end + .02) video.currentTime = data.end; }
    }
    setTime(video.currentTime);
  };
  const currentCaptions = data.captions?.filter(caption => caption.start <= time && caption.end > time) ?? [];
  const formatTime = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  return <div className="video-content">
    {url && <div className="video-frame" ref={frame} hidden={status === 'failed'}><video ref={ref} src={url} poster={poster} controls={!preview} tabIndex={preview ? -1 : undefined} playsInline preload="auto" autoPlay={!preview && data.autoplay} muted={Boolean(preview || data.muted)} loop={!preview && data.loop && data.end === undefined && start === 0} onLoadedMetadata={() => { const video = ref.current; if (!video) return; if (Number.isFinite(video.duration) && start >= video.duration) fail('MEDIA_SEGMENT'); else if (start > 0) video.currentTime = start; }} onLoadedData={frameReady} onSeeked={frameReady} onTimeUpdate={update} onSeeking={update} onPlay={() => { if (preview) ref.current?.pause(); else if (ref.current && data.end && ref.current.currentTime >= data.end) ref.current.currentTime = start; }} onError={() => fail(nativeVideoFailure(ref.current?.error))} aria-label="Video segment" />{captions && !!currentCaptions.length && <div className="video-captions" aria-live="off">{currentCaptions.map((caption, index) => <span key={index}>{caption.text}</span>)}</div>}</div>}
    {(!url || status === 'failed') && <div className="media-unavailable"><Icon name="play" size={34} /><p>Video unavailable</p><p>{MEDIA_FAILURES[failure]}</p>{url && <a href={url} target="_blank" rel="noopener noreferrer">Open media source</a>}</div>}
    {(showControls || !preview && !!data.captions?.length) && <div className="video-info">{showControls && <span>{start > 0 || data.end !== undefined ? `Segment ${formatTime(start)}${data.end !== undefined ? `–${formatTime(data.end)}` : ' onward'}` : 'Video'}</span>}{!preview && <div>{!!data.captions?.length && <button className={captions ? 'active' : ''} onClick={() => setCaptions(!captions)} aria-pressed={captions}>Captions</button>}{showControls && <button onClick={() => { if (ref.current) { ref.current.currentTime = start; void playLocally(); } }} disabled={status === 'failed' || !url}><Icon name="refresh" size={15} />Replay segment</button>}</div>}</div>}
    {(controlMessage || blocked) && <div className="video-control-feedback" role="status"><span>{controlMessage}</span>{blocked && <button onClick={() => void retryBlocked()}>{blocked.action === 'fullscreen' ? 'Enter fullscreen' : 'Play video'}</button>}</div>}
    {unconfirmed && <div className="video-control-feedback" role="status"><span>The control result has not reached the server.</span><button onClick={() => void acknowledge(unconfirmed.id, unconfirmed.result)}>Retry confirmation</button></div>}
  </div>;
}
