import type {RequestHandler} from 'express';
import {eventContext} from './raw-events.js';
import {requestContext} from './request-context.js';
/** Never record a URL, query, cookie, authorization header or request body. */
export const eventIngress:RequestHandler=async(req,_res,next)=>{
 const userAgent=(req.get('user-agent')??'').slice(0,500),recognized=await requestContext(req);
 const client:Record<string,unknown>={userAgent,browser:recognized.browser,deviceType:recognized.device,client:req.path.startsWith('/mcp')?'agent':'browser'};
 if(recognized.language)client.language=recognized.language;
 if(recognized.location)client.location=recognized.location;
 const browserVersion=userAgent.match(/(?:Edg(?:e|A|iOS)?|OPR|Firefox|FxiOS|Chrome|CriOS|Version)\/([0-9.]+)/)?.[1];
 if(browserVersion)client.browserVersion=browserVersion;
 const os=userAgent.match(/Windows NT ([0-9.]+)/)||userAgent.match(/(?:CPU (?:iPhone )?OS|Mac OS X) ([0-9_]+)/)||userAgent.match(/Android ([0-9.]+)/);
 if(os){client.os=/Windows/.test(os[0])?'Windows':/Android/.test(os[0])?'Android':/Mac OS X/.test(os[0])?'macOS':'iOS';client.osVersion=os[1].replaceAll('_','.');}else if(/Linux/.test(userAgent))client.os='Linux';
 const model=userAgent.match(/Android [^;]+;\s*([^;)]+?)(?: Build\/[^;)]+)?\)/)?.[1];if(model)client.deviceModel=model.slice(0,120);
 const header=req.get('x-kanvas-client-context');
 if(header&&header.length<=4096)try{const data=JSON.parse(header);for(const key of ['timeZone','language','networkType','clientRelease','platform'])if(typeof data[key]==='string')client[key]=data[key].slice(0,120);for(const key of ['screenWidth','screenHeight','pixelRatio','viewportWidth','viewportHeight'])if(typeof data[key]==='number'&&Number.isFinite(data[key])&&data[key]>=0&&data[key]<=100000)client[key]=data[key];if(Array.isArray(data.languages))client.languages=data.languages.filter((v:unknown)=>typeof v==='string').slice(0,20).map((v:string)=>v.slice(0,40));}catch{/* Invalid self-reported context has no authority. */}
 const referrer=req.get('referer');if(referrer)try{client.referrerOrigin=new URL(referrer).origin;}catch{}
 client.contextVerified=false;
 const route=req.path.match(/^\/api\/sessions\/([A-Za-z0-9_-]+)(?:\/displays\/([A-Za-z0-9_-]+))?/);
 eventContext.run({client,...(route?{sessionId:route[1],displayId:route[2]}:{})},next);
};
