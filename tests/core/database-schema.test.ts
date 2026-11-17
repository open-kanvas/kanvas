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

describe("database schema coverage 1", () => {
    const toastSchema = experienceTools.find(t => t.name === "kanvas.toast")!.schema;
    it('database schema preserves 12+ columns and validates explicit relationship endpoints', () => {
        const columns = Array.from({ length: 14 }, (_, i) => ({ schema: 'public', table: 'events', column: 'field' + i, type: 'text', nullable: i > 0, primaryKey: i === 0 }));
        const v = validateView({ template: 'database-schema', data: { columns, relationships: [{ from: { schema: 'public', table: 'events', column: 'field1' }, to: { schema: 'public', table: 'events', column: 'field0' }, kind: 'inferred' }] } });
        expect(v.data.columns).toEqual(columns);
        expect(() => validateView({ ...v, data: { ...v.data, relationships: [{ from: { table: 'missing', column: 'id' }, to: { table: 'missing', column: 'id' }, kind: 'declared' }] } })).toThrow();
    });
});
