import { useMemo } from 'react';
import { parseJsonTree, type JsonNode, type JsonData } from '../../shared/connection-views';
import './connection-views.css';

/** The agent controls expansion and search. Rendering never mutates the source. */
export function JsonExplorer({data}:{data:JsonData}){
  const indexed=useMemo(()=>{
    let count=0;
    const visit=(node:JsonNode,level:number,parent?:number):{node:JsonNode;id:number;level:number;parent?:number}[]=>{
      const id=count++;
      return [{node,id,level,parent},...(node.children??[]).flatMap(c=>visit(c,level+1,id))];
    };
    return visit(parseJsonTree(data.json),0);
  },[data.json]);
  const expanded=new Set(data.expandedPaths??[]),collapsed=new Set(data.collapsedPaths??[]);
  for(const path of data.expandedPaths??[]){let parent=path;while(parent.includes('/')){parent=parent.slice(0,parent.lastIndexOf('/'));expanded.add(parent);}}
  const isOpen=(item:typeof indexed[number])=>!collapsed.has(item.node.path)&&(item.level<(data.expandedDepth??2)||expanded.has(item.node.path));
  const query=(data.query??'').trim().toLocaleLowerCase();
  const matching=query?new Set(indexed.filter(item=>`${item.node.key} ${item.node.value??''}`.toLocaleLowerCase().includes(query)).map(item=>item.id)):null;
  if(matching)for(const item of indexed)if(matching.has(item.id)){
    let parent=item.parent;
    while(parent!==undefined){matching.add(parent);parent=indexed[parent].parent;}
  }
  const visible=indexed.filter(item=>{
    if(matching)return matching.has(item.id);
    let parent=item.parent;
    while(parent!==undefined){if(!isOpen(indexed[parent]))return false;parent=indexed[parent].parent;}
    return true;
  });
  return <section className="json-explorer" aria-label="JSON explorer">
    <div className="json-tree" role="tree" aria-label="JSON structure" data-navigation-scroll>{visible.map(item=>{
      const n=item.node,branch=Boolean(n.children?.length);
      return <div key={item.id} role="treeitem" aria-level={item.level+1} aria-expanded={branch?(matching?true:isOpen(item)):undefined}
        data-json-path={n.path} className={`json-node json-${n.kind}`} style={{paddingInlineStart:`${10+item.level*16}px`}}>
        <span className="json-toggle" aria-hidden="true">{branch?(matching||isOpen(item)?'▾':'▸'):'·'}</span>
        <span className="json-key" title={n.path||'/'}>{n.key}</span><span className="json-separator">:</span>
        <span className="json-value">{n.kind==='object'?`{ ${n.children!.length} keys }`:n.kind==='array'?`[ ${n.children!.length} items ]`:n.raw}</span>
      </div>;
    })}{!visible.length&&<p>No matching keys or values.</p>}</div>
  </section>;
}
