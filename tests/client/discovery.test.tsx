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

describe("discovery coverage 1", () => {

describe("discovery contracts",()=>{
  it('surfaces consent-based friction feedback before discovery, consistently across profiles',()=>{
    for(const profile of ['domains','twelve','legacy'] as const){for(const text of [profileInstructions(profile),profileDescription(profile),JSON.stringify(profileGuide('feedback',guideFor('feedback'),profile))]){expect(text).toContain('file only on request or consent');expect(text).toContain('Never include private content or credentials');expect(text).toContain('do not nag');}}
  });});
});
