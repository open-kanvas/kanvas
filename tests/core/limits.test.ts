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
import { validationIssues } from '../../src/server/input-errors.js';
import { z } from 'zod';
import { gameDataSchema } from '../../src/shared/game.js';
import { createApp } from '../../src/server/app.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { eventContext } from '../../src/server/raw-events.js';
import { denied } from './harness.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import type { TemplateId } from '../../src/shared/types.js';
import { SEARCH_PROBES } from '../../src/shared/template-concepts.js';
import { TEMPLATE_CONCEPTS } from '../../src/shared/template-concepts.js';
import { collapseViewSlots } from '../../src/server/mcp/discovery.js';
import { discoveryCatalog } from '../../src/server/mcp/discovery.js';
import { helpCatalog } from '../../src/server/mcp/discovery.js';
import { minimalExample } from '../../src/server/mcp/discovery.js';
import { operationCatalog } from '../../src/server/mcp/discovery.js';
import { templateCatalog } from '../../src/server/mcp/discovery.js';
import { VIEW_SLOT } from '../../src/server/mcp/discovery.js';
import { LocalSearch } from '../../src/server/mcp/local-search.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { applyResponsePolicy } from '../../src/server/mcp/response-policy.js';
import { ContactLedger } from '../../src/server/mcp/response-policy.js';
import { CONTACT_IDLE_MS } from '../../src/server/mcp/response-policy.js';
import { AGENT_CONDUCT } from '../../src/shared/philosophy.js';
import { MISSION } from '../../src/shared/philosophy.js';
import { RHYTHM_NUDGE } from '../../src/shared/philosophy.js';
import { safeError } from '../../src/server/mcp/results.js';
import { collapseRepeatedIssues } from '../../src/server/input-errors.js';
import { needsTemplate } from '../../src/server/needs-template.js';
import { FACT_CONTEXT_MAX } from '../../src/server/needs-template.js';
import { limitMessage } from '../../src/server/usage-limits.js';
import { derivedViewLabel } from '../../src/shared/view-label.js';
import { personLabel } from '../../src/shared/display-name.js';
import { safeLabel } from '../../src/shared/display-name.js';
import { displayNameUnset } from '../../src/shared/display-name.js';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical.js';
import { profileInstructions } from '../../src/server/mcp/profile-guidance.js';
import { serverIcons } from '../../src/server/mcp/index.js';
import { serverWebsiteUrl } from '../../src/server/mcp/index.js';
import { DEFAULT_WEBSITE_URL } from '../../src/server/mcp/index.js';
import { mailSenderAddress } from '../../src/server/email-signin.js';
import { manageMap } from '../../src/server/mcp/manage-map.js';
import { HELP_PAGES } from '../../src/shared/help.js';
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { fieldShape } from '../../src/server/friction.js';
import { problemClass } from '../../src/server/friction.js';
import { agentType } from '../../src/server/agents.js';
import type { ToastRecord } from '../../src/shared/viewer-experience.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';

describe("limits coverage 1", () => {


describe("limits contracts",()=>{
 let h!:Harness,owner:Browser,sessionId:string,displayId:string;
 beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;});
 afterEach(async()=>{await h?.close();});
 it('rejects the 1001st publication without evicting stored views',async()=>{
  const p={userId:owner.user!.id};await owner.submit(sessionId,[displayId],fact('First'));
  await h.runtime.store.query(`INSERT INTO documents(kind,id,session_id,value) SELECT 'display-history','capacity-'||n,$1::text,json_build_object('id','capacity-'||n,'sessionId',$1::text,'displayId',$2::text,'revision',n,'view',json_build_object('version',1,'template','fact','data',json_build_object('text','retained')),'createdAt','2026-11-05T00:00:00Z','reason','fixture')::text FROM generate_series(1,999) n`,[sessionId,displayId]);
  const display=await h.runtime.service.display(p,sessionId,displayId);display.revision++;display.view=fact('Too many');
  await expect(h.runtime.service.history.record(display,'prepared')).rejects.toMatchObject({code:'VIEW_LIMIT_REACHED',message:expect.stringContaining('continue in a new session')});
  expect((await h.runtime.store.list<any>('display-history',sessionId,true)).filter(e=>e.view)).toHaveLength(1000);
  // Navigating the current retained publication and clearing the screen remain
  // possible at capacity; neither removes or frees a retained publication.
  display.revision++;display.view=fact('Navigation state');await h.runtime.service.history.record(display,'display-sync');
  display.revision++;display.view=null;await h.runtime.service.history.record(display,'clear');
  expect(await h.runtime.service.history.retainedCount(sessionId)).toBe(1000);
  display.revision++;display.view=fact('Still full');await expect(h.runtime.service.history.record(display,'prepared')).rejects.toMatchObject({code:'VIEW_LIMIT_REACHED'});

 });});
});

