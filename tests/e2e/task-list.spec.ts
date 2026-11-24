import type { Page } from '@playwright/test';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { test } from './support';
import { waitForDisplay } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { operationId } from '../../src/server/mcp/operations';
import type { ViewSpec } from '../../src/shared/types';

test.describe("task list coverage 1", () => {
    const view = (template: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => validateView({ version: 1, template, data, ...extra } as never) as ViewSpec;
    const shown = async (page: Page, viewer: Page, s: string, displayId: string, spec: ViewSpec) => { await publishPrepared(page, s, [displayId], spec); const current = await waitForDisplay(page, s, displayId, x => x.revision > 0 && x.appliedRevision === x.revision); await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(current.revision)); return current; };
    const setup = async (page: Page, name: string) => { await register(page); const s = await createSession(page, name), d = await createDisplay(page, s, 'Display'), viewer = await openViewer(page, s, d.id); return { s, d, viewer }; };
    const mcp = async (page: Page, baseURL: string) => { const token = await sessionApi<{
        token: string;
    }>(page, '/api/tokens', 'POST', { name: 'Nov14 fixture', scopes: ['read', 'publish'] }); const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client'); const client = new Client({ name: 'nov14-fixture', version: '1' }); await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers: { Authorization: 'Bearer ' + token.data!.token } } })); return client; };
    const use = async (client: Awaited<ReturnType<typeof mcp>>, canonical: string, args: Record<string, unknown>) => { const result = await client.callTool({ name: 'kanvas_call', arguments: { operationId: operationId(canonical), arguments: args } }); return { isError: result.isError === true, structured: result.structuredContent as Record<string, any> }; };
    const fact = (text: string) => ({ version: 1, template: 'fact', data: { text } });
    const pane = (id: string, inner: Record<string, unknown> = fact(id)) => ({ id, view: inner });
    const pie = (kind: 'pie' | 'donut') => ({ version: 1, template: 'chart', data: { kind, series: [{ name: 'Share', points: [{ x: 'Alpha', y: 40 }, { x: 'Beta', y: 30 }, { x: 'Gamma', y: 20 }, { x: 'Delta', y: 10 }] }] } });
    test('checked tasks stay in place and the highlighted task is kept in view (08d22167, 1c0ebe3f)', async ({ page, baseURL }) => {
        const { s, d, viewer } = await setup(page, 'Task order');
        const client = await mcp(page, baseURL!);
        try {
            await shown(page, viewer, s, d.id, view('task-list', { columns: [{ key: 'number', label: '#' }, { key: 'item', label: 'Item' }, { key: 'status', label: 'Status' }, { key: 'tags', label: 'Tags' }, { key: 'owner', label: 'Owner' }], items: Array.from({ length: 30 }, (_, i) => ({ title: `Task ${i + 1}`, status: 'untested', tags: ['t'] })) }));
            const rows = viewer.locator('.viewer-candidate .task-list tbody tr');
            await expect(rows).toHaveCount(30);
            // Built-in keys add no columns; an own column without values takes no room.
            await expect(viewer.locator('.viewer-candidate .task-list thead th')).toHaveCount(5);
            const lists = (await use(client, "kanvas.tasklist.read", { sessionId: s })).structured.data, taskListId = lists.taskLists[0].id;
            const scroller = viewer.locator('.viewer-candidate .task-list-scroll');
            await use(client, "kanvas.tasklist.update", { sessionId: s, taskListId, requestId: 't-1', check: [1], highlight: 2 });
            await expect(rows.nth(0)).toHaveClass(/is-done/);
            await expect(rows.nth(0)).toHaveAttribute('data-task-number', '1');
            await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');
            expect(await rows.evaluateAll(els => els.map(el => Number((el as HTMLElement).dataset.taskNumber)))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
            // Early in the list nothing scrolls.
            expect(await scroller.evaluate(el => el.scrollTop)).toBeLessThanOrEqual(1);
            await use(client, "kanvas.tasklist.update", { sessionId: s, taskListId, requestId: 't-2', check: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], highlight: 18 });
            await expect(rows.nth(17)).toHaveAttribute('aria-current', 'true');
            await expect.poll(async () => { const frame = (await scroller.boundingBox())!, row = (await rows.nth(17).boundingBox())!; return Math.abs(row.y + row.height / 2 - (frame.y + frame.height / 2)) / frame.height; }).toBeLessThan(.3);
            expect(await rows.evaluateAll(els => els.map(el => Number((el as HTMLElement).dataset.taskNumber)))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
            await expect(rows.nth(16)).toHaveClass(/is-done/);
            const updated = await use(client, "kanvas.tasklist.update", { sessionId: s, taskListId, requestId: 't-3', columns: [{ key: 'number', label: '#' }, { key: 'owner', label: 'Owner' }], items: [{ item: 18, fields: { owner: 'Ada' } }] });
            expect(updated.structured.data.ignoredColumns).toEqual(['number']);
            await expect(viewer.locator('.viewer-candidate .task-list thead th')).toHaveCount(6);
        }
        finally {
            await client.close();
        }
    });
    test('agent disclosure replaces clicked expansion and subtask badges and checkboxes align',async({page,baseURL})=>{
        const {s,d,viewer}=await setup(page,'Task disclosure'),client=await mcp(page,baseURL!);
        try{
            await shown(page,viewer,s,d.id,view('task-list',{highlight:'one',items:[
                {id:'one',title:'First task',subtasks:[{id:'a',title:'Short',status:'todo'},{id:'b',title:'A much longer title which must wrap without shrinking its checkbox',status:'issue'}]},
                {id:'two',title:'Second task',detail:'Second task detail'},
                {id:'three',title:'Third task',detail:'Third task detail'}]}));
            const root=viewer.locator('.viewer-candidate .task-list'),row=(id:string)=>root.locator('tr[data-task-id="'+id+'"]'),toggle=(id:string)=>row(id).locator('.task-detail-toggle');
            await expect(toggle('one')).toHaveAttribute('aria-expanded','true');
            const boxes=await row('one').locator('.task-subtasks .task-box').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,width:r.width,height:r.height};}));
            expect(boxes).toHaveLength(2);expect(Math.abs(boxes[0].width-boxes[1].width)).toBeLessThan(1);expect(Math.abs(boxes[0].x-boxes[1].x)).toBeLessThan(1);expect(Math.abs(boxes[0].width-boxes[0].height)).toBeLessThan(1);
            const badges=await row('one').locator('.task-subtask-heading .task-pill').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().right));expect(Math.abs(badges[0]-badges[1])).toBeLessThan(1);
            const lists=(await use(client,'kanvas.tasklist.read',{sessionId:s})).structured.data,taskListId=lists.taskLists[0].id;
            let revision=0;const update=async(args:Record<string,unknown>)=>{const result=await use(client,'kanvas.tasklist.update',{sessionId:s,taskListId,requestId:'disclosure-'+(++revision),...args});expect(result.isError).toBe(false);};
            await toggle('three').click();await expect(toggle('three')).toHaveAttribute('aria-expanded','true');
            await update({highlight:'two'});await expect(toggle('one')).toHaveAttribute('aria-expanded','false');await expect(toggle('three')).toHaveAttribute('aria-expanded','false');await expect(toggle('two')).toHaveAttribute('aria-expanded','true');
            await update({collapse:['two']});await expect(toggle('two')).toHaveAttribute('aria-expanded','false');
            await update({expand:[1,3]});await expect(toggle('one')).toHaveAttribute('aria-expanded','true');await expect(toggle('three')).toHaveAttribute('aria-expanded','true');
            await update({collapseAll:true});await expect(root.locator('.task-detail-toggle[aria-expanded="true"]')).toHaveCount(0);
            // A repeated collapse is a fresh command even if stored disclosure was already empty.
            await toggle('one').click();await expect(toggle('one')).toHaveAttribute('aria-expanded','true');await update({collapseAll:true});await expect(toggle('one')).toHaveAttribute('aria-expanded','false');
            await update({highlight:'one'});await expect(toggle('one')).toHaveAttribute('aria-expanded','true');
            const shownAgain=await use(client,'kanvas.tasklist.show',{sessionId:s,taskListId,displayId:d.id,requestId:'show-disclosure'});expect(shownAgain.isError).toBe(false);await expect(toggle('one')).toHaveAttribute('aria-expanded','true');await expect(toggle('two')).toHaveAttribute('aria-expanded','false');
        }finally{await client.close();}
    });

    test('expanded bottom tasks fit the viewport and oversized tasks align below the heading',async({page,baseURL},testInfo)=>{
        const {s,d,viewer}=await setup(page,'Expanded tasks'),client=await mcp(page,baseURL!);
        try{
            await shown(page,viewer,s,d.id,view('task-list',{items:Array.from({length:14},(_,i)=>({id:'item-'+(i+1),title:'Task '+(i+1),summary:'A task summary',...(i===12?{detail:'Expanded task detail',subtasks:[{id:'child-a',title:'Unchecked child',checked:false},{id:'child-b',title:'Second child',checked:false}]}:i===13?{detail:Array.from({length:60},(_,n)=>'Detail line '+n).join('\n')}:{} )}))}));
            const root=viewer.locator('.viewer-candidate .task-list'),row=(id:string)=>root.locator('tr[data-task-id="'+id+'"]'),scroll=root.locator('.task-list-scroll');
            const taskListId=(await use(client,'kanvas.tasklist.read',{sessionId:s})).structured.data.taskLists[0].id;
            let revision=0;const update=async(args:Record<string,unknown>)=>{const result=await use(client,'kanvas.tasklist.update',{sessionId:s,taskListId,requestId:'visibility-'+(++revision),...args});expect(result.isError).toBe(false);};
            const geometry=()=>row('item-13').evaluate(el=>{const scroll=el.closest('.task-list-scroll')!,box=scroll.getBoundingClientRect(),r=el.getBoundingClientRect(),header=scroll.querySelector('thead')!.getBoundingClientRect();return {top:r.top,bottom:r.bottom,visibleTop:box.top+header.height,visibleBottom:box.bottom,height:r.height,available:box.height-header.height};});
            await update({highlight:13});
            await expect(row('item-13').locator('.task-detail-toggle')).toHaveAttribute('aria-expanded','true');
            await expect(row('item-13').locator('.task-subtasks>li')).toHaveCount(2);
            await expect.poll(async()=>{const g=await geometry();return g.top>=g.visibleTop-2&&g.bottom<=g.visibleBottom+2;}).toBe(true);
            expect(await scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
            for(const dismiss of await viewer.getByRole('button',{name:'Dismiss notification',exact:true}).all())await dismiss.click();
            await viewer.screenshot({path:testInfo.outputPath('expanded-bottom.png')});
            await update({check:[13]});
            const parentBox=row('item-13').locator(':scope>.task-check>.task-box'),a=row('item-13').locator('[data-subtask-id="child-a"]'),b=row('item-13').locator('[data-subtask-id="child-b"]');
            await expect(parentBox).toHaveText('✓');await expect(a.locator('.task-box')).toHaveAttribute('aria-label','Open');await expect(a.locator('.task-box')).toHaveText('');
            await expect(a.locator('strong')).toHaveCSS('text-decoration-line','none');await expect(a.locator('.task-box')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
            await expect(row('item-13').locator('.task-subtask-progress')).toHaveText('0/2 done');
            await update({subtasks:[{item:13,check:['child-b'],highlight:'child-b'}]});
            await expect(b.locator('.task-box')).toHaveText('✓');await expect(b.locator('strong')).toHaveCSS('text-decoration-line','line-through');await expect(b).toHaveAttribute('aria-current','true');
            expect(await b.locator('.task-box').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(await parentBox.evaluate(el=>getComputedStyle(el).backgroundColor));
            await expect(row('item-13').locator('.task-subtask-progress')).toHaveText('1/2 done');await expect(a.locator('strong')).toHaveCSS('text-decoration-line','none');
            await viewer.screenshot({path:testInfo.outputPath('independent-subtasks.png')});
            await update({uncheck:[13]});await expect(parentBox).toHaveText('');await expect(b.locator('.task-box')).toHaveText('✓');
            await update({highlight:14});
            await expect(row('item-14').locator('.task-detail-toggle')).toHaveAttribute('aria-expanded','true');
            await expect.poll(()=>row('item-14').evaluate(el=>{const scroll=el.closest('.task-list-scroll')!,r=el.getBoundingClientRect(),box=scroll.getBoundingClientRect(),header=scroll.querySelector('thead')!.getBoundingClientRect();return Math.abs(r.top-box.top-header.height);})).toBeLessThan(2);
            const tall=await row('item-14').boundingBox(),frame=await scroll.boundingBox();expect(tall!.height).toBeGreaterThan(frame!.height);
            await viewer.screenshot({path:testInfo.outputPath('oversized-top.png')});
            await scroll.dispatchEvent('wheel',{deltaY:-1000});await scroll.evaluate(el=>el.scrollTop=0);await viewer.waitForTimeout(250);expect(await scroll.evaluate(el=>el.scrollTop)).toBeLessThan(2);
            await update({highlight:2});await expect(row('item-14').locator('.task-detail-toggle')).toHaveAttribute('aria-expanded','false');
        }finally{await client.close();}
    });

    test('manual scroll survives deferred task detail and unrelated updates until an explicit command',async({page,baseURL})=>{
        const {s,d,viewer}=await setup(page,'Deferred task detail'),client=await mcp(page,baseURL!);
        let release=()=>{};
        try{
            await viewer.emulateMedia({reducedMotion:'no-preference'});
            await shown(page,viewer,s,d.id,view('task-list',{highlight:'task-13',expanded:[],items:Array.from({length:14},(_,i)=>({id:'task-'+(i+1),title:'Task '+(i+1),summary:'A row summary',...(i===12?{checked:true,detail:'Deferred detail arrived',subtasks:[{id:'child',title:'Independent unchecked child',checked:false}]}:{})}))}));
            const root=viewer.locator('.viewer-candidate .task-list'),row=root.locator('[data-task-id="task-13"]'),scroll=root.locator('.task-list-scroll');
            const taskListId=(await use(client,'kanvas.tasklist.read',{sessionId:s})).structured.data.taskLists[0].id;
            let revision=0;const update=async(args:Record<string,unknown>)=>{const result=await use(client,'kanvas.tasklist.update',{sessionId:s,taskListId,requestId:'deferred-'+(++revision),...args});expect(result.isError).toBe(false);};
            let requested=false;const held=new Promise<void>(resolve=>{release=resolve;});
            await viewer.route('**/task-items/task-13',async route=>{const response=await route.fetch();requested=true;await held;await route.fulfill({response});});
            await row.locator('.task-detail-toggle').click();
            await expect.poll(()=>requested).toBe(true);
            // User input occurs while the API response is held, not after disclosure settles.
            await scroll.dispatchEvent('wheel',{deltaY:-1000});await scroll.evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));
            release();await expect(row.locator('.task-detail')).toHaveText('Deferred detail arrived');
            await viewer.waitForTimeout(800);expect(await scroll.evaluate(el=>el.scrollTop)).toBeLessThan(2);
            await update({items:[{item:1,status:'updated'}]});
            await expect(row.locator('.task-detail')).toHaveText('Deferred detail arrived');
            await viewer.waitForTimeout(400);expect(await scroll.evaluate(el=>el.scrollTop)).toBeLessThan(2);
            // Even an explicit expansion of the already-highlighted row rearms positioning.
            await update({expand:[13]});await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
            // Interrupt a native smooth scroll through keyboard input; stop at the current position.
            await scroll.dispatchEvent('keydown',{key:'ArrowUp'});await scroll.evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));
            await viewer.waitForTimeout(400);expect(await scroll.evaluate(el=>el.scrollTop)).toBeLessThan(2);
            await update({highlight:2});await update({highlight:13});await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
            // A completed noncurrent parent must not dim its independently open children.
            await update({highlight:2,expand:[13]});await expect(row).not.toHaveClass(/is-current/);
            const child=row.locator('[data-subtask-id="child"]');await expect(child).toBeVisible();
            expect(await child.evaluate(el=>{let opacity=1;for(let node:Element|null=el;node&&!node.classList.contains('task-list');node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);return opacity;})).toBe(1);
            await expect(child.locator('.task-box')).toHaveAttribute('aria-label','Open');await expect(child.locator('strong')).toHaveCSS('text-decoration-line','none');
            await expect(row.locator(':scope>.task-check')).toHaveCSS('opacity','0.5');
        }finally{release();await client.close();}
    });

});
