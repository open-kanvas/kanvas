/** What Kanvas is for, in the founder's words, and the three renderings of it:
 * the person's invitation, the agent's conduct and the maintainer's yardstick.
 * The mission wording is authoritative: keep the first person plural and the
 * whiteboard image; do not turn it into marketing copy or a feature list. This
 * module is plain text placed at the right moments. It adds no behaviour. */

export const MISSION = [
  'Kanvas is your agent\'s screen. It is a visual surface for people and their agents: any browser, any size, with no intelligence inside; the intelligence lives in the agent. Sometimes the screen is a whiteboard in a live conversation, sometimes a board the agent keeps up for you, sometimes a sign it sets and leaves.',
  'The experience at the heart of it is the feeling of working with a colleague at a whiteboard: you talk, the relevant thing appears on the screen while you speak, you point at it, it changes. Nobody asks permission, nobody narrates the mechanics, and your words get shorter because the detail is already visible. Templates, operations and schemas are how Kanvas is built; this rhythm is what it is.',
  'Our job is to make both the agent and the person reach that rhythm as fast as possible: the right information, at the right moment, with the shortest time to clarity. Get the setup, the feel and the taste right, and Kanvas can be much more than one use case while staying a light, visual surface, never a heavy application.',
] as const;

export const TEMPOS = [
  { id: 'live', pace: 'seconds', text: 'Live session: the whiteboard rhythm; publish while talking, patch on reaction. This is where taste shows most and where onboarding must land first.' },
  { id: 'kept-up', pace: 'hours', text: 'Ambient / kept-up: a checklist, a planner, a monitor, a scoreboard that stays current between conversations. Same templates, lower tempo.' },
  { id: 'static', pace: 'days', text: 'Static / signage: a menu board, opening hours, a sign. An agent sets it once and leaves it. Same surface, slowest tempo.' },
] as const;
export const TEMPO_RULES = 'All three share the same rules: no backend intelligence, native templates first, one glanceable beat per view, readable from across a room, works on any screen. A feature that only makes sense as a mini-app, a dashboard product or an orchestration layer is outside the surface regardless of tempo.';

/** Rendering 1, for the person: the first-time ready screen and "what is this". */
export const HUMAN_INVITATION = {
  line: 'Your agent can show things here while you talk.',
  examples: ['Show me the options side by side', 'Put the plan for Saturday on the screen', 'Keep a checklist up while we go through this'],
} as const;

/** Rendering 2, for the agent: returned once on first contact and as help. */
export const AGENT_CONDUCT = 'Use the screen like a colleague uses a whiteboard. When something is easier to see than to say, put it on the screen while you talk, without asking. One idea per view. When the person reacts, patch the view rather than republishing. Keep your spoken words short; the detail is on the screen. Know which tempo you are in: live (change it as you go), kept-up (keep it current), or static (set it and leave it).';
export const AGENT_RULES = ['Publish proactively.', 'One glanceable beat per view.', 'Patch, don\'t rebuild.'] as const;
export const AGENT_EXAMPLE = 'The person says "how do the three options compare?" You publish a comparison and say "on screen; B is cheaper but slower."';
/** Said once, right after the first successful publish in a session. */
export const RHYTHM_NUDGE = 'On screen. Keep publishing as you speak; patch this view with kanvas.view.patch when the person reacts.';

/** Rendering 3, for whoever changes Kanvas: asked before accepting any change. */
export const YARDSTICK = [
  'Does it serve the surface rather than add an application?',
  'At which tempo (live, kept-up, static), and does it fit that tempo?',
  'Does it reduce time to clarity for the agent or the person, or at least not increase it?',
  'Does it keep intelligence on the agent side?',
] as const;
export const YARDSTICK_RULE = 'A change that fails the first or the last question is out of scope however useful it looks.';

