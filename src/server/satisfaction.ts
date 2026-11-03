import {createHash} from 'node:crypto';
import {satisfactionDataSchema,satisfactionRateSchema,satisfactionScores,satisfactionReadSchema} from '../shared/satisfaction.js';
import type {ViewSpec} from '../shared/types.js';
import {Store,AppError} from './store.js';
/** Called only inside the ordinary respond transaction, after ACL/CAS/dedupe. */
export async function acceptSatisfaction(store:Store,sessionId:string,displayId:string,principalId:string,view:ViewSpec,raw:unknown,now=Date.now()){
 if(process.env.KANVAS_SATISFACTION_ENABLED==='false')throw new AppError('FEATURE_DISABLED','Satisfaction collection is disabled.',409);
 const data=satisfactionDataSchema.parse(view.data),input=satisfactionRateSchema.parse(raw);
 if(data.closed)throw new AppError('RESPONSE_CLOSED','This survey is closed.',409);
 if(!satisfactionScores(data.levels).includes(input.rating))throw new AppError('INVALID_RESPONSE','Choose a displayed face.');
 const id=createHash('sha256').update(JSON.stringify([sessionId,displayId,principalId])).digest('hex');
 const prior=await store.get<{id:string;at:number}>('satisfaction-rate',id);
 if(prior&&now-prior.at<500)throw new AppError('RATE_LIMIT','Wait briefly before the next rating.',429);
 await store.put('satisfaction-rate',{id,sessionId,at:now});
 return {surveyId:data.surveyId,rating:input.rating,levels:data.levels};
}
/** Caller must authorize session editor and optional display before this read. */
export async function readSatisfaction(store:Store,raw:unknown){
 const input=satisfactionReadSchema.parse(raw),from=new Date(input.from).toISOString(),to=new Date(input.to).toISOString();
 let sql="SELECT (value::jsonb->>'rating')::int AS rating, count(*) AS count FROM documents WHERE kind='satisfaction-response' AND session_id=? AND value::jsonb->>'createdAt'>=? AND value::jsonb->>'createdAt'<?";
 const params:unknown[]=[input.sessionId,from,to];
 if(input.displayId){sql+=" AND value::jsonb->>'displayId'=?";params.push(input.displayId);}
 if(input.surveyId){sql+=" AND value::jsonb->>'surveyId'=?";params.push(input.surveyId);}
 const rows=await store.db.prepare(sql+' GROUP BY 1 ORDER BY 1').all(...params);
 const counts:Record<string,number>={'1':0,'2':0,'3':0,'4':0,'5':0};for(const row of rows)counts[String(row.rating)]=Number(row.count);
 return {sessionId:input.sessionId,...(input.displayId?{displayId:input.displayId}:{}),...(input.surveyId?{surveyId:input.surveyId}:{}),from,to,range:'[from,to)',counts,total:Object.values(counts).reduce((a,b)=>a+b,0),scale:{'1':'sad','2':'somewhat sad','3':'neutral','4':'somewhat happy','5':'happy'},note:'Repeated kiosk taps are responses, not unique people. Three-face mode uses1,3,5. Timestamps are server recorded; no inferred demographics.'};
}
