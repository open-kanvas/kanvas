import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CountdownRenderer, fitCountdown } from '../../src/client/renderers/Time';
import { Renderer } from '../../src/client/renderers/Renderer';
import { countdownDownDataSchema, countdownParts, countdownRemainingSeconds, formatCountdown } from '../../src/shared/timer';

const endsAt = '2030-01-01T12:00:00.500Z';

describe('countdown time and meaningful state', () => {
  it('keeps partial seconds until the actual deadline, stops at zero, and does not consume a paused remainder', () => {
    const end = Date.parse(endsAt);
    expect(countdownRemainingSeconds({ endsAt }, end - 1001)).toBe(2);
    expect(countdownRemainingSeconds({ endsAt }, end - 1)).toBe(1);
    expect(countdownRemainingSeconds({ endsAt }, end)).toBe(0);
    expect(countdownRemainingSeconds({ endsAt }, end + 90_000)).toBe(0);
    const paused = { endsAt, pausedRemainingSeconds: 42.125 };
    expect(countdownRemainingSeconds(paused, 0)).toBe(43);
    expect(countdownRemainingSeconds(paused, end + 100_000)).toBe(43);
    expect(paused.pausedRemainingSeconds).toBe(42.125);
    expect(formatCountdown(90061)).toBe('1d 01:01:01');
    expect(formatCountdown(1234567 * 86400 + 3723)).toBe('1234567d 01:02:03');
  });

  it('does not invent a current clock or turn unsynchronized/invalid input into a completed timer', () => {
    const data = countdownDownDataSchema.parse({ endsAt });
    for (const serverNow of [undefined, 'not-a-timestamp']) {
      const html = renderToStaticMarkup(<CountdownRenderer data={data} serverNow={serverNow} />);
      expect(html).toContain('Waiting for server time'); expect(html).toContain('Syncing time…');
      expect(html).toContain('data-duration="—:—:—"'); expect(html).not.toContain('Time is up');
    }
    const invalid = renderToStaticMarkup(<CountdownRenderer data={{ ...data, endsAt: 'invalid' }} serverNow="2030-01-01T11:00:00Z" />);
    expect(invalid).toContain('Invalid countdown time'); expect(invalid).not.toContain('Time is up');
  });

  it('keeps the supplied identity, explicit paused/completed states and optional details', () => {
    const data = countdownDownDataSchema.parse({ endsAt, label: 'Return to the workshop', completeText: 'Welcome back', pausedRemainingSeconds: 42 });
    const html = renderToStaticMarkup(<CountdownRenderer data={data} />);
    expect(html).toContain('Return to the workshop'); expect(html).toContain('data-seconds="42"'); expect(html).toContain('>Paused<');
    expect(html).not.toContain('<details'); expect(html).not.toContain('>Welcome back<');
    const details = renderToStaticMarkup(<CountdownRenderer data={data} showControls />);
    expect(details).toContain('<details'); expect(details).toContain('Paused with 42 seconds remaining');
    expect(details).not.toContain('Ends <time');
    const pausedZero = renderToStaticMarkup(<CountdownRenderer data={{ ...data, pausedRemainingSeconds: 0 }} />);
    expect(pausedZero).toContain('Paused · no time remaining'); expect(pausedZero).not.toContain('>Welcome back<');
    const complete = renderToStaticMarkup(<CountdownRenderer data={{ ...data, pausedRemainingSeconds: undefined }} serverNow="2030-01-01T12:00:01Z" />);
    expect(complete).toContain('data-seconds="0"'); expect(complete).toContain('>Welcome back<');
  });

  it('leaves outer metadata off while honouring explicit title/source/control flags', () => {
    const view = { version: 1 as const, template: 'countdown' as const, title: 'Stored metadata', source: { title: 'Stored source' }, data: countdownDownDataSchema.parse({ endsAt, label: 'Main timer', pausedRemainingSeconds: 42 }) };
    const defaultHtml = renderToStaticMarkup(<Renderer view={view} />);
    expect(defaultHtml).toContain('Main timer'); expect(defaultHtml).not.toContain('class="view-heading"');
    expect(defaultHtml).not.toContain('<details');
    const optedIn = renderToStaticMarkup(<Renderer view={{ ...view, showTitle: true, showControls: true }} />);
    expect(optedIn).toContain('class="view-heading"'); expect(optedIn).not.toContain('view-information'); expect(optedIn).toContain('Timer details');
  });
});

