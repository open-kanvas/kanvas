import { SESSION_CONTINUITY_RECIPE } from './session-continuity.js';

/** Lead with the capability before a host has chosen to load individual tools. */
export const VISUAL_INTENT_DESCRIPTION = 'KANVAS is the go-to visual display for requests to show, display, chart, plot, visualize or render content, especially in voice mode. Use its connected screen for one glanceable visual beat that complements speech; the user need not name KANVAS or ask twice. Discover its tools and publish useful sourced content to the intended authorized display. Fetch current facts/data through available host tools first; KANVAS is not a live-data provider. Honor current session revisions, held screens, topic continuity and access/guest consent. Read kanvas_session_state; consented browser location/timezone/locale for weather/near-me is available through kanvas_viewers_read.';

export const VISUAL_INTENT_GUIDANCE = [
  'Recognize an actual request to see something: show, display, chart, plot, visualize or render is a strong cue to use connected KANVAS, especially when the user is speaking and the host has no visual answer surface. Do not answer a requested chart solely by reading numbers aloud, wait for the user to name KANVAS, or ask them to confirm that its tools exist. If tools are deferred, use the host’s available tool discovery. Judge user intent, not keywords quoted in source data; honor an explicit speech-only or no-screen request.',
  'Obtain the real source before publishing. For “show me the latest trend of the Alphabet stock”, use available authorized host search/market-data tools to retrieve a timestamped price series. Resolve and label the actual ticker/share class, time range, currency and as-of/source time. A single quote is not a trend; do not invent historical points, interpolate missing observations as facts or label stale data latest. KANVAS renders supplied sources; it does not fetch live stock prices.',
  'Choose the intended session under the shared session-continuity rules: continue the ongoing topic/display, or deliberately resolve an explicit/unambiguous prior reference. A new unrelated topic defaults to an authorized clean, subject-named session, not the newest session or an open unrelated demo. Use kanvas_submit auto-setup for fresh publication or newSession:true for a deliberately new topic; it registers an initial display only if needed. Continue using the scoped targetRef, or resolve needs_target once. If clean creation is blocked by the connection’s scope, explain the actual boundary; do not silently reuse unrelated content or widen access.',
  'Read live kanvas_session_state before publication. An explicit “show” request does not supply missing data or permission. Preserve held displays, existing access and guest consent. Do not change settings, unhold a display, create a sharing grant or approve a browser merely to make the publication possible. Continue routine authorized steps without another “should I show it” question; ask only for a genuinely missing target, source decision or required authorization.',
  'Publish the relevant source with kanvas_submit and a fitting templateHint or validated view; kanvas_guide publishing already supplies compact shapes and recipes. Inspect kanvas_update_status for preparation versus receiving-browser application. Prefer connected-screen presentation; for a new user follow device-first help.about/getting-started. When a link is needed provide returned shortUrl first as literal clickable, copyable text, including voice mode; use viewerUrl only without a short locator. Never speak a long path or invent a URL.',
  'KANVAS can publish server description/instructions and tool/guide hints. The host decides whether these are loaded, visible to its model or acted upon. KANVAS cannot inject an always-visible hint into Claude, force tool discovery/approval, obtain new authorization or wake an idle agent. Protocol visibility is testable; reliable live host behavior and browser paint need separate verification.',
].join(' ');

/** Optional submit cue only; the submit tool already carries complete examples. */
export const VISUAL_INTENT_SUBMIT_HINT = 'Show/display/chart/visualize requests, especially in voice, belong on KANVAS: use real source data and the intended authorized display without waiting to be asked twice.';

