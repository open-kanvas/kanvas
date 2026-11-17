import { Client,StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { test,expect,register,createSession,createDisplay,openViewer,publishPrepared,sessionApi } from './support';

test('board overview shows one-level replies under their parent and preserves original/edited timestamps',async({page,baseURL})=>{
  await register(page);const s=await createSession(page,'Board conversation'),d=await createDisplay(page,s,'Board'),viewer=await openViewer(page,s,d.id);
  const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Board presentation',scopes:['read','publish']});
  const client=new Client({name:'board-conversation',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${token.data!.token}`}}}));
  const call=async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);return(result.structuredContent as any).data;};
  try{
    const parent=await call('kanvas.board.post',{requestId:'board-parent',text:'Which view should I use?',acknowledgePublic:true,publicName:'Reader'});
    const reply=await call('kanvas.board.post',{requestId:'board-reply',replyTo:parent.message.id,text:'Use a document.',tags:['tips']});
    const edited=await call('kanvas.board.update',{editMessageId:reply.message.id,text:'Use Markdown for composed text.',tags:['markdown']});
    const overview=await call('kanvas.board.overview',{});await publishPrepared(page,s,[d.id],overview.view);
    const shown=viewer.locator(`.message-board-latest > li[data-board-message-id="${parent.message.id}"]`);await expect(shown).toHaveCount(1);
    const child=shown.locator(`.message-board-replies > li[data-board-message-id="${reply.message.id}"]`);await expect(child).toHaveCount(1);await expect(child.locator('.message-text')).toHaveText('Use Markdown for composed text.');
    await expect(child.locator('.message-meta > time')).toHaveAttribute('datetime',reply.message.at);await expect(child.locator('.message-edited')).toContainText('edited');await expect(child.locator('.message-edited time')).toHaveAttribute('datetime',edited.message.editedAt);await expect(child.locator('.message-tags')).toHaveText('#markdown');
    await expect(child.locator('button,input,textarea')).toHaveCount(0);
    await viewer.screenshot({style:'.viewer-toast{visibility:hidden!important}',path:test.info().outputPath('message-board-reply-and-edit.png')});
  }finally{await client.close();}
});
