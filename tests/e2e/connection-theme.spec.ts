import {mkdir} from 'node:fs/promises';
import type {Locator,Page} from '@playwright/test';
import {test,expect,register,login,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi,sessionDetail,isolatedContext} from './support';

// Measure the actual browser colours, including translucent foregrounds,
// background layers and ancestor opacity. This catches readable-looking DOM
// that nevertheless paints near-white text on the light receiving surface.
async function readable(locator:Locator){
  await expect.poll(async()=>locator.evaluateAll(elements=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d')!;
    const rgba=(colour:string)=>{context.clearRect(0,0,1,1);context.fillStyle=colour;context.fillRect(0,0,1,1);const p=context.getImageData(0,0,1,1).data;return [p[0],p[1],p[2],p[3]/255];};
    const over=(front:number[],back:number[])=>front.slice(0,3).map((c,i)=>c*front[3]+back[i]*(1-front[3]));
    const light=(rgb:number[])=>rgb.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    if(!elements.length)return 0;
    return Math.min(...elements.map(element=>{
      const ancestors:Element[]=[];for(let e:Element|null=element;e;e=e.parentElement)ancestors.unshift(e);
      let background=[255,255,255],opacity=1;
      for(const e of ancestors){const style=getComputedStyle(e);background=over(rgba(style.backgroundColor),background);opacity*=Number(style.opacity);}
      const foreground=rgba(getComputedStyle(element).color);foreground[3]*=opacity;
      const a=light(over(foreground,background)),b=light(background);
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    }));
  }),{message:'Visible JSON/topology labels must maintain 4.5:1 contrast against the receiving theme'}).toBeGreaterThanOrEqual(4.5);
}

async function capture(page:Page,path:string){
  const notifications=page.getByRole('button',{name:/^Dismiss notification(?::|$)/});
  while(await notifications.count())await notifications.first().click();
  await expect(notifications).toHaveCount(0);
  await page.screenshot({path,animations:'disabled'});
}

test('JSON and topology remain readable in light and dark receiving themes and long map labels fit the phone',async({page,browser,baseURL,diagnostics},info)=>{
  const account=await register(page),s=await createSession(page,'Receiving theme contrast'),d=await createDisplay(page,s,'Theme verification');
  const changed=await page.evaluate(async()=>{
    const me=(await(await fetch('/api/auth/me')).json()).data,profile=(await(await fetch('/api/profile')).json()).data;
    const response=await fetch('/api/profile',{method:'PATCH',headers:{'Content-Type':'application/json','X-Kanvas-CSRF':me.csrfToken},body:JSON.stringify({expectedRevision:profile.revision,displayName:'A shared participant with a deliberately long display name'})});return response.status;
  });expect(changed).toBe(200);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGOQLLv0H4QZYAwAT3YJgeciwUwAAAAASUVORK5CYII=','base64');
  const remote=await isolatedContext(browser,info,baseURL!);
  try{
    await page.context().route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/png',body:png}));
    await remote.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/png',body:png}));
    await remote.setExtraHTTPHeaders({'x-forwarded-for':'8.8.8.8'});
    const located=await remote.newPage();diagnostics.watch(located);await login(located,account);await located.goto('/view/'+s+'/'+d.id);
    const v=await openViewer(page,s,d.id);diagnostics.watch(v);
    const folder=info.outputPath('visuals');await mkdir(folder,{recursive:true});
    for(const theme of ['light','dark'] as const){
      const detail=await sessionDetail(page,s);
      expect((await sessionApi(page,'/api/sessions/'+s+'/config','PATCH',{expectedRevision:detail.session.configRevision,config:{theme}})).status).toBe(200);
      await publishPrepared(page,s,[d.id],{version:1,template:'json',data:{json:'{"exact":9007199254740993.001,"text":"Readable source","enabled":true,"empty":null}',view:'tree',expandedDepth:2}});
      const jsonDisplay=await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);
      await expect(v.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
      await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(jsonDisplay.revision));
      await expect(v.locator('.viewer-shell')).toHaveClass(new RegExp('theme-'+theme));
      await readable(v.locator('.json-key,.json-value,.json-separator'));
      // 2026-11-10 (06ee64d1): raw text is now the default JSON view; both views must be readable in both themes.
      await publishPrepared(page,s,[d.id],{version:1,template:'json',data:{json:'{"exact":9007199254740993.001,"text":"Readable source","enabled":true,"empty":null}'}});
      const rawDisplay=await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>jsonDisplay.revision);
      await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(rawDisplay.revision));
      await expect(v.locator('.json-raw')).toContainText('9007199254740993.001');
      await readable(v.locator('.json-raw li code,.json-raw li code span'));
      await capture(v,folder+'/'+info.project.name+'-'+theme+'-json.png');
      await publishPrepared(page,s,[d.id],{version:1,template:'session-topology',data:{layout:'map',includeLocation:true,expectedCountries:['NO']}});
      const mapDisplay=await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);
      await expect(v.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
      await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(mapDisplay.revision));
      await expect(v.locator('.topology-map-people .is-outlier')).toHaveCount(1);
      await readable(v.locator('.topology-counts strong,.topology-counts small,.topology-controls button,.topology-map-people h3,.topology-map-people p,.topology-map-people strong,.topology-map-people small,.topology-map-people>div>span,.topology-footnote span'));
      await expect.poll(()=>v.locator('.viewer-candidate .topology-map').evaluate(element=>{
        const map=element.getBoundingClientRect(),labels=[...element.querySelectorAll('.leaflet-tooltip')].filter(label=>label.getClientRects().length&&getComputedStyle(label).visibility!=='hidden');
        return labels.length>0&&labels.every(label=>{const box=label.getBoundingClientRect();return box.height>0&&box.height<=Math.min(120,map.height/2)&&box.width>0&&box.width<=map.width-16&&box.x>=map.x&&box.right<=map.right&&box.y>=map.y&&box.bottom<=map.bottom;});
      }),{message:'Every visible map label fits without narrow-column wrapping on this receiving browser'}).toBe(true);
      await capture(v,folder+'/'+info.project.name+'-'+theme+'-map.png');
      await publishPrepared(page,s,[d.id],{version:1,template:'session-topology',data:{layout:'connections',groupBy:'all',includeLocation:true}});await expect(v.locator('.topology-window')).toHaveCount(2);
      await readable(v.locator('.topology-person h2,.topology-person>header>div>span,.topology-device h3,.topology-device>header>div>span,.topology-window strong,.topology-window-detail span,.topology-window time,.topology-location,.topology-outlier,.topology-connection-state'));
      await capture(v,folder+'/'+info.project.name+'-'+theme+'-connections.png');
    }
  }finally{await remote.close();}
});
