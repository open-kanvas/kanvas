import katex from 'katex';
import 'katex/dist/katex.min.css';
import {expressionLatex,type MathWorkspace} from '../../shared/math-workspace';
import './math-workspace.css';
export function MathWorkspaceRenderer({data}:{data:MathWorkspace}) {
 if(import.meta.env.VITE_KANVAS_MATH_ENABLED==='false')return <p role="status">Mathematical notation is disabled on this installation.</p>;
 return <div className={'math-workspace math-'+data.layout} aria-label="Mathematical notation">{data.order.map(id=>{
 const expression=data.expressions[id];let html:string;
 try{html=katex.renderToString(expressionLatex(expression),{displayMode:expression.display,throwOnError:true,trust:false,strict:'error',maxExpand:200,maxSize:20,output:'htmlAndMathml'});}catch{return <figure key={id} data-expression-id={id} role="status"><figcaption>{expression.label??id}</figcaption><p>Unable to typeset this expression. Check the supplied LaTeX.</p><code>{expression.latex}</code></figure>;}
 return <figure key={id} data-expression-id={id} data-focused={data.focus===id} aria-label={expression.label??id}>{expression.label&&<figcaption>{expression.label}</figcaption>}<div dangerouslySetInnerHTML={{__html:html}}/></figure>;
 })}</div>;
}
