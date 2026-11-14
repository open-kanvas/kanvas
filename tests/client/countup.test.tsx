import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CountdownRenderer, fitCountdown } from '../../src/client/renderers/Time';
import { Renderer } from '../../src/client/renderers/Renderer';
import { countdownDownDataSchema, countdownUpDataSchema } from '../../src/shared/timer';

const startedAt = '2030-01-01T12:00:00Z';
const up = countdownUpDataSchema.parse({ direction: 'up', startedAt, label: 'Time since launch' });

describe('count-up renderer semantics', () => {
  it('starts at zero elapsed, not a false completed timer or a prematurely rounded second', () => {
    const html = renderToStaticMarkup(<CountdownRenderer data={up} serverNow="2030-01-01T12:00:00.100Z" />);
    expect(html).toContain('data-direction="up"'); expect(html).toContain('data-phase="running"');
    expect(html).toContain('data-seconds="0"'); expect(html).toContain('aria-label="0 seconds elapsed"');
    expect(html).toContain('>Elapsed time<'); expect(html).toContain('Time since launch');
    expect(html).not.toContain('countdown-complete'); expect(html).not.toContain('Time is up');
  });

  it('displays complete elapsed seconds and retains the exact supplied start on request', () => {
    const html = renderToStaticMarkup(<CountdownRenderer data={up} serverNow="2030-01-01T12:00:42.100Z" showControls />);
    expect(html).toContain('data-seconds="42"'); expect(html).toContain('data-duration="00:00:42"');
    expect(html).toContain('>Start time<'); expect(html).toContain(`<time dateTime="${startedAt}">`);
    expect(html).not.toContain('seconds remaining'); expect(html).not.toContain('>End time<');
  });

  it('preserves frozen fractional elapsed time without a server clock', () => {
    const paused = countdownUpDataSchema.parse({ ...up, pausedElapsedSeconds: 42.999 });
    const html = renderToStaticMarkup(<CountdownRenderer data={paused} showControls />);
    expect(html).toContain('data-phase="paused"'); expect(html).toContain('data-seconds="42"');
    expect(html).toContain('aria-label="42 seconds elapsed, paused"'); expect(html).toContain('>Paused<');
    expect(html).toContain('Paused with 42.999 seconds elapsed.'); expect(html).not.toContain('Syncing time');
    expect(paused.pausedElapsedSeconds).toBe(42.999);
  });

  it('keeps a paused zero stopwatch distinct from empty remaining time', () => {
    const html = renderToStaticMarkup(<CountdownRenderer data={{ ...up, pausedElapsedSeconds: 0 }} />);
    expect(html).toContain('data-seconds="0"'); expect(html).toContain('>Paused<');
    expect(html).not.toContain('no time remaining'); expect(html).not.toContain('countdown-complete');
  });

  it('shows future starts honestly without counting down or claiming zero running elapsed time', () => {
    const html = renderToStaticMarkup(<CountdownRenderer data={up} serverNow="2030-01-01T11:59:58Z" showControls />);
    expect(html).toContain('data-phase="scheduled"'); expect(html).toContain('>Not started yet<');
    expect(html).toContain('data-duration="—:—:—"'); expect(html).not.toContain('data-seconds=');
    expect(html).toContain('Count-up has not started yet'); expect(html).toContain('Starts <time');
    expect(html).not.toContain('seconds remaining'); expect(html).not.toContain('countdown-complete');
  });

  it('never substitutes the browser wall clock when synchronization or the start instant is missing', () => {
    for (const serverNow of [undefined, 'not-a-server-clock']) {
      const html = renderToStaticMarkup(<CountdownRenderer data={up} serverNow={serverNow} />);
      expect(html).toContain('Waiting for server time'); expect(html).toContain('Syncing time…');
      expect(html).not.toContain('data-seconds='); expect(html).not.toContain('countdown-complete');
    }
    const preview = renderToStaticMarkup(<CountdownRenderer data={up} preview />);
    expect(preview).toContain('Count-up preview'); expect(preview).not.toContain('data-seconds=');
    const invalid = renderToStaticMarkup(<CountdownRenderer data={{ ...up, startedAt: 'invalid' }} serverNow="2030-01-01T12:00:00Z" />);
    expect(invalid).toContain('Invalid count-up start time'); expect(invalid).not.toContain('data-seconds=');
  });

  it('does not stop or change meaning after a year, and keeps long durations readable', () => {
    const elapsed = 400 * 86400 + 3723;
    const html = renderToStaticMarkup(<CountdownRenderer data={{ ...up, pausedElapsedSeconds: elapsed }} />);
    expect(html).toContain('data-duration="400d 01:02:03"'); expect(html).toContain(`aria-label="${elapsed} seconds elapsed, paused"`);
    expect(html).not.toContain('countdown-complete');
    for (const [width, height] of [[411, 700], [1300, 650]]) {
      const fit = fitCountdown(elapsed, width, height);
      expect(fit.fontSizes).toHaveLength(4); expect(fit.hiddenHours).toBe(false);
      expect(fit.fontSizes.every(size => size > 0 && Number.isFinite(size))).toBe(true);
    }
  });

  it('preserves the down-counting completed/paused behavior and keeps outer chrome opt-in', () => {
    const down = countdownDownDataSchema.parse({ endsAt: startedAt, completeText: 'Welcome back' });
    const complete = renderToStaticMarkup(<CountdownRenderer data={down} serverNow="2030-01-01T12:00:00.100Z" />);
    expect(complete).toContain('countdown-complete'); expect(complete).toContain('>Welcome back<');
    const view = { version: 1 as const, template: 'countdown' as const, title: 'Stored heading', source: { title: 'Stored source' }, data: { ...up, pausedElapsedSeconds: 42 } };
    const defaultHtml = renderToStaticMarkup(<Renderer view={view} />);
    expect(defaultHtml).toContain('Time since launch'); expect(defaultHtml).not.toContain('class="view-heading"');
    expect(defaultHtml).not.toContain('<details');
    const requested = renderToStaticMarkup(<Renderer view={{ ...view, showTitle: true, showControls: true }} />);
    expect(requested).toContain('class="view-heading"'); expect(requested).not.toContain('view-information');
    expect(requested).toContain('Timer details');
  });
});