describe('countdown container fit', () => {
  it('uses the free portrait height for dominant minutes/seconds and retains a single wide-screen row', () => {
    const phone = fitCountdown(42, 411, 700);
    expect(phone.layout).toBe('stack'); expect(phone.hiddenHours).toBe(true);
    expect(phone.fontSizes[1]).toBeGreaterThan(240); expect(phone.fontSizes[2]).toBeGreaterThan(240);
    const desktop = fitCountdown(42, 1300, 650);
    expect(desktop.layout).toBe('row'); expect(desktop.hiddenHours).toBe(false);
    expect(desktop.fontSizes[0]).toBeGreaterThan(240);
    expect(fitCountdown(3600, 411, 700).hiddenHours).toBe(false);
    expect(fitCountdown(3599.01, 411, 700).hiddenHours).toBe(false);
  });

  it.each([42, 3599, 3600, 86399, 90061, 31536000, 1234567 * 86400 + 3723])('fits all units without discarding seconds or long day counts: %s', seconds => {
    const parts = countdownParts(seconds);
    const values = [...(parts.days ? [String(parts.days)] : []), ...[parts.hours, parts.minutes, parts.seconds].map(value => String(value).padStart(2, '0'))];
    for (const [width, height] of [[411, 700], [358, 744], [288, 468], [1300, 650], [1856, 940], [220, 120]]) {
      const fit = fitCountdown(seconds, width, height);
      const columns = fit.layout === 'grid' ? 2 : fit.layout === 'row' ? values.length : 1;
      const visibleFonts = fit.fontSizes.filter(size => size > 0);
      expect(visibleFonts.length).toBe(values.length - (fit.hiddenHours ? 1 : 0));
      expect(visibleFonts.every(value => value > 0 && Number.isFinite(value))).toBe(true);
      if (fit.layout === 'row') {
        const widthOfDigits = values.reduce((sum, text, index) => sum + text.length * .64 * fit.fontSizes[index], 0);
        const punctuationCharacters = parts.days ? 4 : 2;
        expect(widthOfDigits + punctuationCharacters * .3 * visibleFonts[0]).toBeLessThanOrEqual(width);
      } else {
        for (const [index, text] of values.entries()) expect(text.length * .64 * fit.fontSizes[index]).toBeLessThanOrEqual((width - fit.gap * (columns - 1)) / columns);
      }
      const maximumRowHeight = Math.max(...visibleFonts) + fit.unitLabelSize * 1.65;
      expect(maximumRowHeight * fit.rows + fit.gap * (fit.rows - 1)).toBeLessThanOrEqual(height + .01);
    }
  });

  it('remeasures for a font with wider numerals and for a constrained label/details area', () => {
    const full = fitCountdown(90123, 411, 700, .55);
    const widerFont = fitCountdown(90123, 411, 700, .9);
    expect(widerFont.fontSizes[0]).toBeLessThan(full.fontSizes[0]);
    const reduced = fitCountdown(42, 411, 350);
    expect(reduced.fontSizes[1]).toBeLessThan(fitCountdown(42, 411, 700).fontSizes[1]);
    expect(fitCountdown(1234567 * 86400, 411, 700).fontSizes[0]).toBeLessThan(fitCountdown(1234567 * 86400, 411, 700).fontSizes[1]);
  });
});

it('minute precision rounds down-counts up without altering stored seconds, while auto keeps the final seconds visible',()=>{
 const base=countdownDownDataSchema.parse({endsAt,pausedRemainingSeconds:3599,precision:'minutes'});
 const minutes=renderToStaticMarkup(<CountdownRenderer data={base}/>);
 expect(minutes).not.toContain('data-unit="seconds"');expect(minutes).toContain('data-seconds="3599"');expect(minutes).toContain('data-duration="01:00"');
 const auto=renderToStaticMarkup(<CountdownRenderer data={{...base,precision:'auto',pausedRemainingSeconds:599}}/>);
 expect(auto).toContain('data-unit="seconds"');
});
