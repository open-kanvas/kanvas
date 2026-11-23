# Visual controls

- `view.theme:"light"|"dark"` overrides only the current view (including a slide/pane). Omission inherits the session; session style/account settings are not modified.
- Charts accept `data.textScale` from 0.5–3 (default 1), affecting labels/ticks/axis units/legends independently of plot zoom. Financial plots fit all observations to width by default, thinning labels only; `fitWidth:false` restores scrollable bars.
- Countdown `data.precision`: seconds (default), minutes, or auto (hide seconds at ten minutes or more). Down-counts round displayed minutes up; count-up rounds down. Original timing/pausing math stays in seconds.
- Scoreboard `size`: standard, large (default), extra-large. `logoPosition`: beside/above; `logoSize`: 0.5–3. Score/name fitting stays bounded per side.
- Today’s special `imagePosition`: background (default), left, right. Background imagery gets a text scrim and filled badges; side images stack on phones.
- Session topology `density`: comfortable (default) or compact. Connections use independent-height responsive display cards across the available width.
- Planner month entries place all-day entries first and timed entries chronologically. Use allDay with date-only, exclusive-end bounds for multi-day spans. Timed multi-day events intentionally occupy their full interval.

## Server captures

The isolated viewer applies session textSize even though navigation/interaction is disabled. Per-window zoom is intentionally not inherited; use session textSize for reproducible captures. Image/image-gallery pixels fit independently of session textSize, while explicit window zoom remains local.

Viewer and capture use the same bundled Inter upright variable font, weights 100–900, with its SIL OFL notice. Custom authored CSS can still select a different locally installed font, so arbitrary system-ui fonts are platform-dependent. Sandboxed HTML remounts its document on change, owns a full-height frame for positioned content, and cannot acknowledge from an obsolete detached iframe.

Only built-in HTTPS OpenStreetMap raster tile paths can cross the capture network boundary: public DNS resolution is checked and pinned per request, redirects rejected, no browser cookies forwarded, 128 requests/16 queued concurrent connections/16 MiB aggregate/512 KiB per tile/6 seconds per request/20 seconds overall. Other external media remains blocked. Local bundled fonts are explicit same-origin paths.

Capture count follows the session owner's entitlement: trial 100, free 1000, admin no count quota. All still have the existing 200 MiB session media budget, image-size and capture-concurrency/rate limits. No user is granted administrator authority by this policy.
