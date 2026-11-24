import {describe,expect,it} from 'vitest';
import {HELP_PAGES,HELP_TOPICS,helpFor,helpInputSchema,type HelpTopic} from '../../src/shared/help.js';
import {visualHelp} from '../../src/server/visual-help.js';
import {helpCatalog} from '../../src/server/mcp/discovery.js';
import {LocalSearch} from '../../src/server/mcp/local-search.js';

const families={
 navigation:['within-view','history-and-autoplay','sync-and-pins','device-locks'],
 templates:['choosing','stateful-workflows','tables-and-charts','diagrams-and-code','maps-and-media','scores-and-tool-logs'],
} as const;
describe('89769555 semantic help subjects',()=>{
 for(const [family,suffixes] of Object.entries(families)){
  it(family+' exposes distinct subject summaries through the canonical help registry',()=>{
   const ids=suffixes.map(s=>family+'.'+s as HelpTopic), summaries=new Set<string>();
   expect(HELP_PAGES[family as HelpTopic].relatedTopics).toEqual(ids);
   for(const id of ids){
    expect(HELP_TOPICS).toContain(id);
    expect(helpInputSchema.parse({topic:id}).topic).toBe(id);
    const p=HELP_PAGES[id];summaries.add(p.description);
    expect(p.title).not.toMatch(/part \d/i);expect(p.description.length).toBeGreaterThan(40);
    expect(p.steps.join('').length).toBeLessThan(4500);
    expect(p.relatedTopics).toContain(family);
    const entry=helpCatalog().find(x=>x.id==='kanvas.help.'+id);
    expect(entry?.summary).toBe(p.description);
    expect(entry?.detail()).toMatchObject({relatedTopics:['kanvas.help.'+family]});
    expect(entry?.detail()).toMatchObject({content:{steps:p.steps}});
    expect(visualHelp({topic:id}).view.template).toBe('markdown');
    expect(helpFor(id,'https://example.test').published).toBe(false);
   }
   expect(summaries.size).toBe(ids.length);
   expect(helpCatalog().some(x=>new RegExp('^kanvas[.]help[.]'+family+'[.][0-9]+$').test(x.id))).toBe(false);
  });
 }
 it('keeps intentional about aliases explicit and backed by the same prose',()=>{
  expect(HELP_PAGES['what-is-kanvas'].aliasOf).toBe('about');
  expect(HELP_PAGES['what-is-kanvas'].steps).toBe(HELP_PAGES.about.steps);
  expect(HELP_PAGES['what-is-kanvas'].description).toContain('Intentional alias of kanvas.help.about');
  expect(helpFor('what-is-kanvas','https://example.test')).toMatchObject({aliasOf:'about',published:false});
  expect(helpCatalog().find(x=>x.id==='kanvas.help.what-is-kanvas')?.summary).toContain('alias of kanvas.help.about');
  expect(helpCatalog().find(x=>x.id==='kanvas.help.what-is-kanvas')?.detail()).toMatchObject({aliasOf:'kanvas.help.about'});
 });
 it('places important instructions under the matching subject instead of an arbitrary second part',()=>{
  expect(HELP_PAGES['navigation.device-locks'].steps.join(' ')).toContain('device.lock/device.unlock');
  expect(HELP_PAGES['navigation.sync-and-pins'].steps.join(' ')).toContain('Independent is the default');
  expect(HELP_PAGES['navigation.history-and-autoplay'].steps.join(' ')).toContain('autoplay.control');
  expect(HELP_PAGES['navigation.within-view'].steps.join(' ')).toContain('gotoLine');
  expect(HELP_PAGES['templates.tables-and-charts'].steps.join(' ')).toContain('cellStyles');
  expect(HELP_PAGES['templates.diagrams-and-code'].steps.join(' ')).toContain('code kind terminal');
  expect(HELP_PAGES['templates.stateful-workflows'].steps.join(' ')).toContain('relatedOperations');
 });
 it('does not require redundant inspection after a confirmed browser acknowledgement',()=>{
  expect(HELP_PAGES.about.steps.join(' ')).toContain('inspect separately only when paint is unconfirmed');
  expect(HELP_PAGES['policy-links'].steps.join(' ')).toContain('no separate paint check is needed');
 });
});

it('ranks subject-specific guidance first for authored search probes',()=>{
 const index=new LocalSearch(helpCatalog());
 const probes=[
  ['scroll search focus zoom','navigation.within-view'],
  ['history autoplay','navigation.history-and-autoplay'],
  ['shared presenter pins','navigation.sync-and-pins'],
  ['device privacy locks','navigation.device-locks'],
  ['stateful workflows','templates.stateful-workflows'],
  ['table cellStyles chart emphasis','templates.tables-and-charts'],
  ['diagrams code','templates.diagrams-and-code'],
  ['maps media','templates.maps-and-media'],
  ['scores tool logs','templates.scores-and-tool-logs'],
 ];
 for(const [query,topic] of probes)expect(index.search(query)[0]?.document.id,query).toBe('kanvas.help.'+topic);
});
