import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { KanvasService } from '../../src/server/domain.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { stackChart } from '../../src/shared/chart-stacks.js';
import { chartDataSchema } from '../../src/shared/chart-contract.js';
import { afterEach } from 'vitest';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import type { Request } from 'express';
import { z } from 'zod';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import type { Harness } from './harness.js';
import { materializeSeats } from '../../src/shared/venue.js';
import { menuBoardSchema } from '../../src/shared/venue.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { navigationCapabilities } from '../../src/shared/navigation.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { redactDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { deliveryIngress } from '../../src/server/delivery-telemetry.js';
import { recordDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { readingDefaults } from '../../src/shared/reading.js';
import { liveSurfaceLayout } from '../../src/shared/live-surface.js';
import { normalizeLoginCode } from '../../src/server/device-login.js';
import { loginRead } from '../../src/server/device-login.js';
import { loginDecide } from '../../src/server/device-login.js';
import type { NavigationSnapshot } from '../../src/shared/navigation.js';
import { createApp } from '../../src/server/app';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { feedbackSubmitSchema } from '../../src/shared/reports';
import { visualHelp } from '../../src/server/visual-help';
import { HELP_TOPICS } from '../../src/shared/help';

describe("device login coverage 1", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    describe('keyboardless account receiver boundary', () => {
        it('requires code AND exact label + confirm, claims once, retargets only by owner, and revokes retained access', async () => {
            h = await startHarness();
            const owner = await h.account(), screen = h.browser(), stranger = await h.account(), service = h.runtime.service;
            const req = success(await screen.request<any>('POST', '/api/screens/request', {}));
            expect(req).not.toHaveProperty('proof');
            expect(await service.execute("kanvas.screen.read", { code: req.code }, { userId: owner.user!.id })).toMatchObject({ code: req.code, label: req.label, status: 'pending' });
            denied(await screen.request('POST', '/api/screens/lookup', { code: req.code }), [401]);
            denied(await owner.request('POST', '/api/screens/decide', { code: req.code, label: 'wrong label', approve: true, confirm: true }), [400]);
            denied(await owner.request('POST', '/api/screens/decide', { code: req.code, label: req.label, approve: true }), [400]);
            success(await owner.request('POST', '/api/screens/decide', { code: req.code, label: req.label, approve: true, confirm: true, name: 'Classroom TV' }));
            const claims = await Promise.all([screen.request<any>('POST', '/api/screens/claim', {}), screen.request<any>('POST', '/api/screens/claim', {})]);
            expect(claims.filter(x => x.status === 200)).toHaveLength(1);
            const me = success(await screen.request<any>('GET', '/api/auth/me'));
            screen.csrf = me.csrfToken;
            expect(me).toMatchObject({ viewOnly: true, user: { username: 'guest' } });
            expect(me.receiverDeviceId).toEqual(expect.any(String));
            for (const path of ['/api/start', '/api/devices', '/api/auth/sessions', '/api/media-library', '/api/account/details'])
                denied(await screen.request('GET', path));
            denied(await screen.request('POST', '/api/sessions', { name: 'Not allowed' }));
            const p = (await h.runtime.auth.browser({ cookies: Object.fromEntries(screen.cookies), get: () => undefined } as unknown as Request)).principal;
            const received: unknown[] = [];
            const stream = await service.devices.stream(p, me.receiverDeviceId, x => received.push(x));
            await stream.push();
            const session = await owner.session('Target'), display = await owner.display(session.id), op = { userId: owner.user!.id };
            await expect(service.devices.present(p, { deviceId: me.receiverDeviceId, sessionId: session.id, displayId: display.id, requestId: 'forbidden' })).rejects.toThrow();
            await expect(service.devices.present({ userId: stranger.user!.id }, { deviceId: me.receiverDeviceId, sessionId: session.id, displayId: display.id, requestId: 'foreign' })).rejects.toThrow();
            await service.devices.present(op, { deviceId: me.receiverDeviceId, sessionId: session.id, displayId: display.id, requestId: 'owner-presents' });
            await stream.push();
            expect(received.at(-1)).toMatchObject({ command: { displayId: display.id } });
            expect((await service.display(p, session.id, display.id)).id).toBe(display.id);
            await expect(service.display(p, me.sessionId, me.displayId)).rejects.toThrow();
            await h.runtime.auth.revokeBrowser(p.browserId!);
            await expect(stream.push()).rejects.toThrow();
            await expect(service.display(p, session.id, display.id)).rejects.toThrow();
            stream.close();
        });
    });
});

describe("device login coverage 2", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('normalizes the same six letters and NATO words, rejecting malformed codes',()=>{for(const value of ['aBcDeF','a b c d e f','Alpha Bravo Charlie Delta Echo Foxtrot'])expect(normalizeLoginCode(value)).toBe('ABCDEF');expect(()=>normalizeLoginCode('Alpha Bravo Secret Delta Echo Foxtrot')).toThrow();expect(normalizeLoginCode('Alpha Bravo X ray Delta Echo Foxtrot,')).toBe('ABXDEF');});
it('issues a real account browser only after scoped owner readback consent, binds proof, and supports revocation',async()=>{
 h=await startHarness();const a=await h.account(),other=await h.account(),screen=h.browser(),attacker=h.browser(),s=h.runtime.service,p={userId:a.user!.id};const req=success(await screen.request<any>('POST','/api/login/request',{}));expect(req.code).toMatch(/^[A-Z]{6}$/);expect(req.phonetic).toHaveLength(6);const review=await loginRead(s,p,{code:req.phonetic.join(' ')});expect(review.context).toBeTruthy();expect(review.ageSeconds).toBeLessThan(10);
 await expect(loginDecide(s,{userId:other.user!.id},{code:req.code,approvalToken:review.approvalToken,approve:true,confirm:true})).rejects.toThrow();
 await expect(loginDecide(s,p,{code:req.code,approvalToken:review.approvalToken,approve:true,confirm:false})).rejects.toThrow();
 await expect(loginRead(s,{...p,scopedDisplayId:'guest',pairingId:'guest'},{code:req.code})).rejects.toThrow();
 expect((await screen.request('POST','/api/login/claim',{})).status).toBe(403);
 await loginDecide(s,p,{code:req.code,approvalToken:review.approvalToken,approve:true,confirm:true});const secondRequest=success(await attacker.request<any>('POST','/api/login/request',{}));expect(secondRequest.code).not.toBe(req.code);expect((await attacker.request('POST','/api/login/claim',{})).status).toBe(403);
 success(await screen.request('POST','/api/login/claim',{}));const me=success(await screen.request<any>('GET','/api/auth/me'));expect(me.user.id).toBe(a.user!.id);expect(me.viewOnly).toBeFalsy();screen.csrf=me.csrfToken;expect((await screen.request('POST','/api/login/claim',{})).status).toBe(401);
 const session=await a.session('All sessions visible');expect(JSON.stringify(success(await screen.request('GET','/api/sessions')))).toContain(session.id);
 const list=await s.browserAuth.list(p,{});expect(list.browsers.length).toBeGreaterThanOrEqual(2);const claimed=list.browsers.find(x=>!x.current&&x.id)!;await s.browserAuth.revoke(p,{all:true,confirm:true,requestId:'revoke-login'});expect((await screen.request('GET','/api/auth/me')).status).toBe(401);expect(claimed).toBeTruthy();
 await expect(loginDecide(s,p,{code:req.code,approvalToken:review.approvalToken,approve:true,confirm:true})).rejects.toThrow();
});
it('rotates codes at five minutes with a thirty-second grace and caps unsuccessful lookups',async()=>{
 h=await startHarness();const a=await h.account(),screen=h.browser(),s=h.runtime.service,p={userId:a.user!.id};const req=success(await screen.request<any>('POST','/api/login/request',{}));const record=(await s.store.list<any>('device-login'))[0];record.expiresAt=Date.now()-1000;await s.store.put('device-login',record);const rotated=success(await screen.request<any>('GET','/api/login/status'));expect(rotated.code).not.toBe(req.code);const review=await loginRead(s,p,{code:req.code});expect(review.code).toBe(rotated.code);const after=(await s.store.list<any>('device-login'))[0];after.previousUntil=Date.now()-1;await s.store.put('device-login',after);await expect(loginRead(s,p,{code:req.code})).rejects.toThrow(/unavailable/);for(let i=0;i<48;i++)await expect(loginRead(s,p,{code:'ZZZZZZ'})).rejects.toThrow();await expect(loginRead(s,p,{code:rotated.code})).rejects.toThrow(/Too many attempts/);const extra=await s.auth.issueToken(p.userId,'Another credential');await expect(loginRead(s,{...p,tokenId:extra.token.id,agentId:extra.token.agentId},{code:rotated.code})).rejects.toThrow(/Too many attempts/);
});
it('rejects selected-session/read-only agents and revoked approving grants, and locks a request after fifty bad confirmations',async()=>{
 h=await startHarness();const a=await h.account(),screen=h.browser(),s=h.runtime.service,p={userId:a.user!.id};const req=success(await screen.request<any>('POST','/api/login/request',{}));const scoped=await s.auth.issueToken(p.userId,'Scoped',['read','publish'],['one-session']);await expect(loginRead(s,{...p,tokenId:scoped.token.id,agentId:scoped.token.agentId},{code:req.code})).rejects.toThrow();const readOnly=await s.auth.issueToken(p.userId,'Read only',['read']);await expect(loginRead(s,{...p,tokenId:readOnly.token.id,agentId:readOnly.token.agentId},{code:req.code})).rejects.toThrow();
 const agent=await s.auth.issueToken(p.userId,'Full owner',['read','publish']),principal={...p,tokenId:agent.token.id,agentId:agent.token.agentId};const review=await loginRead(s,principal,{code:req.code});await loginDecide(s,principal,{code:req.code,approvalToken:review.approvalToken,approve:true,confirm:true});await s.auth.revokeToken(p.userId,agent.token.id);expect((await screen.request('POST','/api/login/claim',{})).status).toBe(403);
 const locker=await h.account(),q={userId:locker.user!.id};const second=h.browser(),r=success(await second.request<any>('POST','/api/login/request',{}));for(let i=0;i<50;i++)await expect(loginDecide(s,q,{code:r.code,approvalToken:'invalid-token-long-enough',approve:true,confirm:true})).rejects.toThrow();expect(success(await second.request<any>('GET','/api/login/status')).status).toBe('locked');
});
it('expires review tokens and approved claims and never claims a denied request',async()=>{
 h=await startHarness();const a=await h.account(),screen=h.browser(),s=h.runtime.service,p={userId:a.user!.id};const req=success(await screen.request<any>('POST','/api/login/request',{}));const review=await loginRead(s,p,{code:req.code});const r=(await s.store.list<any>('login-review'))[0];r.expiresAt=Date.now()-1;await s.store.put('login-review',r);await expect(loginDecide(s,p,{code:req.code,approvalToken:review.approvalToken,approve:true,confirm:true})).rejects.toThrow();expect(success(await screen.request<any>('GET','/api/login/status')).status).toBe('pending');
 const fresh=await loginRead(s,p,{code:req.code});await loginDecide(s,p,{code:req.code,approvalToken:fresh.approvalToken,approve:true,confirm:true});const request=(await s.store.list<any>('device-login'))[0];request.approvedUntil=Date.now()-1;await s.store.put('device-login',request);expect((await screen.request('POST','/api/login/claim',{})).status).toBe(403);const restarted=success(await screen.request<any>('GET','/api/login/status'));expect(restarted.status).toBe('pending');expect(restarted.code).not.toBe(req.code);expect((await screen.request('POST','/api/login/claim',{})).status).toBe(403);
 const second=h.browser(),next=success(await second.request<any>('POST','/api/login/request',{})),deny=await loginRead(s,p,{code:next.code});await loginDecide(s,p,{code:next.code,approvalToken:deny.approvalToken,approve:false,confirm:true});expect((await second.request('POST','/api/login/claim',{})).status).toBe(403);expect(success(await second.request<any>('GET','/api/login/status')).status).toBe('denied');
});
});

