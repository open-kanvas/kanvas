/**
 * Reproducible catalog measurement and OPTIONAL synthetic next-call selection
 * probe. Default is offline; --agent-eval makes exactly two Astra/max requests
 * through the installed OpenClaw Gateway. No KANVAS operations are executed.
 * This measures selection, not real host approvals, agent wakeup or wall time
 * for a complete conversation. Prompt/response artifacts contain only synthetic
 * examples and public schemas, never credentials or production session data.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listToolDefinitions, resolveToolCall } from '../src/server/mcp/catalog.js';
import { profileInstructions } from '../src/server/mcp/profile-guidance.js';
import type { McpProfile } from '../src/server/mcp/operations.js';

const directory = join(process.cwd(), '.kanvas/work/twelve-tools');
const invoke = promisify(execFile);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const fields = (tools: ReturnType<typeof listToolDefinitions>) => tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
const MODEL = 'openai/gpt-6-astra';
const REASONING = 'max';

const tasks = [
  { id: 'state', goal: 'Read the current live policy and revisions for session-id before deciding what to show.', canonical: 'kanvas_session_state' },
  { id: 'create', goal: 'The user explicitly starts an unrelated topic. Create a fresh session named Field notes; do not reuse an existing session or create a display yet.', canonical: 'kanvas_session_create' },
  { id: 'fact', goal: 'The user asked to show the exact fact "Water freezes at 0 °C." on display-id in session-id. Live policy is follow, unheld, automatic updates. Use prepared fact data, requestId fact-1; no extra lookup is needed.', canonical: 'kanvas_submit' },
  { id: 'replace', goal: 'On session-id/display-id (fact, revision 3), explicitly replace the COMPLETE editable data object with {"text":"Replacement."}. Keep the same template. This is the whole new data, not a partial merge.', canonical: 'kanvas_display_edit' },
  { id: 'patch', goal: 'On session-id/display-id, revision 3, change ONLY /data/segments/0/text by appending the exact string " More words.". Retain all sibling segments and metadata. RequestId patch-1. Current template is transcription.', canonical: 'kanvas_view_patch' },
  { id: 'viewport', goal: 'Change only display-id viewport to width 443 and height 823 in session-id. Do not publish or replace content.', canonical: 'kanvas_display_update' },
  { id: 'defaults', goal: 'Account owner explicitly wants future NEW sessions to default to dark theme. Account preferences revision is 3. Do not alter the active session.', canonical: 'kanvas_preferences_update' },
  { id: 'source', goal: 'Import an exact dataset named Ledger into session-id from original JSON text [{"amount":1.2300},{"amount":9007199254740993}]. Preserve every decimal digit; no display publication requested.', canonical: 'kanvas_dataset_import' },
  { id: 'inbox', goal: 'Read pending viewer interactions for session-id, without consuming or acknowledging anything. This is not product feedback.', canonical: 'kanvas_interactions_read' },
  { id: 'ack', goal: 'Viewer input interaction-id has already been read and handled. Acknowledge that unique input in session-id. Its reusable actionId is button-id; do not use actionId as the record identifier.', canonical: 'kanvas_interaction_ack' },
  { id: 'suggestion', goal: 'File a product usability suggestion in session-id: title "Larger labels", description "Please make axis labels easier to read on a phone." RequestId feedback-1. Do not inject it into the viewer interaction inbox.', canonical: 'kanvas_feedback_submit' },
  { id: 'report-read', goal: 'Read the product reports filed in session-id for review. Do not acknowledge viewer interactions, create another report or change report status.', canonical: 'kanvas_reports_read' },
  { id: 'snapshot', goal: 'The user explicitly requests an isolated SERVER-rendered screenshot of session-id/display-id for visual verification, width 443 and height 823. They know it is not a physical-screen photo or a receiving-browser DOM observation.', canonical: 'kanvas_display_snapshot' },
  { id: 'monitor', goal: 'Explicitly stop bounded source-monitor job-id in session-id at expectedVersion 1 with requestId stop-1. Keep the last displayed view.', canonical: 'kanvas_monitoring_stop' },
  { id: 'pair', goal: 'The owner has personally verified the intended guest browser and explicitly confirmed approval of pairing-id in session-id. Approve only that browser; no other grants or members.', canonical: 'kanvas_pairing_decide' },
  { id: 'clear', goal: 'The owner explicitly asks to blank ONLY display-id in session-id; retain the session, datasets and assets. Use requestId clear-1.', canonical: 'kanvas_clear' },
] as const;

async function save(name: string, value: unknown) { await writeFile(join(directory, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--agent-eval')) throw new Error('Only --agent-eval is supported.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const legacy = listToolDefinitions('legacy'), twelve = listToolDefinitions('twelve');
  let baseline: ReturnType<typeof listToolDefinitions> | undefined;
  try { baseline = JSON.parse(await readFile(join(directory, 'baseline-catalog.json'), 'utf8')); } catch { /* Initial baseline is optional for later offline repeats. */ }
  const metrics = (tools: ReturnType<typeof listToolDefinitions>) => ({ toolCount: tools.length, descriptionSchemaUtf8Bytes: bytes(fields(tools)), descriptionUtf8Bytes: tools.reduce((sum, tool) => sum + Buffer.byteLength(tool.description ?? ''), 0), schemaUtf8Bytes: tools.reduce((sum, tool) => sum + bytes(tool.inputSchema), 0), catalogSha256: digest(JSON.stringify(tools)) });
  const measurement = { createdAt: new Date().toISOString(), baseline: baseline ? metrics(baseline) : undefined, legacy: metrics(legacy), twelve: metrics(twelve), reductionPercent: Number(((1 - bytes(fields(twelve)) / bytes(fields(baseline ?? legacy))) * 100).toFixed(2)), units: 'UTF-8 bytes, not tokens; includes names/envelope for the combined measurement.' };
  await save('catalog-measurement.json', measurement);
  console.log(JSON.stringify(measurement));
  if (!process.argv.includes('--agent-eval')) return;

  for (const profile of ['legacy', 'twelve'] as const) {
    const prompt = 'You are choosing the next KANVAS tool call for independent synthetic scenarios. Do not execute tools. Each scenario has the necessary state and human authorization already provided; do not invent more permissions. Return ONLY JSON {"answers":[{"id":"scenario-id","calls":[{"name":"listed-tool","arguments":{...}}]}]}. Choose the minimal correct call(s), preserving literal text and precision. Do not propose code or explanatory prose.\n\nServer instructions:\n' + profileInstructions(profile) + '\n\nAvailable tools:\n' + JSON.stringify(listToolDefinitions(profile)) + '\n\nIndependent scenarios:\n' + JSON.stringify(tasks.map(({ id, goal }) => ({ id, goal })));
    await writeFile(join(directory, `selection-${profile}-prompt.txt`), prompt, { mode: 0o600 });
    const started = performance.now();
    const { stdout } = await invoke('openclaw', ['infer', 'model', 'run', '--gateway', '--agent', 'main', '--model', MODEL, '--thinking', REASONING, '--prompt', prompt, '--json'], { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 });
    const receipt = JSON.parse(stdout.trim()) as { ok?: boolean; provider?: string; model?: string; outputs?: { text?: string }[]; usage?: unknown };
    if (receipt.ok !== true || receipt.provider !== 'openai' || ![MODEL, 'gpt-6-astra'].includes(receipt.model ?? '')) throw new Error('Expected Astra-only successful Gateway receipt.');
    const output = receipt.outputs?.map(item => item.text ?? '').join('\n').trim() ?? '';
    const decoded = JSON.parse(output.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')) as { answers?: { id: string; calls: { name: string; arguments: Record<string, unknown> }[] }[] };
    if (!Array.isArray(decoded.answers)) throw new Error('Selection response did not contain answers.');
    const results = tasks.map(task => {
      const answers = decoded.answers!.filter(answer => answer.id === task.id);
      const calls = answers.length === 1 && Array.isArray(answers[0].calls) ? answers[0].calls : [];
      const resolved = calls.map(call => resolveToolCall(profile, call.name, call.arguments));
      const exactRoute = resolved.length === 1 && !resolved[0].error && resolved[0].canonicalName === task.canonical;
      const args = resolved[0]?.args;
      const sourcePreserved = task.id !== 'source' || args?.json === '[{"amount":1.2300},{"amount":9007199254740993}]';
      const recordPreserved = task.id !== 'ack' || args?.interactionId === 'interaction-id';
      return { id: task.id, correct: exactRoute && sourcePreserved && recordPreserved, invalidCalls: resolved.filter(value => value.error).length, extraCalls: Math.max(0, calls.length - 1), selected: resolved.map(value => value.canonicalName ?? 'unresolved') };
    });
    const report = { profile: profile as McpProfile, model: receipt.model, provider: receipt.provider, reasoning: REASONING, completedAt: new Date().toISOString(), requestLatencyMs: Math.round(performance.now() - started), promptSha256: digest(prompt), promptUtf8Bytes: Buffer.byteLength(prompt), usage: receipt.usage, totals: { scenarios: tasks.length, correct: results.filter(result => result.correct).length, invalidCalls: results.reduce((sum, result) => sum + result.invalidCalls, 0), extraCalls: results.reduce((sum, result) => sum + result.extraCalls, 0) }, results, answers: decoded.answers, scope: 'One-shot next-call selection only. No host approval, discovery turn, execution or complete-conversation latency measured. Separate real transport/domain/browser tests verify execution.' };
    await save(`selection-${profile}.json`, report);
    console.log(JSON.stringify({ profile, model: report.model, totals: report.totals, requestLatencyMs: report.requestLatencyMs }));
  }
}

main().catch(error => { console.error(JSON.stringify({ status: 'failed', reason: error instanceof SyntaxError ? 'UNEXPECTED_JSON' : error instanceof Error && ['Expected Astra-only successful Gateway receipt.', 'Selection response did not contain answers.', 'Only --agent-eval is supported.'].includes(error.message) ? error.message : 'CATALOG_PROBE_FAILED' })); process.exitCode = 1; });
