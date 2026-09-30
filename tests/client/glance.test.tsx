import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Renderer } from '../../src/client/renderers/Renderer';
import { WeatherSymbol } from '../../src/client/renderers/Weather';
import { fitBoardCamera } from '../../src/client/renderers/Whiteboard';
import { TEMPLATE_DISPLAY_GUIDANCE, showViewHeading } from '../../src/shared/display-guidance';
import { samples } from '../../src/shared/template-examples';
import { TEMPLATE_IDS, type ViewSpec } from '../../src/shared/types';
import { validateView } from '../../src/shared/view-schemas';

describe('glanceable focus, source fidelity and meaningful headings',()=>{
  it('fits complete supplied geometry on portrait and landscape without altering its coordinates',()=>{
    const elements=[{id:'negative-arrow',type:'arrow' as const,x:650,y:300,width:-300,height:-150},{id:'note',type:'text' as const,x:800,y:180,width:260,height:90,text:'Exact supplied note'}];
    const original=structuredClone(elements);
    for(const viewport of [{width:360,height:680},{width:1280,height:620}]){
      const camera=fitBoardCamera(elements,viewport);
      expect(camera.height/camera.width).toBeCloseTo(viewport.height/viewport.width);
      expect(camera.x).toBeLessThanOrEqual(350);expect(camera.y).toBeLessThanOrEqual(150);
      expect(camera.x+camera.width).toBeGreaterThanOrEqual(1060);expect(camera.y+camera.height).toBeGreaterThanOrEqual(300);
    }
    expect(elements).toEqual(original);
  });
  it('honors explicit headings without adding chart/table/reader title chrome by default',()=>{
    expect(showViewHeading({...samples.fact,title:'Visible when explicitly requested',showTitle:true})).toBe(true);
    for(const template of ['chart','table','document'] as const){
      const view={...samples[template],title:'Supplied context'};
      expect(showViewHeading(view)).toBe(false);expect(showViewHeading({...view,showTitle:true})).toBe(true);
      expect(showViewHeading({...view,showTitle:false})).toBe(false);
    }
    expect(showViewHeading({version:1,template:'document',title:'Document excerpt',data:{layout:'excerpt',text:'The quotation.'}})).toBe(false);
  });
  it('covers the entire accepted vocabulary without making code, documents or input forms tiny',()=>{
    expect(Object.keys(TEMPLATE_DISPLAY_GUIDANCE).filter(x=>!['web','game'].includes(x)).sort()).toEqual([...TEMPLATE_IDS].sort());
    expect(TEMPLATE_DISPLAY_GUIDANCE.code.reference).toBe(true);
    expect(TEMPLATE_DISPLAY_GUIDANCE.document.reference).toBe(true);
    expect(TEMPLATE_DISPLAY_GUIDANCE.form.reference).toBe(true);
    expect(TEMPLATE_DISPLAY_GUIDANCE.weather.reference).toBe(false);
  });
  it('presents one source disclosure for a slide without losing its deck or leaf attribution',()=>{
    const view=validateView({version:1,template:'presentation',title:'Original deck',showSource:true,source:{title:'Deck source',illustrative:true},data:{slides:[{version:1,template:'fact',title:'Current slide',data:{text:'One idea'},source:{title:'Leaf source',locator:'Page 2'}}]}});
    const html=renderToStaticMarkup(<Renderer view={view}/>);
    expect(html.match(/aria-label="About this view"/g)).toHaveLength(1);expect(html).not.toContain('Illustrative data');
    for(const text of ['Original deck','Current slide','Deck source','Leaf source','Page 2'])expect(html).toContain(text);
  });
});

describe('supplied weather, not model-inferred data',()=>{
  it('accepts explicitly labelled high/low without inventing a current temperature',()=>{
    const view=validateView({version:1,template:'weather',data:{place:'Arendal',timeLabel:'Tomorrow',high:'19°C',low:'12°C',condition:'rain'}});
    const html=renderToStaticMarkup(<Renderer view={view}/>);
    expect(html).toContain('High');expect(html).toContain('Low');expect(html).toContain('19°C');expect(html).toContain('12°C');
    expect(html).not.toContain('class="weather-temperature"');
    expect(html).toContain('weather-cloud-shape');expect(html).toContain('Rain illustration');
    expect(()=>validateView({version:1,template:'weather',data:{place:'Arendal',condition:'rain'}})).toThrow();
  });
  it('preserves the reported temperature pair verbatim instead of guessing its meaning',()=>{
    const html=renderToStaticMarkup(<Renderer view={validateView({version:1,template:'weather',title:'Arendal, Norway Tomorrow',data:{place:'Arendal, Norway',temperature:'19C / 12C',condition:'rain',period:'day',description:'Morning rain and drizzle clearing later, light winds.'}})}/>);
    expect(html).toContain('19C / 12C');expect(html).toContain('Arendal, Norway');expect(html).toContain('class="weather-place">Arendal, Norway</p>');expect(html).toContain('Morning rain and drizzle clearing later, light winds.');
    expect(html).not.toContain('<dt>High</dt>');expect(html).not.toContain('<dt>Low</dt>');
  });
  it('preserves full forecast/detail text and produces self-contained recognizable SVG variants',()=>{
    const data=validateView({version:1,template:'weather',data:{place:'Supplied place',temperature:'17.000°',condition:'snow',forecast:[{time:'18:00',temperature:'15.00°',condition:'clear'}],details:[{label:'Wind',value:'4.000 m/s'}]}}).data;
    const html=renderToStaticMarkup(<Renderer view={{version:1,template:'weather',data} as ViewSpec}/>);
    expect(html).not.toContain('Forecast &amp; details');expect(html).toContain('15.00°');expect(html).toContain('4.000 m/s');
    for(const condition of ['clear','partly-cloudy','cloudy','rain','snow','storm','fog'] as const){
      const icon=renderToStaticMarkup(<WeatherSymbol condition={condition}/>);
      expect(icon).toContain('<svg');expect(icon).not.toContain('https:');expect(icon).not.toContain('<image');
      if(condition!=='clear')expect(icon).toContain('weather-cloud-shape');
    }
    expect(renderToStaticMarkup(<WeatherSymbol condition="clear" night/>)).not.toContain('<circle');
    // React useId prevents gradient IDs from colliding between a large scene and forecast icons.
    const combined=renderToStaticMarkup(<><WeatherSymbol condition="rain"/><WeatherSymbol condition="clear"/></>);
    const ids=[...combined.matchAll(/ id="([^"]+)"/g)].map(x=>x[1]);expect(new Set(ids).size).toBe(ids.length);
  });
});
