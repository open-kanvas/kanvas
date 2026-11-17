import { profileInstructions } from '../../src/server/mcp/profile-guidance.js';
import { FIRST_DISPLAY_LINK_GUIDANCE } from '../../src/server/mcp/viewer-link-guidance.js';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { operationCatalog } from '../../src/server/mcp/discovery.js';
import { templateCatalog } from '../../src/server/mcp/discovery.js';
import { helpCatalog } from '../../src/server/mcp/discovery.js';
import { discoveryCatalog } from '../../src/server/mcp/discovery.js';
import { discoveryToolDefinitions } from '../../src/server/mcp/discovery.js';
import { workflowIds } from '../../src/server/mcp/workflow-guidance.js';
import { toolSuccess } from '../../src/server/mcp/results.js';
import { toolFailure } from '../../src/server/mcp/results.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { InputError } from '../../src/server/input-errors.js';

describe("planner coverage 1", () => {
    const context = { principal: { userId: 'test-account', scopes: ['read', 'publish'] } };
    describe('contextual discovery and first contact', () => {
        
        it('submit success proactively exposes targeted workflow operations and committed planner boundary', () => {
            const result = toolSuccess({ status: 'prepared' }, undefined, "kanvas.submit", 'discovery', { view: { version: 1, template: 'planner', data: { status: 'committed' } } });
            expect(result.structuredContent).toMatchObject({ workflow: { relatedOperations: expect.arrayContaining([{ id: 'kanvas.planner.review', description: expect.any(String) }]) }, commitmentBoundary: expect.stringContaining('No external calendar') });
            expect(toolSuccess({}, undefined, "kanvas.planner.finalize", 'discovery').structuredContent).toHaveProperty('commitmentBoundary');
        });
    });
});
