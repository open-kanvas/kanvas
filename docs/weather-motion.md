# Weather motion
Weather forecast scenes advance every three seconds (hourly and daily labels use the same dwell). Pause and explicit step selection remain available. Reduced-motion users get still scenes and manual selection; hidden tabs do not advance scenes.

The sun follows an **illustrative**, not astronomical, left-to-right arc. A supplied clock label (HH:mm, 12-hour AM/PM, or ISO date/time) determines the position, including while clouds obscure it. ISO times use their written wall-clock component, not the viewer computer's timezone. Same-day forecast entries explicitly marked sunrise/sunset anchor the arc; otherwise 06:00–18:00 are illustrative defaults. Date-only/day-name labels do not invent a clock: sunrise and sunset periods select the corresponding horizon, other periods use the middle. No location, latitude, season or actual solar elevation is calculated. The path is shared by WebGL and canvas fallback, and transitions are eased in ordinary-motion mode.

Precipitation retains three bounded GPU layers but scatters centers within cells, with seeded size and phase and different non-integer layer speeds/scales. No extra textures or particle buffers are allocated per frame. Existing 24fps cap, adaptive resolution, low-power context request, reduced-motion and visibility handling remain. This reduces grid alignment; it is not a claim of photorealism.

## Verification
- `npm test -- tests/core/weather-motion.test.ts`
- `npm run check`
- Start isolated Vite on a free loopback port, e.g. `node_modules/.bin/vite --host 127.0.0.1 --port 8804 --strictPort`.
- `WEATHER_TEST_URL=http://127.0.0.1:8804 WEATHER_EVIDENCE_DIR=/tmp/weather-evidence node tests/rendering/weather/verify.mjs` uses Playwright Chromium, desktop/phone viewports, actual GPU uniforms, step timing, reduced motion, rain/snow/storm redraw bounds and context-loss fallback. It does not need a database, credentials or application server.
- Manually inspect heavy rain/snow/storm on a real low-power phone and Windows laptop. Observe several loops, transitions into/out of cloudy scenes and sunrise/noon/sunset. Software WebGL timings and emulated viewports are not native device acceptance.
- Older photographic-weather feedback remains outside this change.
