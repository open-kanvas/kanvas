import { z } from 'zod';
import { describe,expect,it } from 'vitest';
import { validateView,templateViewSchema } from '../../src/shared/view-schemas.js';
import { visualHelp } from '../../src/server/visual-help.js';
import { HELP_PAGES } from '../../src/shared/help.js';
import { navigationCapabilities } from '../../src/shared/navigation.js';
import { canonicalArgumentError,parseCanonicalArguments } from '../../src/server/mcp/canonical.js';

describe('composed Markdown and plain-text source boundaries',()=>{
  it('keeps exact source strings in fact/document while exposing a standard Markdown reading contract',()=>{
    const text='# Exact heading\n\n**bold** and `kanvas.board.read`\n\n- [x] Done\n\n|A|B|\n|-|-|\n|1|2|';
    for(const template of ['fact','document','markdown'] as const){
      const view=validateView({version:1,template,data:{text}});
      expect(view.data.text).toBe(text);
    }
    const markdown=validateView({version:1,template:'markdown',data:{text}});
    expect(navigationCapabilities(markdown).reading).toBe(true);
    for(const template of ['fact','document'])expect(JSON.stringify(z.toJSONSchema(templateViewSchema(template as never),{unrepresentable:'any'}))).toMatch(/plain|literal/i);
    expect(()=>validateView({version:1,template:'markdown',data:{text,color:'red'}})).toThrow();
  });
  it('publishes ordinary help as Markdown with inline operation names and accurate text-size/grid guidance',()=>{
    const help=visualHelp({topic:'text-size'});
    expect(help.view.template).toBe('markdown');expect(help.view.data.text).toContain('`kanvas.config.update`');
    expect(validateView(help.view).template).toBe('markdown');
    const text=HELP_PAGES['text-size'].steps.join(' '),split=HELP_PAGES['split-screen'].steps.join(' ');
    expect(text).toMatch(/50.*250/);expect(text).toMatch(/session/i);expect(text).toMatch(/window/i);
    expect(split).toMatch(/rows/);expect(split).toMatch(/columns/);expect(split).toMatch(/16/);expect(split).toMatch(/no further grids/i);
    for(const topic of ['text-size','split-screen','markdown'] as const){const first=visualHelp({topic});for(let page=0;page<first.pageCount;page++)expect(()=>validateView(visualHelp({topic,page}).view)).not.toThrow();}
  });
  it('names retired showSource without accepting it or echoing unrelated private record keys',()=>{
    const view={version:1,template:'fact',data:{text:'Exact source'},showSource:true,'private-field-secret':'private-value-secret'};
    const args={sessionId:'session',displayIds:['display'],requestId:'source-check',view};
    expect(parseCanonicalArguments('kanvas.submit',args)).toBeUndefined();
    const error=canonicalArgumentError('kanvas.submit',args)!;
    expect(error.issues).toEqual(expect.arrayContaining([expect.objectContaining({path:'view.showSource',problem:'Unsupported field.'})]));
    expect(JSON.stringify(error.issues)).not.toMatch(/private-field-secret|private-value-secret|Exact source/);
    expect(error.issues.some(issue=>issue.path.includes('<record-key>'))).toBe(true);
  });
});
