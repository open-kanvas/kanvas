/** Shorten local definition identifiers without changing any schema constraints.
 * Composite presentation contracts must remain fully inspectable inside the
 * bounded MCP response; truncating their child schemas makes them unusable.
 */
export function compactSchemaReferences(schema: Record<string, unknown>): Record<string, unknown> {
  const schemas=(value:unknown,visit:(node:Record<string,unknown>)=>void):void=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return;
    const node=value as Record<string,unknown>;visit(node);
    for(const keyword of ['properties','patternProperties','$defs','definitions','dependentSchemas']){
      const children=node[keyword];if(children&&typeof children==='object'&&!Array.isArray(children))for(const child of Object.values(children))schemas(child,visit);
    }
    for(const keyword of ['items','additionalProperties','unevaluatedProperties','contains','not','if','then','else','propertyNames'])schemas(node[keyword],visit);
    for(const keyword of ['allOf','anyOf','oneOf','prefixItems'])if(Array.isArray(node[keyword]))for(const child of node[keyword])schemas(child,visit);
  };
  const definitions = schema.$defs;
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return schema;
  const entries = Object.entries(definitions);
  const escapePointer = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
  const references = new Map(entries.map(([name], index) => [`#/$defs/${escapePointer(name)}`, `#/$defs/d${index.toString(36)}`]));
  const rewrite = (value: unknown): unknown => {
    const copy = structuredClone(value);
    schemas(copy, node => {
      if (typeof node.$ref !== 'string') return;
      const exact = references.get(node.$ref);
      if (exact) { node.$ref = exact; return; }
      for (const [before, after] of references) if (node.$ref.startsWith(`${before}/`)) { node.$ref = `${after}${node.$ref.slice(before.length)}`; break; }
    });
    return copy;
  };
  const { $defs: _definitions, ...root } = schema;
  const result = { ...rewrite(root) as Record<string, unknown>, $defs: Object.fromEntries(entries.map(([, value], index) => [`d${index.toString(36)}`, rewrite(value)])) };
  if (JSON.stringify(result).length < 50_000) return result;

  // Zod may retain a definition that has only one final reference after its
  // parent was itself shared. Inline only a complete, single-use $ref: sibling
  // constraints, subschema pointers and recursive definitions remain intact.
  const walk = schemas;
  for (let iteration = 0; iteration < entries.length; iteration++) {
    const references = new Map<string, { count: number; pure?: Record<string, unknown> }>();
    walk(result, node => {
      if (typeof node.$ref !== 'string') return;
      const match = /^#\/\$defs\/([^/]+)(.*)$/.exec(node.$ref);
      if (!match) return;
      const record = references.get(match[1]) ?? { count: 0 };
      record.count++;
      if (!match[2] && Object.keys(node).length === 1) record.pure = node;
      references.set(match[1], record);
    });
    const candidate = Object.entries(result.$defs).find(([name, definition]) => {
      const reference = references.get(name);
      if (reference?.count !== 1 || !reference.pure || !definition || typeof definition !== 'object' || Array.isArray(definition)) return false;
      let recursive = false;
      walk(definition, node => { if (typeof node.$ref === 'string' && (node.$ref === `#/$defs/${name}` || node.$ref.startsWith(`#/$defs/${name}/`))) recursive = true; });
      return !recursive;
    });
    if (!candidate) break;
    const [name, definition] = candidate;
    const location = references.get(name)!.pure!;
    delete location.$ref;
    Object.assign(location, definition);
    delete result.$defs[name];
  }
  // Equal schemas can be separate Zod instances (especially new template
  // fields). Share those complete schemas as well, without changing defaults,
  // annotations or constraints. Never rewrite application data in defaults.
  let pointerIntoDefinition=false;
  schemas(result,node=>{if(typeof node.$ref==='string'&&/^#\/\$defs\/[^/]+\//.test(node.$ref))pointerIntoDefinition=true;});
  // The catalog can contain many independently declared but equal field
  // contracts. Bound work by the actual finite schema, not a template-count
  // assumption; each iteration must remove net encoded bytes.
  let schemaNodes=0;schemas(result,()=>schemaNodes++);
  const shareRepeated=(minimum=28,estimatedCost?:number)=>{if(!pointerIntoDefinition)for(let iteration=0;iteration<schemaNodes;iteration++){
    const repeated=new Map<string,Record<string,unknown>[]>();
    // A reference plus sibling annotations/constraints is itself a complete
    // schema. Sharing equal annotated references preserves every sibling and
    // avoids repeating long field guidance throughout a composite contract.
    schemas(result,node=>{if(node===result||node.$ref!==undefined&&Object.keys(node).length===1)return;const encoded=JSON.stringify(node);if(encoded.length<minimum)return;const same=repeated.get(encoded)??[];same.push(node);repeated.set(encoded,same);});
    let ordinal=iteration;while(Object.hasOwn(result.$defs,`r${ordinal.toString(36)}`))ordinal++;
    const name=`r${ordinal.toString(36)}`,reference={$ref:`#/$defs/${name}`},cost=estimatedCost??JSON.stringify(reference).length;
    const candidate=[...repeated].filter(([encoded,nodes])=>nodes.length>1&&nodes.length*(encoded.length-cost)>encoded.length+name.length+(estimatedCost===undefined?12:30)).sort((a,b)=>b[0].length-a[0].length)[0];
    if(!candidate)break;
    const [encoded,nodes]=candidate;
    for(const node of nodes){for(const key of Object.keys(node))delete node[key];Object.assign(node,reference);}
    (result.$defs as Record<string,unknown>)[name]=JSON.parse(encoded);
  }
  };
  shareRepeated();
  // A presentation repeats the same view envelope for every leaf template.
  // Lift ONLY identical constraints out of an object union. A 2020-12 union
  // with a unique literal discriminator can close its evaluated properties at
  // the parent: exactly one branch can match, so another branch cannot make an
  // unrelated field permissible. Other unions retain explicit allowed names.
  if(!pointerIntoDefinition)schemas(result,node=>{
    const keyword=Array.isArray(node.anyOf)?'anyOf':Array.isArray(node.oneOf)?'oneOf':undefined;
    if(!keyword||node.properties!==undefined||node.type!==undefined||node.required!==undefined)return;
    const branches=node[keyword] as Record<string,unknown>[];
    if(branches.length<2||!branches.every(branch=>branch&&branch.type==='object'&&branch.properties&&typeof branch.properties==='object'))return;
    const first=branches[0].properties as Record<string,unknown>;
    const shared=Object.fromEntries(Object.entries(first).filter(([key,value])=>branches.every(branch=>JSON.stringify((branch.properties as Record<string,unknown>)[key])===JSON.stringify(value))));
    if(!Object.keys(shared).length)return;
    const literal=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.prototype.hasOwnProperty.call(value,'const')?JSON.stringify((value as Record<string,unknown>).const):undefined;
    const discriminator=Object.keys(first).some(key=>{const values=branches.map(branch=>literal((branch.properties as Record<string,unknown>)[key]));return values.every(value=>value!==undefined)&&new Set(values).size===branches.length;});
    const evaluated=typeof schema.$schema==='string'&&schema.$schema.includes('/2020-12/')&&discriminator&&branches.every(branch=>branch.additionalProperties===false)&&node.unevaluatedProperties===undefined;
    node.properties=shared;node.type='object';
    if(evaluated)node.unevaluatedProperties=false;
    const required=branches[0].required;
    if(required!==undefined&&branches.every(branch=>JSON.stringify(branch.required)===JSON.stringify(required)))node.required=required;
    for(const branch of branches){
      delete branch.type;
      if(node.required!==undefined)delete branch.required;
      if(evaluated)delete branch.additionalProperties;
      for(const key of Object.keys(shared)){if(evaluated)delete (branch.properties as Record<string,unknown>)[key];else (branch.properties as Record<string,unknown>)[key]={};}
    }
  });
  shareRepeated();
  // Sharing can leave chains of definition aliases and definitions no longer
  // reachable from the root. Resolve pure aliases only; preserve every sibling
  // constraint/annotation, recursive edge, and application default verbatim.
  const pruneAliases=()=>{if(!pointerIntoDefinition){
    const defs=result.$defs as Record<string,unknown>,aliases=new Map<string,string>();
    for(const [name,value] of Object.entries(defs)){
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1)continue;
      const target=(value as Record<string,unknown>).$ref;
      if(typeof target==='string'&&/^#\/\$defs\/[^/]+$/.test(target))aliases.set(`#/$defs/${name}`,target);
    }
    const terminal=(ref:string)=>{let current=ref;const seen=new Set<string>();while(aliases.has(current)){if(seen.has(current))return ref;seen.add(current);current=aliases.get(current)!;}return current;};
    schemas(result,node=>{if(typeof node.$ref==='string')node.$ref=terminal(node.$ref);});
    const reachable=new Set<string>(),pending:unknown[]=[Object.fromEntries(Object.entries(result).filter(([key])=>key!=='$defs'))];
    while(pending.length)schemas(pending.pop(),node=>{
      const match=typeof node.$ref==='string'?/^#\/\$defs\/([^/]+)$/.exec(node.$ref):null;
      if(match&&!reachable.has(match[1])){reachable.add(match[1]);pending.push(defs[match[1]]);}
    });
    for(const name of Object.keys(defs))if(!reachable.has(name))delete defs[name];
  }
  };
  pruneAliases();
  // const/enum already enforce their scalar type. Omitting an implied type
  // shortens the wire schema without changing which values it accepts.
  schemas(result,node=>{
    const values=Object.hasOwn(node,'const')?[node.const]:Array.isArray(node.enum)&&node.enum.length?node.enum:undefined;
    if(!values||!['string','number','integer','boolean','null'].includes(String(node.type)))return;
    const type=node.type;
    if(values.every(value=>type==='null'?value===null:type==='integer'?typeof value==='number'&&Number.isInteger(value):typeof value===type))delete node.type;
  });
  // A complete presentation contains every leaf validator. Keep all validation
  // keywords and use short local anchors. Human annotations/default hints are
  // available in each leaf's template.get schema; they are not validators.
  const template=(schema.properties as Record<string,any>|undefined)?.template;
  if(template?.const==='presentation'&&!pointerIntoDefinition){
    schemas(result,node=>{for(const key of ['description','title','default','examples','deprecated','readOnly','writeOnly'])delete node[key];});
    shareRepeated(16,14);
    pruneAliases();
    const alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const names=new Map(Object.keys(result.$defs).map((key,index)=>[key,alphabet[index%alphabet.length]+(index<alphabet.length?'':Math.floor(index/alphabet.length).toString(36))]));
    schemas(result,node=>{if(typeof node.$ref==='string'){const match=/^#\/\$defs\/([^/]+)$/.exec(node.$ref);if(match&&names.has(match[1]))node.$ref=`#${names.get(match[1])}`;}});
    result.$defs=Object.fromEntries(Object.entries(result.$defs).map(([key,value])=>[names.get(key)!,{...(value as Record<string,unknown>),$anchor:names.get(key)!}]));
  }
  return result;
}
