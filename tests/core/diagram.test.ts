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
import { PNG } from './harness.js';
import { createApp } from '../../src/server/app.js';
import { validateMedia } from '../../src/server/rendering/media.js';
import { normalizedScroll } from '../../src/client/renderers/Navigation.js';
import { navigationCapabilities } from '../../src/shared/navigation.js';

describe("diagram coverage 1", () => {

const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe("diagram contracts",()=>{
 it('363457fe: fit is a state the diagram honours until someone zooms or scrolls again',()=>{
  const view={version:1,template:'architecture',data:{textScale:1.5,nodes:[{id:'a',label:'API'},{id:'b',label:'DB'}],edges:[{from:'a',to:'b'}]}} as ViewSpec;
  const fitted=navigate(view,{...initialNavigation(view),scale:2,scroll:{x:1,y:0}},{action:'fit'});
  expect(fitted).toMatchObject({fit:true,scroll:{x:0,y:0}});expect(fitted.scale).toBeUndefined();
  expect(navigate(view,fitted,{action:'zoom',scale:1.5}).fit).toBeUndefined();expect(navigate(view,fitted,{action:'scroll',x:1}).fit).toBeUndefined();
  expect(navigate(view,fitted,{action:'highlight',text:'API'}).fit).toBe(true);expect(navigate(view,fitted,{action:'reset'}).fit).toBeUndefined();
 });});
});

describe("diagram coverage 2", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});const id=()=>randomUUID();
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient></defs><rect width="100" height="60" fill="url(#g)"/><text x="4" y="30">Team &amp; Friends</text></svg>';
it('supports logos, uncropped gallery navigation and a whiteboard background through protected/public asset projection',async()=>{
  h=await startHarness();const owner=await h.account(),s=await owner.session(),d=await owner.display(s.id),asset=success(await owner.request<any>('POST',`/api/sessions/${s.id}/assets`,{name:'logo.svg',mimeType:'image/svg+xml',base64:Buffer.from(svg).toString('base64')}));
  for(const view of [
    {version:1,template:'scoreboard',data:{sides:[{id:'a',name:'A',score:2,logo:{url:asset.url}},{id:'b',name:'B',score:'Advantage',logo:{url:asset.url}}]}},
    {version:1,template:'standings',data:{columns:[{id:'p',label:'Points'}],groups:[{id:'g',rows:[{id:'a',name:'A',position:1,logo:{url:asset.url},values:{p:'9007199254740993'}}]}]}},
    {version:1,template:'image-gallery',data:{mode:'carousel',images:[{url:asset.url},{url:asset.url,caption:'Opt-in',showCaption:true}]}},
    {version:1,template:'whiteboard',data:{background:{url:asset.url},elements:[]}},
  ])expect((await owner.submit(s.id,[d.id],validateView(view))).update.status).toBe('prepared');
  const view=validateView({version:1,template:'image-gallery',data:{mode:'carousel',images:[{url:asset.url},{url:asset.url}]}});expect(navigationCapabilities(view).pageCount).toBe(2);expect(navigate(view,initialNavigation(view),{action:'page',direction:'next'}).page).toBe(1);
  success(await owner.request('POST',`/api/sessions/${s.id}/public-access`,{enabled:true,expectedRevision:0,confirm:true}));const anon=h.browser(),publicView=success(await anon.request<any>('GET',`/api/public/sessions/${s.id}`));expect(publicView.displays[0].view.data.background.url).toMatch(/^\/api\/public\/sessions/);expect((await anon.raw(publicView.displays[0].view.data.background.url)).status).toBe(200);denied(await anon.request('GET',asset.url),[401,403]);
});
});
