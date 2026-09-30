import { useRegional } from './Regional';
import { regionalDate } from '../../shared/regional';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { clockDayDifference, clockDayLabel, clockEpochMilliseconds, createClockAnchor, formatClock, wakeClockAnchor, type ClockAnchor, type ClockData, type ClockPart, type ClockReading } from '../../shared/clock';
import type { RendererProps } from './Renderer';
import './clock.css';

const PERIOD_SCALE = .28;

/** Fit the complete localized time against actual free pixels. Numerals use
 * their widest tabular glyph; AM/PM stays in its locale's position and scale. */
export function fitClockFont(width: number, height: number, parts: ClockPart[], measure: (text: string) => number, digits = '0123456789'): number {
  const digitWidth = Math.max(...Array.from(digits, digit => measure(digit)), .1);
  const units = parts.reduce((total, part) => {
    const measured = ['hour', 'minute', 'second'].includes(part.type) ? Array.from(part.value).reduce((size, glyph) => size + (/\p{N}/u.test(glyph) ? digitWidth : measure(glyph)), 0) : measure(part.value);
    return total + measured * (part.secondary ? PERIOD_SCALE : 1);
  }, 0);
  return Math.max(1, Math.floor(Math.min(Math.max(1, width) / Math.max(.1, units), Math.max(1, height) / 1.15) * .97));
}

function ClockTime({ reading, instant, className = '' }: { reading: ClockReading; instant: number; className?: string }) {
  return <time className={`clock-time ${className}`} dateTime={new Date(instant).toISOString()} aria-live="off" aria-label={`${reading.time} · ${reading.timeZone}`}>
    {reading.parts.map((part, index) => <span key={index} className={part.secondary ? 'clock-affix' : undefined} aria-hidden="true">{part.value}</span>)}
  </time>;
}

