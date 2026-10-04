/** Annotation-only guidance. The host owns conversation memory and output;
 * this module neither creates URLs nor tracks whether a human received one. */
export const FIRST_DISPLAY_LINK_GUIDANCE = [
  'First-use viewer link: on first publication or display use for each intended display in the current host conversation, proactively give its actual returned viewerUrl or shortUrl as a literal, clickable, copyable URL. Show the URL text itself, not only a link label; do not wait to be asked.',
  'In voice/audio mode also provide that exact URL as text, not only a phonetic/spoken paraphrase. If the host cannot provide a text surface, state that limitation instead of claiming a copyable link was delivered.',
  'Use targets[].viewerUrl/shortUrl from automatic publication setup, or reuse the locator already returned for that display by register, session_state or display_current. Use kanvas_address_get only as a fallback if needed. Never invent or reconstruct a URL, call kanvas_share_create, approve a browser or change permissions merely to obtain a locator. A locator is not an access grant.',
  'Do not repeat the URL on every update; offer it again when asked or when the destination changes. The host tracks this per conversation/display; KANVAS cannot infer conversation identity or enforce what the host speaks, writes or remembers.',
  'Accepted/prepared content is not proof of receiving-browser paint. Check kanvas_update_status and describe only the observed lifecycle; giving a link does not mean the content has been shown.',
].join(' ');

export const MAX_VIEWER_LINK_GUIDANCE_CHARACTERS = 2048;

/** Operation-specific suffixes, kept independent of the catalogue/guide cycle. */
export const VIEWER_LINK_TOOL_GUIDANCE = Object.freeze({
  kanvas_session_create: 'kanvas_session_create returns an initial blank Main display and its real viewerUrl by default. Set initialDisplay:false only for an intentionally headless session. A locator never grants access or proves paint; use the returned initial display instead of registering a duplicate.',
  kanvas_display_register: 'After kanvas_display_register, proactively surface its returned viewerUrl for first-use opening. Registration does not publish content or prove that a browser opened, signed in, received approval or painted a view.',
  kanvas_submit: 'Automatic setup returns an update receipt with targets[].viewerUrl/shortUrl and a scoped targetRef. For starting Kanvas use kanvas_account_begin and the bare startUrl if a receiver must be opened. Hand over a returned viewer link only for an explicitly requested direct-link/share workflow. Explicit sessionId+displayIds keeps the existing update-only result: reuse its known locator or use kanvas_address_get as a fallback. needs_target is unresolved and has published nothing. Accepted/prepared is not browser-applied; do not repeat the link on every update.',
  kanvas_address_get: 'kanvas_address_get returns the short locator in url and, with displayId, a viewerUrl. Hand over the exact returned value. Without displayId this is a session address, not a registered-screen URL. Getting or reserving an address neither publishes content nor grants access or proves browser delivery.',
});

/** No connection-level or server-global "first use" counter: it would mistake
 * MCP connections/accounts for host conversations and suppress useful links. */
export function viewerLinkGuidanceFor(tool: string): string | undefined {
  if (!Object.hasOwn(VIEWER_LINK_TOOL_GUIDANCE, tool)) return;
  return `${FIRST_DISPLAY_LINK_GUIDANCE}\n${VIEWER_LINK_TOOL_GUIDANCE[tool as keyof typeof VIEWER_LINK_TOOL_GUIDANCE]}`;
}
