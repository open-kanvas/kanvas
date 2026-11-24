# Prepared public 3D assets — eight-model feasibility POC

This is an additive, separately disableable extension of `scene3d`, not a second domain application or an unrestricted asset manager. All eight are actual Kenney game models, **not boxes substituted for models**. They are stylized low-poly decorative objects, not mechanical CAD or engineering/medical accuracy. There is no diesel engine or turbocharger in this catalog; do not invent either or claim their parts exist.

## Verified sources and rights

Car Kit3.1: https://kenney.nl/assets/car-kit ; Watercraft Kit2.1: https://kenney.nl/assets/watercraft-kit . Retrieved 2026-11-03 from each page's documented download link. Both actual archives contain `License.txt`: Creative Commons Zero (CC0), explicitly personal/educational/commercial use, optional attribution. Exact notices are shipped under `/scene-assets/*-LICENSE.txt`; CC0 legal terms https://creativecommons.org/publicdomain/zero/1.0/ permit commercial redistribution/modification without attribution. https://kenney.nl/support confirms these rights and reserves the Kenney logo; no logo is included. Included palette PNGs came from the same licensed archives, not a separate image provider. Models selected are generic props, not branded police/taxi vehicles. No trademark/engineering endorsement is claimed.

`public/scene-assets/manifest.json` records each source/archive/prepared SHA256, original path, PNG hash, byte size, triangles, original mesh-node names, normalized part bounds and license. `scripts/prepare-scene-assets.py SOURCE_ARCHIVE_DIRECTORY OUTPUT_DIRECTORY [CATALOG_TS]` embeds the original PNG into each existing GLB; geometry and node names are unchanged. It rejects unsupported changed source transforms. This is packaging/size curation, not invented retopology or segmentation. Total eight self-contained GLBs: **437,528 bytes**. No runtime external provider requests, live harvesting or account credentials.

## Catalog and actual parts

| Stable assetId | Actual model nodes |
|---|---|
| kenney-sedan | body, wheel-front-left, wheel-front-right, wheel-back-left, wheel-back-right |
| kenney-debris-drivetrain | debris-drivetrain (one monolithic prop) |
| kenney-debris-drivetrain-axle | debris-drivetrain-axle (one monolithic prop) |
| kenney-debris-bolt | debris-bolt (one monolithic prop) |
| kenney-wheel-default | wheel-default (one monolithic prop) |
| kenney-boat-sail-a | boat-sail-a, sail |
| kenney-boat-fishing-small | boat-fishing-small (one monolithic prop) |
| kenney-boat-fan | boat-fan, fan |

The parts column is source-verified segmentation, not semantic inference. Material visibility hides the selected mesh without implicitly hiding child meshes (for example hull versus sail). Per-part highlight uses an emissive tint. Whole-object visible/highlight still work.

## One shared scene contract

```json
{"objects":{"car":{"label":"Illustrative sedan","assetId":"kenney-sedan","size":[1.8,1.5,4.2],"parts":{"wheel-front-left":{"highlight":true}}}},"camera":{"position":[6,4,7],"target":[0,0,0],"focus":{"objectId":"car","part":"wheel-front-left"}}}
```

`size` is a caller-supplied full XYZ metric bounding size, not a claim of a measured real vehicle. The GLB is centred and normalized to this box; choose proportional dimensions if shape preservation matters. Rotation/position/scale remain the engine's transforms. At most eight asset instances in one scene (within the existing80-object total). Unknown models/parts are rejected; arbitrary URLs/private asset IDs/uploads are not accepted.

Use the existing atomic `view.patch` paths:

- `/data/objects/car/assetId` selects another known model. Clear incompatible `/parts` in the same batch.
- `/data/objects/car/parts/wheel-front-left` = `{ "highlight": true }` or `{ "visible": false }`.
- `/data/camera/focus` = `{ "objectId": "car", "part": "wheel-front-left" }` focuses that source-verified part; omit part for whole object. Derived framing preserves the stored position/target direction and does not modify geometry. Remove focus to return to the explicit camera pose. Clear/change focus atomically when deleting or hiding its object.
- `/data/camera/mode` = `overhead` switches the same objects to orthographic X/Z. Dimension rulers remain supplied metric scene bounds; hidden part extents are conservatively included in the object's full box.

When models are present, the **entire same scene**, including its primitives, uses the depth-buffered Three renderer; no fake model-box is drawn. Object mesh instances and canvas are retained across same-ID updates, with local promise caching/preloading on demand. Projection matches the SVG dimensions/labels. Rendering errors, unavailable WebGL and lost contexts are explicit; never silently substitute a box. WebGL context loss currently requires reload. No user-uploaded GLB pathway or custom physics/animation.

## Dependencies and rollback

Pinned three0.187.0 + @types/three0.187.0 (MIT; runtime notice shipped). Renderer is dynamically imported only for asset-containing scenes. Textures/models remain same-origin and GLB external resource URLs are blocked. Only these reviewed public assets are served; no existing private-media ACL or storage changes.

Build `VITE_KANVAS_SCENE_ASSETS=false` to disable prepared model rendering independently; it shows an explicit notice and preserves stored scene/part state. `VITE_KANVAS_SCENE3D=false` disables the whole scene renderer. No database migrations. When downgrading, remove asset-renderer support before the base scene renderer; preserve stored documents. A capability-disabled build retains parsing/history and is preferable to deleting new scene data.

Browser screenshots and automated load timing are feasibility evidence, not real mobile GPU acceptance. Owner review remains necessary for visual usefulness, part semantics and performance on actual devices. No physics, CAD editing, animations, exploded-view editor or broad asset manager is implied.
