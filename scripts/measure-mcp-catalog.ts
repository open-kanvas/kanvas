/** Offline public MCP catalog measurements. No network calls or domain operations.
 * Run: node --import tsx scripts/measure-mcp-catalog.ts [--baseline tools.json]
 * An optional baseline is a saved array of public wire-tool definitions, not a
 * request to enable a retired profile. Artifacts stay in ignored feature scratch. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { listToolDefinitions } from '../src/server/mcp/catalog.js';
import { operationCatalog, templateCatalog, helpCatalog } from '../src/server/mcp/discovery.js';

const directory = join(process.cwd(), '.kanvas/work/mcp-catalog');
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type WireTools = ReturnType<typeof listToolDefinitions>;
function metrics(tools: WireTools) {
  return { toolCount: tools.length, descriptionSchemaUtf8Bytes: bytes(tools.map(({name,description,inputSchema}) => ({name,description,inputSchema}))),
    descriptionUtf8Bytes: tools.reduce((sum, tool) => sum + Buffer.byteLength(tool.description ?? ''), 0),
    schemaUtf8Bytes: tools.reduce((sum, tool) => sum + bytes(tool.inputSchema), 0), catalogSha256: digest(tools) };
}
async function main() {
  const {values} = parseArgs({options:{baseline:{type:'string'}},allowPositionals:false});
  const tools = listToolDefinitions(), operations = operationCatalog().map(item => item.detail());
  let baseline: WireTools | undefined;
  if (values.baseline) {
    const value: unknown = JSON.parse(await readFile(values.baseline, 'utf8'));
    if (!Array.isArray(value) || value.some(tool => !tool || typeof tool.name !== 'string' || !tool.inputSchema || typeof tool.inputSchema !== 'object' || tool.description !== undefined && typeof tool.description !== 'string')) throw new Error('The baseline must be a saved array of wire-tool definitions.');
    baseline = value as WireTools;
  }
  const measurement = { createdAt: new Date().toISOString(), wire: metrics(tools), operationCount: operations.length,
    operationDetailUtf8Bytes: bytes(operations), operationCatalogSha256: digest(operations),
    templateCount: templateCatalog().length, helpEntryCount: helpCatalog().length,
    ...(baseline ? {baseline:metrics(baseline)} : {}), units:'UTF-8 bytes, not tokens. Wire tools and lazily discovered operation details are measured separately.' };
  await mkdir(directory, {recursive:true,mode:0o700});
  for (const [name,value] of [['public-tools.json',tools],['public-operations.json',operations],['catalog-measurement.json',measurement]] as const)
    await writeFile(join(directory,name), JSON.stringify(value,null,2)+'\n', {mode:0o600});
  console.log(JSON.stringify(measurement));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Catalog measurement failed.'); process.exitCode = 1; });
