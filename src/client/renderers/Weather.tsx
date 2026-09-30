import { FormattedTime } from './Regional';
import { useId, type CSSProperties } from 'react';
import type { ExtendedData } from '../../shared/extended-templates';
import './weather.css';
import { useRegional } from './Regional';
import { regionalTemperature } from '../../shared/regional';

type Condition = ExtendedData<'weather'>['condition'];
const labels: Record<Condition, string> = { clear: 'Clear', 'partly-cloudy': 'Partly cloudy', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorms', fog: 'Fog' };

/** Self-contained vector artwork: no remote imagery, random layout or weather inference. */
export function WeatherSymbol({ condition, night = false, miniature = false }: { condition: Condition; night?: boolean; miniature?: boolean }) {
  const id = useId().replaceAll(':', '');
  const cloud = condition !== 'clear', precipitation = ['rain','snow','storm'].includes(condition);
  return <svg className={`weather-symbol ${miniature ? 'weather-symbol-mini' : ''}`} viewBox="0 0 360 250" role="img" aria-label={`${labels[condition]} illustration`}>
    <defs><linearGradient id={`${id}-cloud`} x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#f5faff"/><stop offset="1" stopColor={precipitation ? '#91abc6' : '#cbdbe9'}/></linearGradient><radialGradient id={`${id}-sun`}><stop stopColor="#fff9cd"/><stop offset="1" stopColor="#ffcd6e"/></radialGradient><linearGradient id={`${id}-rain`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a1e7ff"/><stop offset="1" stopColor="#56acdf"/></linearGradient></defs>
    {(!cloud || condition === 'partly-cloudy') && <g className="weather-orb" transform={cloud ? 'translate(52 -20)' : 'translate(110 5)'}>{night ? <path d="M69 29a69 69 0 1 0 84 91A73 73 0 0 1 69 29Z" fill="#e7f1ff"/> : <><g stroke="#ffdb8d" strokeWidth="5" strokeLinecap="round">{Array.from({length:12},(_,i)=><path key={i} d="M70 -2V-15" transform={`rotate(${i*30} 70 75)`}/>)}</g><circle cx="70" cy="75" r="55" fill={`url(#${id}-sun)`}/></>}</g>}
    {cloud && <g className="weather-cloud-shape"><ellipse cx="183" cy="158" rx="119" ry="14" fill="#082235" opacity=".1"/><path d="M80 154a35 35 0 0 1-4-70 52 52 0 0 1 93-29 67 67 0 0 1 111 56 25 25 0 0 1-5 49H81Z" fill={`url(#${id}-cloud)`}/><path d="M80 89a33 33 0 0 1 20 8M173 77a61 61 0 0 1 54-33" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".42" fill="none"/></g>}
    {condition === 'storm' && <path d="m187 143-38 59h32l-15 43 59-74h-35l19-28Z" fill="#ffe28a" className="weather-bolt"/>}
    {precipitation && <g>{Array.from({length:condition === 'snow'?12:9},(_,i)=>{
      const x=87+(i%5)*42, y=174+Math.floor(i/5)*32;
      return condition==='snow'?<g key={i} className="weather-flake" style={{'--weather-delay':`${-i*.63}s`} as CSSProperties}><path d={`M${x-5} ${y}h10m-5-5v10m-4-9 8 8m-8 0 8-8`} stroke="#e3f4ff" strokeWidth="2" strokeLinecap="round"/></g>:<path key={i} className="weather-drop" d={`M${x} ${y}l-7 15`} stroke={`url(#${id}-rain)`} strokeWidth="5" strokeLinecap="round" style={{'--weather-delay':`${-i*.21}s`} as CSSProperties}/>;
    })}</g>}
    {condition === 'fog' && <g fill="none" stroke="#dcebf3" strokeWidth="9" strokeLinecap="round" className="weather-mist"><path d="M55 185h115m25 0h104M75 210h200M112 235h150"/></g>}
  </svg>;
}

export function WeatherRenderer({ data: supplied, title: _title, showControls = false }: { data: ExtendedData<'weather'>; title?: string; showControls?: boolean }) {
  const regional=useRegional(),convert=(value:string|undefined)=>regionalTemperature(value,regional,supplied.temperatureUnit);
  const data={...supplied,temperature:convert(supplied.temperature),high:convert(supplied.high),low:convert(supplied.low),forecast:supplied.forecast?.map(item=>({...item,temperature:convert(item.temperature)}))};
  const hasRange = data.high !== undefined || data.low !== undefined;
  const Support = showControls ? 'details' : 'section';
  return <div className={`weather-visual weather-${data.condition} weather-period-${data.period}`}>
    <p className="weather-place">{data.place}{data.timeLabel && <span>{data.timeLabel}</span>}</p>
    <div className="weather-focus"><WeatherSymbol condition={data.condition} night={data.period === 'night'}/><div className="weather-values">
      {data.temperature && <strong className={`weather-temperature ${data.temperature.length>8?'weather-temperature-long':''}`} style={{'--temperature-length':data.temperature.length} as CSSProperties}>{data.temperature}</strong>}
      {hasRange && <dl className={`weather-range ${data.temperature?'has-current':''}`}>{data.high!==undefined&&<div><dt>High</dt><dd>{data.high}</dd></div>}{data.low!==undefined&&<div><dt>Low</dt><dd>{data.low}</dd></div>}</dl>}
      <h2 className="weather-condition">{labels[data.condition]}</h2>
      {data.description && <p className="weather-description">{data.description}</p>}
    </div></div>
    {(Boolean(data.details?.length)||Boolean(data.forecast?.length))&&<Support className="weather-more">{showControls && <summary>Forecast & details</summary>}{!!data.forecast?.length&&<ol className="weather-forecast-cards">{data.forecast.map((item,i)=><li key={i}><time>{<FormattedTime value={item.time}/>} </time><WeatherSymbol condition={item.condition} miniature night={data.period==='night'}/><span>{labels[item.condition]}</span><strong>{item.temperature}</strong></li>)}</ol>}{!!data.details?.length&&<dl className="weather-detail-list">{data.details.map((item,i)=><div key={i}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}</Support>}
  </div>;
}
