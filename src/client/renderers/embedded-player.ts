import type { VideoControlCommand, VideoControlResult } from '../../shared/types';
import type { VideoEmbed } from '../../shared/video-embed';
import type { MediaFailureCode } from '../../shared/media-failures';
import type { VideoData } from './Video';

interface Hooks { ready: () => void; failed: (code: MediaFailureCode) => void; state: (time: number) => void }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The providers' iframe message protocols, with source AND exact-origin
 * validation. No foreign scripts execute in the KANVAS document. iframe load
 * alone never means video readiness, and a sent command never means applied. */
export class EmbeddedPlayer {
  private disposed = false;
  private identityConfirmed = false;
  private initialized = false;
  private readySent = false;
  private failed = false;
  private startApplied = false;
  private segmentEnding = false;
  private duration = Infinity;
  private time = 0;
  private paused = true;
  private muted = false;
  private volume = 1;
  private rate = 1;
  private revision = 0;
  private blockedRevision = -1;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly listeners = new Set<() => void>();
  private readonly owner: Window;
  constructor(private readonly frame: HTMLIFrameElement, private readonly target: VideoEmbed, private readonly data: VideoData, private readonly hooks: Hooks, private readonly preview = false) {
    this.owner = frame.ownerDocument.defaultView!;
    this.owner.addEventListener('message', this.receive);
    this.timer = setInterval(() => this.poll(), 500);
    this.poll();
  }
  dispose() { this.disposed = true; clearInterval(this.timer); this.owner.removeEventListener('message', this.receive); this.changed(); }
  private send(message: Record<string, unknown>) {
    if (this.disposed) return;
    const payload = this.target.provider === 'youtube' ? { ...message, id: this.frame.id, channel: 'widget' } : message;
    this.frame.contentWindow?.postMessage(JSON.stringify(payload), this.target.origin);
  }
  private youtube(func: string, args: unknown[] = []) { this.send({ event: 'command', func, args }); }
  private vimeo(method: string, value?: unknown) { this.send({ method, ...(value === undefined ? {} : { value }) }); }
  private poll() {
    if (this.failed) return;
    if (this.target.provider === 'youtube') {
      if (!this.initialized) this.send({ event: 'listening' });
    } else {
      for (const method of ['getVideoId', 'getDuration', 'getCurrentTime', 'getPaused', 'getMuted', 'getVolume', 'getPlaybackRate']) this.vimeo(method);
    }
  }
  private subscribe() {
    if (this.target.provider === 'youtube') for (const name of ['onReady', 'onStateChange', 'onError', 'onAutoplayBlocked']) this.youtube('addEventListener', [name]);
    else for (const name of ['loaded', 'play', 'pause', 'ended', 'timeupdate', 'seeked', 'volumechange', 'playbackratechange', 'error']) this.vimeo('addEventListener', name);
  }
  private reject(code: MediaFailureCode) { if (this.failed) return; this.failed = true; this.hooks.failed(code); this.changed(); }
  private changed() { for (const listener of [...this.listeners]) listener(); }
  private receive = (event: MessageEvent) => {
    if (this.disposed || this.failed || event.source !== this.frame.contentWindow || event.origin !== this.target.origin) return;
    let message: unknown = event.data;
    if (typeof message === 'string') { if (message.length > 65536) return; try { message = JSON.parse(message); } catch { return; } }
    if (!object(message)) return;
    if (this.target.provider === 'youtube') {
      if (message.id !== undefined && String(message.id) !== this.frame.id || message.channel !== undefined && message.channel !== 'widget') return;
      this.revision++;
      if (!this.initialized && ['initialDelivery', 'infoDelivery', 'onReady'].includes(String(message.event))) { this.initialized = true; this.subscribe(); }
      if (message.event === 'onError') { this.reject([101, 150, 153].includes(Number(message.info)) ? 'EMBED_BLOCKED' : 'EMBED_UNAVAILABLE'); return; }
      if (message.event === 'onAutoplayBlocked') this.blockedRevision = this.revision;
      const info = object(message.info) ? message.info : undefined;
      if (message.event === 'onStateChange' && finite(message.info)) this.paused = message.info !== 1;
      if (info && ['initialDelivery', 'infoDelivery'].includes(String(message.event))) {
        if (object(info.videoData) && typeof info.videoData.video_id === 'string') {
          if (info.videoData.video_id !== this.target.id) { this.reject('EMBED_UNAVAILABLE'); return; }
          this.identityConfirmed = true;
        }
        if (finite(info.duration) && info.duration > 0) this.duration = info.duration;
        if (finite(info.currentTime) && info.currentTime >= 0) this.time = info.currentTime;
        if (finite(info.playerState)) this.paused = info.playerState !== 1;
        if (typeof info.muted === 'boolean') this.muted = info.muted;
        if (finite(info.volume) && info.volume >= 0 && info.volume <= 100) this.volume = info.volume / 100;
        if (finite(info.playbackRate) && info.playbackRate > 0) this.rate = info.playbackRate;
      }
    } else {
      this.revision++;
      if (!this.initialized && (message.event === 'ready' || message.event === 'loaded' || message.method === 'getVideoId')) { this.initialized = true; this.subscribe(); }
      const payload = object(message.data) ? message.data : undefined;
      if (message.event === 'error') {
        if (payload?.method === 'play' && ['NotAllowedError', 'PlayError'].includes(String(payload.name))) this.blockedRevision = this.revision;
        else if (payload?.method && !['loadVideo', 'getVideoId', 'getDuration'].includes(String(payload.method))) { if (String(payload.method).startsWith('set')) this.blockedRevision = this.revision; }
        else { this.reject(['PrivacyError', 'PasswordError'].includes(String(payload?.name)) ? 'EMBED_BLOCKED' : 'EMBED_UNAVAILABLE'); return; }
      }
      if (message.method === 'getVideoId' || message.event === 'loaded') {
        const id = message.method === 'getVideoId' ? message.value : payload?.id;
        if (id !== undefined && String(id) !== this.target.id) { this.reject('EMBED_UNAVAILABLE'); return; }
        if (id !== undefined) this.identityConfirmed = true;
      }
      if (message.method === 'getDuration' && finite(message.value) && message.value > 0) this.duration = message.value;
      if (message.method === 'getCurrentTime' && finite(message.value) && message.value >= 0) this.time = message.value;
      if (finite(payload?.seconds) && payload.seconds >= 0) this.time = payload.seconds;
      if (message.method === 'getPaused' && typeof message.value === 'boolean') this.paused = message.value;
      if (['play', 'pause', 'ended'].includes(String(message.event))) this.paused = message.event !== 'play';
      if (message.method === 'getMuted' && typeof message.value === 'boolean') this.muted = message.value;
      if (message.method === 'getVolume' && finite(message.value) && message.value >= 0 && message.value <= 1) this.volume = message.value;
      if (message.method === 'getPlaybackRate' && finite(message.value) && message.value > 0) this.rate = message.value;
    }
    if (this.identityConfirmed && this.initialized && Number.isFinite(this.duration)) {
      const start = this.data.start ?? 0;
      if (start >= this.duration) { this.reject('MEDIA_SEGMENT'); return; }
      if (!this.startApplied) { this.startApplied = true; if (start > 0) this.seek(start); }
      // The provider confirms a playable/cued video, not merely an HTML page.
      if (!this.readySent && (start === 0 || this.time >= start - .25)) { this.readySent = true; this.hooks.ready(); }
      if (this.preview) { if (!this.paused) this.pause(); if (!this.muted) this.mute(true); }
      if (!this.preview && this.data.end !== undefined && this.time >= this.data.end && !this.segmentEnding) {
        this.segmentEnding = true;
        if (this.data.loop) { this.seek(start); this.play(); } else this.pause();
      }
      if (this.time < (this.data.end ?? Infinity) - .25) this.segmentEnding = false;
    }
    this.hooks.state(this.time); this.changed();
  };
  private play() { this.target.provider === 'youtube' ? this.youtube('playVideo') : this.vimeo('play'); }
  private pause() { this.target.provider === 'youtube' ? this.youtube('pauseVideo') : this.vimeo('pause'); }
  private seek(time: number) { this.target.provider === 'youtube' ? this.youtube('seekTo', [time, true]) : this.vimeo('setCurrentTime', time); }
  private mute(muted: boolean) { this.target.provider === 'youtube' ? this.youtube(muted ? 'mute' : 'unMute') : this.vimeo('setMuted', muted); }
  snapshot(): Omit<VideoControlResult, 'status'> {
    return { currentTime: this.time, paused: this.paused, muted: this.muted, volume: this.volume, playbackRate: this.rate, fullscreen: Boolean(this.frame.ownerDocument.fullscreenElement?.contains(this.frame)) };
  }
  async control(command: VideoControlCommand, container: HTMLElement): Promise<VideoControlResult> {
    const result = (status: VideoControlResult['status'], message?: string): VideoControlResult => ({ status, ...(message ? { message } : {}), ...this.snapshot() });
    if (this.failed || this.disposed || !this.readySent || this.preview) return result('failed', 'The embedded player has not confirmed a ready video.');
    if (command.action === 'fullscreen') {
      try {
        if (command.fullscreen === false) { if (this.snapshot().fullscreen) await this.frame.ownerDocument.exitFullscreen(); }
        else if (!this.snapshot().fullscreen) await container.requestFullscreen();
        return this.snapshot().fullscreen === (command.fullscreen !== false) ? result('applied') : result('failed', 'The browser did not change fullscreen.');
      } catch { return result('blocked', 'Fullscreen needs a tap on this display.'); }
    }
    const start = this.data.start ?? 0, end = Math.min(this.data.end ?? Infinity, this.duration);
    if (command.action === 'volume' && (!finite(command.value) || command.value < 0 || command.value > 1)) return result('failed', 'Volume must be between 0 and 1.');
    if (command.action === 'rate' && (!finite(command.value) || command.value < .25 || command.value > 4)) return result('failed', 'Playback speed must be between 0.25 and 4.');
    const time = command.action === 'skip' ? Math.max(start, Math.min(end, this.time + (command.value ?? NaN))) : command.action === 'restart' ? start : command.time;
    if (['seek', 'skip', 'restart'].includes(command.action) && (!finite(time) || time < start || time > end)) return result('failed', 'The requested time is outside this video segment.');
    let matches: () => boolean;
    switch (command.action) {
      case 'play': this.play(); matches = () => !this.paused; break;
      case 'pause': this.pause(); matches = () => this.paused; break;
      case 'restart': this.seek(start); this.play(); matches = () => !this.paused && this.time >= start - .25 && this.time <= start + 1; break;
      case 'seek': case 'skip': this.seek(time!); matches = () => Math.abs(this.time - time!) <= (this.paused ? .25 : 1); break;
      case 'mute': case 'unmute': this.mute(command.action === 'mute'); matches = () => this.muted === (command.action === 'mute'); break;
      case 'volume': this.target.provider === 'youtube' ? this.youtube('setVolume', [command.value! * 100]) : this.vimeo('setVolume', command.value); matches = () => Math.abs(this.volume - command.value!) <= .01; break;
      case 'rate': this.target.provider === 'youtube' ? this.youtube('setPlaybackRate', [command.value]) : this.vimeo('setPlaybackRate', command.value); matches = () => Math.abs(this.rate - command.value!) <= .01; break;
      default: return result('failed', 'This embedded player does not support that control.');
    }
    const started = this.revision;
    return new Promise(resolve => {
      const cleanup = () => { clearTimeout(timer); this.listeners.delete(inspect); };
      const inspect = () => {
        if (this.failed || this.disposed) { cleanup(); resolve(result('failed', 'The embedded player became unavailable.')); }
        else if (this.blockedRevision > started) { cleanup(); resolve(result(command.action === 'play' || command.action === 'restart' ? 'blocked' : 'failed', 'Use the video player controls on this display.')); }
        else if (this.revision > started && matches()) { cleanup(); resolve(result('applied')); }
      };
      const timer = setTimeout(() => { cleanup(); resolve(result(command.action === 'play' || command.action === 'restart' ? 'blocked' : 'failed', 'The provider did not confirm this control. Use the video player on this display.')); }, 6000);
      this.listeners.add(inspect); this.poll();
    });
  }
}
