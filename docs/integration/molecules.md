# Molecules: schematic native 2D

Publish `{version:1,template:"molecule",data:{libraryId:"ethanol-v1"}}` using ordinary submit/show. No HTML generation, external source calls, dependencies, chemistry computation or geometry inference. `template.get` for molecule returns the strict schema, available library IDs and complete prepared records including atom/bond IDs and provenance. `display.current` returns stored state/revision; resolve libraryId using that immutable library record.

## Existing operations

- Show/switch: submit a new molecule view, or replace_data with complete molecule data.
- Supplied structure: exactly one of libraryId or structure. Structure contains name, provenance (source, license, identity, accuracy), explicit atoms (id, element, x, y, optional attached hydrogens/charge), and bonds (id, from, to, order 1/2/3). No inferred hydrogens or bonds. Display uses uniform scaling by median supplied bond length; relative geometry and persisted coordinates remain unchanged (not a scientific distance scale).
- Highlight ethanol OH: atomic view.patch with current expectedRevision/new requestId, set /data/highlightAtoms to ["a2","a3"], /data/highlightBonds to ["b2"].
- Focus OH: set /data/viewport to {"zoom":1,"focusAtoms":["a2","a3"]}. Focus deliberately frames only supplied group; other atoms can be outside frame.
- Fit all: set /data/viewport to {"zoom":1}. SVG adapts aspect ratio to receiving viewport.
- Clear: set both highlight arrays to []. Existing atomic patch semantics, conflict checks, idempotent retries, publication/history and delivery receipts apply unchanged.
- Update structure: replace complete data, or atomically remove libraryId/set structure and clear obsolete emphasis/focus. Ordinary JSON-pointer patches can update supplied coordinates; use stable IDs read from current structure to locate the current array index, never stale positional assumptions.
- Read history/undo using existing display.history/history.navigate. Prepared IDs ending -v1 must never change meaning in later releases: add a new version instead.

## Bounds and omissions

Up to 500 atoms/1000 bonds per view; these are safety budgets, not a hard ceiling on molecule identities. Explicit 2D coordinates required. Single/double/triple bonds and rings render; charge and supplied attached hydrogen counts render. No aromatic/stereo/wedge conventions, standard chemical file parsing, 3D, ball-and-stick spatial mode, chemical validity checks, reactions, periodic table, live lookup, named-group detection or valence inference. Strict validation rejects unsupported fields instead of silently discarding stereo. External tooling must prepare supported, scientifically appropriate records. Fit cannot promise readability of arbitrary dense/overlapping supplied coordinates.

## Prepared seed provenance and rights

25 authored demonstration records/layouts, CC0-1.0; no third-party asset or database export copied. Names identify the neutral prepared form, not all stereoisomers/protonation states. These are **not independently chemically validated** and not authoritative identifiers. All coordinates are schematic, not measured distances or scientific 3D. Attached hydrogen counts are explicitly authored display data. Ethanol exposes the OH hydrogen as a separate atom for the acceptance example; other hydrogens generally use supplied count annotations. Benzene uses a declared alternating-bond schematic, not aromatic bond semantics. Provenance and accuracy are available from the metadata disclosure and schema response; no source identity substitution.

## Independent disable / persistence / rollback

Build the client with `VITE_KANVAS_MOLECULES=false` to disable this renderer independently; shows a disabled notice without deleting stored records. This is a **client build-time rendering flag**, not a server publication/authorization flag. Rebuild the client when changing it. Server continues accepting/reading molecule views and history. Additive ViewSpec JSON only; no migration/new DB tables. Revert source only after retaining stored views/backups; older code does not know this template and cannot render it, but no data deletion is required. Prefer disable flag when historical display access must remain intact.

## Automated/manual acceptance

Focused tests validate all seeds, strict rejection, stable references, external structures, double/triple/charged rendering, escaping, flag fallback, atomic patch CAS/retry and schema registry. Browser script exercises 25 seeds at desktop/portrait/landscape dimensions, fit boundaries, OH highlights, preserved DOM identity and supplied external structure. It uses the actual native renderer in an isolated fixture, not a production deployment. Combined receiving-browser publication receipts, owner device readability and scientific content review remain acceptance work.