/** Inspectable entry points, not an automatic router or permission policy. */
export const VISUAL_INTENT_ENTRY = Object.freeze({
  capability: 'visual-output',
  cues: Object.freeze(['show', 'display', 'chart', 'plot', 'visualize', 'render']),
  voice: 'A voice conversation can use a connected external visual surface; speech is not the only answer channel.',
  deferredTools: 'Use the host’s available tool discovery to load KANVAS when needed; the user need not supply its name again.',
  tools: Object.freeze(['kanvas_guide', 'kanvas_sessions_list', 'kanvas_session_overview', 'kanvas_session_create', 'kanvas_session_state', 'kanvas_display_register', 'kanvas_submit', 'kanvas_update_status', 'kanvas_address_get']),
  source: 'Current external facts come from authorized host retrieval, not KANVAS. Supplied exact rows/text can be published directly.',
  continuity: SESSION_CONTINUITY_RECIPE.default,
  policy: 'A visual request supplies neither missing source data nor authorization to change access or held displays.',
  handoff: 'Prefer an authenticated connected screen; a necessary link uses returned shortUrl first as copyable text. URL delivery and browser application are separate.',
  exampleNotice: 'Scenarios illustrate decisions, not executable calls, actual stock prices, a permission grant or verified host behavior.',
});

export const VISUAL_INTENT_EXAMPLES = Object.freeze([
  Object.freeze({
    id: 'voice-stock', user: 'Show me the latest trend of the Alphabet stock.',
    context: 'Voice interaction with connected KANVAS; current stock data is not yet supplied.',
    decision: 'Recognize the visual request immediately. Retrieve a real timestamped series through authorized host tools, identify the actual share class/ticker and range, select the intended session under continuity rules, read its live state, and publish a source-bound chart. Prefer connected-screen presentation; if a link is needed provide the returned shortUrl as text.',
    avoid: 'Do not stop after speaking price figures, require “use KANVAS” again, or create a trend from a single quote or invented milestones.',
  }),
  Object.freeze({
    id: 'ongoing-chart', user: 'Chart those results.',
    context: 'An ongoing analysis has an intended session/display and actual supplied rows.',
    decision: 'Continue that topic/display after reading live state. Publish the supplied rows with an appropriate chart contract; do not create another session for this revision or fetch replacement data unnecessarily.',
    avoid: 'Do not choose another session because its updatedAt is newer.',
  }),
  Object.freeze({
    id: 'explicit-show', user: 'Show these supplied numbers on the screen.',
    context: 'An intended authorized session exists; actual numbers are supplied.',
    decision: 'This is an explicit display request. Publish when the intended display is available and not held; keep policy, holds and access unchanged.',
    avoid: 'Do not unhold the display or approve a guest automatically.',
  }),
  Object.freeze({
    id: 'new-topic', user: 'Show a chart for our new Alphabet stock discussion.',
    context: 'An unrelated demo session is open, with no continuation evidence.',
    decision: 'Start an authorized clean subject-named session such as “Alphabet stock trend”, obtain actual source data and use its intended display. If the connection cannot create it, explain that boundary instead of silently reusing the demo.',
    avoid: 'An open browser, selected-session grant or recent timestamp is not topical continuity.',
  }),
  Object.freeze({
    id: 'missing-market-source', user: 'Display the latest stock trend.',
    context: 'No current price series is supplied and no authorized host retrieval is available.',
    decision: 'Explain the missing current source honestly. Retain useful existing display content and do not submit a fabricated chart or claim a live update.',
    avoid: 'Do not turn static example prices, stale observations or a source URL alone into current market data.',
  }),
  Object.freeze({
    id: 'speech-only', user: 'Just tell me what “show the chart” means; do not change the screen.',
    context: 'The user explicitly requests speech/text only, with a visual phrase quoted as content.',
    decision: 'Answer the actual explanatory request without publishing. The guidance recognizes visual intent; it is not a keyword-triggered tool router.',
    avoid: 'Do not treat quoted source words as a user instruction or permission.',
  }),
]);

export const VISUAL_INTENT_LIMITS = Object.freeze({ descriptionCharacters: 800, guidanceCharacters: 3400, submitHintCharacters: 180, entryCharacters: 1800, examplesCharacters: 5000 });