function PrimaryClock({ reading, instant, label, showDate, fontIdentity, locale }: {
  reading: ClockReading; instant: number; label?: string; showDate: boolean; fontIdentity?: string; locale?: string;
}) {
  const regional=useRegional();
  const frame = useRef<HTMLDivElement>(null), labelElement = useRef<HTMLHeadingElement>(null), dateElement = useRef<HTMLParagraphElement>(null);
  const [fontSize, setFontSize] = useState<number>();
  const shape = reading.parts.map(part => `${part.type}:${part.secondary ? part.value : part.value.replace(/\p{N}/gu, '0')}`).join('|');
  useLayoutEffect(() => {
    const target = frame.current;
    if (!target) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const time = target.querySelector('.clock-time');
      if (!time) return;
      const styles = getComputedStyle(time), stack = target.querySelector('.clock-primary-stack')!;
      const gap = Number.parseFloat(getComputedStyle(stack).rowGap) || 0;
      const labelHeight = labelElement.current?.getBoundingClientRect().height ?? 0, dateHeight = dateElement.current?.getBoundingClientRect().height ?? 0;
      const { width, height } = target.getBoundingClientRect();
      const freeHeight = height - labelHeight - dateHeight - gap * (Number(Boolean(labelHeight)) + Number(Boolean(dateHeight)));
      const canvas = document.createElement('canvas').getContext('2d');
      if (canvas) canvas.font = `500 100px ${styles.fontFamily}`;
      let digits = '0123456789';
      try { digits = new Intl.NumberFormat(locale, { useGrouping: false }).format(1234567890); }
      catch { digits = new Intl.NumberFormat(undefined, { useGrouping: false }).format(1234567890); }
      const next = fitClockFont(width, freeHeight, reading.parts, text => canvas ? canvas.measureText(text).width / 100 : Array.from(text).length * .66, digits);
      setFontSize(previous => previous === next ? previous : next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(target);
    if (labelElement.current) observer?.observe(labelElement.current);
    if (dateElement.current) observer?.observe(dateElement.current);
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => { active = false; observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [shape, label, showDate, reading.date, fontIdentity, locale]);

  return <div className="clock-primary" ref={frame} data-time-zone={reading.timeZone} style={fontSize ? { '--clock-font': `${fontSize}px` } as CSSProperties : undefined}>
    <div className="clock-primary-stack">
      {label && <h2 className="clock-label" ref={labelElement}>{label}</h2>}
      <ClockTime reading={reading} instant={instant} className="clock-primary-time" />
      {showDate && <p className="clock-date" ref={dateElement}><time dateTime={reading.isoDate}>{regionalDate(reading.isoDate,regional,'UTC',()=>reading.date)}</time></p>}
    </div>
  </div>;
}

export function ClockRenderer(props: RendererProps) {
  const regional=useRegional();
  const sourceData=props.view.data as unknown as ClockData;
  const localeDefault=new Intl.DateTimeFormat(regional.numberLocale||regional.language||'en-GB',{hour:'numeric'}).resolvedOptions().hour12?'12h':'24h';
  const requestedFormat=props.view.format?.timeFormat??regional.timeFormat??sourceData.hourFormat??'locale';
  const data={...sourceData,hourFormat:requestedFormat==='locale'?localeDefault:requestedFormat} as ClockData;
  const anchor = useRef<ClockAnchor | undefined>(undefined), source = useRef<string | undefined>(undefined);
  const [, redraw] = useState(0);
  if (source.current !== props.serverNow) {
    source.current = props.serverNow;
    anchor.current = createClockAnchor(props.serverNow, Date.now(), performance.now());
  }
  useEffect(() => {
    if (props.preview) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unit = data.showSeconds ? 1000 : 60_000;
    const update = () => {
      clearTimeout(timer);
      // This only schedules a render; the displayed time is never a tick counter.
      redraw(value => value + 1);
      const current = clockEpochMilliseconds(anchor.current, Date.now(), performance.now());
      const remaining = unit - (current % unit + unit) % unit;
      timer = setTimeout(update, Math.max(16, remaining + 5));
    };
    const wake = () => {
      if (document.visibilityState === 'hidden') return;
      anchor.current = wakeClockAnchor(anchor.current, Date.now(), performance.now());
      update();
    };
    update();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('pageshow', wake); };
  }, [data.showSeconds, props.serverNow, props.preview]);

  const instant = clockEpochMilliseconds(anchor.current, Date.now(), performance.now());
  const locale = regional.numberLocale || props.config?.numberLocale, primary = formatClock(instant, data, data.timeZone, locale), zones = data.zones ?? [];
  const label = data.label ?? data.timeZone ?? (zones.length ? 'Local time' : undefined);
  return <section className={`clock-content ${zones.length ? 'clock-with-zones' : 'clock-solo'}`} aria-label="Current time" data-clock-source={anchor.current ? 'server' : 'browser'}>
    <PrimaryClock reading={primary} instant={instant} label={label} showDate={Boolean(data.showDate)} fontIdentity={props.config?.style} locale={locale} />
    {!!zones.length && <div className="clock-comparisons" aria-label="Comparison time zones" style={{ '--clock-zones': zones.length } as CSSProperties}>
      {zones.map(zone => {
        const reading = formatClock(instant, data, zone.timeZone, locale), difference = clockDayDifference(primary, reading);
        return <section className="clock-comparison" key={zone.timeZone} aria-label={zone.label} data-time-zone={zone.timeZone}>
          <h3 className="clock-label">{zone.label}</h3>
          <ClockTime reading={reading} instant={instant} />
          {data.showDate ? <p className="clock-date"><time dateTime={reading.isoDate}>{regionalDate(reading.isoDate,regional,'UTC',()=>reading.date)}</time></p> : difference !== 0 && <p className="clock-day-difference">{clockDayLabel(difference, locale)}</p>}
        </section>;
      })}
    </div>}
  </section>;
}
