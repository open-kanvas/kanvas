import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {templateViewSchema,codeDataSchema} from '../../src/shared/view-schemas';
import {devicePreviewDataSchema,staticPreviewDocument} from '../../src/shared/device-preview';
import {orgChartDataSchema,architectureDataSchema,diagramLayout} from '../../src/shared/diagrams';
import {navigate,initialNavigation,navigationCapabilities} from '../../src/shared/navigation';
import {CodeRenderer} from '../../src/client/renderers/Code';
import type {ViewSpec} from '../../src/shared/types';

describe('spatial feedback contracts',()=>{
 it('validates exact CSS viewports and blocks unsafe HTML; preserves static source',()=>{
  const data=devicePreviewDataSchema.parse({description:'Example',html:'<b>Exact</b>',viewports:['iphone',{name:'Exact target',width:450,height:750}]});
  expect(data.html).toBe('<b>Exact</b>');expect(data.viewports).toHaveLength(2);
  expect(devicePreviewDataSchema.safeParse({...data,html:'<script>alert(1)</script>'}).success).toBe(false);
  expect(devicePreviewDataSchema.safeParse({...data,viewports:[{name:'Too small',width:0,height:750}]}).success).toBe(false);
  expect(staticPreviewDocument(data.html,'x{color:red}</style><script>bad</script>')).not.toContain('</style><script>');
 });
 it('adds compact decorated hierarchy without cycles or insecure image URLs',()=>{
  const data=orgChartDataSchema.parse({nodes:[{id:'a',label:'Lead',icon:'person'},{id:'b',label:'Team',parentId:'a',image:'https://example.com/avatar.png'}]});
  expect(diagramLayout(data,true).nodes.every(n=>n.height<100)).toBe(true);
  expect(orgChartDataSchema.safeParse({nodes:[{id:'a',label:'x',parentId:'a'}]}).success).toBe(false);
  expect(orgChartDataSchema.safeParse({nodes:[{id:'a',label:'x',image:'javascript:bad'}]}).success).toBe(false);
 });
 it('keeps architectural type vocabulary explicit and validates connections',()=>{
  expect(architectureDataSchema.parse({nodes:[{id:'a',label:'API',type:'api'},{id:'b',label:'DB',type:'database'}],edges:[{from:'a',to:'b'}]}).nodes[1].type).toBe('database');
  expect(architectureDataSchema.safeParse({nodes:[{id:'a',label:'DB',type:'unknown'}]}).success).toBe(false);
  expect(architectureDataSchema.safeParse({nodes:[{id:'a',label:'DB',type:'database'}],edges:[{from:'a',to:'missing'}]}).success).toBe(false);
 });
 it('resolves absolute code line bounds and refuses unsupported or missing targets at accept time',()=>{
  const view:ViewSpec={version:1,template:'code',data:{kind:'code',code:'alpha\nbeta\ngamma',startLine:50}};
  expect(navigate(view,initialNavigation(),{action:'gotoLine',line:51}).line).toBe(51);
  expect(()=>navigate(view,initialNavigation(),{action:'gotoLine',line:49})).toThrow('50 and 52');
  expect(()=>navigate(view,initialNavigation(),{action:'focus',text:'missing',zoom:1})).toThrow('not present');
  const opaque:ViewSpec={version:1,template:'device-preview',data:{html:'hi',description:'hi'}};
  expect(navigationCapabilities(opaque).focus).toBe(false);
  expect(()=>navigate(opaque,initialNavigation(),{action:'gotoLine',line:1})).toThrow('does not support');
  expect(navigate({version:1,template:'org-chart',data:{nodes:[{id:'a',label:'a'}]}},{...initialNavigation(),focus:{text:'a',zoom:3}},{action:'fit'}).focus).toBeUndefined();
 });
 it('highlights added/removed code tokens and respects displayed diff line offsets',()=>{
  const markup=renderToStaticMarkup(createElement(CodeRenderer,{data:{kind:'diff',language:'javascript',before:'const value = 1;',after:'const value = 2;',startLine:50}}));
  expect(markup).toContain('hljs-keyword');expect(markup).toContain('diff-add');expect(markup).toContain('diff-remove');expect(markup).toContain('>50<');
 });
 it('terminal retains literal stdout/stderr, is noninteractive and accepts incremental snapshots',()=>{
  const data=codeDataSchema.parse({kind:'terminal',entries:[{id:'run',command:'echo test',stdout:'first\n',stderr:'<script>not executable</script>',status:'running'}]});
  const markup=renderToStaticMarkup(createElement(CodeRenderer,{data}));expect(markup).toContain('Read-only transcript');expect(markup).toContain('&lt;script&gt;');expect(markup).not.toContain('<input');
  expect(templateViewSchema('code').safeParse({version:1,template:'code',data:{...data,entries:[{...data.entries![0],stdout:'first\nsecond\n',status:'success',exitCode:0}]}}).success).toBe(true);
 });
});
