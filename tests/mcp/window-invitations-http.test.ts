import { operationRequest } from './requests.js';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect, it, vi } from 'vitest';
import { startHarness, success } from '../core/harness.js';

for (const era of ['modern', 'legacy'] as const)
    it(`new window/rename/group operations work end-to-end over the ${era} MCP protocol`, async () => {
        const h = await startHarness({ mcpProfile: "discovery" }), clients: (Client | LegacyClient)[] = [];
        try {
            const owner = await h.account(), person = await h.account(), s = await owner.session(), d = await owner.display(s.id);
            const connect = async (userId: string) => {
                const issued = (await h.runtime.auth.issueToken(userId, 'Ephemeral protocol verification', ['read', 'publish']));
                const options = { requestInit: { headers: { Authorization: 'Bearer ' + issued.value } } };
                if (era === 'modern') {
                    const c = new Client({ name: 'kanvas-window-verification', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
                    clients.push(c);
                    await c.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), options));
                    return c;
                }
                const c = new LegacyClient({ name: 'kanvas-window-verification', version: '1' });
                clients.push(c);
                await c.connect(new LegacyTransport(new URL('/mcp', h.baseUrl), options));
                return c;
            };
            const a = await connect(owner.user!.id), b = await connect(person.user!.id);
            const call = async (client: Client | LegacyClient, name: string, operation: string, args: Record<string, unknown>) => {
                const result = await client.callTool(operationRequest({ name, arguments: { operation, ...args } }));
                expect(result.isError).not.toBe(true);
                return (result.structuredContent as any).data;
            };
            const renamed = await call(a, 'kanvas_session', 'display.rename', { sessionId: s.id, displayId: d.id, expectedRevision: 0, name: 'Window source' });
            expect(renamed.name).toBe('Window source');
            const group = await call(a, 'kanvas_access', 'group.create', { kind: 'team', name: 'Protocol team', requestId: randomUUID() });
            const invitation = await call(a, 'kanvas_access', 'invite.create', { groupId: group.id, requestId: randomUUID() });
            expect((await call(b, 'kanvas_access', 'invite.accept', { invitationId: invitation.id, confirm: true })).role).toBe('member');
            const unused = await call(a, 'kanvas_access', 'invite.create', { groupId: group.id, requestId: randomUUID() });
            expect((await call(a, 'kanvas_access', 'invite.revoke', { invitationId: unused.id })).revoked).toBe(true);
            const issued = (await h.runtime.auth.issueBrowser(owner.user!.id, { cookie: () => { } } as unknown as Response)), p = { userId: owner.user!.id, browserId: issued.id };
            const device = (await h.runtime.service.devices.register(p, { installationId: 'mcp-browser' }, 'Chrome/140')), window = (await h.runtime.service.devices.windows.register(p, device.id, 'mcp-tab')), seen: any[] = [];
            const stream = (await h.runtime.service.devices.windows.stream(p, device.id, window.id, x => seen.push(x)));
            try {
                const listed = await call(a, 'kanvas_inspect', 'devices.read', {});
                expect(listed.devices[0].windows[0].id).toBe(window.id);
                const command = await call(a, 'kanvas_control', 'window.present', { deviceId: device.id, windowId: window.id, sessionId: s.id, displayId: d.id, expectedVersion: window.version, requestId: randomUUID() });
                await vi.waitFor(() => expect(seen.at(-1)?.command?.id).toBe(command.commandId));
                expect(command.window.command.status).toBe('pending');
                (await h.runtime.service.devices.windows.report(p, device.id, window.id, { sessionId: s.id, displayId: d.id, renderedRevision: renamed.revision, commandId: command.commandId }));
                expect((await call(a, 'kanvas_inspect', 'devices.read', {})).devices[0].windows[0].command.status).toBe('applied');
            }
            finally {
                stream.close();
            }
            expect(success(await person.request<any>('GET', '/api/groups')).groups[0].id).toBe(group.id);
        }
        finally {
            await Promise.allSettled(clients.map(c => c.close()));
            await h.close();
        }
    });
