import { operationRequest } from '../mcp/requests.js';
import { legacySelectedCode } from './legacy-oauth-fixture.js';
import { verifiedEmailConsent } from './legacy-oauth-fixture.js';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { ORIGIN } from './harness.js';
import { denied } from './harness.js';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import type { Browser } from './harness.js';
import type { Harness } from './harness.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
import { WebsitePreview } from '../../src/server/website-preview.js';
import { DEFAULT_AGENT_GUIDANCE } from '../../src/server/agent-guidance';
import { createApp } from '../../src/server/app';
import { chartDataSchema } from '../../src/shared/chart-contract';
import { stackChart } from '../../src/shared/chart-stacks';
import { feedbackSubmitSchema } from '../../src/shared/reports';
import { visualHelp } from '../../src/server/visual-help';
import { HELP_TOPICS } from '../../src/shared/help';
import { asyncMap } from '../../src/server/async-collections.js';
import { vi } from 'vitest';
import { ControlledInterpreter } from './harness.js';
import { fact } from './harness.js';
import { PNG } from './harness.js';
import type { MonitoringFetchResult } from '../../src/server/monitoring.js';
import type { MonitoringFetcher } from '../../src/server/monitoring.js';
import type { MonitoringSummary } from '../../src/shared/monitoring.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { Token } from '../../src/server/auth.js';
import type { UpdateRecord } from '../../src/shared/types.js';

