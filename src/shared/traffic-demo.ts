import {z} from 'zod';
export const trafficDemoSchema=z.object({pairId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),perspective:z.enum(['both','a','b']).default('both'),mode:z.enum(['manual','timed']).default('manual'),requested:z.enum(['a','b','all-red']).default('all-red'),epoch:z.iso.datetime({offset:true}),greenASeconds:z.number().int().min(1).max(600).default(15),greenBSeconds:z.number().int().min(1).max(600).default(15),allRedSeconds:z.number().int().min(1).max(120).default(3),paused:z.boolean().default(false)}).strict();
export type TrafficDemoData=z.infer<typeof trafficDemoSchema>;
/** Illustration only. No hardware, delivery coordination or reliable clock synchronization. */
export function trafficDemoPhase(d:TrafficDemoData,now:number){
 const elapsed=(now-Date.parse(d.epoch))/1000;
 if(d.paused||!Number.isFinite(elapsed)||elapsed<0)return {green:null,remaining:null} as const;
 if(d.mode==='manual')return {green:elapsed<d.allRedSeconds||d.requested==='all-red'?null:d.requested,remaining:elapsed<d.allRedSeconds?Math.ceil(d.allRedSeconds-elapsed):null};
 const cycle=d.allRedSeconds*2+d.greenASeconds+d.greenBSeconds,t=elapsed%cycle;
 if(t<d.allRedSeconds)return {green:null,remaining:Math.ceil(d.allRedSeconds-t)};
 if(t<d.allRedSeconds+d.greenASeconds)return {green:'a',remaining:Math.ceil(d.allRedSeconds+d.greenASeconds-t)} as const;
 if(t<2*d.allRedSeconds+d.greenASeconds)return {green:null,remaining:Math.ceil(2*d.allRedSeconds+d.greenASeconds-t)};
 return {green:'b',remaining:Math.ceil(cycle-t)} as const;
}
