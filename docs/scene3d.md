# Metric spatial scenes (bounded MVP)

`scene3d` is one supplied-geometry template, not an interior designer, soccer app or marine planning system. Inspect its schema through normal template discovery. Source-labelled examples in `sceneReferences` cover room, soccer and harbor using identical objects/cameras.

## Coordinates and transforms

Metres, right-handed XYZ, +Y up. `objects` is a record keyed by stable IDs matching `[A-Za-z][A-Za-z0-9_-]{0,63}`. Each object has label, box/cylinder/sphere shape, full XYZ size, centre position, Euler rotation in degrees and XYZ scale. Apply size/scale, then X, Y, Z rotations, then translate. Cylinder axis is local Y; sphere size may create an ellipsoid. Hidden objects remain stored. Highlight changes their outline. At most 80 objects. No hierarchy, physics, collision facts, arbitrary code/URLs, animation or photorealism.

`camera.mode` is `perspective` or `overhead`; position/target specify a look-at camera. Perspective FOV is vertical degrees. Overhead is a true orthographic X/Z projection of the **same transformed geometry**, +Z down on the page; position/FOV are retained for switching back. `span` is metres across the central 800 SVG units. Dimension rulers measure visible world-axis bounding extents (including rotations); object labels/list show scaled local XYZ size, not clearance. These are supplied schematic measurements, not surveyed or engineering-certified facts.

The dependency-free SVG renderer clips polygons at 0.02 m before perspective division and sorts faces back-to-front. This painter ordering is approximate for intersecting geometry, not a depth buffer; avoid interpenetrating objects. Flat colors/edges, faceted spheres/cylinders; no shadows/textures. Extremely close camera poses can fill/clip the viewport. Explicit camera target/span controls framing, not automatic fit. Mobile label readability and complex overlapping geometry need owner acceptance.

## Narrow operations, atomic batches and history

Use ordinary submit/direct literal publication with `templateHint: "scene3d"` and this data, then `display.current` to read authoritative normalized object IDs and revision. Use `view.patch` (legacy `kanvas_view_patch`) with sessionId/displayId/requestId/expectedRevision:

```json
{"operations":[
 {"op":"set","path":"/data/objects/C1/position","value":[2,0.4,1]},
 {"op":"set","path":"/data/objects/C1/rotation","value":[0,90,0]},
 {"op":"set","path":"/data/camera/mode","value":"overhead"}
]}
```

All operations validate and commit atomically. Same requestId/input retries dedupe; stale expectedRevision fails. Unmentioned objects and camera fields survive. Add an object with `set /data/objects/C3` and a complete object value; remove with `remove /data/objects/C3`. `visible`, `highlight`, `size`, `scale`, `position`, `rotation`, `camera.target/position/span/fov` are ordinary narrow fields. Geometry/state persist through existing display storage, not a browser-only scene.

Undo/select retained revisions through `display.history` then existing display navigation (`kanvas_display_navigate`, `direction: back|forward` or original revision), guarding current revision. Existing history has no per-display eviction; publishing after undo preserves the forward branch. The fixed1000-view session cap refuses additional publications without removing earlier views; navigation consumes no slot. This is **not an unlimited branching variant service**. For two alternatives, retain/copy the original to a second display before edits; use the existing display-grid to compare those displays. No new variant manager or misleading local Undo button.

## Independent disable/rollback

Build with `VITE_KANVAS_SCENE3D=false` to disable this renderer while preserving stored scene data/history and schema reads. Default enabled. No migrations, dependencies or asset access changes. Reverting this feature removes support for rendering/submitting the new template; existing stored documents must not be deleted. Retain the capability-disabled build if preservation/readability is required during rollback.
