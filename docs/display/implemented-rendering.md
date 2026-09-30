# Rendering contracts

Prepared `{version:1,template,data}` views use the exact runtime schema. Explicit `templateHint` accepts schema-valid native data and documented literal mappings: text, code, transcript, document, selected media, whiteboard text items and dataset bindings. Unhinted plain text becomes a fact; unhinted datasets become lossless tables. Other structured input requires a template hint or prepared view. `intent` is metadata, never a substitute for source content.

Invalid content fails without replacing the previous display. Identical rendered content retains the current revision. No source is invented or translated. Supplied translation and transcription layouts render externally supplied text.

Dataset imports preserve significant numeric lexemes as strings. Binding, aggregation and geometry validation occur before display. Media is validated and session-scoped; links and capture dates are source claims, not evidence of a remote fetch.

`accepted` means queued; `prepared` means committed; `applied` requires a matching receiving-browser acknowledgement. Offline, superseded, blocked and failed delivery are distinct outcomes. A server screenshot is not the receiving browser, and cross-origin iframe load cannot verify page content.

Titles are metadata by default; `showTitle:true` explicitly requests heading chrome. Responsive templates preserve full source rather than silently summarize it. Reading surfaces can paginate or scroll. Navigation changes position, not retained source/history.
