import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView } from '../../src/shared/view-schemas';
import { templateViewSchema } from '../../src/shared/view-schemas';
import { SOURCE_RECORD_TEMPLATES } from '../../src/shared/source-guidance';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';
import { regionalDateTime } from '../../src/shared/regional';
import { regionalTime } from '../../src/shared/regional';
import { DEFAULT_CONFIG } from '../../src/shared/preferences';
import { flowchartDataSchema } from '../../src/shared/diagrams';
import { fitFlowchart } from '../../src/shared/diagrams';
import { profileInstructions } from '../../src/server/mcp/profile-guidance';
import { profileDescription } from '../../src/server/mcp/profile-guidance';
import { profileGuide } from '../../src/server/mcp/profile-guidance';
import { guideFor } from '../../src/server/mcp/guide';
import { resolveToolCall } from '../../src/server/mcp/catalog';
import type { TemplateId } from '../../src/shared/types';

describe("help coverage 1", () => {

describe("help contracts",()=>{
  it('requires verbatim sources in every requested template schema and help, without rejecting historical views',()=>{
    for(const template of SOURCE_RECORD_TEMPLATES){expect(JSON.stringify(z.toJSONSchema(templateViewSchema(template as TemplateId)))).toContain('character-for-character');expect(TEMPLATE_DISPLAY_GUIDANCE[template as TemplateId].detail).toContain('never summarize or paraphrase');}
    expect(JSON.stringify(guideFor('templates'))).toContain('character-for-character');
    expect(validateView({version:1,template:'document',data:{text:' Original\n\nexact text. '}}).data.text).toBe(' Original\n\nexact text. ');
  });});
});