describe("oauth coverage 1", () => {
    interface Metadata {
        issuer: string;
        authorization_endpoint: string;
        token_endpoint: string;
        registration_endpoint: string;
        code_challenge_methods_supported: string[];
    }
    interface Registered {
        client_id: string;
        grant_types: string[];
        token_endpoint_auth_method: string;
    }
    interface Issued {
        access_token?: string;
        token_type?: string;
        expires_in?: number;
        error?: string;
    }
    const CALLBACK = 'http://127.0.0.1:43117/callback';
    const localPath = (address: string) => { const url = new URL(address); expect(url.origin).toBe(ORIGIN); return `${url.pathname}${url.search}`; };
    async function json<T>(response: Response): Promise<T> { return await response.json() as T; }
    async function discover(browser: Browser): Promise<Metadata> {
        const response = await browser.raw('/.well-known/oauth-authorization-server');
        expect(response.status).toBe(200);
        return json<Metadata>(response);
    }
    async function register(browser: Browser, metadata: Metadata): Promise<Registered> {
        const response = await browser.raw(localPath(metadata.registration_endpoint), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Core acceptance OAuth client', redirect_uris: [CALLBACK], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }) });
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
        const registered = await json<Registered>(response);
        expect(registered.grant_types).toEqual(['authorization_code', 'refresh_token']);
        expect(registered.token_endpoint_auth_method).toBe('none');
        return registered;
    }
    async function authorize(browser: Browser, metadata: Metadata, registered: Registered, overrides: Record<string, string> = {}) {
        const verifier = randomBytes(32).toString('base64url'), state = randomUUID();
        const query = new URLSearchParams({ response_type: 'code', client_id: registered.client_id, redirect_uri: CALLBACK, scope: 'read publish', resource: `${ORIGIN}/mcp`, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', ...overrides });
        const response = await browser.raw(`${localPath(metadata.authorization_endpoint)}?${query}`);
        const location = response.headers.get('location');
        await response.arrayBuffer();
        return { response, location, verifier, state, requestId: location ? new URL(location, ORIGIN).searchParams.get('authorize') : null };
    }
    async function approve(h: Harness, browser: Browser, requestId: string, sessionIds: string[]) {
        await verifiedEmailConsent(h, browser, requestId);
        const result = success(await browser.request<{
            redirectUri: string;
        }>('POST', '/api/oauth/approve', { requestId, approve: true, accessMode: 'account' }));
        const redirect = new URL(result.redirectUri);
        expect(`${redirect.origin}${redirect.pathname}`).toBe(CALLBACK);
        const code = redirect.searchParams.get('code');
        expect(typeof code).toBe('string');
        await legacySelectedCode(h, code!, sessionIds);
        return { code: code!, state: redirect.searchParams.get('state') };
    }
    async function exchange(browser: Browser, metadata: Metadata, registered: Registered, code: string, verifier: string, overrides: Record<string, string> = {}) {
        const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: registered.client_id, redirect_uri: CALLBACK, code, code_verifier: verifier, resource: `${ORIGIN}/mcp`, ...overrides });
        const response = await browser.raw(localPath(metadata.token_endpoint), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        return { response, body: await json<Issued>(response) };
    }
    describe('OAuth consent, PKCE and single-use grants', () => {
        let h!: Harness;
        beforeEach(async () => { h = await startHarness(); });
        afterEach(async () => { await h?.close(); });
        it('advertises and requires S256 PKCE and refuses an unregistered redirect target', async () => {
            const browser = h.browser(), metadata = await discover(browser), registered = await register(browser, metadata);
            expect(metadata.code_challenge_methods_supported).toContain('S256');
            expect(metadata.code_challenge_methods_supported).not.toContain('plain');
            const invalidRequests: Record<string, string>[] = [
                { code_challenge_method: 'plain' }, { code_challenge: '' }, { redirect_uri: 'https://unregistered.example/callback' },
            ];
            for (const overrides of invalidRequests) {
                const attempted = await authorize(browser, metadata, registered, overrides);
                expect(attempted.requestId).toBeNull();
                if (attempted.response.status >= 300 && attempted.response.status < 400) {
                    expect(new URL(attempted.location!, ORIGIN).searchParams.has('error')).toBe(true);
                    expect(new URL(attempted.location!, ORIGIN).searchParams.has('code')).toBe(false);
                    expect(new URL(attempted.location!, ORIGIN).hostname).not.toBe('unregistered.example');
                }
                else
                    expect([400, 401, 403]).toContain(attempted.response.status);
            }
        });
        it('preserves pre-upgrade selected-session grants, preserves OAuth state and rejects code replay', async () => {
            const owner = await h.account(), allowed = await owner.session('Allowed'), excluded = await owner.session('Excluded');
            const clientBrowser = h.browser(), metadata = await discover(clientBrowser), registered = await register(clientBrowser, metadata);
            const request = await authorize(clientBrowser, metadata, registered);
            expect(request.requestId).toEqual(expect.any(String));
            const consent = success(await owner.request<{
                id: string;
                scopes: string[];
            }>('GET', `/api/oauth/requests/${request.requestId}`));
            expect(consent.id).toBe(request.requestId);
            expect(consent.scopes).toEqual(expect.arrayContaining(['read', 'publish']));
            denied(await owner.request('POST', '/api/oauth/approve', { requestId: request.requestId, approve: true, sessionIds: [allowed.id] }, { csrf: null }), [403]);
            const approved = await approve(h, owner, request.requestId!, [allowed.id]);
            expect(approved.state).toBe(request.state);
            const issued = await exchange(clientBrowser, metadata, registered, approved.code, request.verifier);
            expect(issued.response.status).toBe(200);
            expect(typeof issued.body.access_token).toBe('string');
            expect(issued.body.token_type?.toLowerCase()).toBe('bearer');
            expect(issued.body.expires_in).toBeGreaterThan(0);
            expect(issued.response.headers.get('cache-control')).toMatch(/no-store/);
            const replay = await exchange(clientBrowser, metadata, registered, approved.code, request.verifier);
            expect(replay.response.status).toBe(400);
            expect(replay.body.error).toBe('invalid_grant');
            expect(replay.body.access_token).toBeUndefined();
            const sdk = new Client({ name: 'core-oauth-acceptance', version: '1.0' });
            try {
                await sdk.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers: { Authorization: `Bearer ${issued.body.access_token}` } } }));
                const permitted = await sdk.callTool(operationRequest({
                    name: "kanvas_call",
                    arguments: {
                        operationId: "kanvas.session.state",
                        arguments: {
                            sessionId: allowed.id
                        }
                    }
                }));
                expect(permitted.isError).not.toBe(true);
                const rejected = await sdk.callTool(operationRequest({
                    name: "kanvas_call",
                    arguments: {
                        operationId: "kanvas.session.state",
                        arguments: {
                            sessionId: excluded.id
                        }
                    }
                }));
                expect(rejected.isError).toBe(true);
            }
            finally {
                await sdk.close();
            }
        });
        it('rejects incorrect verifier, client binding, redirect binding and resource audience', async () => {
            const owner = await h.account(), session = await owner.session(), client = h.browser();
            const metadata = await discover(client), registered = await register(client, metadata), differentClient = await register(client, metadata);
            const invalidBindings: Record<string, string>[] = [
                { code_verifier: randomBytes(32).toString('base64url') },
                { client_id: differentClient.client_id },
                { redirect_uri: 'http://127.0.0.1:43117/different' },
                { resource: 'https://untrusted.example/mcp' },
            ];
            for (const change of invalidBindings) {
                const request = await authorize(client, metadata, registered);
                expect(request.requestId).toEqual(expect.any(String));
                const approved = await approve(h, owner, request.requestId!, [session.id]);
                const result = await exchange(client, metadata, registered, approved.code, request.verifier, change);
                expect([400, 401]).toContain(result.response.status);
                expect(result.body.error).toEqual(expect.any(String));
                expect(result.body.access_token).toBeUndefined();
            }
        });
        it('cannot consent to another account’s session and makes explicit denial terminal', async () => {
            const owner = await h.account(), other = await h.account(), foreign = await other.session('Foreign');
            const client = h.browser(), metadata = await discover(client), registered = await register(client, metadata);
            const request = await authorize(client, metadata, registered);
            expect(request.requestId).toEqual(expect.any(String));
            denied(await owner.request('POST', '/api/oauth/approve', { requestId: request.requestId, approve: true, sessionIds: [foreign.id] }), [400, 403, 404]);
            const rejected = success(await owner.request<{
                redirectUri: string;
            }>('POST', '/api/oauth/approve', { requestId: request.requestId, approve: false }));
            const uri = new URL(rejected.redirectUri);
            expect(uri.searchParams.get('error')).toBe('access_denied');
            expect(uri.searchParams.get('state')).toBe(request.state);
            expect(uri.searchParams.has('code')).toBe(false);
            denied(await owner.request('POST', '/api/oauth/approve', { requestId: request.requestId, approve: true, sessionIds: [foreign.id] }), [400, 403, 404, 409, 410]);
        });
    });
    describe('OAuth opaque state compatibility', () => {
        let h!: Harness;
        beforeEach(async () => { h = await startHarness(); });
        afterEach(async () => { await h?.close(); });
        it.each([
            ['above old limit', 'a'.repeat(1025)],
            ['encoded boundary', 'a'.repeat(8192)],
            ['opaque punctuation and Unicode', 'é +&=/%?🦊'.repeat(100)],
        ])('preserves %s exactly on success, denial and protocol errors', async (_label, state) => {
            const owner = await h.account(), client = h.browser();
            const metadata = await discover(client), registered = await register(client, metadata);
            const request = await authorize(client, metadata, registered, { state });
            expect(request.requestId).toEqual(expect.any(String));
            await verifiedEmailConsent(h, owner, request.requestId!);
            const approved = success(await owner.request<{
                redirectUri: string;
            }>('POST', '/api/oauth/approve', { requestId: request.requestId, approve: true, accessMode: 'account' }));
            const callback = new URL(approved.redirectUri);
            expect(callback.searchParams.get('state')).toBe(state);
            expect(callback.searchParams.get('iss')).toBe(ORIGIN);
            const issued = await exchange(client, metadata, registered, callback.searchParams.get('code')!, request.verifier);
            expect(issued.response.status).toBe(200);
            const denial = await authorize(client, metadata, registered, { state });
            const deniedResult = success(await owner.request<{
                redirectUri: string;
            }>('POST', '/api/oauth/approve', { requestId: denial.requestId, approve: false }));
            const deniedCallback = new URL(deniedResult.redirectUri);
            expect(deniedCallback.searchParams.get('state')).toBe(state);
            expect(deniedCallback.searchParams.get('error')).toBe('access_denied');
            for (const overrides of [{ resource: 'https://wrong.example/mcp' }, { code_challenge_method: 'plain' }] as Record<string, string>[]) {
                const failure = await authorize(client, metadata, registered, { state, ...overrides });
                expect(failure.response.status).toBe(303);
                const errorCallback = new URL(failure.location!);
                expect(errorCallback.searchParams.get('state')).toBe(state);
                expect(errorCallback.searchParams.has('error')).toBe(true);
                expect(errorCallback.searchParams.has('code')).toBe(false);
            }
        });
        it.each([
            ['empty', ''], ['control character', 'state\nvalue'],
            ['over ASCII bound', 'a'.repeat(8193)], ['over encoded bound', 'é'.repeat(1366)],
            ['over callback punctuation bound', '!'.repeat(2731)],
        ])('rejects %s locally without an uncorrelatable callback', async (_label, state) => {
            const client = h.browser(), metadata = await discover(client), registered = await register(client, metadata);
            const query = new URLSearchParams({ client_id: registered.client_id, redirect_uri: CALLBACK, response_type: 'code', state });
            const response = await client.raw('/oauth/authorize?' + query);
            expect(response.status).toBe(400);
            expect(response.headers.get('location')).toBeNull();
            expect(response.headers.get('cache-control')).toMatch(/no-store/);
            const body = await response.json();
            expect(body.error).toBe('invalid_request');
            expect(body.error_description).toMatch(/state/);
            if (state.length > 100)
                expect(JSON.stringify(body)).not.toContain(state);
        });
        it('rejects duplicate state locally and still refuses unregistered redirect targets', async () => {
            const client = h.browser(), metadata = await discover(client), registered = await register(client, metadata);
            const query = new URLSearchParams({ client_id: registered.client_id, redirect_uri: CALLBACK, state: 'one' });
            query.append('state', 'two');
            const duplicate = await client.raw('/oauth/authorize?' + query);
            expect(duplicate.status).toBe(400);
            expect(duplicate.headers.get('location')).toBeNull();
            expect((await duplicate.json()).error).toBe('invalid_request');
            const invalidRedirect = await authorize(client, metadata, registered, { state: 'a'.repeat(8192), redirect_uri: 'https://unregistered.example/callback' });
            expect(invalidRedirect.response.status).toBe(400);
            expect(invalidRedirect.location).toBeNull();
        });
    });
});

