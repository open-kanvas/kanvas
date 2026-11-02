/** Illustrative clock path, NOT solar ephemeris. Read supplied wall-clock hours;
 * never convert an ISO offset through the receiving device timezone. */
export function forecastHour(time?: string): number | undefined {
 const match = time?.trim().match(/^(?:\d{4}-\d{2}-\d{2}[T ])?(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:\s*(AM|PM)|Z|[+-]\d{2}:?\d{2})?$/i);
 if (!match) return undefined;
 let hour=Number(match[1]);const minute=Number(match[2]),meridian=match[3]?.toUpperCase();
 if(minute>59||hour>23||(meridian&&(hour<1||hour>12)))return undefined;
 if(meridian)hour=hour%12+(meridian==='PM'?12:0);
 return hour+minute/60;
}
export const WEATHER_STEP_MS=3000;
export function weatherSunPosition(time: string | undefined, period: string, forecast: readonly {time:string;period?:string}[] = []) {
 const hour=forecastHour(time),date=time?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
 const sameDay=forecast.filter(f=>f.time.match(/^\d{4}-\d{2}-\d{2}/)?.[0]===date);
 const rise=forecastHour(sameDay.find(f=>f.period==='sunrise')?.time)??6;
 const set=forecastHour(sameDay.find(f=>f.period==='sunset')?.time)??18;
 const progress=hour===undefined?(period==='sunrise'?0:period==='sunset'?1:.5):Math.max(0,Math.min(1,(hour-rise)/Math.max(1,set-rise)));
 return {x:.08+.84*progress,y:.68-.53*Math.sin(Math.PI*progress)};
}
