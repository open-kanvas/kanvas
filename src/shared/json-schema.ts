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

  // Canonicalize schema-only object key ordering before equivalence sharing.
  // Literal defaults/examples/const values remain untouched; order is not a validator.
  schemas(result,node=>{
    for(const key of ['properties','patternProperties']){const value=node[key];if(value&&typeof value==='object'&&!Array.isArray(value))node[key]=Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));}
    const entries=Object.entries(node).sort(([a],[b])=>a.localeCompare(b));for(const key of Object.keys(node))delete node[key];Object.assign(node,Object.fromEntries(entries));
  });

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
    // Closed discriminated unions can share a common array upper bound while
    // branches with a tighter bound retain it. This preserves source-template
    // actions: ordinary slides allow up to eight; reading records allow none.
    const dereference=(value:unknown):Record<string,unknown>|undefined=>{
      if(!value||typeof value!=='object'||Array.isArray(value))return;
      let node=value as Record<string,unknown>;const seen=new Set<string>();
      while(Object.keys(node).length===1&&typeof node.$ref==='string'){
        const match=/^#\/\$defs\/([^/]+)$/.exec(node.$ref);if(!match||seen.has(match[1]))return;seen.add(match[1]);
        const next=result.$defs[match[1]];if(!next||typeof next!=='object'||Array.isArray(next))return;node=next as Record<string,unknown>;
      }
      return node;
    };
    schemas(result,node=>{
      const branches=(node.anyOf??node.oneOf) as Record<string,unknown>[]|undefined;
      if(node.unevaluatedProperties!==false||!Array.isArray(branches)||branches.length<2||!node.properties)return;
      const first=branches[0].properties;if(!first||typeof first!=='object')return;
      for(const key of Object.keys(first)){
        const fields=branches.map(branch=>(branch.properties as Record<string,unknown>|undefined)?.[key]),resolved=fields.map(dereference);
        if(!resolved.every(field=>field?.type==='array'&&typeof field.maxItems==='number'))continue;
        const withoutLimit=(field:Record<string,unknown>)=>JSON.stringify(Object.fromEntries(Object.entries(field).filter(([key])=>key!=='maxItems')));
        if(!resolved.every(field=>withoutLimit(field!)===withoutLimit(resolved[0]!)))continue;
        const maximum=Math.max(...resolved.map(field=>field!.maxItems as number)),index=resolved.findIndex(field=>field!.maxItems===maximum);
        (node.properties as Record<string,unknown>)[key]=fields[index];
        branches.forEach((branch,index)=>{if(resolved[index]!.maxItems===maximum)delete (branch.properties as Record<string,unknown>)[key];});
      }
    });
    pruneAliases();
    const alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const names=new Map(Object.keys(result.$defs).map((key,index)=>[key,alphabet[index%alphabet.length]+(index<alphabet.length?'':Math.floor(index/alphabet.length).toString(36))]));
    schemas(result,node=>{if(typeof node.$ref==='string'){const match=/^#\/\$defs\/([^/]+)$/.exec(node.$ref);if(match&&names.has(match[1]))node.$ref=`#${names.get(match[1])}`;}});
    result.$defs=Object.fromEntries(Object.entries(result.$defs).map(([key,value])=>[names.get(key)!,{...(value as Record<string,unknown>),$anchor:names.get(key)!}]));
    // Deduplication can leave single-use or tiny definitions whose anchor and
    // reference cost more bytes than the complete schema. Inline only pure
    // references, choosing actual encoded savings, and never recursive edges.
    for (;;) {
      const uses=new Map<string,Record<string,unknown>[]>();
      schemas(result,node=>{if(typeof node.$ref==='string'){const locations=uses.get(node.$ref)??[];locations.push(node);uses.set(node.$ref,locations);}});
      const candidate=Object.entries(result.$defs).map(([name,definition])=>{
        const refs=uses.get(`#${name}`)??[],{$anchor:_anchor,...body}=definition as Record<string,unknown>;
        let recursive=false;schemas(body,node=>{if(node.$ref===`#${name}`)recursive=true;});
        const savings=JSON.stringify({[name]:definition}).length-2+refs.length*(JSON.stringify({$ref:`#${name}`}).length-JSON.stringify(body).length);
        return {name,body,refs,savings,recursive};
      }).filter(x=>!x.recursive&&x.refs.length>0&&x.refs.every(node=>Object.keys(node).length===1)&&x.savings>0).sort((a,b)=>b.savings-a.savings)[0];
      if(!candidate)break;
      for(const node of candidate.refs){delete node.$ref;Object.assign(node,structuredClone(candidate.body));}
      delete result.$defs[candidate.name];
    }

    // Share repeated context-independent constraint fragments as $ref siblings.
    // Unlike properties/additionalProperties/unevaluatedProperties, these
    // keywords do not depend on where adjacent validators evaluate properties
    // or items. Moving them into a referenced schema is an exact intersection,
    // including required lists and bounds; nothing is dropped or relaxed.
    // Keep the root type visible for schema discovery and avoid nested resource
    // scopes, where a local anchor might otherwise resolve against another $id.
    let nestedResource=false;schemas(result,node=>{if(node!==result&&typeof node.$id==='string')nestedResource=true;});
    if(!nestedResource){
      const groups=[['maxLength'],['maxItems'],['minItems','maxItems'],['type','minLength','maxLength'],['type','minimum'],['pattern'],['type'],['required'],['type','required'],['type','minItems','maxItems','uniqueItems'],['type','minLength','maxLength','pattern'],['type','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf']];
      for(let iteration=0;iteration<schemaNodes;iteration++){
        let ordinal=0,name:string;
        do{name=alphabet[ordinal%alphabet.length]+(ordinal<alphabet.length?'':Math.floor(ordinal/alphabet.length).toString(36));ordinal++;}while(Object.hasOwn(result.$defs,name));
        const reference={$ref:`#${name}`},candidates=new Map<string,{fragment:Record<string,unknown>;nodes:Record<string,unknown>[]}>();
        schemas(result,node=>{
          if(node===result||node.$ref!==undefined)return;
          const seen=new Set<string>();
          for(const keys of groups){
            const fragment=Object.fromEntries(keys.filter(key=>Object.hasOwn(node,key)).map(key=>[key,node[key]])),encoded=JSON.stringify(fragment);
            if(encoded==='{}'||seen.has(encoded))continue;seen.add(encoded);
            const group=candidates.get(encoded)??{fragment,nodes:[]};group.nodes.push(node);candidates.set(encoded,group);
          }
        });
        const chosen=[...candidates.values()].filter(group=>group.nodes.length>1).map(group=>{
          const keys=new Set(Object.keys(group.fragment));
          const replacements=group.nodes.map(node=>({...Object.fromEntries(Object.entries(node).filter(([key])=>!keys.has(key))),...reference}));
          const savings=group.nodes.reduce((sum,node,index)=>sum+JSON.stringify(node).length-JSON.stringify(replacements[index]).length,0)-JSON.stringify({[name]:{...group.fragment,$anchor:name}}).length;
          return {...group,replacements,savings};
        }).filter(group=>group.savings>0).sort((a,b)=>b.savings-a.savings)[0];
        if(!chosen)break;
        chosen.nodes.forEach((node,index)=>{for(const key of Object.keys(node))delete node[key];Object.assign(node,chosen.replacements[index]);});
        (result.$defs as Record<string,unknown>)[name]={...chosen.fragment,$anchor:name};
      }
    }

  }
  return result;
}
