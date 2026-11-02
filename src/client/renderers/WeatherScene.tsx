import {WeatherAtmosphere} from './WeatherAtmosphere';
import {useEffect,useRef,useState,useCallback} from 'react';
export type WeatherCondition='clear'|'partly-cloudy'|'cloudy'|'rain'|'snow'|'storm'|'fog';
/** Procedural atmosphere, not a photograph of the supplied place. No imagery/network/GL. */
function WeatherFallback({condition,period,sunPosition,intensity=.55,still=false}:{condition:WeatherCondition;period:string;sunPosition:{x:number;y:number};intensity?:number;still?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),current=useRef({condition,period,intensity,sunPosition});current.current={condition,period,intensity,sunPosition};
 useEffect(()=>{const el=canvas.current!,ctx=el.getContext('2d',{alpha:false});if(!ctx)return;
  let width=960,height=540,frame=0,last=0,phase=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const resize=()=>{width=Math.max(1,el.clientWidth);height=Math.max(1,el.clientHeight);const scale=Math.min(devicePixelRatio||1,1.5,1600/width);el.width=Math.ceil(width*scale);el.height=Math.ceil(height*scale);ctx.setTransform(scale,0,0,scale,0,0);draw(0);};
  // Deterministic fractal density generates shaded cloud volumes once, then only composites.
  const texture=document.createElement('canvas');texture.width=512;texture.height=256;const tc=texture.getContext('2d')!,pixels=tc.createImageData(512,256);
  const hash=(x:number,y:number)=>{let n=Math.imul(x+73,y+173)^Math.imul(x,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  const noise=(x:number,y:number)=>{const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v);return (hash(ix,iy)*(1-s)+hash(ix+1,iy)*s)*(1-t)+(hash(ix,iy+1)*(1-s)+hash(ix+1,iy+1)*s)*t;};
  for(let y=0;y<256;y++)for(let x=0;x<512;x++){let n=0,amplitude=.55;for(let octave=0;octave<5;octave++){n+=noise(x/105*2**octave,y/65*2**octave)*amplitude;amplitude*=.5;}const density=Math.max(0,Math.min(1,(n-.38)*3.6)),shade=Math.round(170+75*(1-density)),i=(y*512+x)*4;pixels.data[i]=shade;pixels.data[i+1]=shade+3;pixels.data[i+2]=Math.min(255,shade+8);pixels.data[i+3]=Math.round(density*235*Math.min(1,y/22,(256-y)/40));}tc.putImageData(pixels,0,0);
  let sun={...sunPosition};
  let sky=[34,111,178,180,216,232];
  function draw(delta:number){if(!ctx)return;const d=current.current,night=d.period==='night',warm=d.period==='sunset'||d.period==='sunrise',wet=['rain','storm','snow','fog','cloudy'].includes(d.condition),target=night?[5,12,30,37,51,77]:warm?[47,61,104,238,161,123]:wet?[52,72,92,157,178,189]:[23,103,177,186,221,237];const mix=delta?Math.min(1,delta/1500):1;sky=sky.map((v,i)=>v+(target[i]-v)*mix);
   const color=(i:number)=>`rgb(${sky.slice(i,i+3).map(Math.round).join(',')})`,gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,color(0));gradient.addColorStop(.78,color(3));gradient.addColorStop(1,night?'#192430':'#8fa9aa');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
   if(night){ctx.fillStyle='#e7efff';for(let i=0;i<75;i++){ctx.globalAlpha=(.2+hash(i,1)*.65)*(wet?.12:1);ctx.beginPath();ctx.arc(hash(i,2)*width,hash(i,3)*height*.64,.5+hash(i,4),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
   sun={x:sun.x+(d.sunPosition.x-sun.x)*mix,y:sun.y+(d.sunPosition.y-sun.y)*mix};const sx=width*sun.x,sy=height*sun.y,radius=Math.min(width,height)*(night?.026:.033),glow=ctx.createRadialGradient(sx,sy,0,sx,sy,radius*12);glow.addColorStop(0,night?'#dbeaffbb':warm?'#ffd49ecc':'#fff2dccc');glow.addColorStop(.16,night?'#a6c9e833':'#ffeac755');glow.addColorStop(1,'#ffffff00');ctx.globalAlpha=wet?.18:1;ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);ctx.fillStyle=night?'#dce8f4':'#fff6df';ctx.beginPath();ctx.arc(sx,sy,radius,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
   // Broad cloud banks with parallax and atmospheric depth, not symbol icons.
   const coverage=d.condition==='clear'?.09:d.condition==='partly-cloudy'?.65:1;
   for(let layer=0;layer<3;layer++){const tw=width*(1.2+layer*.3),th=height*(.48+layer*.13),offset=(phase*(.010+layer*.006))%tw;ctx.globalAlpha=coverage*(night?.22:.44)*(layer===2?.7:1);for(let tile=-1;tile<2;tile++)ctx.drawImage(texture,tile*tw-offset,-height*.11+layer*height*.12,tw,th);}
   ctx.globalAlpha=1;
   // Subtle atmospheric landscape supplies depth without claiming a real location.
   for(let layer=0;layer<4;layer++){const horizon=.73+layer*.055;ctx.fillStyle=night?['#26394a','#20303e','#172b34','#12252b'][layer]:wet?['#7f969d','#647f87','#4a6b72','#36565e'][layer]:['#8aa4ac','#6d9199','#537d86','#3a6671'][layer];ctx.beginPath();ctx.moveTo(0,height);for(let i=0;i<=40;i++){const x=i/40*width,y=height*(horizon+Math.sin(i*.19+layer*1.7)*.035+Math.sin(i*.47+layer)*.012);ctx.lineTo(x,y);}ctx.lineTo(width,height);ctx.fill();}
   if(d.condition==='fog'){for(let i=0;i<5;i++){const gy=height*(.3+i*.13),fog=ctx.createLinearGradient(0,gy-height*.1,0,gy+height*.12);fog.addColorStop(0,'#d9e3e800');fog.addColorStop(.5,night?'#bbcbd340':'#e3ebed99');fog.addColorStop(1,'#d9e3e800');ctx.fillStyle=fog;ctx.fillRect(0,gy-height*.1,width,height*.22);}}
   if(['rain','storm','snow'].includes(d.condition)){const snow=d.condition==='snow',count=Math.round((snow?90:160)*(.25+d.intensity));ctx.strokeStyle=night?'#c7def055':'#deedfa88';ctx.fillStyle='#eef5ff';for(let i=0;i<count;i++){const depth=.3+hash(i,7)*.7,x=((hash(i,8)*width+phase*(snow?.008:.06)*depth)%(width+80))-40,y=((hash(i,9)*height+phase*(snow?.025:.5)*depth)%(height+50))-25;ctx.globalAlpha=.25+depth*.55;if(snow){ctx.beginPath();ctx.arc(x+Math.sin(phase/1800+i)*18,y,depth*2.8,0,Math.PI*2);ctx.fill();}else{ctx.lineWidth=depth*1.1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4*depth,y+23*depth);ctx.stroke();}}ctx.globalAlpha=1;}
   // A restrained CSS lightning glow is shared with the GPU path; reduced motion disables it.
   const vignette=ctx.createRadialGradient(width*.5,height*.4,width*.15,width*.5,height*.4,width*.8);vignette.addColorStop(0,'#07132600');vignette.addColorStop(1,'#07132666');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
  }
  const tick=(time:number)=>{if(still||document.hidden||reduced.matches)return;frame=requestAnimationFrame(tick);if(time-last<1000/24)return;const delta=Math.min(80,time-last||42);last=time;phase+=delta;draw(delta);};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();const refresh=()=>{cancelAnimationFrame(frame);draw(0);if(!still&&!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick);};refresh();document.addEventListener('visibilitychange',refresh);reduced.addEventListener('change',refresh);const timer=setInterval(()=>{if(!still&&reduced.matches&&!document.hidden)draw(0);},1500);
  return()=>{cancelAnimationFrame(frame);clearInterval(timer);observer.disconnect();document.removeEventListener('visibilitychange',refresh);reduced.removeEventListener('change',refresh);};
 },[still]);
 return <canvas ref={canvas} className="weather-scene" data-atmosphere="canvas-fallback" aria-hidden="true"/>;
}

export function WeatherScene(props:{condition:WeatherCondition;period:string;sunPosition:{x:number;y:number};intensity?:number;preview?:boolean}){
 const [gpu,setGpu]=useState(true),fallback=useCallback(()=>setGpu(false),[]);
 return gpu&&!props.preview?<WeatherAtmosphere {...props} onUnsupported={fallback}/>:<WeatherFallback {...props} still={props.preview}/>;
}
