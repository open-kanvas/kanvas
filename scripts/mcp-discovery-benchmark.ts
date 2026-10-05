/** Run with: npx tsx scripts/mcp-discovery-benchmark.ts
 * Evaluation-only corpus-local LSA baseline, deliberately not production code.
 * No model download or external service; prints only static catalog metrics. */
import { operationCatalog, templateCatalog, helpCatalog, discoveryToolDefinitions, discoveryCatalog } from '../src/server/mcp/discovery.js';
import { LocalSearch, tokens } from '../src/server/mcp/local-search.js';
const cases = [
  ['bring a saved tick list onto a different monitor', 'kanvas.checklist.show'],
  ['enlarge the typography', 'kanvas.config.update'],
  ['take a screenshot with native browser consent', 'kanvas.display.request.capture'],
  ['undo to a previous retained screen', 'kanvas.display.navigate'],
  ['automatically advance my slideshow', 'kanvas.autoplay.control'],
  ['grant a colleague access with an invitation', 'kanvas.invite.create'],
  ['ingest excel csv rows', 'kanvas.dataset.import'],
  ['halt public source polling', 'kanvas.monitoring.stop'],
  ['cheklist saved items', 'kanvas.checklist.read'],
  ['sessoin state', 'kanvas.session.state'],
  ['export an uploaded file as portable bytes', 'kanvas.asset.export'],
  ['stop a previously approved browser from watching', 'kanvas.pairing.revoke'],
  ['jump to an absolute source code line', 'kanvas.navigation.control'],
  ['who is connected in each tab', 'kanvas.topology.read'],
  ['accept proposed writing revisions', 'kanvas.draft.review'],
  ['read the current plan conflicts', 'kanvas.planner.read'],
] as const;
const memoryStart=process.memoryUsage().rss,started=performance.now();
const catalog=operationCatalog(), search=new LocalSearch(catalog);
const lexicalInitMs=performance.now()-started, lexicalRssDeltaBytes=process.memoryUsage().rss-memoryStart;
// Build normalized TF-IDF vectors, then a small rank-16 SVD via power iteration
// over document cosine Gram matrix. No new native numeric dependency.
const lsaStarted=performance.now();
const docs=catalog.map(d=>tokens(`${d.title} ${d.summary} ${d.keywords} ${d.text}`)),n=docs.length;
const vocabulary=[...new Set(docs.flat())].sort(),lookup=new Map(vocabulary.map((t,i)=>[t,i]));
const df=vocabulary.map(t=>docs.filter(d=>d.includes(t)).length),idf=df.map(f=>Math.log(1+n/(1+f)));
const norm=(v:Float64Array)=>Math.sqrt(v.reduce((sum,x)=>sum+x*x,0));
const dot=(a:Float64Array,b:Float64Array)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
function vector(text:string|string[]){const v=new Float64Array(vocabulary.length);for(const t of typeof text==='string'?tokens(text):text){const i=lookup.get(t);if(i!==undefined)v[i]=idf[i];}const length=norm(v)||1;return v.map(x=>x/length);}
const matrix=docs.map(vector),gram=matrix.map(a=>new Float64Array(matrix.map(b=>dot(a,b))));
const axes:Float64Array[]=[],eigen:number[]=[];
for(let k=0;k<16;k++){
 let v=new Float64Array(Array.from({length:n},(_,i)=>Math.sin((i+1)*(k+1))));
 for(let iteration=0;iteration<35;iteration++){
  let next=new Float64Array(gram.map(row=>dot(row,v)));
  for(const axis of axes){const projection=dot(next,axis);next=next.map((x,i)=>x-projection*axis[i]);}
  const length=norm(next)||1;v=next.map(x=>x/length);
 }
 const lambda=dot(v,new Float64Array(gram.map(row=>dot(row,v))));axes.push(v);eigen.push(Math.sqrt(Math.max(lambda,1e-9)));
}
const lsaInitMs=performance.now()-lsaStarted;
const lsa=(query:string)=>{const q=vector(query),similarity=new Float64Array(matrix.map(row=>dot(row,q))),latent=new Float64Array(axes.map((axis,k)=>dot(axis,similarity)/eigen[k]));return catalog.map((d,i)=>{const doc=new Float64Array(axes.map((axis,k)=>axis[i]*eigen[k]));return{id:d.id,score:dot(latent,doc)/((norm(latent)*norm(doc))||1)};}).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));};
const summary=(searcher:(q:string)=>string[])=>{const results=cases.map(([query,expected])=>{const ids=searcher(query);return{query,expected,rank:ids.indexOf(expected)<0?null:ids.indexOf(expected)+1,top5:ids.slice(0,5)};});return{recallAt5:results.filter(r=>r.rank&&r.rank<=5).length+'/'+results.length,top1:results.filter(r=>r.rank===1).length+'/'+results.length,results};};
for(const [query] of cases)search.search(query);
const times:number[]=[];for(let round=0;round<5;round++)for(const [query] of cases){const t=performance.now();search.search(query);times.push(performance.now()-t);}times.sort((a,b)=>a-b);
const context={principal:{userId:'benchmark-static-catalog',scopes:['read']}};
const facadeTimes:number[]=[];for(const [query] of cases){const t=performance.now();discoveryCatalog.query('tool','search',{query,limit:5},context);facadeTimes.push(performance.now()-t);}facadeTimes.sort((a,b)=>a-b);
const templateStart=performance.now();const templateResult=discoveryCatalog.query('template','get',{id:'kanvas.template.presentation'},context);const templateColdMs=performance.now()-templateStart;
const lsaTimes:number[]=[];for(const [query] of cases){const t=performance.now();lsa(query);lsaTimes.push(performance.now()-t);}lsaTimes.sort((a,b)=>a-b);
console.log(JSON.stringify({facadeLatencyMs:{samples:facadeTimes.length,p50:facadeTimes[Math.floor(facadeTimes.length*.5)],p95:facadeTimes[Math.floor(facadeTimes.length*.95)]},templateCold:{milliseconds:templateColdMs,bytes:Buffer.byteLength(JSON.stringify(templateResult))},lsaLatencyMs:{samples:lsaTimes.length,p50:lsaTimes[Math.floor(lsaTimes.length*.5)],p95:lsaTimes[Math.floor(lsaTimes.length*.95)]},environment:{node:process.version,platform:process.platform,arch:process.arch},catalog:{operations:catalog.length,templates:templateCatalog().length,help:helpCatalog().length,toolsListBytes:Buffer.byteLength(JSON.stringify(discoveryToolDefinitions()))},lexicalInitMs,lexicalRssDeltaBytes,lsaInitMs,productionLatencyMs:{samples:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)},rssDeltaBytes:process.memoryUsage().rss-memoryStart,production:summary(q=>search.search(q).map(x=>x.document.id)),lsa:summary(q=>lsa(q).map(x=>x.id)),notes:'Static English evaluation corpus, not universal semantic accuracy. LSA shares identical catalog text but no curated query expansion/fuzzy scoring; pretrained neural models were not installed or benchmarked.'},null,2));
