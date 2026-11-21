import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { z } from 'zod';
import { gameDataSchema } from '../../src/shared/game.js';
import { createApp } from '../../src/server/app.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { eventContext } from '../../src/server/raw-events.js';
import { denied } from './harness.js';
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

describe("source preservation coverage 1", () => {


describe("source preservation contracts",()=>{
 let h!:Harness,owner:Browser,sessionId:string,displayId:string;
 beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;});
 afterEach(async()=>{await h?.close();});
 it('retains more than the former 6 MiB budget without archiving or truncating exact sources',async()=>{
  const display=await h.runtime.service.display({userId:owner.user!.id},sessionId,displayId);
  const source='x'.repeat(100000),view=validateView({template:'code',data:{kind:'diff',before:source,after:source}});
  for(let i=0;i<35;i++){display.revision++;display.view=view;await h.runtime.service.history.record(display,'publication');}
  const rows=(await h.runtime.store.list<any>('display-history',sessionId,true)).filter(e=>e.view);
  expect(rows.length).toBe(35);expect(Buffer.byteLength(JSON.stringify(rows))).toBeGreaterThan(6*1024*1024);
  expect(rows.every(e=>!e.archivedAt&&e.view.data.before===source&&e.view.data.after===source)).toBe(true);
  expect((await h.runtime.service.history.list(display)).entries.filter(e=>e.template)).toHaveLength(35);
 });});
});

describe("source preservation coverage 2", () => {

const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe('5134662f / 3f65409f: the source footer and its fields are gone',()=>{
 it('rejects source and showSource on every view, with no compatibility path',()=>{
  expect(()=>validateView({version:1,template:'fact',data:{text:'x'},source:{title:'Somewhere'}})).toThrow();
  expect(()=>validateView({version:1,template:'fact',data:{text:'x'},showSource:true})).toThrow();
  expect(()=>validateView({version:1,template:'presentation',data:{slides:[{version:1,template:'fact',data:{text:'x'},source:{title:'s'}}]}})).toThrow();
  expect(()=>validateView(split({panes:[pane('a'),{id:'b',view:{version:1,template:'fact',data:{text:'x'},showSource:true}}]}))).toThrow();
  expect(publishInputSchema.safeParse({requestId:'r',data:'x',source:{title:'s'}}).success).toBe(false);
  expect(publishInputSchema.safeParse({requestId:'r',view:{version:1,template:'fact',data:{text:'x'},showSource:true}}).success).toBe(false);
  expect(()=>validateView({version:1,template:'image-gallery',data:{images:[{url:'https://example.com/a.png',showSource:true,source:{title:'s'}}]}})).toThrow();
 });
 it('no example, schema or guidance still mentions the fields',()=>{
  for(const [template,view] of Object.entries(samples)){expect(Object.hasOwn(view as object,'source'),template).toBe(false);expect(Object.hasOwn(view as object,'showSource'),template).toBe(false);expect(validateView(view).template,template).toBe(template);}
  expect(JSON.stringify(viewSchema.description)).not.toMatch(/showSource|\bsource and\b/);
  for(const template of TEMPLATE_IDS)expect(JSON.stringify(displayGuidance(template)??''),template).not.toMatch(/showSource/);
  expect(JSON.stringify(HELP)).not.toMatch(/showSource/);
 });});
});
