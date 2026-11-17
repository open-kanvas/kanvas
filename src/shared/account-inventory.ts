import {z} from 'zod';

export const accountInventorySchema = z.object({
  includeEnded: z.boolean().optional().describe('Also list ended sessions (default false).'),
}).strict();

/** Which operations read or change each account resource (canonical names;
 * MCP profiles show their own tool and operation names). */
export const ACCOUNT_MANAGE = {
    sessions: { read: ["kanvas.sessions.list", "kanvas.session.state", "kanvas.session.overview"], change: ["kanvas.session.create", "kanvas.session.rename", "kanvas.config.update", "kanvas.session.context.set", "kanvas.session.end"] },
    displays: { read: ["kanvas.topology.read", "kanvas.display.current", "kanvas.displays.sync.read"], change: ["kanvas.display.register", "kanvas.display.rename", "kanvas.display.update", "kanvas.clear", "kanvas.displays.identify", "kanvas.displays.sync"] },
    devices: { read: ["kanvas.devices.read"], change: ["kanvas.device.rename", "kanvas.device.present", "kanvas.window.present"] },
    connections: { read: ["kanvas.topology.read", "kanvas.viewers.read"], change: ["kanvas.connection.redirect", "kanvas.window.present", "kanvas.pairing.revoke"] },
    people: { read: ["kanvas.participants.read", "kanvas.group.access.read", "kanvas.pairings.read"], change: ["kanvas.member.add", "kanvas.member.remove", "kanvas.invite.create", "kanvas.invite.revoke", "kanvas.group.access.set", "kanvas.pairing.decide", "kanvas.share.create", "kanvas.session.public.access"] },
    groups: { read: ["kanvas.groups.list", "kanvas.group.read"], change: ["kanvas.group.create", "kanvas.group.update", "kanvas.group.member.set"] },
    profile: { read: ["kanvas.profile.read", "kanvas.preferences.get", "kanvas.activity.read"], change: ["kanvas.profile.update", "kanvas.preferences.update"] },
} as const;
export const ACCOUNT_GAPS = ['Not available through tools yet: deleting registered devices or displays, and renaming individual browser windows.'] as const;
