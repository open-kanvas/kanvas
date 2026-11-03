# Signage library

Native `signage` view, authored generic vector artwork (CC0-1.0), no third-party art or new dependencies. Not certified or official ISO/ANSI/BS/NS symbols; independent local content/compliance review is required before operational use. Region variants coexist as metadata and generic labels, not a claim that all local artwork variants are implemented.

Read template.get for signage to inspect the live signCatalog, provenance and direction enum. Publish `{version:1,template:"signage",data:{items:[{id:"exit",type:"exit",direction:"right"}]}}`. K1 has78 entries across wayfinding, safety, restrictions, parking and hazards/PPE. Legacy shop-sign templates and their signage.update operation remain unchanged; use ordinary show/replace_data/view.patch for this new library.

Data: region international/us/uk/no; text english(default)/none; items1–6, unique stable IDs, catalog type, optional per-item region, direction, label80chars, caption160chars. Visual-only suppresses visible labels and captions but retains accessible labels. Directions: ahead/up/left/right/down, four diagonals, four90-degree turn arrows. Safety/wayfinding/parking/hazard signs accept directions; other signs reject them.

Existing revision-bound atomic view.patch updates /data/items or specific fields; retries and history are unchanged. Use current IDs/state to locate an item before array-index updates. A single sign fills the display; groups adapt columns to portrait/landscape/square. Extreme text may become small; concise captions are recommended.

Disable this optional renderer independently with client-build `VITE_KANVAS_SIGNAGE=false` and rebuild. This does not disable server publication or delete stored content. Persistence is additive ViewSpec JSON, no migrations. Source rollback leaves views/history stored but older code cannot render this template; prefer the flag if historical access matters.

K1 is only the foundation. Dynamic directory/map/status/queue/hotel/office/real-estate families, satisfaction kiosk and separate traffic simulation follow as staged work. No real traffic control or OS kiosk-lockdown claim.
