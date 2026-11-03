import {useEffect,useRef,useState} from 'react';
import {satisfactionDataSchema,satisfactionScores} from '../../shared/satisfaction';
import type {RendererProps} from './Renderer';
import {errorMessage} from '../api';
import './satisfaction.css';
export function SatisfactionFace({score}:{score:number}){
 return <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" fill={['','#e34848','#ef9042','#efcf42','#8fca4a','#39b869'][score]}/><circle cx="33" cy="37" r="5"/><circle cx="67" cy="37" r="5"/><path d={score<3?'M27 72Q50 '+(score===1?37:50)+' 73 72':score>3?'M27 60Q50 '+(score===5?94:80)+' 73 60':'M28 67H72'} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/></svg>;
}
export function SatisfactionRenderer({view,actionable,preview,onRespond,revision}:RendererProps){
 const data=satisfactionDataSchema.parse(view.data),[busy,setBusy]=useState(false),[thanks,setThanks]=useState(false),[error,setError]=useState<string>(),sending=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useEffect(()=>{clearTimeout(timer.current);setThanks(false);setError(undefined);},[data.surveyId,revision]);
 const enabled=actionable&&!preview&&!data.closed&&!!onRespond;
 const send=async(rating:number)=>{if(!enabled||sending.current||thanks)return;sending.current=true;setBusy(true);setError(undefined);try{await onRespond!({kind:'satisfaction.rate',rating});setThanks(true);timer.current=setTimeout(()=>setThanks(false),data.thankYouSeconds*1000);}catch(e){setError(errorMessage(e));}finally{sending.current=false;setBusy(false);}};
 if(import.meta.env.VITE_KANVAS_SATISFACTION==='false')return <div role="status">Satisfaction collection is disabled. Saved responses are retained.</div>;
 return <section className="satisfaction-view" aria-label="Satisfaction survey">{data.question&&<h1>{data.question}</h1>}{thanks?<div className="satisfaction-thanks" role="status">{data.thankYou??'✓'}</div>:<div className="satisfaction-faces" data-levels={data.levels}>{satisfactionScores(data.levels).map(score=><button key={score} type="button" disabled={!enabled||busy} onClick={()=>void send(score)} aria-label={['','Sad','Somewhat sad','Neutral','Somewhat happy','Happy'][score]}><SatisfactionFace score={score}/></button>)}</div>}{error&&<p role="alert">{error}</p>}{data.closed&&<p role="status">Closed</p>}</section>;
}
