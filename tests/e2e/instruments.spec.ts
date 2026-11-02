import {randomUUID} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {operationRequest} from '../mcp/requests.js';
import {createDisplay,createSession,expect,openViewer,publishPrepared,register,sessionApi,test,waitForDisplay} from './support';
test('keyboard/fretted stable updates and one local scale schedule reach the receiver',async({page,baseURL},info)=>{
 await register(page);const sessionId=await createSession(page,'Instruments'),display=await createDisplay(page,sessionId,'Music screen'),viewer=await openViewer(page,sessionId,display.id);
 const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Instruments test',scopes:['read','publish']});expect(issued.status).toBe(201);
 const client=new Client({name:'instruments-test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));
 const read=async()=>{const r=await client.callTool(operationRequest({name:'kanvas_inspect',arguments:{operation:'display.current',sessionId,displayId:display.id}}));expect(r.isError).not.toBe(true);return (r.structuredContent as any).data;};
 const patch=async(operations:unknown[])=>{const current=await read();const r=await client.callTool(operationRequest({name:'kanvas_publish',arguments:{operation:'patch',sessionId,displayId:display.id,expectedRevision:current.revision,requestId:randomUUID(),operations}}));expect(r.isError,JSON.stringify(r)).not.toBe(true);await waitForDisplay(page,sessionId,display.id,d=>d.appliedRevision===d.revision);};
 const notes=(values:[number,string][])=>Object.fromEntries(values.map(([midi,label])=>[`key:${midi}`,{highlight:true,pitch:{midi,label}}]));
 try {
 const config={family:'keyboard',firstMidi:60,lastMidi:83};await publishPrepared(page,sessionId,[display.id],{version:1,template:'instrument',data:{config,label:'Cm7',elements:notes([[60,'C4'],[63,'Eb4'],[67,'G4'],[70,'Bb4']])}});
 const visual=viewer.locator('.instrument-visual');await expect(visual.locator('[data-highlight=true]')).toHaveCount(4);await expect(visual.locator('[data-element-id="key:63"] text')).toHaveText('Eb4');
 // DOM node identity survives a narrow element update, not reconstructed ad-hoc HTML.
 await visual.locator('[data-element-id="key:60"]').evaluate(el=>{(el as any).identityMarker='retained';});
 await patch([{op:'instrument',label:'E major',changes:[...[60,63,67,70].map(m=>({id:`key:${m}`,value:null})),...Object.entries(notes([[64,'E4'],[68,'G#4'],[71,'B4']])).map(([id,value])=>({id,value}))]}]);
 await expect(visual.locator('[data-highlight=true]')).toHaveCount(3);expect((await read()).view.data.config).toEqual(config);expect(await visual.locator('[data-element-id="key:60"]').evaluate(el=>(el as any).identityMarker)).toBe('retained');await viewer.screenshot({path:info.outputPath('keyboard-e-major.png')});
 await patch([{op:'instrument-sequence',action:'replace',frames:[{id:'c',durationMs:1000,elements:notes([[60,'C4']])},{id:'d',durationMs:4000,elements:notes([[62,'D4']])}]},{op:'instrument-sequence',action:'resume'}]);await expect(visual).toHaveAttribute('data-active-frame','d');await expect(visual.locator('[data-element-id="key:62"]')).toHaveAttribute('data-highlight','true');
 await patch([{op:'instrument-sequence',action:'pause'}]);await viewer.reload();await expect(visual).toHaveAttribute('data-active-frame','d');await patch([{op:'instrument-sequence',action:'clear'}]);await expect(visual.locator('[data-element-id="key:62"]')).toHaveAttribute('data-highlight','true');
 const tuning:[[number,string],[number,string],[number,string],[number,string],[number,string],[number,string]]=[[40,'E2'],[45,'A2'],[50,'D3'],[55,'G3'],[59,'B3'],[64,'E4']];
 const strings=tuning.map(([midi,label],i)=>({id:`s${i}`,label,openPitch:{midi,label}}));
 await publishPrepared(page,sessionId,[display.id],{version:1,template:'instrument',data:{label:'E major — supplied fingering',config:{family:'fretted',strings,firstFret:0,fretCount:5,capo:0},elements:Object.fromEntries([0,2,2,1,0,0].map((fret,i)=>[`string:s${i}:fret:${fret}`,{highlight:true,finger:String([0,2,3,1,0,0][i])}]))}});
 await expect(viewer.getByRole('region',{name:'Fretted-string visualization'})).toBeVisible();await expect(visual.locator('[data-highlight=true]')).toHaveCount(6);await expect(visual.locator('[data-element-id="string:s0:fret:0"] circle')).toBeVisible();await viewer.screenshot({path:info.outputPath('guitar-e-major.png')});
 } finally {await client.close();}
});
