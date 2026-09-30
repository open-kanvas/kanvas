# Translation

Accepted in the 2026-09-09 feedback scope; first-class renderer ID `translation`.

## Content contract

Required fields are `sourceText`, `targetText`, `sourceLanguage` and `targetLanguage`. Both texts are 1–20,000 characters and each language label 1–80 characters. Use `sourceLanguage: "und"` when the original language genuinely is not specified; do not guess an identification to satisfy the schema. The target language must be explicit.

`layout` is `side-by-side` (default) or `stacked`. Narrow displays stack the two sections. Original and translated text are independently labelled and preserve line breaks, whitespace and apparent markup as inert text. Supported language tags also populate the sections’ `lang` attributes; text direction is automatic.

```json
{"version":1,"template":"translation","data":{"sourceText":"God morgen.\nVelkommen tilbake.","targetText":"Good morning.\nWelcome back.","sourceLanguage":"nb","targetLanguage":"en","layout":"side-by-side"}}
```

## Boundary

The deterministic renderer displays the supplied original and translation; it does not independently verify translation quality or infer missing source text. Both sections are always visible in this dedicated template,. The same strict view validation applies before publication.

See the [template index](README.md) and [authoritative schemas](../../src/shared/view-schemas.ts).
