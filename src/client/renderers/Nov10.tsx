import {useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {jsonPathLine,prettyJson,type JsonData} from '../../shared/connection-views';
import {TOOL_CALL_LINES,type AgentsData,type ToolCallDetailsData,type WelcomeData} from '../../shared/nov10-templates';
import {projectTasks,statusColor,type TaskListData} from '../../shared/task-list';
import {contrastMatrix,harmonies,hexToOklch,namedColours,optionSwatches,readableOn,resolveColour,roleSteps,seedTheme,shadeGrid,variations,type ColourData,type Swatch} from '../../shared/colour';
import {fontCssName,fontDisplayName,fontUrl,fontVariableRange,iconId,iconSetTitle,iconUrl,iconVariants,FONT_FAMILIES,type FontPickerData,type FontRef,type IconPickerData,type IconRef} from '../../shared/pickers';
import {HUMAN_INVITATION} from '../../shared/philosophy';
import {highlightLine} from './Code';
import {JsonExplorer} from './JsonExplorer';
import {FormattedTime} from './Regional';
import './nov10.css';

/** Pretty-printed JSON text: indentation, syntax colours and line numbers.
 * Tokens are the source tokens; only whitespace differs. */
export function JsonRaw({source,highlightPath,maxLines,label}:{source:string;highlightPath?:string;maxLines?:number;label?:string}){
 const pretty=useMemo(()=>{try{return prettyJson(source);}catch{return source;}},[source]);
 const lines=useMemo(()=>pretty.split('\n'),[pretty]),marked=highlightPath?jsonPathLine(pretty,highlightPath):undefined;
 const shown=maxLines&&lines.length>maxLines?lines.slice(0,maxLines):lines;
 return <div className="json-raw" data-navigation-scroll tabIndex={0} role="region" aria-label={label??'JSON text'} data-json-view="raw" data-json-lines={lines.length}>
  <ol>{shown.map((line,index)=><li key={index} className={marked===index+1?'is-marked':undefined} data-json-line={index+1}><code>{highlightLine(line,'json')}</code></li>)}</ol>
  {shown.length<lines.length&&<p className="json-raw-more">{lines.length-shown.length} more lines stored. Ask for the full result to expand it.</p>}
 </div>;
}
export function JsonView({data}:{data:JsonData}){
 return (data.view??'raw')==='tree'?<JsonExplorer data={data}/>:<JsonRaw source={data.json}/>;
}

const duration=(ms:number)=>ms<1000?`${ms} ms`:ms<60_000?`${(ms/1000).toFixed(ms<10_000?2:1)} s`:`${Math.floor(ms/60_000)} min ${Math.round(ms%60_000/1000)} s`;
export function ToolCallDetails({data}:{data:ToolCallDetailsData}){
 const limit=data.expanded?undefined:TOOL_CALL_LINES,tree=data.view==='tree';
 const pane=(title:string,which:'request'|'response',content:ReactNode)=><section className="tool-call-pane" data-pane={which} aria-label={title}><h3>{title}{data.highlight?.pane===which&&data.highlight.note&&<small className="tool-call-note">{data.highlight.note}</small>}</h3>{content}</section>;
 const json=(source:string,which:'request'|'response')=>tree?<JsonExplorer data={{json:source,expandedDepth:3}}/>:<JsonRaw source={source} maxLines={limit} highlightPath={data.highlight?.pane===which?data.highlight.path:undefined} label={`${which} JSON`}/>;
 const text=data.responseText,textLines=text?.split('\n')??[];
 return <div className={`tool-call-details status-${data.status}`}>
  <header className="tool-call-header"><div><h2>{data.tool}</h2>{data.integration&&<span className="tool-call-integration">{data.integration}</span>}</div>
   <dl><div><dt>Status</dt><dd className="tool-call-status">{data.status==='success'?'Success':data.status==='error'?'Error':'Running'}</dd></div>{data.durationMs!==undefined&&<div><dt>Duration</dt><dd>{duration(data.durationMs)}</dd></div>}{data.timestamp&&<div><dt>Time</dt><dd><FormattedTime value={data.timestamp}/></dd></div>}</dl></header>
  {data.error&&<p className="tool-call-error" role="alert">{data.error.code&&<strong>{data.error.code}</strong>}<span>{data.error.message}</span></p>}
  <div className="tool-call-panes">
   {pane('Request','request',json(data.request,'request'))}
   {pane('Response','response',data.response?json(data.response,'response'):text!==undefined?<div className="json-raw tool-call-text" data-navigation-scroll tabIndex={0}><pre>{limit&&textLines.length>limit?textLines.slice(0,limit).join('\n'):text}</pre>{limit&&textLines.length>limit&&<p className="json-raw-more">{textLines.length-limit} more lines stored.</p>}</div>:<p className="tool-call-empty">{data.status==='running'?'Waiting for the response…':'No response content.'}</p>)}
  </div>
 </div>;
}

const DETAIL_SHOWN=1400;
export function TaskList({data}:{data:TaskListData}){
 const projected=useMemo(()=>projectTasks(data.items,{sort:data.sort,filter:data.filter}),[data.items,data.sort,data.filter]);
 const body=useRef<HTMLTableSectionElement>(null),positions=useRef(new Map<string,number>()),lastHighlight=useRef<string|undefined>(undefined);
 // A ticked item visibly travels to its new place instead of vanishing.
 useLayoutEffect(()=>{const root=body.current;if(!root)return;const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,next=new Map<string,number>();
  for(const row of root.querySelectorAll<HTMLElement>('tr[data-task-id]')){const key=row.dataset.taskId!,top=row.offsetTop;next.set(key,top);const before=positions.current.get(key);
   if(!reduced&&before!==undefined&&Math.abs(before-top)>1&&typeof row.animate==='function')row.animate([{transform:`translateY(${before-top}px)`},{transform:'none'}],{duration:Math.min(900,350+Math.abs(before-top)/2),easing:'cubic-bezier(.2,.7,.2,1)'});}
  positions.current=next;
 },[projected]);
 useEffect(()=>{if(data.highlight===lastHighlight.current)return;lastHighlight.current=data.highlight;if(!data.highlight)return;
  body.current?.querySelector<HTMLElement>(`tr[data-task-id="${CSS.escape(data.highlight)}"]`)?.scrollIntoView({block:'center',behavior:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 },[data.highlight]);
 const open=data.items.filter(item=>!item.checked).length,done=data.items.length-open,columns=data.columns??[];
 const anyStatus=data.items.some(item=>item.status),anyTags=data.items.some(item=>item.tags?.length);
 return <div className="task-list" data-task-list={data.taskListId}>
  <p className="task-list-counts"><span><b>{open}</b> open</span><span><b>{done}</b> done</span>{projected.hidden>0&&<span className="task-list-hidden">{projected.hidden} hidden by filter</span>}</p>
  <div className="task-list-scroll" data-navigation-scroll tabIndex={0}><table><thead><tr><th className="task-number" scope="col">#</th><th scope="col" className="task-check" aria-label="Done"/><th scope="col">Item</th>{anyStatus&&<th scope="col">Status</th>}{anyTags&&<th scope="col">Tags</th>}{columns.map(column=><th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
   <tbody ref={body}>{projected.items.map(item=>{const current=item.id===data.highlight,colour=statusColor(data.statusPalette,item.status,data.statusColors);
    return <tr key={item.id??item.number} data-task-id={item.id} data-task-number={item.number} className={`${item.checked?'is-done':''}${current?' is-current':''}`.trim()} aria-current={current?'true':undefined}>
     <td className="task-number">{item.number}</td>
     <td className="task-check"><span className="task-box" role="img" aria-label={item.checked?'Done':'Open'}>{item.checked?'✓':''}</span></td>
     <td className="task-item"><strong>{item.title}</strong>{item.summary&&<p className="task-summary">{item.summary}</p>}
      {current&&item.detail&&<div className="task-detail">{item.detail.length>DETAIL_SHOWN?`${item.detail.slice(0,DETAIL_SHOWN)}…`:item.detail}{item.detail.length>DETAIL_SHOWN&&<small>The rest is stored with the item.</small>}</div>}
      {current&&item.source&&<p className="task-source">{item.source}</p>}</td>
     {anyStatus&&<td className="task-status">{item.status&&<span className="task-pill" style={colour?{'--pill':colour} as CSSProperties:undefined}>{item.status}</span>}</td>}
     {anyTags&&<td className="task-tags">{(item.tags??[]).map(tag=><span key={tag} className="task-tag">{tag}</span>)}</td>}
     {columns.map(column=><td key={column.key} className="task-field">{item.fields?.[column.key]??''}</td>)}
    </tr>;})}</tbody></table></div>
 </div>;
}

function Chip({swatch,selected,large,children}:{swatch:Swatch;selected?:boolean;large?:boolean;children?:ReactNode}){
 const ink=readableOn(swatch.hex);
 return <div className={`colour-chip${large?' is-large':''}${selected?' is-selected':''}${swatch.original?' is-original':''}`} style={{background:swatch.hex,color:ink}} data-colour={swatch.hex} data-colour-label={swatch.label}><b>{swatch.label}</b>{swatch.name&&<span>{swatch.name}</span>}<code>{swatch.hex}</code>{swatch.role&&<small>{swatch.role}</small>}{children}</div>;
}
export function Colour({data}:{data:ColourData}){
 const chosen=new Set((data.selected??[]).map(label=>label.toLowerCase())),picked=(label:string)=>chosen.has(label.toLowerCase());
 let content:ReactNode;
 switch(data.mode){
  case 'options':{const swatches=optionSwatches(data);content=<div className="colour-options" style={{'--count':swatches.length} as CSSProperties}>{swatches.map(s=><Chip key={s.label} swatch={s} large selected={picked(s.label)}><span className="colour-preview" aria-hidden="true"><i className="colour-preview-bar" style={{background:s.hex}}/><em style={{color:s.hex}}>Heading</em><u style={{background:s.hex,color:readableOn(s.hex)}}>Button</u></span></Chip>)}</div>;break;}
  case 'variations':content=<div className="colour-options" style={{'--count':7} as CSSProperties}>{variations(resolveColour(data.base!)!).map(s=><Chip key={s.label} swatch={s} large selected={picked(s.label)}/>)}</div>;break;
  case 'shades':{const grid=shadeGrid(data);content=<div className={`colour-shades cells-${grid.cellLabels}`} data-cell-labels={grid.cellLabels} style={{'--columns':grid.columns.length,'--rows':grid.rows.length,'--chars':grid.chars,'--shade-chars':grid.shadeChars} as CSSProperties} role="table" aria-label={grid.title}>
   <div className="colour-shade-head" role="row"><span/>{grid.columns.map(column=><b key={column} role="columnheader">{column}</b>)}</div>
   {grid.rows.map(row=><div key={row.name} className="colour-shade-row" role="row"><b role="rowheader">{row.name}</b>{row.cells.map(cell=><i key={cell.label} role="cell" className={picked(cell.label)?'is-selected':undefined} style={{background:cell.hex,color:readableOn(cell.hex)}} data-colour={cell.hex} data-colour-label={cell.label} aria-label={`${cell.label} ${cell.hex}`} title={`${cell.label} ${cell.hex}`}>{grid.cellLabels!=='none'&&<b>{cell.shade}</b>}{grid.cellLabels==='hex'&&<code>{cell.hex}</code>}</i>)}</div>)}</div>;break;}
  case 'named':{const names=namedColours(data.group!);content=<div className="colour-named" style={{'--count':names.length} as CSSProperties}>{names.map(c=><Chip key={c.name} swatch={{label:c.name,hex:c.hex}} selected={picked(c.name)}/>)}</div>;break;}
  case 'harmony':{const base=resolveColour(data.base!)!,groups=harmonies(base),hue=hexToOklch(base).h;content=<div className="colour-harmony"><div className="colour-wheel" aria-label={`Hue wheel, base at ${Math.round(hue)} degrees`} role="img"><i style={{transform:`rotate(${hue}deg)`}}><b style={{background:base}}/></i></div>
   <div className="colour-harmony-groups">{groups.map(group=><section key={group.name}><h3>{group.name}</h3><div>{group.swatches.map(s=><Chip key={s.label} swatch={s} selected={picked(s.label)}/>)}</div></section>)}</div></div>;break;}
  case 'contrast':{const matrix=contrastMatrix(data);content=<div className="colour-contrast" style={{'--columns':matrix.texts.length} as CSSProperties} role="table" aria-label="Contrast matrix">
   <div role="row" className="colour-contrast-head"><span/>{matrix.texts.map(t=><b key={t.label} role="columnheader"><i style={{background:t.hex}}/>{t.label} <code>{t.hex}</code></b>)}</div>
   {matrix.cells.map((row,index)=><div role="row" key={index}><b role="rowheader"><i style={{background:matrix.backgrounds[index].hex}}/>{matrix.backgrounds[index].label} <code>{matrix.backgrounds[index].hex}</code></b>{row.map(cell=><div role="cell" key={cell.label} className={`colour-contrast-cell grade-${cell.grade.replace(' ','-').toLowerCase()}${picked(cell.label)?' is-selected':''}`} style={{background:cell.background,color:cell.text}} data-contrast={cell.ratio} data-colour-label={cell.label}><span>{data.sample??'Sample text'}</span><small><b>{cell.label}</b> {cell.ratio.toFixed(2)}:1 <em>{cell.grade}</em></small></div>)}</div>)}</div>;break;}
  case 'roles':{const steps=roleSteps(data),at=(n:number)=>steps[n-1].hex;content=<div className="colour-roles"><div className="colour-role-steps">{steps.map(s=><Chip key={s.label} swatch={s} selected={picked(s.label)}/>)}</div>
   <div className="colour-mini" aria-label="Mini interface built from these steps" role="img" style={{background:at(1),color:at(12),borderColor:at(6)}}><div style={{background:at(2),borderColor:at(6)}}><strong>Card title</strong><p style={{color:at(11)}}>Secondary text uses step 11.</p><span style={{background:at(3),borderColor:at(7)}}>Element</span><span style={{background:at(5),borderColor:at(8)}}>Selected</span><u style={{background:at(9),color:readableOn(at(9))}}>Solid action</u></div></div></div>;break;}
  case 'theme':{const theme=seedTheme(resolveColour(data.seed!)!),card=(name:string,scheme:typeof theme.light)=><div className="colour-scheme" style={{background:scheme.background,color:scheme.text,borderColor:scheme.outline}}><small>{name}</small><div style={{background:scheme.surface}}><strong>Title</strong><p>Body text on surface</p><u style={{background:scheme.primary,color:scheme.onPrimary}}>Primary</u><i style={{background:scheme.secondary}}/><i style={{background:scheme.tertiary}}/><i style={{background:scheme.error}}/></div></div>;
   content=<div className="colour-theme"><div className="colour-shades" style={{'--columns':12,'--rows':5} as CSSProperties} role="table" aria-label="Tonal palettes"><div className="colour-shade-head" role="row"><span/>{theme.palettes.primary.map(t=><b key={t.label} role="columnheader">{t.label}</b>)}</div>{Object.entries(theme.palettes).map(([name,tones])=><div key={name} className="colour-shade-row" role="row"><b role="rowheader">{name}</b>{tones.map(t=><i key={t.label} role="cell" style={{background:t.hex}} data-colour={t.hex} data-colour-label={`${name} ${t.label}`} title={`${name} ${t.label} ${t.hex}`}/>)}</div>)}</div><div className="colour-schemes">{card('Light',theme.light)}{card('Dark',theme.dark)}</div></div>;break;}
 }
 return <div className={`colour-view colour-mode-${data.mode}`} data-colour-mode={data.mode}>{content}</div>;
}

const iconStyle=(icon:IconRef):CSSProperties=>({WebkitMaskImage:`url(${iconUrl(icon)})`,maskImage:`url(${iconUrl(icon)})`});
function IconGlyph({icon,size}:{icon:IconRef;size?:string}){return <i className="picker-icon" role="img" aria-label={`${iconSetTitle(icon)} ${icon.name}`} style={{...iconStyle(icon),...(size?{width:size,height:size}:{})}}/>;}
export function IconPicker({data}:{data:IconPickerData}){
 // A core set has style variants; a catalogue icon is one drawing, so it is shown as it is.
 const styles=data.mode==='variants'?iconVariants(data.icons[0]):[];
 const variants:IconRef[]=styles.length?styles.map(variant=>({...data.icons[0],variant})):data.mode==='variants'?[data.icons[0]]:data.icons;
 return <div className={`picker icon-picker mode-${data.mode}`} data-picker-mode={data.mode}>{data.concept&&<p className="picker-concept">{data.concept}</p>}
  <ol className="picker-grid" style={{'--count':variants.length} as CSSProperties}>{variants.map((icon,index)=><li key={index} className={data.selected===index+1?'is-selected':undefined} data-icon-id={iconId(icon)}>
   <b className="picker-number">{index+1}</b>
   {data.mode==='context'?<div className="picker-context"><span className="picker-button"><IconGlyph icon={icon} size="1.1em"/>Button</span><span className="picker-menu"><IconGlyph icon={icon} size="1em"/>Menu item</span><span className="picker-list"><IconGlyph icon={icon} size="1.6em"/>List row</span></div>:<IconGlyph icon={icon}/>}
   <code className="picker-label">{iconId(icon)}</code>{data.mode==='sets'&&<small>{iconSetTitle(icon)}</small>}{data.mode==='variants'&&icon.variant&&<small>{icon.variant}</small>}</li>)}</ol>
 </div>;
}
const face=(font:FontRef):CSSProperties=>({fontFamily:`"${fontCssName(font.family)}", system-ui, sans-serif`,fontWeight:font.weight});
const fontLabel=(font:FontRef)=>`${fontDisplayName(font.family)} ${font.weight}`;
export function FontPicker({data}:{data:FontPickerData}){
 const family=data.fonts[0].family;
 const weights=data.mode==='weights'?(Object.hasOwn(FONT_FAMILIES,family)?[...FONT_FAMILIES[family].weights]:[400,700]).map(weight=>({family,weight})):[];
 const pairings=data.mode==='pairings'?Array.from({length:Math.floor(data.fonts.length/2)},(_,i)=>({heading:data.fonts[i*2],body:data.fonts[i*2+1]})):[];
 const used=[...data.fonts,...weights];
 // Same-origin font files only; names are validated ids, never free text.
 // A variable family is one file for its whole weight range; a static family is one file per weight.
 const css=[...new Map(used.map(font=>[fontVariableRange(font.family)?font.family:`${font.family}:${font.weight}`,font])).values()].map(font=>{const range=fontVariableRange(font.family);return `@font-face{font-family:"${fontCssName(font.family)}";font-weight:${range?`${range[0]} ${range[1]}`:font.weight};font-style:normal;font-display:swap;src:url(${fontUrl(font.family,font.weight)}) format("woff2")}`;}).join('');
 const rows=data.mode==='weights'?weights:data.fonts,body='Kanvas is your agent’s screen. The detail is already visible, so your words get shorter.';
 return <div className={`picker font-picker mode-${data.mode}`} data-picker-mode={data.mode}><style>{css}</style>
  {data.mode==='pairings'?<ol className="picker-grid font-pairings" style={{'--count':pairings.length} as CSSProperties}>{pairings.map((pair,index)=><li key={index} className={data.selected===index+1?'is-selected':undefined}><b className="picker-number">{index+1}</b><h3 style={face(pair.heading)}>{data.text}</h3><p style={face(pair.body)}>{body}</p><code className="picker-label">{`${fontLabel(pair.heading)} + ${fontLabel(pair.body)}`}</code></li>)}</ol>
  :<ol className="font-samples" style={{'--count':rows.length} as CSSProperties}>{rows.map((font,index)=><li key={index} className={data.selected===index+1?'is-selected':undefined} data-font-family={font.family} data-font-weight={font.weight}><b className="picker-number">{index+1}</b>
   {data.mode==='context'?<div className="font-context"><h3 style={face(font)}>{data.text}</h3><p style={face({...font,weight:400})}>{body}</p><span className="picker-button" style={face(font)}>Button</span></div>:<p className="font-sample" style={face(font)}>{data.text}</p>}
   <code className="picker-label">{fontLabel(font)}</code></li>)}</ol>}
 </div>;
}

const ago=(iso:string|undefined,now:number)=>{if(!iso)return 'never';const seconds=Math.max(0,Math.round((now-Date.parse(iso))/1000));return seconds<90?'just now':seconds<3600?`${Math.round(seconds/60)} min ago`:seconds<86_400?`${Math.round(seconds/3600)} h ago`:`${Math.round(seconds/86_400)} d ago`;};
export function Agents({data,serverNow}:{data:AgentsData;serverNow?:string}){
 const now=serverNow?Date.parse(serverNow):Date.now();
 return <div className="agents-view work-scroll" data-navigation-scroll tabIndex={0}>{!data.agents.length&&<p>No agents have connected to this account yet.</p>}
  <ul className="agents-list">{data.agents.map(agent=><li key={agent.id} className={`${agent.connectedNow?'is-active':''}${agent.revoked?' is-revoked':''}`.trim()} data-agent-id={agent.id}>
   <i className="agents-dot" role="img" aria-label={agent.revoked?'Access revoked':agent.connectedNow?'Active now':'Not active'}/>
   <div className="agents-name"><strong>{agent.name}</strong>{agent.model&&<span>{agent.model}</span>}</div>
   <div className="agents-seen">{agent.revoked?'Revoked':agent.connectedNow?'Active now':ago(agent.lastSeenAt,now)}</div>
   <div className="agents-sessions"><b>{agent.sessionCount}</b> {agent.sessionCount===1?'session':'sessions'}{agent.lastSession&&<span>{agent.lastSession}</span>}</div>
  </li>)}</ul></div>;
}
export function Welcome({data}:{data:Partial<WelcomeData>}){
 const line=data.line??HUMAN_INVITATION.line,examples=data.examples??HUMAN_INVITATION.examples;
 return <div className="welcome-view"><h2>{line}</h2><p className="welcome-try">Try saying</p><ul>{examples.map((example,index)=><li key={index}>“{example}”</li>)}</ul></div>;
}

/** Theme tokens for agent-authored HTML. The sandboxed frame cannot read the
 * page around it, so the current theme is copied in as CSS custom properties:
 * custom visuals follow the person's theme, light or dark, and accent. Only
 * plain colour and font values pass; nothing here can carry markup. */
const TOKEN_SOURCE:Record<string,string>={'--kanvas-bg':'--surface','--kanvas-fg':'--text','--kanvas-muted':'--muted','--kanvas-accent':'--accent','--kanvas-line':'--line','--kanvas-panel':'--panel'};
const safeColour=(value:string)=>/^[#a-zA-Z0-9(),.%\s/-]{1,80}$/.test(value)?value:undefined;
const safeFont=(value:string)=>/^[a-zA-Z0-9 ,"'_-]{1,300}$/.test(value)?value.replace(/"/g,"'"):undefined;
export function themeTokenCss(element:Element|null):string{
 if(!element||typeof getComputedStyle!=='function')return ':root{--kanvas-bg:#151515;--kanvas-fg:#fafafa;--kanvas-muted:#9a9a9a;--kanvas-accent:#dbdbdb;--kanvas-line:#3d3d3d;--kanvas-panel:#222222;--kanvas-font:system-ui,sans-serif}';
 const style=getComputedStyle(element),fallback:Record<string,string>={'--kanvas-bg':'#151515','--kanvas-fg':'#fafafa','--kanvas-muted':'#9a9a9a','--kanvas-accent':'#dbdbdb','--kanvas-line':'#3d3d3d','--kanvas-panel':'#222222'};
 const tokens=Object.entries(TOKEN_SOURCE).map(([token,source])=>`${token}:${safeColour(style.getPropertyValue(source).trim())??fallback[token]}`);
 tokens.push(`--kanvas-font:${safeFont(style.fontFamily)??'system-ui,sans-serif'}`);
 const dark=Boolean(element.closest('.theme-dark'))||!element.closest('.theme-light');
 return `:root{${tokens.join(';')};color-scheme:${dark?'dark':'light'}}`;
}
export function CustomHtml({html,css,description,onReady}:{html:string;css?:string;description?:string;onReady?:()=>void}){
 const host=useRef<HTMLDivElement>(null),[tokens,setTokens]=useState(()=>themeTokenCss(null));
 useLayoutEffect(()=>{const element=host.current;if(!element)return;const read=()=>setTokens(themeTokenCss(element));read();
  const shell=element.closest('.viewer-shell,.public-session,.render-surface')??element;
  const observer=new MutationObserver(read);observer.observe(shell,{attributes:true,attributeFilter:['class','style']});return()=>observer.disconnect();
 },[]);
 const cleaned=(css??'').replace(/<\/style/gi,''),themed=/var\(\s*--kanvas-/.test(cleaned)||/var\(\s*--kanvas-/.test(html);
 // Views written before the tokens existed keep their fixed dark page; a view that uses a token follows the theme.
 const base=themed?'html,body{margin:0;min-height:100%;font-family:var(--kanvas-font);background:var(--kanvas-bg);color:var(--kanvas-fg)}':'html,body{margin:0;min-height:100%;font-family:system-ui;background:#151515;color:#fafafa}';
 const doc=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${tokens}${base}*{box-sizing:border-box}${cleaned}</style></head><body>${html}</body></html>`;
 return <div ref={host} className="custom-visual-host" data-themed={themed||undefined}><iframe className="custom-visual" title={description} sandbox="" referrerPolicy="no-referrer" srcDoc={doc} onLoad={onReady}/></div>;
}
