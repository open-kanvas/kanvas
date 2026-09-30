import { FormattedTime } from './Regional';
import { useCallback, useEffect, useRef } from 'react';
import { formatPlaybackSeconds, type NowPlayingData } from '../../shared/now-playing';
import { liveSurfaceOptions } from '../../shared/live-surface';
import { safeUrl } from '../api';
import type { RendererProps } from './Renderer';
import { useMediaResource } from './readiness';
import './now-playing.css';

function Artwork({ artwork }: { artwork: NonNullable<NowPlayingData['artwork']> }) {
  const url = safeUrl(artwork.url, true), ref = useRef<HTMLImageElement>(null);
  const { status, ready, fail } = useMediaResource(url ? 'pending' : 'failed');
  const loaded = useCallback(() => {
    const image = ref.current;
    if (!image?.complete) return;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) ready(); else fail();
  }, [ready, fail]);
  // Cached images can finish before React subscribes to their load event.
  useEffect(loaded, [loaded, url]);
  if (!url || status === 'failed') return <p className="now-playing-artwork-error" role="status">Artwork unavailable</p>;
  return <div className="now-playing-artwork" data-load-status={status}>
    <img ref={ref} src={url} alt={artwork.alt} onLoad={loaded} onError={fail} referrerPolicy="no-referrer" loading="eager" decoding="async" />
  </div>;
}

const stateLabels = { playing: 'Playing', paused: 'Paused', stopped: 'Stopped' };

export function NowPlayingRenderer(props: RendererProps) {
  const data = props.view.data as unknown as NowPlayingData;
  const { showSource } = liveSurfaceOptions(props.view, props.containerView);
  const hasElapsed = data.elapsedSeconds !== undefined, hasDuration = data.durationSeconds !== undefined;
  const paired = hasElapsed && hasDuration;
  const elapsed = hasElapsed ? formatPlaybackSeconds(data.elapsedSeconds!) : undefined;
  const duration = hasDuration ? formatPlaybackSeconds(data.durationSeconds!) : undefined;

  return <section className={`now-playing-content ${data.artwork ? 'now-playing-with-artwork' : 'now-playing-text-only'}`} aria-label="Supplied audio information">
    {data.artwork && <Artwork key={data.artwork.url} artwork={data.artwork} />}
    <div className="now-playing-details">
      <header className="now-playing-track-info">
        <h2 className="now-playing-track">{data.track}</h2>
        <p className="now-playing-artist">{data.artist}</p>
      </header>
      {data.album && <p className="now-playing-album">{data.album}</p>}
      {data.state && <p className="now-playing-state" data-state={data.state} aria-label={`Reported playback state: ${data.state}`}>{stateLabels[data.state]}</p>}
      {(hasElapsed || hasDuration) && <div className="now-playing-timing">
        {paired && <div className="now-playing-progress" role="progressbar" aria-label="Supplied playback position" aria-valuemin={0} aria-valuemax={data.durationSeconds} aria-valuenow={data.elapsedSeconds} aria-valuetext={`${elapsed} of ${duration}`}>
          <span style={{ width: `${data.elapsedSeconds! / data.durationSeconds! * 100}%` }} />
        </div>}
        <div className={`now-playing-time-labels ${paired ? '' : 'now-playing-single-time'}`}>
          {hasElapsed && <span className="now-playing-elapsed" data-seconds={data.elapsedSeconds} aria-label={`Elapsed: ${elapsed}`}>{!paired && <span className="now-playing-time-kind">Elapsed </span>}{elapsed}</span>}
          {hasDuration && <span className="now-playing-duration" data-seconds={data.durationSeconds} aria-label={`Duration: ${duration}`}>{!paired && <span className="now-playing-time-kind">Duration </span>}{duration}</span>}
        </div>
      </div>}
      {showSource && data.observedAt && <p className="now-playing-observation">Reported <time dateTime={data.observedAt} >{<FormattedTime value={data.observedAt}/>} </time></p>}
    </div>
  </section>;
}