describe("oauth coverage 2", () => {

let h!:Harness;
afterEach(async()=>{await h?.close();});
describe('cross-device sign-in approval',()=>{
  async function setup(){const links:string[]=[];h=await startHarness({signinMailer:async(_email,link)=>{links.push(link);}});const origin=h.browser(),phone=h.browser();const pending=success(await origin.request<{code:string}>('POST','/api/auth/email/request',{email:'cross-device@example.com'}));const token=new URL(links.at(-1)!).hash.split('=')[1];return {origin,phone,pending,token,links};}
  it('retains explicit current-device sign-in and never approves other concurrent requests for the email',async()=>{
    const {origin,phone,token,links}=await setup(),second=h.browser();
    success(await second.request('POST','/api/auth/email/request',{email:'cross-device@example.com'}));const secondToken=new URL(links.at(-1)!).hash.split('=')[1];
    success(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'current'}));
    success(await phone.request('GET','/api/auth/me'));denied(await origin.request('POST','/api/auth/email/complete',{}),[410]);
    expect(success(await second.request('GET','/api/auth/email/status'))).toEqual({status:'pending'});
    success(await phone.request('POST','/api/auth/email/deny',{token:secondToken}));
  });});
});

describe("oauth coverage 3", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('requires current version acceptance at final email confirmation and stores it atomically',async()=>{
 let link='';h=await startHarness({signinMailer:async(_email,url)=>{link=url;}});const browser=h.browser();
 success(await browser.request('POST','/api/auth/email/request',{email:'legal@example.invalid'}));const token=new URL(link).hash.split('=')[1];
 for(const acceptedLegalVersion of [undefined,'old'])expect((await browser.request('POST','/api/auth/email/consume',{token,confirm:true,...(acceptedLegalVersion?{acceptedLegalVersion}:{})})).status).toBe(400);
 expect(await h.runtime.store.list('legal-acceptance')).toHaveLength(0);
 success(await browser.request('POST','/api/auth/email/inspect',{token}));
 const signed=success(await browser.request<any>('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'}));
 expect(await h.runtime.store.get('legal-acceptance',`${signed.user.id}:2026-10-14`)).toMatchObject({userId:signed.user.id,version:'2026-10-14',method:'email-confirmation'});
 expect((await browser.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'})).status).toBe(410);
 for(const path of ['/legal/privacy','/legal/terms','/legal/2026-10-14/privacy','/legal/2026-10-14/terms']){const response=await fetch(h.baseUrl+path);expect(response.status).toBe(200);expect(await response.text()).toContain('Version 2026-10-14');}
});
});

