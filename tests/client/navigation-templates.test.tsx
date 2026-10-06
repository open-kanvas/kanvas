import { operationCatalog, discoveryToolDefinitions } from '../../src/server/mcp/discovery';
import { operationId } from '../../src/server/mcp/operations';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe,expect,it } from 'vitest';
import { z } from 'zod';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView,templateViewSchema,provenanceSchema } from '../../src/shared/view-schemas';
import { regionalDate,regionalDateTime,regionalNumber,regionalTemperature } from '../../src/shared/regional';
import { DEFAULT_CONFIG } from '../../src/shared/preferences';
import { TEMPLATE_IDS } from '../../src/shared/types';
import { listToolDefinitions,resolveToolCall } from '../../src/server/mcp/catalog';
import { OPERATION_ENTRIES } from '../../src/server/mcp/operations';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical';

describe('source-preserving templates and regional display',()=>{
  it('renders an ordinary ordered list without checkbox semantics, and an attribute comparison with full URLs and distinct missing/No values',()=>{
    const list=validateView({version:1,template:'list',data:{ordered:true,start:7,items:['Exact one',{text:'Exact two',detail:'Line 1\nLine 2'}]}});
    const html=renderToStaticMarkup(<Renderer view={list}/>);expect(html).toContain('<ol');expect(html).toContain('start="7"');expect(html).toContain('Exact two');expect(html).not.toMatch(/checkbox|aria-checked/);
    const url='https://example.com/full/product/path?size=42&shipping_country=Norway';
    const comparison=validateView({version:1,template:'product',data:{name:'Running shoe',layout:'comparison',attributes:[{key:'price',label:'Exact price'},{key:'sizes',label:'Sizes'},{key:'pickup',label:'Pickup'}],offers:[{vendor:'A',price:'NOK 1,499',sizes:'EU 42 only',attributes:{pickup:false},url},{vendor:'B',price:'EUR 119',attributes:{pickup:null},restrictions:'No shipping to Norway'}]}});
    const matrix=renderToStaticMarkup(<Renderer view={comparison}/>);for(const value of ['NOK 1,499','EUR 119','EU 42 only','Not supplied','>No<','No shipping to Norway','https://example.com/full/product/path?size=42&amp;shipping_country=Norway'])expect(matrix).toContain(value);expect(matrix.match(/class="product-url-row"[\s\S]*?<\/tr>/)?.[0]).not.toContain('…');expect(matrix.indexOf('Exact price')).toBeLessThan(matrix.indexOf('Sizes'));
  });
  it('exposes only iframe in the current catalogue, validates bounded ordinary HTTPS pages, and preserves retained web source without a sample flag',()=>{
    expect(TEMPLATE_IDS).toContain('iframe');expect(TEMPLATE_IDS as readonly string[]).not.toContain('web');
    const schema=templateViewSchema('iframe');for(const pages of [[],Array.from({length:17},()=>({url:'https://example.com/'})),[{url:'javascript:alert(1)'}],[{url:'https://user:pass@example.com/'}],[{url:'https://127.0.0.1/'}]])expect(schema.safeParse({version:1,template:'iframe',data:{pages}}).success).toBe(false);
    const view=validateView({version:1,template:'iframe',data:{pages:[{url:'https://outside-previous-allowlist.example/page',title:'External source'}]}}),html=renderToStaticMarkup(<Renderer view={view}/>);
    expect(html).toContain('<iframe');expect(html).toContain('sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"');expect(html).not.toContain('allow-same-origin');expect(html).toContain('https://outside-previous-allowlist.example/page');expect(html).not.toContain('class="iframe-toolbar"');
    const old={version:1,template:'web',data:{url:'https://example.com/',text:'Original supplied summary'},source:{title:'Retained source',illustrative:true}};
    const retained=validateView(old);expect(retained.source).toEqual({title:'Retained source'});expect(old.source.illustrative).toBe(true);expect(retained.data).toMatchObject(old.data);expect(renderToStaticMarkup(<Renderer view={retained}/>)).not.toContain('Illustrative data');
    expect(provenanceSchema.safeParse({illustrative:true}).success).toBe(false);expect(JSON.stringify(z.toJSONSchema(templateViewSchema('presentation')))).not.toContain('"const":"web"');
  });
  it('formats numeric values and qualified weather while retaining exact string amounts, dates and source units when unknown',()=>{
    expect(regionalNumber(12345.67,{numberLocale:'de-DE'})).toBe('12.345,67');expect(regionalNumber('12345.67000',{numberLocale:'de-DE'})).toBe('12345.67000');
    expect(regionalTemperature('32 °F',{unitSystem:'metric'})).toBe('0 °C');expect(regionalTemperature('20',{unitSystem:'imperial'},'celsius')).toBe('68 °F');expect(regionalTemperature('20°',{unitSystem:'imperial'})).toBe('20°');expect(regionalTemperature('9007199254740993.001',{unitSystem:'source'},'celsius')).toBe('9007199254740993.001');
    expect(regionalDate('2026-09-16',{dateFormat:'dmy'},'Pacific/Honolulu')).toBe('16/09/2026');expect(regionalDate('2026-09-16T00:30:00Z',{dateFormat:'mdy'},'America/New_York')).toBe('09/15/2026');
    expect(regionalDate('09/10/2026',{dateFormat:'dmy'})).toBe('09/10/2026');expect(regionalDateTime('00:04.250',{dateFormat:'iso'})).toBe('00:04.250');expect(regionalDateTime('2026-09-16T00:30:00Z',{dateFormat:'dmy'},'America/New_York')).toMatch(/^15\/09\/2026 · 20:30/);
    const number=validateView({version:1,template:'number',data:{value:12345.67}}),before=structuredClone(number);expect(renderToStaticMarkup(<Renderer view={number} config={{...DEFAULT_CONFIG,numberLocale:'de-DE'}}/>)).toContain('12.345,67');expect(number).toEqual(before);
  });
});
it('exposes each operation’s required inputs and full runtime schema through the two-tool discovery facade',()=>{
  expect(discoveryToolDefinitions()).toHaveLength(2);
  const canonical=canonicalToolDefinitions();
  for(const item of operationCatalog()){
    const detail=item.detail(),definition=canonical.find(x=>operationId(x.name)===item.id)!;
    expect(detail.requiredInputs,item.id).toEqual(definition.inputSchema.required??[]);
    expect((detail.inputSchema as {required?:string[]}).required??[],item.id).toEqual(definition.inputSchema.required??[]);
  }
  expect(resolveToolCall('discovery','kanvas_call',{operationId:'kanvas.help',arguments:{topic:'navigation'}}).error).toBeDefined();
});
