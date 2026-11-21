import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { test } from './support';
import { waitForDisplay } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { gameExample } from '../../src/shared/game';
import { emailRuntime } from './email-oauth-fixture';
import { beginEmailConnector } from './email-oauth-fixture';

test.describe("database schema coverage 1", () => {

const quiet=async(page:Page)=>{for(const button of await page.locator('.viewer-toast button').all())await button.click();};
const fact=(text:string)=>({version:1 as const,template:'fact' as const,data:{text}});

test('database schema shows every column, linked relationship kind, and readable phone width',async({page},info)=>{
 await register(page);const s=await createSession(page,'Schema session'),d=await createDisplay(page,s,'Schema display'),viewer=await openViewer(page,s,d.id);
 const columns=Array.from({length:14},(_,i)=>({schema:'public',table:'events',column:'field_'+i,type:'timestamp with time zone',nullable:i>0,primaryKey:i===0}));columns.push({schema:'public',table:'users',column:'id',type:'uuid',nullable:false,primaryKey:true});
 await publishPrepared(page,s,[d.id],validateView({template:'database-schema',data:{columns,relationships:[{from:{schema:'public',table:'events',column:'field_1'},to:{schema:'public',table:'users',column:'id'},kind:'inferred'},{from:{schema:'public',table:'events',column:'field_2'},to:{schema:'public',table:'users',column:'id'},kind:'declared'}]}}));
 const root=viewer.locator('.viewer-candidate .database-schema');await expect(root.locator('[data-schema-column]')).toHaveCount(15);await expect(root.locator('.database-schema-relationships')).toContainText('inferred');await expect(root.locator('.database-schema-relationships')).toContainText('declared');await root.getByRole('link',{name:'events.field_1',exact:true}).click();await expect(root.locator('tr:target')).toContainText('field_1');const widths=await root.evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));expect(widths.scroll).toBeLessThanOrEqual(widths.client+2);await quiet(viewer);await viewer.screenshot({path:info.outputPath('database-schema.png')});
});
});
