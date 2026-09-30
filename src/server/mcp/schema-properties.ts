/** JSON Schema stays the validation contract. Some tool hosts only project
 * root properties into typed arguments, ignoring properties inside oneOf.
 * Expose those types without weakening the operation-specific branches. */
export type Schema = boolean | { [key: string]: unknown };
const object = (value: unknown): value is Exclude<Schema, boolean> => !!value && typeof value === 'object' && !Array.isArray(value);
const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

export function schemaTypes(schema: unknown): string[] | undefined {
  if (!object(schema)) return undefined;
  if (typeof schema.type === 'string' && types.has(schema.type)) return [schema.type];
  if (Array.isArray(schema.type) && schema.type.every(type => typeof type === 'string' && types.has(type))) return schema.type;
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (!Array.isArray(alternatives)) return undefined;
  const branches = alternatives.map(schemaTypes);
  return branches.every(branch => branch !== undefined) ? [...new Set(branches.flat())] as string[] : undefined;
}

const withoutDefault = (schema: Schema): Schema => {
  if (!object(schema)) return schema;
  const { default: _default, ...rest } = schema;
  return rest;
};

function projection(variants: Schema[]): Schema {
  const choices = [...new Map(variants.map(schema => [JSON.stringify(withoutDefault(schema)), withoutDefault(schema)])).values()];
  if (choices.length === 1) return choices[0];
  const branchTypes = choices.map(schemaTypes);
  const union = branchTypes.every(branch => branch !== undefined) ? [...new Set(branchTypes.flat())] : undefined;
  const shape: Record<string, unknown> = {};
  const arrays = choices.filter(choice => schemaTypes(choice)?.includes('array'));
  if (union && arrays.length && arrays.every(choice => object(choice) && (object(choice.items) || typeof choice.items === 'boolean'))) {
    shape.items = projection(arrays.map(choice => (choice as Exclude<Schema, boolean>).items as Schema));
  }
  const objects = choices.filter(choice => schemaTypes(choice)?.includes('object'));
  if (union && objects.length && objects.every(choice => object(choice) && object(choice.properties) && choice.additionalProperties === false)) {
    const fields = new Map<string, Schema[]>();
    for (const choice of objects) for (const [name, value] of Object.entries((choice as Exclude<Schema, boolean>).properties as Record<string, Schema>)) {
      fields.set(name, [...(fields.get(name) ?? []), value]);
    }
    shape.properties = Object.fromEntries([...fields].map(([name, values]) => [name, projection(values)]));
  }
  // Keep conflicting bounds/required fields/defaults in their own operation.
  // Retain item/property types where every accepting branch specifies them.
  // Never constrain an object property that another branch leaves open.
  return { ...(union ? { type: union.length === 1 ? union[0] : union } : {}), ...shape };
}