/** Default look and behaviour for custom visuals. A default, never a lock. */
export const DESIGN_PRINCIPLES = [
  'Purpose: Kanvas is the screen for live, mostly voice interaction with an agent. Show exactly what the person wants to see right now; anything else is one sentence away, because the agent can always change the display.',
  'Not a web app: no headers, footers, menus, navigation bars, sidebars, link lists, cookie-banner-style chrome or decorative buttons. One visual beat per screen.',
  'Use the screen: content takes most of the viewport, with large type and generous spacing, readable from across a room on a TV as well as on a phone.',
  'Restrained style: mostly black, white and grey. Use an accent sparingly and for meaning (highlight, status); the accent colour is the person\'s choice.',
  'Minimal text: show, don\'t tell. Prefer visuals, numbers and short labels over paragraphs.',
  'Fit every screen: landscape and portrait, short viewports (a 960x540 TV, a phone in landscape around 905x395) with nothing overflowing out of view. Size relatively (clamp, vw, vh).',
  'Interaction belongs to the agent and voice: the html template is static, so do not draw buttons or controls that look clickable. Use the view-level actions field when a real response is needed.',
  'Match Kanvas: reuse its fonts, colours and the person\'s theme and accent through the theme tokens instead of inventing a look.',
  'People can customise: custom templates and styling preferences are first-class.',
] as const;
export const DESIGN_NAVIGATION_RULE = 'Navigation and editing happen through the agent. Templates render content and intrinsic responses only; never navigation chrome.';
export const DESIGN_OVERRIDE_RULE = 'These principles are the DEFAULT when the person has not asked for something specific. They never override an explicit request: asked for a button, they get a button; asked for colour, a splashy design or a full web-page look, build exactly that.';
/** Compact form for the html template description: short enough to be read. */
export const DESIGN_COMPACT = 'Default look: one visual beat filling the screen, large type, mostly greyscale with a sparing accent, short labels over paragraphs, no web-page chrome (headers, menus, footers, fake buttons), sized with clamp/vw/vh so it fits a 960x540 TV and a phone. Use the theme tokens (var(--kanvas-bg), --kanvas-fg, --kanvas-muted, --kanvas-accent, --kanvas-line, --kanvas-font) so it follows the person\'s theme. An explicit request from the person always wins. Full text: help kanvas.help.design-philosophy.';
/** CSS custom properties custom HTML may reference; they follow theme and accent. */
export const THEME_TOKENS = {
  '--kanvas-bg': 'Page background of the current theme.',
  '--kanvas-fg': 'Main text colour.',
  '--kanvas-muted': 'Secondary text colour.',
  '--kanvas-accent': 'The person\'s accent colour.',
  '--kanvas-line': 'Hairlines and quiet borders.',
  '--kanvas-panel': 'Raised surface behind grouped content.',
  '--kanvas-font': 'The Kanvas text font stack.',
} as const;

/** One declared tempo per session. Deterministic, never inferred by a model. */
export const SESSION_MODES = ['live', 'presenting', 'ambient', 'signage'] as const;
export type SessionMode = typeof SESSION_MODES[number];
export const MODE_GUIDANCE: Record<SessionMode, string> = {
  live: 'Live: publish proactively while talking; patch on reaction.',
  presenting: 'Presenting: stay inside the deck, navigate on cue, add nothing unless asked.',
  ambient: 'Ambient: refresh on schedule; no unprompted new content.',
  signage: 'Signage: never publish unprompted; confirm every change.',
};
/** Quieter wins a tie: a wrong-quiet guess costs one request, a wrong-loud one redraws a sign. */
export const MODE_QUIETNESS: Record<SessionMode, number> = { live: 0, presenting: 1, ambient: 2, signage: 3 };
export const SIGNAGE_PACK = ['menu-board', 'opening-hours', 'closed-sign', 'custom-sign', 'hiring', 'back-at', 'health-notice', 'todays-special', 'signage'] as const;

/** The session -> displays -> devices/windows model in five lines. */
export const DISPLAY_MODEL = [
  'A session is one topic. It holds displays, saved state (checklists, task lists) and settings.',
  'A display is a named place for content inside a session ("Main", "Wall"). Each display shows one view at a time and keeps its own history.',
  'A view is what a display shows: one template plus its data. A slide is a view inside a presentation.',
  'A device is a registered browser (a TV, a laptop, a phone). A window is one open tab of it. Devices show displays; they are not displays.',
  'To put something on a second screen: create a display with kanvas.display.register, point a device window at it with kanvas.window.present, then publish with displayIds.',
] as const;
/** What "connected" means for a passive viewer. */
export const PRESENCE_RULE = 'A viewer is connected while its browser holds an open stream to the display; no interaction is needed, so a TV that is simply on stays connected. A stream that drops is "reconnecting" for 30 seconds and is not reported as left; only a stream that stays away that long, or a window that closes, is a leave. Join and leave notices follow the same rule. A display has one size of its own: the largest connected screen in the foreground. Each viewer\'s own width and height are listed on the viewer.';
