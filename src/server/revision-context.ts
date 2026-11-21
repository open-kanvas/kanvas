import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
/** Used only for invalid guard syntax, via authorized read paths. Never guesses
 * authority from a submitted ID and never applies a mutation while diagnosing. */
export async function revisionContext(s: KanvasService, p: AuthPrincipal, name: string, a: Record<string, any>, field: string): Promise<number | undefined> {
    await s.fullAccount(p);
    if (name.startsWith('kanvas.guidance.')) {
        const r = await s.guidance.read(p, { scope: a.scope, sessionId: a.sessionId, groupId: a.groupId });
        return field === 'expectedDraftRevision' ? r.draft.revision : r.revision;
    }
    if (a.checklistId && a.sessionId) {
        const r = await s.checklists.read(p, { sessionId: a.sessionId, checklistId: a.checklistId }) as {
            revision?: number;
        };
        if (name === "kanvas.checklist.update")
            return r.revision;
    }
    if (a.deckId && a.sessionId && field === 'expectedDeckRevision') {
        const r = await s.flashcards.read(p, { sessionId: a.sessionId, deckId: a.deckId }) as {
            revision?: number;
        };
        return r.revision;
    }
    if (name === "kanvas.autoplay.control" && field === 'expectedVersion')
        return (await s.autoplay.read(p, { sessionId: a.sessionId, displayId: a.displayId })).version;
    if (a.jobId && a.sessionId) {
        const r = await s.monitoring.read(p, { sessionId: a.sessionId, jobId: a.jobId }) as {
            version?: number;
        };
        return r.version;
    }
    if (a.reportId) {
        const r = await s.store.get<{
            authorId: string;
            accountId?: string;
            sessionId?: string;
            scope?: string;
            revision: number;
        }>('report', a.reportId);
        if (!r)
            return undefined;
        if (name === "kanvas.report.patch") {
            if (r.authorId !== p.userId)
                return undefined;
            if (r.sessionId)
                await s.access(p, r.sessionId);
            return r.revision;
        }
        if (r.sessionId) {
            await s.access(p, r.sessionId, 'owner');
            if (a.sessionId !== r.sessionId)
                return undefined;
            return r.revision;
        }
        await s.accounts.account(p);
        if (r.scope === 'account' && r.accountId === p.userId)
            return r.revision;
        if (r.scope === 'service' && await s.accounts.isServiceAdmin(p))
            return r.revision;
        return undefined;
    }
    if (name === "kanvas.config.update" && a.scope && a.scope !== 'session') {
        await s.access(p, a.sessionId, 'editor');
        if (a.scope === 'account')
            return (await s.experience.preferences(p)).revision;
        if (a.groupId) {
            const group = await s.accounts.read(p, a.groupId);
            if (group.kind === a.scope)
                return group.revision;
        }
        return undefined;
    }
    if (name === "kanvas.preferences.update")
        return (await s.experience.preferences(p)).revision;
    if (name === "kanvas.profile.update")
        return (await s.accounts.profile(p)).revision;
    if (a.groupId && ["kanvas.group.update", "kanvas.group.member.set"].includes(name))
        return (await s.accounts.read(p, a.groupId)).revision;
    if (a.deviceId && field === 'expectedVersion') {
        await s.accounts.account(p);
        const device = await s.store.get<{
            id: string;
            ownerId: string;
            version: number;
        }>('registered-device', a.deviceId);
        if (!device || device.ownerId !== p.userId)
            return undefined;
        if (a.windowId) {
            const w = await s.store.get<{
                deviceId: string;
                ownerId: string;
                version: number;
            }>('registered-window', a.windowId);
            return w?.deviceId === device.id && w.ownerId === p.userId ? w.version : undefined;
        }
        return device.version;
    }
    if (a.sessionId) {
        const session = await s.access(p, a.sessionId);
        if (a.displayId)
            return (await s.display(p, a.sessionId, a.displayId)).revision;
        if (name === "kanvas.pointing.configure")
            return (await s.pointing.read(p, { sessionId: a.sessionId })).revision;
        if (name === "kanvas.session.public.access")
            return session.publicAccess?.revision ?? 0;
        if (name === "kanvas.session.context.set") {
            const r = await s.accounts.context(p, a.sessionId);
            return r.context.revision;
        }
        if (name === "kanvas.group.access.set") {
            const result = await s.accounts.grants(p, a.sessionId);
            return result.grants.find(g => g.groupId === a.groupId)?.revision ?? 0;
        }
        return session.configRevision;
    }
    return undefined;
}
