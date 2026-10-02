import { useNavigation } from './Navigation';
import './terminal.css';
import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import hljs from 'highlight.js/lib/common';
import { Icon } from '../icons';

export interface CodeData {
  kind: 'code' | 'diff' | 'tree' | 'tools' | 'terminal'; path?: string; language?: string; code?: string; before?: string; after?: string;
  files?: { path: string; kind: 'file' | 'directory'; status?: string }[];
  tools?: { id: string; name: string; status: 'pending' | 'running' | 'success' | 'error'; summary?: string }[];
  entries?:{id:string;command:string;stdout?:string;stderr?:string;status?:'pending'|'running'|'success'|'error';exitCode?:number;timestamp?:string;cwd?:string}[];
  highlightLines?: number[]; startLine?: number;
}
interface DiffLine { type: 'same' | 'add' | 'remove'; text: string; old?: number; next?: number }
/** Bounded exact LCS; large replacement blocks remain explicitly removed/added rather than guessed. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before ? before.split('\n') : [], b = after ? after.split('\n') : [];
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const aa = a.slice(prefix, a.length - suffix), bb = b.slice(prefix, b.length - suffix), result: DiffLine[] = [];
  let old = 1, next = 1;
  for (let i = 0; i < prefix; i++) result.push({ type: 'same', text: a[i], old: old++, next: next++ });
  if (aa.length * bb.length <= 250000) {
    const table = Array.from({ length: aa.length + 1 }, () => new Uint16Array(bb.length + 1));
    for (let i = aa.length - 1; i >= 0; i--) for (let j = bb.length - 1; j >= 0; j--) table[i][j] = aa[i] === bb[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    let i = 0, j = 0;
    while (i < aa.length || j < bb.length) {
      if (i < aa.length && j < bb.length && aa[i] === bb[j]) result.push({ type: 'same', text: aa[i++], old: old++, next: next++ }), j++;
      else if (i < aa.length && (j === bb.length || table[i + 1][j] >= table[i][j + 1])) result.push({ type: 'remove', text: aa[i++], old: old++ });
      else result.push({ type: 'add', text: bb[j++], next: next++ });
    }
  } else {
    for (const text of aa) result.push({ type: 'remove', text, old: old++ });
    for (const text of bb) result.push({ type: 'add', text, next: next++ });
  }
  for (let i = a.length - suffix; i < a.length; i++) result.push({ type: 'same', text: a[i], old: old++, next: next++ });
  return result;
}
const unescape = (value: string) => value.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" })[entity] ?? '');
export function highlightLine(line: string, language?: string): ReactNode {
  if (!line) return '\u00a0';
  if (!language || !hljs.getLanguage(language)) return line;
  // Consume only highlight.js span tokens. Never insert generated markup into the DOM.
  const value = hljs.highlight(line, { language, ignoreIllegals: true }).value;
  const root: { className?: string; children: (string | { className?: string; children: unknown[] })[] } = { children: [] };
  const stack = [root];
  for (const token of value.match(/<span class="[a-zA-Z0-9_ -]+">|<\/span>|[^<]+|</g) ?? []) {
    const open = /^<span class="([a-zA-Z0-9_ -]+)">$/.exec(token);
    if (open) { const node = { className: open[1], children: [] as typeof root.children }; stack.at(-1)!.children.push(node); stack.push(node); }
    else if (token === '</span>') { if (stack.length > 1) stack.pop(); }
    else stack.at(-1)!.children.push(unescape(token));
  }
  const render = (node: unknown, index: number): ReactNode => typeof node === 'string' ? node : <span key={index} className={(node as typeof root).className}>{(node as typeof root).children.map(render)}</span>;
  return root.children.map(render);
}

export function CodeRenderer({ data, showControls = false }: { data: CodeData; showControls?: boolean }) {
  const navigation=useNavigation();
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(0);
  const [changesOnly, setChangesOnly] = useState(false);
  const diff = useMemo(() => data.kind === 'diff' ? lineDiff(data.before ?? '', data.after ?? '') : [], [data.kind, data.before, data.after]);
  const source = data.code ?? '', lines = source.split('\n'), limit = 150, currentPage = Math.min(page, Math.max(0, Math.ceil(lines.length / limit) - 1));
  const targetLine=navigation?.state.line??(navigation?.state.focus?.text?lines.findIndex(line=>line.toLocaleLowerCase().includes(navigation.state.focus!.text!.toLocaleLowerCase()))+(data.startLine??1):undefined);
  useEffect(()=>{if(targetLine!==undefined&&targetLine>=(data.startLine??1)){setPage(Math.floor((targetLine-(data.startLine??1))/limit));setSelected(targetLine);}else{setPage(0);setSelected(null);}},[targetLine,data.startLine,source]);
  const rendered = useMemo(() => lines.slice(currentPage * limit, (currentPage + 1) * limit).map(line => highlightLine(line, data.language)), [source, currentPage, data.language]);
  const copy = async () => { try { await navigator.clipboard.writeText(data.kind === 'diff' ? data.after ?? '' : source); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } };
  const identity = data.path ?? data.language;
  const hasToolbar = Boolean(identity || data.kind === 'diff' || showControls && data.kind === 'code');
  return <div className={`code-content code-${data.kind}`}>
    {hasToolbar && <div className="code-toolbar">{identity && <span><Icon name={data.kind === 'tree' ? 'folder' : data.kind === 'tools' ? 'activity' : 'file'} size={17} />{identity}</span>}<div>{data.kind === 'diff' && <><span className="diff-added">+{diff.filter(l => l.type === 'add').length}</span><span className="diff-removed">−{diff.filter(l => l.type === 'remove').length}</span>{showControls && <button type="button" onClick={() => setChangesOnly(!changesOnly)} aria-pressed={changesOnly}>{changesOnly ? 'Show context' : 'Changes only'}</button>}</>}{showControls && (data.kind === 'code' || data.kind === 'diff') && <button type="button" onClick={() => void copy()} aria-label="Copy code"><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy'}</button>}</div></div>}
    {data.kind === 'code' && <div className="code-scroll" data-navigation-scroll tabIndex={0} aria-label={data.path ?? 'Source code'}><pre><code>{rendered.map((line, i) => { const number = (data.startLine ?? 1) + currentPage * limit + i; return <span key={number} data-code-line={number} className={`code-line ${data.highlightLines?.includes(number) || selected === number ? 'highlighted' : ''}`}>{showControls ? <button type="button" className="line-number" aria-label={`Highlight line ${number}`} aria-pressed={selected === number} onClick={() => setSelected(selected === number ? null : number)}>{number}</button> : <span className="line-number" aria-label={`Line ${number}`}>{number}</span>}<span className="code-text">{line}</span></span>; })}</code></pre></div>}
    {data.kind === 'code' && lines.length > limit && <div className="table-pages"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← Previous</button><span>Lines {currentPage * limit + 1}–{Math.min(lines.length, (currentPage + 1) * limit)} of {lines.length}</span><button disabled={(currentPage + 1) * limit >= lines.length} onClick={() => setPage(currentPage + 1)}>Next →</button></div>}
    {data.kind === 'diff' && <div className="code-scroll" data-navigation-scroll tabIndex={0} aria-label="Code changes"><pre><code>{diff.filter(l => !showControls || !changesOnly || l.type !== 'same').map((line, i) => <span key={i} className={`code-line diff-line diff-${line.type}`}><span className="line-number">{line.old===undefined?'':line.old+(data.startLine??1)-1}</span><span className="line-number">{line.next===undefined?'':line.next+(data.startLine??1)-1}</span><span className="diff-sign" aria-label={line.type === 'add' ? 'Added' : line.type === 'remove' ? 'Removed' : 'Unchanged'}>{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</span><span className="code-text">{highlightLine(line.text,data.language)}</span></span>)}</code></pre>{!diff.length && <div className="content-empty">No changes to show.</div>}</div>}
    {data.kind==='terminal'&&<div className="terminal-transcript" data-navigation-scroll role="region" aria-label="Read-only terminal transcript"><header>Terminal <small>Read-only transcript</small></header>{(data.entries??[]).map(entry=><article key={entry.id} className={`terminal-entry terminal-${entry.status??(entry.exitCode===undefined?'pending':entry.exitCode===0?'success':'error')}`}><div className="terminal-meta">{entry.timestamp&&<time dateTime={entry.timestamp}>{entry.timestamp}</time>}{entry.cwd&&<span>{entry.cwd}</span>}<span>{entry.status??(entry.exitCode===undefined?'pending':entry.exitCode===0?'success':'error')}{entry.exitCode!==undefined?` · exit ${entry.exitCode}`:''}</span></div><pre className="terminal-command"><span aria-hidden="true">$ </span>{entry.command}</pre>{entry.stdout!==undefined&&<pre className="terminal-stdout">{entry.stdout}</pre>}{entry.stderr!==undefined&&<pre className="terminal-stderr" aria-label="Standard error">{entry.stderr}</pre>}</article>)}</div>}
    {data.kind === 'tree' && <FileTree files={data.files ?? []} />}
    {data.kind === 'tools' && <div className="tool-list">{(data.tools ?? []).map(tool => <article key={tool.id} className={`tool-item tool-${tool.status}`}><span className={tool.status === 'running' ? 'spinner' : 'tool-status-icon'}>{tool.status !== 'running' && <Icon name={tool.status === 'success' ? 'check' : tool.status === 'error' ? 'close' : 'more'} size={20} />}</span><div><div className="tool-heading"><strong>{tool.name}</strong><span>{tool.status}</span></div>{tool.summary && <p>{tool.summary}</p>}</div></article>)}</div>}
  </div>;
}

interface FileNode { name: string; path: string; directory: boolean; status?: string; children: FileNode[] }
export function FileTree({ files,activePath }: { files: NonNullable<CodeData['files']>;activePath?:string }) {
  const rootRef=useRef<HTMLDivElement>(null),[font,setFont]=useState(24);
  const tree = useMemo(() => {
    const root: FileNode = { name: '', path: '', directory: true, children: [] };
    for (const file of files) {
      let node = root; const parts = file.path.split('/').filter(Boolean);
      parts.forEach((part, i) => {
        let child = node.children.find(item => item.name === part);
        if (!child) { child = { name: part, path: parts.slice(0, i + 1).join('/'), directory: i < parts.length - 1 || file.kind === 'directory', children: [] }; node.children.push(child); }
        if (i === parts.length - 1) child.status = file.status;
        node = child;
      });
    }
    return root;
  }, [files]);
  useEffect(()=>{
    const root=rootRef.current,parent=root?.parentElement;if(!root||!parent)return;
    let frame=0,active=true;
    const resize=()=>{if(!active)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      if(!active||!root.isConnected)return;
      if(root.closest('.is-preview')){setFont(10);return;}
      const style=getComputedStyle(root),width=root.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
      const workspace=root.closest('.code-workspace');
      const availableHeight=workspace&&matchMedia('(max-width:650px)').matches?workspace.clientHeight*.3:parent.clientHeight;
      const height=availableHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
      if(width<=0||height<=0)return;
      let count=0,columns=1;
      const visit=(item:FileNode,depth:number)=>{count++;columns=Math.max(columns,depth*2.4+item.name.length+(item.status?item.status.length*.62+2:0)+3);item.children.forEach(child=>visit(child,depth+1));};
      tree.children.forEach(item=>visit(item,0));
      // Count folders as well as files, and reserve width for depth, labels,
      // icons and source status. Deep/large trees stay readable and scrollable;
      // short trees grow in their own pane, not in the whole display's width.
      const next=Math.round(Math.max(16,Math.min(72,width/(columns*.64),(height/Math.max(1,count)-12)/1.6))*2)/2;
      setFont(previous=>Math.abs(previous-next)>=.5?next:previous);
    });};
    const observer=new ResizeObserver(resize);observer.observe(parent);observer.observe(root);root.addEventListener('toggle',resize,true);resize();
    return()=>{active=false;cancelAnimationFrame(frame);observer.disconnect();root.removeEventListener('toggle',resize,true);};
  },[tree]);
  const node = (item: FileNode, depth: number): ReactNode => item.directory ? <li key={item.path}><details open={depth < 2||Boolean(activePath?.startsWith(item.path+'/'))}><summary><Icon name="folder" size={18} /><span>{item.name}</span>{item.status && <small>{item.status}</small>}</summary><ul>{item.children.map(child => node(child, depth + 1))}</ul></details></li> : <li key={item.path} className={`tree-file ${item.path===activePath?'active-file':''}`} aria-current={item.path===activePath?'true':undefined}><Icon name="file" size={17} /><span>{item.name}</span>{item.status && <small className={`file-status status-${item.status.replace(/[^a-z-]/g, '')}`}>{item.status}</small>}</li>;
  return <div ref={rootRef} className="file-tree" aria-label="File structure" style={{'--tree-font':`${font}px`} as CSSProperties}><ul>{tree.children.map(item => node(item, 0))}</ul>{!files.length && <div className="content-empty">No files supplied.</div>}</div>;
}