describe("device login coverage 3", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('six-letter session approval grants only its session and cannot access another account surface',async()=>{
 h=await startHarness();const owner=await h.account(),session=await owner.session(),other=await owner.session(),screen=h.browser();
 const pending=success(await screen.request<any>('POST','/api/login/request',{})),review=success(await owner.request<any>('POST','/api/login/lookup',{code:pending.code}));
 success(await owner.request('POST','/api/login/decide',{code:pending.code,approvalToken:review.approvalToken,approve:true,confirm:true,scope:'session',sessionId:session.id}));
 const claim=success(await screen.request<any>('POST','/api/login/claim',{}));expect(claim.viewerUrl).toBe('/session/'+session.id);
 const me=success(await screen.request<any>('GET','/api/auth/me'));expect(me.viewOnly).toBe(true);expect(me.sessionId).toBe(session.id);expect(me.user.email).toBeUndefined();expect(me.user.id).not.toBe(owner.user!.id);expect(me.user.username).toBe('guest');screen.csrf=me.csrfToken;
 for(const path of ['/api/preferences','/api/tokens','/api/reports','/api/groups'])expect((await screen.request('GET',path)).status,path).toBe(403);
 expect((await screen.request('POST','/api/sessions/'+session.id+'/submit',{requestId:'cannot-publish',view:{version:1,template:'fact',data:{text:'Must not publish'}}})).status).toBe(403);
 expect((await screen.request('GET','/api/sessions/'+session.id)).status).toBe(200);expect((await screen.request('GET','/api/sessions/'+other.id)).status).toBe(403);const sessions=success(await screen.request<any[]>('GET','/api/sessions'));expect(sessions.map(s=>s.id)).toEqual([session.id]);
 expect((await screen.request('POST','/api/login/claim',{})).status).toBeGreaterThanOrEqual(400);
});
});
