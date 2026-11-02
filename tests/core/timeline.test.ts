import {describe,it,expect} from 'vitest';
import {timelineScale,timelineDate} from '../../src/shared/timeline';
import {extendedSchemas} from '../../src/shared/extended-templates';
describe('timeline temporal semantics',()=>{
 it('sorts stably, shares identical dates, and includes duration endpoints',()=>{
 const d=extendedSchemas.timeline.parse({events:[{id:'b',title:'B',start:'2026-01-02',end:'2026-01-11'},{id:'a',title:'A',start:'2026-01-01'},{id:'c',title:'C',start:'2026-01-02'}]});
 const s=timelineScale(d.events);expect(s.events.map(e=>e.id)).toEqual(['a','b','c']);expect(s.position('2026-01-02')).toBe(.1);expect(s.position('2026-01-11')).toBe(1);
 });
 it('handles one instant and short UTC times',()=>{const s=timelineScale([{id:'a',title:'A',start:'2026-01-01'}]);expect(s.position('2026-01-01')).toBe(.5);expect(timelineDate('2026-01-01T12:30:01Z',1000)).toBe('12:30:01.000 UTC');});
 it('rejects reversed duration and unsafe images',()=>{expect(extendedSchemas.timeline.safeParse({events:[{id:'a',title:'A',start:'2026-01-02',end:'2026-01-01'}]}).success).toBe(false);expect(extendedSchemas.timeline.safeParse({events:[{id:'a',title:'A',start:'2026-01-01',image:{url:'javascript:alert(1)',alt:'bad'}}]}).success).toBe(false);});
});
