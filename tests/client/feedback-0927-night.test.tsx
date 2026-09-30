import { describe,expect,it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView,templateViewSchema } from '../../src/shared/view-schemas';
import { SOURCE_RECORD_TEMPLATES } from '../../src/shared/source-guidance';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';
import { regionalDateTime,regionalTime } from '../../src/shared/regional';
import { DEFAULT_CONFIG } from '../../src/shared/preferences';
import { flowchartDataSchema,fitFlowchart } from '../../src/shared/diagrams';
import { profileInstructions,profileDescription,profileGuide } from '../../src/server/mcp/profile-guidance';
import { guideFor } from '../../src/server/mcp/guide';
import { resolveToolCall } from '../../src/server/mcp/catalog';
import type { TemplateId } from '../../src/shared/types';
describe('night feedback contracts',()=>{
  it('requires verbatim sources in every requested template schema and help, without rejecting historical views',()=>{
    for(const template of SOURCE_RECORD_TEMPLATES){expect(JSON.stringify(z.toJSONSchema(templateViewSchema(template as TemplateId)))).toContain('character-for-character');expect(TEMPLATE_DISPLAY_GUIDANCE[template as TemplateId].detail).toContain('never summarize or paraphrase');}
    expect(JSON.stringify(guideFor('templates'))).toContain('character-for-character');
    expect(validateView({version:1,template:'document',data:{text:' Original\n\nexact text. '}}).data.text).toBe(' Original\n\nexact text. ');
  });
  it('surfaces consent-based friction feedback before discovery, consistently across profiles',()=>{
    for(const profile of ['domains','twelve','legacy'] as const){for(const text of [profileInstructions(profile),profileDescription(profile),JSON.stringify(profileGuide('feedback',guideFor('feedback'),profile))]){expect(text).toContain('file only on request or consent');expect(text).toContain('Never include private content or credentials');expect(text).toContain('do not nag');}}
  });
  it('formats DST and date boundaries with per-view precedence, keeping source timestamps unchanged',()=>{
    const timestamp='2026-09-27T23:30:00Z';
    expect(regionalDateTime(timestamp,{timeZone:'Europe/Oslo',dateFormat:'iso',timeFormat:'24h'})).toBe('2026-09-28 · 01:30 Europe/Oslo');
    expect(regionalTime('2026-01-27T23:30:00Z',{timeZone:'Europe/Oslo',timeFormat:'24h'})).toBe('00:30');
    const view=validateView({version:1,template:'inbox',format:{timeZone:'America/New_York',timeFormat:'24h'},data:{items:[{id:'m',from:'Sender',subject:'Source',timestamp}]}}),before=structuredClone(view);
    expect(renderToStaticMarkup(<Renderer view={view} config={{...DEFAULT_CONFIG,timeZone:'Europe/Oslo'}}/>)).toContain('19:30 America/New_York');expect(view).toEqual(before);
    const local=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(timestamp));expect(regionalTime(timestamp,{timeFormat:'24h'})).toBe(local);
    expect(regionalDateTime('source prose',{timeZone:'Europe/Oslo'})).toBe('source prose');
  });
  it('exposes checklist item operations and timezone through all public publish profiles',()=>{
    for(const [profile,name,args] of [['domains','kanvas_publish',{operation:'patch'}],['twelve','kanvas_publish',{operation:'patch'}],['legacy','kanvas_view_patch',{}]] as const){expect(resolveToolCall(profile,name,{...args,sessionId:'s',displayId:'d',expectedRevision:1,requestId:'r',operations:[{op:'checklist',action:'update',itemId:'one',value:{checked:true}}]}).error).toBeUndefined();}
  });
  it('fits nine decision-process nodes inside phone, laptop and landscape viewports with readable labels',()=>{
    const data=flowchartDataSchema.parse({layout:'top-down',nodes:Array.from({length:9},(_,i)=>({id:String(i),label:i%3===1?'Approved?':`Booking step ${i+1}`,shape:i%3===1?'decision':'box'})),edges:Array.from({length:8},(_,i)=>({from:String(i),to:String(i+1)}))});
    for(const [w,h] of [[342,748],[1120,540],[1760,860]]){const layout=fitFlowchart(data,w,h);expect(layout.width*layout.scale).toBeLessThanOrEqual(w);expect(layout.height*layout.scale).toBeLessThanOrEqual(h);expect(18*layout.scale).toBeGreaterThanOrEqual(12);expect(layout.nodes).toHaveLength(9);expect(layout.edges).toHaveLength(8);}
  });
  it('emits one-line wind text and an explicit navigable checklist reader',()=>{
    const html=renderToStaticMarkup(<Renderer view={validateView({version:1,template:'calendar',data:{view:'three-day',anchorDate:'2026-09-27',timeZone:'UTC',items:[],weather:[{time:'2026-09-27T09:00:00Z',condition:'sun',temperature:12,wind:{speed:3,unit:'m/s',direction:'NW'}}]}})}/>);expect(html).toContain('weather-wind');expect(html).not.toContain('<br');
    expect(renderToStaticMarkup(<Renderer view={validateView({version:1,template:'checklist',data:{items:[{id:'a',text:'First'}]}})}/>)).toContain('aria-label="Checklist items"');
  });
});
