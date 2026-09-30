import { z } from 'zod';

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const text = (max: number) => z.string().max(max).refine(value => value.trim().length > 0, 'Supply meaningful text');
const timestamp = z.string().max(40).refine(value => Number.isFinite(Date.parse(value)), 'Use an ISO 8601 timestamp');
export const DEVICE_KINDS = ['desktop', 'laptop', 'phone', 'tablet', 'tv', 'other'] as const;
export type DeviceKind = typeof DEVICE_KINDS[number];
export type BrowserKind = 'chrome' | 'safari' | 'firefox' | 'edge' | 'opera' | 'other';

/** Account device and browser-window inventory, usually from devices.read
 * (its publishRecipe). Shows supplied states only; it never probes devices. */
export const devicesViewDataSchema = z.object({
  devices: z.array(z.object({
    id: identifier.optional(),
    name: text(120),
    kind: z.enum(DEVICE_KINDS).optional().describe('Device type; otherwise derived from device and name.'),
    device: z.string().max(80).optional().describe('Detected device, for example Mac, Windows computer, iPhone, Android device or TV.'),
    browser: z.string().max(40).optional().describe('Chrome, Safari, Firefox, Edge, Opera or another browser.'),
    connected: z.boolean().optional(),
    lastSeenAt: timestamp.optional(),
    windows: z.array(z.object({
      id: identifier.optional(), name: z.string().max(120).optional(), connected: z.boolean().optional(), lastSeenAt: timestamp.optional(),
      sessionId: identifier.optional(), sessionName: z.string().max(160).optional(), displayId: identifier.optional(), displayName: z.string().max(120).optional(),
    }).strict()).max(40).default([]),
  }).strict()).min(1).max(100),
  groupBy: z.enum(['device', 'session']).default('device').describe('device: one card per device with its windows. session: windows grouped by the session they show or last showed.'),
  showOffline: z.boolean().default(true),
}).strict();
export type DevicesViewData = z.infer<typeof devicesViewDataSchema>;

export function deviceKind(item: { kind?: DeviceKind; device?: string; name?: string }): DeviceKind {
  if (item.kind) return item.kind;
  const text = `${item.device ?? ''} ${item.name ?? ''}`;
  if (/\bTV\b|television/i.test(text)) return 'tv';
  if (/iPad|tablet/i.test(text)) return 'tablet';
  if (/iPhone|Android|phone|mobile/i.test(text)) return 'phone';
  if (/laptop|MacBook|notebook/i.test(text)) return 'laptop';
  if (/Mac|Windows|Linux|computer|desktop|\bPC\b/i.test(text)) return 'desktop';
  return 'other';
}
export function browserKind(browser?: string): BrowserKind {
  const name = (browser ?? '').toLowerCase();
  return name.includes('edge') ? 'edge' : name.includes('opera') ? 'opera' : name.includes('firefox') ? 'firefox' : name.includes('chrome') ? 'chrome' : name.includes('safari') ? 'safari' : 'other';
}
