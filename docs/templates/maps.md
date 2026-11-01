# Map display

Runtime template: `map`. The caller supplies coordinates and geometry. Kanvas does not geocode names or calculate road routes. Configure basemaps through [map provider settings](../operations/maps-and-provider-options.md).

## Implemented display contract

Maps display supplied markers, paths and polygons over the configured basemap. A supplied path is not a calculated road route or turn-by-turn navigation. Its qualification, any illustrative-data label and the basemap's legal attribution remain visible. Zoom and recenter controls are opt-in; ordinary map gestures remain available.

The map fills its available frame. Map-specific overlays account for safe-area insets and do not reserve a footer. A presentation retains its actual slide navigation row. Attribution links remain keyboard-accessible and unchanged.

### Rendering and lifecycle

Vectors use Leaflet's public SVG renderer. The existing schema permits at most 500 markers, 12 routes and 12 polygons, with unchanged coordinate limits, permissions and source data. SVG avoids Canvas redraw callbacks surviving a replaced display or presentation leaf. Owned layers and the old map are removed synchronously, with no detached-map queue waiting for a hidden tab to repaint. Basemap loading/error reporting and readiness semantics are unchanged.

The [map legibility regression](../../tests/e2e/map-legibility.spec.ts) covers desktop and phone geometry, safe areas, attribution, gestures, slide navigation and replacement while browser animation callbacks are suspended.
