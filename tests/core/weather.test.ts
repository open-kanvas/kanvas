import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { feedbackSubmitSchema } from '../../src/shared/reports.js';
import { experienceTools } from '../../src/server/mcp/experience-tools.js';
import { pairedDisplayAllowsAsset } from '../../src/server/access-flows.js';
import { parseDataset } from '../../src/server/rendering/datasets.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { recordHttpOperation } from '../../src/server/raw-events.js';

describe("weather coverage 1", () => {
    const toastSchema = experienceTools.find(t => t.name === "kanvas.toast")!.schema;
    it('weather temperature is genuinely optional with precise field errors', () => {
        expect(validateView({ template: 'weather', data: { condition: 'rain', display: { visualOnly: true } } }).data.temperature).toBeUndefined();
        expect(() => validateView({ template: 'weather', data: { condition: 'rain', temperature: '' } })).toThrow();
        try {
            validateView({ template: 'weather', data: { condition: 'rain', temperature: 17 } });
        }
        catch (e: any) {
            expect(e.issues[0].path).toEqual(['data', 'temperature']);
        }
    });
});
