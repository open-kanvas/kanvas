import { isSafeUrl } from './urls.js';

export const PROFILE_DETAIL_TYPES = ['text', 'phone', 'email', 'link', 'address'] as const;
export type ProfileDetailType = typeof PROFILE_DETAIL_TYPES[number];
export interface ProfileDetail { label: string; value: string; type?: ProfileDetailType }
export interface ProfileContactTarget { href: string; external: boolean }

const controls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const addressControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

/** Strip visible telephone formatting only, never infer a country or dial code.
 * Extensions are accepted as explicit x/ext text, not arbitrary URI parameters. */
export function profilePhoneHref(value: string): string | undefined {
  if (typeof value !== 'string' || value.length > 120 || controls.test(value)) return;
  const match = /^([+0-9 .()\u00a0\u202f-]+?)(?:[ \u00a0\u202f]*(?:ext(?:ension)?\.?|x)[ \u00a0\u202f]*([0-9]{1,10}))?$/i.exec(value);
  if (!match) return;
  const number = match[1].replace(/[ .()\u00a0\u202f-]/g, '');
  if (!/^\+?[0-9]{3,15}$/.test(number)) return;
  return `tel:${number}${match[2] ? `;ext=${match[2]}` : ''}`;
}

/** One mailbox only. No display-name wrapper, recipient list, URI, percent
 * escape, query or header syntax; plus addressing remains an exact recipient. */
export function profileEmailHref(value: string): string | undefined {
  if (typeof value !== 'string' || value.length > 254 || controls.test(value)) return;
  const parts = value.split('@');
  if (parts.length !== 2) return;
  const [local, domain] = parts, labels = domain.split('.');
  if (!local || local.length > 64 || !/^[A-Za-z0-9.!#$'*+\-/=^_`{|}~]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return;
  if (labels.length < 2 || !labels.every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)) || !/^[A-Za-z][A-Za-z0-9-]{1,62}$/.test(labels.at(-1)!)) return;
  const recipient = encodeURIComponent(local).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `mailto:${recipient}@${domain}`;
}

export function profileLinkHref(value: string): string | undefined {
  return typeof value === 'string' && /^https:\/\//i.test(value) && isSafeUrl(value) ? value : undefined;
}

function readableAddress(value: string): boolean {
  return typeof value === 'string' && value.length <= 4000 && Boolean(value.trim()) && !addressControls.test(value);
}

/** This is only an outbound navigation target. Constructing it performs no
 * lookup, geocoding, preview fetch or implicit disclosure to the maps provider. */
export function profileAddressHref(value: string): string | undefined {
  if (!readableAddress(value)) return;
  try {
    const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
    return isSafeUrl(href) ? href : undefined;
  } catch { return; }
}

export function profileDetailError(detail: Pick<ProfileDetail, 'type' | 'value'>): string | undefined {
  switch (detail.type) {
    case 'phone': return profilePhoneHref(detail.value) ? undefined : 'Supply a phone number with 3–15 digits, optional + and formatting, and an optional x/ext extension; no URI, query or dial commands';
    case 'email': return profileEmailHref(detail.value) ? undefined : 'Supply one plain email address; no mailto URI, recipient list, percent escapes, query or headers';
    case 'link': return profileLinkHref(detail.value) ? undefined : 'Supply a safe public HTTPS link';
    case 'address': return readableAddress(detail.value) ? undefined : 'Supply readable address text without control characters';
    default: return;
  }
}

/** An untyped value that resembles contact information is deliberately inert. */
export function profileContactTarget(detail: Pick<ProfileDetail, 'type' | 'value'>): ProfileContactTarget | undefined {
  const href = detail.type === 'phone' ? profilePhoneHref(detail.value) : detail.type === 'email' ? profileEmailHref(detail.value) : detail.type === 'link' ? profileLinkHref(detail.value) : detail.type === 'address' ? profileAddressHref(detail.value) : undefined;
  return href ? { href, external: detail.type === 'link' || detail.type === 'address' } : undefined;
}
