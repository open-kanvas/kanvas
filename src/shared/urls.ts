/** Shared URL policy. No schema imports: usable by both contract modules. */
function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.includes(':')) {
    // URLs normalize IPv6; deny literal local, mapped IPv4, multicast and link-local destinations.
    return !(/^(::|fc|fd|fe[89ab]|ff)/i.test(host) || host.startsWith('2001:db8:'));
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  return host.includes('.');
}

export function isSafeUrl(value: string): boolean {
  if (value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  if (/^\/api\/assets\/[a-zA-Z0-9_-]{1,128}$/.test(value)) return true;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && isPublicHost(url.hostname);
  } catch { return false; }
}

export function isAllowedEmbedUrl(value: string): boolean {
  if (!isSafeUrl(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return (url.hostname === 'www.youtube-nocookie.com' && /^\/embed\/[a-zA-Z0-9_-]{11}$/.test(url.pathname))
      || (url.hostname === 'player.vimeo.com' && /^\/video\/\d+$/.test(url.pathname))
      || (url.hostname === 'www.openstreetmap.org' && url.pathname === '/export/embed.html');
  } catch { return false; }
}