describe("limits coverage 2", () => {
    const context = { principal: { userId: 'catalog-reader' } };
    const search = (kind: 'tool' | 'template' | 'help', query: string, limit = 3) => (discoveryCatalog.query(kind, 'search', { query, limit }, context).results as {
        id: string;
        description: string;
        example?: unknown;
    }[]);
    describe('server behaviour behind the exposure reports', () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
            agentId?: string;
            tokenId?: string;
        };
        beforeEach(async () => { delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT; h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; p = { userId: o.user!.id }; });
        afterEach(async () => { delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT; await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}, principal = p) => h.runtime.service.execute(name, args, principal) as Promise<any>;
        /** A real connection: its token exists, so account checks pass exactly as for an MCP client. */
        const agentPrincipal = async (name: string) => { const { token } = await h.runtime.auth.issueToken(p.userId, name, ['read', 'publish']); return { userId: p.userId, agentId: token.agentId, tokenId: token.id }; };
        it('43bcc861: limit errors name the limit, the usage and what can be done, from the enforcing values', async () => {
            const usage = await h.runtime.service.sessionUsage(p.userId);
            expect(usage.limit).toBe(10);
            process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT = String(usage.active + 1);
            const extra = await h.runtime.service.createSession(p, 'Fills the last slot');
            let refused: unknown;
            try {
                await h.runtime.service.createSession(p, 'One too many');
            }
            catch (error) {
                refused = error;
            }
            const error = safeError(refused), limit = usage.active + 1;
            expect(error.code).toBe('SESSION_LIMIT_REACHED');
            expect(error.limit).toMatchObject({ limit, used: limit, resource: 'sessions', paidPlans: false, contact: 'kanvas@open-kanvas.ai' });
            expect(error.message).toBe(`You've reached the free limit of ${limit} sessions on this account, so a new session can't be created. You can keep using your existing sessions, or archive one you no longer need to free up a slot. Need more? Paid plans aren't available yet. Email kanvas@open-kanvas.ai to request a higher limit.`);
            expect(limitMessage('SESSION_LIMIT_REACHED', 20)).toContain('free limit of 20 sessions');
            expect(limitMessage('VIEW_LIMIT_REACHED', 1000)).toMatch(/free limit of 1000 views in this session/);
            // Archiving really frees the slot the message promises; restoring takes one again.
            await call("kanvas.archive.manage", { action: 'archive', resource: 'session', sessionId: extra.id });
            const replacement = await h.runtime.service.createSession(p, 'Fits after archiving');
            expect(replacement.id).toBeTruthy();
            let restore: unknown;
            try {
                await call("kanvas.archive.manage", { action: 'restore', resource: 'session', sessionId: extra.id });
            }
            catch (error) {
                restore = error;
            }
            expect(safeError(restore).code).toBe('SESSION_LIMIT_REACHED');
            // REST callers get the same structured answer.
            const rest = await o.request('POST', '/api/sessions', { name: 'Browser attempt', initialDisplay: false });
            expect(rest.status).toBe(429);
            expect((rest.error as {
                limit?: {
                    used: number;
                };
            }).limit?.used).toBe(limit);
        });
    });
});
