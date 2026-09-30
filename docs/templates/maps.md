# Map display

**Status:** Accepted and implemented for supplied locations, paths and polygons. The original planning notes below retain provider and routing ideas; they are not claims that those external integrations have been implemented. The current runtime contract is recorded below.

## Candidate layouts

Single location, route, multiple locations, highlighted region.

## Core information

Coordinates/place identifiers, route geometry or routing inputs, optional labels and geographic bounds.

## Map display: high-quality maps with reusable views

The user explicitly requested map display as its own category, using a high-quality mapping service such as Mapbox or Google Maps. These are candidates, not a selected provider. The first user-proposed templates are a simple location map and a plotted route; multi-location and highlighted-region variants are additional candidates.

- **Location:** show a place with an appropriate center/zoom and optional marker/label.
- **Route:** show an existing route geometry, or use a routing service to calculate a route from supplied stops and a travel mode. Drawing a supplied path and calculating a navigable route are distinct operations; do not invent road geometry.
- **Multiple locations:** show several labeled markers and fit the view to their bounds.
- **Region:** highlight a supplied geographic area while preserving surrounding context.

For speed, investigate initializing the map SDK/style ahead of demand and reusing a ready map instance while updating markers, route layers, and camera bounds. Prefer deterministic templates over rebuilding a map integration for each request. Preloading is an option to measure, not an assumption that every screen should load a full map immediately: mobile/WebView memory, bandwidth, provider usage costs, and provider caching rules need consideration. Geocoding, routing, and network tile loading can still add latency even with a warm renderer.

The caller supplies coordinates and geometry; the map renderer displays them. See the generic map tile configuration guide.

See the [template index](README.md) for shared planning boundaries and related categories.

## Implemented display contract

Maps display supplied markers, paths and polygons over the configured basemap. A supplied path is not a calculated road route or turn-by-turn navigation. Its qualification, any illustrative-data label and the basemap's legal attribution remain visible. Zoom and recenter controls are opt-in; ordinary map gestures remain available.

The map fills its available frame. Map-specific overlays account for safe-area insets and do not reserve a footer. A presentation retains its actual slide navigation row. Attribution links remain keyboard-accessible and unchanged.

### Rendering and lifecycle

Vectors use Leaflet's public SVG renderer. The existing schema permits at most 500 markers, 12 routes and 12 polygons, with unchanged coordinate limits, permissions and source data. SVG avoids Canvas redraw callbacks surviving a replaced display or presentation leaf. Owned layers and the old map are removed synchronously, with no detached-map queue waiting for a hidden tab to repaint. Basemap loading/error reporting and readiness semantics are unchanged.

The [map legibility regression](../../tests/e2e/map-legibility.spec.ts) covers desktop and phone geometry, safe areas, attribution, gestures, slide navigation and replacement while browser animation callbacks are suspended.
