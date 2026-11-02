import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MathWorkspaceRenderer} from '../../src/client/renderers/MathWorkspace';
import {mathWorkspaceSchema,mathExample,expressionLatex} from '../../src/shared/math-workspace';
import {validateView} from '../../src/shared/view-schemas';
describe('supplied mathematical notation',()=>{
 it('typesets integral, matrix and annotated replacement with accessible MathML',()=>{
  const data=mathWorkspaceSchema.parse(mathExample);
  const html=renderToStaticMarkup(<MathWorkspaceRenderer data={data}/>);
  expect(html).toContain('<math');expect(html).toContain('<mtable');expect(html).not.toContain('Unable to typeset');
  data.expressions.integral.terms.denominator.latex='1+x^4';data.expressions.integral.terms.denominator.emphasis='underline';
  expect(expressionLatex(data.expressions.integral)).toContain('\\underline{{1+x^4}}');
  data.expressions.matrix.latex='f(x)=\\begin{cases}x^2 & x>0 \\\\ 0 & x\\leq0\\end{cases}';
  expect(renderToStaticMarkup(<MathWorkspaceRenderer data={data}/>)).not.toContain('Unable to typeset');
 });
 it('rejects ambiguous IDs, dangling terms and excessive source',()=>{
  for(const data of [{...mathExample,order:['integral','integral']},{...mathExample,focus:'missing'},{...mathExample,layout:'single'},{expressions:{a:{latex:'\\term{missing}'}},order:['a']},{expressions:{a:{latex:'x'.repeat(8001)}},order:['a']}])expect(mathWorkspaceSchema.safeParse(data).success).toBe(false);
 });
 it('does not authorize HTML, URLs, external images or unbounded macro expansion',()=>{
  for(const latex of ['\\href{javascript:alert(1)}{x}','\\includegraphics{https://example.com/tracker}','\\htmlClass{evil}{x}','\\def\\a{\\a}\\a']){
   const data=mathWorkspaceSchema.parse({expressions:{a:{latex}},order:['a']});
   const html=renderToStaticMarkup(<MathWorkspaceRenderer data={data}/>);
   expect(html).not.toMatch(/<a |<img |class="evil"/);
  }
 });
 it('validates through ordinary view contract',()=>expect(validateView({version:1,template:'math',data:mathExample}).template).toBe('math'));
});
