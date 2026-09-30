import { resolveToolCall } from '../../src/server/mcp/catalog';
import { z } from 'zod';
import { describe,expect,it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView,templateViewSchema } from '../../src/shared/view-schemas';
import { samples,templateNames } from '../../src/shared/template-examples';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';
import { calendarDataSchema } from '../../src/shared/planner';
import { diagramLayout,orgChartDataSchema,networkDataSchema } from '../../src/shared/diagrams';
import { regionalDateTime,regionalClock } from '../../src/shared/regional';
import { DEFAULT_CONFIG } from '../../src/shared/preferences';
const base={anchorDate:'2026-09-01',timeZone:'UTC',view:'month',items:[{id:'roma',title:'Roma',allDay:true,start:'2026-09-20',end:'2026-09-27'}]};
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
describe('evening visual contracts',()=>{
  it('shares continuous, exclusive-end month bars in calendar, planner and schedule, splitting only at week boundaries',()=>{
    for(const template of ['calendar','planner']){const html=render(template,base);expect(html.match(/data-event-id="roma"/g)).toHaveLength(2);expect(html.match(/data-item-id="roma"/g)).toHaveLength(2);expect(html).toContain('grid-column:1 / 7');}
    const html=render('schedule',{date:'2026-09-01',view:'month',timeZone:'UTC',events:base.items.map(i=>({...i,start:i.start+'T00:00:00Z',end:i.end+'T00:00:00Z'}))});expect(html.match(/data-event-id="roma"/g)).toHaveLength(2);
  });
  it('groups supplied weather per day, stacks sun/temperature/rain, and accepts optional wind and solar markers',()=>{
    const weather=[{time:'2026-09-01T09:00:00Z',condition:'sun',temperature:17,precipitationChance:5,wind:{speed:4,unit:'m/s',direction:'NW'},sunrise:'2026-09-01T05:13:00Z',sunset:'2026-09-01T19:45:00Z'}];
    for(const view of ['day','three-day','week']){const html=render('calendar',{...base,view,weather});expect(html).toContain('Supplied forecast for 2026-09-01');expect(html).toContain('weather-icon is-sun');expect(html).toContain('weather-wind');expect(html).toContain('aria-label="sunrise"');expect(html).toContain('aria-label="sunset"');}
    expect(calendarDataSchema.safeParse({...base,weather:[{...weather[0],wind:{speed:-1}}]}).success).toBe(false);
    expect(render('calendar',base)).not.toContain('weather-point');
  });
  it('uses readable ISO instants with locale clocks, preserves prose, and supports submission overrides without mutating data',()=>{
    expect(regionalDateTime('2026-09-27T14:26:04Z')).not.toContain('T14:26');expect(regionalClock(14*60+26,{numberLocale:'en-US',timeFormat:'12h'})).toMatch(/02:26 PM/);
    expect(regionalClock(14*60+26,{timeFormat:'24h'})).toBe('14:26');expect(regionalDateTime('Yesterday')).toBe('Yesterday');expect(regionalDateTime('00:04.250')).toBe('00:04.250');
    const view=validateView({version:1,template:'inbox',format:{dateFormat:'dmy',timeFormat:'12h',numberLocale:'en-US'},data:{items:[{id:'m',from:'Pinterest',subject:'Hello',timestamp:'2026-09-27T14:26:04Z'}]}}),before=structuredClone(view);
    const html=renderToStaticMarkup(<Renderer view={view} config={{...DEFAULT_CONFIG,timeFormat:'24h'}}/>);expect(html).toContain('27/09/2026');expect(html).toContain('02:26 PM');expect(view).toEqual(before);
    const schema=JSON.stringify(z.toJSONSchema(templateViewSchema('inbox')));expect(schema).toContain('full/raw From headers');
  });
  it('accepts formatting overrides through every public MCP profile',()=>{for(const [profile,name,args] of [['domains','kanvas_publish',{operation:'show'}],['twelve','kanvas_publish',{operation:'show'}],['legacy','kanvas_submit',{}]] as const){const result=resolveToolCall(profile,name,{...args,sessionId:'s',displayIds:['d'],requestId:'r',view:{version:1,template:'inbox',format:{timeFormat:'12h'},data:{items:[]}}});expect(result.error).toBeUndefined();}});
  it('wires every new supplied-data template with validated examples and readable renderers',()=>{
    for(const template of ['sports-lineup','org-chart','flowchart','network'] as const){const view=validateView(samples[template]);expect(templateNames[template]).toBeTruthy();expect(TEMPLATE_DISPLAY_GUIDANCE[template]).toBeTruthy();const html=renderToStaticMarkup(<Renderer view={view}/>);expect(html).toContain('<svg');expect(html).not.toContain('could not be shown');}
    expect(render('sports-lineup',samples['sports-lineup'].data).match(/data-player-id=/g)).toHaveLength(11);
  });
  it('rejects dangling relationships, hierarchy cycles and partial coordinates; lays out cyclic networks deterministically',()=>{
    expect(orgChartDataSchema.safeParse({nodes:[{id:'a',label:'A',parentId:'b'},{id:'b',label:'B',parentId:'a'}]}).success).toBe(false);
    expect(networkDataSchema.safeParse({nodes:[{id:'a',label:'A'}],edges:[{from:'a',to:'missing'}]}).success).toBe(false);
    expect(networkDataSchema.safeParse({nodes:[{id:'a',label:'A',x:.5}]}).success).toBe(false);
    const data=networkDataSchema.parse({layout:'top-down',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],edges:[{from:'a',to:'b'},{from:'b',to:'a'}]});const layout=diagramLayout(data);expect(layout).toEqual(diagramLayout(data));expect(layout.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y))).toBe(true);const phone=diagramLayout(data,false,366);expect(phone.width).toBe(366);expect(phone.nodes.every(n=>n.x-116>=0&&n.x+116<=366)).toBe(true);expect(phone.nodes[0].y).not.toBe(phone.nodes[1].y);const long=networkDataSchema.parse({nodes:[{id:'long',label:'A long supplied label '.repeat(3),detail:'Supplied detail '.repeat(10)}]});expect(diagramLayout(long).nodes[0].height).toBeGreaterThan(128);
  });
});
