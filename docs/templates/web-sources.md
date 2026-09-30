# Web view and retained web sources

Current name: **Web view**, stable template ID **iframe**. Supply 1–16 public HTTPS pages. Grid is the default; the top toolbar is removed. Explicit paged layouts use agent navigation. Each page can request a desktop or scaled mobile viewport. See [current behavior and limits](../README.md) and [public usage/schema links](https://kanvas.creatrix.no/docs/iframe). Remote embedding restrictions are respected; container delivery is never proof of remote content. No proxy or cross-origin DOM access is added.

The documentation below describes retained legacy `web` views only. This template is not part of current public discovery or new public publication schemas.

# Retained Web / source display

**Status:** Accepted category; individual layouts and implementation details remain exploratory. Planning only, not a committed feature list.

## Implemented boundary — 2026-09-09

The planning options below are not claims of an implemented fetcher. Current `web` content takes a supplied URL, optional title/text, optional supplied snapshot/capture time, or an allowed publisher embed. **KANVAS does not fetch or verify the page.** Every supplied text card visibly says “Agent-supplied text, not a fetched excerpt” and “KANVAS has not fetched or checked this page”. Snapshot and capture-time labels likewise say supplied/unverified. An agent cannot set a `verified` flag to remove those labels.

Opaque embed navigation is not proof of visible publisher content. Readiness and visual readback must preserve that distinction. The [runtime schemas](../../src/shared/view-schemas.ts) remain authoritative; server-side extraction and arbitrary page reconstruction remain outside this implementation.

## Candidate layouts

Allowed live embed, source preview card, extracted excerpt, page screenshot.

## Core information

Source URL, relevant content or snapshot, retrieval time and representation type.

## Web display: distinguish live embedding from derived views

### 1. Live embed where the publisher supports it

Use an iframe or official embed URL when allowed and useful. `Content-Security-Policy: frame-ancestors` and `X-Frame-Options` can prohibit embedding. Cross-origin embedding is not the same as cross-origin DOM access; CORS is not the primary framing permission mechanism. KANVAS cannot normally inspect or restyle the contents of an unrelated-origin iframe. Authentication, third-party cookies, sandbox settings, and the full ancestor chain of nested embeds can introduce further constraints.

### 2. Extract and render an excerpt in a KANVAS template

The useful version of the user's HTML-rebuilding idea is to fetch authorized/public content, extract the relevant title/text/image/table, and render those fields in a standard source-card or excerpt template. This suits the template-first architecture. Clearly show the source link and that this is an excerpt or summary, not the original live page.

Fetching HTML server-side does not guarantee a usable page: JavaScript-rendered content, relative assets, authentication, and interactive state may be absent. Retrieval adds latency and may need caching. It is not a universal workaround for a site's framing restriction or a reason to remove that site's security headers. Retrieval ownership remains open; the connected agent may already provide the relevant source content.

### 3. Snapshot when visual appearance matters

A screenshot or selected-region image can show what a page looked like when captured, where authorized browser access exists. It is a timestamped, non-interactive snapshot, not a live website, and capture can be slower than rendering a text preview. This is an optional candidate, not a guaranteed fallback for every URL.

### Avoid arbitrary fetched HTML execution as the default

Cloning a third-party page and executing its original scripts under KANVAS is brittle, costly, and inconsistent with a small, predictable display service. Prefer structured extraction plus safe rendering. Any eventual fetch/render feature needs bounded fetching, protection against access to internal network destinations, and isolation/sanitization of untrusted markup; no arbitrary source scripts should run with KANVAS account access.

If embedding and authorized extraction/capture are unavailable, retain a source-link card rather than promising to reconstruct the site. Proposed fallback behavior remains to be validated; iframe failures are not always reliably detectable from the parent page.

See the [template index](README.md) for shared planning boundaries and related categories.
