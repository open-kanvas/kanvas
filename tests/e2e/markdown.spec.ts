import { Client,StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi } from './support';

test('standard CommonMark/GFM renders with native reading/theme sizing while plain-text templates stay literal',async({page,baseURL})=>{
  await register(page);const s=await createSession(page,'Markdown reading'),d=await createDisplay(page,s,'Reader'),viewer=await openViewer(page,s,d.id);
  const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Markdown sizing',scopes:['read','publish']});
  const client=new Client({name:'markdown-reading',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${token.data!.token}`}}}));
  const text='# Reading\n\n**Bold** and *italic*, ~~obsolete~~ and `kanvas.board.read`.\n\n- Bullet\n- [x] Finished\n- [ ] Pending\n\n1. First\n2. Second\n\n> A quoted observation.\n\n---\n\n[Documentation](https://example.com/docs)\n\n| Name | Value |\n| --- | --- |\n| Alpha | 42 |\n\n```typescript\nconst total = 42;\nconsole.log(total);\n```\n\n<script>window.markdownExecuted=true</script>\n\n[Unsafe](javascript:alert(1))\n\n'+Array.from({length:18},(_,i)=>`Paragraph ${i+1}: composed text remains in its natural reading flow.`).join('\n\n');
  try{
    await publishPrepared(page,s,[d.id],{version:1,template:'markdown',data:{text}});
    const current=await waitForDisplay(page,s,d.id,x=>x.view?.template==='markdown'&&x.appliedRevision===x.revision);
    await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));
    const article=viewer.locator('.markdown-article'),reader=viewer.getByRole('region',{name:'Markdown reader'});
    await expect(article.locator('h1')).toHaveText('Reading');await expect(article.locator('strong')).toHaveText('Bold');await expect(article.locator('em')).toHaveText('italic');await expect(article.locator('del')).toHaveText('obsolete');
    await expect(article.locator('code').first()).toHaveText('kanvas.board.read');await expect(article.locator('pre code.language-typescript')).toContainText('const total = 42;');
    expect(await article.locator('pre .hljs-keyword').count()).toBeGreaterThan(0);
    await expect(article.locator('blockquote')).toContainText('A quoted observation.');await expect(article.locator('hr')).toHaveCount(1);await expect(article.locator('ol > li')).toHaveCount(2);
    await expect(article.locator('table')).toContainText('Alpha');await expect(article.locator('input[type=checkbox]')).toHaveCount(2);await expect(article.locator('input[type=checkbox]').first()).toBeChecked();await expect(article.locator('input[type=checkbox]').first()).toBeDisabled();
    await expect(article.getByRole('link',{name:'Documentation'})).toHaveAttribute('href','https://example.com/docs');
    await expect(article.locator('script')).toHaveCount(0);expect(await viewer.evaluate(()=>Object.hasOwn(window,'markdownExecuted'))).toBe(false);
    expect(await article.getByText('Unsafe',{exact:true}).getAttribute('href')).not.toMatch(/^javascript:/);
    const before=await article.locator('p').first().evaluate(el=>el.getBoundingClientRect().height);
    const result=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.config.update',arguments:{sessionId:s,config:{textSize:150,theme:'light'}}}});expect(result.isError).not.toBe(true);
    await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-scale','1.5');
    await expect.poll(()=>article.locator('p').first().evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(before*1.35);
    expect(await reader.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await reader.evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
    for(const template of ['fact','document'] as const){await publishPrepared(page,s,[d.id],{version:1,template,data:{text:'**literal** and `literal code`'}});await expect(viewer.locator('.viewer-candidate')).toContainText('**literal** and `literal code`');await expect(viewer.locator('.viewer-candidate .markdown-article')).toHaveCount(0);}
  }finally{await client.close();}
});