describe("oauth coverage 4", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('requires fresh email for OAuth and completes only the originating browser, preserving state/PKCE',async()=>{
 let link='';h=await startHarness({signinMailer:async(_email,url)=>{link=url;}});const owner=h.browser(),origin=h.browser(),emailBrowser=h.browser();success(await owner.request('POST','/api/auth/email/request',{email:'owner@example.invalid'}));const initialToken=new URL(link).hash.split('=')[1];const initial=success(await owner.request<any>('POST','/api/auth/email/consume',{token:initialToken,confirm:true,acceptedLegalVersion:'2026-10-14'}));owner.user=initial.user;owner.csrf=initial.csrfToken;const verifier=randomBytes(32).toString('base64url'),callback='https://client.example/callback';
 const registered=await owner.raw('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Email test',redirect_uris:[callback],grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none'})});const client=await registered.json();
 const state='opaque-'+ 'x'.repeat(1500),query=new URLSearchParams({client_id:client.client_id,redirect_uri:callback,response_type:'code',scope:'read publish',resource:'http://127.0.0.1/mcp',state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
 const authorize=await origin.raw('/oauth/authorize?'+query);expect(authorize.status).toBe(303);const requestId=new URL(authorize.headers.get('location')!).searchParams.get('authorize');
 expect((await owner.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account'})).status).toBe(403);
 success(await origin.request('POST','/api/auth/email/request',{email:owner.user!.username,authorizationRequestId:requestId,acceptedLegalVersion:'2026-10-14'}));
 const token=new URL(link).hash.split('=')[1];expect((await origin.request('POST','/api/auth/email/complete',{})).status).toBe(410);
 const confirmation=success(await emailBrowser.request<any>('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'current'}));expect(confirmation).toEqual({approved:true,connectionReceipt:expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)});const receipt={receipt:confirmation.connectionReceipt};const pending=await emailBrowser.request<any>('POST','/api/auth/email/connection-status',receipt);expect(success(pending)).toEqual({status:'pending'});expect(pending.headers.get('cache-control')).toBe('no-store');expect(success(await emailBrowser.request('POST','/api/auth/email/connection-status',{receipt:randomBytes(32).toString('base64url')}))).toEqual({status:'unavailable'});expect(confirmation).not.toHaveProperty('redirectUri');expect(confirmation).not.toHaveProperty('csrfToken');
 expect((await emailBrowser.request('POST','/api/auth/email/complete',{})).status).toBe(410);
 const signed=success(await origin.request<any>('POST','/api/auth/email/complete',{}));origin.csrf=signed.csrfToken;
 expect((await owner.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account'})).status).toBe(403);
 const approval=success(await origin.request<any>('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account'})),redirect=new URL(approval.redirectUri);expect(redirect.searchParams.get('state')).toBe(state);expect(redirect.searchParams.has('code')).toBe(true);expect(success(await emailBrowser.request('POST','/api/auth/email/connection-status',receipt))).toEqual({status:'connected'});expect((await emailBrowser.request('GET','/api/auth/me')).status).toBe(401);
 expect((await origin.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account'})).status).toBeGreaterThanOrEqual(400);
 expect((await emailBrowser.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'})).status).toBe(410);
});
});

describe("oauth coverage 5", () => {
    const running: Harness[] = [];
    afterEach(async () => { await Promise.all((await asyncMap(running.splice(0), async (h) => (await h.close())))); });
    async function setup(fetcher?: MonitoringFetcher) {
        let time = Date.now();
        const interpret = vi.fn(async () => { throw new Error('These source operations must not invoke the source renderer.'); });
        const fetch = vi.fn(fetcher ?? (async () => ({ statusCode: 200, latencyMs: 5, mimeType: 'application/json', body: Buffer.from('{"text":"Exact source result"}'), finalUrl: 'https://example.com/status' })));
        const h = await startHarness({ interpreter: { interpret }, monitoringOptions: { automatic: false, now: () => time, fetcher: fetch } });
        running.push(h);
        const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
        return { h, owner, session, display, interpret, fetch, advance: (ms: number) => { time += ms; } };
    }
    const jsonConfig = { mode: 'json', url: 'https://example.com/status', template: 'fact', mapping: { text: { $path: '/text' } }, intervalSeconds: 30, durationSeconds: 3600 };
    describe("oauth contracts", () => {
        it('binds OAuth-created jobs to the durable refresh grant and stops on revocation', async () => {
            const { h, owner, session, display, advance, fetch } = await setup();
            const issued = (await h.runtime.auth.issueToken(owner.user!.id, 'Isolated monitoring test', ['read', 'publish'], [session.id], 'test-monitor-client'));
            const token: Token = { ...issued.token, resource: h.runtime.auth.oauthResource, refreshExpiresAt: Date.now() + 3600000, refreshIdleExpiresAt: Date.now() + 3600000 };
            (await h.runtime.store.put('oauth-client', { id: token.clientId!, redirectUris: ['https://example.com/callback'] }));
            (await h.runtime.store.put('token', token));
            const accessId = randomUUID();
            (await h.runtime.store.put('oauth-access', { id: accessId, tokenId: token.id, scopes: token.scopes, expiresAt: Date.now() + 60000 }));
            const principal: AuthPrincipal = { userId: token.userId, agentId: token.agentId, tokenId: token.id, oauthAccessId: accessId };
            const job = await h.runtime.service.execute("kanvas.monitoring.start", { sessionId: session.id, displayId: display.id, requestId: randomUUID(), expectedRevision: 0, config: jsonConfig }, principal) as MonitoringSummary;
            (await h.runtime.store.put('token', { ...token, expiresAt: Date.now() - 1 }));
            (await h.runtime.store.delete('oauth-access', accessId));
            await h.runtime.service.monitoring.runDue();
            expect(fetch).toHaveBeenCalledTimes(1);
            (await h.runtime.auth.revokeToken(owner.user!.id, token.id));
            advance(31000);
            await h.runtime.service.monitoring.runDue();
            expect(fetch).toHaveBeenCalledTimes(1);
            const current = success(await owner.request<MonitoringSummary>('GET', `/api/sessions/${session.id}/monitoring/${job.id}`));
            expect(current.health.stoppedReason).toBe('authorization-lost');
            expect(current).not.toHaveProperty('owner.tokenId');
        });
    });
});
