import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { z } from 'zod';
import { validateView } from '../../src/shared/view-schemas.js';
import { viewSchema } from '../../src/shared/view-schemas.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { NOT_A_SLIDE } from '../../src/shared/view-schemas.js';
import { compactSchemaReferences } from '../../src/shared/json-schema.js';
import { MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { publishInputSchema } from '../../src/shared/publish-input.js';
import { samples } from '../../src/shared/template-examples.js';
import { splitGrid } from '../../src/shared/split-screen.js';
import { splitLeaves } from '../../src/shared/split-screen.js';
import { splitDivider } from '../../src/shared/split-screen.js';
import { SPLIT_LIMITS } from '../../src/shared/split-screen.js';
import { redactStreamAddress } from '../../src/shared/monitor-stream-view.js';
import { streamRows } from '../../src/shared/monitor-stream-view.js';
import { formatDuration } from '../../src/shared/monitor-stream-view.js';
import type { StreamViewEvent } from '../../src/shared/monitor-stream-view.js';
import { boundStreamIds } from '../../src/server/monitor-streams.js';
import { STREAM_WAIT_MS } from '../../src/server/monitor-streams.js';
import { pointingSummary } from '../../src/shared/pointing.js';
import { POINTER_FADE_MS } from '../../src/shared/pointing.js';
import { POINTER_PIN_MS } from '../../src/shared/pointing.js';
import { POINTING_QUEUE } from '../../src/shared/pointing.js';
import { POINTING_BLOCK_EVENTS } from '../../src/shared/pointing.js';
import { applyResponsePolicy } from '../../src/server/mcp/response-policy.js';
import { ContactLedger } from '../../src/server/mcp/response-policy.js';
import { BOARD_DISCLOSURE } from '../../src/shared/message-board.js';
import { BOARD_LIMITS } from '../../src/shared/message-board.js';
import { parseIconId } from '../../src/shared/pickers.js';
import { isPickerIconUrl } from '../../src/shared/pickers.js';
import { iconUrl } from '../../src/shared/pickers.js';
import { iconPickerDataSchema } from '../../src/shared/pickers.js';
import { fontPickerDataSchema } from '../../src/shared/pickers.js';
import { projectTasks } from '../../src/shared/task-list.js';
import { taskCustomColumns } from '../../src/shared/task-list.js';
import { isBuiltinTaskColumn } from '../../src/shared/task-list.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { textScale } from '../../src/shared/reading.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
import { sharingLevel } from '../../src/server/account-overview.js';
import { HELP_PAGES as HELP } from '../../src/shared/help.js';
import { HELP_TOPICS } from '../../src/shared/help.js';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { visualHelp } from '../../src/server/visual-help';
import { parseCanonicalArguments } from '../../src/server/mcp/canonical';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical';
import { KEYBOARD_SHORTCUTS } from '../../src/shared/keyboard-shortcuts';

describe("help coverage 1", () => {

const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe("help contracts",()=>{
 it('ee486423: help describes what the server does now',()=>{
  const guidance=JSON.stringify(HELP['agent-guidance']);
  expect(guidance).toMatch(/unchanged:true/);expect(guidance).toMatch(/clientDetails\.guidance/);expect(guidance).not.toMatch(/Every authorized MCP tool response[^.]*carries agentGuidance/);
  expect(JSON.stringify(displayGuidance('split-screen'))).toMatch(/1-4 rows by 1-4 columns/);expect(JSON.stringify(displayGuidance('split-screen'))).not.toMatch(/Two, four or six|selectable panes/);
  expect(HELP_TOPICS).toContain('message-board');expect(JSON.stringify(HELP['message-board'])).toMatch(/PUBLIC/);
  expect(JSON.stringify(HELP['shared-pointing'])).toMatch(/on in every session/i);expect(JSON.stringify(HELP['monitor-streams'])).toMatch(/monitor-stream template/);
  expect(templateViewSchema('monitor-stream')).toBeTruthy();expect(templateViewSchema('message-board')).toBeTruthy();
 });});
});

describe("help coverage 2", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('publishes one complete maintained hotkey template, not fourteen fact pages',()=>{
 const help=visualHelp({topic:'keyboard-shortcuts'});expect(help.pageCount).toBe(1);expect(help.view.template).toBe('keyboard-shortcuts');expect(KEYBOARD_SHORTCUTS).toHaveLength(13);expect(()=>visualHelp({topic:'keyboard-shortcuts',page:1})).toThrow();
});
function worker(clients:any){const events:Record<string,Function>={};const registration={showNotification:vi.fn()};runInNewContext(readFileSync('public/sw.js','utf8'),{URL,self:{location:{origin:'https://kanvas.test'},clients,registration,addEventListener:(name:string,fn:Function)=>events[name]=fn}});return {events,registration};}
});
