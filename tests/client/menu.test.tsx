import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView } from '../../src/shared/view-schemas';
import { chartDataSchema } from '../../src/shared/view-schemas';
import { navigationCapabilities } from '../../src/shared/navigation';
import { navigate } from '../../src/shared/navigation';
import { initialNavigation } from '../../src/shared/navigation';
import { navigationActionSchema } from '../../src/shared/navigation';
import { diagramLayout } from '../../src/shared/diagrams';
import { orgChartDataSchema } from '../../src/shared/diagrams';
import { choroplethPaths } from '../../src/client/renderers/AdvancedCharts';
import { safePopupStyle } from '../../src/client/renderers/map-popup';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';

describe("menu coverage 1", () => {

const v=(template:string,data:unknown)=>validateView({version:1,template,data});
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={v(template,data)}/>);
describe("menu contracts",()=>{
 it('retains core seller details even with custom selected attributes',()=>{const html=render('product',{name:'Reference headphones',description:'Exact product description',layout:'multi-vendor',image:{url:'https://example.test/product.png',alt:'Headphones'},attributes:[{key:'battery',label:'Battery'}],offers:[{vendor:'Shop A',price:'USD 99',availability:'In stock',shipping:'Two days',attributes:{battery:'30h'},url:'https://example.test/shop'}]});for(const value of ['Reference headphones','Exact product description','Headphones','USD 99','In stock','Two days','30h'])expect(html).toContain(value);});});
});
