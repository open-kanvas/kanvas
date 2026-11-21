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

describe("comparison coverage 1", () => {

const v=(template:string,data:unknown)=>validateView({version:1,template,data});
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={v(template,data)}/>);
describe("comparison contracts",()=>{
 it('marks commentary as summary, not a fourth comparison product',()=>{const html=render('comparison',{criteria:['Cost'],items:[{name:'A',values:{Cost:1}},{name:'B',values:{Cost:2}}],commentary:{Cost:'Different costs'}});expect(html).toContain('class="comparison-commentary">Takeaway');expect(html).toContain('Summary');});});
});
