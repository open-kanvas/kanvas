# Static HTML visuals

Template ID: `html`. Use only when a native template does not fit. The caller supplies a complete static body fragment, optional CSS and a useful description; Kanvas does not generate markup from prose.

The renderer uses an opaque sandboxed iframe with no scripts, forms, same-origin access, remote fetches or remote media. Inline data images are allowed. Maximum HTML is 150,000 characters and CSS 50,000, subject to the overall view budget.

Omit `script`, `iframe`, `object`, `embed`, `base`, `meta` and `form` tags. Kanvas supplies the document wrapper and viewport. Read the exact runtime schema before publication; validation errors preserve the last successful view.

```json
{"version":1,"template":"html","data":{"description":"Illustrative custom visual","html":"<article><h1>Exact supplied title</h1><p>Exact supplied content.</p></article>","css":"article{padding:8vw;font:24px system-ui}"}}
```

This is not an arbitrary application runtime. See [rendering guarantees](../display/implemented-rendering.md).