export function exposeSchemaProperties(input: Schema): Schema {
  if (!object(input)) return input;
  const schema = { ...input };
  for (const key of ['properties', '$defs', 'dependentSchemas']) {
    if (object(schema[key])) schema[key] = Object.fromEntries(Object.entries(schema[key]).map(([name, value]) => [name, exposeSchemaProperties(value as Schema)]));
  }
  for (const key of ['items', 'additionalProperties', 'if', 'then', 'else', 'not']) {
    if (object(schema[key])) schema[key] = exposeSchemaProperties(schema[key]);
  }
  for (const key of ['oneOf', 'anyOf', 'allOf', 'prefixItems']) {
    if (Array.isArray(schema[key])) schema[key] = (schema[key] as Schema[]).map(exposeSchemaProperties);
  }
  const keyword = Array.isArray(schema.oneOf) ? 'oneOf' : Array.isArray(schema.anyOf) ? 'anyOf' : undefined;
  if (!keyword) return schema;
  const branches = schema[keyword] as Schema[];
  if (!branches.length || !branches.every(branch => schemaTypes(branch)?.join() === 'object' && object(branch) && object(branch.properties))) return schema;

  const variants = new Map<string, Schema[]>();
  for (const branch of branches) for (const [name, value] of Object.entries((branch as Exclude<Schema, boolean>).properties as Record<string, Schema>)) {
    variants.set(name, [...(variants.get(name) ?? []), value]);
  }
  const properties: Record<string, Schema> = { ...(schema.properties as Record<string, Schema> | undefined) };
  for (const [name, choices] of variants) if (!Object.hasOwn(properties, name)) properties[name] = projection(choices);
  schema.type ??= 'object';
  schema.properties = properties;
  // Identical constraints need only appear once. Keep every branch's allowed
  // keys, required fields, additionalProperties:false and refinements intact.
  schema[keyword] = branches.map(branch => ({
    ...Object.fromEntries(Object.entries(branch as Exclude<Schema, boolean>).filter(([key, value]) => key !== 'type' || value !== schema.type)),
    properties: Object.fromEntries(Object.entries((branch as Exclude<Schema, boolean>).properties as Record<string, Schema>).map(([name, value]) => {
      const root = properties[name];
      if (!object(value) || !object(root)) return [name, value];
      // Root properties and the chosen branch are conjunctive. A keyword
      // already enforced at the root is redundant even when other bounds
      // differ. Keep operation-specific defaults and all differing bounds.
      return [name, Object.fromEntries(Object.entries(value).filter(([key, child]) =>
        key === 'default' || !Object.hasOwn(root, key) || JSON.stringify(root[key]) !== JSON.stringify(child),
      ))];
    })),
  }));
  return schema;
}

/** Share identical operation-branch contracts, keeping host-facing root
 * properties fully expanded. Only schema keywords are walked: examples,
 * defaults and literal application objects are never rewritten. */
export function shareBranchSchemas(input: Schema): Schema {
  if(!object(input)||!Array.isArray(input.oneOf)||input.$defs)return input;
  const result=structuredClone(input),defs:Record<string,Schema>={};
  const walk=(value:unknown,visit:(schema:Exclude<Schema,boolean>)=>void)=>{
    if(!object(value))return;visit(value);
    for(const key of ['properties','patternProperties','dependentSchemas'])if(object(value[key]))for(const child of Object.values(value[key]))walk(child,visit);
    for(const key of ['items','additionalProperties','if','then','else','not','contains','propertyNames'])walk(value[key],visit);
    for(const key of ['oneOf','anyOf','allOf','prefixItems'])if(Array.isArray(value[key]))for(const child of value[key])walk(child,visit);
  };
  let nestedIdentity=false,nodes=0;
  for(const branch of result.oneOf as Schema[])walk(branch,node=>{nodes++;if(node.$id||node.$anchor||node.$ref||node.$dynamicRef||node.$defs)nestedIdentity=true;});
  if(nestedIdentity)return input;
  for(let i=0;i<nodes;i++){
    const repeated=new Map<string,Exclude<Schema,boolean>[]>(),name=`c${i.toString(36)}`,ref={$ref:`#/$defs/${name}`},cost=JSON.stringify(ref).length;
    for(const branch of result.oneOf as Schema[])walk(branch,node=>{if(node.$ref)return;const encoded=JSON.stringify(node);if(encoded.length<28)return;const list=repeated.get(encoded)??[];list.push(node);repeated.set(encoded,list);});
    const candidate=[...repeated].map(([encoded,locations])=>({encoded,locations,saving:(locations.length-1)*encoded.length-locations.length*cost-name.length-4})).filter(c=>c.locations.length>1&&c.saving>0).sort((a,b)=>b.saving-a.saving)[0];
    if(!candidate)break;
    defs[name]=JSON.parse(candidate.encoded);
    for(const node of candidate.locations){for(const key of Object.keys(node))delete node[key];Object.assign(node,ref);}
  }
  if(Object.keys(defs).length)result.$defs=defs;
  return result;
}
