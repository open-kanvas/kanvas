import { z } from 'zod';
const id=z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/);
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const image=z.string().url().refine(v=>/^https:\/\//i.test(v),'Use an HTTPS image URL');
const point=z.number().finite().min(0).max(1);
export const diagramNodeSchema=z.object({id,label:z.string().min(1).max(80),detail:z.string().max(160).optional(),parentId:id.optional(),icon:z.enum(['person','team','engineering','sales','support','service','database','api','queue','cache','external','client','load-balancer']).optional(),image:image.optional(),shape:z.enum(['box','decision','terminal']).default('box'),color:color.optional(),x:point.optional(),y:point.optional()}).strict();
const edge=z.object({from:id,to:id,label:z.string().max(60).optional(),directed:z.boolean().default(true)}).strict();
const graph=z.object({nodes:z.array(diagramNodeSchema).min(1).max(60),edges:z.array(edge).max(120).default([]),layout:z.enum(['top-down','left-right','circular']).default('top-down'),textScale:z.number().min(.5).max(3).optional().describe('Text size multiplier, default 1. Boxes, spacing and edges grow with the text; above 1 the diagram may extend past the screen and scrolls. Use it when labels must be read from a distance.')}).strict();
function validate(data:z.infer<typeof graph>,ctx:z.RefinementCtx,hierarchy=false){
  const ids=new Set<string>();data.nodes.forEach((node,i)=>{if(ids.has(node.id))ctx.addIssue({code:'custom',path:['nodes',i,'id'],message:'Use unique node ids'});ids.add(node.id);if((node.x===undefined)!==(node.y===undefined))ctx.addIssue({code:'custom',path:['nodes',i],message:'Supply both x and y, or neither'});});
  data.edges.forEach((e,i)=>{if(!ids.has(e.from)||!ids.has(e.to))ctx.addIssue({code:'custom',path:['edges',i],message:'Edges reference supplied node ids'});});
  for(const [i,node] of data.nodes.entries()){
    if(node.parentId&&!ids.has(node.parentId))ctx.addIssue({code:'custom',path:['nodes',i,'parentId'],message:'Parent must be a supplied node'});
    if(hierarchy){const seen=new Set([node.id]);let parent=node.parentId;while(parent){if(seen.has(parent)){ctx.addIssue({code:'custom',path:['nodes',i,'parentId'],message:'An org hierarchy cannot contain a cycle'});break;}seen.add(parent);parent=data.nodes.find(n=>n.id===parent)?.parentId;}}
  }
}
export const orgChartDataSchema=graph.extend({layout:z.enum(['top-down','left-right']).default('top-down')}).superRefine((d,c)=>{validate(d,c,true);if(d.edges.length)c.addIssue({code:'custom',path:['edges'],message:'Org charts use parentId; use network for arbitrary relationships'});});
export const flowchartDataSchema=graph.superRefine((d,c)=>validate(d,c));
export const architectureDataSchema=graph.extend({nodes:z.array(diagramNodeSchema.extend({type:z.enum(['service','database','api','queue','cache','external','client','load-balancer'])})).min(1).max(60)}).superRefine((d,c)=>validate(d,c));
export const networkDataSchema=graph.extend({layout:z.enum(['top-down','left-right','circular']).default('circular')}).superRefine((d,c)=>validate(d,c));
export const sportsLineupDataSchema=z.object({sport:z.literal('soccer').default('soccer'),team:z.string().min(1).max(100),formation:z.string().max(40).optional(),players:z.array(z.object({id,name:z.string().min(1).max(60),number:z.number().int().min(0).max(999).optional(),role:z.string().max(40).optional(),x:point,y:point}).strict()).min(1).max(23),bench:z.array(z.string().min(1).max(80)).max(30).optional(),kitColor:color.optional()}).strict().superRefine((d,c)=>{if(new Set(d.players.map(p=>p.id)).size!==d.players.length)c.addIssue({code:'custom',path:['players'],message:'Player ids must be unique'});});
export type DiagramData=z.infer<typeof graph>;
export type SportsLineupData=z.infer<typeof sportsLineupDataSchema>;

/** Wrap all supplied text; no truncation or invented labels. */
export function diagramLines(value:string,width=25){const words=value.split(/\s+/),result:string[]=[];let line='';for(const word of words){if(line.length+word.length+1>width){if(line)result.push(line);line='';}for(let i=0;i<word.length;i+=width){const part=word.slice(i,i+width);if(i+width<word.length)result.push(part);else line+=(line?' ':'')+part;}}if(line)result.push(line);return result;}
export function diagramNodeHeight(node:DiagramData['nodes'][number]){const text=diagramLines(node.label,node.shape==='decision'?18:24).length*20+diagramLines(node.detail??'',node.shape==='decision'?22:29).length*17;return Math.max(60,text*(node.shape==='decision'?1.8:1)+24);}
/** Deterministic supplied-relationship layout. Narrow receivers stack readable
 * nodes vertically and route long/back edges beside them instead of clipping roots. */
export function diagramLayout(data:DiagramData,hierarchy=false,availableWidth=Infinity){
  const edges:DiagramData['edges']=hierarchy?data.nodes.flatMap(n=>n.parentId?[{from:n.parentId,to:n.id,directed:true}]:[]):data.edges;
  const levels=new Map<string,number>(),order:string[]=[];
  const roots=data.nodes.filter(n=>!edges.some(e=>e.to===n.id));
  for(const root of [...roots,...data.nodes]){
    if(levels.has(root.id))continue;levels.set(root.id,0);const queue=[root.id];
    while(queue.length){const id=queue.shift()!;order.push(id);for(const edge of edges.filter(e=>e.from===id)){if(!levels.has(edge.to)){levels.set(edge.to,levels.get(id)!+1);queue.push(edge.to);}}}
  }
  const narrow=availableWidth<600,circular=data.layout==='circular'&&!narrow,horizontal=data.layout==='left-right'&&!narrow;
  const rows=new Map<number,string[]>();for(const node of data.nodes){const level=levels.get(node.id)!;rows.set(level,[...(rows.get(level)??[]),node.id]);}
  const branchSlots=new Map<string,number>(),branchCenters=new Map<string,number>();
  if(hierarchy){
    const children=(id:string)=>data.nodes.filter(n=>n.parentId===id);
    const count=(id:string):number=>{const value=Math.max(1,children(id).reduce((sum,n)=>sum+count(n.id),0));branchSlots.set(id,value);return value;};
    roots.forEach(n=>count(n.id));let offset=0;
    const place=(id:string,start:number)=>{const size=branchSlots.get(id)!;branchCenters.set(id,start+size/2);let childOffset=start;for(const child of children(id)){place(child.id,childOffset);childOffset+=branchSlots.get(child.id)!;}};
    roots.forEach(n=>{place(n.id,offset);offset+=branchSlots.get(n.id)!;});
  }
  const totalSlots=Math.max(1,roots.reduce((sum,n)=>sum+(branchSlots.get(n.id)??0),0));
  const maxRow=Math.max(...[...rows.values()].map(r=>r.length)),maxHeight=Math.max(...data.nodes.map(diagramNodeHeight)),step=maxHeight+40;
  const width=narrow?Math.max(320,availableWidth):circular?Math.max(660,data.nodes.length*70):horizontal?Math.max(660,rows.size*320):Math.max(660,(hierarchy?totalSlots:maxRow)*280);
  const height=narrow?Math.max(400,data.nodes.length*step):circular?Math.max(width,maxHeight*3):horizontal?Math.max(400,(hierarchy?totalSlots:maxRow)*step):Math.max(400,rows.size*step);
  const nodes=data.nodes.map((node,index)=>{
    const row=rows.get(levels.get(node.id)!)!,col=row.indexOf(node.id),angle=index/data.nodes.length*Math.PI*2-Math.PI/2;
    let x=narrow?width/2:circular?width/2+Math.cos(angle)*(width/2-140):horizontal?160+levels.get(node.id)!*320:hierarchy?branchCenters.get(node.id)!*width/totalSlots:(col+.5)*width/row.length;
    let y=narrow?step/2+order.indexOf(node.id)*step:circular?height/2+Math.sin(angle)*(height/2-maxHeight/2-30):horizontal?(hierarchy?branchCenters.get(node.id)!*height/totalSlots:(col+.5)*height/row.length):step/2+levels.get(node.id)!*step;
    if(node.x!==undefined&&node.y!==undefined){x=124+node.x*(width-248);y=maxHeight/2+20+node.y*(height-maxHeight-40);}
    return {...node,x,y,height:diagramNodeHeight(node)};
  });return {width,height,nodes,edges,narrow,step};
}

/** Keep a complete flowchart inside its viewport. Compact natural levels first;
 * if those waste space, wrap the traversal while retaining every labelled edge. */
export function fitFlowchart(data:DiagramData,width:number,height:number){
  const natural=diagramLayout(data,false,Infinity);
  const nodeHeight=(node:DiagramData['nodes'][number])=>Math.max(56,(diagramLines(node.label,node.shape==='decision'?18:24).length*20+diagramLines(node.detail??'',node.shape==='decision'?22:29).length*17)*(node.shape==='decision'?1.8:1)+24);
  const maxHeight=Math.max(...data.nodes.map(nodeHeight)),step=maxHeight+36;
  const ys=[...new Set(natural.nodes.map(n=>n.y))].sort((a,b)=>a-b);
  const compact={...natural,height:ys.length*step,nodes:natural.nodes.map(n=>({...n,height:nodeHeight(n),y:step/2+ys.indexOf(n.y)*step})),step};
  const candidates=[natural,...(data.layout==='top-down'&&!data.nodes.some(n=>n.x!==undefined)?[compact]:[])];
  if(!data.nodes.some(n=>n.x!==undefined)&&data.layout==='top-down'){
    const ordered=[...natural.nodes].sort((a,b)=>a.y-b.y||a.x-b.x);
    for(let columns=1;columns<=data.nodes.length;columns++){
      const rows=Math.ceil(ordered.length/columns),w=columns*280,h=rows*step;
      candidates.push({...natural,width:w,height:h,step,narrow:false,nodes:ordered.map((n,i)=>{const row=Math.floor(i/columns),col=row%2?columns-1-i%columns:i%columns;return {...n,x:140+col*280,y:step/2+row*step,height:nodeHeight(n)};})});
    }
  }
  const scale=(layout:typeof natural)=>Math.min(1,Math.max(1,width)/layout.width,Math.max(1,height)/layout.height);
  // Preserve the requested arrangement unless wrapping materially improves legibility.
  let layout=candidates[0];for(const candidate of candidates.slice(1))if(scale(candidate)>scale(layout)*1.1)layout=candidate;
  return {...layout,scale:scale(layout)};
}
