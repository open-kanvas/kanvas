import { ChartRenderer } from './Chart';
import { DiagramRenderer } from './Diagrams';
import type { CSSProperties } from 'react';
import type { ExtendedData } from '../../shared/extended-templates';
import { timelineScale, timelineDate } from '../../shared/timeline';
import './timeline-fit.css';
/** One shared temporal scale, one event per lane: close dates never collide. */
export function TimelineRenderer({data}:{data:ExtendedData<'timeline'>}) {
  const scale=timelineScale(data.events);
  const active=scale.events.find(event=>event.id===data.activeEventId),visual=active?.visual;
  return <section className={`temporal-timeline temporal-${data.orientation}`} style={{"--event-count":data.events.length} as CSSProperties} data-progressive={Boolean(active)} aria-label="Timeline" data-navigation-scroll tabIndex={0}>
    <header className="temporal-key"><span>Chronological events</span><span>● Milestone · ━ Duration · UTC</span></header>
    {active&&<section key={active.id} className="temporal-stage" aria-label="Active milestone" aria-live="polite" data-active-event-id={active.id}>
      <h2>{active.title}</h2>
      {visual?.kind==='image'?<figure><img src={visual.url} alt={visual.alt}/>{visual.caption&&<figcaption>{visual.caption}</figcaption>}</figure>:visual?.kind==='chart'?<ChartRenderer data={visual.data} showControls={false}/>:visual?.kind==='flowchart'?<DiagramRenderer view={{version:1,template:'flowchart',data:visual.data}}/>:<p>{active.description??'No visual supplied for this milestone.'}</p>}
    </section>}
    <div className="temporal-plot"><div className="temporal-ticks"  aria-label="Time axis">{scale.ticks.map((t,i)=><time key={i} dateTime={t}>{timelineDate(t,scale.span)}</time>)}</div>
    <div className="temporal-events">{scale.events.map(event=><article className={`temporal-event ${event.id===data.activeEventId?"is-active":""}`} aria-current={event.id===data.activeEventId?"step":undefined} key={event.id} data-event-id={event.id}>
      <div className="temporal-card"><time dateTime={event.start}>{timelineDate(event.start,scale.span)}{event.end&&` — ${timelineDate(event.end,scale.span)}`}</time>{event.lane&&<small>{event.lane}</small>}<h3>{event.url?<a href={event.url} target="_blank" rel="noopener noreferrer">{event.title}</a>:event.title}</h3>{event.description&&<p>{event.description}</p>}{event.image&&<img src={event.image.url} alt={event.image.alt}/>}</div>
      <div className="temporal-lane" role="img" aria-label={`${event.title}: ${event.start}${event.end?` to ${event.end}`:' (milestone)'}`} style={{'--start':`${scale.position(event.start)*100}%`,'--duration':`${(scale.position(event.end??event.start)-scale.position(event.start))*100}%`} as CSSProperties} data-time-position={scale.position(event.start)}>
        <span className="temporal-grid"/><span className={event.end?'temporal-duration':'temporal-point'}/><time className="temporal-label">{timelineDate(event.start,scale.span)}</time>
      </div>
    </article>)}</div></div>
  </section>;
}
