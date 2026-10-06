/** Annotation-only guidance. The host owns conversation memory and output;
 * this module neither creates URLs nor tracks whether a human received one. */
export const FIRST_DISPLAY_LINK_GUIDANCE = [
  'First contact: prefer an authenticated connected receiver. Ask the human to open the bare environment startUrl and sign in; then use account.begin/devices.read and window.present (one tab) or device.present (all intended windows). Do not read long session/view paths aloud.',
  'When a direct link is actually needed, prefer the returned shortUrl (or address.get url), as literal, clickable, copyable text. Use returned viewerUrl only when no short locator is available. In voice mode also provide the actual URL as text; if the host cannot provide text, explain that limitation.',
  'Use returned targets[].shortUrl or existing locators; kanvas_address_get is a fallback. Never invent or reconstruct URLs, call kanvas_share_create, approve browsers or change permissions merely to obtain a locator. A locator is not an access grant.',
  'Do not repeat the link on every update; offer it when asked or when the destination changes. The host tracks conversation state; Kanvas does not infer what the host said.',
  'Accepted/prepared content is not proof of receiving-browser paint. Check kanvas_update_status; giving a link does not mean the content has been shown.',
].join(' ');

export const MAX_VIEWER_LINK_GUIDANCE_CHARACTERS = 2048;

/** Operation-specific suffixes, kept independent of the catalogue/guide cycle. */
export const VIEWER_LINK_TOOL_GUIDANCE = Object.freeze({
  kanvas_session_create: 'kanvas_session_create returns an initial blank Main display and its real viewerUrl by default. Set initialDisplay:false only for an intentionally headless session. A locator never grants access or proves paint; use the returned initial display instead of registering a duplicate.',
  kanvas_display_register: 'After kanvas_display_register, target the connected receiver; when a link is needed prefer shortUrl over the returned viewerUrl. Registration does not publish content or prove that a browser opened, signed in, received approval or painted a view.',
  kanvas_submit: 'Automatic setup returns an update receipt with targets[].viewerUrl/shortUrl and a scoped targetRef. For starting Kanvas use kanvas_account_begin and the bare startUrl if a receiver must be opened. Hand over a returned viewer link only for an explicitly requested direct-link/share workflow. Explicit sessionId+displayIds keeps the existing update-only result: reuse its known locator or use kanvas_address_get as a fallback. needs_target is unresolved and has published nothing. Accepted/prepared is not browser-applied; do not repeat the link on every update.',
  kanvas_address_get: 'kanvas_address_get returns the short locator in url and, with displayId, a viewerUrl. Prefer its short url over viewerUrl when a direct link is needed. Without displayId this is a session address, not a registered-screen URL. Getting or reserving an address neither publishes content nor grants access or proves browser delivery.',
});

/** No connection-level or server-global "first use" counter: it would mistake
 * MCP connections/accounts for host conversations and suppress useful links. */
export function viewerLinkGuidanceFor(tool: string): string | undefined {
  if (!Object.hasOwn(VIEWER_LINK_TOOL_GUIDANCE, tool)) return;
  return `${FIRST_DISPLAY_LINK_GUIDANCE}\n${VIEWER_LINK_TOOL_GUIDANCE[tool as keyof typeof VIEWER_LINK_TOOL_GUIDANCE]}`;
}
